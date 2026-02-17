import { Card, GameState, Player, Suit } from '../game.models';
import { AiProfile, AI_PROFILES } from './ai-profiles';
import { AiStrategy } from './ai-strategy';
import { isDangerCard, scoreCard } from './scoring';

export class DumbStrategy implements AiStrategy {
  chooseCard(state: GameState, playerId: string, legalCards: Card[]): Card {
    void state;
    void playerId;
    return legalCards[Math.floor(Math.random() * legalCards.length)];
  }
}

export class SmartStrategy implements AiStrategy {
  chooseCard(state: GameState, playerId: string, legalCards: Card[]): Card {
    const rules = state.rules;
    const memory = buildMemory(state, playerId);
    const trick = state.trick.cards;
    if (trick.length === 0) {
      const safeLead = legalCards.filter((card) => !isDangerCard(card, rules));
      return lowestCard(safeLead.length > 0 ? safeLead : legalCards);
    }

    const leadSuit = trick[0].card.suit;
    const following = legalCards.filter((card) => card.suit === leadSuit);
    const winning = currentWinningCard(trick);
    const trickHasPoints = trick.some((play) => scoreCard(play.card, rules) > 0);
    const pendingPlayers = remainingPlayersInTrick(state, playerId, trick);
    const pendingPassedDanger = hasPendingPassedDangerInSuit(memory, pendingPlayers, leadSuit);

    if (following.length > 0 && winning) {
      const belowWin = following.filter((card) => rankOrder[card.rank] < rankOrder[winning.rank]);
      if ((trickHasPoints || pendingPassedDanger) && belowWin.length > 0) {
        return highestCard(belowWin);
      }
      return lowestCard(following);
    }

    const points = legalCards.filter((card) => scoreCard(card, rules) > 0);
    if (points.length > 0) {
      return highestRiskCard(points);
    }
    const nonBonus = legalCards.filter((card) => scoreCard(card, rules) >= 0);
    return highestCard(nonBonus.length > 0 ? nonBonus : legalCards);
  }
}

export class CardSharkStrategy implements AiStrategy {
  chooseCard(state: GameState, playerId: string, legalCards: Card[]): Card {
    return this.chooseCardWithProfile(state, playerId, legalCards, AI_PROFILES['card-shark']);
  }

