import { compareHands, evaluateBestHand } from './poker-hand-evaluator';
import { Card } from '../../cards/card.models';
const card = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });

describe('poker-hand-evaluator', () => {
  it('ranks flush above straight', () => {
    const flush = [
      card('A', 'hearts'),
      card('J', 'hearts'),
      card('8', 'hearts'),
      card('4', 'hearts'),
      card('2', 'hearts'),
      card('9', 'clubs'),
      card('7', 'spades')
    ];

    const straight = [
      card('9', 'spades'),
      card('8', 'clubs'),
      card('7', 'hearts'),
      card('6', 'diamonds'),
      card('5', 'spades'),
      card('A', 'clubs'),
      card('2', 'diamonds')
    ];

    expect(compareHands(flush, straight)).toBeGreaterThan(0);
    expect(evaluateBestHand(flush).category).toBe(5);
  });

  it('handles wheel straight (A-2-3-4-5)', () => {
    const hand = [
      card('A', 'spades'),
      card('2', 'clubs'),
      card('3', 'hearts'),
      card('4', 'diamonds'),
      card('5', 'spades'),
      card('K', 'clubs'),
      card('Q', 'diamonds')
    ];

    const value = evaluateBestHand(hand);
    expect(value.category).toBe(4);
    expect(value.tiebreakers[0]).toBe(5);
  });

  it('returns the exact five cards and label for the best hand', () => {
    const hand = [
      card('A', 'hearts'),
      card('K', 'hearts'),
      card('Q', 'hearts'),
      card('J', 'hearts'),
      card('10', 'hearts'),
      card('2', 'clubs'),
      card('3', 'spades')
    ];

    const value = evaluateBestHand(hand);
    expect(value.label).toBe('Straight Flush');
    expect(value.cards).toHaveLength(5);
    expect(value.cards.every((cardItem) => cardItem.suit === 'hearts')).toBe(true);
  });
});
