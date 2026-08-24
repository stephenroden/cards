import { Injectable } from '@angular/core';
import { Card } from '../../cards/card.models';
import { handStrengthScore } from './poker-hand-evaluator';
import { PokerActionType, PokerPlayer, PokerState } from '../poker.models';

export interface PokerDecision {
  type: PokerActionType;
  reason: string;
}

@Injectable({
  providedIn: 'root'
})
export class PokerAiService {
  chooseAction(state: PokerState, player: PokerPlayer): PokerDecision {
    const toCall = Math.max(0, state.currentBet - player.currentBet);
    const cards = [...player.hand, ...state.communityCards];
    const strength = this.estimateStrength(player.hand, cards, state.communityCards.length);
    const canRaise = state.raiseCount < state.maxRaises && player.stack > toCall;

    const tightness = player.profile === 'loose-aggressive' ? 0.45 : player.profile === 'tight-passive' ? 0.72 : 0.62;
    const aggression = player.profile === 'tight-passive' ? 0.28 : player.profile === 'tight-aggressive' ? 0.68 : 0.81;
    const pressure = toCall / Math.max(1, player.stack);
    const adjusted = strength - pressure * 0.4;

    if (toCall > 0) {
      if (adjusted < tightness - 0.28) {
        return { type: 'fold', reason: 'Low strength facing pressure.' };
      }
      if (canRaise && adjusted > tightness + aggression * 0.22) {
        return { type: 'raise', reason: 'Strong hand with positive aggression threshold.' };
      }
      return { type: 'call', reason: 'Continue with adequate pot-odds profile.' };
    }

    if (canRaise && adjusted > tightness + aggression * 0.18) {
      return { type: state.currentBet === 0 ? 'bet' : 'raise', reason: 'Initiate pressure from relative strength.' };
    }

    return { type: 'check', reason: 'Pot control with medium or weak equity.' };
  }

  private estimateStrength(holeCards: Card[], visibleCards: Card[], boardSize: number): number {
    if (boardSize === 0) {
      return this.preflopStrength(holeCards);
    }
    return handStrengthScore(visibleCards);
  }

  private preflopStrength(holeCards: Card[]): number {
    const [a, b] = holeCards;
    const rankValue = (rank: Card['rank']): number => {
      if (rank === 'A') {
        return 14;
      }
      if (rank === 'K') {
        return 13;
      }
      if (rank === 'Q') {
        return 12;
      }
      if (rank === 'J') {
        return 11;
      }
      return Number(rank);
    };

    const left = rankValue(a.rank);
    const right = rankValue(b.rank);
    const high = Math.max(left, right);
    const low = Math.min(left, right);
    const pairBonus = a.rank === b.rank ? 0.28 + high / 40 : 0;
    const suitedBonus = a.suit === b.suit ? 0.08 : 0;
    const connectorBonus = Math.abs(left - right) === 1 ? 0.05 : 0;
    return Math.min(0.95, (high + low) / 30 + pairBonus + suitedBonus + connectorBonus);
  }
}
