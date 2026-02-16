import { Card, GameRules } from '../game.models';

export const MOON_POINTS = 26;

export const scoreCard = (card: Card, rules: GameRules): number => {
  if (card.suit === 'hearts') {
    return 1;
  }
  if (card.suit === 'spades' && card.rank === 'Q') {
    return 13;
  }
  if (rules.jackOfDiamondsMinus10 && card.suit === 'diamonds' && card.rank === 'J') {
    return -10;
  }
  return 0;
};

export const penaltyScoreCard = (card: Card): number => {
  if (card.suit === 'hearts') {
    return 1;
  }
  if (card.suit === 'spades' && card.rank === 'Q') {
    return 13;
  }
  return 0;
};

export const isDangerCard = (card: Card, rules: GameRules): boolean => scoreCard(card, rules) > 0;

export const hasJackOfDiamonds = (cards: Card[], rules: GameRules): boolean =>
  rules.jackOfDiamondsMinus10 && cards.some((card) => card.suit === 'diamonds' && card.rank === 'J');
