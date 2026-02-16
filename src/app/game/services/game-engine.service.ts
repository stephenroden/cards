import { Injectable } from '@angular/core';
import { AiDecisionTrace, Card, GameState, Player } from '../game.models';
import { AiService } from './ai.service';
import { GameStateService } from './game-state.service';
import { RulesService } from './rules.service';
import { MOON_POINTS, penaltyScoreCard, scoreCard } from './scoring';

const PASS_COUNT = 3;

@Injectable({
  providedIn: 'root'
})
export class GameEngineService {
  private trickToken = 0;
  private readonly trickDelayMs = 500;
  private readonly trickTakeMs = 1000;
  private readonly trickHoldMs = 0;
  private readonly passRevealMs = 4000;

  constructor(
    private readonly stateService: GameStateService,
    private readonly rules: RulesService,
    private readonly ai: AiService
  ) {}

  startRound(): void {
    this.stateService.startNewRound();
    const state = this.stateService.state();
    const passDirection = getPassDirection(state.round);
    const noPassRound = passDirection === 'none';

    this.stateService.update({
      passDirection,
      phase: 'pass',
      passComplete: noPassRound
    });

    if (!noPassRound) {
      this.autoSelectCpuPasses();
    }
  }

  submitHumanPass(cards: Card[]): void {
    if (cards.length !== PASS_COUNT) {
      return;
    }

    const state = this.stateService.state();
    const player = state.players.find((p) => p.type === 'human');
    if (!player) {
      return;
    }

    this.stateService.update({
      passSelections: {
        ...state.passSelections,
        [player.id]: cards
      }
    });

    this.checkPassCompletion();
  }

  continueAfterPass(): void {
    const state = this.stateService.state();
    if (state.phase !== 'pass' || !state.passComplete) {
      return;
    }
    this.preparePlayPhase();
  }

  playHumanCard(card: Card): void {
    const state = this.stateService.state();
    if (state.trickTaking) {
      return;
    }
    const player = state.players.find((p) => p.id === state.turnPlayerId);
    if (!player || player.type !== 'human') {
      return;
    }

    if (!this.rules.isLegalPlay(state, player, card)) {
      return;
    }

    this.recordDebugPlay(state, player, card, {
      reasonCode: 'human_play',
      summary: `${player.name} played ${card.rank}${suitGlyph(card.suit)}.`,
      factors: {
        playerType: 'human',
        leading: state.trick.cards.length === 0,
        trickCards: state.trick.cards.length
      }
    });
    const updatedState = this.stateService.state();
    const updatedPlayer = updatedState.players.find((p) => p.id === player.id) ?? player;
    this.applyPlay(updatedState, updatedPlayer, card);
    this.playCpuTurns();
  }

  playCpuTurns(): void {
    let state = this.stateService.state();
    while (state.phase === 'play' && !state.trickTaking) {
      const player = state.players.find((p) => p.id === state.turnPlayerId);
      if (!player || player.type !== 'cpu') {
        break;
      }

      const legal = this.rules.getLegalPlays(state, player);
      if (legal.length === 0) {
        break;
      }
      const decision = this.ai.chooseCardWithReason(state, player, legal);
      if (state.rules.debugAiHistory) {
        this.stateService.update({
          aiDecisionReasons: {
            ...state.aiDecisionReasons,
            [player.id]: decision.reason
          },
          aiDecisionTraces: {
            ...state.aiDecisionTraces,
            [player.id]: decision.trace
          },
          aiDecisionHistory: {
            ...state.aiDecisionHistory,
            [player.id]: [...(state.aiDecisionHistory[player.id] ?? []), decision.trace]
          },
          debugRoundHistory: [
            ...state.debugRoundHistory,
            { type: 'play', playerId: player.id, card: decision.card, trace: decision.trace }
          ]
        });
        state = this.stateService.state();
      }
      const choice = decision.card;
      this.applyPlay(state, player, choice);
      state = this.stateService.state();
    }
  }

  private autoSelectCpuPasses(): void {
    const state = this.stateService.state();
    const selections: Record<string, Card[]> = { ...state.passSelections };

    for (const player of state.players) {
      if (player.type === 'cpu') {
        selections[player.id] = this.ai.choosePassCards(player, PASS_COUNT, state.rules);
      }
    }

    this.stateService.update({ passSelections: selections });
    this.checkPassCompletion();
  }

