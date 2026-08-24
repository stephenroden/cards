import { Card } from '../../cards/card.models';
import {
  BlackjackActionType,
  BlackjackHand,
  BlackjackRules,
  BlackjackSeat,
  MIN_BET,
  PROFILE_BETTING
} from '../blackjack.models';
import { cardValue, handValue } from './blackjack-hand';

/** Basic strategy reads an ace upcard as 11 and every ten-count card as 10. */
const upcardValue = (card: Card): number => (card.rank === 'A' ? 11 : cardValue(card));

const inRange = (value: number, low: number, high: number): boolean => value >= low && value <= high;

const shouldSurrender = (total: number, soft: boolean, up: number, rules: BlackjackRules): boolean => {
  if (soft) {
    return false;
  }
  if (total === 16 && inRange(up, 9, 10)) {
    return true;
  }
  if (total === 15 && up === 10) {
    return true;
  }
  // A dealer who hits soft 17 is strong enough to give up more marginal hands against an ace.
  if (!rules.dealerHitsSoft17) {
    return false;
  }
  return (total === 16 || total === 15 || total === 17) && up === 11;
};

const shouldSplit = (pairValue: number, isAces: boolean, up: number, rules: BlackjackRules): boolean => {
  if (isAces) {
    return true;
  }
  const das = rules.doubleAfterSplit;
  switch (pairValue) {
    case 10:
      return false;
    case 9:
      return inRange(up, 2, 6) || up === 8 || up === 9;
    case 8:
      return true;
    case 7:
      return inRange(up, 2, 7);
    case 6:
      return inRange(up, das ? 2 : 3, 6);
    case 5:
      return false;
    case 4:
      return das && inRange(up, 5, 6);
    default:
      return inRange(up, das ? 2 : 4, 7);
  }
};

const shouldDouble = (total: number, soft: boolean, up: number, rules: BlackjackRules): boolean => {
  if (soft) {
    if (total === 19) {
      return rules.dealerHitsSoft17 && up === 6;
    }
    if (total === 18) {
      return inRange(up, 3, 6);
    }
    if (total === 17) {
      return inRange(up, 3, 6);
    }
    if (total === 16 || total === 15) {
      return inRange(up, 4, 6);
    }
    return (total === 14 || total === 13) && inRange(up, 5, 6);
  }

  if (total === 11) {
    return up !== 11 || rules.dealerHitsSoft17;
  }
  if (total === 10) {
    return inRange(up, 2, 9);
  }
  return total === 9 && inRange(up, 3, 6);
};

const shouldStand = (total: number, soft: boolean, up: number): boolean => {
  if (soft) {
    if (total >= 19) {
      return true;
    }
    return total === 18 && inRange(up, 2, 8);
  }
  if (total >= 17) {
    return true;
  }
  if (inRange(total, 13, 16)) {
    return inRange(up, 2, 6);
  }
  return total === 12 && inRange(up, 4, 6);
};

/**
 * Multi-deck basic strategy, narrowed to the actions the table is actually offering.
 * The chart assumes double-after-split and late surrender; both are read off the rules.
 */
export const chooseBlackjackAction = (
  hand: BlackjackHand,
  dealerUp: Card,
  legal: BlackjackActionType[],
  rules: BlackjackRules
): BlackjackActionType => {
  const up = upcardValue(dealerUp);
  const { total, soft } = handValue(hand.cards);
  const isPair = hand.cards.length === 2 && cardValue(hand.cards[0]) === cardValue(hand.cards[1]);
  const isAces = isPair && hand.cards[0].rank === 'A';
  const allows = (action: BlackjackActionType): boolean => legal.includes(action);

  // A pair of eights is always split rather than given up, so it never reaches the surrender chart.
  if (allows('surrender') && !(isPair && cardValue(hand.cards[0]) === 8) && shouldSurrender(total, soft, up, rules)) {
    return 'surrender';
  }
  if (isPair && allows('split') && shouldSplit(cardValue(hand.cards[0]), isAces, up, rules)) {
    return 'split';
  }

  const wantsDouble = shouldDouble(total, soft, up, rules);
  if (wantsDouble && allows('double')) {
    return 'double';
  }
  // A double the table will not allow reverts to hitting, except soft 18 which is happy to stand.
  if (wantsDouble && !(soft && total === 18)) {
    return allows('hit') ? 'hit' : 'stand';
  }

  if (shouldStand(total, soft, up) || wantsDouble) {
    return 'stand';
  }
  return allows('hit') ? 'hit' : 'stand';
};

/** CPU seats flat bet their profile base and press it only while the last hand was a winner. */
export const chooseSeatBet = (seat: BlackjackSeat): number => {
  const style = PROFILE_BETTING[seat.profile ?? 'steady'];
  const target = seat.lastNet > 0 ? style.base * style.pressWin : style.base;
  const rounded = Math.max(MIN_BET, Math.round(target / MIN_BET) * MIN_BET);
  return Math.min(rounded, seat.bankroll);
};
