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
import {
  AuctionCall,
  Call,
  auctionIsComplete,
  finalContract,
  isLegalCall,
  isPassedOut,
  seatToCall
} from './bridge-auction';
import { chooseCall } from './bridge-bidding-ai';
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

  /**
   * South always plays their own cards. When north/south win the contract the player runs
   * both hands, whichever of the two the auction made declarer, so they never sit out as dummy.
   */
  humanControls(state: BridgeState, seat: Seat): boolean {
    if (seat === 'south') {
      return true;
    }
    if (seat !== partnerOf('south') || !state.contract) {
      return false;
    }
    return partnershipOf(state.contract.declarer) === partnershipOf('south');
  }

  handOf(state: BridgeState, seat: Seat): Card[] {
    return state.players.find((player) => player.seat === seat)?.hand ?? [];
  }

  dummySeat(state: BridgeState): Seat | null {
    return state.contract ? partnerOf(state.contract.declarer) : null;
  }

  /** The seat whose turn it is to call. */
  seatToCall(state: BridgeState): Seat {
    return seatToCall(state.dealer, state.auction);
  }

  isLegalCall(state: BridgeState, call: Call): boolean {
    return state.phase === 'auction' && isLegalCall(state.auction, this.seatToCall(state), call);
  }

  makeCall(call: Call): void {
    const state = this.bridgeState.state();
    if (state.phase !== 'auction' || this.seatToCall(state) !== 'south') {
      return;
    }
    if (!isLegalCall(state.auction, 'south', call)) {
      return;
    }
    this.bridgeState.setState(this.advanceAuction(this.applyCall(state, 'south', call)));
  }

  private applyCall(state: BridgeState, seat: Seat, call: Call): BridgeState {
    return { ...state, auction: [...state.auction, { seat, call }] };
  }

  /** Runs the CPU seats through the auction, then opens play on whatever they settled. */
  private advanceAuction(state: BridgeState): BridgeState {
    let current = state;
    let guard = 0;
    while (!auctionIsComplete(current.auction) && guard < 80) {
      const seat = seatToCall(current.dealer, current.auction);
      if (seat === 'south') {
        return { ...current, message: '' };
      }
      guard += 1;
      current = this.applyCall(current, seat, chooseCall({ seat, hand: this.handOf(current, seat), calls: current.auction }));
    }

    if (isPassedOut(current.auction)) {
      return this.redeal(current);
    }

    const contract = finalContract(current.auction);
    return contract ? this.beginPlay(current, contract) : this.redeal(current);
  }

  /** Opens play on a settled contract, running the CPU seats up to the player's first turn. */
  setContract(contract: Contract): void {
    const state = this.bridgeState.state();
    if (state.phase !== 'auction' && state.phase !== 'play') {
      return;
    }
    this.bridgeState.setState(this.beginPlay(state, contract));
  }

  private beginPlay(state: BridgeState, contract: Contract): BridgeState {
    const leader = openingLeader(contract.declarer);
    return this.advance({
      ...state,
      contract,
      phase: 'play',
      turn: leader,
      trick: { leader, cards: [] },
      message: ''
    });
  }

  /** Nobody wanted the hand, so the same dealer deals again. */
  private redeal(state: BridgeState): BridgeState {
    return {
      ...initialBridgeState(state.dealNumber),
      scores: state.scores,
      history: state.history,
      message: 'Passed out. Redealing.'
    };
  }

  /** Kicks the auction off when the deal is fresh and nobody has called yet. */
  openAuction(): void {
    const state = this.bridgeState.state();
    if (state.phase !== 'auction' || state.auction.length > 0) {
      return;
    }
    this.bridgeState.setState(this.advanceAuction(state));
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
