import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { BlackjackPageComponent } from './blackjack.page';
import {
  BlackjackStateService,
  initialBlackjackState,
  initialSeats
} from '../../blackjack/services/blackjack-state.service';
import { BlackjackSeat } from '../../blackjack/blackjack.models';
import { Card } from '../../game/game.models';

const card = (rank: Card['rank'], suit: Card['suit'] = 'spades'): Card => ({ rank, suit });

const stackedShoe = (...cards: Card[]): Card[] => [
  ...cards,
  ...Array.from({ length: 120 }, () => card('5', 'clubs'))
];

/** The CPU seats sit out so a stacked shoe reaches the human seat card for card. */
const soloSeats = (): BlackjackSeat[] =>
  initialSeats().map((seat) => (seat.type === 'human' ? seat : { ...seat, out: true, bet: 0 }));

describe('BlackjackPageComponent', () => {
  let fixture: ComponentFixture<BlackjackPageComponent>;
  let state: BlackjackStateService;

  const text = (): string => fixture.nativeElement.textContent ?? '';
  const buttons = (): HTMLButtonElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('button'));
  const button = (label: string): HTMLButtonElement | undefined =>
    buttons().find((element) => element.textContent?.trim().startsWith(label));

  const dealSolo = (...cards: Card[]): void => {
    state.setState({ ...initialBlackjackState(), seats: soloSeats(), shoe: stackedShoe(...cards) });
    fixture.detectChanges();
    button('25')?.click();
    fixture.detectChanges();
    button('Deal')?.click();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    globalThis.localStorage?.clear();
    await TestBed.configureTestingModule({
      imports: [BlackjackPageComponent],
      providers: [provideRouter([])]
    }).compileComponents();

    state = TestBed.inject(BlackjackStateService);
    fixture = TestBed.createComponent(BlackjackPageComponent);
    fixture.detectChanges();
  });

  it('opens on the betting screen with the deal button disabled', () => {
    expect(text()).toContain('Blackjack');
    expect(text()).toContain('Bankroll');
    expect(button('Deal')?.disabled).toBe(true);
  });

  it('shows a pod for each of the three CPU seats', () => {
    const pods: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('.seat-pod'));
    expect(pods).toHaveLength(3);
    expect(pods.map((pod) => pod.querySelector('strong')?.textContent?.trim())).toEqual(['Kai', 'Lena', 'Milo']);
    // Their opening bets are posted before the deal.
    expect(pods.map((pod) => pod.textContent?.includes('Bet'))).toEqual([true, true, true]);
  });

  it('plays a hand through the UI from bet to settlement', () => {
    dealSolo(card('K'), card('9'), card('6'), card('8'));

    expect(button('Deal')).toBeUndefined();
    // Player 16 against a dealer 9: hit, stand, double and surrender are all offered.
    expect(button('Hit')).toBeTruthy();
    expect(button('Stand')).toBeTruthy();
    expect(button('Surrender')).toBeTruthy();
    expect(fixture.nativeElement.querySelectorAll('.player-hand .card-row img').length).toBe(2);
    expect(fixture.nativeElement.querySelector('.card-back')).toBeTruthy();

    button('Stand')?.click();
    fixture.detectChanges();

    // Dealer 17 beats the player 16.
    expect(text()).toContain('Lose');
    expect(button('Next Hand')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.card-back')).toBeNull();
  });

  it('renders one panel per hand after a split', () => {
    dealSolo(card('8'), card('6'), card('8'), card('9'), card('3'), card('K'));

    button('Split')?.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.player-hand').length).toBe(2);
    expect(text()).toContain('Hand 1');
    expect(text()).toContain('Hand 2');
    expect(fixture.nativeElement.querySelector('.player-hand.active')).toBeTruthy();
  });

  it('shows the insurance prompt when the dealer shows an ace', () => {
    dealSolo(card('9'), card('A'), card('7'), card('5'));

    expect(text()).toContain('Insurance');
    expect(button('No Insurance')).toBeTruthy();
  });

  it('shows a half chip in a 3:2 payout rather than rounding it away', () => {
    state.setState({
      ...initialBlackjackState(),
      seats: soloSeats(),
      shoe: stackedShoe(card('A'), card('9'), card('K'), card('7'))
    });
    fixture.detectChanges();

    button('5')?.click();
    fixture.detectChanges();
    button('Deal')?.click();
    fixture.detectChanges();

    expect(text()).toContain('Blackjack');
    expect(text()).toContain('+7.5');
    expect(text()).toContain('507.5');
  });

  it('deals cards to every CPU pod when the whole table is playing', () => {
    state.setState({ ...initialBlackjackState(), shoe: stackedShoe() });
    fixture.detectChanges();

    button('25')?.click();
    fixture.detectChanges();
    button('Deal')?.click();
    fixture.detectChanges();

    const pods: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('.seat-pod'));
    expect(pods.every((pod) => pod.querySelectorAll('.card-row img').length >= 2)).toBe(true);
    expect(fixture.nativeElement.querySelectorAll('.seat-pod .card-slot').length).toBe(0);
  });
});
