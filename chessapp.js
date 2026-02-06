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
let mainPositions = [];
let mainMoves = [];
let variations = [];
let activeLine = null;
let currentPly = 0;
let autoplayTimer = null;
let isPlaying = false;
let lastMatrix = null;
let headerMenuEl = null;
let menuToggleBtn = null;
let menuListEl = null;
let headerTitleEl = null;
let analyseBtnEl = null;
let analysisEvalEl = null;
let analysisPvEl = null;
let analysisRunning = false;
let analysisListener = null;
let engineWorker = null;
let engineReadyPromise = null;
let analysisRequestId = 0;
let selectedSquare = null;
let selectedSquareEl = null;

const ENGINE_WORKER_PATH = 'src/stockfish.js';

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
  let rank = null, file = null;
  if (boardEl.children.length === 64) return;
  boardEl.innerHTML = '';
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const square = document.createElement('div');
      square.classList.add('square', (row + col) % 2 === 0 ? 'white' : 'black');
      rank = 8 - row;
      file = String.fromCharCode("a".charCodeAt(0) + col);
      square.id = "square_" + file + rank;
      boardEl.appendChild(square);
    }
  }
}

/* helper for fade-out removal */
function fadeOutAndRemove(el, duration = 200) {
//  el.style.transition = `opacity ${duration}ms ease`;
  el.style.transition = "opacity " + duration + "ms ease";
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
//  img.style.transition = `opacity ${duration}ms ease`;
  img.style.transition = "opacity " + duration + "ms ease";
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
  if (!activeLine || activeLine.type !== 'main') {
    sidebarLis.forEach(li => li.classList.remove('move-active'));
    return;
  }
  const moveIndex = Math.floor((ply - 1) / 2);
  sidebarLis.forEach(li => li.classList.remove('move-active'));
  if (ply === 0) return;
  if (moveIndex >= 0 && moveIndex < sidebarLis.length) {
    sidebarLis[moveIndex].classList.add('move-active');
    if (typeof window !== 'undefined' && window.innerWidth >= 801) {
      sidebarLis[moveIndex].scrollIntoView({ block: 'nearest' });
    }
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

function clear_square_selection() {
  if (selectedSquareEl) {
    selectedSquareEl.classList.remove('square--selected');
  }
  selectedSquare = null;
  selectedSquareEl = null;
}

function handle_user_move(move, fenAfter) {
  stop_analysis();
  stop_autoplay();
  if (!move || !fenAfter) return;

  if (activeLine && activeLine.type !== 'main') {
    if (currentPly < activeLine.positions.length - 1) {
      activeLine.positions = activeLine.positions.slice(0, currentPly + 1);
      activeLine.moves = activeLine.moves.slice(0, currentPly);
    }
    activeLine.moves.push(move.san);
    activeLine.positions.push(fenAfter);
    positions = activeLine.positions;
    currentPly = positions.length - 1;
    draw_board(positions[currentPly], true);
    highlight_move(currentPly);
    return;
  }

  const expected = mainMoves[currentPly];
  if (expected && move.san === expected) {
    load_ply(currentPly + 1, false);
    return;
  }

  const baseFen = mainPositions[currentPly];
  const variation = {
    id: variations.length + 1,
    type: 'variation',
    basePly: currentPly,
    moves: [move.san],
    positions: [baseFen, fenAfter]
  };
  variations.push(variation);
  activeLine = variation;
  positions = variation.positions;
  currentPly = positions.length - 1;
  draw_board(positions[currentPly], true);
  highlight_move(currentPly);
}

function board_handle_click(event) {
  const target = event.target;
  const squareEl = target && target.closest ? target.closest('.square') : null;
  if (!squareEl || !squareEl.id) return;
  const square = squareEl.id.replace('square_', '');
  if (!square) return;
  const fen = positions[currentPly];
  if (!fen) return;
  let chess = null;
  try {
    chess = new Chess(fen);
  } catch (err) {
    return;
  }

  const piece = chess.get(square);
  if (!selectedSquare) {
    if (piece && piece.color === chess.turn()) {
      selectedSquare = square;
      selectedSquareEl = squareEl;
      selectedSquareEl.classList.add('square--selected');
    }
    return;
  }

  if (selectedSquare === square) {
    clear_square_selection();
    return;
  }

  const move = chess.move({ from: selectedSquare, to: square, promotion: 'q' });
  if (!move) {
    if (piece && piece.color === chess.turn()) {
      if (selectedSquareEl) {
        selectedSquareEl.classList.remove('square--selected');
      }
      selectedSquare = square;
      selectedSquareEl = squareEl;
      selectedSquareEl.classList.add('square--selected');
    } else {
      clear_square_selection();
    }
    return;
  }

  clear_square_selection();
  handle_user_move(move, chess.fen());
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

function engine_init_worker() {
  if (engineWorker || typeof Worker === 'undefined') return engineWorker;
  try {
    engineWorker = new Worker(ENGINE_WORKER_PATH);
  } catch (err) {
    console.warn('Failed to initialise engine worker:', err);
    engineWorker = null;
  }
  return engineWorker;
}

function engine_send(command) {
  if (!engineWorker) return false;
  engineWorker.postMessage(command);
  return true;
}

function engine_wait_for(predicate, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    if (!engineWorker) {
      reject(new Error('Engine worker unavailable'));
      return;
    }
    let settled = false;
    const onMessage = (event) => {
      const line = typeof event.data === 'string' ? event.data : '';
      if (!line) return;
      if (predicate(line)) {
        settled = true;
        engineWorker.removeEventListener('message', onMessage);
        clearTimeout(timer);
        resolve(line);
      }
    };
    const timer = setTimeout(() => {
      if (settled) return;
      engineWorker.removeEventListener('message', onMessage);
      reject(new Error('Engine response timeout'));
    }, timeoutMs);
    engineWorker.addEventListener('message', onMessage);
  });
}

function engine_ready() {
  if (engineReadyPromise) return engineReadyPromise;
  engineReadyPromise = (async () => {
    if (!engine_init_worker()) return false;
    if (!engine_send('uci')) return false;
    await engine_wait_for(line => line.startsWith('uciok'));
    if (!engine_send('isready')) return false;
    await engine_wait_for(line => line.startsWith('readyok'));
    return true;
  })().catch((err) => {
    console.warn('Engine init failed:', err);
    return false;
  });
  return engineReadyPromise;
}

function parse_info_line(line) {
  if (!line || typeof line !== 'string') return null;
  if (!line.startsWith('info ')) return null;
  const tokens = line.trim().split(/\s+/);
  const depthIdx = tokens.indexOf('depth');
  const scoreIdx = tokens.indexOf('score');
  const pvIdx = tokens.indexOf('pv');
  const depth = depthIdx !== -1 ? parseInt(tokens[depthIdx + 1], 10) : null;
  let score = null;
  if (scoreIdx !== -1 && tokens[scoreIdx + 1] && tokens[scoreIdx + 2]) {
    const type = tokens[scoreIdx + 1];
    const value = parseInt(tokens[scoreIdx + 2], 10);
    if (!Number.isNaN(value)) {
      score = { type, value };
    }
  }
  const pv = pvIdx !== -1 ? tokens.slice(pvIdx + 1) : [];
  return { depth, score, pv };
}

function normalize_score_for_white(score, fen) {
  if (!score || typeof score !== 'object') return null;
  if (!fen || typeof fen !== 'string') return null;
  const fenParts = fen.split(' ');
  const activeColor = fenParts[1] || 'w';
  const perspective = activeColor === 'w' ? 1 : -1;
  if (score.type === 'cp') {
    return (score.value / 100) * perspective;
  }
  if (score.type === 'mate') {
    if (score.value === 0) return 0;
    const mateSign = score.value > 0 ? 1 : -1;
    return mateSign * perspective * 1000;
  }
  return null;
}

function format_eval_text(score, fen, depth) {
  if (!score || typeof score !== 'object') return depth ? `Depth ${depth}` : '—';
  if (score.type === 'mate') {
    const moves = typeof score.value === 'number' ? Math.abs(score.value) : null;
    const norm = normalize_score_for_white(score, fen);
    const sign = norm >= 0 ? '+' : '-';
    const mateText = moves ? `${sign}M${moves}` : `${sign}M`;
    return depth ? `Depth ${depth} · ${mateText}` : mateText;
  }
  if (score.type === 'cp') {
    const norm = normalize_score_for_white(score, fen);
    const value = typeof norm === 'number' ? norm : 0;
    const rounded = value.toFixed(2);
    const text = value >= 0 ? `+${rounded}` : rounded;
    return depth ? `Depth ${depth} · ${text}` : text;
  }
  return depth ? `Depth ${depth}` : '—';
}

function convert_pv_tokens_to_san(fen, pvTokens, limit = 10) {
  if (!Array.isArray(pvTokens) || pvTokens.length === 0) return [];
  if (typeof Chess === 'undefined') return pvTokens.slice(0, limit);
  let chess = null;
  try {
    chess = new Chess(fen);
  } catch (err) {
    return pvTokens.slice(0, limit);
  }
  const sanMoves = [];
  for (let i = 0; i < pvTokens.length && sanMoves.length < limit; i += 1) {
    const token = pvTokens[i];
    if (typeof token !== 'string') break;
    let move = null;
    try {
      move = chess.move(token, { sloppy: true });
    } catch (err) {
      move = null;
    }
    if (!move) break;
    sanMoves.push(move.san);
  }
  return sanMoves;
}

function update_analysis_panel(textEval, pvText) {
  if (analysisEvalEl) analysisEvalEl.textContent = textEval || '—';
  if (analysisPvEl) analysisPvEl.textContent = pvText || '';
}

function stop_analysis() {
  if (!analysisRunning) return;
  analysisRunning = false;
  analysisRequestId += 1;
  if (engineWorker) {
    engineWorker.removeEventListener('message', analysisListener);
    analysisListener = null;
    engine_send('stop');
  }
  if (analyseBtnEl) analyseBtnEl.textContent = 'Analyse';
}

async function start_analysis() {
  if (!analysisEvalEl || !analysisPvEl) return;
  const fen = positions[currentPly];
  if (!fen) return;
  const ok = await engine_ready();
  if (!ok) {
    update_analysis_panel('Engine unavailable', 'Stockfish worker failed to start.');
    return;
  }
  analysisRunning = true;
  if (analyseBtnEl) analyseBtnEl.textContent = 'Stop';
  update_analysis_panel('Depth —', 'Analysing…');

  const requestId = analysisRequestId + 1;
  analysisRequestId = requestId;

  const onMessage = (event) => {
    if (requestId !== analysisRequestId) return;
    const line = typeof event.data === 'string' ? event.data : '';
    if (!line) return;
    const info = parse_info_line(line);
    if (!info || !info.score) return;
    const evalText = format_eval_text(info.score, fen, info.depth);
    const pvSan = convert_pv_tokens_to_san(fen, info.pv);
    update_analysis_panel(evalText, pvSan.length ? pvSan.join(' ') : info.pv.join(' '));
  };
  if (analysisListener && engineWorker) {
    engineWorker.removeEventListener('message', analysisListener);
  }
  analysisListener = onMessage;
  engineWorker.addEventListener('message', onMessage);
  engine_send(`position fen ${fen}`);
  engine_send('go infinite');
}

function btnAnalyse_click() {
  if (analysisRunning) {
    stop_analysis();
    return;
  }
  start_analysis();
}

/* Button handlers */
function btnStart_click() 
{ 
  stop_analysis();
  stop_autoplay();
  load_ply(0, true);
}

function btnPrev_click()
{
  stop_analysis();
  stop_autoplay();
  load_ply(currentPly - 1, false);
}

function btnNext_click()
{
  stop_analysis();
  stop_autoplay();
  load_ply(currentPly + 1, false);
}

function btnEnd_click()
{
  stop_analysis();
  stop_autoplay();
  load_ply(positions.length - 1, true);
}

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
  stop_analysis();
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
  update_header_title_from_game(game);
  const historyMoves = game.history();
  mainMoves = historyMoves.slice();
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
  mainPositions = [tmp.fen()];
  historyMoves.forEach(mv => {
    tmp.move(mv);
    mainPositions.push(tmp.fen());
  });
  activeLine = {
    type: 'main',
    basePly: 0,
    moves: mainMoves,
    positions: mainPositions
  };
  positions = mainPositions;
  variations = [];
}



