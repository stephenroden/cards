import { describe, expect, it } from 'vitest';
import { Card, Suit } from '../../cards/card.models';
import { SEAT_ORDER, Seat } from '../bridge.models';
import { AuctionCall, Call, auctionIsComplete, finalContract, isLegalCall, seatToCall } from './bridge-auction';
import { chooseCall, evaluateHand } from './bridge-bidding-ai';
import { dealHands } from './bridge-deal';

const card = (rank: Card['rank'], suit: Suit): Card => ({ rank, suit });

/** Builds a hand of the requested length per suit, using high cards first for the given points. */
const handOf = (spec: Array<[Suit, Card['rank'][]]>): Card[] =>
  spec.flatMap(([suit, ranks]) => ranks.map((rank) => card(rank, suit)));

const open = (hand: Card[]): Call => chooseCall({ seat: 'north', hand, calls: [] });

describe('evaluateHand', () => {
  it('counts high cards and recognises a balanced shape', () => {
    const balanced = handOf([
      ['spades', ['A', 'K', '4', '3']],
      ['hearts', ['Q', '8', '5']],
      ['diamonds', ['K', '7', '2']],
      ['clubs', ['J', '9', '4']]
    ]);
    const shape = evaluateHand(balanced);
    expect(shape.hcp).toBe(4 + 3 + 2 + 3 + 1);
    expect(shape.balanced).toBe(true);
    expect(shape.longestMajor).toBeNull();
  });

  it('does not call a hand with a singleton balanced', () => {
    const unbalanced = handOf([
      ['spades', ['A', 'K', 'Q', '4', '3']],
      ['hearts', ['5']],
      ['diamonds', ['K', '7', '2', '6']],
      ['clubs', ['J', '9', '4']]
    ]);
    expect(evaluateHand(unbalanced).balanced).toBe(false);
    expect(evaluateHand(unbalanced).longestMajor).toBe('spades');
  });
});

describe('opening bids', () => {
  it('opens a strong balanced hand 1NT', () => {
    const hand = handOf([
      ['spades', ['A', 'K', '4', '3']],
      ['hearts', ['A', '8', '5']],
      ['diamonds', ['K', 'Q', '2']],
      ['clubs', ['J', '9', '4']]
    ]);
    expect(evaluateHand(hand).hcp).toBe(17);
    expect(open(hand)).toEqual({ type: 'bid', level: 1, strain: 'notrump' });
  });

  it('opens one of a five-card major below the notrump range', () => {
    const hand = handOf([
      ['spades', ['A', 'K', 'Q', '4', '3']],
      ['hearts', ['8', '5']],
      ['diamonds', ['K', '7', '2']],
      ['clubs', ['J', '9', '4']]
    ]);
    expect(evaluateHand(hand).hcp).toBe(13);
    expect(open(hand)).toEqual({ type: 'bid', level: 1, strain: 'spades' });
  });

  it('opens the longer minor without a five-card major', () => {
    const hand = handOf([
      ['spades', ['A', 'K', '4']],
      ['hearts', ['8', '5']],
      ['diamonds', ['K', 'Q', '9', '7', '2']],
      ['clubs', ['J', '9', '4']]
    ]);
    expect(open(hand)).toEqual({ type: 'bid', level: 1, strain: 'diamonds' });
  });

  it('opens a big hand with the strong club', () => {
    const hand = handOf([
      ['spades', ['A', 'K', 'Q', 'J']],
      ['hearts', ['A', 'K', 'Q']],
      ['diamonds', ['A', 'K', '2']],
      ['clubs', ['A', '9', '4']]
    ]);
    expect(open(hand)).toEqual({ type: 'bid', level: 2, strain: 'clubs' });
  });

  it('preempts on a long weak suit', () => {
    const weakSix = handOf([
      ['spades', ['K', 'Q', 'J', '7', '5', '3']],
      ['hearts', ['8', '5']],
      ['diamonds', ['9', '7', '2']],
      ['clubs', ['6', '4']]
    ]);
    expect(open(weakSix)).toEqual({ type: 'bid', level: 2, strain: 'spades' });

    const weakSeven = handOf([
      ['spades', ['K', 'Q', 'J', '7', '5', '3', '2']],
      ['hearts', ['8', '5']],
      ['diamonds', ['9', '7']],
      ['clubs', ['6', '4']]
    ]);
    expect(open(weakSeven)).toEqual({ type: 'bid', level: 3, strain: 'spades' });
  });

  it('passes a hand with nothing in it', () => {
    const bust = handOf([
      ['spades', ['7', '4', '3']],
      ['hearts', ['8', '5', '2']],
      ['diamonds', ['9', '7', '3']],
      ['clubs', ['J', '6', '4', '2']]
    ]);
    expect(open(bust)).toEqual({ type: 'pass' });
  });
});

