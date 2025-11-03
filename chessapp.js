/* Wikipedia SVG pieces */
const pieceImages = {
  'r': 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg',
  'n': 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg',
  'b': 'https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg',
  'q': 'https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg',
  'k': 'https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg',
  'p': 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg',
  'R': 'https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg',
  'N': 'https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg',
  'B': 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg',
  'Q': 'https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg',
  'K': 'https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg',
  'P': 'https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg'
};

/* Morphy's Opera Game PGN */
const operaGamePGN =
  "1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8#";

/* --- Global-ish state --- */
let boardEl = null;
let moveListEl = null;
let sidebarLis = [];
let game = null;
let positions = [];
let currentPly = 0;
let autoplayTimer = null;
let isPlaying = false;
let lastMatrix = null;

/* Convert a FEN to an 8x8 array */
function fen2matrix(fen) {
  const boardPart = fen.split(' ')[0];
  const rows = boardPart.split('/');
  const matrix = [];

  for (let r = 0; r < 8; r++) {
    const fenRow = rows[r];
    const rowArr = [];
    for (let i = 0; i < fenRow.length; i++) {
      const ch = fenRow[i];
      if (ch >= '1' && ch <= '8') {
        const emptyCount = parseInt(ch, 10);
        for (let j = 0; j < emptyCount; j++) rowArr.push('');
      } else {
        rowArr.push(ch);
      }
    }
    matrix.push(rowArr);
  }
  return matrix;
}

/* Create 64 squares once */
function ensure_board_skeleton() {
  if (boardEl.children.length === 64) return;
  boardEl.innerHTML = '';
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const square = document.createElement('div');
      square.classList.add('square', (row + col) % 2 === 0 ? 'white' : 'black');
      boardEl.appendChild(square);
    }
  }
}

/* helper for fade-out removal */
function fadeOutAndRemove(el, duration = 200) {
  el.style.transition = `opacity ${duration}ms ease`;
  el.style.opacity = 0;
  setTimeout(() => {
    if (el.parentNode) {
      el.parentNode.removeChild(el);
    }
  }, duration);
}

/* helper for fade-in */
function createPieceImg(piece, duration = 200) {
  const img = document.createElement('img');
  img.src = pieceImages[piece];
  img.alt = piece;
  img.style.opacity = 0;
  img.style.transition = `opacity ${duration}ms ease`;
  requestAnimationFrame(() => {
    img.style.opacity = 1;
  });
  return img;
}

/* Incremental draw_board, with option to force full repaint */
function draw_board(fen, forceFull = false) {
  const matrix = fen2matrix(fen);
  ensure_board_skeleton();

  const firstTime = !lastMatrix;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const idx = row * 8 + col;
      const square = boardEl.children[idx];
      const newPiece = matrix[row][col];
      const oldPiece = firstTime ? '' : lastMatrix[row][col];

      const shouldReplace = forceFull || (newPiece !== oldPiece);

      if (!shouldReplace) continue;

      const oldImg = square.querySelector('img');
      if (oldImg) {
        fadeOutAndRemove(oldImg);
      }

      if (newPiece) {
        const img = createPieceImg(newPiece);
        square.appendChild(img);
      }
    }
  }
  lastMatrix = matrix;
}

/* Highlight the current move */
function highlight_move(ply) {
  const moveIndex = Math.floor((ply - 1) / 2);
  sidebarLis.forEach(li => li.classList.remove('move-active'));
  if (ply === 0) return;
  if (moveIndex >= 0 && moveIndex < sidebarLis.length) {
    sidebarLis[moveIndex].classList.add('move-active');
    sidebarLis[moveIndex].scrollIntoView({ block: 'nearest' });
  }
}

/* Go to ply */
function load_ply(ply, forceFull = false) {
  if (ply < 0) ply = 0;
  if (ply >= positions.length) ply = positions.length - 1;
  currentPly = ply;
  draw_board(positions[currentPly], forceFull);
  highlight_move(currentPly);
}

/* Button handlers */
function btnStart_click() { stop_autoplay(); load_ply(0, true); }
function btnPrev_click() { stop_autoplay(); load_ply(currentPly - 1, false); }
function btnNext_click() { stop_autoplay(); load_ply(currentPly + 1, false); }
function btnEnd_click() { stop_autoplay(); load_ply(positions.length - 1, true); }

function start_autoplay() {
  if (isPlaying) return;
  isPlaying = true;
  document.getElementById('btnPlay').textContent = '⏸';
  autoplayTimer = setInterval(() => {
    if (currentPly < positions.length - 1) {
      load_ply(currentPly + 1, false);
    } else {
      stop_autoplay();
    }
  }, 900);
}

function stop_autoplay() {
  if (!isPlaying) return;
  isPlaying = false;
  document.getElementById('btnPlay').textContent = '+';
  clearInterval(autoplayTimer);
  autoplayTimer = null;
}

function btnPlay_click() {
  isPlaying ? stop_autoplay() : start_autoplay();
}

/* Load PGN and precompute positions */
function load_pgn(pgn, moveListElement) {
  if (typeof Chess === 'undefined') {
    console.error('chess.js missing.');
    return;
  }
  game = new Chess();
  game.loadPgn(pgn);
  const historyMoves = game.history();
  moveListElement.innerHTML = '';
  const movesAsPairs = [];
  for (let i = 0; i < historyMoves.length; i += 2) {
    const whiteMove = historyMoves[i];
    const blackMove = historyMoves[i + 1] ? historyMoves[i + 1] : '';
    const li = document.createElement('li');
    li.textContent = blackMove ? `${whiteMove} ${blackMove}` : whiteMove;
    moveListElement.appendChild(li);
    movesAsPairs.push(li);
  }
  sidebarLis = movesAsPairs;

  const tmp = new Chess();
  positions = [tmp.fen()];
  historyMoves.forEach(mv => {
    tmp.move(mv);
    positions.push(tmp.fen());
  });
}

/* Main */
function main() {
  boardEl = document.getElementById('chessboard');
  moveListEl = document.getElementById('moveList');
  document.getElementById('btnStart').addEventListener('click', btnStart_click);
  document.getElementById('btnPrev').addEventListener('click', btnPrev_click);
  document.getElementById('btnNext').addEventListener('click', btnNext_click);
  document.getElementById('btnEnd').addEventListener('click', btnEnd_click);
  document.getElementById('btnPlay').addEventListener('click', btnPlay_click);
  load_pgn(operaGamePGN, moveListEl);
  load_ply(0, true);
}

document.addEventListener('DOMContentLoaded', main);
