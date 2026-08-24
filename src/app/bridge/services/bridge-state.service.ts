import { Injectable, signal } from '@angular/core';
import { Card } from '../../cards/card.models';
import {
  BridgePlayer,
  BridgeState,
  DEALS_PER_SESSION,
  SEAT_NAMES,
  SEAT_ORDER,
  Seat,
  dealerForDeal,
  vulnerabilityForDeal
} from '../bridge.models';
import { dealHands } from './bridge-deal';

const BRIDGE_STATE_STORAGE_KEY = 'cards.bridge.state';

export const buildPlayers = (hands: Record<Seat, Card[]>): BridgePlayer[] =>
  SEAT_ORDER.map((seat) => ({
    seat,
    name: SEAT_NAMES[seat],
    type: seat === 'south' ? 'human' : 'cpu',
    hand: hands[seat]
  }));

export const initialBridgeState = (dealNumber = 1): BridgeState => ({
  phase: 'auction',
  auction: [],
  dealNumber,
  dealer: dealerForDeal(dealNumber),
  vulnerability: vulnerabilityForDeal(dealNumber),
  players: buildPlayers(dealHands()),
  contract: null,
  trick: { leader: 'south', cards: [] },
  completedTricks: 0,
  tricksWon: { ns: 0, ew: 0 },
  turn: 'south',
  trickComplete: false,
  trickWinnerSeat: null,
  played: [],
  dummyRevealed: false,
  scores: { ns: 0, ew: 0 },
  history: [],
  message: 'The auction is open.'
});

const isCard = (value: unknown): value is Card => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<Card>;
  return typeof candidate.rank === 'string' && typeof candidate.suit === 'string';
};

const isPlayer = (value: unknown): value is BridgePlayer => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<BridgePlayer>;
  return (
    typeof candidate.seat === 'string' &&
    typeof candidate.name === 'string' &&
    Array.isArray(candidate.hand) &&
    candidate.hand.every(isCard)
  );
};

const isBridgeState = (value: unknown): value is BridgeState => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<BridgeState>;
  return (
    typeof candidate.phase === 'string' &&
    typeof candidate.dealNumber === 'number' &&
    candidate.dealNumber >= 1 &&
    candidate.dealNumber <= DEALS_PER_SESSION &&
    typeof candidate.turn === 'string' &&
    Array.isArray(candidate.auction) &&
    typeof candidate.dummyRevealed === 'boolean' &&
    Array.isArray(candidate.players) &&
    candidate.players.length === 4 &&
    candidate.players.every(isPlayer) &&
    typeof candidate.trick === 'object' &&
    candidate.trick !== null &&
    typeof candidate.scores === 'object' &&
    candidate.scores !== null &&
    Array.isArray(candidate.history)
  );
};

@Injectable({
  providedIn: 'root'
})
export class BridgeStateService {
  private readonly stateSignal = signal<BridgeState>(this.restoreState());

  readonly state = this.stateSignal.asReadonly();

  setState(next: BridgeState): void {
    this.stateSignal.set(next);
    this.persistState(next);
  }

  resetSession(): void {
    this.setState(initialBridgeState());
  }

  private restoreState(): BridgeState {
    try {
      const raw = globalThis.localStorage?.getItem(BRIDGE_STATE_STORAGE_KEY);
      if (!raw) {
        return initialBridgeState();
      }
      const parsed: unknown = JSON.parse(raw);
      return isBridgeState(parsed) ? parsed : initialBridgeState();
    } catch {
      return initialBridgeState();
    }
  }

  private persistState(state: BridgeState): void {
    try {
      globalThis.localStorage?.setItem(BRIDGE_STATE_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore persistence failures and keep the in-memory game running.
    }
  }
}