  private checkPassCompletion(): void {
    const state = this.stateService.state();
    const allReady = state.players.every((player) => state.passSelections[player.id]?.length === PASS_COUNT);
    if (!allReady) {
      return;
    }

    const passed = applyPasses(state.players, state.passSelections, state.passDirection);
    this.stateService.update({
      players: passed.players,
      passTransfers: passed.transfers,
      passSelections: {},
      passComplete: true
    });
  }

  private preparePlayPhase(delayMs = 0): void {
    const state = this.stateService.state();
    const startingPlayer = state.players.find((player) =>
      player.hand.some((card) => card.suit === 'clubs' && card.rank === '2')
    );

    this.stateService.update({
      phase: 'play',
      turnPlayerId: startingPlayer?.id ?? state.players[0]?.id ?? 'p1',
      trick: { leaderId: startingPlayer?.id ?? state.players[0]?.id ?? 'p1', cards: [] },
      trickWinnerId: undefined,
      trickTaking: false,
      passComplete: false,
      heartsBroken: false,
      takenCards: {},
      playHistory: [],
      passTransfers: []
    });

    if (delayMs > 0) {
      setTimeout(() => this.playCpuTurns(), delayMs);
    } else {
      this.playCpuTurns();
    }
  }

  private applyPlay(state: GameState, player: Player, card: Card): void {
    const updatedPlayers = state.players.map((current) =>
      current.id === player.id
        ? { ...current, hand: current.hand.filter((held) => !sameCard(held, card)) }
        : current
    );

    const updatedTrick = {
      ...state.trick,
      cards: [...state.trick.cards, { playerId: player.id, card }]
    };

    const brokeHeartsNow = !state.heartsBroken && card.suit === 'hearts';
    const heartsBroken = state.heartsBroken || brokeHeartsNow;
    const nextTurn = this.nextTurnPlayerId(state, player.id);
    let nextState: GameState = {
      ...state,
      players: updatedPlayers,
      trick: updatedTrick,
      heartsBroken,
      turnPlayerId: nextTurn
    };
    if (state.rules.debugAiHistory && brokeHeartsNow) {
      nextState = {
        ...nextState,
        debugRoundHistory: [
          ...nextState.debugRoundHistory,
          {
            type: 'system',
            playerId: player.id,
            card,
            trace: {
              reasonCode: 'hearts_broken',
              summary: `${player.name} broke hearts with ${card.rank}${suitGlyph(card.suit)}.`,
              factors: { event: 'hearts_broken', byPlayer: player.name }
            }
          }
        ]
      };
    }

    if (updatedTrick.cards.length === 4) {
      this.beginTrickTake(nextState);
      return;
    }

    this.stateService.setState(nextState);
  }

  private beginTrickTake(state: GameState): void {
    const winnerId = this.rules.getTrickWinner(state);
    if (!winnerId) {
      this.stateService.setState(state);
      return;
    }

    const token = (this.trickToken += 1);
    const updatedState: GameState = {
      ...state,
      trickWinnerId: winnerId,
      trickTaking: true,
      turnPlayerId: winnerId
    };

    this.stateService.setState(updatedState);
    setTimeout(() => {
      if (token !== this.trickToken) {
        return;
      }
      this.finalizeTrick();
    }, this.trickDelayMs + this.trickTakeMs + this.trickHoldMs);
  }

  private finalizeTrick(): void {
    const state = this.stateService.state();
    const winnerId = state.trickWinnerId;
    if (!state.trickTaking || !winnerId || state.trick.cards.length !== 4) {
      return;
    }

    const takenCards = {
      ...state.takenCards,
      [winnerId]: [...(state.takenCards[winnerId] ?? []), ...state.trick.cards.map((card) => card.card)]
    };
    const playHistory = [...state.playHistory, ...state.trick.cards];

    const clearedTrick = { leaderId: winnerId, cards: [] };
    let updatedState: GameState = {
      ...state,
      trick: clearedTrick,
      takenCards,
      playHistory,
      trickWinnerId: undefined,
      trickTaking: false,
      turnPlayerId: winnerId
    };
    if (state.rules.debugAiHistory) {
      const trickCards = state.trick.cards.map((play) => `${play.card.rank}${suitGlyph(play.card.suit)}`).join(' ');
      const trickPoints = state.trick.cards.reduce((sum, play) => sum + Math.max(0, scoreCard(play.card, state.rules)), 0);
      const winnerName = state.players.find((player) => player.id === winnerId)?.name ?? winnerId;
      updatedState = {
        ...updatedState,
        debugRoundHistory: [
          ...updatedState.debugRoundHistory,
          {
            type: 'system',
            playerId: winnerId,
            card: state.trick.cards[0].card,
            trace: {
              reasonCode: 'trick_complete',
              summary: `${winnerName} won the trick (${trickPoints} pts): ${trickCards}`,
              factors: { event: 'trick_complete', winner: winnerName, trickPoints, cards: trickCards }
            }
          }
        ]
      };
    }

    const handsEmpty = updatedState.players.every((player) => player.hand.length === 0);
    if (handsEmpty) {
      updatedState = this.scoreRound(updatedState);
    }

    this.stateService.setState(updatedState);
    if (updatedState.phase === 'play') {
      this.playCpuTurns();
    }
  }

