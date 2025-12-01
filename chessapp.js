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
let winPercentValues = [];
let lossValues = [];
let evaluationValues = [];
let headerMenuEl = null;
let menuToggleBtn = null;
let menuListEl = null;
let enginePvPanelEl = null;
let enginePvEvalEl = null;
let enginePvMovesEl = null;
let headerTitleEl = null;

const EVAL_SCALE_MIN = -9;
const EVAL_SCALE_MAX = 9;
const LOSS_SCALE_MAX = 9;
const ACCURACY_SCALE_MAX = 100;
const WIN_PERCENT_EXPONENT_FACTOR = 0.00368208;
const ACCURACY_CURVE_A = 103.1668;
const ACCURACY_CURVE_B = 0.04354;
const ACCURACY_CURVE_C = 3.1669;
const ENGINE_WORKER_PATH = 'src/stockfish.js';
const ENGINE_SEARCH_DEPTH = 16;
const ENGINE_DEEP_SEARCH_DEPTH = 24;
const ENGINE_LOSS_THRESHOLD_FOR_DEEP_ANALYSIS = 1.0;
const ENGINE_WAIT_TIMEOUT_MS = 15000;
const READY_CHECK_INTERVAL_MS = 5000;
const READY_CHECK_RESPONSE_TIMEOUT_MS = ENGINE_WAIT_TIMEOUT_MS * 2;
const ANALYSIS_STORAGE_PREFIX = 'chessapp/analysis/';
const textDecoder = (typeof TextDecoder !== 'undefined') ? new TextDecoder() : null;

let engineWorker = null;
let engineInitPromise = null;
let engineListeners = [];
let engineWaiters = [];
const engineAnalysisQueue = [];
let engineAnalysisRunning = false;
let analysisResults = [];
const deepAnalysisRequested = new Set();

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
  update_engine_pv_panel();
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
function btnStart_click() 
{ 
  stop_autoplay();
  load_ply(0, true);
}

function btnPrev_click()
{
  stop_autoplay();
  load_ply(currentPly - 1, false);
}

function btnNext_click()
{
  stop_autoplay();
  load_ply(currentPly + 1, false);
}

function btnEnd_click()
{
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
  evaluationValues = [default_eval_for_position(tmp)];
  historyMoves.forEach(mv => {
    tmp.move(mv);
    positions.push(tmp.fen());
    evaluationValues.push(default_eval_for_position(tmp));
  });
  recompute_loss_values();
  recompute_win_and_accuracy_values();
  analysisResults = new Array(positions.length);
  if (typeof window !== 'undefined') {
    window.chessappAnalysisResults = analysisResults;
  }
  prime_analysis_results_from_cache();
  renderEvaluationChart();
  renderLossChart();
  renderAccuracyChart();
  update_engine_pv_panel();
  trigger_engine_analysis();
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

  if (positions.length > 0) {
    evalCtx.beginPath();
    let lastValue = 0;
    for (let ply = 0; ply <= totalPly; ply += 1) {
      const stored = evaluationValues && typeof evaluationValues[ply] === 'number'
        ? evaluationValues[ply]
        : null;
      const value = stored !== null ? stored : lastValue;
      const x = totalPly > 0 ? Math.min(ply * stepX, width) : 0;
      const y = valueToY(value);
      if (ply === 0) {
        evalCtx.moveTo(x, y);
      } else {
        evalCtx.lineTo(x, y);
      }
      lastValue = value;
    }
    evalCtx.strokeStyle = '#b58900';
    evalCtx.lineWidth = 2;
    evalCtx.stroke();
  }

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
    const rawValue = Array.isArray(lossValues) && typeof lossValues[ply] === 'number'
      ? lossValues[ply]
      : 0;
    const value = Math.max(0, Math.min(LOSS_SCALE_MAX, rawValue));
    const yTop = valueToY(value);
    if (value === 0) {
      continue;
    }
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
  const totalMoves = Math.max(positions.length - 1, 0);
  const stepX = totalMoves > 0 ? width / totalMoves : width;

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

  if (totalMoves > 0 && accuracyValues.length > 0) {
    accuracyCtx.beginPath();
    for (let moveIdx = 0; moveIdx < totalMoves; moveIdx += 1) {
      const x = Math.min((moveIdx + 0.5) * stepX, width);
      const rawValue = accuracyValues[moveIdx];
      const value = typeof rawValue === 'number' && !Number.isNaN(rawValue)
        ? rawValue
        : 100;
      const y = valueToY(value);
      if (moveIdx === 0) {
        accuracyCtx.moveTo(x, y);
      } else {
        accuracyCtx.lineTo(x, y);
      }
    }
    accuracyCtx.strokeStyle = '#2aa198';
    accuracyCtx.lineWidth = 2;
    accuracyCtx.stroke();
  }

  if (totalMoves > 0 && currentPly > 0) {
    const moveIdx = Math.min(currentPly, totalMoves) - 1;
    const cursorX = Math.min((moveIdx + 0.5) * stepX, width);
    accuracyCtx.beginPath();
    accuracyCtx.moveTo(cursorX, 0);
    accuracyCtx.lineTo(cursorX, height);
    accuracyCtx.strokeStyle = '#dc322f';
    accuracyCtx.lineWidth = 1;
    accuracyCtx.stroke();
  }

  accuracyCtx.restore();
}

