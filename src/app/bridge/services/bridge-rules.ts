import { Card, Rank, Suit } from '../../cards/card.models';
import { BridgeTrick, Seat, Strain, nextSeat } from '../bridge.models';

export const RANK_VALUE: Record<Rank, number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14
};

export const sameCard = (left: Card, right: Card): boolean =>
  left.suit === right.suit && left.rank === right.rank;

export const trumpSuit = (strain: Strain): Suit | null => (strain === 'notrump' ? null : strain);

export const ledSuit = (trick: BridgeTrick): Suit | null => trick.cards[0]?.card.suit ?? null;

/** Follow suit whenever you can; otherwise anything in hand is fair game. */
export const legalPlays = (hand: Card[], trick: BridgeTrick): Card[] => {
  const lead = ledSuit(trick);
  if (!lead) {
    return hand.slice();
  }
  const following = hand.filter((card) => card.suit === lead);
  return following.length > 0 ? following : hand.slice();
};

export const isLegalPlay = (hand: Card[], trick: BridgeTrick, card: Card): boolean =>
  legalPlays(hand, trick).some((legal) => sameCard(legal, card));

/** Highest trump takes it; with no trump played the highest card of the led suit wins. */
export const trickWinner = (trick: BridgeTrick, strain: Strain): Seat | null => {
  if (trick.cards.length === 0) {
    return null;
  }

  const trump = trumpSuit(strain);
  const lead = trick.cards[0].card.suit;
  const trumped = trump ? trick.cards.filter((play) => play.card.suit === trump) : [];
  const contenders = trumped.length > 0 ? trumped : trick.cards.filter((play) => play.card.suit === lead);

  return contenders.reduce((best, current) =>
    RANK_VALUE[current.card.rank] > RANK_VALUE[best.card.rank] ? current : best
  ).seat;
};

/** The opening lead comes from the seat on declarer's left. */
export const openingLeader = (declarer: Seat): Seat => nextSeat(declarer);

export const highestOf = (cards: Card[]): Card =>
  cards.reduce((best, card) => (RANK_VALUE[card.rank] > RANK_VALUE[best.rank] ? card : best));

export const lowestOf = (cards: Card[]): Card =>
  cards.reduce((best, card) => (RANK_VALUE[card.rank] < RANK_VALUE[best.rank] ? card : best));

export const bySuit = (hand: Card[], suit: Suit): Card[] => hand.filter((card) => card.suit === suit);