  private scoreRound(state: GameState): GameState {
    const totals = state.players.reduce<Record<string, number>>((acc, player) => {
      acc[player.id] = (state.takenCards[player.id] ?? []).reduce(
        (points, card) => points + scoreCard(card, state.rules),
        0
      );
      return acc;
    }, {});

    const penaltyTotals = state.players.reduce<Record<string, number>>((acc, player) => {
      acc[player.id] = (state.takenCards[player.id] ?? []).reduce((points, card) => points + penaltyScoreCard(card), 0);
      return acc;
    }, {});

    const moonShooter = Object.entries(penaltyTotals).find(([, points]) => points === MOON_POINTS);
    const players = state.players.map((player) => {
      const roundPoints = totals[player.id] ?? 0;
      const jdAdjustment = roundPoints - (penaltyTotals[player.id] ?? 0);
      const finalPoints = moonShooter
        ? (player.id === moonShooter[0] ? 0 : MOON_POINTS) + jdAdjustment
        : roundPoints;
      return { ...player, score: player.score + finalPoints };
    });

    return {
      ...state,
      phase: 'summary',
      players,
      round: state.round + 1
    };
  }

  private nextTurnPlayerId(state: GameState, currentId: string): string {
    const ids = state.players.map((player) => player.id);
    const index = ids.indexOf(currentId);
    if (index === -1) {
      return state.turnPlayerId;
    }
    return ids[(index + 1) % ids.length];
  }

  private recordDebugPlay(state: GameState, player: Player, card: Card, trace: AiDecisionTrace): void {
    if (!state.rules.debugAiHistory) {
      return;
    }
    this.stateService.update({
      debugRoundHistory: [...state.debugRoundHistory, { type: 'play', playerId: player.id, card, trace }]
    });
  }
}

const getPassDirection = (round: number): GameState['passDirection'] => {
  const cycle = (round - 1) % 4;
  if (cycle === 0) {
    return 'left';
  }
  if (cycle === 1) {
    return 'right';
  }
  if (cycle === 2) {
    return 'across';
  }
  return 'none';
};

const applyPasses = (
  players: Player[],
  selections: Record<string, Card[]>,
  direction: GameState['passDirection']
): { players: Player[]; transfers: GameState['passTransfers'] } => {
  if (direction === 'none') {
    return { players, transfers: [] };
  }

  const ids = players.map((player) => player.id);
  const nextIndex = (index: number): number => {
    if (direction === 'left') {
      return (index + 1) % ids.length;
    }
    if (direction === 'right') {
      return (index - 1 + ids.length) % ids.length;
    }
    return (index + 2) % ids.length;
  };

  const received: Record<string, Card[]> = {};
  const transfers: GameState['passTransfers'] = [];
  players.forEach((player, index) => {
    const targetId = ids[nextIndex(index)];
    const cards = selections[player.id] ?? [];
    received[targetId] = [...(received[targetId] ?? []), ...cards];
    transfers.push({ fromId: player.id, toId: targetId, cards });
  });

  const updatedPlayers = players.map((player) => {
    const removed = selections[player.id] ?? [];
    const remaining = player.hand.filter((card) => !removed.some((pass) => sameCard(pass, card)));
    return {
      ...player,
      hand: [...remaining, ...(received[player.id] ?? [])]
    };
  });

  return { players: updatedPlayers, transfers };
};

const sameCard = (a: Card, b: Card): boolean => a.suit === b.suit && a.rank === b.rank;

const suitGlyph = (suit: Card['suit']): string => {
  if (suit === 'clubs') {
    return '♣';
  }
  if (suit === 'diamonds') {
    return '♦';
  }
  if (suit === 'hearts') {
    return '♥';
  }
  return '♠';
};
