import { Card, GameRules, Player } from '../game.models';

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

export const applyRoundScores = (
  players: Player[],
  takenCards: Record<string, Card[]>,
  rules: GameRules
): Player[] => {
  const totals = players.reduce<Record<string, number>>((acc, player) => {
    acc[player.id] = (takenCards[player.id] ?? []).reduce((points, card) => points + scoreCard(card, rules), 0);
    return acc;
  }, {});

  const penaltyTotals = players.reduce<Record<string, number>>((acc, player) => {
    acc[player.id] = (takenCards[player.id] ?? []).reduce((points, card) => points + penaltyScoreCard(card), 0);
    return acc;
  }, {});

  const moonShooter = Object.entries(penaltyTotals).find(([, points]) => points === MOON_POINTS);
  return players.map((player) => {
    const roundPoints = totals[player.id] ?? 0;
    const jdAdjustment = roundPoints - (penaltyTotals[player.id] ?? 0);
    const finalPoints = moonShooter
      ? (player.id === moonShooter[0] ? 0 : MOON_POINTS) + jdAdjustment
      : roundPoints;
    return { ...player, score: player.score + finalPoints };
  });
};
