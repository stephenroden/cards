import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Card } from '../../cards/card.models';
import {
  BlackjackActionType,
  BlackjackHand,
  BlackjackSeat,
  CHIP_DENOMINATIONS,
  MIN_BET
} from '../../blackjack/blackjack.models';
import { BlackjackEngineService } from '../../blackjack/services/blackjack-engine.service';
import { BlackjackStateService } from '../../blackjack/services/blackjack-state.service';
import { describeHandValue, handValue } from '../../blackjack/services/blackjack-hand';
import { cpuSeats, humanSeat } from '../../blackjack/services/blackjack-seat';
import { cardImage } from '../../poker/services/poker-utils';

const OUTCOME_LABELS: Record<string, string> = {
  blackjack: 'Blackjack',
  win: 'Win',
  push: 'Push',
  lose: 'Lose',
  bust: 'Bust',
  surrender: 'Surrendered'
};

/** Casino convention for the denominations this table deals in: 5 red, 25 green, 100 black. */
const CHIP_COLORS: Record<number, string> = {
  5: '#b3232e',
  25: '#1c7a46',
  100: '#17171c'
};

const ACTION_LABELS: Record<BlackjackActionType, string> = {
  hit: 'Hit',
  stand: 'Stand',
  double: 'Double',
  split: 'Split',
  surrender: 'Surrender'
};

@Component({
  selector: 'app-blackjack-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './blackjack.page.html',
  styleUrl: './blackjack.page.css'
})
export class BlackjackPageComponent {
  private readonly engine = inject(BlackjackEngineService);
  private readonly blackjackState = inject(BlackjackStateService);

  readonly chips = CHIP_DENOMINATIONS;
  readonly minBet = MIN_BET;
  readonly state = this.blackjackState.state;

  readonly you = computed(() => humanSeat(this.state()));
  readonly opponents = computed(() => cpuSeats(this.state()));

  readonly legalActions = computed(() => this.engine.legalActions(this.state()));
  readonly dealerValueText = computed(() => {
    const state = this.state();
    if (state.dealer.length === 0) {
      return '';
    }
    if (state.holeCardHidden) {
      return `${handValue([state.dealer[0]]).total} +`;
    }
    return describeHandValue(state.dealer);
  });

  readonly canDeal = computed(() => {
    const seat = this.you();
    return this.state().phase === 'betting' && seat.bet >= MIN_BET && seat.bet <= seat.bankroll;
  });

  readonly insuranceCost = computed(() => Math.floor(this.you().bet / 2));

  readonly statusText = computed(() => {
    const state = this.state();
    if (state.message) {
      return state.message;
    }
    if (state.phase === 'player-turn') {
      const seat = this.you();
      return seat.hands.length > 1 ? `Playing hand ${seat.activeHandIndex + 1} of ${seat.hands.length}.` : 'Your move.';
    }
    return '';
  });

  cardImage(card: Card): string {
    return cardImage(card);
  }

  handValueText(hand: BlackjackHand): string {
    return describeHandValue(hand.cards);
  }

  outcomeLabel(hand: BlackjackHand): string {
    return hand.outcome ? OUTCOME_LABELS[hand.outcome] : '';
  }

  chipColor(value: number): string {
    return CHIP_COLORS[value] ?? 'var(--accent-primary)';
  }

  actionLabel(action: BlackjackActionType): string {
    return ACTION_LABELS[action];
  }

  isActiveHand(index: number): boolean {
    const state = this.state();
    const seat = this.you();
    return (
      state.phase === 'player-turn' &&
      state.seats[state.activeSeatIndex]?.type === 'human' &&
      seat.activeHandIndex === index &&
      seat.hands.length > 1
    );
  }

  /** One line under a CPU pod: what it is doing, or what it walked away with. */
  seatStatus(seat: BlackjackSeat): string {
    if (seat.out) {
      return 'Out';
    }
    if (seat.hands.length === 0) {
      return this.state().phase === 'betting' ? `Bet ${this.formatChips(seat.bet)}` : 'Sitting out';
    }
    if (seat.hands.every((hand) => hand.outcome !== null)) {
      return `${this.formatNet(seat.lastNet)} chips`;
    }
    return `Bet ${this.formatChips(seat.hands.reduce((sum, hand) => sum + hand.bet, 0))}`;
  }

  /** Chips can carry a half from a 3:2 payout or a surrender, so only show a decimal when there is one. */
  formatChips(amount: number): string {
    return Number.isInteger(amount) ? `${amount}` : amount.toFixed(1);
  }

  formatNet(amount: number): string {
    const formatted = this.formatChips(Math.abs(amount));
    if (amount > 0) {
      return `+${formatted}`;
    }
    return amount < 0 ? `-${formatted}` : '0';
  }

  addToBet(amount: number): void {
    this.engine.addToBet(amount);
  }

  clearBet(): void {
    this.engine.clearBet();
  }

  repeatLastBet(): void {
    this.engine.repeatLastBet();
  }

  deal(): void {
    this.engine.deal();
  }

  act(action: BlackjackActionType): void {
    this.engine.act(action);
  }

  takeInsurance(): void {
    this.engine.takeInsurance();
  }

  declineInsurance(): void {
    this.engine.declineInsurance();
  }

  nextHand(): void {
    this.engine.nextHand();
  }

  newSession(): void {
    this.engine.startSession();
  }
}