describe('responses', () => {
  const openOneSpade: AuctionCall[] = [{ seat: 'north', call: { type: 'bid', level: 1, strain: 'spades' } }];

  it('raises partner major with support and values', () => {
    const hand = handOf([
      ['spades', ['K', '8', '4']],
      ['hearts', ['Q', '7', '5', '2']],
      ['diamonds', ['K', '6', '3']],
      ['clubs', ['8', '4', '2']]
    ]);
    const call = chooseCall({ seat: 'south', hand, calls: [...openOneSpade, { seat: 'east', call: { type: 'pass' } }] });
    expect(call).toEqual({ type: 'bid', level: 2, strain: 'spades' });
  });

  it('jumps to game with support and an opening hand', () => {
    const hand = handOf([
      ['spades', ['K', 'Q', '8', '4']],
      ['hearts', ['A', '7', '5']],
      ['diamonds', ['K', '9', '6']],
      ['clubs', ['A', '4', '2']]
    ]);
    const call = chooseCall({ seat: 'south', hand, calls: [...openOneSpade, { seat: 'east', call: { type: 'pass' } }] });
    expect(call).toEqual({ type: 'bid', level: 4, strain: 'spades' });
  });

  it('passes partner opening with a weak hand', () => {
    const hand = handOf([
      ['spades', ['8', '4']],
      ['hearts', ['7', '5', '2']],
      ['diamonds', ['9', '6', '3', '2']],
      ['clubs', ['8', '6', '4', '2']]
    ]);
    const call = chooseCall({ seat: 'south', hand, calls: [...openOneSpade, { seat: 'east', call: { type: 'pass' } }] });
    expect(call).toEqual({ type: 'pass' });
  });
});

/** Runs a complete auction between four AI seats. */
const runAuction = (hands: Record<Seat, Card[]>, dealer: Seat): AuctionCall[] => {
  const calls: AuctionCall[] = [];
  for (let step = 0; step < 80; step += 1) {
    if (auctionIsComplete(calls)) {
      return calls;
    }
    const seat = seatToCall(dealer, calls);
    const call = chooseCall({ seat, hand: hands[seat], calls });
    if (!isLegalCall(calls, seat, call)) {
      throw new Error(`illegal call from ${seat}: ${JSON.stringify(call)}`);
    }
    calls.push({ seat, call });
  }
  throw new Error('auction did not terminate');
};

describe('full auctions', () => {
  it('always terminates with only legal calls across many random deals', () => {
    for (let deal = 0; deal < 200; deal += 1) {
      const hands = dealHands();
      const dealer = SEAT_ORDER[deal % 4];
      const calls = runAuction(hands, dealer);

      expect(auctionIsComplete(calls)).toBe(true);
      const contract = finalContract(calls);
      if (contract) {
        expect(contract.level).toBeGreaterThanOrEqual(1);
        expect(contract.level).toBeLessThanOrEqual(7);
      }
    }
  });

  it('reaches a contract on most deals rather than passing everything out', () => {
    let contracts = 0;
    for (let deal = 0; deal < 100; deal += 1) {
      const calls = runAuction(dealHands(), 'north');
      if (finalContract(calls)) {
        contracts += 1;
      }
    }
    // Roughly one deal in eight is genuinely passed out at a real table.
    expect(contracts).toBeGreaterThan(70);
  });
});
