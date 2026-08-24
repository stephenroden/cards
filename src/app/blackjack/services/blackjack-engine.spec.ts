import { beforeEach, describe, expect, it } from 'vitest';
import { Card } from '../../cards/card.models';
import { BlackjackSeat, BlackjackState, MIN_BET } from '../blackjack.models';
import { BlackjackEngineService } from './blackjack-engine.service';
import { BlackjackStateService, initialBlackjackState, initialSeats } from './blackjack-state.service';
import { dealerShouldHit, describeHandValue, handValue } from './blackjack-hand';
import { humanSeat } from './blackjack-seat';

const card = (rank: Card['rank'], suit: Card['suit'] = 'spades'): Card => ({ rank, suit });

/** Deal order is one card to each live seat, dealer up, a second to each seat, then the hole. */
const stack = (...cards: Card[]): Card[] => [...cards, ...filler()];

/** Long enough that the stacked cards are never wiped by the reshuffle threshold. */
const filler = (): Card[] => Array.from({ length: 120 }, () => card('5', 'clubs'));

/** Most rules are easiest to pin down with the CPU seats dealt out of the round. */
const soloSeats = (bankroll = 500): BlackjackSeat[] =>
  initialSeats().map((seat) =>
    seat.type === 'human' ? { ...seat, bankroll } : { ...seat, out: true, bet: 0 }
  );

describe('blackjack hand values', () => {
  it('demotes aces only as far as needed', () => {
    expect(handValue([card('A'), card('9')])).toEqual({ total: 20, soft: true, busted: false });
    expect(handValue([card('A'), card('9'), card('5')])).toEqual({ total: 15, soft: false, busted: false });
    expect(handValue([card('A'), card('A'), card('9')])).toEqual({ total: 21, soft: true, busted: false });
    expect(handValue([card('A'), card('A'), card('A')])).toEqual({ total: 13, soft: true, busted: false });
  });

  it('busts only when no ace can be demoted', () => {
    expect(handValue([card('K'), card('Q'), card('5')]).busted).toBe(true);
    expect(handValue([card('K'), card('Q'), card('A')]).busted).toBe(false);
  });

  it('describes soft totals with both readings', () => {
    expect(describeHandValue([card('A'), card('6')])).toBe('7/17');
    expect(describeHandValue([card('K'), card('7')])).toBe('17');
    expect(describeHandValue([card('K'), card('Q'), card('5')])).toBe('25 bust');
  });

  it('applies the soft 17 rule only when configured', () => {
    const soft17 = [card('A'), card('6')];
    expect(dealerShouldHit(soft17, { ...base().rules, dealerHitsSoft17: false })).toBe(false);
    expect(dealerShouldHit(soft17, { ...base().rules, dealerHitsSoft17: true })).toBe(true);
    expect(dealerShouldHit([card('K'), card('7')], { ...base().rules, dealerHitsSoft17: true })).toBe(false);
    expect(dealerShouldHit([card('9'), card('7')], { ...base().rules, dealerHitsSoft17: false })).toBe(true);
  });
});

const base = (): BlackjackState => initialBlackjackState();

