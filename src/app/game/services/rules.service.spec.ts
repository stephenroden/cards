import { TestBed } from '@angular/core/testing';
import { Card, DEFAULT_GAME_RULES, GameState, Player } from '../game.models';
import { RulesService } from './rules.service';

const basePlayer = (overrides: Partial<Player> = {}): Player => ({
  id: 'p1',
  name: 'You',
  type: 'human',
  hand: [],
  score: 0,
  ...overrides
});

const baseState = (overrides: Partial<GameState> = {}): GameState => ({
  phase: 'play',
  rules: DEFAULT_GAME_RULES,
  players: [],
  trick: { leaderId: 'p1', cards: [] },
  trickWinnerId: undefined,
  trickTaking: false,
  round: 1,
  turnPlayerId: 'p1',
  passDirection: 'left',
  heartsBroken: false,
  takenCards: {},
  playHistory: [],
  passTransfers: [],
  passSelections: {},
  aiDecisionReasons: {},
  aiDecisionTraces: {},
  aiDecisionHistory: {},
  debugRoundHistory: [],
  aiReasonVisibility: {},
  passComplete: false,
  ...overrides
});

const card = (suit: Card['suit'], rank: Card['rank']): Card => ({ suit, rank });

describe('RulesService', () => {
  let service: RulesService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(RulesService);
  });

  it('forces 2 of clubs on the first trick lead', () => {
    const player = basePlayer({ hand: [card('clubs', '2'), card('hearts', 'A')] });
    const state = baseState({ heartsBroken: false, trick: { leaderId: 'p1', cards: [] } });

    const legal = service.getLegalPlays(state, player);

    expect(legal).toEqual([card('clubs', '2')]);
  });

  it('prevents leading hearts before broken when alternatives exist', () => {
    const player = basePlayer({ hand: [card('hearts', '5'), card('clubs', 'K')] });
    const state = baseState({ heartsBroken: false, trick: { leaderId: 'p1', cards: [] } });

    const legal = service.getLegalPlays(state, player);

    expect(legal).toEqual([card('clubs', 'K')]);
  });

  it('requires following suit when possible', () => {
    const player = basePlayer({ hand: [card('spades', '2'), card('clubs', 'K')] });
    const state = baseState({
      trick: { leaderId: 'p2', cards: [{ playerId: 'p2', card: card('clubs', 'A') }] }
    });

    const legal = service.getLegalPlays(state, player);

    expect(legal).toEqual([card('clubs', 'K')]);
  });

  it('prevents points on the first trick when not leading if possible', () => {
    const player = basePlayer({ hand: [card('hearts', '5'), card('clubs', 'K')] });
    const state = baseState({
      trick: { leaderId: 'p2', cards: [{ playerId: 'p2', card: card('clubs', 'A') }] }
    });

    const legal = service.getLegalPlays(state, player);

    expect(legal).toEqual([card('clubs', 'K')]);
  });

  it('selects the highest card of the lead suit as trick winner', () => {
    const state = baseState({
      trick: {
        leaderId: 'p1',
        cards: [
          { playerId: 'p1', card: card('spades', '10') },
          { playerId: 'p2', card: card('spades', 'A') },
          { playerId: 'p3', card: card('hearts', 'Q') }
        ]
      }
    });

    expect(service.getTrickWinner(state)).toBe('p2');
  });
});
