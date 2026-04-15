import { Card, Rank, Suit } from '../../game/game.models';

interface RankedCard {
  rank: number;
  suit: Suit;
}

export interface HandValue {
  category: number;
  tiebreakers: number[];
}

export interface EvaluatedPokerHand extends HandValue {
  cards: Card[];
  label: string;
}

const rankValue: Record<Rank, number> = {
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

const combinations = <T>(items: T[], size: number): T[][] => {
  const result: T[][] = [];
  const walk = (start: number, combo: T[]): void => {
    if (combo.length === size) {
      result.push(combo.slice());
      return;
    }
    for (let index = start; index < items.length; index += 1) {
      combo.push(items[index]);
      walk(index + 1, combo);
      combo.pop();
    }
  };
  walk(0, []);
  return result;
};

const compareValues = (left: HandValue, right: HandValue): number => {
  if (left.category !== right.category) {
    return left.category - right.category;
  }
  const length = Math.max(left.tiebreakers.length, right.tiebreakers.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (left.tiebreakers[index] ?? 0) - (right.tiebreakers[index] ?? 0);
    if (delta !== 0) {
      return delta;
    }
  }
  return 0;
};

const categoryLabel = (category: number): string => {
  if (category === 8) {
    return 'Straight Flush';
  }
  if (category === 7) {
    return 'Four of a Kind';
  }
  if (category === 6) {
    return 'Full House';
  }
  if (category === 5) {
    return 'Flush';
  }
  if (category === 4) {
    return 'Straight';
  }
  if (category === 3) {
    return 'Three of a Kind';
  }
  if (category === 2) {
    return 'Two Pair';
  }
  if (category === 1) {
    return 'One Pair';
  }
  return 'High Card';
};

const evaluateFive = (cards: RankedCard[]): HandValue => {
  const sorted = [...cards].sort((a, b) => b.rank - a.rank);
  const byRank = new Map<number, number>();
  for (const card of sorted) {
    byRank.set(card.rank, (byRank.get(card.rank) ?? 0) + 1);
  }

  const rankGroups = [...byRank.entries()].sort((a, b) => {
    if (b[1] !== a[1]) {
      return b[1] - a[1];
    }
    return b[0] - a[0];
  });

  const isFlush = sorted.every((card) => card.suit === sorted[0].suit);
  const uniqueRanksDesc = [...new Set(sorted.map((card) => card.rank))].sort((a, b) => b - a);

  let straightHigh = 0;
  if (uniqueRanksDesc.length === 5) {
    const high = uniqueRanksDesc[0];
    const low = uniqueRanksDesc[4];
    if (high - low === 4) {
      straightHigh = high;
    }
    if (uniqueRanksDesc.join(',') === '14,5,4,3,2') {
      straightHigh = 5;
    }
  }

  if (isFlush && straightHigh > 0) {
    return { category: 8, tiebreakers: [straightHigh] };
  }
  if (rankGroups[0][1] === 4) {
    return { category: 7, tiebreakers: [rankGroups[0][0], rankGroups[1][0]] };
  }
  if (rankGroups[0][1] === 3 && rankGroups[1][1] === 2) {
    return { category: 6, tiebreakers: [rankGroups[0][0], rankGroups[1][0]] };
  }
  if (isFlush) {
    return { category: 5, tiebreakers: sorted.map((card) => card.rank) };
  }
  if (straightHigh > 0) {
    return { category: 4, tiebreakers: [straightHigh] };
  }
  if (rankGroups[0][1] === 3) {
    const kickers = rankGroups.slice(1).map((entry) => entry[0]).sort((a, b) => b - a);
    return { category: 3, tiebreakers: [rankGroups[0][0], ...kickers] };
  }
  if (rankGroups[0][1] === 2 && rankGroups[1][1] === 2) {
    const highPair = Math.max(rankGroups[0][0], rankGroups[1][0]);
    const lowPair = Math.min(rankGroups[0][0], rankGroups[1][0]);
    const kicker = rankGroups[2][0];
    return { category: 2, tiebreakers: [highPair, lowPair, kicker] };
  }
  if (rankGroups[0][1] === 2) {
    const kickers = rankGroups.slice(1).map((entry) => entry[0]).sort((a, b) => b - a);
    return { category: 1, tiebreakers: [rankGroups[0][0], ...kickers] };
  }
  return { category: 0, tiebreakers: sorted.map((card) => card.rank) };
};

export const evaluateBestHand = (cards: Card[]): EvaluatedPokerHand => {
  const all = combinations(cards, 5);
  return all.reduce<EvaluatedPokerHand>(
    (best, combo) => {
      const nextValue = evaluateFive(combo.map((card) => ({ rank: rankValue[card.rank], suit: card.suit })));
      return compareValues(nextValue, best) > 0
        ? {
            ...nextValue,
            cards: combo,
            label: categoryLabel(nextValue.category)
          }
        : best;
    },
    { category: -1, tiebreakers: [], cards: [], label: '' }
  );
};

export const compareHands = (left: Card[], right: Card[]): number =>
  compareValues(evaluateBestHand(left), evaluateBestHand(right));

export const handStrengthScore = (cards: Card[]): number => {
  const value = evaluateBestHand(cards);
  const categoryBase = value.category / 8;
  const tiebreak = value.tiebreakers.reduce((sum, rank, index) => sum + rank / Math.pow(15, index + 1), 0);
  return categoryBase + Math.min(0.99, tiebreak / 3);
};
