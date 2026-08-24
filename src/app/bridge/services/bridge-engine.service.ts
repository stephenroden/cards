import { Injectable } from '@angular/core';
import { Card } from '../../cards/card.models';
import {
  BridgeState,
  Contract,
  DEALS_PER_SESSION,
  Seat,
  dealerForDeal,
  nextSeat,
  partnerOf,
  partnershipOf,
  vulnerabilityForDeal
} from '../bridge.models';
import { dealHands } from './bridge-deal';
import { isLegalPlay, openingLeader, trickWinner } from './bridge-rules';
import { chooseBridgeCard } from './bridge-play-ai';
import { scoreDeal } from './bridge-scoring';
import { BridgeStateService, buildPlayers, initialBridgeState } from './bridge-state.service';

const TRICKS_PER_DEAL = 13;

@Injectable({
  providedIn: 'root'
})
export class BridgeEngineService {
  constructor(private readonly bridgeState: BridgeStateService) {}

  startSession(): void {
    this.bridgeState.resetSession();
  }

  /** South plays their own cards, plus dummy's whenever South is the declarer. */
  humanControls(state: BridgeState, seat: Seat): boolean {
    if (seat === 'south') {
      return true;
    }
    return state.contract?.declarer === 'south' && seat === partnerOf('south') && state.dummyRevealed;
  }

  handOf(state: BridgeState, seat: Seat): Card[] {
    return state.players.find((player) => player.seat === seat)?.hand ?? [];
  }

  dummySeat(state: BridgeState): Seat | null {
    return state.contract ? partnerOf(state.contract.declarer) : null;
  }

  setContract(contract: Contract): void {
    const state = this.bridgeState.state();
    if (state.phase !== 'contract') {
      return;
    }
    const leader = openingLeader(contract.declarer);
    this.bridgeState.setState(
      this.advance({
        ...state,
        contract,
        phase: 'play',
        turn: leader,
        trick: { leader, cards: [] },
        message: ''
      })
    );
  }

  legalPlaysFor(state: BridgeState, seat: Seat): Card[] {
    if (state.phase !== 'play' || state.trickComplete || state.turn !== seat) {
      return [];
    }
    const hand = this.handOf(state, seat);
    return hand.filter((card) => isLegalPlay(hand, state.trick, card));
  }

  playCard(card: Card): void {
    const state = this.bridgeState.state();
    if (state.phase !== 'play' || state.trickComplete) {
      return;
    }
    if (!this.humanControls(state, state.turn)) {
      return;
    }
    if (!this.legalPlaysFor(state, state.turn).some((legal) => legal.suit === card.suit && legal.rank === card.rank)) {
      return;
    }
    this.bridgeState.setState(this.advance(this.applyPlay(state, state.turn, card)));
  }

  /** Clears a finished trick, hands the lead to whoever won it, and plays on. */
  acknowledgeTrick(): void {
    const state = this.bridgeState.state();
    if (!state.trickComplete) {
      return;
    }
    if (state.completedTricks >= TRICKS_PER_DEAL) {
      this.bridgeState.setState(this.finishDeal(state));
      return;
    }
    const leader = state.trickWinnerSeat ?? state.trick.leader;
    this.bridgeState.setState(
      this.advance({
        ...state,
        trick: { leader, cards: [] },
        turn: leader,
        trickComplete: false,
        trickWinnerSeat: null
      })
    );
  }

  nextDeal(): void {
    const state = this.bridgeState.state();
    if (state.phase !== 'deal-summary') {
      return;
    }
    if (state.dealNumber >= DEALS_PER_SESSION) {
      this.bridgeState.setState({ ...state, phase: 'session-over', message: 'Session complete.' });
      return;
    }

    const dealNumber = state.dealNumber + 1;
    this.bridgeState.setState({
      ...initialBridgeState(dealNumber),
      players: buildPlayers(dealHands()),
      dealer: dealerForDeal(dealNumber),
      vulnerability: vulnerabilityForDeal(dealNumber),
      scores: state.scores,
      history: state.history
    });
  }

  private applyPlay(state: BridgeState, seat: Seat, card: Card): BridgeState {
    const players = state.players.map((player) =>
      player.seat === seat
        ? { ...player, hand: player.hand.filter((held) => !(held.suit === card.suit && held.rank === card.rank)) }
        : player
    );
    const trick = { ...state.trick, cards: [...state.trick.cards, { seat, card }] };
    const played = [...state.played, card];
    // Dummy goes face up as soon as the opening lead is on the table.
    const dummyRevealed = state.dummyRevealed || (state.completedTricks === 0 && trick.cards.length === 1);

    if (trick.cards.length < 4) {
      return { ...state, players, trick, played, dummyRevealed, turn: nextSeat(seat) };
    }

    const winner = trickWinner(trick, state.contract!.strain)!;
    const side = partnershipOf(winner);
    return {
      ...state,
      players,
      trick,
      played,
      dummyRevealed,
      completedTricks: state.completedTricks + 1,
      tricksWon: { ...state.tricksWon, [side]: state.tricksWon[side] + 1 },
      trickComplete: true,
      trickWinnerSeat: winner
    };
  }

  /** Runs the CPU seats until the lead comes back to a hand the player controls. */
  private advance(state: BridgeState): BridgeState {
    let current = state;
    let guard = 0;
    while (
      current.phase === 'play' &&
      !current.trickComplete &&
      !this.humanControls(current, current.turn) &&
      guard < 60
    ) {
      guard += 1;
      const seat = current.turn;
      const card = chooseBridgeCard({
        seat,
        partner: partnerOf(seat),
        hand: this.handOf(current, seat),
        trick: current.trick,
        strain: current.contract!.strain,
        played: current.played,
        visiblePartner: this.visiblePartnerHand(current, seat),
        isDeclarerSide: partnershipOf(seat) === partnershipOf(current.contract!.declarer)
      });
      current = this.applyPlay(current, seat, card);
    }
    return current;
  }

  /** A seat can plan with its partner's cards only when that partner is the exposed dummy. */
  private visiblePartnerHand(state: BridgeState, seat: Seat): Card[] | null {
    const dummy = this.dummySeat(state);
    if (!dummy || !state.dummyRevealed || partnerOf(seat) !== dummy) {
      return null;
    }
    return this.handOf(state, dummy);
  }

  private finishDeal(state: BridgeState): BridgeState {
    const contract = state.contract!;
    const declaring = partnershipOf(contract.declarer);
    const result = scoreDeal(contract, state.tricksWon[declaring], state.vulnerability);

    return {
      ...state,
      phase: 'deal-summary',
      trickComplete: false,
      trickWinnerSeat: null,
      scores: { ...state.scores, [result.scoredBy]: state.scores[result.scoredBy] + result.score },
      history: [
        ...state.history,
        {
          dealNumber: state.dealNumber,
          contract,
          vulnerability: state.vulnerability,
          tricksWon: state.tricksWon[declaring],
          made: result.made,
          score: result.score,
          scoredBy: result.scoredBy
        }
      ],
      message: result.made
        ? `Contract made with ${state.tricksWon[declaring]} tricks.`
        : `Down ${contract.level + 6 - state.tricksWon[declaring]}.`
    };
  }
}
