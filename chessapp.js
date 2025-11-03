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
let evalCanvas = null;
let evalCtx = null;
let lossCanvas = null;
let lossCtx = null;
let accuracyCanvas = null;
let accuracyCtx = null;
let accuracyValues = [];
let headerMenuEl = null;
let menuToggleBtn = null;
let menuListEl = null;

const EVAL_SCALE_MIN = -9;
const EVAL_SCALE_MAX = 9;
const LOSS_SCALE_MAX = 9;
const ACCURACY_SCALE_MAX = 100;

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
  renderEvaluationChart();
  renderLossChart();
  renderAccuracyChart();
}

function header_menu_set_open(isOpen) {
  if (!headerMenuEl || !menuToggleBtn) return;
  headerMenuEl.classList.toggle('header-menu--open', isOpen);
  menuToggleBtn.setAttribute('aria-expanded', String(isOpen));
}

function header_menu_toggle() {
  if (!headerMenuEl) return;
  const isOpen = headerMenuEl.classList.contains('header-menu--open');
  header_menu_set_open(!isOpen);
}

function header_menu_handle_document_click(event) {
  if (!headerMenuEl || !menuToggleBtn) return;
  if (!headerMenuEl.classList.contains('header-menu--open')) return;
  if (headerMenuEl.contains(event.target)) return;
  header_menu_set_open(false);
}

function header_menu_handle_keydown(event) {
  if (event.key === 'Escape') {
    header_menu_set_open(false);
  }
}

function header_menu_handle_list_click(event) {
  const target = event.target;
  if (target && target.classList.contains('header-menu__item')) {
    header_menu_set_open(false);
  }
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
  accuracyValues = new Array(positions.length).fill(50);
  renderEvaluationChart();
  renderLossChart();
  renderAccuracyChart();
}

function renderEvaluationChart() {
  if (!evalCtx || !evalCanvas) return;
  const width = evalCanvas.width;
  const height = evalCanvas.height;
  const totalPly = Math.max(positions.length - 1, 0);
  const stepX = totalPly > 0 ? width / totalPly : width;

  const valueToY = (value) => {
    const clamped = Math.max(EVAL_SCALE_MIN, Math.min(EVAL_SCALE_MAX, value));
    const normalized =
      (clamped - EVAL_SCALE_MIN) / (EVAL_SCALE_MAX - EVAL_SCALE_MIN);
    return height - normalized * height;
  };

  evalCtx.clearRect(0, 0, width, height);

  evalCtx.save();
  evalCtx.font = '12px "Courier New", monospace';
  evalCtx.textAlign = 'left';
  evalCtx.textBaseline = 'middle';

  const drawHorizontalGuide = (value) => {
    const y = valueToY(value);
    evalCtx.beginPath();
    evalCtx.moveTo(0, y);
    evalCtx.lineTo(width, y);
    evalCtx.setLineDash(value === 0 ? [] : [4, 4]);
    evalCtx.strokeStyle = value === 0 ? '#268bd2' : '#586e75';
    evalCtx.stroke();
    evalCtx.setLineDash([]);
    evalCtx.fillStyle = '#93a1a1';
    const safeY = Math.min(height - 8, Math.max(8, y));
    evalCtx.fillText(value.toString(), 4, safeY);
  };

  for (let marker = EVAL_SCALE_MIN; marker <= EVAL_SCALE_MAX; marker += 3) {
    drawHorizontalGuide(marker);
  }

  evalCtx.beginPath();
  evalCtx.moveTo(0, 0);
  evalCtx.lineTo(0, height);
  evalCtx.strokeStyle = '#93a1a1';
  evalCtx.lineWidth = 1;
  evalCtx.stroke();

  evalCtx.beginPath();
  for (let ply = 0; ply <= totalPly; ply += 1) {
    const x = Math.min(ply * stepX, width);
    const y = valueToY(1);
    if (ply === 0) {
      evalCtx.moveTo(x, y);
    } else {
      evalCtx.lineTo(x, y);
    }
  }
  evalCtx.strokeStyle = '#b58900';
  evalCtx.lineWidth = 2;
  evalCtx.stroke();

  if (positions.length > 0) {
    const cursorX = Math.min(currentPly * stepX, width);
    evalCtx.beginPath();
    evalCtx.moveTo(cursorX, 0);
    evalCtx.lineTo(cursorX, height);
    evalCtx.strokeStyle = '#dc322f';
    evalCtx.lineWidth = 1;
    evalCtx.stroke();
  }

  evalCtx.restore();
}

