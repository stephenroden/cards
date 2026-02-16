import { DEFAULT_GAME_RULES, type Card, type GameState, type Player } from '../game.models';
import { GameEngineService } from './game-engine.service';
import { scoreCard } from './scoring';

const card = (suit: Card['suit'], rank: Card['rank']): Card => ({ suit, rank });

const player = (id: string, score = 0): Player => ({
  id,
  name: id,
  type: 'cpu',
  aiProfileId: 'smart',
  hand: [],
  score
});

const baseState = (overrides: Partial<GameState> = {}): GameState => ({
  phase: 'play',
  rules: DEFAULT_GAME_RULES,
  players: [player('p1'), player('p2'), player('p3'), player('p4')],
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

describe('scoring rule variants', () => {
  it('scores J♦ as 0 when variant is off', () => {
    expect(scoreCard(card('diamonds', 'J'), { jackOfDiamondsMinus10: false, debugAiHistory: true })).toBe(0);
  });

  it('scores J♦ as -10 when variant is on', () => {
    expect(scoreCard(card('diamonds', 'J'), { jackOfDiamondsMinus10: true, debugAiHistory: true })).toBe(-10);
  });

  it('applies J♦ adjustment in moon rounds (always-on rule)', () => {
    const service = { scoreRound: (GameEngineService.prototype as any).scoreRound };
    const state = baseState({
      rules: { jackOfDiamondsMinus10: true, debugAiHistory: true },
      players: [player('p1', 0), player('p2', 0), player('p3', 0), player('p4', 0)],
      takenCards: {
        p1: [
          card('hearts', '2'),
          card('hearts', '3'),
          card('hearts', '4'),
          card('hearts', '5'),
          card('hearts', '6'),
          card('hearts', '7'),
          card('hearts', '8'),
          card('hearts', '9'),
          card('hearts', '10'),
          card('hearts', 'J'),
          card('hearts', 'Q'),
          card('hearts', 'K'),
          card('hearts', 'A'),
          card('spades', 'Q')
        ],
        p2: [card('diamonds', 'J')],
        p3: [],
        p4: []
      }
    });

    const next = service.scoreRound.call({}, state) as GameState;
    const p1 = next.players.find((p) => p.id === 'p1');
    const p2 = next.players.find((p) => p.id === 'p2');
    const p3 = next.players.find((p) => p.id === 'p3');
    const p4 = next.players.find((p) => p.id === 'p4');

    expect(p1?.score).toBe(0);
    expect(p2?.score).toBe(16);
    expect(p3?.score).toBe(26);
    expect(p4?.score).toBe(26);
  });
});
