import { DEFAULT_GAME_RULES, type Card, type GameRules, type GameState, type Player, RANKS, SUITS } from '../game.models';
import { AiService } from './ai.service';
import { RulesService } from './rules.service';
import { scoreCard } from './scoring';

export const PROFILES = ['smart', 'card-shark', 'endgame-defensive', 'spade-pressure', 'anti-moon-sentinel'] as const;
export type ProfileId = (typeof PROFILES)[number];

export interface ProfileMetrics {
  hands: number;
  totalPoints: number;
  wins: number;
  queenTaken: number;
  queenPlayed: number;
  queenSafeDump: number;
  moonShots: number;
  jackDiamondsCaptured: number;
}

const initMetrics = (): ProfileMetrics => ({
  hands: 0,
  totalPoints: 0,
  wins: 0,
  queenTaken: 0,
  queenPlayed: 0,
  queenSafeDump: 0,
  moonShots: 0,
  jackDiamondsCaptured: 0
});

export const benchmarkRules = {
  standard: { ...DEFAULT_GAME_RULES, jackOfDiamondsMinus10: false, debugAiHistory: false } as GameRules,
  jackVariant: { ...DEFAULT_GAME_RULES, jackOfDiamondsMinus10: true, debugAiHistory: false } as GameRules
};

export const runBenchmark = (
  rules: GameRules,
  handsPerTable: number,
  ai: AiService,
  rulesService: RulesService
): Record<ProfileId, ProfileMetrics> => {
  const metrics = PROFILES.reduce<Record<ProfileId, ProfileMetrics>>((acc, profile) => {
    acc[profile] = initMetrics();
    return acc;
  }, {} as Record<ProfileId, ProfileMetrics>);

  const tables = tableCombinations(PROFILES);
  let seed = 1001;

  for (const table of tables) {
    for (let rotation = 0; rotation < table.length; rotation += 1) {
      const rotated = rotate(table, rotation);
      for (let hand = 0; hand < handsPerTable; hand += 1) {
        const result = simulateHand(seed, rotated, rules, ai, rulesService);
        seed += 1;

        const pointsByProfile = result.players.reduce<Record<ProfileId, number>>((acc, player) => {
          acc[player.profileId] = player.points;
          return acc;
        }, {} as Record<ProfileId, number>);
        const winnerPoints = Math.min(...Object.values(pointsByProfile));
        const winners = Object.entries(pointsByProfile)
          .filter(([, points]) => points === winnerPoints)
          .map(([profile]) => profile as ProfileId);

        for (const player of result.players) {
          const m = metrics[player.profileId];
          m.hands += 1;
          m.totalPoints += player.points;
          if (winners.includes(player.profileId)) {
            m.wins += 1 / winners.length;
          }
          if (player.tookQueenSpades) {
            m.queenTaken += 1;
          }
          m.queenPlayed += player.playedQueenSpades ? 1 : 0;
          m.queenSafeDump += player.safeDumpedQueenSpades ? 1 : 0;
          m.moonShots += player.moonShot ? 1 : 0;
          m.jackDiamondsCaptured += player.capturedJackDiamonds ? 1 : 0;
        }
      }
    }
  }

  return metrics;
};

export const formatMetricsTable = (metrics: Record<ProfileId, ProfileMetrics>) => {
  return PROFILES.map((profile) => {
    const m = metrics[profile];
    const avgPoints = m.totalPoints / Math.max(1, m.hands);
    const winRate = (100 * m.wins) / Math.max(1, m.hands);
    const queenTakenRate = (100 * m.queenTaken) / Math.max(1, m.hands);
    const safeDumpRate = m.queenPlayed > 0 ? (100 * m.queenSafeDump) / m.queenPlayed : 0;
    const moonRate = (100 * m.moonShots) / Math.max(1, m.hands);
    const jdCaptureRate = (100 * m.jackDiamondsCaptured) / Math.max(1, m.hands);
    return {
      profile,
      hands: m.hands,
      avg_points: avgPoints,
      win_rate_pct: winRate,
      q_taken_pct: queenTakenRate,
      q_safe_dump_pct: safeDumpRate,
      moon_pct: moonRate,
      jd_capture_pct: jdCaptureRate
    };
  });
};

