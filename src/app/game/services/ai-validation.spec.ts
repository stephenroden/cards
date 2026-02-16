import { TestBed } from '@angular/core/testing';
import { AI_PROFILES } from './ai-profiles';
import { AiService } from './ai.service';
import { DEFAULT_GAME_RULES, type Card, type GameRules, type GameState, type Player, RANKS, SUITS } from '../game.models';
import { RulesService } from './rules.service';

const card = (suit: Card['suit'], rank: Card['rank']): Card => ({ suit, rank });

const buildPlayer = (id: string, profileId: string, hand: Card[]): Player => ({
  id,
  name: id,
  type: 'cpu',
  aiProfileId: profileId,
  hand: hand.slice(),
  score: 0
});

const baseState = (players: Player[], rules: GameRules): GameState => ({
  phase: 'play',
  rules,
  players,
  trick: { leaderId: players[0]?.id ?? 'p1', cards: [] },
  trickWinnerId: undefined,
  trickTaking: false,
  round: 1,
  turnPlayerId: players[0]?.id ?? 'p1',
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
  passComplete: false
});

describe('Ai strategy validation', () => {
  let ai: AiService;
  let rulesService: RulesService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    ai = TestBed.inject(AiService);
    rulesService = TestBed.inject(RulesService);
  });

  it('keeps J♦ more often in pass selection when variant is on', () => {
    const profiles = ['smart', 'card-shark', 'endgame-defensive', 'spade-pressure', 'anti-moon-sentinel'];
    const rulesOff: GameRules = { jackOfDiamondsMinus10: false, debugAiHistory: true };
    const rulesOn: GameRules = { jackOfDiamondsMinus10: true, debugAiHistory: true };
    let offCount = 0;
    let onCount = 0;

    for (const profileId of profiles) {
      for (let seed = 1; seed <= 120; seed += 1) {
        const hand = makeRandomHand(seed * 31 + profileId.length);
        const player = buildPlayer('p1', profileId, hand);
        const off = ai.choosePassCards(player, 3, rulesOff);
        const on = ai.choosePassCards(player, 3, rulesOn);
        if (off.some((c) => c.suit === 'diamonds' && c.rank === 'J')) {
          offCount += 1;
        }
        if (on.some((c) => c.suit === 'diamonds' && c.rank === 'J')) {
          onCount += 1;
        }
      }
    }

    expect(onCount).toBeLessThan(offCount);
  });

  it('plays legal cards across seeded full-round simulations with variant on/off', () => {
    const profileOrder = ['spade-pressure', 'anti-moon-sentinel', 'endgame-defensive', 'smart'];
    const rulesSets: GameRules[] = [DEFAULT_GAME_RULES, { jackOfDiamondsMinus10: true, debugAiHistory: true }];

    for (const rules of rulesSets) {
      for (let seed = 1; seed <= 40; seed += 1) {
        const result = simulateRound(seed, rules, profileOrder, ai, rulesService);
        expect(result.illegalPlays).toBe(0);
        expect(result.completedTricks).toBe(13);
        expect(result.cardsPlayed).toBe(52);
      }
    }
  });

  it('avoids leading A♠/K♠ when Q♠ is unseen and safer leads exist', () => {
    const rules: GameRules = { jackOfDiamondsMinus10: false, debugAiHistory: true };
    const p1 = buildPlayer('p1', 'anti-moon-sentinel', [card('spades', 'A'), card('spades', 'J'), card('clubs', '6')]);
    const p2 = buildPlayer('p2', 'smart', [card('clubs', '2')]);
    const p3 = buildPlayer('p3', 'smart', [card('diamonds', '2')]);
    const p4 = buildPlayer('p4', 'smart', [card('hearts', '2')]);
    const state: GameState = {
      ...baseState([p1, p2, p3, p4], rules),
      trick: { leaderId: 'p1', cards: [] },
      turnPlayerId: 'p1'
    };

    const decision = ai.chooseCardWithReason(state, p1, p1.hand);
    expect(decision.card.suit === 'spades' && (decision.card.rank === 'A' || decision.card.rank === 'K')).toBe(false);
    expect(['safe_lead', 'lowest_risk_legal']).toContain(decision.trace.reasonCode);
  });

  it('dumps Q♠ under an existing A♠ when following suit and not trying to moon', () => {
    const rules: GameRules = { jackOfDiamondsMinus10: false, debugAiHistory: true };
    const p1 = buildPlayer('p1', 'smart', [card('spades', 'A')]);
    const p2 = buildPlayer('p2', 'endgame-defensive', [card('spades', '4'), card('spades', 'Q'), card('clubs', '7')]);
    const p3 = buildPlayer('p3', 'smart', [card('clubs', '2')]);
    const p4 = buildPlayer('p4', 'smart', [card('diamonds', '2')]);
    const state: GameState = {
      ...baseState([p1, p2, p3, p4], rules),
      trick: { leaderId: 'p1', cards: [{ playerId: 'p1', card: card('spades', 'A') }] },
      turnPlayerId: 'p2'
    };

    const legal = [card('spades', '4'), card('spades', 'Q')];
    const decision = ai.chooseCardWithReason(state, p2, legal);
    expect(decision.card.suit).toBe('spades');
    expect(decision.card.rank).toBe('Q');
    expect(decision.trace.reasonCode).toBe('shed_high_without_winning');
  });

  it('keeps J♦ when it cannot win under a higher diamond and another loser exists', () => {
    const rules: GameRules = { jackOfDiamondsMinus10: true, debugAiHistory: true };
    const p1 = buildPlayer('p1', 'smart', [card('diamonds', 'A')]);
    const p2 = buildPlayer('p2', 'endgame-defensive', [card('diamonds', '4'), card('diamonds', 'J')]);
    const p3 = buildPlayer('p3', 'smart', [card('clubs', '2')]);
    const p4 = buildPlayer('p4', 'smart', [card('spades', '2')]);
    const state: GameState = {
      ...baseState([p1, p2, p3, p4], rules),
      trick: { leaderId: 'p1', cards: [{ playerId: 'p1', card: card('diamonds', 'A') }] },
      turnPlayerId: 'p2'
    };

    const decision = ai.chooseCardWithReason(state, p2, [card('diamonds', '4'), card('diamonds', 'J')]);
    expect(decision.card.rank).toBe('4');
    expect(decision.trace.reasonCode).not.toBe('capture_bonus_jd');
  });
});

