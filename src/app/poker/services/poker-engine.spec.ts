import { TestBed } from '@angular/core/testing';
import { PokerAiService } from './poker-ai.service';
import { PokerEngineService } from './poker-engine.service';
import { PokerStateService } from './poker-state.service';

describe('PokerEngineService', () => {
  let engine: PokerEngineService;
  let stateService: PokerStateService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [PokerEngineService, PokerStateService, PokerAiService]
    });
    engine = TestBed.inject(PokerEngineService);
    stateService = TestBed.inject(PokerStateService);
  });

  it('starts a hand with blinds and two cards per active player', () => {
    engine.startSession();
    const state = stateService.state();
    const active = state.players.filter((player) => !player.eliminated);

    expect(state.phase).toBe('preflop');
    expect(active.every((player) => player.hand.length === 2)).toBe(true);
    expect(state.players.some((player) => player.totalCommitted > 0)).toBe(true);
  });

  it('exposes legal human actions for current turn', () => {
    engine.startSession();
    const state = stateService.state();
    const human = state.players[state.actingIndex];

    if (human?.type !== 'human') {
      expect(human?.type).toBe('cpu');
      return;
    }

    const legal = engine.legalActions(state, human);
    expect(legal.length).toBeGreaterThan(0);
  });

  it('uses player names in showdown messages', () => {
    engine.startSession();
    const state = stateService.state();
    const nextPlayers = state.players.map((player) => ({
      ...player,
      hand:
        player.id === 'p4'
          ? [
              { suit: 'spades' as const, rank: 'A' as const },
              { suit: 'clubs' as const, rank: 'A' as const }
            ]
          : [
              { suit: 'clubs' as const, rank: '2' as const },
              { suit: 'diamonds' as const, rank: '3' as const }
            ],
      folded: player.id !== 'p4',
      allIn: false,
      currentBet: 0,
      totalCommitted: 10,
      acted: true,
      eliminated: false,
      stack: 100
    }));

    stateService.setState({
      ...state,
      phase: 'river',
      street: 'river',
      players: nextPlayers,
      communityCards: [
        { suit: 'hearts' as const, rank: 'K' as const },
        { suit: 'diamonds' as const, rank: 'Q' as const },
        { suit: 'clubs' as const, rank: 'J' as const },
        { suit: 'spades' as const, rank: '9' as const },
        { suit: 'hearts' as const, rank: '4' as const }
      ],
      currentBet: 0,
      actingIndex: 0,
      winners: [],
      lastHandNet: {},
      message: ''
    });

    (engine as unknown as { resolveShowdown: () => void }).resolveShowdown();

    expect(stateService.state().message).toContain('Milo');
    expect(stateService.state().message).not.toContain('p4');
  });

  it('restores poker state from localStorage after service recreation', () => {
    engine.startSession();
    const savedState = stateService.state();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [PokerStateService]
    });

    const restoredService = TestBed.inject(PokerStateService);

    expect(restoredService.state()).toEqual(savedState);
  });
});
