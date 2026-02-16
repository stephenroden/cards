import { Injectable } from '@angular/core';
import { Card, GameState, Player, Rank, Suit } from '../game.models';

@Injectable({
  providedIn: 'root'
})
export class RulesService {
  private readonly rankOrder: Record<Rank, number> = {
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

  isLegalPlay(state: GameState, player: Player, card: Card): boolean {
    return this.getLegalPlays(state, player).some((legal) => this.sameCard(legal, card));
  }

  getLegalPlays(state: GameState, player: Player): Card[] {
    if (player.hand.length === 0) {
      return [];
    }

    const isLeading = state.trick.cards.length === 0;
    const firstTrick = this.isFirstTrick(player);
    const leadSuit = state.trick.cards[0]?.card.suit;
    const hasLeadSuit = leadSuit ? player.hand.some((card) => card.suit === leadSuit) : false;

    if (!isLeading && leadSuit && hasLeadSuit) {
      return player.hand.filter((card) => card.suit === leadSuit);
    }

    if (firstTrick && !isLeading) {
      const nonPoint = player.hand.filter((card) => !this.isPointCard(card));
      return nonPoint.length > 0 ? nonPoint : player.hand.slice();
    }

    if (isLeading) {
      if (firstTrick) {
        const twoClubs = player.hand.find((card) => card.suit === 'clubs' && card.rank === '2');
        return twoClubs ? [twoClubs] : player.hand.slice();
      }

      if (!state.heartsBroken) {
        const nonHearts = player.hand.filter((card) => card.suit !== 'hearts');
        return nonHearts.length > 0 ? nonHearts : player.hand.slice();
      }
    }

    return player.hand.slice();
  }

  getTrickWinner(state: GameState): string | null {
    if (state.trick.cards.length === 0) {
      return null;
    }

    const leadSuit = state.trick.cards[0].card.suit;
    return state.trick.cards.reduce((winner, current) => {
      if (current.card.suit !== leadSuit) {
        return winner;
      }
      const winnerRank = this.rankOrder[winner.card.rank];
      const currentRank = this.rankOrder[current.card.rank];
      return currentRank > winnerRank ? current : winner;
    }).playerId;
  }

  private isFirstTrick(player: Player): boolean {
    return player.hand.length === 13;
  }

  private isPointCard(card: Card): boolean {
    return card.suit === 'hearts' || (card.suit === 'spades' && card.rank === 'Q');
  }

  private sameCard(a: Card, b: Card): boolean {
    return a.suit === b.suit && a.rank === b.rank;
  }
}
