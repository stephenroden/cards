import { Injectable } from '@angular/core';
import { Card } from '../../game/game.models';
import {
  BlackjackActionType,
  BlackjackHand,
  BlackjackRules,
  BlackjackSeat,
  BlackjackState,
  MIN_BET
} from '../blackjack.models';
import {
  canDouble,
  canHit,
  canSplit,
  canSurrender,
  dealerShouldHit,
  handValue,
  isBlackjack,
  isDealerBlackjack
} from './blackjack-hand';
import { humanSeat } from './blackjack-seat';
import { buildShoe, needsReshuffle, shoeSize } from './blackjack-shoe';
import { BlackjackStateService } from './blackjack-state.service';
import { chooseBlackjackAction, chooseSeatBet } from './blackjack-strategy';

interface HandLocation {
  seatIndex: number;
  handIndex: number;
}

const makeHand = (id: string, cards: Card[], bet: number, splitDepth = 0, fromSplitAces = false): BlackjackHand => ({
  id,
  cards,
  bet,
  doubled: false,
  splitDepth,
  fromSplitAces,
  status: 'active',
  outcome: null,
  net: 0
});

@Injectable({
  providedIn: 'root'
})
export class BlackjackEngineService {
  constructor(private readonly blackjackState: BlackjackStateService) {}

  startSession(): void {
    this.blackjackState.resetSession();
  }

  applyRules(rules: Partial<BlackjackRules>): void {
    const state = this.blackjackState.state();
    this.blackjackState.setState({ ...state, rules: { ...state.rules, ...rules } });
  }

  addToBet(amount: number): void {
    const state = this.blackjackState.state();
    const seat = humanSeat(state);
    if (state.phase !== 'betting' || amount > seat.bankroll - seat.bet) {
      return;
    }
    this.blackjackState.setState({
      ...this.updateHumanSeat(state, (current) => ({ ...current, bet: current.bet + amount })),
      message: 'Place your bet, then deal.'
    });
  }

  clearBet(): void {
    const state = this.blackjackState.state();
    if (state.phase !== 'betting') {
      return;
    }
    this.blackjackState.setState(this.updateHumanSeat(state, (seat) => ({ ...seat, bet: 0 })));
  }

  repeatLastBet(): void {
    const state = this.blackjackState.state();
    const seat = humanSeat(state);
    if (state.phase !== 'betting' || seat.lastBet > seat.bankroll) {
      return;
    }
    this.blackjackState.setState(this.updateHumanSeat(state, (current) => ({ ...current, bet: current.lastBet })));
  }

  deal(): void {
    const state = this.blackjackState.state();
    const player = humanSeat(state);
    if (state.phase !== 'betting' || player.bet < MIN_BET || player.bet > player.bankroll) {
      return;
    }

    const rules = state.rules;
    let shoe = needsReshuffle(state.shoe, rules.deckCount) ? buildShoe(rules.deckCount) : state.shoe;
    const draw = (): Card => {
      const result = this.blackjackState.dealCard(shoe);
      shoe = result.shoe;
      return result.card;
    };

    const dealtIn = state.seats.map((seat) => !seat.out && seat.bet >= MIN_BET && seat.bet <= seat.bankroll);
    const first = state.seats.map((seat, index) => (dealtIn[index] ? draw() : null));
    const dealerUp = draw();
    const second = state.seats.map((seat, index) => (dealtIn[index] ? draw() : null));
    const dealerHole = draw();

    const seats = state.seats.map((seat, index) => {
      if (!dealtIn[index]) {
        return { ...seat, bet: 0, hands: [], activeHandIndex: 0, insuranceBet: 0, insuranceNet: 0, lastNet: 0 };
      }
      const hand = settleHandStatus(makeHand(`${seat.id}h`, [first[index]!, second[index]!], seat.bet));
      return {
        ...seat,
        hands: [hand],
        activeHandIndex: 0,
        bankroll: seat.bankroll - seat.bet,
        lastBet: seat.bet,
        insuranceBet: 0,
        insuranceNet: 0,
        lastNet: 0
      };
    });

    const dealt: BlackjackState = {
      ...state,
      shoe,
      shoeSize: shoeSize(rules.deckCount),
      seats,
      activeSeatIndex: 0,
      dealer: [dealerUp, dealerHole],
      holeCardHidden: true,
      handNumber: state.handNumber + 1,
      phase: 'player-turn',
      message: ''
    };

    const insuranceCost = Math.floor(humanSeat(dealt).bet / 2);
    if (dealerUp.rank === 'A' && insuranceCost > 0 && humanSeat(dealt).bankroll >= insuranceCost) {
      this.blackjackState.setState({
        ...dealt,
        phase: 'insurance',
        message: 'Dealer shows an ace. Insurance?'
      });
      return;
    }

    this.blackjackState.setState(this.resolveOpeningDeal(dealt));
  }