function extract_year_from_header(headerValue) {
  if (!headerValue || typeof headerValue !== 'string') return null;
  const match = headerValue.match(/(\d{4})/);
  return match ? match[1] : null;
}

function update_header_title_from_game(gameInstance) {
  if (!headerTitleEl || !gameInstance || typeof gameInstance.header !== 'function') return;
  const headers = gameInstance.header();
  const white = headers.White || 'White';
  const black = headers.Black || 'Black';
  const dateHeader = headers.Date || headers.EventDate || '';
  const year = extract_year_from_header(dateHeader);
  const result = headers.Result || '';
  let title = `${white} vs ${black}`;
  if (year) {
    title += ` ${year}`;
  }
  if (result) {
    title += `; ${result}`;
  }
  headerTitleEl.textContent = title;
}


function parse_gid_from_location() {
  if (typeof window === 'undefined' || !window.location) return null;
  try {
    const url = new URL(window.location.href);
    const raw = url.searchParams.get('gid');
    if (!raw) return null;
    const trimmed = raw.trim();
    return trimmed.length ? trimmed : null;
  } catch (err) {
    return null;
  }
}

function fetch_pgn_for_gid(gid) {
  if (!gid || typeof fetch === 'undefined') {
    return Promise.resolve(null);
  }
  const requestUrl = `gamepgn.php?gid=${encodeURIComponent(gid)}`;
  return fetch(requestUrl, { cache: 'no-store' })
    .then(response => (response.ok ? response.text() : ''))
    .then(text => {
      const trimmed = typeof text === 'string' ? text.trim() : '';
      return trimmed.length ? trimmed : null;
    })
    .catch(() => null);
}