describe('BlackjackEngineService', () => {
  let state: BlackjackStateService;
  let engine: BlackjackEngineService;

  const you = (): BlackjackSeat => humanSeat(state.state());
  const seat = (id: string): BlackjackSeat => state.state().seats.find((current) => current.id === id)!;

  const setup = (shoe: Card[], overrides: Partial<BlackjackState> = {}): void => {
    state.setState({ ...base(), seats: soloSeats(), shoe, ...overrides });
  };

  const openWithBet = (shoe: Card[], bet = 10, overrides: Partial<BlackjackState> = {}): void => {
    setup(shoe, overrides);
    engine.addToBet(bet);
    engine.deal();
  };

  beforeEach(() => {
    globalThis.localStorage?.clear();
    state = new BlackjackStateService();
    engine = new BlackjackEngineService(state);
  });

  it('pays a natural at 3:2 and ends the hand immediately', () => {
    openWithBet(stack(card('A'), card('9'), card('K'), card('7')));

    expect(state.state().phase).toBe('hand-summary');
    expect(you().hands[0].outcome).toBe('blackjack');
    expect(you().lastNet).toBe(15);
    expect(you().bankroll).toBe(515);
    expect(state.state().holeCardHidden).toBe(false);
  });

  it('pushes when both sides have a natural', () => {
    // Dealer shows an ace, so insurance is offered before the hole card is checked.
    openWithBet(stack(card('A'), card('A'), card('K'), card('J')));
    engine.declineInsurance();

    expect(you().hands[0].outcome).toBe('push');
    expect(you().lastNet).toBe(0);
    expect(you().bankroll).toBe(500);
  });

  it('offers insurance on an ace and pays 2:1 against a dealer natural', () => {
    openWithBet(stack(card('9'), card('A'), card('7'), card('K')));
    expect(state.state().phase).toBe('insurance');

    engine.takeInsurance();

    expect(you().hands[0].outcome).toBe('lose');
    // Loses the 10 main bet, wins 10 on the 5 insurance stake.
    expect(you().insuranceNet).toBe(10);
    expect(you().lastNet).toBe(0);
    expect(you().bankroll).toBe(500);
  });

  it('loses the insurance stake when the dealer has no natural', () => {
    openWithBet(stack(card('9'), card('A'), card('7'), card('5')));
    engine.takeInsurance();

    expect(state.state().phase).toBe('player-turn');
    expect(you().insuranceBet).toBe(5);
    expect(you().bankroll).toBe(485);
  });

  it('never lets the player act when the dealer has a natural', () => {
    openWithBet(stack(card('9'), card('K'), card('7'), card('A')));

    expect(state.state().phase).toBe('hand-summary');
    expect(you().hands[0].outcome).toBe('lose');
    expect(you().bankroll).toBe(490);
  });

  it('doubles for exactly one card and settles the hand', () => {
    // Player 11 vs a dealer 17 that stands, so the doubled card decides it.
    openWithBet(stack(card('6'), card('9'), card('5'), card('8'), card('K')));
    expect(engine.legalActions(state.state())).toContain('double');

    engine.act('double');

    expect(you().hands[0].cards).toHaveLength(3);
    expect(you().hands[0].bet).toBe(20);
    expect(you().hands[0].outcome).toBe('win');
    expect(you().lastNet).toBe(20);
    expect(you().bankroll).toBe(520);
  });

  it('splits a pair into two independently settled hands', () => {
    // Player 8,8 vs dealer 6. Split draws a 3 and a K, dealer draws to 16 then busts.
    openWithBet(stack(card('8'), card('6'), card('8'), card('9'), card('3'), card('K'), card('Q')));

    expect(engine.legalActions(state.state())).toContain('split');
    engine.act('split');

    expect(you().hands).toHaveLength(2);
    expect(you().bankroll).toBe(480);
    expect(you().activeHandIndex).toBe(0);

    engine.act('stand');
    engine.act('stand');

    expect(state.state().phase).toBe('hand-summary');
    expect(you().hands.map((hand) => hand.outcome)).toEqual(['win', 'win']);
    expect(you().lastNet).toBe(20);
    expect(you().bankroll).toBe(520);
  });

  it('gives split aces one card each and does not call them blackjack', () => {
    openWithBet(stack(card('A'), card('9'), card('A'), card('8'), card('K'), card('Q')));

    engine.act('split');

    expect(state.state().phase).toBe('hand-summary');
    expect(you().hands).toHaveLength(2);
    expect(you().hands.every((hand) => hand.cards.length === 2)).toBe(true);
    // 21 after a split pays even money, not 3:2.
    expect(you().hands.map((hand) => hand.outcome)).toEqual(['win', 'win']);
    expect(you().lastNet).toBe(20);
  });

  it('returns half the bet on surrender', () => {
    openWithBet(stack(card('K'), card('9'), card('6'), card('7')));
    expect(engine.legalActions(state.state())).toContain('surrender');

    engine.act('surrender');

    expect(you().hands[0].outcome).toBe('surrender');
    expect(you().lastNet).toBe(-5);
    expect(you().bankroll).toBe(495);
  });

  it('does not offer surrender after the hand has been split', () => {
    openWithBet(stack(card('8'), card('6'), card('8'), card('9'), card('3'), card('4')));
    engine.act('split');

    expect(engine.legalActions(state.state())).not.toContain('surrender');
  });

  it('stops the dealer drawing when every player hand is dead', () => {
    // Player busts; dealer holds 12 and must not draw because nothing is live.
    openWithBet(stack(card('K'), card('7'), card('6'), card('5'), card('Q')));

    engine.act('hit');

    expect(you().hands[0].outcome).toBe('bust');
    expect(state.state().dealer).toHaveLength(2);
    expect(you().bankroll).toBe(490);
  });

  it('auto-stands a hand that reaches 21', () => {
    openWithBet(stack(card('9'), card('K'), card('7'), card('9'), card('5')));

    engine.act('hit');

    expect(state.state().phase).toBe('hand-summary');
    expect(you().hands[0].status).toBe('stood');
  });

  it('rejects bets above the bankroll and below the table minimum', () => {
    setup(stack(card('K'), card('9'), card('7'), card('8')), { seats: soloSeats(20) });

    engine.addToBet(100);
    expect(you().bet).toBe(0);

    engine.deal();
    expect(state.state().phase).toBe('betting');

    engine.addToBet(MIN_BET);
    engine.deal();
    expect(state.state().phase).not.toBe('betting');
  });

  it('ends the session once the bankroll cannot cover the minimum bet', () => {
    openWithBet(stack(card('K'), card('9'), card('6'), card('K')), MIN_BET, { seats: soloSeats(MIN_BET) });
    engine.act('stand');

    expect(you().hands[0].outcome).toBe('lose');
    expect(you().bankroll).toBe(0);
    engine.nextHand();
    expect(state.state().phase).toBe('session-over');
  });

  it('ignores actions that are not legal in the current phase', () => {
    setup(stack(card('K'), card('9'), card('7'), card('8')));
    const before = state.state();

    engine.act('hit');
    engine.takeInsurance();
    engine.nextHand();

    expect(state.state()).toEqual(before);
  });

  describe('with a full table', () => {
    /** One card to each of the four seats, dealer up, a second to each seat, then the hole. */
    const fullTable = (...cards: Card[]): void => {
      state.setState({ ...base(), shoe: stack(...cards) });
      engine.addToBet(10);
      engine.deal();
    };

    it('posts a bet for every CPU seat as soon as the table opens', () => {
      expect(state.state().seats.map((current) => current.bet)).toEqual([0, 10, 25, 25]);
    });

    it('deals every seat and the dealer in seat order', () => {
      fullTable(
        card('K'), card('Q'), card('J'), card('10'),
        card('10', 'hearts'),
        card('9'), card('9', 'hearts'), card('9', 'clubs'), card('9', 'diamonds'),
        card('7')
      );

      expect(state.state().seats.map((current) => current.hands.length)).toEqual([1, 1, 1, 1]);
      expect(state.state().dealer.map((current) => current.rank)).toEqual(['10', '7']);
      expect(seat('s2').hands[0].cards.map((current) => current.rank)).toEqual(['Q', '9']);
      // Every seat has its stake taken off its own bankroll.
      expect(state.state().seats.map((current) => current.bankroll)).toEqual([490, 490, 475, 475]);
    });

    it('plays the CPU seats out and settles the whole table on one stand', () => {
      fullTable(
        card('K'), card('Q'), card('J'), card('10'),
        card('10', 'hearts'),
        card('9'), card('9', 'hearts'), card('9', 'clubs'), card('9', 'diamonds'),
        card('7')
      );

      // The human is on turn first; nobody else has acted yet.
      expect(state.state().activeSeatIndex).toBe(0);
      engine.act('stand');

      expect(state.state().phase).toBe('hand-summary');
      // Four 19s against a dealer 17.
      expect(state.state().seats.map((current) => current.hands[0].outcome)).toEqual(['win', 'win', 'win', 'win']);
      expect(state.state().seats.map((current) => current.lastNet)).toEqual([10, 10, 25, 25]);
      expect(state.state().seats.map((current) => current.bankroll)).toEqual([510, 510, 525, 525]);
    });

    it('lets a CPU seat draw for itself off basic strategy', () => {
      // Every CPU holds 16 against a dealer 7, which basic strategy hits; the filler 5 makes 21.
      // The dealer stands on 17, so the drawn card is what wins the seat its hand.
      fullTable(
        card('K'), card('10'), card('10', 'hearts'), card('10', 'clubs'),
        card('7'),
        card('9'), card('6'), card('6', 'hearts'), card('6', 'clubs'),
        card('K', 'hearts')
      );

      engine.act('stand');

      expect(seat('s2').hands[0].cards).toHaveLength(3);
      expect(handValue(seat('s2').hands[0].cards).total).toBe(21);
      expect(seat('s2').hands[0].outcome).toBe('win');
    });

    it('deals a broke seat out of the round', () => {
      state.setState({
        ...base(),
        seats: initialSeats().map((current) => (current.id === 's3' ? { ...current, bankroll: 0, bet: 0 } : current)),
        shoe: stack()
      });
      engine.addToBet(10);
      engine.deal();

      expect(seat('s3').hands).toHaveLength(0);
      expect(seat('s2').hands).toHaveLength(1);
      expect(seat('s4').hands).toHaveLength(1);
    });

    it('retires a seat that can no longer cover the minimum bet', () => {
      state.setState({
        ...base(),
        phase: 'hand-summary',
        seats: initialSeats().map((current) => (current.id === 's4' ? { ...current, bankroll: 1 } : current))
      });

      engine.nextHand();

      expect(seat('s4').out).toBe(true);
      expect(seat('s4').bet).toBe(0);
      expect(seat('s2').out).toBe(false);
    });
  });
});
