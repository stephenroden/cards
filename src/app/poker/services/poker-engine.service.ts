import { Injectable } from '@angular/core';
import { Card } from '../../cards/card.models';
import { compareHands } from './poker-hand-evaluator';
import { PokerAiService } from './poker-ai.service';
import { buildDeck, cardLabel, shuffle } from './poker-utils';
import { PokerActionType, PokerPlayer, PokerState, PokerStreet } from '../poker.models';
import { PokerStateService } from './poker-state.service';

@Injectable({
  providedIn: 'root'
})
export class PokerEngineService {
  constructor(
    private readonly pokerState: PokerStateService,
    private readonly ai: PokerAiService
  ) {}

  startSession(): void {
    this.pokerState.resetSession();
    this.startNextHand();
  }

  startNextHand(): void {
    const state = this.pokerState.state();
    if (state.sessionOver) {
      return;
    }

    const players: PokerPlayer[] = state.players.map((player) => ({
      ...player,
      hand: [],
      folded: player.eliminated,
      allIn: false,
      currentBet: 0,
      totalCommitted: 0,
      acted: false
    }));

    const activeCount = players.filter((player) => !player.eliminated).length;
    if (activeCount <= 1) {
      const winner = players.find((player) => !player.eliminated);
      this.pokerState.setState({
        ...state,
        players,
        phase: 'session-over',
        sessionOver: true,
        winners: winner ? [winner.id] : [],
        message: winner ? `${winner.name} wins the session.` : 'Session complete.'
      });
      return;
    }

    const dealerIndex = this.pokerState.rotateToNextActive(state.dealerIndex, players);
    const smallBlindIndex = this.pokerState.rotateToNextActive(dealerIndex, players);
    const bigBlindIndex = this.pokerState.rotateToNextActive(smallBlindIndex, players);

    let deck = shuffle(buildDeck());
    const dealt: PokerPlayer[] = players.map((player) => ({ ...player }));
    for (let round = 0; round < 2; round += 1) {
      for (let index = 0; index < dealt.length; index += 1) {
        if (dealt[index].eliminated) {
          continue;
        }
        const next = deck[0];
        deck = deck.slice(1);
        dealt[index].hand = [...dealt[index].hand, next];
      }
    }

    let postedPlayers: PokerPlayer[] = dealt;
    postedPlayers = this.commitBlind(postedPlayers, smallBlindIndex, state.smallBlind);
    postedPlayers = this.commitBlind(postedPlayers, bigBlindIndex, state.bigBlind);

    postedPlayers = postedPlayers.map((player, index) => ({
      ...player,
      acted: player.eliminated ? true : index === smallBlindIndex || index === bigBlindIndex
    }));

    const actingIndex = this.pokerState.nextActor(bigBlindIndex, postedPlayers);

    this.pokerState.setState({
      ...state,
      players: postedPlayers,
      deck,
      communityCards: [],
      phase: 'preflop',
      street: 'preflop',
      currentBet: state.bigBlind,
      raiseCount: 0,
      dealerIndex,
      actingIndex,
      handNumber: state.handNumber + 1,
      lastAggressorIndex: bigBlindIndex,
      actionHistory: [],
      sidePots: [],
      winners: [],
      lastHandNet: {},
      revealCpuCards: false,
      message: `Hand ${state.handNumber}: preflop action.`
    });

    this.runCpuTurns();
  }

  legalActions(state: PokerState, player: PokerPlayer): PokerActionType[] {
    if (!this.pokerState.canAct(player)) {
      return [];
    }

    const toCall = Math.max(0, state.currentBet - player.currentBet);
    const canRaise = state.raiseCount < state.maxRaises && player.stack > toCall;
    if (toCall === 0) {
      return canRaise ? ['check', 'bet'] : ['check'];
    }

    const actions: PokerActionType[] = ['fold', 'call'];
    if (canRaise) {
      actions.push('raise');
    }
    return actions;
  }

  playHumanAction(action: PokerActionType): void {
    const state = this.pokerState.state();
    const player = state.players[state.actingIndex];
    if (!player || player.type !== 'human') {
      return;
    }
    if (!this.legalActions(state, player).includes(action)) {
      return;
    }

    this.applyAction(action, 'You chose this action.');
    this.runCpuTurns();
  }

  private runCpuTurns(): void {
    let state = this.pokerState.state();
    while (state.phase !== 'session-over' && state.phase !== 'hand-summary') {
      const player = state.players[state.actingIndex];
      if (!player || player.type !== 'cpu' || !this.pokerState.canAct(player)) {
        break;
      }
      const legal = this.legalActions(state, player);
      if (legal.length === 0) {
        this.advanceActionIndex();
        state = this.pokerState.state();
        continue;
      }
      const decision = this.ai.chooseAction(state, player);
      const selected = legal.includes(decision.type) ? decision.type : legal[0];
      this.applyAction(selected, `${player.name}: ${decision.reason}`);
      state = this.pokerState.state();
    }
  }

