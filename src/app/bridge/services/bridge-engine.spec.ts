import { beforeEach, describe, expect, it } from 'vitest';
import { Card } from '../../cards/card.models';
import { BridgeState, Contract, Seat, nextSeat } from '../bridge.models';
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

  it('lets the player run both hands when partner wins the contract', () => {
    // The auction can make north declarer, which would otherwise leave the player as dummy.
    engine.setContract(contract({ declarer: 'north' }));
    expect(engine.humanControls(current(), 'north')).toBe(true);
    expect(engine.humanControls(current(), 'south')).toBe(true);
    expect(engine.humanControls(current(), 'west')).toBe(false);
    expect(engine.dummySeat(current())).toBe('south');
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

  describe('auction', () => {
    /** Passes for south until the table settles on a contract. */
    const settle = (limit = 40): void => {
      engine.openAuction();
      for (let step = 0; step < limit && current().phase === 'auction'; step += 1) {
        if (current().auction.length === 0) {
          engine.openAuction();
          continue;
        }
        engine.makeCall({ type: 'pass' });
      }
    };

    it('starts on the auction rather than a contract picker', () => {
      expect(current().phase).toBe('auction');
      expect(current().auction).toEqual([]);
      expect(current().contract).toBeNull();
    });

    it('runs the CPU seats up to the player turn to call', () => {
      engine.openAuction();
      const state = current();
      if (state.phase === 'auction') {
        // Everyone before south has called, and south is now on turn.
        expect(engine.seatToCall(state)).toBe('south');
        expect(state.auction.every((entry) => entry.seat !== 'south')).toBe(true);
      }
    });

    /** North deals and has opened, so south is on turn with a live bid to act over. */
    const southOnTurn = (): void => {
      state.setState({
        ...initialBridgeState(1),
        auction: [
          { seat: 'north', call: { type: 'bid', level: 1, strain: 'spades' } },
          { seat: 'east', call: { type: 'pass' } }
        ]
      });
    };

    it('records the player call and carries the auction on', () => {
      southOnTurn();
      expect(engine.seatToCall(current())).toBe('south');

      engine.makeCall({ type: 'pass' });
      expect(current().auction.some((entry) => entry.seat === 'south')).toBe(true);
    });

    it('refuses a call that is not legal', () => {
      southOnTurn();
      const before = current().auction.length;
      // A redouble with no double standing is never legal.
      engine.makeCall({ type: 'redouble' });
      expect(current().auction.length).toBe(before);

      // Nor is a bid that does not outrank the standing one.
      engine.makeCall({ type: 'bid', level: 1, strain: 'clubs' });
      expect(current().auction.length).toBe(before);
    });

    it('accepts a legal raise from the player', () => {
      southOnTurn();
      engine.makeCall({ type: 'bid', level: 2, strain: 'spades' });
      expect(current().auction.some((entry) => entry.seat === 'south' && entry.call.type === 'bid')).toBe(true);
    });

    it('settles on a contract and opens play with the lead already made', () => {
      settle();
      expect(current().phase).toBe('play');
      const contract = current().contract;
      expect(contract).not.toBeNull();
      expect(contract!.level).toBeGreaterThanOrEqual(1);
      // The opening lead is on the table by the time control returns.
      expect(current().trick.leader).toBe(nextSeat(contract!.declarer));
      expect(current().dummyRevealed).toBe(true);
    });

    it('plays a full deal through the auction with no contract picked by hand', () => {
      settle();
      playOutDeal();
      expect(current().phase).toBe('deal-summary');
      expect(current().history).toHaveLength(1);
      expect(current().completedTricks).toBe(13);
    });

    it('redeals a hand nobody bids', () => {
      // Four passes leaves no contract, so the same dealer deals again.
      // Deal 4 is dealt by west, so south is the fourth and final caller.
      state.setState({
        ...initialBridgeState(4),
        auction: [
          { seat: 'west', call: { type: 'pass' } },
          { seat: 'north', call: { type: 'pass' } },
          { seat: 'east', call: { type: 'pass' } }
        ]
      });
      const before = current().players.map((player) => player.hand.length);
      engine.makeCall({ type: 'pass' });

      expect(before).toEqual([13, 13, 13, 13]);
      expect(current().phase).toBe('auction');
      expect(current().dealNumber).toBe(4);
      expect(current().auction).toEqual([]);
      expect(current().message).toContain('Passed out');
    });
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