  takeInsurance(): void {
    const state = this.blackjackState.state();
    if (state.phase !== 'insurance') {
      return;
    }
    const seat = humanSeat(state);
    const cost = Math.floor(seat.bet / 2);
    if (cost > seat.bankroll) {
      return;
    }
    this.blackjackState.setState(
      this.resolveOpeningDeal(
        this.updateHumanSeat(state, (current) => ({
          ...current,
          bankroll: current.bankroll - cost,
          insuranceBet: cost
        }))
      )
    );
  }

  declineInsurance(): void {
    const state = this.blackjackState.state();
    if (state.phase !== 'insurance') {
      return;
    }
    this.blackjackState.setState(this.resolveOpeningDeal(state));
  }

  /** The actions offered to whichever seat is on turn; CPU seats are scored against the same list. */
  legalActions(state: BlackjackState): BlackjackActionType[] {
    if (state.phase !== 'player-turn') {
      return [];
    }
    const seat = state.seats[state.activeSeatIndex];
    const hand = seat?.hands[seat.activeHandIndex];
    if (!seat || !hand || hand.status !== 'active') {
      return [];
    }

    const actions: BlackjackActionType[] = [];
    if (canHit(hand)) {
      actions.push('hit');
    }
    actions.push('stand');
    if (canDouble(hand, state.rules, seat.bankroll)) {
      actions.push('double');
    }
    if (canSplit(hand, state.rules, seat.bankroll, seat.hands.length)) {
      actions.push('split');
    }
    if (canSurrender(hand, state.rules, seat.hands.length)) {
      actions.push('surrender');
    }
    return actions;
  }

  act(action: BlackjackActionType): void {
    const state = this.blackjackState.state();
    if (state.seats[state.activeSeatIndex]?.type !== 'human') {
      return;
    }
    if (!this.legalActions(state).includes(action)) {
      return;
    }
    this.blackjackState.setState(this.advance(this.applyAction(state, action)));
  }

  nextHand(): void {
    const state = this.blackjackState.state();
    if (state.phase !== 'hand-summary') {
      return;
    }
    this.blackjackState.setState(this.openBetting(state));
  }

  /** Clears the table, retires broke seats and lets the CPU seats post their next bet. */
  private openBetting(state: BlackjackState): BlackjackState {
    const seats = state.seats.map((seat) => {
      const out = seat.bankroll < MIN_BET;
      const cleared: BlackjackSeat = {
        ...seat,
        out,
        hands: [],
        activeHandIndex: 0,
        insuranceBet: 0,
        insuranceNet: 0,
        bet: 0
      };
      return out || cleared.type === 'human' ? cleared : { ...cleared, bet: chooseSeatBet(cleared) };
    });

    const player = seats.find((seat) => seat.type === 'human');
    if (player?.out) {
      return {
        ...state,
        seats,
        phase: 'session-over',
        message: 'Out of chips. Start a new session to play again.'
      };
    }

    return {
      ...state,
      seats,
      activeSeatIndex: 0,
      dealer: [],
      holeCardHidden: true,
      phase: 'betting',
      message: 'Place your bet.'
    };
  }

  /** Dealer peek plus naturals: either can end the round before anybody acts. */
  private resolveOpeningDeal(state: BlackjackState): BlackjackState {
    if (isDealerBlackjack(state.dealer)) {
      return this.settle({ ...state, holeCardHidden: false });
    }
    return this.advance(state);
  }

  private applyAction(state: BlackjackState, action: BlackjackActionType): BlackjackState {
    if (action === 'hit') {
      return this.applyHit(state);
    }
    if (action === 'double') {
      return this.applyDouble(state);
    }
    if (action === 'split') {
      return this.applySplit(state);
    }
    const status = action === 'stand' ? 'stood' : 'surrendered';
    return this.updateActiveHand(state, (hand) => ({ ...hand, status }));
  }

  private applyHit(state: BlackjackState): BlackjackState {
    const { shoe, card } = this.blackjackState.dealCard(state.shoe);
    return this.updateActiveHand({ ...state, shoe }, (hand) =>
      settleHandStatus({ ...hand, cards: [...hand.cards, card] })
    );
  }

