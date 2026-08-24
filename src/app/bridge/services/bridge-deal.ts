import { Card, RANKS, SUITS, Suit } from '../../cards/card.models';
import { shuffle } from '../../poker/services/poker-utils';
import { Contract, Seat, Strain, partnerOf, partnershipOf } from '../bridge.models';
import { bySuit } from './bridge-rules';

const HIGH_CARD_POINTS: Partial<Record<Card['rank'], number>> = { A: 4, K: 3, Q: 2, J: 1 };

export const highCardPoints = (hand: Card[]): number =>
  hand.reduce((total, card) => total + (HIGH_CARD_POINTS[card.rank] ?? 0), 0);

export const buildDeck = (): Card[] => {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
};

export const dealHands = (deck: Card[] = shuffle(buildDeck())): Record<Seat, Card[]> => ({
  north: deck.slice(0, 13),
  east: deck.slice(13, 26),
  south: deck.slice(26, 39),
  west: deck.slice(39, 52)
});

/** The longest combined holding, which is a trump fit once the two hands hold eight between them. */
const bestFit = (left: Card[], right: Card[]): { suit: Suit; length: number } =>
  SUITS.map((suit) => ({ suit, length: bySuit(left, suit).length + bySuit(right, suit).length })).reduce(
    (best, current) => (current.length > best.length ? current : best)
  );

const levelForPoints = (points: number, strain: Strain): number => {
  if (points >= 33) {
    return 7;
  }
  if (points >= 30) {
    return 6;
  }
  if (points >= 25) {
    return strain === 'notrump' ? 3 : strain === 'clubs' || strain === 'diamonds' ? 5 : 4;
  }
  if (points >= 22) {
    return 3;
  }
  return points >= 19 ? 2 : 1;
};

/**
 * Stands in for the auction until bidding lands: whichever partnership holds the values
 * declares, at a level their combined points can reasonably support.
 */
export const suggestContract = (hands: Record<Seat, Card[]>): Contract => {
  const nsPoints = highCardPoints(hands.north) + highCardPoints(hands.south);
  const ewPoints = highCardPoints(hands.east) + highCardPoints(hands.west);
  const northSouthDeclares = nsPoints >= ewPoints;

  const [one, two]: Seat[] = northSouthDeclares ? ['south', 'north'] : ['east', 'west'];
  const fit = bestFit(hands[one], hands[two]);
  const strain: Strain = fit.length >= 8 ? fit.suit : 'notrump';
  const points = northSouthDeclares ? nsPoints : ewPoints;

  // The human always declares for their own side so that they never sit out as dummy.
  const declarer = northSouthDeclares
    ? 'south'
    : highCardPoints(hands.east) >= highCardPoints(hands.west)
      ? 'east'
      : 'west';

  return { level: levelForPoints(points, strain), strain, declarer, risk: 'none' };
};

export const dummyFor = (declarer: Seat): Seat => partnerOf(declarer);

export const declaringSide = (contract: Contract) => partnershipOf(contract.declarer);
