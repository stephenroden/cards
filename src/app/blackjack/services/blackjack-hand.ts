import { Card } from '../../cards/card.models';
import { BlackjackHand, BlackjackRules } from '../blackjack.models';

export interface HandValue {
  total: number;
  soft: boolean;
  busted: boolean;
}

export const cardValue = (card: Card): number => {
  if (card.rank === 'A') {
    return 11;
  }
  if (card.rank === 'K' || card.rank === 'Q' || card.rank === 'J' || card.rank === '10') {
    return 10;
  }
  return Number(card.rank);
};

/** Counts aces as 11 then demotes them one at a time while the hand is bust. */
export const handValue = (cards: Card[]): HandValue => {
  let total = 0;
  let aces = 0;

  for (const card of cards) {
    total += cardValue(card);
    if (card.rank === 'A') {
      aces += 1;
    }
  }

  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }

  return { total, soft: aces > 0, busted: total > 21 };
};

/** A natural: 21 on the first two cards of a hand that was never split. */
export const isBlackjack = (hand: BlackjackHand): boolean =>
  hand.splitDepth === 0 && hand.cards.length === 2 && handValue(hand.cards).total === 21;

export const isDealerBlackjack = (dealer: Card[]): boolean =>
  dealer.length === 2 && handValue(dealer).total === 21;

export const canHit = (hand: BlackjackHand): boolean =>
  hand.status === 'active' && !hand.fromSplitAces && handValue(hand.cards).total < 21;

export const canDouble = (hand: BlackjackHand, rules: BlackjackRules, bankroll: number): boolean => {
  if (hand.status !== 'active' || hand.cards.length !== 2 || hand.fromSplitAces) {
    return false;
  }
  if (hand.splitDepth > 0 && !rules.doubleAfterSplit) {
    return false;
  }
  return bankroll >= hand.bet;
};

export const canSplit = (
  hand: BlackjackHand,
  rules: BlackjackRules,
  bankroll: number,
  handCount: number
): boolean => {
  if (hand.status !== 'active' || hand.cards.length !== 2 || hand.fromSplitAces) {
    return false;
  }
  if (handCount > rules.maxSplits) {
    return false;
  }
  if (cardValue(hand.cards[0]) !== cardValue(hand.cards[1])) {
    return false;
  }
  return bankroll >= hand.bet;
};

/** Surrender is only offered as the very first decision of an unsplit hand. */
export const canSurrender = (hand: BlackjackHand, rules: BlackjackRules, handCount: number): boolean =>
  rules.surrenderAllowed &&
  hand.status === 'active' &&
  hand.cards.length === 2 &&
  hand.splitDepth === 0 &&
  handCount === 1;

export const dealerShouldHit = (dealer: Card[], rules: BlackjackRules): boolean => {
  const { total, soft } = handValue(dealer);
  if (total < 17) {
    return true;
  }
  return total === 17 && soft && rules.dealerHitsSoft17;
};

export const describeHandValue = (cards: Card[]): string => {
  const { total, soft, busted } = handValue(cards);
  if (busted) {
    return `${total} bust`;
  }
  if (soft && total !== 21) {
    return `${total - 10}/${total}`;
  }
  return `${total}`;
};