  private applyAction(action: PokerActionType, reason: string): void {
    const state = this.pokerState.state();
    const actingPlayer = state.players[state.actingIndex];
    if (!actingPlayer) {
      return;
    }

    const players = [...state.players];
    const player = { ...actingPlayer };
    const toCall = Math.max(0, state.currentBet - player.currentBet);
    const raiseSize = this.pokerState.streetBetSize(state.street);

    if (action === 'fold') {
      player.folded = true;
      player.acted = true;
    }

    if (action === 'check') {
      player.acted = true;
    }

    if (action === 'call') {
      const amount = Math.min(toCall, player.stack);
      player.stack -= amount;
      player.currentBet += amount;
      player.totalCommitted += amount;
      player.acted = true;
      if (player.stack === 0) {
        player.allIn = true;
      }
    }

    if (action === 'bet' || action === 'raise') {
      const increment = toCall + raiseSize;
      const amount = Math.min(increment, player.stack);
      player.stack -= amount;
      player.currentBet += amount;
      player.totalCommitted += amount;
      player.acted = true;
      if (player.stack === 0) {
        player.allIn = true;
      }
    }

    let currentBet = state.currentBet;
    let raiseCount = state.raiseCount;
    let lastAggressorIndex = state.lastAggressorIndex;

    if (action === 'bet' || action === 'raise') {
      currentBet = player.currentBet;
      raiseCount += 1;
      lastAggressorIndex = state.actingIndex;
      for (let index = 0; index < players.length; index += 1) {
        if (index !== state.actingIndex && this.pokerState.canAct(players[index])) {
          players[index] = { ...players[index], acted: false };
        }
      }
    }

    players[state.actingIndex] = player;

    const nextState: PokerState = {
      ...state,
      players,
      currentBet,
      raiseCount,
      lastAggressorIndex,
      actionHistory: [...state.actionHistory, { playerId: player.id, type: action, amount: player.currentBet, street: state.street }],
      message: reason
    };

    this.pokerState.setState(nextState);

    if (this.resolveHandIfDone()) {
      return;
    }

    if (this.isStreetComplete(this.pokerState.state())) {
      this.advanceStreet();
      return;
    }

    this.advanceActionIndex();
  }

  private commitBlind(players: PokerPlayer[], index: number, blind: number): PokerPlayer[] {
    const next = [...players];
    const player = { ...next[index] };
    const amount = Math.min(blind, player.stack);
    player.stack -= amount;
    player.currentBet += amount;
    player.totalCommitted += amount;
    if (player.stack === 0) {
      player.allIn = true;
    }
    next[index] = player;
    return next;
  }

  private advanceActionIndex(): void {
    const state = this.pokerState.state();
    const next = this.pokerState.nextActor(state.actingIndex, state.players);
    this.pokerState.update({ actingIndex: next });
  }

  private resolveHandIfDone(): boolean {
    const state = this.pokerState.state();
    const alive = state.players.filter((player) => !player.eliminated && !player.folded);
    if (alive.length !== 1) {
      return false;
    }

    const winner = alive[0];
    const totalPot = state.players.reduce((sum, player) => sum + player.totalCommitted, 0);
    const players = state.players.map((player) =>
      player.id === winner.id
        ? { ...player, stack: player.stack + totalPot }
        : player
    );

    this.completeHand(players, [winner.id], `${winner.name} wins uncontested (${totalPot} chips).`);
    return true;
  }

  private isStreetComplete(state: PokerState): boolean {
    const contenders = state.players.filter((player) => !player.eliminated && !player.folded);
    const actionable = contenders.filter((player) => !player.allIn);
    if (actionable.length <= 1) {
      return true;
    }

    return actionable.every((player) => player.acted && player.currentBet === state.currentBet);
  }

  private advanceStreet(): void {
    const state = this.pokerState.state();

    if (state.street === 'river') {
      this.resolveShowdown();
      return;
    }

    let nextStreet: PokerStreet = 'flop';
    let cardsToDeal = 3;
    if (state.street === 'flop') {
      nextStreet = 'turn';
      cardsToDeal = 1;
    }
    if (state.street === 'turn') {
      nextStreet = 'river';
      cardsToDeal = 1;
    }

    let deck = state.deck;
    const board = [...state.communityCards];
    for (let index = 0; index < cardsToDeal; index += 1) {
      const top = deck[0];
      deck = deck.slice(1);
      board.push(top);
    }

    const players = state.players.map((player) => ({
      ...player,
      currentBet: 0,
      acted: player.eliminated || player.folded || player.allIn
    }));

    const startIndex = this.pokerState.nextActor(state.dealerIndex, players);

    this.pokerState.setState({
      ...state,
      deck,
      communityCards: board,
      street: nextStreet,
      phase: nextStreet,
      players,
      currentBet: 0,
      raiseCount: 0,
      actingIndex: startIndex,
      lastAggressorIndex: null,
      message: `${nextStreet.toUpperCase()} dealt: ${board.map(cardLabel).join(' ')}`
    });

    this.runCpuTurns();
  }