  chooseCardWithProfile(state: GameState, playerId: string, legalCards: Card[], profile: AiProfile): Card {
    const rules = state.rules;
    const memory = buildMemory(state, playerId);
    const trick = state.trick.cards;
    const antiMoonTarget = profile.traits?.antiMoonSentinel ? detectLikelyMoonShooter(state, playerId) : null;
    if (trick.length === 0) {
      return this.chooseLeadCard(state, playerId, legalCards, memory, profile, antiMoonTarget);
    }

    const leadSuit = trick[0].card.suit;
    const following = legalCards.filter((card) => card.suit === leadSuit);
    const winning = currentWinningCard(trick);
    const trickHasPoints = trick.some((play) => scoreCard(play.card, rules) > 0);
    const isLastToAct = trick.length === 3;
    const pendingPlayers = remainingPlayersInTrick(state, playerId, trick);
    const pendingPassedDanger = hasPendingPassedDangerInSuit(memory, pendingPlayers, leadSuit);

    if (following.length > 0 && winning) {
      const belowWin = following.filter((card) => rankOrder[card.rank] < rankOrder[winning.rank]);
      const aboveWin = following.filter((card) => rankOrder[card.rank] > rankOrder[winning.rank]);
      const bossCards = following.filter((card) => unseenHigherCount(card, memory) === 0);
      const hasJackDiamonds = following.some((card) => isJackDiamondsBonus(card, state.rules));
      const queenSpades = following.find((card) => card.suit === 'spades' && card.rank === 'Q');
      const queenWouldCurrentlyWin =
        Boolean(queenSpades) &&
        winning.suit === 'spades' &&
        rankOrder['Q'] > rankOrder[winning.rank];
      const shouldRiskQueenDump =
        queenWouldCurrentlyWin &&
        !isLastToAct &&
        highOvertakeProbabilityForQueen(memory, pendingPlayers);

      if (hasJackDiamonds && !trickHasPoints && aboveWin.length > 0) {
        return lowestCard(aboveWin);
      }

      if (antiMoonTarget && !trickHasPoints && aboveWin.length > 0) {
        return lowestCard(aboveWin);
      }

      if (trickHasPoints || pendingPassedDanger) {
        if (belowWin.length > 0) {
          const keepBonusBelowWin = keepJackDiamondsIfPossible(belowWin, state.rules);
          if (profile.traits?.endgameDefensive && legalCards.length <= 7 && belowWin.length > 1) {
            return secondHighestCard(keepBonusBelowWin);
          }
          return highestCard(keepBonusBelowWin);
        }
        if (queenSpades && !shouldRiskQueenDump) {
          const nonQueen = following.filter((card) => !(card.suit === 'spades' && card.rank === 'Q'));
          if (nonQueen.length > 0) {
            return lowestCard(nonQueen);
          }
        }
        if (bossCards.length > 0) {
          return lowestCard(bossCards);
        }
        return lowestCard(following);
      }

      if (isLastToAct && aboveWin.length > 0) {
        const safeAboveWin = aboveWin.filter((card) => scoreCard(card, rules) <= 0);
        if (safeAboveWin.length > 0) {
          return lowestCard(safeAboveWin);
        }
      }
      if (!antiMoonTarget && belowWin.length > 0) {
        const keepBonusBelowWin = keepJackDiamondsIfPossible(belowWin, state.rules);
        const dangerBelowWin = keepBonusBelowWin.filter((card) => scoreCard(card, rules) > 0);
        if (dangerBelowWin.length > 0) {
          return highestRiskCard(dangerBelowWin);
        }
        return highestCard(keepBonusBelowWin);
      }
      if (queenSpades && !shouldRiskQueenDump) {
        const nonQueen = following.filter((card) => !(card.suit === 'spades' && card.rank === 'Q'));
        if (nonQueen.length > 0) {
          return lowestCard(nonQueen);
        }
      }
      if (bossCards.length > 0 && !isLastToAct) {
        return lowestCard(bossCards);
      }
      return lowestCard(following);
    }

    const points = legalCards.filter((card) => scoreCard(card, rules) > 0);
    if (points.length > 0) {
      if (antiMoonTarget && !trick.some((play) => play.playerId === antiMoonTarget)) {
        const nonPoints = legalCards.filter((card) => scoreCard(card, rules) <= 0);
        if (nonPoints.length > 0) {
          return highestCard(nonPoints);
        }
      }
      return highestRiskCard(points);
    }
    const nonBonus = legalCards.filter((card) => scoreCard(card, rules) >= 0);
    if (nonBonus.length > 0) {
      return highestCard(nonBonus);
    }
    const highSpades = legalCards.filter((card) => card.suit === 'spades' && rankOrder[card.rank] >= rankOrder['K']);
    if (highSpades.length > 0) {
      return highestCard(highSpades);
    }
    return highestCard(legalCards);
  }

  private chooseLeadCard(
    state: GameState,
    playerId: string,
    legalCards: Card[],
    memory: AiMemory,
    profile: AiProfile,
    antiMoonTarget: string | null
  ): Card {
    const player = state.players.find((p) => p.id === playerId);
    if (!player) {
      return lowestCard(legalCards);
    }

    const safe = legalCards.filter((card) => scoreCard(card, state.rules) <= 0);
    const baseCandidates = safe.length > 0 ? safe : legalCards;
    const candidates = avoidRiskyHighSpadeLeads(baseCandidates, player.hand, memory);
    const handSize = player.hand.length;

    if (profile.traits?.spadePressure && shouldPressureSpades(state, memory)) {
      const spadeLead = candidates
        .filter((card) => card.suit === 'spades')
        .sort((a, b) => rankOrder[a.rank] - rankOrder[b.rank])[0];
      if (spadeLead) {
        return spadeLead;
      }
    }

    if (antiMoonTarget && !state.heartsBroken) {
      const forceLead = candidates.filter((card) => scoreCard(card, state.rules) <= 0 && card.suit !== 'spades');
      if (forceLead.length > 0) {
        return lowestCard(forceLead);
      }
    }

    const suitCounts = countBySuit(player.hand);

    const sorted = [...candidates].sort((a, b) => {
      if (profile.traits?.endgameDefensive && handSize <= 7) {
        const safeLeadDelta = safeLeadScore(b, memory, suitCounts) - safeLeadScore(a, memory, suitCounts);
        if (safeLeadDelta !== 0) {
          return safeLeadDelta;
        }
      }
      const voidRiskDelta = opponentsVoidCount(memory, a.suit) - opponentsVoidCount(memory, b.suit);
      if (voidRiskDelta !== 0) {
        return voidRiskDelta;
      }
      const countDelta = (suitCounts[a.suit] ?? 0) - (suitCounts[b.suit] ?? 0);
      if (countDelta !== 0) {
        return countDelta;
      }
      const bossDelta = unseenHigherCount(a, memory) - unseenHigherCount(b, memory);
      if (bossDelta !== 0) {
        return bossDelta;
      }
      return rankOrder[a.rank] - rankOrder[b.rank];
    });
    return sorted[0];
  }
}

