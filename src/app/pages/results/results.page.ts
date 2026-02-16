import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { GameEngineService } from '../../game/services/game-engine.service';
import { GameStateService } from '../../game/services/game-state.service';
import { scoreCard } from '../../game/services/scoring';

@Component({
  selector: 'app-results-page',
  standalone: true,
  imports: [],
  templateUrl: './results.page.html',
  styleUrl: './results.page.css'
})
export class ResultsPageComponent {
  private readonly gameEngine = inject(GameEngineService);
  private readonly gameState = inject(GameStateService);
  private readonly router = inject(Router);

  readonly state = this.gameState.state;
  readonly displayRound = computed(() => Math.max(1, this.state().round - 1));
  readonly playersByScore = computed(() =>
    [...this.state().players].sort((left, right) => left.score - right.score)
  );
  readonly thresholdReached = computed(() => this.state().players.some((player) => player.score >= GAME_END_SCORE));
  readonly gameStatus = computed(() => resolveGameStatus(this.state().players));
  readonly winnerNames = computed(() =>
    this.state()
      .players.filter((player) => this.gameStatus().winnerIds.includes(player.id))
      .map((player) => player.name)
  );
  readonly roundPoints = computed(() => {
    const taken = this.state().takenCards;
    const rules = this.state().rules;
    return this.state().players.reduce<Record<string, number>>((acc, player) => {
      acc[player.id] = (taken[player.id] ?? []).reduce((sum, card) => sum + scoreCard(card, rules), 0);
      return acc;
    }, {});
  });

  startNextRound(): void {
    if (this.gameStatus().isOver) {
      return;
    }
    this.gameEngine.startRound();
    void this.router.navigate(['/game']);
  }

  startNewGame(): void {
    this.gameState.reset();
    void this.router.navigate(['/game']);
  }
}

const GAME_END_SCORE = 100;

const resolveGameStatus = (players: Array<{ id: string; score: number }>): { isOver: boolean; winnerIds: string[] } => {
  const thresholdReached = players.some((player) => player.score >= GAME_END_SCORE);
  if (!thresholdReached) {
    return { isOver: false, winnerIds: [] };
  }

  const lowestScore = Math.min(...players.map((player) => player.score));
  const winners = players.filter((player) => player.score === lowestScore).map((player) => player.id);
  if (winners.length !== 1) {
    return { isOver: false, winnerIds: [] };
  }

  return { isOver: true, winnerIds: winners };
};
