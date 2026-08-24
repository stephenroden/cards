import { Card, SUITS, Suit } from '../../cards/card.models';
import { Seat, Strain, partnerOf } from '../bridge.models';
import { AuctionCall, Call, callIsBid, isLegalCall, lastBid } from './bridge-auction';

export interface BiddingContext {
  seat: Seat;
  hand: Card[];
  calls: AuctionCall[];
}

const HIGH_CARD_POINTS: Partial<Record<Card['rank'], number>> = { A: 4, K: 3, Q: 2, J: 1 };

export interface HandShape {
  hcp: number;
  length: Record<Suit, number>;
  balanced: boolean;
  longest: Suit;
  longestMajor: Suit | null;
}

export const evaluateHand = (hand: Card[]): HandShape => {
  const length = { clubs: 0, diamonds: 0, hearts: 0, spades: 0 } as Record<Suit, number>;
  let hcp = 0;
  for (const card of hand) {
    hcp += HIGH_CARD_POINTS[card.rank] ?? 0;
    length[card.suit] += 1;
  }

  const counts = SUITS.map((suit) => length[suit]);
  const balanced = !counts.some((count) => count <= 1) && counts.filter((count) => count === 2).length <= 1;
  const longest = SUITS.reduce((best, suit) => (length[suit] > length[best] ? suit : best));
  const majors: Suit[] = ['spades', 'hearts'];
  const bestMajor = majors.reduce((best, suit) => (length[suit] > length[best] ? suit : best));

  return { hcp, length, balanced, longest, longestMajor: length[bestMajor] >= 5 ? bestMajor : null };
};

/** Extra value for shortage, counted only once a trump fit is known. */
const supportPoints = (shape: HandShape): number =>
  SUITS.reduce((total, suit) => total + (shape.length[suit] === 0 ? 3 : shape.length[suit] === 1 ? 2 : 0), 0);

const pass: Call = { type: 'pass' };

const bid = (level: number, strain: Strain): Call => ({ type: 'bid', level, strain });

const bidsBy = (calls: AuctionCall[], seat: Seat): AuctionCall[] =>
  calls.filter((entry) => entry.seat === seat && callIsBid(entry.call));

const anyBidYet = (calls: AuctionCall[]): boolean => lastBid(calls) !== null;

/** The cheapest legal level at which a strain can still be bid. */
const cheapestLevel = (calls: AuctionCall[], strain: Strain): number => {
  const previous = lastBid(calls);
  if (!previous || !callIsBid(previous.call)) {
    return 1;
  }
  const { level, strain: openStrain } = previous.call;
  const order: Strain[] = ['clubs', 'diamonds', 'hearts', 'spades', 'notrump'];
  return order.indexOf(strain) > order.indexOf(openStrain) ? level : level + 1;
};

const openingCall = (shape: HandShape): Call => {
  if (shape.hcp >= 22) {
    return bid(2, 'clubs');
  }
  if (shape.balanced && shape.hcp >= 20 && shape.hcp <= 21) {
    return bid(2, 'notrump');
  }
  if (shape.balanced && shape.hcp >= 15 && shape.hcp <= 17) {
    return bid(1, 'notrump');
  }

  if (shape.hcp >= 12) {
    if (shape.longestMajor) {
      return bid(1, shape.longestMajor);
    }
    // With no five-card major, open the longer minor; equal length prefers the classics.
    const clubs = shape.length.clubs;
    const diamonds = shape.length.diamonds;
    if (diamonds > clubs) {
      return bid(1, 'diamonds');
    }
    if (clubs > diamonds) {
      return bid(1, 'clubs');
    }
    return bid(1, diamonds >= 4 ? 'diamonds' : 'clubs');
  }

  // Preempts: long suit, not enough strength to open at the one level.
  if (shape.hcp >= 5 && shape.hcp <= 10) {
    const long = shape.longest;
    if (shape.length[long] >= 7) {
      return bid(3, long);
    }
    if (shape.length[long] === 6 && long !== 'clubs') {
      return bid(2, long);
    }
  }

  return pass;
};