const rankOrder: Record<Card['rank'], number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14
};

const lowestCard = (cards: Card[]): Card =>
  cards.reduce((lowest, current) => (rankOrder[current.rank] < rankOrder[lowest.rank] ? current : lowest));

const highestCard = (cards: Card[]): Card =>
  cards.reduce((highest, current) => (rankOrder[current.rank] > rankOrder[highest.rank] ? current : highest));

const secondHighestCard = (cards: Card[]): Card => {
  if (cards.length < 2) {
    return cards[0];
  }
  const sorted = [...cards].sort((a, b) => rankOrder[b.rank] - rankOrder[a.rank]);
  return sorted[1];
};

const highestRiskCard = (cards: Card[]): Card =>
  cards.reduce((risk, current) => (riskScore(current) > riskScore(risk) ? current : risk));

const riskScore = (card: Card): number => {
  if (card.suit === 'spades' && card.rank === 'Q') {
    return 500;
  }
  if (card.suit === 'spades' && card.rank === 'A') {
    return 220;
  }
  if (card.suit === 'spades' && card.rank === 'K') {
    return 210;
  }
  if (card.suit === 'hearts') {
    return 120 + rankOrder[card.rank];
  }
  return rankOrder[card.rank];
};

const currentWinningCard = (trick: GameState['trick']['cards']): Card | null => {
  if (trick.length === 0) {
    return null;
  }
  const leadSuit = trick[0].card.suit;
  let winner = trick[0].card;
  for (const play of trick.slice(1)) {
    if (play.card.suit !== leadSuit) {
      continue;
    }
    if (rankOrder[play.card.rank] > rankOrder[winner.rank]) {
      winner = play.card;
    }
  }
  return winner;
};

interface AiMemory {
  myPlayerId: string;
  seenCards: Set<string>;
  voidSuitsByPlayer: Record<string, Set<Suit>>;
  passedCardsByPlayer: Record<string, Card[]>;
}

const buildMemory = (state: GameState, playerId: string): AiMemory => {
  const myHand = state.players.find((player) => player.id === playerId)?.hand ?? [];
  const seenCards = new Set<string>();

  for (const play of state.playHistory) {
    seenCards.add(cardKey(play.card));
  }
  for (const play of state.trick.cards) {
    seenCards.add(cardKey(play.card));
  }
  for (const card of myHand) {
    seenCards.add(cardKey(card));
  }

  const voidSuitsByPlayer: Record<string, Set<Suit>> = {};
  for (const player of state.players) {
    voidSuitsByPlayer[player.id] = new Set<Suit>();
  }
  const passedCardsByPlayer: Record<string, Card[]> = {};
  for (const transfer of state.passTransfers) {
    const current = passedCardsByPlayer[transfer.toId] ?? [];
    passedCardsByPlayer[transfer.toId] = [...current, ...transfer.cards];
  }

  for (let index = 0; index + 3 < state.playHistory.length; index += 4) {
    const trick = state.playHistory.slice(index, index + 4);
    const leadSuit = trick[0].card.suit;
    for (const play of trick) {
      if (play.card.suit !== leadSuit) {
        voidSuitsByPlayer[play.playerId].add(leadSuit);
      }
    }
  }

  return { myPlayerId: playerId, seenCards, voidSuitsByPlayer, passedCardsByPlayer };
};

const unseenHigherCount = (card: Card, memory: AiMemory): number => {
  let unseen = 0;
  for (const rank of Object.keys(rankOrder) as Card['rank'][]) {
    if (rankOrder[rank] <= rankOrder[card.rank]) {
      continue;
    }
    const key = `${card.suit}-${rank}`;
    if (!memory.seenCards.has(key)) {
      unseen += 1;
    }
  }
  return unseen;
};

const opponentsVoidCount = (memory: AiMemory, suit: Suit): number => {
  let count = 0;
  for (const [playerId, voidSuits] of Object.entries(memory.voidSuitsByPlayer)) {
    if (playerId === memory.myPlayerId) {
      continue;
    }
    if (voidSuits.has(suit)) {
      count += 1;
    }
  }
  return count;
};

const safeLeadScore = (
  card: Card,
  memory: AiMemory,
  suitCounts: Record<Card['suit'], number>
): number => {
  const count = suitCounts[card.suit] ?? 0;
  const isLow = rankOrder[card.rank] <= 6 ? 2 : 0;
  const voidRisk = opponentsVoidCount(memory, card.suit);
  return count * 3 + isLow - voidRisk * 3;
};