function publish_analysis_results() {
  if (typeof window !== 'undefined') {
    window.chessappAnalysisResults = analysisResults;
  }
}

function engine_handle_message(event) {
  const payload = event && typeof event.data !== 'undefined' ? event.data : event;
  let text = null;
  if (typeof payload === 'string') {
    text = payload;
  } else if (payload && typeof payload.data === 'string') {
    text = payload.data;
  } else if (payload instanceof Uint8Array && textDecoder) {
    text = textDecoder.decode(payload);
  }
  if (typeof text !== 'string') return;
  const lines = text.split(/\r?\n/).filter(Boolean);
  lines.forEach(line => {
    if (typeof console !== 'undefined' && console.log) {
      console.log('[engine]', line);
    }
    engineListeners.slice().forEach(listener => {
      try {
        listener(line);
      } catch (err) {
        console.error('Engine listener error:', err);
      }
    });
    for (let i = engineWaiters.length - 1; i >= 0; i -= 1) {
      const waiter = engineWaiters[i];
      if (!waiter) continue;
      try {
        if (waiter.predicate(line)) {
          engineWaiters.splice(i, 1);
          waiter.resolve(line);
        }
      } catch (err) {
        engineWaiters.splice(i, 1);
        waiter.resolve(line);
      }
    }
  });
}

function engine_init_worker() {
  if (engineWorker || typeof Worker === 'undefined') return engineWorker;
  try {
    engineWorker = new Worker(ENGINE_WORKER_PATH);
    engineWorker.addEventListener('message', engine_handle_message);
    engineWorker.addEventListener('error', (event) => {
      console.error('Engine worker error:', event.message || event);
      if (event.filename) {
        console.error('Engine worker source:', event.filename, 'line:', event.lineno);
      }
    });
    engineWorker.addEventListener('messageerror', (event) => {
      console.error('Engine worker messageerror:', event);
    });
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

function engine_wait_for(predicate, timeoutMs = ENGINE_WAIT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const waiter = {
      predicate,
      resolve
    };
    engineWaiters.push(waiter);
    const timer = setTimeout(() => {
      const index = engineWaiters.indexOf(waiter);
      if (index !== -1) engineWaiters.splice(index, 1);
      reject(new Error('Engine response timeout'));
    }, timeoutMs);

    waiter.resolve = (value) => {
      clearTimeout(timer);
      const idx = engineWaiters.indexOf(waiter);
      if (idx !== -1) engineWaiters.splice(idx, 1);
      resolve(value);
    };
  });
}

function engine_add_listener(listener) {
  engineListeners.push(listener);
  return () => {
    const idx = engineListeners.indexOf(listener);
    if (idx !== -1) engineListeners.splice(idx, 1);
  };
}