const simulateRound = (
  seed: number,
  rules: GameRules,
  profileOrder: string[],
  ai: AiService,
  rulesService: RulesService
): { illegalPlays: number; completedTricks: number; cardsPlayed: number } => {
  const deck = shuffle(seed, buildDeck());
  const hands = deal(deck, 4);
  const players = hands.map((hand, idx) => buildPlayer(`p${idx + 1}`, profileOrder[idx] ?? 'smart', hand));
  const twoClubsOwner = players.find((p) => p.hand.some((c) => c.suit === 'clubs' && c.rank === '2'))?.id ?? 'p1';

  let state: GameState = {
    ...baseState(players, rules),
    trick: { leaderId: twoClubsOwner, cards: [] },
    turnPlayerId: twoClubsOwner
  };

  let illegalPlays = 0;
  let completedTricks = 0;
  let cardsPlayed = 0;

  while (state.players.some((p) => p.hand.length > 0)) {
    const current = state.players.find((p) => p.id === state.turnPlayerId);
    if (!current) {
      break;
    }
    const legal = rulesService.getLegalPlays(state, current);
    if (legal.length === 0) {
      break;
    }
    const chosen = ai.chooseCard(state, current, legal);
    if (!legal.some((c) => c.suit === chosen.suit && c.rank === chosen.rank)) {
      illegalPlays += 1;
    }

    const updatedPlayers = state.players.map((player) =>
      player.id === current.id
        ? { ...player, hand: removeCard(player.hand, chosen) }
        : player
    );
    const updatedTrick = { ...state.trick, cards: [...state.trick.cards, { playerId: current.id, card: chosen }] };
    cardsPlayed += 1;

    state = {
      ...state,
      players: updatedPlayers,
      trick: updatedTrick,
      heartsBroken: state.heartsBroken || chosen.suit === 'hearts',
      turnPlayerId: nextTurn(updatedPlayers, current.id)
    };

    if (updatedTrick.cards.length === 4) {
      const winner = rulesService.getTrickWinner(state);
      if (!winner) {
        break;
      }
      const taken = {
        ...state.takenCards,
        [winner]: [...(state.takenCards[winner] ?? []), ...updatedTrick.cards.map((p) => p.card)]
      };
      state = {
        ...state,
        takenCards: taken,
        playHistory: [...state.playHistory, ...updatedTrick.cards],
        trick: { leaderId: winner, cards: [] },
        turnPlayerId: winner
      };
      completedTricks += 1;
    }
  }

  return { illegalPlays, completedTricks, cardsPlayed };
};

const nextTurn = (players: Player[], currentId: string): string => {
  const ids = players.map((p) => p.id);
  const index = ids.indexOf(currentId);
  if (index === -1) {
    return ids[0] ?? currentId;
  }
  return ids[(index + 1) % ids.length];
};

const removeCard = (hand: Card[], target: Card): Card[] => {
  const idx = hand.findIndex((c) => c.suit === target.suit && c.rank === target.rank);
  if (idx === -1) {
    return hand.slice();
  }
  return [...hand.slice(0, idx), ...hand.slice(idx + 1)];
};

const buildDeck = (): Card[] => {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
};

const deal = (cards: Card[], players: number): Card[][] => {
  const hands: Card[][] = Array.from({ length: players }, () => []);
  cards.forEach((current, idx) => {
    hands[idx % players].push(current);
  });
  return hands;
};

const makeRandomHand = (seed: number): Card[] => shuffle(seed, buildDeck()).slice(0, 13);

const shuffle = (seed: number, cards: Card[]): Card[] => {
  let state = seed >>> 0;
  const next = (): number => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
  const copy = cards.slice();
  for (let idx = copy.length - 1; idx > 0; idx -= 1) {
    const swapIndex = Math.floor(next() * (idx + 1));
    [copy[idx], copy[swapIndex]] = [copy[swapIndex], copy[idx]];
  }
  return copy;
};
