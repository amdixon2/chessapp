# AGENTS.md


> Working agreement for chessapp (Chessgame Visualizer): clear, modular “agents” (people or roles) with inputs/outputs, success criteria, and handoffs. Use this doc as the operating system for development iteration.

## Top‑level goals
- Ship a smooth, responsive web app that replays a PGN (starting with Morphy’s Opera Game) with controls for start/prev/next/end/play.
- Keep the codebase simple (HTML/CSS/JS + `chess.js`) and easy to extend (multiple games, annotations, engine hooks).
- Maintain a professional look (Solarized‑inspired theme) with accessible interactions.

---

## Allowed git commands for codex agents
 - git add *
 - git commit

## Not allowed git commands for codex agents
 - anything other than above allowed commands

---

## Agent roster

### 1) **PGN & Game State Agent**
**Purpose**: Owns game loading, parsing, validation, and state transitions.

- **Inputs**: PGN string(s), load request from UI, control commands (start/prev/next/end/play).
- **Outputs**: Canonical move list, current FEN, current move index, legality checks.
- **Key tasks**:
  - Wrap `chess.js` usage into a clear API: `load_pgn(pgn)`, `load_ply(index)`, `getState()`.
  - Validate PGN; handle errors with user‑friendly messages.
  - Provide derived data (ply count, SAN list, turn, check/mate flags).
- **Acceptance**:
  - Unit tests pass for: malformed PGN, edge moves (castling, promotion, en passant), fast stepping.
  - No UI jank while stepping through 500+ ply games.

### 2) **Board Rendering Agent**
**Purpose**: Draws an 8×8 board and pieces, keeps visuals in sync with state.

- **Inputs**: FEN + highlighting instructions (last move, check, selected square).
- **Outputs**: Rendered board DOM/SVG; events bubbled to Controls Agent.
- **Key tasks**:
  - Render squares and piece sprites/SVG; compute coordinates correctly (a1 bottom‑left).
  - Resize responsively (e.g., 100px → 40px squares) with device‑pixel crispness.
  - Visual cues for last move, checks, and move under cursor in the move list.
- **Acceptance**:
  - Pixel‑perfect piece alignment; no overflow on small screens.
  - 60fps stepping on mid‑range laptop/phone for typical games.

### 3) **Controls & Playback Agent**
**Purpose**: The transport: Start, Prev, Next, End, Play/Pause.

- **Inputs**: Button clicks/keyboard shortcuts; current move index.
- **Outputs**: Commands to Game State Agent; playloop timer state.
- **Key tasks**:
  - Debounce clicks; avoid double‑step race conditions.
  - Play mode: configurable delay (e.g., 300–1500ms), pause on end.
  - Keyboard: ←/→ for prev/next, Home/End, Space to play/pause.
- **Acceptance**:
  - No missed or repeated steps with rapid user input.
  - Play mode remains smooth while CPU usage stays low.

### 4) **Move List & Annotation Agent**
**Purpose**: Shows SAN moves; supports hover/seek, annotations, and tags.

- **Inputs**: Canonical move list from Game State Agent.
- **Outputs**: Interactive move list DOM; selected/hovered move index.
- **Key tasks**:
  - Render SAN moves in rows; highlight current move.
  - Hover seek: hovering a move previews its position (non‑destructive); clicking jumps.
  - (Stretch) Inline comments (\{…\}), NAG glyphs (e.g., `!`, `?`), and per‑move markers.
- **Acceptance**:
  - Long games scroll performantly; accessible focus order.
  - Clear visual state for normal/hover/active.

### 5) **Theme & Layout Agent**
**Purpose**: Owns CSS system (Solarized‑inspired palette, dark‑first), responsive layout.

- **Inputs**: Design tokens (colors, spacing, radii), media queries.
- **Outputs**: CSS classes/variables; layout of header/board/sidebar/controls.
- **Key tasks**:
  - Define color variables; ensure contrast (WCAG AA for text/icons).
  - Flex layout: board + sidebar; tidy header with title & Analyse button.
  - Mobile: wrap sidebar under board; keep controls easy to tap.