async function engine_initialise() {
  if (engineInitPromise) return engineInitPromise;
  engineInitPromise = (async () => {
    if (!engine_init_worker()) {
      throw new Error('Engine worker unavailable');
    }
    console.debug('Sending UCI handshake to engine worker…');
    if (!engine_send('uci')) {
      throw new Error('Failed to send uci command');
    }
    await engine_wait_for(line => line.startsWith('uciok'));
    console.debug('Engine responded with uciok');
    if (!engine_send('ucinewgame')) {
      throw new Error('Failed to send ucinewgame command');
    }
    if (!engine_send('isready')) {
      throw new Error('Failed to send isready command');
    }
    await engine_wait_for(line => line.startsWith('readyok'));
    console.debug('Engine responded with readyok');
    return true;
  })().catch(err => {
    console.warn('Engine initialisation failed:', err);
    return false;
  });
  return engineInitPromise;
}

function parse_engine_info_line(line) {
  if (!line || typeof line !== 'string') {
    return { score: null, pv: [], depth: null, rawInfo: line || '' };
  }
  const tokens = line.trim().split(/\s+/);
  const scoreIdx = tokens.indexOf('score');
  let score = null;
  if (scoreIdx !== -1 && tokens[scoreIdx + 1] && tokens[scoreIdx + 2]) {
    const scoreType = tokens[scoreIdx + 1];
    const scoreValue = parseInt(tokens[scoreIdx + 2], 10);
    if (!Number.isNaN(scoreValue)) {
      score = { type: scoreType, value: scoreValue };
    }
  }
  const depthIdx = tokens.indexOf('depth');
  let depth = null;
  if (depthIdx !== -1 && tokens[depthIdx + 1]) {
    const depthValue = parseInt(tokens[depthIdx + 1], 10);
    if (!Number.isNaN(depthValue)) {
      depth = depthValue;
    }
  }
  const pvIdx = tokens.indexOf('pv');
  const pv = pvIdx !== -1 ? tokens.slice(pvIdx + 1) : [];
  return { score, pv, depth, rawInfo: line };
}

function normalize_score_for_white(score, fen) {
  if (!score || typeof score !== 'object') return null;
  if (!fen || typeof fen !== 'string') return null;
  const fenParts = fen.split(' ');
  const activeColor = fenParts[1] || 'w';
  const perspective = activeColor === 'w' ? 1 : -1;

  if (score.type === 'cp') {
    const cpValue = score.value / 100;
    const adjusted = cpValue * perspective;
    return Math.max(EVAL_SCALE_MIN, Math.min(EVAL_SCALE_MAX, adjusted));
  }
  if (score.type === 'mate') {
    if (score.value === 0) {
      return -perspective * EVAL_SCALE_MAX;
    }
    const mateSign = score.value > 0 ? 1 : -1;
    const adjusted = mateSign * perspective * EVAL_SCALE_MAX;
    return Math.max(EVAL_SCALE_MIN, Math.min(EVAL_SCALE_MAX, adjusted));
  }
  return null;
}

function default_eval_for_position(chessInstance) {
  if (!chessInstance || typeof chessInstance.in_checkmate !== 'function') {
    return 0;
  }
  if (!chessInstance.in_checkmate()) return 0;
  return chessInstance.turn() === 'w' ? EVAL_SCALE_MIN : EVAL_SCALE_MAX;
}

function recompute_loss_values() {
  if (!Array.isArray(evaluationValues) || evaluationValues.length === 0) {
    lossValues = [];
    winPercentValues = [];
    accuracyValues = [];
    return;
  }
  const next = new Array(evaluationValues.length).fill(0);
  for (let ply = 1; ply < evaluationValues.length; ply += 1) {
    const prevEval = typeof evaluationValues[ply - 1] === 'number'
      ? evaluationValues[ply - 1]
      : null;
    const currentEval = typeof evaluationValues[ply] === 'number'
      ? evaluationValues[ply]
      : null;
    if (prevEval === null || currentEval === null) {
      next[ply] = 0;
      continue;
    }
    const diff = Math.abs(currentEval - prevEval);
    next[ply] = Math.min(LOSS_SCALE_MAX, diff);
  }
  lossValues = next;
}

function evaluation_value_to_centipawns(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }
  const clamped = Math.max(EVAL_SCALE_MIN, Math.min(EVAL_SCALE_MAX, value));
  return clamped * 100;
}