function load_game_with_pgn(pgnText) {
  const pgn = pgnText && pgnText.trim().length ? pgnText : operaGamePGN;
  load_pgn(pgn, moveListEl);
  load_ply(0, true);
}

function bootstrap_initial_game() {
  const gid = parse_gid_from_location();
  if (!gid) {
    load_game_with_pgn(operaGamePGN);
    return;
  }
  fetch_pgn_for_gid(gid).then((pgn) => {
    if (pgn) {
      load_game_with_pgn(pgn);
    } else {
      load_game_with_pgn(operaGamePGN);
    }
  });
}


/* Main */
function main() {
  boardEl = document.getElementById('chessboard');
  moveListEl = document.getElementById('moveList');
  headerTitleEl = document.getElementById('pageTitle');
  headerMenuEl = document.getElementById('headerMenu');
  menuToggleBtn = document.getElementById('menuToggle');
  menuListEl = document.getElementById('menuList');
  analyseBtnEl = document.getElementById('btnAnalyse');
  analysisEvalEl = document.getElementById('analysisEval');
  analysisPvEl = document.getElementById('analysisPv');
  if (boardEl) boardEl.addEventListener('click', board_handle_click);
  document.getElementById('btnStart').addEventListener('click', btnStart_click);
  document.getElementById('btnPrev').addEventListener('click', btnPrev_click);
  document.getElementById('btnNext').addEventListener('click', btnNext_click);
  document.getElementById('btnEnd').addEventListener('click', btnEnd_click);
  document.getElementById('btnPlay').addEventListener('click', btnPlay_click);
  if (analyseBtnEl) analyseBtnEl.addEventListener('click', btnAnalyse_click);
  if (menuToggleBtn) {
    menuToggleBtn.addEventListener('click', header_menu_toggle);
    menuToggleBtn.addEventListener('keydown', header_menu_handle_keydown);
  }
  if (menuListEl) {
    menuListEl.addEventListener('click', header_menu_handle_list_click);
  }
  document.addEventListener('click', header_menu_handle_document_click);
  document.addEventListener('keydown', header_menu_handle_keydown);
  bootstrap_initial_game();
}

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('DOMContentLoaded', main);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    fen2matrix
  };
}
