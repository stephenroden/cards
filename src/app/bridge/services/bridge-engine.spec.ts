import { beforeEach, describe, expect, it } from 'vitest';
import { Card } from '../../cards/card.models';
import { BridgeState, Contract, Seat } from '../bridge.models';
import { BridgeEngineService } from './bridge-engine.service';
import { BridgeStateService, initialBridgeState } from './bridge-state.service';
import { buildDeck, dealHands } from './bridge-deal';

const contract = (overrides: Partial<Contract> = {}): Contract => ({
  level: 3,
  strain: 'notrump',
  declarer: 'south',
  risk: 'none',
  ...overrides
});

describe('BridgeEngineService', () => {
  let state: BridgeStateService;
  let engine: BridgeEngineService;

  const current = (): BridgeState => state.state();

  /** Drives a deal to its end, always playing the first legal card for the seats we control. */
  const playOutDeal = (limit = 400): void => {
    for (let step = 0; step < limit; step += 1) {
      const now = current();
      if (now.phase !== 'play') {
        return;
      }
      if (now.trickComplete) {
        engine.acknowledgeTrick();
        continue;
      }
      const legal = engine.legalPlaysFor(now, now.turn);
      expect(legal.length).toBeGreaterThan(0);
      engine.playCard(legal[0]);
    }
    throw new Error('deal did not finish within the step limit');
  };

  beforeEach(() => {
    globalThis.localStorage?.clear();
    state = new BridgeStateService();
    engine = new BridgeEngineService(state);
    state.setState(initialBridgeState());
  });

  it('opens the lead from the seat on declarer left', () => {
    engine.setContract(contract({ declarer: 'south' }));
    // West leads, so by the time control returns a card is already on the table.
    expect(current().trick.leader).toBe('west');
    expect(current().trick.cards[0].seat).toBe('west');
  });

  it('exposes dummy once the opening lead is made', () => {
    expect(current().dummyRevealed).toBe(false);
    engine.setContract(contract({ declarer: 'south' }));
    expect(current().dummyRevealed).toBe(true);
    expect(engine.dummySeat(current())).toBe('north');
  });

  it('gives the player dummy cards to play when they declare', () => {
    engine.setContract(contract({ declarer: 'south' }));
    expect(engine.humanControls(current(), 'north')).toBe(true);
    expect(engine.humanControls(current(), 'east')).toBe(false);
  });

  it('leaves the player defending when the opponents declare', () => {
    engine.setContract(contract({ declarer: 'east' }));
    expect(engine.humanControls(current(), 'north')).toBe(false);
    expect(engine.humanControls(current(), 'south')).toBe(true);
    expect(engine.dummySeat(current())).toBe('west');
  });

  it('holds a finished trick on the table until it is acknowledged', () => {
    engine.setContract(contract({ declarer: 'east' }));
    // South defends; play until a trick fills up.
    for (let step = 0; step < 8 && !current().trickComplete; step += 1) {
      const legal = engine.legalPlaysFor(current(), current().turn);
      if (legal.length === 0) {
        break;
      }
      engine.playCard(legal[0]);
    }

    expect(current().trickComplete).toBe(true);
    expect(current().trick.cards).toHaveLength(4);
    expect(current().trickWinnerSeat).not.toBeNull();

    const winner = current().trickWinnerSeat as Seat;
    engine.acknowledgeTrick();
    expect(current().trick.cards.length).toBeLessThan(4);
    expect(current().trick.leader).toBe(winner);
  });

  it('plays a whole deal out to thirteen tricks and scores it', () => {
    engine.setContract(contract({ level: 3, strain: 'notrump', declarer: 'south' }));
    playOutDeal();

    const done = current();
    expect(done.phase).toBe('deal-summary');
    expect(done.completedTricks).toBe(13);
    expect(done.tricksWon.ns + done.tricksWon.ew).toBe(13);
    expect(done.players.every((player) => player.hand.length === 0)).toBe(true);
    expect(done.history).toHaveLength(1);
    expect(done.scores.ns + done.scores.ew).toBeGreaterThan(0);
  });

  it('never plays a card a seat does not hold', () => {
    const deck = buildDeck();
    const hands = dealHands(deck);
    state.setState({
      ...initialBridgeState(),
      players: initialBridgeState().players.map((player) => ({ ...player, hand: hands[player.seat] }))
    });
    engine.setContract(contract({ level: 1, strain: 'spades', declarer: 'south' }));
    playOutDeal();

    const played = current().played;
    expect(played).toHaveLength(52);
    const unique = new Set(played.map((card: Card) => `${card.rank}${card.suit}`));
    expect(unique.size).toBe(52);
  });

  it('rotates dealer and vulnerability across the session and then stops', () => {
    expect(current().dealNumber).toBe(1);
    expect(current().vulnerability).toBe('none');

    for (let deal = 1; deal <= 4; deal += 1) {
      engine.setContract(contract({ declarer: 'south' }));
      playOutDeal();
      expect(current().phase).toBe('deal-summary');
      engine.nextDeal();
    }

    expect(current().phase).toBe('session-over');
    expect(current().history).toHaveLength(4);
  });

  it('gives each deal of the session its own vulnerability', () => {
    const seen: string[] = [];
    for (let deal = 1; deal <= 4; deal += 1) {
      seen.push(current().vulnerability);
      engine.setContract(contract({ declarer: 'south' }));
      playOutDeal();
      engine.nextDeal();
    }
    expect(seen).toEqual(['none', 'ns', 'ew', 'both']);
  });

  it('ignores plays that are not the player to act', () => {
    engine.setContract(contract({ declarer: 'east' }));
    const before = current();
    // A card from a seat the player does not control must not move the game on.
    const eastCard = engine.handOf(before, 'east')[0];
    engine.playCard(eastCard);
    expect(current().played).toEqual(before.played);
  });
});
