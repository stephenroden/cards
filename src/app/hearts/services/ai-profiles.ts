export type PlayStyleId = 'dumb' | 'smart' | 'card-shark';
export type PassStyleId = 'dumb' | 'smart' | 'card-shark';

export interface PassTuning {
  queenSpades: number;
  aceSpades: number;
  kingSpades: number;
  heartBase: number;
  honorBase: number;
  voidBonusPerMissingCard: number;
}

export interface AiProfile {
  id: string;
  label: string;
  playStyle: PlayStyleId;
  passStyle: PassStyleId;
  passTuning?: Partial<PassTuning>;
  traits?: {
    endgameDefensive?: boolean;
    spadePressure?: boolean;
    antiMoonSentinel?: boolean;
  };
}

export const DEFAULT_PASS_TUNING: PassTuning = {
  queenSpades: 600,
  aceSpades: 280,
  kingSpades: 280,
  heartBase: 140,
  honorBase: 70,
  voidBonusPerMissingCard: 60
};

export const AI_PROFILES: Record<string, AiProfile> = {
  dumb: {
    id: 'dumb',
    label: 'Dumb Baseline',
    playStyle: 'dumb',
    passStyle: 'dumb'
  },
  smart: {
    id: 'smart',
    label: 'Smart Avoidance',
    playStyle: 'smart',
    passStyle: 'smart'
  },
  'card-shark': {
    id: 'card-shark',
    label: 'Card Shark',
    playStyle: 'card-shark',
    passStyle: 'card-shark'
  },
  'endgame-defensive': {
    id: 'endgame-defensive',
    label: 'Endgame Defensive',
    playStyle: 'card-shark',
    passStyle: 'card-shark',
    traits: {
      endgameDefensive: true
    }
  },
  'spade-pressure': {
    id: 'spade-pressure',
    label: 'Spade Pressure',
    playStyle: 'card-shark',
    passStyle: 'smart',
    traits: {
      spadePressure: true
    }
  },
  'anti-moon-sentinel': {
    id: 'anti-moon-sentinel',
    label: 'Anti-Moon Sentinel',
    playStyle: 'card-shark',
    passStyle: 'card-shark',
    traits: {
      antiMoonSentinel: true,
      endgameDefensive: true
    }
  }
};
