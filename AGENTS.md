# AGENTS.md — Chessapp

> **Purpose:** Define a clear, modular “agent” architecture for the Chessgame Visualiser so the codebase can grow from a single-page demo into a maintainable, testable application with optional engine-backed analysis.

## 1) Context
- **Project goal:** View (and eventually analyse) chess games in the browser.
- **Current stack:** Static HTML/CSS/JS with `chess.js` as the rules/PGN parser; one PGN (Morphy’s Opera Game) hard‑coded for now.
- **Key UI:** A board, a sidebar move list, and transport controls: **Start / Prev / Next / End / Play**.

This document proposes a lightweight, message‑passing “agents” model you can implement incrementally inside the existing files or as modules.

---

## 2) Agent Roster
Below are recommended agents (small, single‑responsibility modules). You can start with the first five and add analysis later.

### A. **PGN Loader Agent**
**Responsibility**: Load PGN from a string, URL, or file input and normalise it.
- **Inputs**: `pgnSource: 'inline' | 'url' | 'file'`, `value: string`
- **Outputs (events)**: `pgn.loaded({ headers, movesSAN, initialFEN })`, `pgn.error({ reason })`
- **Key funcs**:
  - `loadFromString(pgn: string)`
  - `loadFromUrl(url: string)`
  - `loadFromFile(file: File)`
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

### E. **Transport Controls Agent** (Start/Prev/Next/End/Play)
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
**Responsibility**: Feed positions to a chess engine (e.g., stockfish.wasm) and return evaluations and best lines.
- **Inputs**: `analysis.request({ fen, depth?, movetime? })`
- **Outputs**: `analysis.update({ fen, scoreCp|scoreMate, pv: SAN[] })`, `analysis.ready`
- **Notes**: Batch while scrubbing; cache by FEN; show eval bar and arrow.

### H. **Annotations Agent** (optional)
**Responsibility**: Store and render comments, arrows, and custom highlights.
- **Inputs**: `annotations.add({ ply, text|arrow|shape })`
- **Outputs**: `annotations.changed`

### I. **Telemetry/Logging Agent** (optional)
**Responsibility**: Console/file logging for debugging and basic perf timings.
- **Inputs**: `log(event: string, payload?: any)`
- **Outputs**: dev‑only; no UI.

---

## 3) Message Bus (Orchestration)
Use a tiny pub/sub utility to decouple agents:
```ts
// bus.ts (pseudo‑code)
const listeners = new Map<string, Set<Function>>();
export function on(topic, fn) { (listeners.get(topic) ?? listeners.set(topic, new Set()).get(topic)).add(fn); }
export function off(topic, fn) { listeners.get(topic)?.delete(fn); }
export function emit(topic, data) { listeners.get(topic)?.forEach(f => f(data)); }
```
**Event flow example (happy path):**
1) `PGN Loader` emits `pgn.loaded` → `Game State` loads PGN, emits `state.changed`.
2) `Board Render` and `Move List` subscribe to `state.changed` → update visuals.
3) User clicks **Next** → `Transport Controls` emits `controls.intent('next')` → `Game State.step(+1)` → cascade `state.changed`.
4) **Play** toggles `Playback`, which emits `tick` on a timer → handled as above.

---

## 4) Data Contracts
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

## 5) Minimal Implementation Plan (Incremental)
1. **Extract modules** inside `chessapp.js`: `bus`, `state`, `board`, `moves`, `controls`, `playback`.
2. **Wiring**: In `main()`, `mount` each agent with DOM nodes, then subscribe to events.
3. **PGN source**: Keep current inline PGN; add an `<input type="file">` and a URL box later.
4. **Styling**: Retain Solarized theme; expose a CSS variable `--square-size` and compute responsive sizes from it.
5. **Accessibility**: Add `aria-pressed` and `aria-label` to controls; keyboard shortcuts: `Home ← → End Space`.

---

## 6) Example Glue (TypeScript‑ish pseudocode)
```ts
import { emit, on } from './bus';
import { createState } from './state';
import { createBoard } from './board';
import { createMoves } from './moves';
import { createControls } from './controls';
import { createPlayback } from './playback';

const state = createState();
const board = createBoard('#board');
const moves = createMoves('#moves');
const controls = createControls({ start:'#btnStart', prev:'#btnPrev', next:'#btnNext', end:'#btnEnd', play:'#btnPlay' });
const playback = createPlayback();

on('pgn.loaded', ({ text }) => state.loadPGN(text));
on('controls.intent', ({ type }) => {
  if (type==='start') state.goto(0);
  else if (type==='prev') state.step(-1);
  else if (type==='next') state.step(+1);
  else if (type==='end') state.goto(Infinity);
  else if (type==='play-toggle') playback.toggle();
});

on('state.changed', (s) => { board.render(s.fen); moves.setActive(s.ply); });
on('playback.tick', () => state.step(+1));
```

---

## 7) Analysis Agent (Stockfish.wasm) — Notes for Later
- Add `stockfish.js` worker; use `postMessage({ cmd: 'position', fen })` and `postMessage({ cmd: 'go', depth })`.
- Throttle while scrubbing; cache by FEN (Map).
- UI: small eval bar, best move arrow overlay, PV snippet beneath move list.

---

## 8) Testing Strategy
- **Unit**: `state` (PGN load, step/goto, terminal flags); `playback` timer logic.
- **DOM**: Board renders correct pieces for a sample FEN; move list highlights the active ply; buttons disable at bounds.
- **E2E (optional)**: Cypress to load page, click through, verify board squares.

---

## 9) Mapping to Files (today → target)
- `chessapp.html` → mounts board, sidebar, controls; adds file/url inputs (later).
- `chessapp.css` → keep theme; add CSS variables for sizing and highlights.
- `chessapp.js` → split into agents (or namespaced objects) + tiny bus.
- `chess.js` → external rules engine (keep as‑is).

---

## 10) Backlog / Roadmap
1. PGN input (file & URL) + error handling.
2. Keyboard shortcuts & focus styles.
3. Playback speed slider (0.5×–3×).
4. Eval bar & engine PV (Stockfish.wasm).
5. Comments/annotations (arrows, colored squares).
6. Export annotated PGN.
7. Multi‑game gallery and opening explorer (optional).

---

## 11) Conventions
- **Naming**: `createX()` factories returning `{ mount, render, ... }`.
- **Events**: `namespace.action` dot‑notation, lower‑snake for payload keys.
- **Types**: JSDoc typedefs if staying in JS; TS recommended when modules grow.
- **Linting**: Prettier + ESLint later; keep functions under ~60 lines.

---

## 12) Definition of Done (baseline)
- Load a PGN (inline or file) → see moves in sidebar → navigate via buttons & keyboard → playback works without skipping → board & move list stay in sync → check/mate visually indicated.

