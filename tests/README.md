
## `chessapp.test.js`

- **Purpose:** Assert the core board-parsing logic behaves as expected outside the browser.
- **What it enforces:** `fen2matrix` always returns an 8×8 matrix and correctly expands mixed piece/empty runs for representative FEN strings.

### Run locally

```bash
node --test tests/chessapp.test.js
```

Because the browser bootstrapping now checks for `document` before registering event listeners, the module can be required directly in Node without additional stubs. Additional pure-logic helpers can be added to the export surface and exercised here in the same fashion.

