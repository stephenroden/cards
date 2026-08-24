import { Card, RANKS, SUITS } from '../../cards/card.models';
export const buildDeck = (): Card[] => {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
};

export const shuffle = <T>(items: T[]): T[] => {
  const copy = items.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
};

export const cardLabel = (card: Card): string => `${card.rank}${suitGlyph(card.suit)}`;

export const suitGlyph = (suit: Card['suit']): string => {
  if (suit === 'clubs') {
    return '♣';
  }
  if (suit === 'diamonds') {
    return '♦';
  }
  if (suit === 'hearts') {
    return '♥';
  }
  return '♠';
};

export const cardImage = (card: Card): string => {
  const suitName =
    card.suit === 'clubs' ? 'club' : card.suit === 'diamonds' ? 'diamond' : card.suit === 'hearts' ? 'heart' : 'spade';
  return `cards/${suitName}_${card.rank}.svg`;
};