function compute_win_percent_from_eval(evalValue) {
  const centipawns = evaluation_value_to_centipawns(evalValue);
  const logistic =
    2 / (1 + Math.exp(-WIN_PERCENT_EXPONENT_FACTOR * centipawns)) - 1;
  const result = 50 + 50 * logistic;
  return Math.max(0, Math.min(100, result));
}

function compute_accuracy_for_move(winPercentBeforeWhite, winPercentAfterWhite, moveIndex) {
  const beforeWhite = typeof winPercentBeforeWhite === 'number' && !Number.isNaN(winPercentBeforeWhite)
    ? winPercentBeforeWhite
    : 50;
  const afterWhite = typeof winPercentAfterWhite === 'number' && !Number.isNaN(winPercentAfterWhite)
    ? winPercentAfterWhite
    : beforeWhite;

  const isWhiteMove = (moveIndex % 2) === 0;
  const before = isWhiteMove ? beforeWhite : 100 - beforeWhite;
  const after = isWhiteMove ? afterWhite : 100 - afterWhite;

  const delta = before - after;
  const raw =
    ACCURACY_CURVE_A * Math.exp(-ACCURACY_CURVE_B * delta) - ACCURACY_CURVE_C;
  return Math.max(0, Math.min(100, raw));
}

function recompute_win_and_accuracy_values() {
  if (!Array.isArray(evaluationValues) || evaluationValues.length === 0) {
    winPercentValues = [];
    accuracyValues = [];
    return;
  }
  const winPercentages = new Array(evaluationValues.length);
  for (let i = 0; i < evaluationValues.length; i += 1) {
    winPercentages[i] = compute_win_percent_from_eval(evaluationValues[i]);
  }
  winPercentValues = winPercentages;

  if (winPercentages.length <= 1) {
    accuracyValues = [];
    return;
  }

  const nextAccuracy = new Array(winPercentages.length - 1);
  for (let ply = 1; ply < winPercentages.length; ply += 1) {
    nextAccuracy[ply - 1] = compute_accuracy_for_move(
      winPercentages[ply - 1],
      winPercentages[ply],
      ply - 1
    );
  }
  accuracyValues = nextAccuracy;
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

function format_engine_eval_text(score, fen) {
  if (!score || typeof score !== 'object') return '—';
  if (score.type === 'mate') {
    const moves = typeof score.value === 'number' ? Math.abs(score.value) : null;
    let sign = score.value > 0 ? 1 : -1;
    if (typeof fen === 'string') {
      const parts = fen.split(' ');
      if (parts[1] === 'b') sign *= -1;
    }
    const prefix = sign >= 0 ? '#+' : '#-';
    return moves ? `${prefix}${moves}` : '#';
  }
  if (score.type === 'cp') {
    let value = typeof score.value === 'number' ? score.value / 100 : 0;
    if (typeof fen === 'string') {
      const parts = fen.split(' ');
      if (parts[1] === 'b') {
        value *= -1;
      }
    }
    const rounded = value.toFixed(2);
    return value >= 0 ? `+${rounded}` : rounded;
  }
  return '—';
}

function convert_pv_tokens_to_san(fen, pvTokens, limit = 8) {
  if (!Array.isArray(pvTokens) || pvTokens.length === 0) return [];
  if (typeof Chess === 'undefined') {
    return pvTokens.slice(0, limit);
  }
  let chess = null;
  try {
    chess = new Chess(fen);
  } catch (err) {
    chess = new Chess();
    if (typeof chess.load === 'function') {
      const loaded = chess.load(fen);
      if (!loaded) {
        return pvTokens.slice(0, limit);
      }
    } else {
      return pvTokens.slice(0, limit);
    }
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
    if (!move) {
      const from = token.slice(0, 2);
      const to = token.slice(2, 4);
      if (from.length === 2 && to.length === 2) {
        const promotion = token.length > 4 ? token[4] : undefined;
        move = chess.move({ from, to, promotion });
      }
    }
    if (!move) break;
    sanMoves.push(move.san);
  }
  return sanMoves;
}

function update_engine_pv_panel() {
  if (!enginePvPanelEl || !enginePvEvalEl || !enginePvMovesEl) return;
  let result = Array.isArray(analysisResults) ? analysisResults[currentPly] : null;
  if ((!result || result.error) && positions && positions[currentPly]) {
    const cached = load_cached_analysis_result(positions[currentPly], currentPly);
    if (cached) {
      update_engine_result_cache(cached);
      return;
    }
  }
  if (!result || result.error) {
    enginePvPanelEl.classList.add('engine-pv-panel--waiting');
    enginePvEvalEl.textContent = '—';
    enginePvMovesEl.textContent = result && result.error
      ? result.error
      : 'Awaiting analysis…';
    return;
  }
  const evalText = format_engine_eval_text(result.score, result.fen);
  const sanMoves = convert_pv_tokens_to_san(result.fen, result.pv);
  enginePvEvalEl.textContent = evalText;
  enginePvMovesEl.textContent = sanMoves.length > 0
    ? sanMoves.join(' ')
    : 'No PV available';
  enginePvPanelEl.classList.remove('engine-pv-panel--waiting');
}

function maybe_schedule_deep_analysis(result) {
  if (!result || typeof result.ply !== 'number') return;
  const ply = result.ply;
  if (ply <= 0) return;
  if (!positions || ply >= positions.length - 1) return;
  if (deepAnalysisRequested.has(ply)) {
    deepAnalysisRequested.delete(ply);
    return;
  }
  if (result.error) return;
  const score = result.score;
  if (score && typeof score === 'object' && score.type === 'mate') {
    return;
  }
  const depth = typeof result.depth === 'number' ? result.depth : null;
  if (depth === null) return;
  if (depth < 1 || depth >= ENGINE_DEEP_SEARCH_DEPTH) return;
  if (!Array.isArray(lossValues) || ply >= lossValues.length) return;
  const loss = lossValues[ply];
  if (typeof loss !== 'number' || Number.isNaN(loss) || loss <= ENGINE_LOSS_THRESHOLD_FOR_DEEP_ANALYSIS) {
    return;
  }
  if (!positions[ply]) return;
  deepAnalysisRequested.add(ply);
  engine_schedule_analysis([{
    fen: positions[ply],
    index: ply,
    depth: ENGINE_DEEP_SEARCH_DEPTH
  }]);
}

function analysis_storage_key(fen) {
  return `${ANALYSIS_STORAGE_PREFIX}${fen}`;
}

function read_cached_analysis_payload(fen) {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(analysis_storage_key(fen));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (err) {
    console.warn('Failed to read cached analysis for FEN:', fen, err);
    return null;
  }
}

function load_cached_analysis_result(fen, ply) {
  const payload = read_cached_analysis_payload(fen);
  if (!payload) return null;
  const score = payload.score;
  const isScoreValid =
    score &&
    typeof score === 'object' &&
    typeof score.type === 'string' &&
    typeof score.value === 'number';
  return {
    fen,
    ply,
    bestmove: payload.bestmove || '',
    ponder: payload.ponder || null,
    score: isScoreValid ? score : null,
    pv: Array.isArray(payload.pv) ? payload.pv : [],
    rawInfo: payload.rawInfo || '',
    depth:
      typeof payload.depth === 'number' && !Number.isNaN(payload.depth)
        ? payload.depth
        : null,
    cachedAt: payload.cachedAt || null,
    source: 'cache'
  };
}

function prime_analysis_results_from_cache() {
  if (!Array.isArray(positions) || positions.length === 0) return;
  if (!Array.isArray(analysisResults)) {
    analysisResults = new Array(positions.length);
  }
  for (let i = 0; i < positions.length; i += 1) {
    const fen = positions[i];
    const cached = load_cached_analysis_result(fen, i);
    if (cached) {
      analysisResults[i] = cached;
      update_engine_result_cache(cached);
    }
  }
}

function persist_analysis_result(result) {
  if (!result || result.error || result.source === 'cache') return;
  if (!result.fen) return;
  try {
    if (typeof localStorage === 'undefined') return;
    const payload = {
      bestmove: result.bestmove || '',
      ponder: result.ponder || null,
      score: result.score || null,
      pv: Array.isArray(result.pv) ? result.pv : [],
      depth:
        typeof result.depth === 'number' && !Number.isNaN(result.depth)
          ? result.depth
          : null,
      rawInfo: result.rawInfo || '',
      cachedAt: Date.now()
    };
    localStorage.setItem(
      analysis_storage_key(result.fen),
      JSON.stringify(payload)
    );
  } catch (err) {
    console.warn('Failed to persist analysis for FEN:', result.fen, err);
  }
}

function update_engine_result_cache(result) {
  if (!result || typeof result.ply !== 'number') return;
  if (!positions[result.ply] || positions[result.ply] !== result.fen) return;
  if (!Array.isArray(evaluationValues) || result.ply >= evaluationValues.length) return;
  if (!Array.isArray(analysisResults)) analysisResults = [];
  analysisResults[result.ply] = result;
  if (typeof window !== 'undefined') {
    window.chessappAnalysisResults = analysisResults;
  }
  const normalized = normalize_score_for_white(result.score, result.fen);
  if (typeof normalized === 'number' && !Number.isNaN(normalized)) {
    evaluationValues[result.ply] = normalized;
    renderEvaluationChart();
    recompute_loss_values();
    recompute_win_and_accuracy_values();
    renderLossChart();
    renderAccuracyChart();
  }
  persist_analysis_result(result);
  maybe_schedule_deep_analysis(result);
  if (result.ply === currentPly) {
    update_engine_pv_panel();
  }
}

function engine_analyse_fen(fen, plyIndex, searchDepth = ENGINE_SEARCH_DEPTH) {
  return new Promise((resolve, reject) => {
    if (!engine_send(`position fen ${fen}`)) {
      reject(new Error('Engine worker not available'));
      return;
    }
    if (!engine_send(`go depth ${searchDepth}`)) {
      reject(new Error('Failed to send go command'));
      return;
    }

    const infoLines = [];
    let settled = false;
    let readyCheckIntervalId = null;
    let readyCheckPending = false;
    let latestReadyProbe = null;
    let lastActivityAt = Date.now();
    const cleanup = () => {
      if (settled) return;
      settled = true;
      removeListener();
      if (readyCheckIntervalId) {
        clearInterval(readyCheckIntervalId);
        readyCheckIntervalId = null;
      }
      readyCheckPending = false;
      latestReadyProbe = null;
    };
    const fail = (message) => {
      if (settled) return;
      cleanup();
      reject(new Error(message));
    };

    const sendReadyProbe = () => {
      if (settled || readyCheckPending) return;
      if (Date.now() - lastActivityAt < READY_CHECK_INTERVAL_MS) return;
      readyCheckPending = true;
      if (!engine_send('isready')) {
        readyCheckPending = false;
        fail('Engine worker not available');
        return;
      }
      const probePromise = engine_wait_for(
        line => line.startsWith('readyok'),
        READY_CHECK_RESPONSE_TIMEOUT_MS
      );
      latestReadyProbe = probePromise;
      probePromise.then(() => {
        if (settled || latestReadyProbe !== probePromise) return;
        readyCheckPending = false;
      }).catch(() => {
        if (settled || latestReadyProbe !== probePromise) return;
        readyCheckPending = false;
        fail('Engine unresponsive (no readyok received)');
      });
    };

    const startReadyChecks = () => {
      if (readyCheckIntervalId) return;
      readyCheckIntervalId = setInterval(sendReadyProbe, READY_CHECK_INTERVAL_MS);
    };

    const listener = (line) => {
      lastActivityAt = Date.now();
      if (line.startsWith('info ')) {
        infoLines.push(line);
        return;
      }
      if (!line.startsWith('bestmove ')) return;

      const parts = line.trim().split(/\s+/);
      const bestmove = parts[1] || '';
      let ponder = null;
      if (parts[2] === 'ponder' && parts[3]) {
        ponder = parts[3];
      }
      const lastInfo = infoLines.length > 0 ? infoLines[infoLines.length - 1] : '';
      const parsed = parse_engine_info_line(lastInfo);
      const result = {
        fen,
        ply: plyIndex,
        bestmove,
        ponder,
        score: parsed.score,
        pv: parsed.pv,
        depth: parsed.depth,
        rawInfo: parsed.rawInfo,
        source: 'engine'
      };
      update_engine_result_cache(result);
      cleanup();
      resolve(result);
    };

    const removeListener = engine_add_listener(listener);
    startReadyChecks();
  });
}

function is_cached_result_sufficient(result, requiredDepth) {
  if (!result || result.error) return false;
  const score = result.score;
  if (score && typeof score === 'object' && score.type === 'mate') {
    return true;
  }
  if (typeof requiredDepth !== 'number') return true;
  const depth = typeof result.depth === 'number' ? result.depth : null;
  if (depth === null) return false;
  return depth >= requiredDepth;
}

function normalize_analysis_requests(requests) {
  const normalized = [];
  if (!Array.isArray(requests)) return normalized;
  for (let i = 0; i < requests.length; i += 1) {
    const item = requests[i];
    if (typeof item === 'string') {
      normalized.push({ fen: item, index: i, depth: ENGINE_SEARCH_DEPTH });
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const fen = typeof item.fen === 'string' ? item.fen : null;
    if (!fen) continue;
    const index = typeof item.index === 'number' ? item.index : i;
    const depth =
      typeof item.depth === 'number' && !Number.isNaN(item.depth)
        ? item.depth
        : ENGINE_SEARCH_DEPTH;
    normalized.push({ fen, index, depth });
  }
  return normalized;
}

async function engine_run_analysis_for_list(requests) {
  const normalized = normalize_analysis_requests(requests);
  if (normalized.length === 0) return;

  const pending = [];
  normalized.forEach(req => {
    const cachedResult = load_cached_analysis_result(req.fen, req.index);
    if (cachedResult && is_cached_result_sufficient(cachedResult, req.depth)) {
      update_engine_result_cache(cachedResult);
    } else {
      pending.push(req);
    }
  });

  if (pending.length > 0) {
    const initialised = await engine_initialise();
    if (!initialised) {
      pending.forEach(req => {
        const errorResult = {
          fen: req.fen,
          ply: req.index,
          error: 'Engine initialisation failed'
        };
        update_engine_result_cache(errorResult);
      });
      publish_analysis_results();
      return;
    }

    for (const req of pending) {
      try {
        await engine_analyse_fen(req.fen, req.index, req.depth);
      } catch (err) {
        const errorResult = { fen: req.fen, ply: req.index, error: err.message };
        update_engine_result_cache(errorResult);
        console.warn('Engine analysis failed for FEN:', req.fen, err);
      }
    }
  }

  publish_analysis_results();
}

async function engine_process_queue() {
  if (engineAnalysisRunning) return;
  if (!engineAnalysisQueue.length) return;
  const job = engineAnalysisQueue.shift();
  engineAnalysisRunning = true;
  try {
    await engine_run_analysis_for_list(job.requests);
  } catch (err) {
    console.warn('Engine analysis run failed:', err);
  } finally {
    engineAnalysisRunning = false;
    if (engineAnalysisQueue.length > 0) {
      engine_process_queue();
    }
  }
}

function engine_schedule_analysis(requests) {
  if (!Array.isArray(requests) || requests.length === 0) return;
  engineAnalysisQueue.push({ requests });
  engine_process_queue();
}

function trigger_engine_analysis() {
  if (!positions.length) return;
  engine_schedule_analysis(positions.slice());
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
  evalCanvas = document.getElementById('analysisCanvas');
  evalCtx = evalCanvas ? evalCanvas.getContext('2d') : null;
  lossCanvas = document.getElementById('lossCanvas');
  lossCtx = lossCanvas ? lossCanvas.getContext('2d') : null;
  accuracyCanvas = document.getElementById('accuracyCanvas');
  accuracyCtx = accuracyCanvas ? accuracyCanvas.getContext('2d') : null;
  headerMenuEl = document.getElementById('headerMenu');
  menuToggleBtn = document.getElementById('menuToggle');
  menuListEl = document.getElementById('menuList');
  enginePvPanelEl = document.getElementById('enginePvPanel');
  enginePvEvalEl = document.getElementById('enginePvEval');
  enginePvMovesEl = document.getElementById('enginePvMoves');
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