const remainingPlayersInTrick = (state: GameState, playerId: string, trick: GameState['trick']['cards']): string[] => {
  const ids = state.players.map((player) => player.id);
  const played = new Set(trick.map((play) => play.playerId));
  const currentIndex = ids.indexOf(playerId);
  if (currentIndex === -1) {
    return [];
  }
  const remaining: string[] = [];
  for (let offset = 1; offset < ids.length; offset += 1) {
    const nextId = ids[(currentIndex + offset) % ids.length];
    if (!played.has(nextId)) {
      remaining.push(nextId);
    }
  }
  return remaining;
};

const hasPendingPassedDangerInSuit = (memory: AiMemory, pendingPlayers: string[], suit: Suit): boolean => {
  for (const playerId of pendingPlayers) {
    const passed = memory.passedCardsByPlayer[playerId] ?? [];
    const unseenDanger = passed.some((card) => card.suit === suit && !memory.seenCards.has(cardKey(card)));
    if (unseenDanger) {
      return true;
    }
  }
  return false;
};

const highOvertakeProbabilityForQueen = (memory: AiMemory, pendingPlayers: string[]): boolean => {
  const contenders = pendingPlayers.filter((playerId) => !memory.voidSuitsByPlayer[playerId]?.has('spades'));
  if (contenders.length === 0) {
    return false;
  }
  const unseenCovers = unseenHigherCount({ suit: 'spades', rank: 'Q' }, memory);
  if (unseenCovers === 0) {
    return false;
  }
  if (contenders.length === 1) {
    return unseenCovers === 2;
  }
  return unseenCovers >= 1;
};

const avoidRiskyHighSpadeLeads = (candidates: Card[], hand: Card[], memory: AiMemory): Card[] => {
  const queenSeen = memory.seenCards.has('spades-Q');
  const holdQueen = hand.some((card) => card.suit === 'spades' && card.rank === 'Q');
  if (queenSeen || holdQueen) {
    return candidates;
  }
  const filtered = candidates.filter(
    (card) => !(card.suit === 'spades' && (card.rank === 'A' || card.rank === 'K'))
  );
  return filtered.length > 0 ? filtered : candidates;
};

const detectLikelyMoonShooter = (state: GameState, myPlayerId: string): string | null => {
  const totalsByPlayer = state.players.reduce<Record<string, { points: number; tricks: number }>>((acc, player) => {
    const taken = state.takenCards[player.id] ?? [];
    const points = taken.reduce((sum, card) => sum + Math.max(0, scoreCard(card, state.rules)), 0);
    acc[player.id] = { points, tricks: Math.floor(taken.length / 4) };
    return acc;
  }, {});

  let candidate: string | null = null;
  let bestScore = 0;
  for (const player of state.players) {
    if (player.id === myPlayerId) {
      continue;
    }
    const totals = totalsByPlayer[player.id];
    const score = totals.points * 2 + totals.tricks;
    if (totals.points >= 10 && totals.tricks >= 3 && score > bestScore) {
      bestScore = score;
      candidate = player.id;
    }
  }
  return candidate;
};

const shouldPressureSpades = (state: GameState, memory: AiMemory): boolean => {
  const queenSeen = memory.seenCards.has('spades-Q');
  if (queenSeen) {
    return false;
  }
  const aceSeen = memory.seenCards.has('spades-A');
  const kingSeen = memory.seenCards.has('spades-K');
  const coverGone = Number(aceSeen) + Number(kingSeen);
  const spadesPlayed = state.playHistory.filter((play) => play.card.suit === 'spades').length;
  return coverGone >= 1 || spadesPlayed >= 5;
};

const cardKey = (card: Card): string => `${card.suit}-${card.rank}`;

const countBySuit = (cards: Card[]): Record<Card['suit'], number> => {
  const counts: Record<Card['suit'], number> = { clubs: 0, diamonds: 0, hearts: 0, spades: 0 };
  for (const card of cards) {
    counts[card.suit] += 1;
  }
  return counts;
};

const isJackDiamondsBonus = (card: Card, rules: { jackOfDiamondsMinus10: boolean }): boolean =>
  rules.jackOfDiamondsMinus10 && card.suit === 'diamonds' && card.rank === 'J';

const keepJackDiamondsIfPossible = (cards: Card[], rules: { jackOfDiamondsMinus10: boolean }): Card[] => {
  if (!rules.jackOfDiamondsMinus10) {
    return cards;
  }
  const nonJack = cards.filter((card) => !(card.suit === 'diamonds' && card.rank === 'J'));
  return nonJack.length > 0 ? nonJack : cards;
};