  private applyDouble(state: BlackjackState): BlackjackState {
    const seat = state.seats[state.activeSeatIndex];
    const stake = seat.hands[seat.activeHandIndex].bet;
    const { shoe, card } = this.blackjackState.dealCard(state.shoe);
    const charged = this.updateSeat({ ...state, shoe }, state.activeSeatIndex, (current) => ({
      ...current,
      bankroll: current.bankroll - stake
    }));

    return this.updateActiveHand(charged, (hand) => {
      const next: BlackjackHand = {
        ...hand,
        cards: [...hand.cards, card],
        bet: hand.bet * 2,
        doubled: true
      };
      return handValue(next.cards).busted ? { ...next, status: 'busted' } : { ...next, status: 'stood' };
    });
  }

  private applySplit(state: BlackjackState): BlackjackState {
    const seatIndex = state.activeSeatIndex;
    const seat = state.seats[seatIndex];
    const handIndex = seat.activeHandIndex;
    const hand = seat.hands[handIndex];
    const splitAces = hand.cards[0].rank === 'A';
    const depth = hand.splitDepth + 1;

    let shoe = state.shoe;
    const firstDraw = this.blackjackState.dealCard(shoe);
    shoe = firstDraw.shoe;
    const secondDraw = this.blackjackState.dealCard(shoe);
    shoe = secondDraw.shoe;

    const left = makeHand(`${hand.id}a`, [hand.cards[0], firstDraw.card], hand.bet, depth, splitAces);
    const right = makeHand(`${hand.id}b`, [hand.cards[1], secondDraw.card], hand.bet, depth, splitAces);
    // Split aces receive exactly one card each and are done.
    const finish = (target: BlackjackHand): BlackjackHand =>
      splitAces ? { ...target, status: 'stood' } : settleHandStatus(target);

    return this.updateSeat({ ...state, shoe }, seatIndex, (current) => {
      const hands = [...current.hands];
      hands.splice(handIndex, 1, finish(left), finish(right));
      return { ...current, hands, bankroll: current.bankroll - hand.bet };
    });
  }

  private updateSeat(
    state: BlackjackState,
    seatIndex: number,
    update: (seat: BlackjackSeat) => BlackjackSeat
  ): BlackjackState {
    return { ...state, seats: state.seats.map((seat, index) => (index === seatIndex ? update(seat) : seat)) };
  }

  private updateHumanSeat(state: BlackjackState, update: (seat: BlackjackSeat) => BlackjackSeat): BlackjackState {
    return { ...state, seats: state.seats.map((seat) => (seat.type === 'human' ? update(seat) : seat)) };
  }

  private updateActiveHand(
    state: BlackjackState,
    update: (hand: BlackjackHand) => BlackjackHand
  ): BlackjackState {
    return this.updateSeat(state, state.activeSeatIndex, (seat) => ({
      ...seat,
      hands: seat.hands.map((hand, index) => (index === seat.activeHandIndex ? update(hand) : hand))
    }));
  }

  /**
   * Hands over to the next unfinished hand at the table, playing CPU seats out as they come up
   * and falling through to the dealer once nobody is left to act.
   */
  private advance(state: BlackjackState): BlackjackState {
    let current = state;
    for (;;) {
      const location = nextActiveHand(current);
      if (!location) {
        return this.finishRound(current);
      }

      current = {
        ...this.updateSeat(current, location.seatIndex, (seat) => ({ ...seat, activeHandIndex: location.handIndex })),
        activeSeatIndex: location.seatIndex,
        phase: 'player-turn'
      };

      const seat = current.seats[location.seatIndex];
      if (seat.type === 'human') {
        return { ...current, message: '' };
      }

      const legal = this.legalActions(current);
      if (legal.length === 0) {
        current = this.updateActiveHand(current, (hand) => ({ ...hand, status: 'stood' }));
        continue;
      }
      current = this.applyAction(current, chooseBlackjackAction(seat.hands[location.handIndex], current.dealer[0], legal, current.rules));
    }
  }

  private finishRound(state: BlackjackState): BlackjackState {
    const stillLive = state.seats.some((seat) => seat.hands.some((hand) => hand.status === 'stood'));
    const revealed = { ...state, holeCardHidden: false };
    return this.settle(stillLive ? this.playDealer(revealed) : revealed);
  }

  private playDealer(state: BlackjackState): BlackjackState {
    let shoe = state.shoe;
    let dealer = state.dealer;
    while (dealerShouldHit(dealer, state.rules)) {
      const draw = this.blackjackState.dealCard(shoe);
      shoe = draw.shoe;
      dealer = [...dealer, draw.card];
    }
    return { ...state, shoe, dealer, phase: 'dealer-turn' };
  }

