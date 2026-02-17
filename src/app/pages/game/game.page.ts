import { Component, ElementRef, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Card, Player, Rank, Suit } from '../../game/game.models';
import { GameEngineService } from '../../game/services/game-engine.service';
import { GameStateService } from '../../game/services/game-state.service';
import { RulesService } from '../../game/services/rules.service';
import { scoreCard } from '../../game/services/scoring';

@Component({
  selector: 'app-game-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './game.page.html',
  styleUrl: './game.page.css',
  host: {
    class: 'game-page'
  }
})
export class GamePageComponent {
  @ViewChild('debugLog') private debugLogRef?: ElementRef<HTMLDivElement>;
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
  readonly humanHand = computed(() => this.sortCards(this.humanPlayer()?.hand ?? []));
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
    return this.sortCards(this.rules.getLegalPlays(this.state(), player));
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
  readonly debugEntries = computed(() =>
    this.state().debugRoundHistory.map((entry, index) => ({
      index: index + 1,
      type: entry.type ?? 'play',
      playerId: entry.playerId,
      playerName: this.playerName(entry.playerId),
      cardLabel: `${entry.card.rank}${this.suitSymbol(entry.card.suit)}`,
      trace: entry.trace
    }))
  );
  private readonly suitOrder: Suit[] = ['clubs', 'diamonds', 'spades', 'hearts'];
  private readonly rankOrder: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  private readonly suitIndex = new Map(this.suitOrder.map((suit, index) => [suit, index]));
  private readonly rankIndex = new Map(this.rankOrder.map((rank, index) => [rank, index]));

