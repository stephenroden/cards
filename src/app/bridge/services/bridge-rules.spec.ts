import { describe, expect, it } from 'vitest';
import { Card } from '../../cards/card.models';
import { BridgeTrick, Seat } from '../bridge.models';
import { legalPlays, openingLeader, trickWinner } from './bridge-rules';

const card = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });

const trick = (leader: Seat, ...plays: Array<[Seat, Card]>): BridgeTrick => ({
  leader,
  cards: plays.map(([seat, played]) => ({ seat, card: played }))
});

describe('legalPlays', () => {
  const hand = [card('2', 'clubs'), card('K', 'clubs'), card('5', 'hearts'), card('A', 'spades')];

  it('lets any card lead an empty trick', () => {
    expect(legalPlays(hand, trick('south'))).toHaveLength(4);
  });

  it('forces following suit when the suit is held', () => {
    const played = legalPlays(hand, trick('west', ['west', card('7', 'clubs')]));
    expect(played.map((c) => c.rank)).toEqual(['2', 'K']);
  });

  it('frees the hand when the led suit is void', () => {
    const played = legalPlays(hand, trick('west', ['west', card('7', 'diamonds')]));
    expect(played).toHaveLength(4);
  });
});

describe('trickWinner', () => {
  const fullTrick = trick(
    'west',
    ['west', card('K', 'clubs')],
    ['north', card('3', 'clubs')],
    ['east', card('A', 'clubs')],
    ['south', card('5', 'clubs')]
  );

  it('gives a notrump trick to the highest card of the led suit', () => {
    expect(trickWinner(fullTrick, 'notrump')).toBe('east');
  });

  it('ignores cards that did not follow suit', () => {
    const offSuit = trick(
      'west',
      ['west', card('9', 'clubs')],
      ['north', card('A', 'hearts')],
      ['east', card('2', 'clubs')],
      ['south', card('K', 'diamonds')]
    );
    expect(trickWinner(offSuit, 'notrump')).toBe('west');
  });

  it('lets a trump beat any card of the led suit', () => {
    const ruffed = trick(
      'west',
      ['west', card('A', 'clubs')],
      ['north', card('2', 'spades')],
      ['east', card('K', 'clubs')],
      ['south', card('3', 'clubs')]
    );
    expect(trickWinner(ruffed, 'spades')).toBe('north');
  });

  it('gives an over-ruff to the higher trump', () => {
    const overRuffed = trick(
      'west',
      ['west', card('A', 'clubs')],
      ['north', card('2', 'spades')],
      ['east', card('Q', 'spades')],
      ['south', card('3', 'clubs')]
    );
    expect(trickWinner(overRuffed, 'spades')).toBe('east');
  });

  it('treats a trump lead as an ordinary suit', () => {
    const trumpLead = trick(
      'west',
      ['west', card('J', 'spades')],
      ['north', card('4', 'spades')],
      ['east', card('A', 'spades')],
      ['south', card('9', 'hearts')]
    );
    expect(trickWinner(trumpLead, 'spades')).toBe('east');
  });
});

describe('openingLeader', () => {
  it('starts on declarer left', () => {
    expect(openingLeader('south')).toBe('west');
    expect(openingLeader('west')).toBe('north');
  });
});
