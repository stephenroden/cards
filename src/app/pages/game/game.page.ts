import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Card, Player } from '../../game/game.models';
import { GameEngineService } from '../../game/services/game-engine.service';
import { GameStateService } from '../../game/services/game-state.service';
import { RulesService } from '../../game/services/rules.service';
import { scoreCard } from '../../game/services/scoring';
import { GameDebugEntry, GameDebugPanelComponent } from './components/game-debug-panel/game-debug-panel.component';
import { GamePlayerChipComponent } from './components/game-player-chip/game-player-chip.component';
import {
  cardImage as getCardImage,
  findNewCards,
  passSourcePlayerId,
  passTargetPlayerId,
  playerForSeat as resolvePlayerForSeat,
  seatForPlayer,
  sortCards,
  suitSymbol as getSuitSymbol
} from './game-page.utils';

@Component({
  selector: 'app-game-page',
  standalone: true,
  imports: [RouterLink, GameDebugPanelComponent, GamePlayerChipComponent],
  templateUrl: './game.page.html',
  styleUrl: './game.page.css',
  host: {
    class: 'game-page'
  }
})
export class GamePageComponent {
  private readonly gameEngine = inject(GameEngineService);
  private readonly gameState = inject(GameStateService);
  private readonly rules = inject(RulesService);
  private readonly router = inject(Router);

  readonly state = this.gameState.state;
  readonly selectedPassCards = signal<Card[]>([]);
  readonly isPassing = signal(false);
  readonly receivedCards = signal<Card[]>([]);
  readonly passingCards = signal<Card[]>([]);
  readonly hidePassedCards = signal(false);
  readonly debugPanelOpen = signal(false);
  readonly humanPlayer = computed(() => this.state().players.find((player) => player.type === 'human'));
  readonly humanHand = computed(() => sortCards(this.humanPlayer()?.hand ?? []));
  readonly displayedHand = computed(() => {
    const hand = this.humanHand();
    if (this.state().phase !== 'pass' || !this.hidePassedCards()) {
      return hand;
    }
    const passing = this.passingCards();
    if (passing.length === 0) {
      return hand;
    }
    return hand.filter((card) => !passing.some((held) => held.suit === card.suit && held.rank === card.rank));
  });
  readonly currentPlayer = computed(() =>
    this.state().players.find((player) => player.id === this.state().turnPlayerId)
  );
  readonly roundPoints = computed(() => {
    const taken = this.state().takenCards;
    const rules = this.state().rules;
    return this.state().players.reduce<Record<string, number>>((acc, player) => {
      acc[player.id] = (taken[player.id] ?? []).reduce((sum, card) => sum + scoreCard(card, rules), 0);
      return acc;
    }, {});
  });
  readonly legalPlays = computed(() => {
    const player = this.currentPlayer();
    if (!player || player.type !== 'human') {
      return [];
    }
    return sortCards(this.rules.getLegalPlays(this.state(), player));
  });
  readonly showTwoClubsPrompt = computed(() => {
    if (this.state().phase !== 'play') {
      return false;
    }
    const player = this.currentPlayer();
    if (!player || player.type !== 'human') {
      return false;
    }
    const legal = this.legalPlays();
    return legal.length === 1 && legal[0].suit === 'clubs' && legal[0].rank === '2';
  });
  readonly passDirectionArrow = computed(() => {
    switch (this.state().passDirection) {
      case 'left':
        return '⟵';
      case 'right':
        return '⟶';
      case 'across':
        return '↑';
      default:
        return '';
    }
  });
  readonly passDirectionLabel = computed(() => {
    switch (this.state().passDirection) {
      case 'left':
        return 'Left';
      case 'right':
        return 'Right';
      case 'across':
        return 'Across';
      default:
        return '';
    }
  });
  readonly isNoPassRound = computed(() => this.state().phase === 'pass' && this.state().passDirection === 'none');
  readonly trickWinnerSeat = computed(() => this.seatFor(this.state().trickWinnerId));
  readonly debugEntries = computed<GameDebugEntry[]>(() =>
    this.state().debugRoundHistory.map((entry, index) => ({
      index: index + 1,
      type: entry.type ?? 'play',
      playerName: this.playerName(entry.playerId),
      playerClass: this.debugPlayerClass(entry.playerId),
      cardLabel: `${entry.card.rank}${this.suitSymbol(entry.card.suit)}`,
      trace: entry.trace
    }))
  );

  constructor() {
    effect(() => {
      if (this.state().phase === 'deal') {
        this.gameEngine.startRound();
      }
      if (this.state().phase !== 'pass') {
        this.isPassing.set(false);
        this.passingCards.set([]);
        this.hidePassedCards.set(false);
      }
      if (this.state().phase === 'summary') {
        void this.router.navigate(['/results']);
      }
      if (this.state().phase !== 'pass') {
        this.selectedPassCards.set([]);
      }
    });
  }

  toggleDebugPanel(): void {
    this.debugPanelOpen.update((open) => !open);
  }

  closeDebugPanel(): void {
    this.debugPanelOpen.set(false);
  }

