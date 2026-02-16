import { Card, GameState } from '../game.models';

export interface AiStrategy {
  chooseCard(state: GameState, playerId: string, legalCards: Card[]): Card;
}
