import { Contract, Risk, Seat, Strain, nextSeat, partnershipOf } from '../bridge.models';

export type Call =
  | { type: 'bid'; level: number; strain: Strain }
  | { type: 'pass' }
  | { type: 'double' }
  | { type: 'redouble' };

export interface AuctionCall {
  seat: Seat;
  call: Call;
}

/** Notrump outranks every suit, and the suits rank in the usual bridge order. */
const STRAIN_RANK: Record<Strain, number> = {
  clubs: 0,
  diamonds: 1,
  hearts: 2,
  spades: 3,
  notrump: 4
};

export const bidValue = (level: number, strain: Strain): number => level * 5 + STRAIN_RANK[strain];

export const callIsBid = (call: Call): call is { type: 'bid'; level: number; strain: Strain } =>
  call.type === 'bid';

export const lastBid = (calls: AuctionCall[]): AuctionCall | null => {
  for (let index = calls.length - 1; index >= 0; index -= 1) {
    if (callIsBid(calls[index].call)) {
      return calls[index];
    }
  }
  return null;
};

/** The most recent call that was not a pass; doubles and redoubles hang off this. */
const lastMeaningful = (calls: AuctionCall[]): AuctionCall | null => {
  for (let index = calls.length - 1; index >= 0; index -= 1) {
    if (calls[index].call.type !== 'pass') {
      return calls[index];
    }
  }
  return null;
};

export const isLegalCall = (calls: AuctionCall[], seat: Seat, call: Call): boolean => {
  if (call.type === 'pass') {
    return true;
  }

  if (call.type === 'bid') {
    if (call.level < 1 || call.level > 7) {
      return false;
    }
    const previous = lastBid(calls);
    if (!previous || !callIsBid(previous.call)) {
      return true;
    }
    return bidValue(call.level, call.strain) > bidValue(previous.call.level, previous.call.strain);
  }

  const standing = lastMeaningful(calls);
  if (!standing) {
    return false;
  }
  const opposing = partnershipOf(standing.seat) !== partnershipOf(seat);

  // You can only double an opponent's live contract bid.
  if (call.type === 'double') {
    return standing.call.type === 'bid' && opposing;
  }
  // And you can only redouble an opponent's double of your own side's bid.
  return standing.call.type === 'double' && opposing;
};

export const legalCalls = (calls: AuctionCall[], seat: Seat): Call[] => {
  const options: Call[] = [{ type: 'pass' }, { type: 'double' }, { type: 'redouble' }];
  return options.filter((call) => isLegalCall(calls, seat, call));
};

/**
 * The auction closes on three passes after a bid, or on four passes with nothing bid at all.
 */
export const auctionIsComplete = (calls: AuctionCall[]): boolean => {
  if (calls.length < 4) {
    return false;
  }
  const trailing = calls.slice(-3);
  if (!trailing.every((entry) => entry.call.type === 'pass')) {
    return false;
  }
  return lastBid(calls) !== null || calls.length === 4;
};

export const isPassedOut = (calls: AuctionCall[]): boolean =>
  calls.length === 4 && calls.every((entry) => entry.call.type === 'pass');

const riskFrom = (calls: AuctionCall[], bidIndex: number): Risk => {
  let risk: Risk = 'none';
  for (let index = bidIndex + 1; index < calls.length; index += 1) {
    const call = calls[index].call;
    if (call.type === 'double') {
      risk = 'doubled';
    }
    if (call.type === 'redouble') {
      risk = 'redoubled';
    }
  }
  return risk;
};

/**
 * Declarer is not whoever bid last: it is whichever member of the winning partnership
 * mentioned the final strain first, which is often the partner.
 */
export const finalContract = (calls: AuctionCall[]): Contract | null => {
  const winning = lastBid(calls);
  if (!winning || !callIsBid(winning.call)) {
    return null;
  }

  const { level, strain } = winning.call;
  const side = partnershipOf(winning.seat);
  const opener = calls.find(
    (entry) => callIsBid(entry.call) && entry.call.strain === strain && partnershipOf(entry.seat) === side
  );

  return {
    level,
    strain,
    declarer: opener ? opener.seat : winning.seat,
    risk: riskFrom(calls, calls.indexOf(winning))
  };
};

export const seatToCall = (dealer: Seat, calls: AuctionCall[]): Seat => {
  let seat = dealer;
  for (let index = 0; index < calls.length; index += 1) {
    seat = nextSeat(seat);
  }
  return seat;
};
