import { Card, GameState, Player } from '../game.models';

export const getPassDirection = (round: number): GameState['passDirection'] => {
  const cycle = (round - 1) % 4;
  if (cycle === 0) {
    return 'left';
  }
  if (cycle === 1) {
    return 'right';
  }
  if (cycle === 2) {
    return 'across';
  }
  return 'none';
};

export const applyPasses = (
  players: Player[],
  selections: Record<string, Card[]>,
  direction: GameState['passDirection']
): { players: Player[]; transfers: GameState['passTransfers'] } => {
  if (direction === 'none') {
    return { players, transfers: [] };
  }

  const ids = players.map((player) => player.id);
  const nextIndex = (index: number): number => {
    if (direction === 'left') {
      return (index + 1) % ids.length;
    }
    if (direction === 'right') {
      return (index - 1 + ids.length) % ids.length;
    }
    return (index + 2) % ids.length;
  };

  const received: Record<string, Card[]> = {};
  const transfers: GameState['passTransfers'] = [];
  players.forEach((player, index) => {
    const targetId = ids[nextIndex(index)];
    const cards = selections[player.id] ?? [];
    received[targetId] = [...(received[targetId] ?? []), ...cards];
    transfers.push({ fromId: player.id, toId: targetId, cards });
  });

  const updatedPlayers = players.map((player) => {
    const removed = selections[player.id] ?? [];
    const remaining = player.hand.filter((card) => !removed.some((pass) => sameCard(pass, card)));
    return {
      ...player,
      hand: [...remaining, ...(received[player.id] ?? [])]
    };
  });

  return { players: updatedPlayers, transfers };
};

export const sameCard = (a: Card, b: Card): boolean => a.suit === b.suit && a.rank === b.rank;

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

export const nextTurnPlayerId = (players: Player[], currentId: string, fallbackId: string): string => {
  const ids = players.map((player) => player.id);
  const index = ids.indexOf(currentId);
  if (index === -1) {
    return fallbackId;
  }
  return ids[(index + 1) % ids.length];
};