function renderLossChart() {
  if (!lossCtx || !lossCanvas) return;
  const width = lossCanvas.width;
  const height = lossCanvas.height;
  const totalPly = Math.max(positions.length - 1, 0);
  const stepX = totalPly > 0 ? width / totalPly : width;

  const valueToY = (value) => {
    const clamped = Math.max(0, Math.min(LOSS_SCALE_MAX, value));
    const normalized = clamped / LOSS_SCALE_MAX;
    return height - normalized * height;
  };

  lossCtx.clearRect(0, 0, width, height);

  lossCtx.save();
  lossCtx.font = '12px "Courier New", monospace';
  lossCtx.textAlign = 'left';
  lossCtx.textBaseline = 'middle';

  const drawHorizontalGuide = (value) => {
    const y = valueToY(value);
    lossCtx.beginPath();
    lossCtx.moveTo(0, y);
    lossCtx.lineTo(width, y);
    lossCtx.setLineDash(value === 0 ? [] : [4, 4]);
    lossCtx.strokeStyle = value === 0 ? '#268bd2' : '#586e75';
    lossCtx.stroke();
    lossCtx.setLineDash([]);
    lossCtx.fillStyle = '#93a1a1';
    const safeY = Math.min(height - 8, Math.max(8, y));
    lossCtx.fillText(value.toString(), 4, safeY);
  };

  for (let marker = 0; marker <= LOSS_SCALE_MAX; marker += 3) {
    drawHorizontalGuide(marker);
  }

  lossCtx.beginPath();
  lossCtx.moveTo(0, 0);
  lossCtx.lineTo(0, height);
  lossCtx.strokeStyle = '#93a1a1';
  lossCtx.lineWidth = 1;
  lossCtx.stroke();

  const barWidth = totalPly > 0 ? Math.max(stepX * 0.6, 2) : stepX;
  for (let ply = 1; ply <= totalPly; ply += 1) {
    const xCenter = Math.min((ply - 0.5) * stepX, width);
    const value = 1;
    const yTop = valueToY(value);
    const barColor = ply % 2 === 1 ? '#ffffff' : '#000000';
    lossCtx.fillStyle = barColor;
    lossCtx.strokeStyle = '#586e75';
    lossCtx.lineWidth = 1;
    lossCtx.beginPath();
    lossCtx.rect(
      xCenter - barWidth / 2,
      yTop,
      barWidth,
      height - yTop
    );
    lossCtx.fill();
    lossCtx.stroke();
  }

  if (positions.length > 0) {
    const cursorX = Math.min(currentPly * stepX, width);
    lossCtx.beginPath();
    lossCtx.moveTo(cursorX, 0);
    lossCtx.lineTo(cursorX, height);
    lossCtx.strokeStyle = '#dc322f';
    lossCtx.lineWidth = 1;
    lossCtx.stroke();
  }

  lossCtx.restore();
}