  private resolveShowdown(): void {
    const state = this.pokerState.state();
    const contenders = state.players.filter((player) => !player.eliminated && !player.folded);
    const sidePots = this.buildSidePots(state.players);

    const players = [...state.players];
    const winningIds = new Set<string>();

    for (const pot of sidePots) {
      const eligible = contenders.filter((player) => pot.eligiblePlayerIds.includes(player.id));
      if (eligible.length === 0) {
        continue;
      }

      const winners = this.resolvePotWinners(eligible, state.communityCards);
      const split = Math.floor(pot.amount / winners.length);
      let remainder = pot.amount % winners.length;
      const orderedWinnerIds = this.orderFromDealer(winners.map((winner) => winner.id), state.dealerIndex, players);

      for (const winnerId of orderedWinnerIds) {
        const bonus = remainder > 0 ? 1 : 0;
        remainder = Math.max(0, remainder - 1);
        const index = players.findIndex((player) => player.id === winnerId);
        if (index >= 0) {
          players[index] = { ...players[index], stack: players[index].stack + split + bonus };
        }
        winningIds.add(winnerId);
      }
    }

    const winnerIds = [...winningIds];
    const winnerNames = winnerIds
      .map((winnerId) => players.find((player) => player.id === winnerId)?.name ?? winnerId)
      .join(', ');

    this.completeHand(players, winnerIds, `Showdown complete. Winners: ${winnerNames}`);
    this.pokerState.update({ sidePots, revealCpuCards: true });
  }

  private buildSidePots(players: PokerPlayer[]): Array<{ amount: number; eligiblePlayerIds: string[] }> {
    const commitments = players.filter((player) => player.totalCommitted > 0).map((player) => player.totalCommitted);
    if (commitments.length === 0) {
      return [];
    }

    const levels = [...new Set(commitments)].sort((a, b) => a - b);
    let previous = 0;
    const sidePots: Array<{ amount: number; eligiblePlayerIds: string[] }> = [];

    for (const level of levels) {
      const contributors = players.filter((player) => player.totalCommitted >= level);
      const eligible = contributors.filter((player) => !player.folded).map((player) => player.id);
      const amount = (level - previous) * contributors.length;
      if (amount > 0 && eligible.length > 0) {
        sidePots.push({ amount, eligiblePlayerIds: eligible });
      }
      previous = level;
    }

    return sidePots;
  }

  private resolvePotWinners(players: PokerPlayer[], board: Card[]): PokerPlayer[] {
    const ranked = players.map((player) => ({
      player,
      cards: [...player.hand, ...board]
    }));

    let best = ranked[0];
    const winners = [best.player];

    for (let index = 1; index < ranked.length; index += 1) {
      const current = ranked[index];
      const cmp = compareHands(current.cards, [...best.player.hand, ...board]);
      if (cmp > 0) {
        winners.length = 0;
        winners.push(current.player);
        best = current;
      } else if (cmp === 0) {
        winners.push(current.player);
      }
    }

    return winners;
  }

  private orderFromDealer(ids: string[], dealerIndex: number, players: PokerPlayer[]): string[] {
    const ordered = [...ids];
    ordered.sort((left, right) => {
      const leftIndex = players.findIndex((player) => player.id === left);
      const rightIndex = players.findIndex((player) => player.id === right);
      const leftOffset = (leftIndex - dealerIndex + players.length) % players.length;
      const rightOffset = (rightIndex - dealerIndex + players.length) % players.length;
      return leftOffset - rightOffset;
    });
    return ordered;
  }

  private completeHand(players: PokerPlayer[], winnerIds: string[], message: string): void {
    const previousPlayers = this.pokerState.state().players;
    const updatedPlayers = players.map((player) => ({
      ...player,
      eliminated: !player.eliminated && player.stack === 0
    }));
    const lastHandNet = updatedPlayers.reduce<Record<string, number>>((acc, player) => {
      const previous = previousPlayers.find((current) => current.id === player.id);
      if (!previous) {
        acc[player.id] = 0;
        return acc;
      }

      acc[player.id] = player.stack - (previous.stack + previous.totalCommitted);
      return acc;
    }, {});

    const remaining = updatedPlayers.filter((player) => !player.eliminated);
    const sessionOver = remaining.length <= 1;

    this.pokerState.update({
      players: updatedPlayers,
      winners: winnerIds,
      lastHandNet,
      phase: sessionOver ? 'session-over' : 'hand-summary',
      sessionOver,
      message: sessionOver ? `${remaining[0]?.name ?? 'Player'} wins the session.` : message
    });
  }
}
