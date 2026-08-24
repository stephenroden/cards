import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BUILD_DATE } from '../../build-info';
import { BlackjackEngineService } from '../../blackjack/services/blackjack-engine.service';
import { GameStateService } from '../../game/services/game-state.service';
import { ThemeService } from '../../theme.service';

const JACK_OF_DIAMONDS_KEY = 'cards.game.hearts.rules.jack_of_diamonds_minus_10';
const DEBUG_AI_HISTORY_KEY = 'cards.game.hearts.rules.debug_ai_history';
const DEALER_HITS_SOFT_17_KEY = 'cards.game.blackjack.rules.dealer_hits_soft_17';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './home.page.html',
  styleUrl: './home.page.css'
})
export class HomePageComponent {
  private readonly gameState = inject(GameStateService);
  private readonly themeService = inject(ThemeService);
  private readonly blackjackEngine = inject(BlackjackEngineService);

  readonly jackOfDiamondsMinus10 = signal(false);
  readonly debugAiHistory = signal(true);
  readonly dealerHitsSoft17 = signal(false);
  readonly themes = this.themeService.options;
  readonly buildDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(BUILD_DATE));
  readonly selectedTheme = this.themeService.theme;

  constructor() {
    const saved = globalThis.localStorage?.getItem(JACK_OF_DIAMONDS_KEY);
    this.jackOfDiamondsMinus10.set(saved === '1');
    const debugSaved = globalThis.localStorage?.getItem(DEBUG_AI_HISTORY_KEY);
    this.debugAiHistory.set(debugSaved !== '0');
    this.dealerHitsSoft17.set(globalThis.localStorage?.getItem(DEALER_HITS_SOFT_17_KEY) === '1');

    if (globalThis.localStorage?.getItem('hearts.rules.jack_of_diamonds_minus_10') !== null) {
      globalThis.localStorage?.setItem(
        JACK_OF_DIAMONDS_KEY,
        globalThis.localStorage.getItem('hearts.rules.jack_of_diamonds_minus_10') === '1' ? '1' : '0'
      );
    }
    if (globalThis.localStorage?.getItem('hearts.rules.debug_ai_history') !== null) {
      globalThis.localStorage?.setItem(
        DEBUG_AI_HISTORY_KEY,
        globalThis.localStorage.getItem('hearts.rules.debug_ai_history') === '0' ? '0' : '1'
      );
    }
  }

  prepareHeartsGame(): void {
    const jdEnabled = this.jackOfDiamondsMinus10();
    const debugEnabled = this.debugAiHistory();
    globalThis.localStorage?.setItem(JACK_OF_DIAMONDS_KEY, jdEnabled ? '1' : '0');
    globalThis.localStorage?.setItem(DEBUG_AI_HISTORY_KEY, debugEnabled ? '1' : '0');
    this.gameState.reset({
      jackOfDiamondsMinus10: jdEnabled,
      debugAiHistory: debugEnabled
    });
  }

  prepareBlackjackGame(): void {
    const hitsSoft17 = this.dealerHitsSoft17();
    globalThis.localStorage?.setItem(DEALER_HITS_SOFT_17_KEY, hitsSoft17 ? '1' : '0');
    this.blackjackEngine.applyRules({ dealerHitsSoft17: hitsSoft17 });
  }

  setDealerHitsSoft17(enabled: boolean): void {
    this.dealerHitsSoft17.set(enabled);
  }

  setJackOfDiamondsMinus10(enabled: boolean): void {
    this.jackOfDiamondsMinus10.set(enabled);
  }

  setDebugAiHistory(enabled: boolean): void {
    this.debugAiHistory.set(enabled);
  }

  setTheme(themeId: string): void {
    const selected = this.themes.find((theme) => theme.id === themeId);
    if (!selected) {
      return;
    }
    this.themeService.setTheme(selected.id);
  }
}
