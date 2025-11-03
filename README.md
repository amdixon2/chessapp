# Project Summary — Chessgame Visualizer (chessapp)

## Overview
This web application visualizes **Paul Morphy’s Opera Game (1858)** in an interactive, browser-based interface. The project uses HTML, CSS, and JavaScript (with the `chess.js` library) to display a chessboard, move list, and control buttons for navigation and playback.

---

## Current Structure

### Files
- **chessapp.html** — Main structure and layout of the web interface.
- **chessapp.css** — Visual theme (Solarized Dark), responsive layout, and board styling.
- **chessapp.js** — Main logic for rendering the chessboard, handling buttons, parsing PGN, and future animations.
- **chess.js** — Local script (included via `<script src="chess.js"></script>`) used for parsing PGN and managing chess logic.

---

## Key UI Components

### Header
- Displays the game title.

### Main Layout
- Uses a **flexbox layout** with two regions:
  - **Board area** — contains the chessboard and control buttons.
  - **Sidebar** — lists the move sequence extracted from the PGN.

### Board and Pieces
- Board squares are styled to be **100×100 px** on large screens and **40×40 px** on small screens.
- Piece images are sized to match square dimensions.
- Colors follow the Solarized palette (light/dark blue and cream).

### Controls
Buttons under the board with IDs:
- `btnStart`, `btnPrev`, `btnNext`, `btnEnd`, `btnPlay` — control navigation and animation.
- Each button has a `click` event handler with console logging for now.


---

## JavaScript Structure

### Functions
- `main()` — Initializes DOM elements, draws the starting board, loads the PGN, and attaches event listeners.
- `drawBoard()` — Renders an 8×8 grid and places chess pieces using SVG images.
- `load_from_pgn()` — Loads a hardcoded PGN using `chess.loadPgn()` and extracts the move list from `chess.history()`.
- `btn*_click()` — Separate named functions for each control button’s event handling (e.g., `btnPlay_click`, `btnStart_click`).

### Flow
1. `DOMContentLoaded` triggers `main()`.
2. The board and move list are rendered immediately.

---

## CSS Details
- **Responsive:** Board and pieces resize from 100px to 40px based on viewport width.
- **Sidebar:** width is 200px on desktop. 320px on small screens and it renders horizontally with wrapping on small screens.
- **Header:** Compact padding (10px) with centered title and left-aligned Analyse button.

---

