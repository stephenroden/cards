export const GAME_IDS = ['hearts', 'poker'] as const;

export type GameId = (typeof GAME_IDS)[number];

export const isGameId = (value: string | null | undefined): value is GameId =>
  value === 'hearts' || value === 'poker';
