export const GAME_IDS = ['hearts', 'poker', 'blackjack', 'bridge'] as const;

export type GameId = (typeof GAME_IDS)[number];

export const isGameId = (value: string | null | undefined): value is GameId =>
  GAME_IDS.includes(value as GameId);
