import { describe, expect, it } from 'vitest';
import { Seat, Strain } from '../bridge.models';
import {
  AuctionCall,
  Call,
  auctionIsComplete,
  finalContract,
  isLegalCall,
  isPassedOut,
  seatToCall
} from './bridge-auction';

const bid = (level: number, strain: Strain): Call => ({ type: 'bid', level, strain });
const pass: Call = { type: 'pass' };
const dbl: Call = { type: 'double' };
const redbl: Call = { type: 'redouble' };

const auction = (...entries: Array<[Seat, Call]>): AuctionCall[] =>
  entries.map(([seat, call]) => ({ seat, call }));

describe('bid legality', () => {
  it('accepts any opening bid but requires later bids to be higher', () => {
    expect(isLegalCall([], 'north', bid(1, 'clubs'))).toBe(true);
    const opened = auction(['north', bid(1, 'spades')]);
    expect(isLegalCall(opened, 'east', bid(1, 'notrump'))).toBe(true);
    expect(isLegalCall(opened, 'east', bid(1, 'hearts'))).toBe(false);
    expect(isLegalCall(opened, 'east', bid(2, 'clubs'))).toBe(true);
  });

  it('ranks notrump above every suit at the same level', () => {
    const opened = auction(['north', bid(3, 'notrump')]);
    expect(isLegalCall(opened, 'east', bid(3, 'spades'))).toBe(false);
    expect(isLegalCall(opened, 'east', bid(4, 'clubs'))).toBe(true);
  });

  it('rejects bids outside the seven levels', () => {
    expect(isLegalCall([], 'north', bid(0, 'clubs'))).toBe(false);
    expect(isLegalCall([], 'north', bid(8, 'clubs'))).toBe(false);
  });

  it('only doubles an opponent bid', () => {
    const byOpponent = auction(['north', bid(1, 'spades')]);
    expect(isLegalCall(byOpponent, 'east', dbl)).toBe(true);
    // North is south's partner, so south cannot double it.
    expect(isLegalCall(byOpponent, 'south', dbl)).toBe(false);
    expect(isLegalCall([], 'east', dbl)).toBe(false);
  });

  it('doubles through intervening passes', () => {
    const withPasses = auction(['north', bid(1, 'spades')], ['east', pass], ['south', pass]);
    expect(isLegalCall(withPasses, 'west', dbl)).toBe(true);
  });

  it('only redoubles an opponent double', () => {
    const doubled = auction(['north', bid(1, 'spades')], ['east', dbl]);
    expect(isLegalCall(doubled, 'south', redbl)).toBe(true);
    expect(isLegalCall(doubled, 'north', redbl)).toBe(true);
    // East cannot redouble its own double.
    expect(isLegalCall(doubled, 'east', redbl)).toBe(false);
    expect(isLegalCall(doubled, 'south', dbl)).toBe(false);
  });
});

describe('auction completion', () => {
  it('stays open until three passes follow a bid', () => {
    const open = auction(['north', bid(1, 'spades')], ['east', pass], ['south', pass]);
    expect(auctionIsComplete(open)).toBe(false);
    expect(auctionIsComplete([...open, { seat: 'west', call: pass }])).toBe(true);
  });

  it('closes a hand nobody wanted after four passes', () => {
    const allPass = auction(['north', pass], ['east', pass], ['south', pass], ['west', pass]);
    expect(auctionIsComplete(allPass)).toBe(true);
    expect(isPassedOut(allPass)).toBe(true);
    expect(finalContract(allPass)).toBeNull();
  });

  it('does not close on three passes that opened the auction', () => {
    const opening = auction(['north', pass], ['east', pass], ['south', pass]);
    expect(auctionIsComplete(opening)).toBe(false);
  });
});

describe('finalContract', () => {
  it('takes the last bid as the contract', () => {
    const calls = auction(
      ['north', bid(1, 'spades')],
      ['east', bid(2, 'hearts')],
      ['south', bid(2, 'spades')],
      ['west', pass],
      ['north', pass],
      ['east', pass]
    );
    expect(finalContract(calls)).toEqual({ level: 2, strain: 'spades', declarer: 'north', risk: 'none' });
  });

  it('makes the partner who named the strain first the declarer', () => {
    // South bids the final 4H, but North mentioned hearts first, so North declares.
    const calls = auction(
      ['north', bid(1, 'hearts')],
      ['east', pass],
      ['south', bid(4, 'hearts')],
      ['west', pass],
      ['north', pass],
      ['east', pass]
    );
    expect(finalContract(calls)?.declarer).toBe('north');
  });

  it('ignores the same strain bid by the other partnership', () => {
    // East bid hearts first, but East/West did not win the auction.
    const calls = auction(
      ['east', bid(1, 'hearts')],
      ['south', bid(2, 'hearts')],
      ['west', pass],
      ['north', bid(4, 'hearts')],
      ['east', pass],
      ['south', pass],
      ['west', pass]
    );
    expect(finalContract(calls)?.declarer).toBe('south');
  });

  it('carries the double and redouble into the contract', () => {
    const doubled = auction(['north', bid(4, 'spades')], ['east', dbl], ['south', pass], ['west', pass], ['north', pass]);
    expect(finalContract(doubled)?.risk).toBe('doubled');

    const redoubled = auction(
      ['north', bid(4, 'spades')],
      ['east', dbl],
      ['south', redbl],
      ['west', pass],
      ['north', pass],
      ['east', pass]
    );
    expect(finalContract(redoubled)?.risk).toBe('redoubled');
  });

  it('drops a double once the bidding moves on past it', () => {
    const calls = auction(
      ['north', bid(1, 'spades')],
      ['east', dbl],
      ['south', bid(2, 'spades')],
      ['west', pass],
      ['north', pass],
      ['east', pass]
    );
    expect(finalContract(calls)?.risk).toBe('none');
  });
});

describe('seatToCall', () => {
  it('starts with the dealer and runs clockwise', () => {
    expect(seatToCall('north', [])).toBe('north');
    expect(seatToCall('north', auction(['north', pass]))).toBe('east');
    expect(seatToCall('north', auction(['north', pass], ['east', pass]))).toBe('south');
    expect(seatToCall('west', auction(['west', pass]))).toBe('north');
  });
});
