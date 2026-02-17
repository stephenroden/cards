import { Card, GameRules, Player } from '../game.models';
import { PassTuning } from './ai-profiles';

const rankOrder: Record<Card['rank'], number> = {
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

export const chooseSmartPassCards = (player: Player, count: number, tuning: PassTuning, rules: GameRules): Card[] =>
  [...player.hand]
    .sort((a, b) => passScore(b, tuning, rules) - passScore(a, tuning, rules))
    .slice(0, count);

export const chooseSharkPassCards = (player: Player, count: number, tuning: PassTuning, rules: GameRules): Card[] =>
  [...player.hand]
    .sort((a, b) => sharkPassScore(player.hand, b, tuning, rules) - sharkPassScore(player.hand, a, tuning, rules))
    .slice(0, count);

export const chooseRandomPassCards = (player: Player, count: number): Card[] => shuffle(player.hand).slice(0, count);

const passScore = (card: Card, tuning: PassTuning, rules: GameRules): number => {
  if (isJackDiamondsBonus(card, rules)) {
    return -200;
  }
  if (card.suit === 'spades' && card.rank === 'Q') {
    return tuning.queenSpades;
  }
  if (card.suit === 'spades' && card.rank === 'A') {
    return tuning.aceSpades;
  }
  if (card.suit === 'spades' && card.rank === 'K') {
    return tuning.kingSpades;
  }
  if (card.suit === 'hearts') {
    return tuning.heartBase + rankOrder[card.rank];
  }
  if (card.rank === 'A' || card.rank === 'K') {
    return tuning.honorBase + rankOrder[card.rank];
  }
  return rankOrder[card.rank] / 2;
};

const sharkPassScore = (hand: Card[], card: Card, tuning: PassTuning, rules: GameRules): number => {
  const suitCount = hand.filter((held) => held.suit === card.suit).length;
  const voidBonus = suitCount <= 3 ? (4 - suitCount) * tuning.voidBonusPerMissingCard : 0;
  return passScore(card, tuning, rules) + voidBonus;
};

const isJackDiamondsBonus = (card: Card, rules: GameRules): boolean =>
  rules.jackOfDiamondsMinus10 && card.suit === 'diamonds' && card.rank === 'J';

const shuffle = (cards: Card[]): Card[] => {
  const copy = cards.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
};
