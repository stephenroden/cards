import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Card } from '../../game/game.models';
import { scoreCard } from '../../game/services/scoring';
import { GameEngineService } from '../../game/services/game-engine.service';
import { GameStateService } from '../../game/services/game-state.service';
import { GameId, isGameId } from '../../games/game-pack.models';
import { evaluateBestHand } from '../../poker/services/poker-hand-evaluator';
import { PokerEngineService } from '../../poker/services/poker-engine.service';
import { PokerStateService } from '../../poker/services/poker-state.service';
import { cardImage } from '../../poker/services/poker-utils';

@Component({
  selector: 'app-results-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './results.page.html',
  styleUrl: './results.page.css'
})
export class ResultsPageComponent {
  private readonly gameEngine = inject(GameEngineService);
  private readonly gameState = inject(GameStateService);
  private readonly pokerEngine = inject(PokerEngineService);
  private readonly pokerState = inject(PokerStateService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly gameId = computed<GameId>(() => {
    const value = this.route.snapshot.paramMap.get('gameId');
    return isGameId(value) ? value : 'hearts';
  });

  readonly heartsState = this.gameState.state;
  readonly poker = this.pokerState.state;

  readonly displayRound = computed(() => Math.max(1, this.heartsState().round - 1));
  readonly playersByScore = computed(() => [...this.heartsState().players].sort((left, right) => left.score - right.score));
  readonly thresholdReached = computed(() => this.heartsState().players.some((player) => player.score >= GAME_END_SCORE));
  readonly gameStatus = computed(() => resolveGameStatus(this.heartsState().players));
  readonly winnerNames = computed(() =>
    this.heartsState()
      .players.filter((player) => this.gameStatus().winnerIds.includes(player.id))
      .map((player) => player.name)
  );
  readonly roundPoints = computed(() => {
    const taken = this.heartsState().takenCards;
    const rules = this.heartsState().rules;
    return this.heartsState().players.reduce<Record<string, number>>((acc, player) => {
      acc[player.id] = (taken[player.id] ?? []).reduce((sum, card) => sum + scoreCard(card, rules), 0);
      return acc;
    }, {});
  });

  readonly pokerByStack = computed(() => [...this.poker().players].sort((left, right) => right.stack - left.stack));
  readonly pokerWinnerName = computed(() => {
    const winner = this.poker().players.find((player) => this.poker().winners.includes(player.id));
    return winner?.name;
  });
  readonly pokerShowdownRows = computed(() => {
    const state = this.poker();
    const board = state.communityCards;
    return state.players
      .filter((player) => player.hand.length === 2)
      .map((player) => {
        const evaluation = evaluateBestHand([...player.hand, ...board]);
        const usedKeys = new Set(evaluation.cards.map(cardKey));
        return {
          player,
          evaluation,
          isWinner: state.winners.includes(player.id),
          isFolded: player.folded,
          net: state.lastHandNet[player.id] ?? 0,
          usedKeys
        };
      })
      .sort((left, right) => {
        if (left.isWinner !== right.isWinner) {
          return left.isWinner ? -1 : 1;
        }
        if (left.net !== right.net) {
          return right.net - left.net;
        }
        if (left.isFolded !== right.isFolded) {
          return left.isFolded ? 1 : -1;
        }
        return right.player.stack - left.player.stack;
      });
  });
  readonly pokerByResult = computed(() =>
    [...this.poker().players].sort((left, right) => {
      const leftNet = this.poker().lastHandNet[left.id] ?? 0;
      const rightNet = this.poker().lastHandNet[right.id] ?? 0;
      if (leftNet !== rightNet) {
        return rightNet - leftNet;
      }
      return right.stack - left.stack;
    })
  );

  startNextRound(): void {
    if (this.gameId() === 'poker') {
      this.pokerEngine.startNextHand();
      void this.router.navigate(['/game/poker']);
      return;
    }

    if (this.gameStatus().isOver) {
      return;
    }
    this.gameEngine.startRound();
    void this.router.navigate(['/game/hearts']);
  }

  startNewGame(): void {
    if (this.gameId() === 'poker') {
      this.pokerEngine.startSession();
      void this.router.navigate(['/game/poker']);
      return;
    }

    this.gameState.reset(this.heartsState().rules);
    void this.router.navigate(['/game/hearts']);
  }

  cardImage(card: Card): string {
    return cardImage(card);
  }

  isUsedInBestHand(row: { usedKeys: Set<string> }, card: Card): boolean {
    return row.usedKeys.has(cardKey(card));
  }

  formatChipDelta(amount: number): string {
    if (amount > 0) {
      return `+${amount}`;
    }
    return `${amount}`;
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

const cardKey = (card: Card): string => `${card.rank}-${card.suit}`;
