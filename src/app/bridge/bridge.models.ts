import { Card, Suit } from '../cards/card.models';

/** Seats run clockwise from north; the human always sits south. */
export type Seat = 'north' | 'east' | 'south' | 'west';

export type Partnership = 'ns' | 'ew';

export type Strain = Suit | 'notrump';

export type Risk = 'none' | 'doubled' | 'redoubled';

export type Vulnerability = 'none' | 'ns' | 'ew' | 'both';

export type BridgePhase = 'contract' | 'play' | 'deal-summary' | 'session-over';

export interface Contract {
  level: number;
  strain: Strain;
  declarer: Seat;
  risk: Risk;
}

export interface BridgePlayer {
  seat: Seat;
  name: string;
  type: 'human' | 'cpu';
  hand: Card[];
}

export interface BridgeTrick {
  leader: Seat;
  cards: Array<{ seat: Seat; card: Card }>;
}

export interface DealResult {
  dealNumber: number;
  contract: Contract;
  vulnerability: Vulnerability;
  tricksWon: number;
  made: boolean;
  score: number;
  scoredBy: Partnership;
}

export interface BridgeState {
  phase: BridgePhase;
  dealNumber: number;
  dealer: Seat;
  vulnerability: Vulnerability;
  players: BridgePlayer[];
  contract: Contract | null;
  trick: BridgeTrick;
  completedTricks: number;
  tricksWon: Record<Partnership, number>;
  turn: Seat;
  /** A finished trick stays on the table until it is acknowledged, so it can be seen. */
  trickComplete: boolean;
  trickWinnerSeat: Seat | null;
  /** Every card played this deal, so the AI can count what is still outstanding. */
  played: Card[];
  /** Dummy stays face down until the opening lead is on the table. */
  dummyRevealed: boolean;
  scores: Record<Partnership, number>;
  history: DealResult[];
  message: string;
}

export const SEAT_ORDER: readonly Seat[] = ['north', 'east', 'south', 'west'];

export const HUMAN_SEAT: Seat = 'south';

export const DEALS_PER_SESSION = 4;

export const SEAT_NAMES: Record<Seat, string> = {
  north: 'North',
  east: 'East',
  south: 'You',
  west: 'West'
};

export const STRAINS: readonly Strain[] = ['clubs', 'diamonds', 'hearts', 'spades', 'notrump'];

export const seatIndex = (seat: Seat): number => SEAT_ORDER.indexOf(seat);

export const nextSeat = (seat: Seat): Seat => SEAT_ORDER[(seatIndex(seat) + 1) % 4];

export const partnerOf = (seat: Seat): Seat => SEAT_ORDER[(seatIndex(seat) + 2) % 4];

export const partnershipOf = (seat: Seat): Partnership =>
  seat === 'north' || seat === 'south' ? 'ns' : 'ew';

export const opposing = (side: Partnership): Partnership => (side === 'ns' ? 'ew' : 'ns');

/** Chicago rotates the vulnerability across the four deals of a session. */
export const vulnerabilityForDeal = (dealNumber: number): Vulnerability => {
  const table: Vulnerability[] = ['none', 'ns', 'ew', 'both'];
  return table[(dealNumber - 1) % 4];
};

export const dealerForDeal = (dealNumber: number): Seat => SEAT_ORDER[(dealNumber - 1) % 4];

export const isVulnerable = (side: Partnership, vulnerability: Vulnerability): boolean =>
  vulnerability === 'both' || vulnerability === side;
