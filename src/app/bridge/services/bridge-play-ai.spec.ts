import { describe, expect, it } from 'vitest';
import { Card } from '../../cards/card.models';
import { BridgeTrick, Seat, Strain } from '../bridge.models';
import { PlayContext, chooseBridgeCard } from './bridge-play-ai';

const card = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });

const trick = (leader: Seat, ...plays: Array<[Seat, Card]>): BridgeTrick => ({
  leader,
  cards: plays.map(([seat, played]) => ({ seat, card: played }))
});

const context = (overrides: Partial<PlayContext>): PlayContext => ({
  seat: 'south',
  partner: 'north',
  hand: [],
  trick: trick('south'),
  strain: 'notrump',
  played: [],
  visiblePartner: null,
  isDeclarerSide: false,
  ...overrides
});

describe('chooseBridgeCard', () => {
  it('plays the only legal card without thinking about it', () => {
    const chosen = chooseBridgeCard(
      context({
        hand: [card('3', 'clubs'), card('K', 'hearts')],
        trick: trick('west', ['west', card('7', 'clubs')])
      })
    );
    expect(chosen).toEqual(card('3', 'clubs'));
  });

  it('leads the top of a sequence rather than breaking it up', () => {
    const chosen = chooseBridgeCard(
      context({ hand: [card('Q', 'hearts'), card('J', 'hearts'), card('4', 'hearts'), card('2', 'clubs')] })
    );
    expect(chosen).toEqual(card('Q', 'hearts'));
  });

  it('leads fourth best from a long ragged suit', () => {
    const chosen = chooseBridgeCard(
      context({
        hand: [card('K', 'spades'), card('9', 'spades'), card('6', 'spades'), card('4', 'spades'), card('2', 'clubs')]
      })
    );
    expect(chosen).toEqual(card('4', 'spades'));
  });

  it('draws trumps as declarer while the defenders still hold some', () => {
    const chosen = chooseBridgeCard(
      context({
        strain: 'spades',
        isDeclarerSide: true,
        visiblePartner: [card('4', 'spades'), card('3', 'hearts')],
        hand: [card('A', 'spades'), card('K', 'spades'), card('2', 'hearts')]
      })
    );
    expect(chosen.suit).toBe('spades');
    expect(chosen.rank).toBe('A');
  });

  it('stops pulling trumps once none are outstanding', () => {
    // Eleven trumps are accounted for between the two hands and two more have been played.
    const played = [card('5', 'spades'), card('6', 'spades')];
    const hand = [card('A', 'spades'), card('K', 'spades'), card('Q', 'spades'), card('J', 'spades'),
      card('10', 'spades'), card('9', 'spades'), card('2', 'hearts'), card('3', 'hearts')];
    const visiblePartner = [card('8', 'spades'), card('7', 'spades'), card('4', 'spades'), card('3', 'spades'),
      card('2', 'spades')];
    const chosen = chooseBridgeCard(
      context({ strain: 'spades', isDeclarerSide: true, visiblePartner, hand, played })
    );
    expect(chosen.suit).toBe('hearts');
  });

  it('wins as cheaply as it can in fourth seat', () => {
    const chosen = chooseBridgeCard(
      context({
        seat: 'south',
        hand: [card('A', 'clubs'), card('9', 'clubs'), card('2', 'clubs')],
        trick: trick(
          'west',
          ['west', card('5', 'clubs')],
          ['north', card('3', 'clubs')],
          ['east', card('8', 'clubs')]
        )
      })
    );
    expect(chosen).toEqual(card('9', 'clubs'));
  });

  it('ducks when partner already holds the trick', () => {
    const chosen = chooseBridgeCard(
      context({
        hand: [card('A', 'clubs'), card('2', 'clubs')],
        trick: trick(
          'west',
          ['west', card('5', 'clubs')],
          ['north', card('K', 'clubs')],
          ['east', card('3', 'clubs')]
        )
      })
    );
    expect(chosen).toEqual(card('2', 'clubs'));
  });

  it('ruffs rather than discarding when it cannot follow', () => {
    const chosen = chooseBridgeCard(
      context({
        strain: 'spades',
        hand: [card('4', 'spades'), card('K', 'hearts'), card('2', 'hearts')],
        trick: trick('west', ['west', card('A', 'clubs')], ['north', card('3', 'clubs')], ['east', card('2', 'clubs')])
      })
    );
    expect(chosen).toEqual(card('4', 'spades'));
  });

  it('keeps trumps back when it is only discarding', () => {
    const chosen = chooseBridgeCard(
      context({
        strain: 'spades',
        hand: [card('4', 'spades'), card('7', 'hearts'), card('2', 'hearts')],
        // Partner already owns the trick with the ace, so there is nothing to win here.
        trick: trick('west', ['west', card('2', 'clubs')], ['north', card('A', 'clubs')]),
        partner: 'north'
      })
    );
    expect(chosen).toEqual(card('2', 'hearts'));
  });
});
