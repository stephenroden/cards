import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GameStateService } from '../../game/services/game-state.service';

const JACK_OF_DIAMONDS_KEY = 'hearts.rules.jack_of_diamonds_minus_10';
const DEBUG_AI_HISTORY_KEY = 'hearts.rules.debug_ai_history';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './home.page.html',
  styleUrl: './home.page.css'
})
export class HomePageComponent {
  private readonly gameState = inject(GameStateService);
  readonly jackOfDiamondsMinus10 = signal(false);
  readonly debugAiHistory = signal(true);

  constructor() {
    const saved = globalThis.localStorage?.getItem(JACK_OF_DIAMONDS_KEY);
    this.jackOfDiamondsMinus10.set(saved === '1');
    const debugSaved = globalThis.localStorage?.getItem(DEBUG_AI_HISTORY_KEY);
    this.debugAiHistory.set(debugSaved !== '0');
  }

  startGame(): void {
    const jdEnabled = this.jackOfDiamondsMinus10();
    const debugEnabled = this.debugAiHistory();
    globalThis.localStorage?.setItem(JACK_OF_DIAMONDS_KEY, jdEnabled ? '1' : '0');
    globalThis.localStorage?.setItem(DEBUG_AI_HISTORY_KEY, debugEnabled ? '1' : '0');
    this.gameState.reset({
      jackOfDiamondsMinus10: jdEnabled,
      debugAiHistory: debugEnabled
    });
  }

  setJackOfDiamondsMinus10(enabled: boolean): void {
    this.jackOfDiamondsMinus10.set(enabled);
  }

  setDebugAiHistory(enabled: boolean): void {
    this.debugAiHistory.set(enabled);
  }
}