  private settle(state: BlackjackState): BlackjackState {
    const dealerBlackjack = isDealerBlackjack(state.dealer);
    const dealerValue = handValue(state.dealer);

    const seats = state.seats.map((seat) => {
      if (seat.hands.length === 0) {
        return { ...seat, lastNet: 0, insuranceNet: 0 };
      }

      let returned = 0;
      const hands = seat.hands.map((hand) => {
        const settled = settleHand(hand, dealerValue.total, dealerValue.busted, dealerBlackjack, state.rules.blackjackPayout);
        returned += settled.returned;
        return settled.hand;
      });

      const insuranceReturn = dealerBlackjack ? seat.insuranceBet * 3 : 0;
      const insuranceNet = insuranceReturn - seat.insuranceBet;
      const handNet = hands.reduce((sum, hand) => sum + hand.net, 0);

      return {
        ...seat,
        hands,
        insuranceNet,
        lastNet: handNet + insuranceNet,
        bankroll: seat.bankroll + returned + insuranceReturn
      };
    });

    const player = seats.find((seat) => seat.type === 'human');
    return {
      ...state,
      seats,
      holeCardHidden: false,
      phase: 'hand-summary',
      message: player ? summaryMessage(player, dealerBlackjack) : ''
    };
  }
}

/** Scans the table in seat order for the first hand still waiting on a decision. */
const nextActiveHand = (state: BlackjackState): HandLocation | null => {
  for (let seatIndex = 0; seatIndex < state.seats.length; seatIndex += 1) {
    const handIndex = state.seats[seatIndex].hands.findIndex((hand) => hand.status === 'active');
    if (handIndex !== -1) {
      return { seatIndex, handIndex };
    }
  }
  return null;
};

/** Busted hands are dead; 21 never wants another card, so it stands itself. */
const settleHandStatus = (hand: BlackjackHand): BlackjackHand => {
  const value = handValue(hand.cards);
  if (value.busted) {
    return { ...hand, status: 'busted' };
  }
  if (value.total === 21) {
    return { ...hand, status: 'stood' };
  }
  return hand;
};

interface SettledHand {
  hand: BlackjackHand;
  returned: number;
}

const settleHand = (
  hand: BlackjackHand,
  dealerTotal: number,
  dealerBusted: boolean,
  dealerBlackjack: boolean,
  blackjackPayout: number
): SettledHand => {
  if (hand.status === 'surrendered') {
    const returned = hand.bet / 2;
    return { hand: { ...hand, outcome: 'surrender', net: returned - hand.bet }, returned };
  }
  if (hand.status === 'busted') {
    return { hand: { ...hand, outcome: 'bust', net: -hand.bet }, returned: 0 };
  }

  const playerBlackjack = isBlackjack(hand);
  if (playerBlackjack && !dealerBlackjack) {
    const returned = hand.bet + hand.bet * blackjackPayout;
    return { hand: { ...hand, outcome: 'blackjack', net: returned - hand.bet }, returned };
  }
  if (dealerBlackjack) {
    return playerBlackjack
      ? { hand: { ...hand, outcome: 'push', net: 0 }, returned: hand.bet }
      : { hand: { ...hand, outcome: 'lose', net: -hand.bet }, returned: 0 };
  }

  const total = handValue(hand.cards).total;
  if (dealerBusted || total > dealerTotal) {
    return { hand: { ...hand, outcome: 'win', net: hand.bet }, returned: hand.bet * 2 };
  }
  if (total === dealerTotal) {
    return { hand: { ...hand, outcome: 'push', net: 0 }, returned: hand.bet };
  }
  return { hand: { ...hand, outcome: 'lose', net: -hand.bet }, returned: 0 };
};

const summaryMessage = (seat: BlackjackSeat, dealerBlackjack: boolean): string => {
  if (seat.hands.length === 0) {
    return 'You sat this hand out.';
  }
  if (dealerBlackjack && seat.hands.every((hand) => hand.outcome === 'lose')) {
    return 'Dealer blackjack.';
  }
  if (seat.hands.length === 1 && seat.hands[0].outcome === 'blackjack') {
    return 'Blackjack!';
  }
  if (seat.lastNet > 0) {
    return `You win ${seat.lastNet} chips.`;
  }
  if (seat.lastNet < 0) {
    return `You lose ${Math.abs(seat.lastNet)} chips.`;
  }
  return 'Push.';
};
