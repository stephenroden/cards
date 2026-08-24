import { Card } from '../../cards/card.models';
import { GameState } from '../hearts.models';
export interface AiStrategy {
  chooseCard(state: GameState, playerId: string, legalCards: Card[]): Card;
}
