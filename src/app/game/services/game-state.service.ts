import { Injectable, signal } from '@angular/core';
import { Card, DEFAULT_GAME_RULES, GameRules, GameState, Player, RANKS, SUITS } from '../game.models';

type CpuSkillLevel = 'Easy' | 'Medium' | 'Hard';

interface CpuBotTemplate {
  name: string;
  aiProfileId: string;
  level: CpuSkillLevel;
}

const CPU_BOT_POOL: CpuBotTemplate[] = [
  { name: 'Rookie Ron', aiProfileId: 'dumb', level: 'Easy' },
  { name: 'Cautious Cam', aiProfileId: 'smart', level: 'Easy' },
  { name: 'Shark Finn', aiProfileId: 'card-shark', level: 'Medium' },
  { name: 'Pressure Pat', aiProfileId: 'spade-pressure', level: 'Medium' },
  { name: 'Closer Quinn', aiProfileId: 'endgame-defensive', level: 'Hard' },
  { name: 'Sentinel Nova', aiProfileId: 'anti-moon-sentinel', level: 'Hard' }
];

const randomCpuPlayers = (): Player[] => {
  const selection = shuffle(CPU_BOT_POOL).slice(0, 3);
  return selection.map((selected, index) => {
    return {
      id: `p${index + 2}`,
      name: selected.name,
      type: 'cpu',
      aiProfileId: selected.aiProfileId,
      hand: [],
      score: 0
    };
  });
};

const initialState = (rulesOverride?: Partial<GameRules>): GameState => ({
  phase: 'deal',
  rules: { ...DEFAULT_GAME_RULES, ...(rulesOverride ?? {}) },
  players: [
    { id: 'p1', name: 'You', type: 'human', hand: [], score: 0 },
    ...randomCpuPlayers()
  ],
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
  aiReasonVisibility: { p2: false, p3: false, p4: false },
  passComplete: false
});

@Injectable({
  providedIn: 'root'
})
export class GameStateService {
  readonly state = signal<GameState>(initialState());

  reset(rulesOverride?: Partial<GameRules>): void {
    this.state.set(initialState(rulesOverride));
  }

  setRules(rules: Partial<GameRules>): void {
    this.state.update((current) => ({
      ...current,
      rules: {
        ...current.rules,
        ...rules
      }
    }));
  }

  startNewRound(): void {
    const deck = this.buildDeck();
    const shuffled = shuffle(deck);
    const hands = deal(shuffled, 4);
    const players = this.state().players.map((player, index) => ({
      ...player,
      hand: hands[index]
    }));

    this.state.update((current) => ({
      ...current,
      phase: 'pass',
      players,
      trick: { leaderId: current.turnPlayerId, cards: [] },
      trickWinnerId: undefined,
      trickTaking: false,
      heartsBroken: false,
      takenCards: {},
      playHistory: [],
      passTransfers: [],
      passSelections: {},
      aiDecisionReasons: {},
      aiDecisionTraces: {},
      aiDecisionHistory: {},
      debugRoundHistory: [],
      aiReasonVisibility: current.aiReasonVisibility,
      passComplete: false
    }));
  }

  setState(next: GameState): void {
    this.state.set(next);
  }

  update(partial: Partial<GameState>): void {
    this.state.update((current) => ({ ...current, ...partial }));
  }

  private buildDeck(): Card[] {
    const deck: Card[] = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ suit, rank });
      }
    }
    return deck;
  }
}

const shuffle = <T>(items: T[]): T[] => {
  const copy = items.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
};

const deal = (cards: Card[], players: number): Card[][] => {
  const hands: Card[][] = Array.from({ length: players }, () => []);
  cards.forEach((card, index) => {
    hands[index % players].push(card);
  });
  return hands;
};