  constructor() {
    effect((onCleanup) => {
      const state = this.state();
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
      this.debugEntries().length;
      const scrollTimer = setTimeout(() => {
        const container = this.debugLogRef?.nativeElement;
        if (container && this.debugPanelOpen()) {
          container.scrollTop = container.scrollHeight;
        }
      }, 0);
      onCleanup(() => clearTimeout(scrollTimer));
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
    if (!playerId) {
      return null;
    }
    const players = this.state().players;
    const humanIndex = players.findIndex((player) => player.type === 'human');
    const playerIndex = players.findIndex((player) => player.id === playerId);
    if (humanIndex === -1 || playerIndex === -1) {
      return null;
    }
    const order: Array<'south' | 'west' | 'north' | 'east'> = ['south', 'west', 'north', 'east'];
    const offset = (playerIndex - humanIndex + players.length) % players.length;
    return order[offset] ?? null;
  }

  playerName(playerId: string): string {
    return this.state().players.find((player) => player.id === playerId)?.name ?? '';
  }

  playerForSeat(seat: 'south' | 'west' | 'north' | 'east'): Player | undefined {
    const players = this.state().players;
    const humanIndex = players.findIndex((player) => player.type === 'human');
    if (humanIndex === -1) {
      return undefined;
    }
    const order: Array<'south' | 'west' | 'north' | 'east'> = ['south', 'west', 'north', 'east'];
    const offset = order.indexOf(seat);
    if (offset === -1) {
      return undefined;
    }
    return players[(humanIndex + offset) % players.length];
  }

  isTrickLeader(playerId: string): boolean {
    return this.state().phase === 'play' && this.state().trick.leaderId === playerId;
  }

  isPassTarget(playerId: string): boolean {
    return this.state().phase === 'pass' && !this.isPassComplete() && this.passTargetPlayerId() === playerId;
  }

  isPassSource(playerId: string): boolean {
    return this.state().phase === 'pass' && this.isPassComplete() && this.passSourcePlayerId() === playerId;
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

  reasonLabel(reasonCode: string): string {
    if (reasonCode === 'capture_bonus_jd') {
      return 'Chased the bonus card';
    }
    if (reasonCode === 'dump_danger_card') {
      return 'Dumped a dangerous card';
    }
    if (reasonCode === 'duck_follow_low') {
      return 'Played low to avoid winning';
    }
    if (reasonCode === 'take_control_high') {
      return 'Took control of the trick';
    }
    if (reasonCode === 'shed_high_without_winning') {
      return 'Shed a high card while still losing';
    }
    if (reasonCode === 'safe_lead') {
      return 'Made a safe lead';
    }
    if (reasonCode === 'risky_spade_lead') {
      return 'Risked a high spade lead (Q♠ unseen)';
    }
    if (reasonCode === 'lowest_risk_legal') {
      return 'Picked the safest legal card';
    }
    if (reasonCode === 'human_play') {
      return 'Human play';
    }
    if (reasonCode === 'hearts_broken') {
      return 'Hearts were broken';
    }
    if (reasonCode === 'forced_follow_suit') {
      return 'Had to follow suit';
    }
    return reasonCode;
  }

  qSpadeContext(trace: { factors: Record<string, string | number | boolean> }): string {
    const hand = trace.factors['hand_cards'];
    const played = trace.factors['spades_played'];
    const unplayed = trace.factors['spades_unplayed'];
    if (!hand && !played && !unplayed) {
      return '';
    }
    return `hand=[${hand ?? ''}] played_spades=[${played ?? ''}] unplayed_spades=[${unplayed ?? ''}]`;
  }

  jDiamondContext(trace: { factors: Record<string, string | number | boolean> }): string {
    const hand = trace.factors['hand_cards'];
    const played = trace.factors['diamonds_played'];
    const unplayed = trace.factors['diamonds_unplayed'];
    if (!hand && !played && !unplayed) {
      return '';
    }
    return `hand=[${hand ?? ''}] played_diamonds=[${played ?? ''}] unplayed_diamonds=[${unplayed ?? ''}]`;
  }

  genericContext(trace: { factors: Record<string, string | number | boolean> }): string {
    const hand = trace.factors['hand_cards'];
    const chosenSuit = trace.factors['chosen_suit'];
    const played = trace.factors['suit_played'];
    const unplayed = trace.factors['suit_unplayed'];
    if (!hand && !played && !unplayed) {
      return '';
    }
    return `hand=[${hand ?? ''}] suit=[${chosenSuit ?? ''}] played=[${played ?? ''}] unplayed=[${unplayed ?? ''}]`;
  }

  private passTargetPlayerId(): string | null {
    const direction = this.state().passDirection;
    if (direction === 'none') {
      return null;
    }
    const players = this.state().players;
    const humanIndex = players.findIndex((player) => player.type === 'human');
    if (humanIndex === -1) {
      return null;
    }

    if (direction === 'left') {
      return players[(humanIndex + 1) % players.length]?.id ?? null;
    }
    if (direction === 'right') {
      return players[(humanIndex - 1 + players.length) % players.length]?.id ?? null;
    }
    return players[(humanIndex + 2) % players.length]?.id ?? null;
  }

  private passSourcePlayerId(): string | null {
    const direction = this.state().passDirection;
    if (direction === 'none') {
      return null;
    }
    const players = this.state().players;
    const humanIndex = players.findIndex((player) => player.type === 'human');
    if (humanIndex === -1) {
      return null;
    }

    if (direction === 'left') {
      return players[(humanIndex - 1 + players.length) % players.length]?.id ?? null;
    }
    if (direction === 'right') {
      return players[(humanIndex + 1) % players.length]?.id ?? null;
    }
    return players[(humanIndex + 2) % players.length]?.id ?? null;
  }

  private sortCards(cards: Card[]): Card[] {
    return [...cards].sort((left, right) => {
      const suitDelta = (this.suitIndex.get(left.suit) ?? 0) - (this.suitIndex.get(right.suit) ?? 0);
      if (suitDelta !== 0) {
        return suitDelta;
      }
      return (this.rankIndex.get(left.rank) ?? 0) - (this.rankIndex.get(right.rank) ?? 0);
    });
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
    if (suit === 'clubs') {
      return '♣';
    }
    if (suit === 'diamonds') {
      return '♦';
    }
    if (suit === 'hearts') {
      return '♥';
    }
    return '♠';
  }

  suitClass(suit: Card['suit']): string {
    return suit === 'hearts' || suit === 'diamonds' ? 'red' : 'black';
  }

  cardImage(card: Card): string {
    const suit = this.faceSuitName(card.suit);
    return `cards/${suit}_${card.rank}.svg`;
  }

  private faceSuitName(suit: Card['suit']): string {
    if (suit === 'clubs') {
      return 'club';
    }
    if (suit === 'diamonds') {
      return 'diamond';
    }
    if (suit === 'hearts') {
      return 'heart';
    }
    return 'spade';
  }

  isStandalone(): boolean {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as { standalone?: boolean }).standalone === true
    );
  }
}

const findNewCards = (previous: Card[], current: Card[]): Card[] => {
  const counts = new Map<string, number>();
  for (const card of previous) {
    const key = `${card.suit}-${card.rank}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const added: Card[] = [];
  for (const card of current) {
    const key = `${card.suit}-${card.rank}`;
    const remaining = counts.get(key) ?? 0;
    if (remaining > 0) {
      counts.set(key, remaining - 1);
    } else {
      added.push(card);
    }
  }
  return added;
};
