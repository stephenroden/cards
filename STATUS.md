# Project Status

## Current State
- Angular PWA app scaffolded (standalone + routing + strict).
- Hearts game flow implemented: deal, pass phase, play phase, trick resolution, round scoring.
- 3 computer players (dumb/smart/card-shark) with basic heuristics.
- UI shows table layout, hand, trick, and pass selection.
- Header now shows global actions on `/game` (Results, Exit).
- Pass button is embedded near the status area in the table.

## Key Files
- `src/app/game/services/game-engine.service.ts` (round flow, pass logic, scoring)
- `src/app/game/services/rules.service.ts` (legal play + trick winner)
- `src/app/game/services/ai.service.ts` (AI tiers)
- `src/app/pages/game/game.page.ts` (UI state + pass selection)
- `src/app/pages/game/game.page.html` + `src/app/pages/game/game.page.css` (table layout + cards)
- `src/app/app.html` + `src/app/app.css` (header actions)

## What’s Working
- Pass phase (left/right/across/none) with CPU auto-pass and human selection.
- Legal plays enforced during play.
- Trick winner and round scoring (including shoot-the-moon logic).
- Suit symbols and red/black coloring.

## Known Issues / TODO
- Header action “New Round” is not wired (removed to avoid route misuse).
- Card layout is still tight on small screens; may need further sizing or fan layout.
- Results screen is still static placeholder (not wired to state).
- Rules tests exist but AI and pass logic tests are minimal.

## Suggested Next Steps
1. Wire Results screen to real scores and round history.
2. Implement a real card layout (fan, spacing) to ensure no-scroll on iPhone.
3. Strengthen AI heuristics and add unit tests for pass logic.
4. Consider adding a "New Round" button near title that calls GameEngineService.
