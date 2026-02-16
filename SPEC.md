# Hearts PWA Spec (Angular, iPhone-first)

## Goals
- Single-player Hearts with 3 computer opponents.
- iPhone-first, no scrolling on gameplay screens.
- PWA, offline-capable, Angular best practices.
- Classic card table visual style.

## Non-Goals (MVP)
- Complex AI beyond heuristic tiers.

## Routes
- `/` Home (start game, settings, help)
- `/game` Main table (no scroll)
- `/results` Round summary / scoreboard
- `/rules` Rules and how-to-play

## UI Layout Rules (No Scroll)
- Use `100dvh` with `overflow: hidden` on main game view.
- All cards must remain within viewport height on iPhone.
- Card size scales by viewport width; max height capped.
- Use `safe-area-inset` padding for notch devices.
- Lock page scroll on game screen.

## Component Tree (Angular standalone)
- `AppComponent`
  - `AppShellComponent` (layout, safe-area padding)
  - `RouterOutlet`
- `HomePageComponent`
- `GamePageComponent`
  - `TableComponent`
    - `PlayerAreaComponent` (north, south, east, west)
    - `TrickCenterComponent`
    - `ScoreOverlayComponent`
    - `PassPhaseComponent`
- `ResultsPageComponent`
- `RulesPageComponent`

## Services
- `GameStateService`
  - Signal-based state store
  - Game phases, hands, scores, turn order
- `RulesService`
  - Legal move validation
  - Scoring rules
  - Passing rules
- `AiService`
  - Strategy selection per computer player
  - Delegates to `AiStrategy` implementations
- `PersistenceService`
  - Local storage for settings and last scoreboard

## State Model (Core)
- `GameState`
  - `phase: 'deal' | 'pass' | 'play' | 'score' | 'summary'`
  - `players: Player[]`
  - `trick: Trick`
  - `round: number`
  - `turnPlayerId: string`
  - `passDirection: 'left' | 'right' | 'across' | 'none'`
- `Player`
  - `id: string`
  - `name: string`
  - `type: 'human' | 'cpu'`
  - `aiLevel?: 'dumb' | 'smart' | 'card-shark'`
  - `hand: Card[]`
  - `score: number`
- `Trick`
  - `leaderId: string`
  - `cards: PlayedCard[]`
- `PlayedCard`
  - `playerId: string`
  - `card: Card`
- `Card`
  - `suit: 'clubs' | 'diamonds' | 'hearts' | 'spades'`
  - `rank: '2'..'A'`

## AI Strategy Tiers
- Dumb
  - Random legal card, must follow suit.
- Smart
  - Heuristic: avoid points, shed high spades, keep low hearts.
- Card Shark
  - Tracks seen cards, estimates remaining suits.
  - Optimizes for point avoidance and anti-moon play.

## Game Rules (Hearts)
- 4 players, 13 cards each.
- Pass phase for 3 rounds: left, right, across, then no pass.
- Must follow suit if possible.
- Hearts cannot be led until broken.
- Scoring: hearts = 1 point, Q spades = 13 points.
- Shooting the moon: if a player takes all points, others get 26.

## PWA Requirements
- `ng add @angular/pwa`
- Cache static assets for offline play.
- Offline-first for gameplay; no network calls required.

## Performance & Accessibility
- Target 60fps animations.
- Prefer CSS transforms for card movements.
- Tap targets >= 44px.
- VoiceOver labels for card selection.

## Testing
- Unit tests for rules and AI decisions.
- Component tests for game flow.
- Snapshot tests for layout breakpoints.
