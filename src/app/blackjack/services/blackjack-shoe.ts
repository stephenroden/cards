import { Card, RANKS, SUITS } from '../../game/game.models';
import { shuffle } from '../../poker/services/poker-utils';

/** Fraction of the shoe dealt before it is reshuffled. */
export const SHOE_PENETRATION = 0.75;

export const buildShoe = (deckCount: number): Card[] => {
  const shoe: Card[] = [];
  for (let deck = 0; deck < deckCount; deck += 1) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        shoe.push({ suit, rank });
      }
    }
  }
  return shuffle(shoe);
};

export const shoeSize = (deckCount: number): number => deckCount * 52;

export const needsReshuffle = (shoe: Card[], deckCount: number): boolean =>
  shoe.length <= shoeSize(deckCount) * (1 - SHOE_PENETRATION);
