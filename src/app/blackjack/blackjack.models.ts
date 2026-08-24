import { Card } from '../cards/card.models';
export type BlackjackPhase =
  | 'betting'
  | 'insurance'
  | 'player-turn'
  | 'dealer-turn'
  | 'hand-summary'
  | 'session-over';

export type BlackjackActionType = 'hit' | 'stand' | 'double' | 'split' | 'surrender';

export type HandStatus = 'active' | 'stood' | 'busted' | 'surrendered';

export type HandOutcome = 'blackjack' | 'win' | 'push' | 'lose' | 'bust' | 'surrender';

export type SeatType = 'human' | 'cpu';

export type BlackjackProfile = 'cautious' | 'steady' | 'bold';

export interface BlackjackRules {
  deckCount: number;
  dealerHitsSoft17: boolean;
  blackjackPayout: number;
  maxSplits: number;
  doubleAfterSplit: boolean;
  surrenderAllowed: boolean;
}

export const DEFAULT_BLACKJACK_RULES: BlackjackRules = {
  deckCount: 6,
  dealerHitsSoft17: false,
  blackjackPayout: 1.5,
  maxSplits: 3,
  doubleAfterSplit: true,
  surrenderAllowed: true
};

export const STARTING_BANKROLL = 500;
export const MIN_BET = 5;
export const CHIP_DENOMINATIONS = [5, 25, 100] as const;

/** How a CPU seat sizes its bet: a flat base, pressed up while it is winning. */
export interface BettingStyle {
  base: number;
  pressWin: number;
}

export const PROFILE_BETTING: Record<BlackjackProfile, BettingStyle> = {
  cautious: { base: 10, pressWin: 1 },
  steady: { base: 25, pressWin: 1 },
  bold: { base: 25, pressWin: 2 }
};

export interface SeatDefinition {
  id: string;
  name: string;
  type: SeatType;
  profile?: BlackjackProfile;
}

export const HUMAN_SEAT_ID = 's1';

export const SEAT_DEFINITIONS: readonly SeatDefinition[] = [
  { id: HUMAN_SEAT_ID, name: 'You', type: 'human' },
  { id: 's2', name: 'Kai', type: 'cpu', profile: 'cautious' },
  { id: 's3', name: 'Lena', type: 'cpu', profile: 'steady' },
  { id: 's4', name: 'Milo', type: 'cpu', profile: 'bold' }
];

export interface BlackjackHand {
  id: string;
  cards: Card[];
  bet: number;
  doubled: boolean;
  splitDepth: number;
  fromSplitAces: boolean;
  status: HandStatus;
  outcome: HandOutcome | null;
  net: number;
}

export interface BlackjackSeat {
  id: string;
  name: string;
  type: SeatType;
  profile?: BlackjackProfile;
  bankroll: number;
  bet: number;
  lastBet: number;
  hands: BlackjackHand[];
  activeHandIndex: number;
  insuranceBet: number;
  insuranceNet: number;
  lastNet: number;
  /** Set once the seat can no longer cover the table minimum; it is dealt out. */
  out: boolean;
}

export interface BlackjackState {
  phase: BlackjackPhase;
  rules: BlackjackRules;
  shoe: Card[];
  shoeSize: number;
  seats: BlackjackSeat[];
  activeSeatIndex: number;
  dealer: Card[];
  holeCardHidden: boolean;
  handNumber: number;
  message: string;
}
