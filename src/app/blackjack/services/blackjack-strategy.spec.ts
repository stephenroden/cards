import { describe, expect, it } from 'vitest';
import { Card } from '../../game/game.models';
import {
  BlackjackActionType,
  BlackjackHand,
  BlackjackSeat,
  DEFAULT_BLACKJACK_RULES,
  PROFILE_BETTING
} from '../blackjack.models';
import { chooseBlackjackAction, chooseSeatBet } from './blackjack-strategy';

const card = (rank: Card['rank'], suit: Card['suit'] = 'spades'): Card => ({ rank, suit });

const hand = (...cards: Card[]): BlackjackHand => ({
  id: 'h',
  cards,
  bet: 10,
  doubled: false,
  splitDepth: 0,
  fromSplitAces: false,
  status: 'active',
  outcome: null,
  net: 0
});

const EVERYTHING: BlackjackActionType[] = ['hit', 'stand', 'double', 'split', 'surrender'];
const NO_DOUBLE: BlackjackActionType[] = ['hit', 'stand'];

const decide = (
  cards: Card[],
  up: Card,
  legal: BlackjackActionType[] = EVERYTHING,
  rules = DEFAULT_BLACKJACK_RULES
): BlackjackActionType => chooseBlackjackAction(hand(...cards), up, legal, rules);

describe('chooseBlackjackAction', () => {
  it('always splits aces and eights, never tens or fives', () => {
    expect(decide([card('A'), card('A')], card('K'))).toBe('split');
    expect(decide([card('8'), card('8')], card('6'))).toBe('split');
    expect(decide([card('K'), card('Q')], card('6'))).toBe('stand');
    expect(decide([card('5'), card('5')], card('6'))).toBe('double');
  });

  it('splits nines except against a seven, ten or ace', () => {
    expect(decide([card('9'), card('9')], card('6'))).toBe('split');
    expect(decide([card('9'), card('9')], card('9'))).toBe('split');
    expect(decide([card('9'), card('9')], card('7'))).toBe('stand');
    expect(decide([card('9'), card('9')], card('K'))).toBe('stand');
    expect(decide([card('9'), card('9')], card('A'))).toBe('stand');
  });

  it('only splits low pairs after a double is allowed on the split hands', () => {
    const noDas = { ...DEFAULT_BLACKJACK_RULES, doubleAfterSplit: false };
    expect(decide([card('3'), card('3')], card('2'))).toBe('split');
    expect(decide([card('3'), card('3')], card('2'), EVERYTHING, noDas)).toBe('hit');
    expect(decide([card('4'), card('4')], card('5'))).toBe('split');
    expect(decide([card('4'), card('4')], card('5'), EVERYTHING, noDas)).toBe('hit');
  });

  it('stands stiff totals against a weak upcard and hits them against a strong one', () => {
    expect(decide([card('K'), card('3')], card('6'))).toBe('stand');
    expect(decide([card('K'), card('3')], card('7'))).toBe('hit');
    expect(decide([card('10'), card('2')], card('3'))).toBe('hit');
    expect(decide([card('10'), card('2')], card('4'))).toBe('stand');
  });

  it('reads eleven against an ace off the soft 17 rule', () => {
    expect(decide([card('6'), card('5')], card('9'))).toBe('double');
    expect(decide([card('6'), card('5')], card('A'))).toBe('hit');
    const hitsSoft17 = { ...DEFAULT_BLACKJACK_RULES, dealerHitsSoft17: true };
    expect(decide([card('6'), card('5')], card('A'), EVERYTHING, hitsSoft17)).toBe('double');
  });

  it('plays soft eighteen three different ways', () => {
    expect(decide([card('A'), card('7')], card('4'))).toBe('double');
    expect(decide([card('A'), card('7')], card('8'))).toBe('stand');
    expect(decide([card('A'), card('7')], card('9'))).toBe('hit');
  });

  it('surrenders sixteen against a ten but splits eights instead', () => {
    expect(decide([card('10'), card('6')], card('K'))).toBe('surrender');
    expect(decide([card('8'), card('8')], card('K'))).toBe('split');
    expect(decide([card('10'), card('6')], card('8'))).toBe('hit');
  });

  it('gives up more against an ace only when the dealer hits soft 17', () => {
    expect(decide([card('10'), card('6')], card('A'))).toBe('hit');
    const hitsSoft17 = { ...DEFAULT_BLACKJACK_RULES, dealerHitsSoft17: true };
    expect(decide([card('10'), card('6')], card('A'), EVERYTHING, hitsSoft17)).toBe('surrender');
  });

  it('falls back to hitting when the table will not allow the double it wants', () => {
    expect(decide([card('6'), card('5')], card('9'), NO_DOUBLE)).toBe('hit');
    expect(decide([card('A'), card('4')], card('5'), NO_DOUBLE)).toBe('hit');
    // Soft eighteen is the exception: it is happy to stand rather than draw.
    expect(decide([card('A'), card('7')], card('4'), NO_DOUBLE)).toBe('stand');
  });

  it('only picks an action the table is actually offering', () => {
    const standOnly: BlackjackActionType[] = ['stand'];
    expect(decide([card('5'), card('2')], card('K'), standOnly)).toBe('stand');
    expect(decide([card('A'), card('A')], card('6'), standOnly)).toBe('stand');
  });
});

describe('chooseSeatBet', () => {
  const seat = (overrides: Partial<BlackjackSeat> = {}): BlackjackSeat => ({
    id: 's2',
    name: 'Kai',
    type: 'cpu',
    profile: 'bold',
    bankroll: 500,
    bet: 0,
    lastBet: 5,
    hands: [],
    activeHandIndex: 0,
    insuranceBet: 0,
    insuranceNet: 0,
    lastNet: 0,
    out: false,
    ...overrides
  });

  it('flat bets the profile base until the seat wins', () => {
    expect(chooseSeatBet(seat({ profile: 'cautious' }))).toBe(PROFILE_BETTING.cautious.base);
    expect(chooseSeatBet(seat({ profile: 'steady', lastNet: 40 }))).toBe(PROFILE_BETTING.steady.base);
    expect(chooseSeatBet(seat({ profile: 'bold', lastNet: 40 }))).toBe(PROFILE_BETTING.bold.base * 2);
    expect(chooseSeatBet(seat({ profile: 'bold', lastNet: -40 }))).toBe(PROFILE_BETTING.bold.base);
  });

  it('never bets more chips than the seat is holding', () => {
    expect(chooseSeatBet(seat({ profile: 'bold', lastNet: 40, bankroll: 12 }))).toBe(12);
  });
});
