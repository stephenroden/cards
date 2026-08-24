import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Card } from '../../cards/card.models';
import {
  BridgePlayer,
  Contract,
  DEALS_PER_SESSION,
  STRAINS,
  Seat,
  Strain,
  partnerOf,
  partnershipOf
} from '../../bridge/bridge.models';
import { BridgeEngineService } from '../../bridge/services/bridge-engine.service';
import { BridgeStateService } from '../../bridge/services/bridge-state.service';
import { suggestContract } from '../../bridge/services/bridge-deal';
import { RANK_VALUE } from '../../bridge/services/bridge-rules';
import { cardImage } from '../../poker/services/poker-utils';

const STRAIN_LABELS: Record<Strain, string> = {
  clubs: '♣',
  diamonds: '♦',
  hearts: '♥',
  spades: '♠',
  notrump: 'NT'
};

const SUIT_ORDER: Card['suit'][] = ['spades', 'hearts', 'diamonds', 'clubs'];

@Component({
  selector: 'app-bridge-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './bridge.page.html',
  styleUrl: './bridge.page.css'
})
export class BridgePageComponent {
  private readonly engine = inject(BridgeEngineService);
  private readonly bridgeState = inject(BridgeStateService);

  readonly levels = [1, 2, 3, 4, 5, 6, 7];
  readonly strains = STRAINS;
  readonly declarerChoices: Seat[] = ['south', 'east', 'west'];
  readonly dealsPerSession = DEALS_PER_SESSION;

  readonly state = this.bridgeState.state;

  private readonly draft = computed<Contract>(() => suggestContract(this.handsBySeat()));
  private chosen: Contract | null = null;

  readonly contractDraft = computed<Contract>(() => this.chosen ?? this.draft());

  readonly dummy = computed(() => this.engine.dummySeat(this.state()));

  readonly legalNow = computed(() => {
    const state = this.state();
    return this.engine.legalPlaysFor(state, state.turn);
  });

  readonly southHand = computed(() => this.sortedHand('south'));
  readonly dummyHand = computed(() => {
    const dummy = this.dummy();
    return dummy && this.state().dummyRevealed ? this.sortedHand(dummy) : [];
  });

  readonly turnLabel = computed(() => {
    const state = this.state();
    if (state.phase !== 'play') {
      return '';
    }
    if (state.trickComplete) {
      const winner = state.trickWinnerSeat;
      if (!winner) {
        return '';
      }
      return winner === 'south' ? 'You win the trick.' : `${this.seatName(winner)} wins the trick.`;
    }
    if (!this.engine.humanControls(state, state.turn)) {
      return `${this.seatName(state.turn)} to play.`;
    }
    return state.turn === 'south' ? 'Your turn.' : `Play from dummy (${this.seatName(state.turn)}).`;
  });

  readonly contractLabel = computed(() => {
    const contract = this.state().contract;
    return contract ? this.describeContract(contract) : '—';
  });

  handsBySeat(): Record<Seat, Card[]> {
    const state = this.state();
    return {
      north: this.engine.handOf(state, 'north'),
      east: this.engine.handOf(state, 'east'),
      south: this.engine.handOf(state, 'south'),
      west: this.engine.handOf(state, 'west')
    };
  }

  describeContract(contract: Contract): string {
    return `${contract.level}${STRAIN_LABELS[contract.strain]} by ${this.seatName(contract.declarer)}`;
  }

  strainLabel(strain: Strain): string {
    return STRAIN_LABELS[strain];
  }

  seatName(seat: Seat): string {
    return seat === 'south' ? 'You' : seat[0].toUpperCase() + seat.slice(1);
  }

  isRedStrain(strain: Strain): boolean {
    return strain === 'hearts' || strain === 'diamonds';
  }

  player(seat: Seat): BridgePlayer | undefined {
    return this.state().players.find((current) => current.seat === seat);
  }

  handCount(seat: Seat): number {
    return this.engine.handOf(this.state(), seat).length;
  }

  cardImage(card: Card): string {
    return cardImage(card);
  }

  cardsInTrick(): Array<{ seat: Seat; card: Card }> {
    return this.state().trick.cards;
  }

  /** Sorted the way a player would fan a hand: by suit, high to low. */
  private sortedHand(seat: Seat): Card[] {
    return [...this.engine.handOf(this.state(), seat)].sort((left, right) => {
      const suitGap = SUIT_ORDER.indexOf(left.suit) - SUIT_ORDER.indexOf(right.suit);
      return suitGap !== 0 ? suitGap : RANK_VALUE[right.rank] - RANK_VALUE[left.rank];
    });
  }

  isPlayable(card: Card, seat: Seat): boolean {
    const state = this.state();
    if (state.turn !== seat || !this.engine.humanControls(state, seat) || state.trickComplete) {
      return false;
    }
    return this.legalNow().some((legal) => legal.suit === card.suit && legal.rank === card.rank);
  }

  tricksFor(seat: Seat): number {
    return this.state().tricksWon[partnershipOf(seat)];
  }

  vulnerableLabel(): string {
    const map: Record<string, string> = { none: 'None', ns: 'N/S', ew: 'E/W', both: 'Both' };
    return map[this.state().vulnerability];
  }

  setLevel(level: number): void {
    this.chosen = { ...this.contractDraft(), level };
  }

  setStrain(strain: Strain): void {
    this.chosen = { ...this.contractDraft(), strain };
  }

  setDeclarer(declarer: Seat): void {
    this.chosen = { ...this.contractDraft(), declarer };
  }

  playContract(): void {
    this.engine.setContract(this.contractDraft());
    this.chosen = null;
  }

  play(card: Card): void {
    this.engine.playCard(card);
  }

  acknowledgeTrick(): void {
    this.engine.acknowledgeTrick();
  }

  nextDeal(): void {
    this.engine.nextDeal();
    this.chosen = null;
  }

  newSession(): void {
    this.engine.startSession();
    this.chosen = null;
  }

  partnerSeat(seat: Seat): Seat {
    return partnerOf(seat);
  }
}
