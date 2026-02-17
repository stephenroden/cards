import { Injectable } from '@angular/core';
import { AiDecisionTrace, Card, GameRules, GameState, Player } from '../game.models';
import { AI_PROFILES, DEFAULT_PASS_TUNING } from './ai-profiles';
import { describeChoice } from './ai-decision-trace';
import { chooseRandomPassCards, chooseSharkPassCards, chooseSmartPassCards } from './ai-pass-selection';
import { AiStrategy } from './ai-strategy';
import { CardSharkStrategy, DumbStrategy, SmartStrategy } from './ai-play-strategies';

@Injectable({
  providedIn: 'root'
})
export class AiService {
  private readonly cardShark = new CardSharkStrategy();
  private readonly strategies: Record<string, AiStrategy> = {
    dumb: new DumbStrategy(),
    smart: new SmartStrategy(),
    'card-shark': this.cardShark
  };

  chooseCard(state: GameState, player: Player, legalCards: Card[]): Card {
    return this.chooseCardWithReason(state, player, legalCards).card;
  }

  chooseCardWithReason(state: GameState, player: Player, legalCards: Card[]): {
    card: Card;
    reason: string;
    trace: AiDecisionTrace;
  } {
    const profile = this.resolveProfile(player);
    let card: Card;
    if (profile.playStyle === 'card-shark') {
      card = this.cardShark.chooseCardWithProfile(state, player.id, legalCards, profile);
    } else {
      card = this.strategies[profile.playStyle].chooseCard(state, player.id, legalCards);
    }
    const trace = describeChoice(state, player, profile.label, legalCards, card);
    return { card, reason: trace.summary, trace };
  }

  choosePassCards(player: Player, count: number, rules: GameRules): Card[] {
    const profile = this.resolveProfile(player);
    const tuning = { ...DEFAULT_PASS_TUNING, ...(profile.passTuning ?? {}) };
    if (profile.passStyle === 'dumb') {
      return chooseRandomPassCards(player, count);
    }
    if (profile.passStyle === 'smart') {
      return chooseSmartPassCards(player, count, tuning, rules);
    }
    return chooseSharkPassCards(player, count, tuning, rules);
  }

  private resolveProfile(player: Player) {
    const profileId = player.aiProfileId ?? 'dumb';
    return AI_PROFILES[profileId] ?? AI_PROFILES['dumb'];
  }
}
