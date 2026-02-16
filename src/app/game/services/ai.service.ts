import { Injectable } from '@angular/core';
import { AiDecisionTrace, Card, GameRules, GameState, Player, SUITS, Suit } from '../game.models';
import { AiStrategy } from './ai-strategy';
import { AI_PROFILES, AiProfile, DEFAULT_PASS_TUNING, PassTuning } from './ai-profiles';
import { isDangerCard, scoreCard } from './scoring';

class DumbStrategy implements AiStrategy {
  chooseCard(state: GameState, playerId: string, legalCards: Card[]): Card {
    void state;
    void playerId;
    return legalCards[Math.floor(Math.random() * legalCards.length)];
  }
}

class SmartStrategy implements AiStrategy {
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

    // Can slough: prefer dumping penalty cards.
    const points = legalCards.filter((card) => scoreCard(card, rules) > 0);
    if (points.length > 0) {
      return highestRiskCard(points);
    }
    const nonBonus = legalCards.filter((card) => scoreCard(card, rules) >= 0);
    return highestCard(nonBonus.length > 0 ? nonBonus : legalCards);
  }
}

class CardSharkStrategy implements AiStrategy {
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
      const hasJackDiamonds = following.some((card) => isJackDiamondsBonus(card, rules));
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
          const keepBonusBelowWin = keepJackDiamondsIfPossible(belowWin, rules);
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

