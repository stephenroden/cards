import { Injectable, signal } from '@angular/core';
import { Card } from '../../game/game.models';
import { PokerPlayer, PokerState, PokerStreet } from '../poker.models';

const POKER_STATE_STORAGE_KEY = 'cards.poker.state';

const PLAYER_TEMPLATE: Array<Pick<PokerPlayer, 'id' | 'name' | 'type' | 'profile'>> = [
  { id: 'p1', name: 'You', type: 'human' },
  { id: 'p2', name: 'Kai', type: 'cpu', profile: 'tight-aggressive' },
  { id: 'p3', name: 'Lena', type: 'cpu', profile: 'loose-aggressive' },
  { id: 'p4', name: 'Milo', type: 'cpu', profile: 'tight-passive' }
];

const makePlayers = (startingStack: number): PokerPlayer[] =>
  PLAYER_TEMPLATE.map((template) => ({
    ...template,
    stack: startingStack,
    hand: [],
    folded: false,
    allIn: false,
    currentBet: 0,
    totalCommitted: 0,
    acted: false,
    eliminated: false
  }));

const initialState = (): PokerState => ({
  phase: 'preflop',
  street: 'preflop',
  players: makePlayers(200),
  deck: [],
  communityCards: [],
  dealerIndex: 0,
  actingIndex: 0,
  smallBlind: 1,
  bigBlind: 2,
  currentBet: 0,
  raiseCount: 0,
  maxRaises: 3,
  handNumber: 0,
  lastAggressorIndex: null,
  actionHistory: [],
  sidePots: [],
  winners: [],
  lastHandNet: {},
  revealCpuCards: false,
  message: 'Ready to start Poker.',
  sessionOver: false
});

const isCard = (value: unknown): value is Card => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<Card>;
  return typeof candidate.rank === 'string' && typeof candidate.suit === 'string';
};

const isPokerState = (value: unknown): value is PokerState => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<PokerState>;
  return (
    typeof candidate.phase === 'string' &&
    typeof candidate.street === 'string' &&
    Array.isArray(candidate.players) &&
    Array.isArray(candidate.deck) &&
    candidate.deck.every(isCard) &&
    Array.isArray(candidate.communityCards) &&
    candidate.communityCards.every(isCard) &&
    typeof candidate.dealerIndex === 'number' &&
    typeof candidate.actingIndex === 'number' &&
    typeof candidate.smallBlind === 'number' &&
    typeof candidate.bigBlind === 'number' &&
    typeof candidate.currentBet === 'number' &&
    typeof candidate.raiseCount === 'number' &&
    typeof candidate.maxRaises === 'number' &&
    typeof candidate.handNumber === 'number' &&
    (candidate.lastAggressorIndex === null || typeof candidate.lastAggressorIndex === 'number') &&
    Array.isArray(candidate.actionHistory) &&
    Array.isArray(candidate.sidePots) &&
    Array.isArray(candidate.winners) &&
    typeof candidate.lastHandNet === 'object' &&
    candidate.lastHandNet !== null &&
    typeof candidate.revealCpuCards === 'boolean' &&
    typeof candidate.message === 'string' &&
    typeof candidate.sessionOver === 'boolean'
  );
};

@Injectable({
  providedIn: 'root'
})
export class PokerStateService {
  readonly state = signal<PokerState>(this.restoreState());

  resetSession(): void {
    this.setState(initialState());
  }

  setState(next: PokerState): void {
    this.state.set(next);
    this.persistState(next);
  }

  update(partial: Partial<PokerState>): void {
    const next = { ...this.state(), ...partial };
    this.setState(next);
  }

  activePlayers(players: PokerPlayer[]): PokerPlayer[] {
    return players.filter((player) => !player.eliminated);
  }

  playersStillInHand(players: PokerPlayer[]): PokerPlayer[] {
    return players.filter((player) => !player.eliminated && !player.folded);
  }

  canAct(player: PokerPlayer): boolean {
    return !player.eliminated && !player.folded && !player.allIn;
  }

  streetBetSize(street: PokerStreet): number {
    return street === 'turn' || street === 'river' ? 4 : 2;
  }

  rotateToNextActive(startingIndex: number, players: PokerPlayer[]): number {
    for (let offset = 1; offset <= players.length; offset += 1) {
      const index = (startingIndex + offset) % players.length;
      if (!players[index].eliminated) {
        return index;
      }
    }
    return startingIndex;
  }

  nextActor(startingIndex: number, players: PokerPlayer[]): number {
    for (let offset = 1; offset <= players.length; offset += 1) {
      const index = (startingIndex + offset) % players.length;
      if (this.canAct(players[index])) {
        return index;
      }
    }
    return startingIndex;
  }

  dealCard(deck: Card[]): { deck: Card[]; card: Card } {
    const card = deck[0];
    return { deck: deck.slice(1), card };
  }

  private restoreState(): PokerState {
    try {
      const raw = globalThis.localStorage?.getItem(POKER_STATE_STORAGE_KEY);
      if (!raw) {
        return initialState();
      }

      const parsed: unknown = JSON.parse(raw);
      return isPokerState(parsed) ? parsed : initialState();
    } catch {
      return initialState();
    }
  }

  private persistState(state: PokerState): void {
    try {
      globalThis.localStorage?.setItem(POKER_STATE_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore persistence failures and keep the in-memory game running.
    }
  }
}
