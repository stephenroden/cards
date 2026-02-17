import { AiDecisionTrace, Card } from '../../game/game.models';

export type TraceLike = Pick<AiDecisionTrace, 'factors'>;

export const reasonLabel = (reasonCode: string): string => {
  if (reasonCode === 'capture_bonus_jd') {
    return 'Chased the bonus card';
  }
  if (reasonCode === 'dump_danger_card') {
    return 'Dumped a dangerous card';
  }
  if (reasonCode === 'duck_follow_low') {
    return 'Played low to avoid winning';
  }
  if (reasonCode === 'take_control_high') {
    return 'Took control of the trick';
  }
  if (reasonCode === 'shed_high_without_winning') {
    return 'Shed a high card while still losing';
  }
  if (reasonCode === 'safe_lead') {
    return 'Made a safe lead';
  }
  if (reasonCode === 'risky_spade_lead') {
    return 'Risked a high spade lead (Q♠ unseen)';
  }
  if (reasonCode === 'lowest_risk_legal') {
    return 'Picked the safest legal card';
  }
  if (reasonCode === 'human_play') {
    return 'Human play';
  }
  if (reasonCode === 'hearts_broken') {
    return 'Hearts were broken';
  }
  if (reasonCode === 'forced_follow_suit') {
    return 'Had to follow suit';
  }
  return reasonCode;
};

export const qSpadeContext = (trace: TraceLike): string => {
  const hand = trace.factors['hand_cards'];
  const played = trace.factors['spades_played'];
  const unplayed = trace.factors['spades_unplayed'];
  if (!hand && !played && !unplayed) {
    return '';
  }
  return `hand=[${hand ?? ''}] played_spades=[${played ?? ''}] unplayed_spades=[${unplayed ?? ''}]`;
};

export const jDiamondContext = (trace: TraceLike): string => {
  const hand = trace.factors['hand_cards'];
  const played = trace.factors['diamonds_played'];
  const unplayed = trace.factors['diamonds_unplayed'];
  if (!hand && !played && !unplayed) {
    return '';
  }
  return `hand=[${hand ?? ''}] played_diamonds=[${played ?? ''}] unplayed_diamonds=[${unplayed ?? ''}]`;
};

export const genericContext = (trace: TraceLike): string => {
  const hand = trace.factors['hand_cards'];
  const chosenSuit = trace.factors['chosen_suit'];
  const played = trace.factors['suit_played'];
  const unplayed = trace.factors['suit_unplayed'];
  if (!hand && !played && !unplayed) {
    return '';
  }
  return `hand=[${hand ?? ''}] suit=[${chosenSuit ?? ''}] played=[${played ?? ''}] unplayed=[${unplayed ?? ''}]`;
};

export const suitSymbol = (suit: Card['suit']): string => {
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

export const cardImage = (card: Card): string => `cards/${faceSuitName(card.suit)}_${card.rank}.svg`;

const faceSuitName = (suit: Card['suit']): string => {
  if (suit === 'clubs') {
    return 'club';
  }
  if (suit === 'diamonds') {
    return 'diamond';
  }
  if (suit === 'hearts') {
    return 'heart';
  }
  return 'spade';
};

export const findNewCards = (previous: Card[], current: Card[]): Card[] => {
  const counts = new Map<string, number>();
  for (const card of previous) {
    const key = `${card.suit}-${card.rank}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const added: Card[] = [];
  for (const card of current) {
    const key = `${card.suit}-${card.rank}`;
    const remaining = counts.get(key) ?? 0;
    if (remaining > 0) {
      counts.set(key, remaining - 1);
    } else {
      added.push(card);
    }
  }
  return added;
};
