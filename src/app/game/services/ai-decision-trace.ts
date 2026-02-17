import { AiDecisionTrace, Card, GameRules, GameState, Player } from '../game.models';
import { scoreCard } from './scoring';

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

export const describeChoice = (
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
    factors['jd_wins_now'] = winsNow;
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
    const riskyHighSpadeLead =
      choice.suit === 'spades' && (choice.rank === 'A' || choice.rank === 'K') && queenUnseen && !holdQueen;
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

const spadesPlayed = (state: GameState): string => suitPlayed(state, 'spades');

const spadesUnplayed = (state: GameState): string => suitUnplayed(state, 'spades');

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

const isJackDiamondsBonus = (card: Card, rules: GameRules): boolean =>
  rules.jackOfDiamondsMinus10 && card.suit === 'diamonds' && card.rank === 'J';
