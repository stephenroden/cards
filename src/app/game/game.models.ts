export type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades';
export type Rank =
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '10'
  | 'J'
  | 'Q'
  | 'K'
  | 'A';

export type GamePhase = 'deal' | 'pass' | 'play' | 'score' | 'summary';
export type PassDirection = 'left' | 'right' | 'across' | 'none';

export interface GameRules {
  jackOfDiamondsMinus10: boolean;
  debugAiHistory: boolean;
}

export const DEFAULT_GAME_RULES: GameRules = {
  jackOfDiamondsMinus10: false,
  debugAiHistory: true
};

export interface Card {
  suit: Suit;
  rank: Rank;
}

export interface PlayedCard {
  playerId: string;
  card: Card;
}

export interface Trick {
  leaderId: string;
  cards: PlayedCard[];
}

export interface PassTransfer {
  fromId: string;
  toId: string;
  cards: Card[];
}

export interface AiDecisionTrace {
  reasonCode: string;
  summary: string;
  factors: Record<string, string | number | boolean>;
}

export interface DebugPlayEntry {
  type?: 'play' | 'system';
  playerId: string;
  card: Card;
  trace: AiDecisionTrace;
}

export interface Player {
  id: string;
  name: string;
  type: 'human' | 'cpu';
  aiProfileId?: string;
  hand: Card[];
  score: number;
}

export interface GameState {
  phase: GamePhase;
  rules: GameRules;
  players: Player[];
  trick: Trick;
  trickWinnerId?: string;
  trickTaking?: boolean;
  round: number;
  turnPlayerId: string;
  passDirection: PassDirection;
  heartsBroken: boolean;
  takenCards: Record<string, Card[]>;
  playHistory: PlayedCard[];
  passTransfers: PassTransfer[];
  passSelections: Record<string, Card[]>;
  aiDecisionReasons: Record<string, string>;
  aiDecisionTraces: Record<string, AiDecisionTrace>;
  aiDecisionHistory: Record<string, AiDecisionTrace[]>;
  debugRoundHistory: DebugPlayEntry[];
  aiReasonVisibility: Record<string, boolean>;
  passComplete?: boolean;
}

export const SUITS: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];
export const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
