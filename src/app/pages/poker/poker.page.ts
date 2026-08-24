import { Component, computed, effect, inject } from '@angular/core';
import { TitleCasePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Card } from '../../cards/card.models';
import { cardImage } from '../../poker/services/poker-utils';
import { PokerActionType, PokerPlayer } from '../../poker/poker.models';
import { PokerEngineService } from '../../poker/services/poker-engine.service';
import { PokerStateService } from '../../poker/services/poker-state.service';

@Component({
  selector: 'app-poker-page',
  standalone: true,
  imports: [RouterLink, TitleCasePipe],
  templateUrl: './poker.page.html',
  styleUrl: './poker.page.css'
})
export class PokerPageComponent {
  private readonly engine = inject(PokerEngineService);
  private readonly pokerState = inject(PokerStateService);
  private readonly router = inject(Router);
  private navigatedSummaryHand = -1;
  readonly boardSlots = [0, 1, 2, 3, 4] as const;

  readonly state = this.pokerState.state;
  readonly actingPlayer = computed(() => this.state().players[this.state().actingIndex]);
  readonly human = computed(() => this.state().players.find((player) => player.type === 'human'));
  readonly legalActions = computed(() => {
    const player = this.actingPlayer();
    if (!player || player.type !== 'human') {
      return [] as PokerActionType[];
    }
    return this.engine.legalActions(this.state(), player);
  });
  readonly pot = computed(() => this.state().players.reduce((sum, player) => sum + player.totalCommitted, 0));
  readonly visiblePlayers = computed(() => this.state().players.filter((player) => !player.eliminated || player.type === 'human'));
  readonly seatMap = computed(() => {
    const players = this.visiblePlayers();
    return {
      north: players.find((player) => player.id === 'p2') ?? null,
      west: players.find((player) => player.id === 'p3') ?? null,
      east: players.find((player) => player.id === 'p4') ?? null,
      south: players.find((player) => player.type === 'human') ?? null
    } satisfies Record<'north' | 'west' | 'east' | 'south', PokerPlayer | null>;
  });
  readonly callAmount = computed(() => {
    const player = this.actingPlayer();
    if (!player) {
      return 0;
    }
    return Math.max(0, this.state().currentBet - player.currentBet);
  });
  readonly inActionPhase = computed(() => {
    const phase = this.state().phase;
    return phase === 'preflop' || phase === 'flop' || phase === 'turn' || phase === 'river';
  });
  readonly expectationText = computed(() => {
    const phase = this.state().phase;
    if (phase === 'session-over') {
      return 'Session complete. Start a new session to play again.';
    }
    if (phase === 'hand-summary' || phase === 'showdown') {
      return 'Hand complete. Review stacks, then deal the next hand.';
    }

    const player = this.actingPlayer();
    if (!player) {
      return 'Waiting for game state.';
    }
    if (player.type !== 'human') {
      return `Waiting for ${player.name} to act.`;
    }

    const toCall = this.callAmount();
    if (toCall === 0) {
      return 'Your turn: you can check to stay in for free, or bet to apply pressure.';
    }
    return `Your turn: match ${toCall} chips to continue (call), raise if strong, or fold.`;
  });

  constructor() {
    effect(() => {
      if (this.state().handNumber === 0 && this.state().actionHistory.length === 0 && this.state().communityCards.length === 0) {
        this.engine.startSession();
      }
    });

    effect(() => {
      const phase = this.state().phase;
      const handNumber = this.state().handNumber;
      if ((phase === 'hand-summary' || phase === 'session-over') && this.navigatedSummaryHand !== handNumber) {
        this.navigatedSummaryHand = handNumber;
        void this.router.navigate(['/results/poker']);
      }
    });
  }

  play(action: PokerActionType): void {
    this.engine.playHumanAction(action);
  }

  playerForSeat(seat: 'north' | 'west' | 'east' | 'south'): PokerPlayer | null {
    return this.seatMap()[seat];
  }

  playerStatus(player: PokerPlayer): string {
    if (player.folded) {
      return 'Folded';
    }
    if (player.allIn) {
      return 'All-in';
    }
    if (this.actingPlayer().id === player.id && this.inActionPhase()) {
      return 'Acting';
    }
    return `${player.totalCommitted} in`;
  }

  playerBadgeDetail(player: PokerPlayer): string {
    if (player.folded) {
      return 'Folded';
    }
    if (player.allIn) {
      return 'All-in';
    }
    if (this.actingPlayer().id === player.id && this.inActionPhase()) {
      return 'Thinking';
    }

    const lastAction = [...this.state().actionHistory].reverse().find((action) => action.playerId === player.id);
    if (lastAction) {
      if (lastAction.type === 'call') {
        return 'Called';
      }
      if (lastAction.type === 'check') {
        return 'Checked';
      }
      if (lastAction.type === 'fold') {
        return 'Folded';
      }
      if (lastAction.type === 'bet') {
        return 'Bet';
      }
      return 'Raised';
    }

    return player.totalCommitted > 0 ? `${player.totalCommitted} in` : 'Waiting';
  }

  emptyBoardSlots(): number[] {
    return this.boardSlots.slice(this.state().communityCards.length);
  }

  revealOpponentCards(player: PokerPlayer): boolean {
    return player.type === 'cpu' && this.showCards(player.id);
  }

  nextHand(): void {
    this.engine.startNextHand();
  }

  newSession(): void {
    this.engine.startSession();
  }

  showCards(playerId: string): boolean {
    const player = this.state().players.find((current) => current.id === playerId);
    if (!player) {
      return false;
    }
    return player.type === 'human' || this.state().phase === 'showdown' || this.state().phase === 'hand-summary' || this.state().phase === 'session-over';
  }

  can(action: PokerActionType): boolean {
    return this.legalActions().includes(action);
  }

  actionHint(action: PokerActionType): string {
    const toCall = this.callAmount();
    if (action === 'fold') {
      return 'Leave this hand and forfeit chips already committed.';
    }
    if (action === 'check') {
      return 'Pass action without adding chips (only when no bet to call).';
    }
    if (action === 'call') {
      return `Match the current bet by adding ${toCall} chips.`;
    }
    if (action === 'bet') {
      return 'Open the betting for this round at the fixed limit amount.';
    }
    return 'Increase the current bet by one fixed-limit step.';
  }

  cardImage(card: Card): string {
    return cardImage(card);
  }
}
