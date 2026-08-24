import { Card } from '../game/game.models';

export type PokerStreet = 'preflop' | 'flop' | 'turn' | 'river';
export type PokerPhase = PokerStreet | 'showdown' | 'hand-summary' | 'session-over';
export type PokerActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise';
export type PokerProfile = 'tight-aggressive' | 'loose-aggressive' | 'tight-passive';

export interface PokerPlayer {
  id: string;
  name: string;
  type: 'human' | 'cpu';
  profile?: PokerProfile;
  stack: number;
  hand: Card[];
  folded: boolean;
  allIn: boolean;
  currentBet: number;
  totalCommitted: number;
  acted: boolean;
  eliminated: boolean;
}

export interface PokerAction {
  playerId: string;
  type: PokerActionType;
  amount: number;
  street: PokerStreet;
}

export interface SidePot {
  amount: number;
  eligiblePlayerIds: string[];
}

export interface PokerState {
  phase: PokerPhase;
  street: PokerStreet;
  players: PokerPlayer[];
  deck: Card[];
  communityCards: Card[];
  dealerIndex: number;
  actingIndex: number;
  smallBlind: number;
  bigBlind: number;
  currentBet: number;
  raiseCount: number;
  maxRaises: number;
  handNumber: number;
  lastAggressorIndex: number | null;
  actionHistory: PokerAction[];
  sidePots: SidePot[];
  winners: string[];
  lastHandNet: Partial<Record<string, number>>;
  revealCpuCards: boolean;
  message: string;
  sessionOver: boolean;
}