const responseToNotrump = (shape: HandShape, openLevel: number): Call => {
  if (shape.hcp <= 7) {
    return pass;
  }
  if (shape.longestMajor && shape.hcp >= 8) {
    return bid(openLevel + 1, shape.longestMajor);
  }
  if (shape.hcp >= 10) {
    return bid(3, 'notrump');
  }
  return bid(2, 'notrump');
};

const responseToSuit = (
  shape: HandShape,
  openStrain: Strain,
  calls: AuctionCall[]
): Call => {
  if (openStrain === 'notrump') {
    return responseToNotrump(shape, 1);
  }

  const total = shape.hcp + (shape.length[openStrain as Suit] >= 3 ? supportPoints(shape) : 0);
  const support = shape.length[openStrain as Suit] >= 3;
  const isMajor = openStrain === 'hearts' || openStrain === 'spades';

  if (shape.hcp < 6) {
    return pass;
  }

  if (support && isMajor) {
    if (total >= 13) {
      return bid(4, openStrain);
    }
    if (total >= 10) {
      return bid(3, openStrain);
    }
    return bid(2, openStrain);
  }

  // A new suit at the cheapest level keeps the auction alive.
  const candidate = SUITS.filter((suit) => suit !== openStrain && shape.length[suit] >= 4).sort(
    (left, right) => shape.length[right] - shape.length[left]
  )[0];
  if (candidate) {
    const level = cheapestLevel(calls, candidate);
    if (level <= 2 || shape.hcp >= 10) {
      return bid(level, candidate);
    }
  }

  if (shape.hcp >= 13) {
    return bid(3, 'notrump');
  }
  if (shape.hcp >= 10) {
    return bid(2, 'notrump');
  }
  return bid(cheapestLevel(calls, 'notrump'), 'notrump');
};

const overcall = (shape: HandShape, calls: AuctionCall[]): Call => {
  if (shape.hcp < 9 || shape.hcp > 17) {
    return pass;
  }
  const long = shape.longest;
  if (shape.length[long] < 5) {
    // Balanced strength opposite an opening bid is worth a notrump overcall.
    return shape.balanced && shape.hcp >= 15 && cheapestLevel(calls, 'notrump') === 1
      ? bid(1, 'notrump')
      : pass;
  }
  const level = cheapestLevel(calls, long);
  // Only come in cheaply; a long suit buys one extra level.
  const ceiling = shape.length[long] >= 6 ? 3 : 2;
  return level <= ceiling ? bid(level, long) : pass;
};

const rebid = (shape: HandShape, context: BiddingContext, partnerStrain: Strain | null): Call => {
  if (!partnerStrain) {
    return pass;
  }
  const support = partnerStrain !== 'notrump' && shape.length[partnerStrain as Suit] >= 4;
  const level = cheapestLevel(context.calls, partnerStrain);

  if (support && shape.hcp >= 15 && level <= 4) {
    return bid(level, partnerStrain);
  }
  if (support && shape.hcp >= 12 && level <= 3) {
    return bid(level, partnerStrain);
  }
  return pass;
};

/**
 * A natural, SAYC-flavoured bidding system: standard openings, simple raises and
 * responses, cheap overcalls. Every choice is checked for legality before it is returned,
 * so a heuristic that misfires passes rather than making an illegal call.
 */
export const chooseCall = (context: BiddingContext): Call => {
  const shape = evaluateHand(context.hand);
  const partner = partnerOf(context.seat);
  const partnerBids = bidsBy(context.calls, partner);
  const myBids = bidsBy(context.calls, context.seat);
  const opened = anyBidYet(context.calls);

  const decide = (): Call => {
    if (!opened) {
      return openingCall(shape);
    }

    if (partnerBids.length > 0) {
      const first = partnerBids[0].call;
      const partnerStrain = callIsBid(first) ? first.strain : null;
      if (myBids.length === 0 && partnerStrain) {
        return responseToSuit(shape, partnerStrain, context.calls);
      }
      return rebid(shape, context, partnerStrain);
    }

    // Only the opponents have bid so far.
    return myBids.length === 0 ? overcall(shape, context.calls) : pass;
  };

  const call = decide();
  return isLegalCall(context.calls, context.seat, call) ? call : pass;
};
