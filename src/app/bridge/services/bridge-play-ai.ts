import { Card, Suit } from '../../cards/card.models';
import { BridgeTrick, Seat, Strain } from '../bridge.models';
import { RANK_VALUE, bySuit, highestOf, legalPlays, lowestOf, trickWinner, trumpSuit } from './bridge-rules';

export interface PlayContext {
  seat: Seat;
  partner: Seat;
  hand: Card[];
  trick: BridgeTrick;
  strain: Strain;
  /** Every card already played in this deal, used to count what is still outstanding. */
  played: Card[];
  /** Partner's hand when it is visible from this seat (dummy). */
  visiblePartner: Card[] | null;
  isDeclarerSide: boolean;
}

const SUITS_IN_ORDER: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];

/** Would this card be taking the trick if the play stopped here? */
const wouldWin = (card: Card, context: PlayContext): boolean => {
  const probe: BridgeTrick = {
    ...context.trick,
    cards: [...context.trick.cards, { seat: context.seat, card }]
  };
  return trickWinner(probe, context.strain) === context.seat;
};

const partnerIsWinning = (context: PlayContext): boolean =>
  context.trick.cards.length > 0 && trickWinner(context.trick, context.strain) === context.partner;

const longestSuit = (hand: Card[], exclude: Suit | null): Suit => {
  const candidates = SUITS_IN_ORDER.filter((suit) => suit !== exclude && bySuit(hand, suit).length > 0);
  const pool = candidates.length > 0 ? candidates : SUITS_IN_ORDER.filter((suit) => bySuit(hand, suit).length > 0);
  return pool.reduce((best, suit) => (bySuit(hand, suit).length > bySuit(hand, best).length ? suit : best));
};

/** Two touching honours are worth leading from; the top of them is the safe card. */
const topOfSequence = (cards: Card[]): Card | null => {
  const sorted = [...cards].sort((left, right) => RANK_VALUE[right.rank] - RANK_VALUE[left.rank]);
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const high = RANK_VALUE[sorted[index].rank];
    if (high >= RANK_VALUE['10'] && high - RANK_VALUE[sorted[index + 1].rank] === 1) {
      return sorted[index];
    }
  }
  return null;
};

/** Fourth highest of the longest suit, the standard lead when nothing better offers. */
const fourthBest = (cards: Card[]): Card => {
  const sorted = [...cards].sort((left, right) => RANK_VALUE[right.rank] - RANK_VALUE[left.rank]);
  return sorted[3] ?? sorted[sorted.length - 1];
};

const outstandingTrumps = (context: PlayContext, trump: Suit): number => {
  const mine = bySuit(context.hand, trump).length;
  const partners = context.visiblePartner ? bySuit(context.visiblePartner, trump).length : 0;
  const gone = context.played.filter((card) => card.suit === trump).length;
  return Math.max(0, 13 - mine - partners - gone);
};

const chooseLead = (context: PlayContext, legal: Card[]): Card => {
  const trump = trumpSuit(context.strain);

  // Declarer draws trumps while the defenders still hold any.
  if (trump && context.isDeclarerSide && context.visiblePartner) {
    const myTrumps = bySuit(legal, trump);
    if (myTrumps.length > 0 && outstandingTrumps(context, trump) > 0) {
      return highestOf(myTrumps);
    }
  }

  const suit = longestSuit(legal, trump);
  const cards = bySuit(legal, suit);
  return topOfSequence(cards) ?? (cards.length >= 4 ? fourthBest(cards) : highestOf(cards));
};

const cheapestWinner = (winners: Card[]): Card => lowestOf(winners);

const discard = (context: PlayContext, legal: Card[]): Card => {
  const trump = trumpSuit(context.strain);
  const nonTrump = trump ? legal.filter((card) => card.suit !== trump) : legal;
  return lowestOf(nonTrump.length > 0 ? nonTrump : legal);
};

/**
 * Solid club-player fundamentals: draw trumps as declarer, win as cheaply as possible,
 * duck when partner already has the trick, and ruff rather than throw a winner away.
 */
export const chooseBridgeCard = (context: PlayContext): Card => {
  const legal = legalPlays(context.hand, context.trick);
  if (legal.length === 1) {
    return legal[0];
  }
  if (context.trick.cards.length === 0) {
    return chooseLead(context, legal);
  }

  const isLastToPlay = context.trick.cards.length === 3;
  const winners = legal.filter((card) => wouldWin(card, context));

  // No need to spend a card on a trick partner already owns.
  if (partnerIsWinning(context) && !(isLastToPlay && winners.length === 0)) {
    return discard(context, legal);
  }

  if (winners.length > 0) {
    if (isLastToPlay) {
      return cheapestWinner(winners);
    }
    // Second hand plays low unless the cheap winner is genuinely cheap.
    const cheap = cheapestWinner(winners);
    const secondHand = context.trick.cards.length === 1;
    if (secondHand && RANK_VALUE[cheap.rank] < RANK_VALUE['10']) {
      return cheap;
    }
    if (!secondHand) {
      return cheap;
    }
    return discard(context, legal);
  }

  return discard(context, legal);
};