      // No points in trick: win cheaply if we're last, otherwise duck.
      if (isLastToAct && aboveWin.length > 0) {
        const safeAboveWin = aboveWin.filter((card) => scoreCard(card, rules) <= 0);
        if (safeAboveWin.length > 0) {
          return lowestCard(safeAboveWin);
        }
      }
      if (!antiMoonTarget && belowWin.length > 0) {
        const keepBonusBelowWin = keepJackDiamondsIfPossible(belowWin, rules);
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

    // Void in lead suit: aggressively dump danger cards.
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

    // Prefer leading from shortest safe suit, avoiding suits many opponents are void in.
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

@Injectable({
  providedIn: 'root'
})
export class AiService {
  private readonly cardShark = new CardSharkStrategy();
  private readonly strategies: Record<string, AiStrategy> = {
    dumb: new DumbStrategy(),
    smart: new SmartStrategy(),
    'card-shark': this.cardShark
  };

  chooseCard(state: GameState, player: Player, legalCards: Card[]): Card {
    return this.chooseCardWithReason(state, player, legalCards).card;
  }

  chooseCardWithReason(state: GameState, player: Player, legalCards: Card[]): {
    card: Card;
    reason: string;
    trace: AiDecisionTrace;
  } {
    const profile = this.resolveProfile(player);
    let card: Card;
    if (profile.playStyle === 'card-shark') {
      card = this.cardShark.chooseCardWithProfile(state, player.id, legalCards, profile);
    } else {
      card = this.strategies[profile.playStyle].chooseCard(state, player.id, legalCards);
    }
    const trace = describeChoice(state, player, profile.label, legalCards, card);
    return { card, reason: trace.summary, trace };
  }

  choosePassCards(player: Player, count: number, rules: GameRules): Card[] {
    const profile = this.resolveProfile(player);
    const tuning = { ...DEFAULT_PASS_TUNING, ...(profile.passTuning ?? {}) };
    if (profile.passStyle === 'dumb') {
      return shuffle(player.hand).slice(0, count);
    }
    if (profile.passStyle === 'smart') {
      return [...player.hand]
        .sort((a, b) => passScore(b, tuning, rules) - passScore(a, tuning, rules))
        .slice(0, count);
    }
    return [...player.hand]
      .sort((a, b) => sharkPassScore(player.hand, b, tuning, rules) - sharkPassScore(player.hand, a, tuning, rules))
      .slice(0, count);
  }

  private resolveProfile(player: Player) {
    const profileId = player.aiProfileId ?? 'dumb';
    return AI_PROFILES[profileId] ?? AI_PROFILES['dumb'];
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

const passScore = (card: Card, tuning: PassTuning, rules: GameRules): number => {
  if (isJackDiamondsBonus(card, rules)) {
    return -200;
  }
  if (card.suit === 'spades' && card.rank === 'Q') {
    return tuning.queenSpades;
  }
  if (card.suit === 'spades' && card.rank === 'A') {
    return tuning.aceSpades;
  }
  if (card.suit === 'spades' && card.rank === 'K') {
    return tuning.kingSpades;
  }
  if (card.suit === 'hearts') {
    return tuning.heartBase + rankOrder[card.rank];
  }
  if (card.rank === 'A' || card.rank === 'K') {
    return tuning.honorBase + rankOrder[card.rank];
  }
  return rankOrder[card.rank] / 2;
};

const sharkPassScore = (hand: Card[], card: Card, tuning: PassTuning, rules: GameRules): number => {
  const suitCount = hand.filter((held) => held.suit === card.suit).length;
  const voidBonus = suitCount <= 3 ? (4 - suitCount) * tuning.voidBonusPerMissingCard : 0;
  return passScore(card, tuning, rules) + voidBonus;
};

const isJackDiamondsBonus = (card: Card, rules: GameRules): boolean =>
  rules.jackOfDiamondsMinus10 && card.suit === 'diamonds' && card.rank === 'J';

const keepJackDiamondsIfPossible = (cards: Card[], rules: GameRules): Card[] => {
  if (!rules.jackOfDiamondsMinus10) {
    return cards;
  }
  const nonJack = cards.filter((card) => !(card.suit === 'diamonds' && card.rank === 'J'));
  return nonJack.length > 0 ? nonJack : cards;
};

const describeChoice = (
  state: GameState,
  player: Player,
  profileLabel: string,
  legalCards: Card[],
  choice: Card
): AiDecisionTrace => {
  const leadSuit = state.trick.cards[0]?.card.suit;
  const isLeading = state.trick.cards.length === 0;
  const followingSuit = !isLeading && Boolean(leadSuit) && choice.suit === leadSuit;
  const forcedFollowSuit = followingSuit && legalCards.every((card) => card.suit === leadSuit);
  const maxRank = Math.max(...legalCards.map((card) => rankOrder[card.rank]));
  const minRank = Math.min(...legalCards.map((card) => rankOrder[card.rank]));
  const chosenRank = rankOrder[choice.rank];
  const cardName = `${choice.rank}${suitGlyph(choice.suit)}`;
  const factors: Record<string, string | number | boolean> = {
    profile: profileLabel,
    player: player.name,
    legalCount: legalCards.length,
    leading: isLeading,
    heartsBroken: state.heartsBroken,
    trickCards: state.trick.cards.length,
    chosenCard: cardName
  };
  factors['hand_cards'] = formatCards(player.hand);
  factors['chosen_suit'] = choice.suit;
  factors['suit_played'] = suitPlayed(state, choice.suit);
  factors['suit_unplayed'] = suitUnplayed(state, choice.suit);

  if (choice.suit === 'spades' && choice.rank === 'Q') {
    factors['spades_played'] = spadesPlayed(state);
    factors['spades_unplayed'] = spadesUnplayed(state);
  }
  if (isJackDiamondsBonus(choice, state.rules)) {
    factors['diamonds_played'] = suitPlayed(state, 'diamonds');
    factors['diamonds_unplayed'] = suitUnplayed(state, 'diamonds');
  }

  if (isJackDiamondsBonus(choice, state.rules)) {
    const winsNow = wouldChoiceWinTrickNow(state, choice);
    if (!winsNow) {
      // J♦ is only "chasing the bonus" when it is played to win control.
      // Otherwise this is just a normal (often defensive) play.
      factors['jd_wins_now'] = false;
    } else {
      factors['jd_wins_now'] = true;
    }
  }

  if (isJackDiamondsBonus(choice, state.rules) && wouldChoiceWinTrickNow(state, choice)) {
    return {
      reasonCode: 'capture_bonus_jd',
      summary: `${profileLabel}: played ${cardName} to keep/capture the -10 bonus card.`,
      factors: { ...factors, jdVariant: true, chosenValue: scoreCard(choice, state.rules) }
    };
  }
  if (!isLeading && leadSuit && choice.suit === leadSuit) {
    const winning = currentWinningCard(state.trick.cards);
    if (winning) {
      const belowWin = legalCards
        .filter((card) => card.suit === leadSuit)
        .filter((card) => rankOrder[card.rank] < rankOrder[winning.rank]);
      if (
        belowWin.length > 0 &&
        rankOrder[choice.rank] < rankOrder[winning.rank] &&
        rankOrder[choice.rank] === Math.max(...belowWin.map((card) => rankOrder[card.rank]))
      ) {
        return {
          reasonCode: 'shed_high_without_winning',
          summary: `${profileLabel}: shed ${cardName} while still losing the trick to reduce future risk.`,
          factors: { ...factors, leadSuit, winningCard: `${winning.rank}${suitGlyph(winning.suit)}` }
        };
      }
    }
  }
  if (scoreCard(choice, state.rules) > 0 && forcedFollowSuit && legalCards.length === 1) {
    return {
      reasonCode: 'forced_follow_suit',
      summary: `${profileLabel}: had to follow suit with ${cardName}; it was the only legal card.`,
      factors: { ...factors, leadSuit: leadSuit ?? '', forcedFollowSuit: true, legalInSuit: formatCards(legalCards) }
    };
  }
  if (scoreCard(choice, state.rules) > 0) {
    return {
      reasonCode: 'dump_danger_card',
      summary: `${profileLabel}: played ${cardName} to offload danger points before getting trapped.`,
      factors: { ...factors, chosenValue: scoreCard(choice, state.rules) }
    };
  }
  if (!isLeading && leadSuit && choice.suit === leadSuit && chosenRank === minRank) {
    return {
      reasonCode: 'duck_follow_low',
      summary: `${profileLabel}: played low ${cardName} to duck the trick and avoid taking points.`,
      factors: { ...factors, leadSuit, chosenRank, minRank }
    };
  }
  if (!isLeading && leadSuit && choice.suit === leadSuit && chosenRank === maxRank) {
    return {
      reasonCode: 'take_control_high',
      summary: `${profileLabel}: played high ${cardName} to take control of this trick.`,
      factors: { ...factors, leadSuit, chosenRank, maxRank }
    };
  }
  if (isLeading) {
    const queenUnseen = !state.playHistory.some((play) => play.card.suit === 'spades' && play.card.rank === 'Q');
    const holdQueen = player.hand.some((card) => card.suit === 'spades' && card.rank === 'Q');
    const riskyHighSpadeLead = choice.suit === 'spades' && (choice.rank === 'A' || choice.rank === 'K') && queenUnseen && !holdQueen;
    if (riskyHighSpadeLead) {
      return {
        reasonCode: 'risky_spade_lead',
        summary: `${profileLabel}: led ${cardName}; this can pull Q♠ into the trick when it is still unseen.`,
        factors: { ...factors, queenUnseen, holdQueen, riskyHighSpadeLead }
      };
    }
    return {
      reasonCode: 'safe_lead',
      summary: `${profileLabel}: led ${cardName} as the safest opening from current hand shape.`,
      factors: { ...factors }
    };
  }
  return {
    reasonCode: 'lowest_risk_legal',
    summary: `${profileLabel}: selected ${cardName} as the lowest-risk legal option.`,
    factors
  };
};

const suitGlyph = (suit: Card['suit']): string => {
  if (suit === 'clubs') {
    return '♣';
  }
  if (suit === 'diamonds') {
    return '♦';
  }
  if (suit === 'hearts') {
    return '♥';
  }
  return '♠';
};

const wouldChoiceWinTrickNow = (state: GameState, choice: Card): boolean => {
  const trick = state.trick.cards;
  if (trick.length === 0) {
    return true;
  }
  const leadSuit = trick[0].card.suit;
  if (choice.suit !== leadSuit) {
    return false;
  }
  const currentWinner = currentWinningCard(trick);
  if (!currentWinner) {
    return true;
  }
  return rankOrder[choice.rank] > rankOrder[currentWinner.rank];
};

const formatCards = (cards: Card[]): string =>
  [...cards]
    .sort((a, b) => {
      const suitDelta = suitOrder[a.suit] - suitOrder[b.suit];
      if (suitDelta !== 0) {
        return suitDelta;
      }
      return rankOrder[a.rank] - rankOrder[b.rank];
    })
    .map((card) => `${card.rank}${suitGlyph(card.suit)}`)
    .join(' ');

const spadesPlayed = (state: GameState): string => {
  return suitPlayed(state, 'spades');
};

const spadesUnplayed = (state: GameState): string => {
  return suitUnplayed(state, 'spades');
};

const suitPlayed = (state: GameState, suit: Card['suit']): string => {
  const seen = [...state.playHistory, ...state.trick.cards]
    .map((play) => play.card)
    .filter((card) => card.suit === suit);
  return formatCards(seen);
};

const suitUnplayed = (state: GameState, suit: Card['suit']): string => {
  const played = new Set(
    [...state.playHistory, ...state.trick.cards]
      .map((play) => play.card)
      .filter((card) => card.suit === suit)
      .map((card) => card.rank)
  );
  const unplayed = (Object.keys(rankOrder) as Card['rank'][])
    .filter((rank) => !played.has(rank))
    .map((rank) => ({ suit, rank }));
  return formatCards(unplayed);
};

const suitOrder: Record<Card['suit'], number> = {
  clubs: 0,
  diamonds: 1,
  hearts: 2,
  spades: 3
};

const shuffle = (cards: Card[]): Card[] => {
  const copy = cards.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
};
