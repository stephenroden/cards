import { Injectable, signal } from '@angular/core';
import { Card } from '../../game/game.models';
import {
  BlackjackHand,
  BlackjackSeat,
  BlackjackState,
  DEFAULT_BLACKJACK_RULES,
  SEAT_DEFINITIONS,
  STARTING_BANKROLL,
  MIN_BET
} from '../blackjack.models';
import { buildShoe, shoeSize } from './blackjack-shoe';
import { chooseSeatBet } from './blackjack-strategy';

const BLACKJACK_STATE_STORAGE_KEY = 'cards.blackjack.state';

export const initialSeats = (): BlackjackSeat[] =>
  SEAT_DEFINITIONS.map((definition) => {
    const seat: BlackjackSeat = {
      ...definition,
      bankroll: STARTING_BANKROLL,
      bet: 0,
      lastBet: MIN_BET,
      hands: [],
      activeHandIndex: 0,
      insuranceBet: 0,
      insuranceNet: 0,
      lastNet: 0,
      out: false
    };
    // CPU seats post their bet as soon as the table opens so the felt is never blank.
    return seat.type === 'cpu' ? { ...seat, bet: chooseSeatBet(seat) } : seat;
  });

export const initialBlackjackState = (): BlackjackState => ({
  phase: 'betting',
  rules: { ...DEFAULT_BLACKJACK_RULES },
  shoe: buildShoe(DEFAULT_BLACKJACK_RULES.deckCount),
  shoeSize: shoeSize(DEFAULT_BLACKJACK_RULES.deckCount),
  seats: initialSeats(),
  activeSeatIndex: 0,
  dealer: [],
  holeCardHidden: true,
  handNumber: 0,
  message: 'Place your bet to begin.'
});

const isCard = (value: unknown): value is Card => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<Card>;
  return typeof candidate.rank === 'string' && typeof candidate.suit === 'string';
};

const isHand = (value: unknown): value is BlackjackHand => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<BlackjackHand>;
  return (
    typeof candidate.id === 'string' &&
    Array.isArray(candidate.cards) &&
    candidate.cards.every(isCard) &&
    typeof candidate.bet === 'number' &&
    typeof candidate.status === 'string'
  );
};

const isSeat = (value: unknown): value is BlackjackSeat => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<BlackjackSeat>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.type === 'string' &&
    typeof candidate.bankroll === 'number' &&
    typeof candidate.bet === 'number' &&
    typeof candidate.activeHandIndex === 'number' &&
    typeof candidate.out === 'boolean' &&
    Array.isArray(candidate.hands) &&
    candidate.hands.every(isHand)
  );
};

const isBlackjackState = (value: unknown): value is BlackjackState => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<BlackjackState>;
  return (
    typeof candidate.phase === 'string' &&
    typeof candidate.activeSeatIndex === 'number' &&
    typeof candidate.holeCardHidden === 'boolean' &&
    Array.isArray(candidate.shoe) &&
    candidate.shoe.every(isCard) &&
    Array.isArray(candidate.dealer) &&
    candidate.dealer.every(isCard) &&
    Array.isArray(candidate.seats) &&
    candidate.seats.length > 0 &&
    candidate.seats.every(isSeat) &&
    typeof candidate.rules === 'object' &&
    candidate.rules !== null
  );
};

@Injectable({
  providedIn: 'root'
})
export class BlackjackStateService {
  private readonly stateSignal = signal<BlackjackState>(this.restoreState());

  readonly state = this.stateSignal.asReadonly();

  setState(next: BlackjackState): void {
    this.stateSignal.set(next);
    this.persistState(next);
  }

  resetSession(): void {
    this.setState(initialBlackjackState());
  }

  dealCard(shoe: Card[]): { shoe: Card[]; card: Card } {
    return { shoe: shoe.slice(1), card: shoe[0] };
  }

  private restoreState(): BlackjackState {
    try {
      const raw = globalThis.localStorage?.getItem(BLACKJACK_STATE_STORAGE_KEY);
      if (!raw) {
        return initialBlackjackState();
      }

      const parsed: unknown = JSON.parse(raw);
      return isBlackjackState(parsed) ? parsed : initialBlackjackState();
    } catch {
      return initialBlackjackState();
    }
  }

  private persistState(state: BlackjackState): void {
    try {
      globalThis.localStorage?.setItem(BLACKJACK_STATE_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore persistence failures and keep the in-memory game running.
    }
  }
}