function renderAccuracyChart() {
  if (!accuracyCtx || !accuracyCanvas) return;
  const width = accuracyCanvas.width;
  const height = accuracyCanvas.height;
  const totalPly = Math.max(positions.length - 1, 0);
  const stepX = totalPly > 0 ? width / totalPly : width;

  const valueToY = (value) => {
    const clamped = Math.max(0, Math.min(ACCURACY_SCALE_MAX, value));
    const normalized = clamped / ACCURACY_SCALE_MAX;
    return height - normalized * height;
  };

  accuracyCtx.clearRect(0, 0, width, height);

  accuracyCtx.save();
  accuracyCtx.font = '12px "Courier New", monospace';
  accuracyCtx.textAlign = 'left';
  accuracyCtx.textBaseline = 'middle';

  const markerValues = [0, 25, 50, 75, 100];
  markerValues.forEach((value) => {
    const y = valueToY(value);
    accuracyCtx.beginPath();
    accuracyCtx.moveTo(0, y);
    accuracyCtx.lineTo(width, y);
    accuracyCtx.setLineDash(value === 50 ? [] : [4, 4]);
    accuracyCtx.strokeStyle = value === 50 ? '#268bd2' : '#586e75';
    accuracyCtx.stroke();
    accuracyCtx.setLineDash([]);
    accuracyCtx.fillStyle = '#93a1a1';
    const safeY = Math.min(height - 8, Math.max(8, y));
    accuracyCtx.fillText(`${value}%`, 4, safeY);
  });

  accuracyCtx.beginPath();
  accuracyCtx.moveTo(0, 0);
  accuracyCtx.lineTo(0, height);
  accuracyCtx.strokeStyle = '#93a1a1';
  accuracyCtx.lineWidth = 1;
  accuracyCtx.stroke();

  accuracyCtx.beginPath();
  for (let ply = 0; ply <= totalPly; ply += 1) {
    const x = Math.min(ply * stepX, width);
    const value = accuracyValues[ply] !== undefined ? accuracyValues[ply] : 50;
    const y = valueToY(value);
    if (ply === 0) {
      accuracyCtx.moveTo(x, y);
    } else {
      accuracyCtx.lineTo(x, y);
    }
  }
  accuracyCtx.strokeStyle = '#2aa198';
  accuracyCtx.lineWidth = 2;
  accuracyCtx.stroke();

  if (positions.length > 0) {
    const cursorX = Math.min(currentPly * stepX, width);
    accuracyCtx.beginPath();
    accuracyCtx.moveTo(cursorX, 0);
    accuracyCtx.lineTo(cursorX, height);
    accuracyCtx.strokeStyle = '#dc322f';
    accuracyCtx.lineWidth = 1;
    accuracyCtx.stroke();
  }

  accuracyCtx.restore();
}

function init_left_column_toggles() {
  const toggleButtons = Array.from(document.querySelectorAll('.left-column__toggle'));
  if (!toggleButtons.length) return;

  const activateButton = (targetBtn) => {
    toggleButtons.forEach(btn => {
      const isActive = btn === targetBtn;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      btn.setAttribute('tabindex', isActive ? '0' : '-1');
      const sectionId = btn.getAttribute('aria-controls');
      if (!sectionId) return;
      const sectionEl = document.getElementById(sectionId);
      if (!sectionEl) return;
      if (isActive) {
        sectionEl.classList.add('is-visible');
        sectionEl.removeAttribute('hidden');
      } else {
        sectionEl.classList.remove('is-visible');
        sectionEl.setAttribute('hidden', '');
      }
    });
  };

  toggleButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('is-active')) return;
      activateButton(btn);
    });
  });

  const initial = toggleButtons.find(btn => btn.classList.contains('is-active')) || toggleButtons[0];
  if (initial) {
    activateButton(initial);
  }
}

/* Main */
function main() {
  boardEl = document.getElementById('chessboard');
  moveListEl = document.getElementById('moveList');
  evalCanvas = document.getElementById('analysisCanvas');
  evalCtx = evalCanvas ? evalCanvas.getContext('2d') : null;
  lossCanvas = document.getElementById('lossCanvas');
  lossCtx = lossCanvas ? lossCanvas.getContext('2d') : null;
  accuracyCanvas = document.getElementById('accuracyCanvas');
  accuracyCtx = accuracyCanvas ? accuracyCanvas.getContext('2d') : null;
  headerMenuEl = document.getElementById('headerMenu');
  menuToggleBtn = document.getElementById('menuToggle');
  menuListEl = document.getElementById('menuList');
  document.getElementById('btnStart').addEventListener('click', btnStart_click);
  document.getElementById('btnPrev').addEventListener('click', btnPrev_click);
  document.getElementById('btnNext').addEventListener('click', btnNext_click);
  document.getElementById('btnEnd').addEventListener('click', btnEnd_click);
  document.getElementById('btnPlay').addEventListener('click', btnPlay_click);
  init_left_column_toggles();
  if (menuToggleBtn) {
    menuToggleBtn.addEventListener('click', header_menu_toggle);
    menuToggleBtn.addEventListener('keydown', header_menu_handle_keydown);
  }
  if (menuListEl) {
    menuListEl.addEventListener('click', header_menu_handle_list_click);
  }
  document.addEventListener('click', header_menu_handle_document_click);
  document.addEventListener('keydown', header_menu_handle_keydown);
  load_pgn(operaGamePGN, moveListEl);
  load_ply(0, true);
}

document.addEventListener('DOMContentLoaded', main);