  playCard(card: Card): void {
    if (!this.isCardPlayable(card)) {
      return;
    }
    this.gameEngine.playHumanCard(card);
  }

  togglePassCard(card: Card): void {
    if (this.isPassing()) {
      return;
    }
    this.selectedPassCards.update((current) => {
      const exists = current.some((held) => held.suit === card.suit && held.rank === card.rank);
      if (exists) {
        return current.filter((held) => !(held.suit === card.suit && held.rank === card.rank));
      }
      if (current.length >= 3) {
        return current;
      }
      return [...current, card];
    });
  }

  isSelected(card: Card): boolean {
    return this.selectedPassCards().some((held) => held.suit === card.suit && held.rank === card.rank);
  }

  isReceived(card: Card): boolean {
    return this.receivedCards().some((held) => held.suit === card.suit && held.rank === card.rank);
  }

  isCardPlayable(card: Card): boolean {
    const player = this.currentPlayer();
    if (!player || player.type !== 'human') {
      return false;
    }
    if (this.receivedCards().length > 0) {
      return false;
    }
    return this.rules.isLegalPlay(this.state(), player, card);
  }

  handOffset(index: number, total: number): number {
    if (total <= 1) {
      return 0;
    }
    return index - (total - 1) / 2;
  }

  seatFor(playerId?: string): 'south' | 'west' | 'north' | 'east' | null {
    return seatForPlayer(this.state().players, playerId);
  }

  playerName(playerId: string): string {
    return this.state().players.find((player) => player.id === playerId)?.name ?? '';
  }

  playerForSeat(seat: 'south' | 'west' | 'north' | 'east'): Player | undefined {
    return resolvePlayerForSeat(this.state().players, seat);
  }

  isTrickLeader(playerId: string): boolean {
    return this.state().phase === 'play' && this.state().trick.leaderId === playerId;
  }

  isPassTarget(playerId: string): boolean {
    return (
      this.state().phase === 'pass' &&
      !this.isPassComplete() &&
      passTargetPlayerId(this.state().players, this.state().passDirection) === playerId
    );
  }

  isPassSource(playerId: string): boolean {
    return (
      this.state().phase === 'pass' &&
      this.isPassComplete() &&
      passSourcePlayerId(this.state().players, this.state().passDirection) === playerId
    );
  }

  passInstruction(): string {
    const direction = this.state().passDirection;
    const targetId = passTargetPlayerId(this.state().players, direction);
    const targetName = targetId ? this.playerName(targetId) : 'the next player';
    if (direction === 'none') {
      return 'No pass this round';
    }
    return `Pick three cards and pass them ${direction} to ${targetName}`;
  }

  acceptCardsInstruction(): string {
    const sourceId = passSourcePlayerId(this.state().players, this.state().passDirection);
    const sourceName = sourceId ? this.playerName(sourceId) : 'the other player';
    return `Accept cards from ${sourceName}`;
  }

  factorEntries(trace: { factors: Record<string, string | number | boolean> }): Array<{ key: string; value: string | number | boolean }> {
    return Object.entries(trace.factors).map(([key, value]) => ({ key, value }));
  }

  debugPlayerClass(playerId: string): string {
    const player = this.state().players.find((current) => current.id === playerId);
    if (!player) {
      return 'player-other';
    }

    if (player.type === 'human') {
      return 'player-you';
    }

    const seat = this.seatFor(playerId);
    if (seat === 'west') {
      return 'player-p2';
    }
    if (seat === 'north') {
      return 'player-p3';
    }
    if (seat === 'east') {
      return 'player-p4';
    }
    return 'player-other';
  }

  submitPass(): void {
    if (this.isNoPassRound()) {
      return;
    }
    if (this.isPassing()) {
      return;
    }
    if (this.selectedPassCards().length !== 3) {
      return;
    }
    const previousHand = this.humanHand();
    const cardsToPass = this.selectedPassCards();
    this.gameEngine.submitHumanPass(cardsToPass);
    this.isPassing.set(true);
    this.passingCards.set(cardsToPass);
    this.hidePassedCards.set(false);
    this.selectedPassCards.set([]);

    const received = findNewCards(previousHand, this.humanHand());
    if (received.length > 0) {
      this.receivedCards.set(received);
    }
  }

  continuePass(): void {
    if (this.isNoPassRound()) {
      this.gameEngine.continueAfterPass();
      return;
    }
    if (!this.isPassing() || !this.isPassComplete()) {
      return;
    }
    this.receivedCards.set([]);
    this.gameEngine.continueAfterPass();
    this.isPassing.set(false);
  }

  isPassComplete(): boolean {
    return this.state().passComplete === true;
  }

  newRound(): void {
    this.gameEngine.startRound();
  }

  suitSymbol(suit: Card['suit']): string {
    return getSuitSymbol(suit);
  }

  suitClass(suit: Card['suit']): string {
    return suit === 'hearts' || suit === 'diamonds' ? 'red' : 'black';
  }

  cardImage(card: Card): string {
    return getCardImage(card);
  }

  isStandalone(): boolean {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as { standalone?: boolean }).standalone === true
    );
  }
}
