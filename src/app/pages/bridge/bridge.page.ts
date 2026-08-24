import { Component, computed, effect, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Card } from '../../cards/card.models';
import {
  BridgePlayer,
  Contract,
  DEALS_PER_SESSION,
  SEAT_ORDER,
  STRAINS,
  Seat,
  Strain,
  partnerOf,
  partnershipOf
} from '../../bridge/bridge.models';
import { Call } from '../../bridge/services/bridge-auction';
import { BridgeEngineService } from '../../bridge/services/bridge-engine.service';
import { BridgeStateService } from '../../bridge/services/bridge-state.service';
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

  constructor() {
    // The seats before south have to call before the player sees a live bidding box.
    effect(() => {
      const state = this.state();
      if (state.phase === 'auction' && state.auction.length === 0) {
        this.engine.openAuction();
      }
    });
  }

  readonly seats = SEAT_ORDER;

  readonly myTurnToCall = computed(() => {
    const state = this.state();
    return state.phase === 'auction' && this.engine.seatToCall(state) === 'south';
  });

  /** The auction laid out in dealer order, padded so each row is one round of four. */
  readonly auctionGrid = computed(() => {
    const state = this.state();
    const cells: Array<string | null> = Array(SEAT_ORDER.indexOf(state.dealer)).fill(null);
    for (const entry of state.auction) {
      cells.push(this.callLabel(entry.call));
    }
    while (cells.length % 4 !== 0) {
      cells.push(null);
    }
    return cells;
  });

  readonly dummy = computed(() => this.engine.dummySeat(this.state()));

  /** North's cards are face up when it is the exposed dummy, or when the player is running it. */
  readonly showNorthCards = computed(() => {
    const state = this.state();
    if (state.phase !== 'play') {
      return false;
    }
    return this.engine.humanControls(state, 'north') || (this.dummy() === 'north' && state.dummyRevealed);
  });

  readonly northHand = computed(() => (this.showNorthCards() ? this.sortedHand('north') : []));

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

  engineSeatToCall(): Seat {
    return this.engine.seatToCall(this.state());
  }

  callLabel(call: Call): string {
    if (call.type === 'pass') {
      return 'Pass';
    }
    if (call.type === 'double') {
      return 'X';
    }
    if (call.type === 'redouble') {
      return 'XX';
    }
    return `${call.level}${STRAIN_LABELS[call.strain]}`;
  }

  canCall(call: Call): boolean {
    return this.myTurnToCall() && this.engine.isLegalCall(this.state(), call);
  }

  canBid(level: number, strain: Strain): boolean {
    return this.canCall({ type: 'bid', level, strain });
  }

  bid(level: number, strain: Strain): void {
    this.engine.makeCall({ type: 'bid', level, strain });
  }

  callPass(): void {
    this.engine.makeCall({ type: 'pass' });
  }

  callDouble(): void {
    this.engine.makeCall({ type: 'double' });
  }

  callRedouble(): void {
    this.engine.makeCall({ type: 'redouble' });
  }

  play(card: Card): void {
    this.engine.playCard(card);
  }

  acknowledgeTrick(): void {
    this.engine.acknowledgeTrick();
  }

  nextDeal(): void {
    this.engine.nextDeal();
  }

  newSession(): void {
    this.engine.startSession();
  }

  partnerSeat(seat: Seat): Seat {
    return partnerOf(seat);
  }
}
