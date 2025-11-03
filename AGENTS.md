# AGENTS.md — Chessapp

> **Purpose:** Define a clear, modular “agent” architecture for the Chessgame Visualiser (Chessapp) so the codebase can grow from a demo into a maintainable, testable application with engine-backed analysis.

## 1) Context
- **Project goal:** View and analyse chess games in the browser.
- **Current stack:** Static HTML/CSS/JS with `chess.js` as the rules/PGN parser; one PGN (Morphy’s Opera Game) hard‑coded for now.
- **Key UI:** A board, a sidebar move list, and game navigation controls: **Start / Prev / Next / End / Play**.

This document proposes a lightweight, message‑passing “agents” model that can be implemented incrementally from the existing code.

---

## 2) Agent Roster
Below are recommended agents (small, single‑responsibility modules). We'll start with the first five and add analysis later.

### A. **PGN Loader Agent**
**Responsibility**: Load PGN from a string, URL, or file input and normalise it.
- **Inputs**: `pgnSource: 'inline' | 'url' | 'file'`, `value: string`
- **Outputs (events)**: `pgn.loaded({ headers, movesSAN, initialFEN })`, `pgn.error({ reason })`
- **Key funcs**:
  - `load_pgn(pgn: string, moveListElement: DOMElement)
- **Notes**: Keep raw PGN text for export; pre‑compute move metadata (move numbers, nags, comments) if present.

### B. **Game State Agent** (wrapper over `chess.js`)
**Responsibility**: Own the canonical game state, apply moves, and derive legal moves.
- **Inputs**: `state.reset(fen?)`, `state.apply(index)`, `state.step(+/-1)`, `state.goto(index)`
- **Outputs**: `state.changed({ ply, fen, turn, isCheck, isMate, isDraw, lastMove })`
- **Key funcs**:
  - `reset(initialFEN?: string)`
  - `loadPGN(pgn: string)`
  - `ply()` → number, `history()` → SAN[]
  - `fen()`, `isCheck()`, `isGameOver()`
- **Notes**: This is the single source of truth (SSOT) for position.

### C. **Board Render Agent** (DOM/SVG canvas)
**Responsibility**: Render an 8×8 board and pieces; highlight squares and last move; adapt to responsive sizes.
- **Inputs**: `board.render(fen)`, `board.highlight({ from, to, checkSquare? })`
- **Outputs**: `board.square.click({ square })`, `board.ready`
- **Key funcs**:
  - `mount(rootEl: HTMLElement)`
  - `render(fen: string)`
  - `setTheme(themeName: 'solarized-dark' | 'light')`
- **Notes**: Draw once, then update pieces by diffing; keep CSS square size variables for responsiveness.

### D. **Move List Agent**
**Responsibility**: Show SAN moves in a scrollable list with the current ply selected; support click‑to‑jump.
- **Inputs**: `moves.render(list: SAN[])`, `moves.setActive(ply: number)`
- **Outputs**: `moves.click({ ply })`
- **Key funcs**:
  - `mount(sidebarEl)`
  - `render(moves: string[])`
  - `scrollIntoView(ply)`

### E. **Navigation Controls Agent** (Start/Prev/Next/End/Play)
**Responsibility**: Wire the five buttons and fire navigation intents.
- **Inputs**: none (reads DOM IDs); optional `controls.setEnabled({ play: boolean, prev: boolean, ... })`
- **Outputs**: `controls.intent({ type: 'start'|'prev'|'next'|'end'|'play-toggle' })`
- **Key funcs**:
  - `mount(buttons: { start, prev, next, end, play })`
  - `setPlaying(isPlaying: boolean)`
- **Notes**: Debounce button spam; disable where appropriate at bounds.

### F. **Playback Agent**
**Responsibility**: Auto‑advance through moves at a configurable tempo.
- **Inputs**: `playback.start({ intervalMs })`, `playback.stop()`, `playback.toggle()`
- **Outputs**: `playback.tick` (consumer steps Game State by +1)
- **Notes**: Pause on mate/terminal state; expose `intervalMs` slider.

### G. **Analysis Agent** (optional; future)
**Responsibility**: Feed positions to a chess engine (stockfish.wasm) and return evaluations and best lines.
- **Inputs**: `analysis.request({ fen, depth?, movetime? })`
- **Outputs**: `analysis.update({ fen, scoreCp|scoreMate, pv: SAN[] })`, `analysis.ready`
- **Notes**: Batch while scrubbing; cache by FEN; show eval bar and arrow.

### H. **Annotations Agent** (optional)
**Responsibility**: Store and render comments, arrows, and custom highlights.
- **Inputs**: `annotations.add({ ply, text|arrow|shape })`
- **Outputs**: `annotations.changed`

---

## 3) Data Contracts
- **`state.changed` payload**
```ts
{
  ply: number;           // 0-based ply index
  fen: string;           // Forsyth–Edwards Notation for current position
  turn: 'w' | 'b';
  isCheck: boolean;
  isMate: boolean;
  isDraw: boolean;
  lastMove?: { from: string; to: string; san: string };
}
```
- **`analysis.update` payload** (optional)
```ts
{
  fen: string;
  score: { type: 'cp'|'mate'; value: number }; // cp: centipawns, mate: moves to mate (sign by side)
  pv: string[]; // SAN principal variation
}
```

---

## 4) Minimal Implementation Plan (Incremental)
1. **Extract modules** inside `chessapp.js`: `state`, `board`, `moves`, `controls`, `playback`.
2. **PGN source**: Keep current inline PGN; add an `<input type="file">` and a URL box later.
4. **Styling**: Retain Solarized theme; expose a CSS variable `--square-size` and compute responsive sizes from it.
5. **Accessibility**: Add `aria-pressed` and `aria-label` to controls; keyboard shortcuts: `Home ← → End Space`.

---

## 5) Analysis Agent (Stockfish.wasm) — Notes for Later
- Add `stockfish.js` worker; use `postMessage({ cmd: 'position', fen })` and `postMessage({ cmd: 'go', depth })`.
- Throttle while scrubbing; cache by FEN (Map).
- UI: small eval bar, best move arrow overlay, PV snippet beneath move list.

---

## 6) Testing Strategy
- **Unit**: `state` (PGN load, step/goto, terminal flags); `playback` timer logic.
- **DOM**: Board renders correct pieces for a sample FEN; move list highlights the active ply; buttons disable at bounds.
- **E2E (optional)**: Cypress to load page, click through, verify board squares.

---

## 7) Mapping to Files (today → target)
- `chessapp.html` → mounts board, sidebar, controls; adds file/url inputs (later).
- `chessapp.css` → keep theme; add CSS variables for sizing and highlights.
- `chessapp.js` → split into agents (or namespaced objects) + tiny bus.
- `chess.js` → external rules engine (keep as‑is).

---

## 8) Backlog / Roadmap
1. PGN input (file & URL) + error handling.
2. Keyboard shortcuts & focus styles.
3. Playback speed slider (0.5×–3×).
4. Eval bar & engine PV (Stockfish.wasm).
5. Comments/annotations (arrows, colored squares).
6. Export annotated PGN.
7. Multi‑game gallery and opening explorer (optional).

---

## 9) Conventions
- **Naming**: functions should be named in lower-snake case.
- **Events**: `namespace.action` dot‑notation, lower‑snake for payload keys.
- **Types**: JSDoc typedefs if staying in JS; TS recommended when modules grow.
- **Linting**: Prettier + ESLint later; keep functions under ~60 lines.

---

## 10) Definition of Done (baseline)
- Load a PGN (inline or file) → see moves in sidebar → navigate via buttons & keyboard → playback works without skipping → board & move list stay in sync → check/mate visually indicated.