const simulateHand = (
  seed: number,
  profilesBySeat: ProfileId[],
  rules: GameRules,
  ai: AiService,
  rulesService: RulesService
) => {
  const deck = shuffle(seed, buildDeck());
  const hands = deal(deck, 4);
  const players: Player[] = hands.map((hand, idx) => ({
    id: `p${idx + 1}`,
    name: `p${idx + 1}`,
    type: 'cpu',
    aiProfileId: profilesBySeat[idx] ?? 'smart',
    hand: hand.slice(),
    score: 0
  }));
  const twoClubsOwner = players.find((p) => p.hand.some((c) => c.suit === 'clubs' && c.rank === '2'))?.id ?? 'p1';

  let state: GameState = {
    phase: 'play',
    rules,
    players,
    trick: { leaderId: twoClubsOwner, cards: [] },
    trickWinnerId: undefined,
    trickTaking: false,
    round: 1,
    turnPlayerId: twoClubsOwner,
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
  };

  const queenPlayedBy = new Set<string>();
  const queenSafeDumpBy = new Set<string>();

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
    const updatedPlayers = state.players.map((player) =>
      player.id === current.id ? { ...player, hand: removeCard(player.hand, chosen) } : player
    );
    const updatedTrick = { ...state.trick, cards: [...state.trick.cards, { playerId: current.id, card: chosen }] };
    if (chosen.suit === 'spades' && chosen.rank === 'Q') {
      queenPlayedBy.add(current.id);
    }

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
      const queenInTrick = updatedTrick.cards.find((play) => play.card.suit === 'spades' && play.card.rank === 'Q');
      if (queenInTrick && queenInTrick.playerId !== winner) {
        queenSafeDumpBy.add(queenInTrick.playerId);
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
    }
  }

  const playersResult = players.map((player) => {
    const taken = state.takenCards[player.id] ?? [];
    const points = taken.reduce((sum, current) => sum + Math.max(0, scoreCard(current, rules)), 0);
    const penaltyOnly = taken.reduce((sum, current) => {
      if (current.suit === 'hearts') {
        return sum + 1;
      }
      if (current.suit === 'spades' && current.rank === 'Q') {
        return sum + 13;
      }
      return sum;
    }, 0);
    return {
      profileId: (player.aiProfileId ?? 'smart') as ProfileId,
      points,
      tookQueenSpades: taken.some((c) => c.suit === 'spades' && c.rank === 'Q'),
      playedQueenSpades: queenPlayedBy.has(player.id),
      safeDumpedQueenSpades: queenSafeDumpBy.has(player.id),
      moonShot: penaltyOnly === 26,
      capturedJackDiamonds: taken.some((c) => c.suit === 'diamonds' && c.rank === 'J')
    };
  });

  return { players: playersResult };
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

const removeCard = (hand: Card[], target: Card): Card[] => {
  const idx = hand.findIndex((c) => c.suit === target.suit && c.rank === target.rank);
  if (idx === -1) {
    return hand.slice();
  }
  return [...hand.slice(0, idx), ...hand.slice(idx + 1)];
};

const nextTurn = (players: Player[], currentId: string): string => {
  const ids = players.map((p) => p.id);
  const index = ids.indexOf(currentId);
  if (index === -1) {
    return ids[0] ?? currentId;
  }
  return ids[(index + 1) % ids.length];
};

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

const tableCombinations = (profiles: readonly ProfileId[]): ProfileId[][] => {
  const combinations: ProfileId[][] = [];
  for (let a = 0; a < profiles.length; a += 1) {
    for (let b = a + 1; b < profiles.length; b += 1) {
      for (let c = b + 1; c < profiles.length; c += 1) {
        for (let d = c + 1; d < profiles.length; d += 1) {
          combinations.push([profiles[a], profiles[b], profiles[c], profiles[d]]);
        }
      }
    }
  }
  return combinations;
};

const rotate = <T>(items: T[], by: number): T[] => {
  const n = items.length;
  const shift = ((by % n) + n) % n;
  return items.slice(shift).concat(items.slice(0, shift));
};