- **Acceptance**:
  - Contrast checks pass; no layout shift on rotate.
  - Touch targets ≥ 40×40px; tab order logical.

### 6) **Analysis & Engine Hook Agent** (future‑facing)
**Purpose**: Provide optional analysis (eval bar, best‑move line) without bloating core.

- **Inputs**: Current FEN/position history.
- **Outputs**: Non‑blocking eval results; hints overlay.
- **Key tasks**:
  - Abstract provider interface (Stockfish WASM, cloud engine, or none).
  - Time‑boxed analysis (cancel when user steps or plays).
- **Acceptance**:
  - Core app works fully with agent disabled.
  - When enabled, UI stays responsive; errors are surfaced gracefully.

### 7) **Persistence & Settings Agent**
**Purpose**: Remember user preferences and recent games.

- **Inputs**: User actions (speed, theme, last game), custom PGN pasted.
- **Outputs**: `localStorage` snapshot (or URL hash) and restore routine.
- **Key tasks**:
  - Schema: `{ version, lastPGN, lastIndex, speedMs, theme }`.
  - Migrations on schema bump; safe defaults.
- **Acceptance**:
  - Fresh loads pick up prior state within 100ms.
  - Corrupted storage fails safe with no console errors.

### 8) **Quality Agent (Testing, Performance, Accessibility)**
**Purpose**: Quality gate and tooling.

- **Inputs**: Build artifacts, pages, flows.
- **Outputs**: Test suite, perf budget report, a11y checklist.
- **Key tasks**:
  - Unit tests for Game State & Controls; DOM tests for Move List.
  - Lighthouse perf/a11y run; target ≥ 90 for Performance & Accessibility.
  - Keyboard nav audit; screen‑reader labels (aria‑*).
- **Acceptance**:
  - CI checks pass locally (or via a simple script) before merging.

### 9) **Docs & Release Agent**
**Purpose**: Keep README, AGENTS.md, and CHANGELOG crisp; create tagged mini‑releases.

- **Inputs**: Feature diffs and notable changes.
- **Outputs**: Updated docs, semantic version tag when meaningful.
- **Key tasks**:
  - Update usage instructions; add keyboard shortcuts section.
  - Maintain a tiny CHANGELOG.md; add GIF of playback in README.
- **Acceptance**:
  - New contributors can run and understand the app in < 5 minutes.

---

## Interfaces & contracts

- **State model** (owned by PGN & Game State Agent)
  ```ts
  type GameState = {
    pgn: string;
    fen: string;         // current FEN
    index: number;       // ply index (0..N)
    moves: string[];     // SAN list
    inCheck: boolean;
    isGameOver: boolean; // checkmate, stalemate, etc.
  }
  ```
  - Public API: `loadFromPGN(pgn) → GameState`, `goTo(i)`, `step(±1)`, `getState()`.

- **Render contract** (Board Rendering Agent)
  - `renderBoard(state: GameState, opts?: { highlight?: { from: string; to: string }, checked?: boolean })`.
  - Emits `board:requestStep(±1)`, `board:seek(i)` events.

- **Controls contract** (Controls & Playback Agent)
  - `onClickStart/Prev/Next/End/Play` → calls state API; manages timer.
  - Emits `controls:play(started:boolean)` and `controls:speed(ms)`.

- **Move List contract**
  - `renderMoves(moves: string[], currentIndex: number)`.
  - Emits `movelist:hover(i)`, `movelist:select(i)`.

---

## Roadmap (short)
1. Extract Game State API from current `main()` and `load_from_pgn()`.
2. Wire Controls to State; add keyboard shortcuts.
3. Improve Move List (hover preview + click select).
4. Tidy CSS tokens, ensure a11y contrast.
5. (Optional) Persistence (speed/theme/last index) via `localStorage`.
6. Add basic tests and a perf/a11y check script.

---

## Definition of Done (overall)
- All agents’ acceptance criteria met.
- README updated with shortcuts + demo GIF.
- No console errors; stepping/playback is smooth; layout holds on small screens.
- One tagged mini‑release (e.g., `v0.2.0-visualizer`).

