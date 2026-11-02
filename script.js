/* ====== STORAGE ====== */
function loadItem(key) {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function saveItem(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch {
        // Storage unavailable (private mode, quota) - keep playing without persistence
    }
}

function loadJSON(key, fallback) {
    try {
        return JSON.parse(loadItem(key)) ?? fallback;
    } catch {
        return fallback;
    }
}

/* ====== STATE ====== */
let board = [];
let tileEls = []; // DOM element for each occupied cell, mirrors board
let score = 0;
let best = 0;
let gridSize = 4;
let gameMode = 'classic'; // classic, time, target
let variant = 'classic'; // classic, fibonacci, obstacles, joker
let selectedSize = 4;
let selectedMode = 'classic';
let selectedVariant = 'classic';
let gameStarted = false;
let moveCount = 0;
let history = [];
let soundEnabled = true;
let audioContext = null;
let startTime = null;
let timerInterval = null;
let timeLeft = 0;
let hasWon = false;
let currentCellSize = 95;
let currentGap = 10;

// Game rules
const MAX_HISTORY = 3;
const TIME_LIMIT = 180; // 3 minutes
const TARGET_SCORE = 10000;

// Special tile values (empty cells are 0, numbers are positive)
const STONE = -1;
const JOKER = -2;
const SLIDE_DURATION = 150; // ms, synced with .tile transition in CSS

// Board sizing constants
const VIEWPORT_PADDING = 40; // Account for container padding and margins (synced with CSS --viewport-padding)
const MAX_CELL_SIZE = 95;
const MIN_CELL_SIZE = 50; // Minimum cell size for playability on small screens
const SMALL_CELL_THRESHOLD = 70; // Cell size threshold for using smaller gap (smaller screens need tighter layout)
const DEFAULT_GAP = 10; // Standard gap between tiles for normal screens
const SMALL_GAP = 8; // Reduced gap for smaller screens to maximize space
const FONT_SIZE_RATIO = 0.35; // Base font size as 35% of cell size for optimal readability
const LARGE_FONT_RATIO = 0.85; // Font size for tiles 128-512 (reduced to fit 3 digits)
const XLARGE_FONT_RATIO = 0.75; // Font size for tiles 1024+ (reduced to fit 4 digits)

const DIRECTIONS = ['left', 'right', 'up', 'down'];
const ARROWS = { left: '⬅️', right: '➡️', up: '⬆️', down: '⬇️' };
const KEY_DIRECTIONS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
const MODE_NAMES = { classic: 'Classic', time: 'Time Attack', target: 'Target Score' };

/* ====== VARIANTS ====== */
const FIBONACCI = [1, 2];
while (FIBONACCI[FIBONACCI.length - 1] < 1e7) {
    FIBONACCI.push(FIBONACCI[FIBONACCI.length - 1] + FIBONACCI[FIBONACCI.length - 2]);
}

const spawnClassic = () => Math.random() < 0.9 ? 2 : 4;
const mergeClassic = (a, b) => a === b && a > 0 ? a * 2 : 0;

// Each variant defines what spawns, which tiles merge (0 = no merge) and the goal tile.
const VARIANTS = {
    classic: {
        name: 'Classic',
        icon: '🔢',
        winTile: 2048,
        desc: 'Luật gốc: hai ô cùng số gộp thành tổng của chúng. Mục tiêu: ô 2048.',
        spawn: spawnClassic,
        merge: mergeClassic
    },
    fibonacci: {
        name: 'Fibonacci',
        icon: '🌀',
        winTile: 2584,
        desc: 'Hai số Fibonacci liền kề gộp lại (1+1, 1+2, 2+3, 3+5, …). Mục tiêu: ô 2584.',
        spawn: () => Math.random() < 0.9 ? 1 : 2,
        merge: (a, b) => {
            if (a <= 0 || b <= 0) return 0;
            if (a === 1 && b === 1) return 2;
            return Math.abs(FIBONACCI.indexOf(a) - FIBONACCI.indexOf(b)) === 1 ? a + b : 0;
        },
        // Reuse the classic palette: n-th Fibonacci number gets the n-th power-of-two color
        colorValue: value => 2 ** (FIBONACCI.indexOf(value) + 1)
    },
    obstacles: {
        name: 'Chướng ngại',
        icon: '🪨',
        winTile: 1024,
        desc: 'Các khối đá cố định chia cắt bàn cờ, ô số không thể vượt qua. Mục tiêu: ô 1024.',
        stones: size => Math.floor(size / 2),
        spawn: spawnClassic,
        merge: mergeClassic
    },
    joker: {
        name: 'Joker',
        icon: '🃏',
        winTile: 2048,
        desc: 'Thỉnh thoảng xuất hiện ô ★ - gộp được với bất kỳ số nào và nhân đôi số đó. Mục tiêu: ô 2048.',
        // At most one joker on the board at a time
        spawn: grid => !grid.flat().includes(JOKER) && Math.random() < 0.08 ? JOKER : spawnClassic(),
        merge: (a, b) => {
            if (a === JOKER && b > 0) return b * 2;
            if (b === JOKER && a > 0) return a * 2;
            return mergeClassic(a, b);
        }
    }
};

const menuOverlay = document.getElementById('game-menu');
const winOverlay = document.getElementById('win-message');

// Statistics
let stats = {
    totalGames: 0,
    wins: 0,
    highestTile: 0,
    totalTime: 0,
    ...loadJSON("stats2048", {})
};

// Leaderboard
let leaderboard = loadJSON("leaderboard2048", []);
if (!Array.isArray(leaderboard)) leaderboard = [];

// Remembered menu choices
const settings = loadJSON("settings2048", {});
if ([3, 4, 5, 6].includes(settings.size)) selectedSize = settings.size;
if (MODE_NAMES[settings.mode]) selectedMode = settings.mode;
if (VARIANTS[settings.variant]) selectedVariant = settings.variant;

function saveSettings() {
    saveItem("settings2048", JSON.stringify({ size: selectedSize, mode: selectedMode, variant: selectedVariant }));
}

// Scores of different variants aren't comparable, so each keeps its own best
function bestKey(v) {
    return v === 'classic' ? "best2048" : `best2048-${v}`;
}

function loadBest() {
    best = Number(loadItem(bestKey(variant))) || 0;
    document.getElementById("best").innerText = best;
}

variant = selectedVariant;
loadBest();
document.getElementById("target-score").innerText = TARGET_SCORE;
updateStats();
updateLeaderboard();

// Update board size on window resize
window.addEventListener('resize', () => {
    if (tileEls.length) {
        updateBoardSize();
    }
});

document.getElementById("new-game").onclick = startGame;
document.getElementById("restart").onclick = startGame;
document.getElementById("continue-game").onclick = () => {
    hideWinMessage();
    resumeTimer();
};
document.getElementById("new-game-win").onclick = () => {
    hideWinMessage();
    startGame();
};

/* ====== THEME MANAGEMENT ====== */
const themeButtons = document.querySelectorAll('.theme-btn');
const THEMES = ['light', 'dark', 'neon', 'pastel'];
let currentTheme = loadItem('theme2048');
if (!THEMES.includes(currentTheme)) currentTheme = 'light';

function setTheme(theme) {
    document.body.className = theme;
    currentTheme = theme;
    saveItem('theme2048', theme);

    const themeToggle = document.getElementById('theme-toggle');
    const themeIcons = {
        light: '🌙',
        dark: '☀️',
        neon: '✨',
        pastel: '🎨'
    };
    themeToggle.innerText = themeIcons[theme] || '🌙';

    themeButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === theme);
    });
}

themeButtons.forEach(btn => {
    btn.addEventListener('click', () => setTheme(btn.dataset.theme));
});

// Set initial theme
setTheme(currentTheme);

document.getElementById("theme-toggle").onclick = () => {
    const currentIndex = THEMES.indexOf(currentTheme);
    setTheme(THEMES[(currentIndex + 1) % THEMES.length]);
};

/* ====== SOUND ====== */
document.getElementById("sound-toggle").onclick = () => {
    soundEnabled = !soundEnabled;
    document.getElementById("sound-toggle").innerText = soundEnabled ? '🔊' : '🔇';
    saveItem('sound2048', soundEnabled);
};

soundEnabled = loadItem('sound2048') !== 'false';
document.getElementById("sound-toggle").innerText = soundEnabled ? '🔊' : '🔇';

// Reuse a single AudioContext - browsers limit how many can exist at once
function getAudioContext() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!audioContext) audioContext = new AudioCtx();
    if (audioContext.state === 'suspended') audioContext.resume();
    return audioContext;
}

function beep(ctx, frequency, volume, start, duration) {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.frequency.value = frequency;
    gainNode.gain.value = volume;
    oscillator.start(start);
    oscillator.stop(start + duration);
}

function playSound(type) {
    if (!soundEnabled) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (type === 'move') {
        beep(ctx, 200, 0.1, now, 0.05);
    } else if (type === 'merge') {
        beep(ctx, 400, 0.15, now, 0.1);
    } else if (type === 'win') {
        [262, 330, 392, 523].forEach((freq, i) => beep(ctx, freq, 0.1, now + i * 0.1, 0.2));
    }
}

/* ====== GAME MODE ====== */
const modeButtons = document.querySelectorAll('.mode-btn');

// Mode and grid size are applied when the next game starts
modeButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === selectedMode);
    btn.addEventListener('click', () => {
        modeButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedMode = btn.dataset.mode;
        saveSettings();
    });
});

/* ====== VARIANT SELECTION ====== */
const variantButtons = document.querySelectorAll('.variant-btn');

function selectVariant(v) {
    selectedVariant = v;
    variantButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.variant === v));
    document.getElementById('variant-desc').innerText = VARIANTS[v].desc;
    updateLeaderboard();
}

variantButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        selectVariant(btn.dataset.variant);
        saveSettings();
    });
});

selectVariant(selectedVariant);

function updateGameInfo() {
    const v = VARIANTS[variant];
    document.getElementById('game-info').innerText =
        `${v.icon} ${v.name} · ${gridSize}×${gridSize} · ${MODE_NAMES[gameMode]} · Mục tiêu ${v.winTile}`;
}

/* ====== TIMER ====== */
function renderTimer() {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    document.getElementById('timer').innerText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function startTimer() {
    startTime = Date.now();
    pauseTimer();

    if (gameMode === 'time') {
        timeLeft = TIME_LIMIT;
        renderTimer();
        resumeTimer();
    }
}

function pauseTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
}

function resumeTimer() {
    if (gameMode !== 'time' || !gameStarted || timerInterval || isOverlayOpen()) return;

    timerInterval = setInterval(() => {
        timeLeft--;
        renderTimer();

        if (timeLeft <= 0) {
            endGame(false, "⏰ Hết giờ!");
        }
    }, 1000);
}

function stopTimer() {
    pauseTimer();
    if (startTime) {
        stats.totalTime += Math.floor((Date.now() - startTime) / 1000);
        startTime = null;
        saveStats();
    }
}

/* ====== GAME INIT ====== */
function startGame() {
    // Record play time of an abandoned game
    if (gameStarted) stopTimer();

    gridSize = selectedSize;
    gameMode = selectedMode;
    variant = selectedVariant;
    board = Array.from({ length: gridSize }, () => Array(gridSize).fill(0));
    loadBest();
    updateGameInfo();

    score = 0;
    moveCount = 0;
    history = [];
    hasWon = false;
    updateScore();
    document.getElementById("moves").innerText = moveCount;
    document.getElementById("message").classList.add("hidden");
    hideWinMessage();

    document.getElementById('time-box').classList.toggle('hidden', gameMode !== 'time');
    document.getElementById('target-box').classList.toggle('hidden', gameMode !== 'target');

    const stones = VARIANTS[variant].stones?.(gridSize) || 0;
    for (let i = 0; i < stones; i++) generateTile(STONE);
    generateTile();
    generateTile();
    initBoard();
    updateBoardSize();
    renderTiles(true);
    gameStarted = true;

    startTimer();
    saveState();
}

function saveState() {
    if (history.length >= MAX_HISTORY) {
        history.shift();
    }
    history.push({
        board: board.map(row => [...row]),
        score: score,
        moveCount: moveCount
    });
    document.getElementById("undo-btn").disabled = history.length <= 1;
}

/* ====== UNDO ====== */
document.getElementById("undo-btn").onclick = undo;

function undo() {
    if (!gameStarted || history.length <= 1) return;

    history.pop(); // Remove current state
    const previousState = history[history.length - 1];

    board = previousState.board.map(row => [...row]);
    score = previousState.score;
    moveCount = previousState.moveCount;

    updateScore();
    document.getElementById("moves").innerText = moveCount;
    renderTiles(false);

    document.getElementById("undo-btn").disabled = history.length <= 1;
}

/* ====== HINT ====== */
document.getElementById("hint-btn").onclick = showHint;

function showHint() {
    if (!gameStarted || isOverlayOpen()) return;

    let bestMove = null;
    let bestScore = -1;

    // Simulate each direction on a copy of the board - never touches game state
    DIRECTIONS.forEach(dir => {
        const result = computeMove(board, dir);
        if (!result.moved) return;

        const cells = result.board.flat();
        const emptyCount = cells.filter(v => v === 0).length;
        const heuristic = emptyCount * 100 + Math.max(...cells) + result.gained;

        if (heuristic > bestScore) {
            bestScore = heuristic;
            bestMove = dir;
        }
    });

    if (!bestMove) return;

    const boardDiv = document.getElementById('board');
    boardDiv.querySelector('.hint-arrow')?.remove();

    const arrow = document.createElement('div');
    arrow.className = 'hint-arrow';
    arrow.innerText = ARROWS[bestMove];
    arrow.addEventListener('animationend', () => arrow.remove());
    boardDiv.appendChild(arrow);
}

/* ====== UPDATE BOARD SIZE ====== */
function updateBoardSize() {
    const boardDiv = document.getElementById('board');
    const boardGrid = boardDiv.querySelector('.board-grid');
    const tileContainer = document.getElementById('tile-container');

    // Calculate optimal cell size based on screen width
    const maxWidth = window.innerWidth - VIEWPORT_PADDING;

    // Determine gap size based on available width
    // Use smaller gap for narrower screens to fit more content
    const estimatedCellSize = Math.floor((maxWidth - (2 * DEFAULT_GAP)) / gridSize);
    currentGap = estimatedCellSize < SMALL_CELL_THRESHOLD ? SMALL_GAP : DEFAULT_GAP;

    // Calculate cell size to fit the screen with the appropriate gap (board padding equals the gap)
    const availableWidth = maxWidth - ((gridSize + 1) * currentGap);
    currentCellSize = Math.floor(availableWidth / gridSize);

    // Cap at maximum size for larger screens
    currentCellSize = Math.min(currentCellSize, MAX_CELL_SIZE);

    // Ensure minimum size for playability
    currentCellSize = Math.max(currentCellSize, MIN_CELL_SIZE);

    if (boardGrid) {
        boardGrid.style.gridTemplateColumns = `repeat(${gridSize}, ${currentCellSize}px)`;
        boardGrid.style.gridTemplateRows = `repeat(${gridSize}, ${currentCellSize}px)`;
        boardGrid.style.gap = `${currentGap}px`;
    }
    if (tileContainer) {
        // Tile container must start exactly where the grid starts (inside the board padding)
        tileContainer.style.inset = `${currentGap}px`;
    }
    boardDiv.style.padding = `${currentGap}px`;
    boardDiv.style.width = 'fit-content';

    // Update tile font sizes based on cell size
    const baseFontSize = Math.floor(currentCellSize * FONT_SIZE_RATIO);
    document.documentElement.style.setProperty('--tile-font-size', `${baseFontSize}px`);
    document.documentElement.style.setProperty('--tile-font-size-large', `${Math.floor(baseFontSize * LARGE_FONT_RATIO)}px`);
    document.documentElement.style.setProperty('--tile-font-size-xlarge', `${Math.floor(baseFontSize * XLARGE_FONT_RATIO)}px`);

    // Update existing tile positions
    updateTilePositions();
}

/* ====== RENDER BOARD ====== */
function positionTile(el, row, col) {
    el.style.left = `${col * (currentCellSize + currentGap)}px`;
    el.style.top = `${row * (currentCellSize + currentGap)}px`;
    el.style.width = `${currentCellSize}px`;
    el.style.height = `${currentCellSize}px`;
}

function setTileValue(el, value, animation) {
    if (value === STONE) {
        el.className = 'tile tile-stone';
        el.innerText = '';
    } else if (value === JOKER) {
        el.className = 'tile tile-joker';
        el.innerText = '★';
    } else {
        const colorValue = VARIANTS[variant].colorValue?.(value) ?? value;
        el.className = `tile tile-${colorValue}` + (colorValue > 4096 ? ' tile-super' : '');
        el.innerText = value;
    }
    if (animation) {
        void el.offsetWidth; // Force reflow so the animation restarts
        el.classList.add(animation);
    }
}

function createTile(row, col, value, animation) {
    const el = document.createElement("div");
    setTileValue(el, value, animation);
    positionTile(el, row, col);
    document.getElementById("tile-container").appendChild(el);
    return el;
}

function updateTilePositions() {
    tileEls.forEach((row, r) => row.forEach((el, c) => {
        if (el) positionTile(el, r, c);
    }));
}

function initBoard() {
    const boardDiv = document.getElementById("board");
    boardDiv.innerHTML = "";

    // Create background grid
    const boardGrid = document.createElement("div");
    boardGrid.className = "board-grid";

    for (let i = 0; i < gridSize * gridSize; i++) {
        const cell = document.createElement("div");
        cell.className = "cell-bg";
        boardGrid.appendChild(cell);
    }
    boardDiv.appendChild(boardGrid);

    // Create tile container
    const tileContainer = document.createElement("div");
    tileContainer.className = "tile-container";
    tileContainer.id = "tile-container";
    boardDiv.appendChild(tileContainer);
}

// Rebuild all tiles from the board state (new game, undo)
function renderTiles(animate) {
    document.getElementById("tile-container").innerHTML = "";
    tileEls = board.map((row, r) => row.map((value, c) =>
        value ? createTile(r, c, value, animate ? 'new' : null) : null
    ));
}

// Slide existing tile elements along the paths computed by computeMove
function animateMoves(moves) {
    const next = Array.from({ length: gridSize }, () => Array(gridSize).fill(null));

    moves.forEach(({ from: [fr, fc], to: [tr, tc], merged }) => {
        const el = tileEls[fr][fc];
        positionTile(el, tr, tc);

        if (merged) {
            // The tile that stays at the target is already in `next` (it is always processed first)
            const target = next[tr][tc];
            const value = board[tr][tc];
            setTimeout(() => {
                el.remove();
                setTileValue(target, value, 'merge');
            }, SLIDE_DURATION);
        } else {
            next[tr][tc] = el;
        }
    });

    tileEls = next;
}

function updateScore() {
    document.getElementById("score").innerText = score;
    if (score > best) {
        best = score;
        saveItem(bestKey(variant), best);
        document.getElementById("best").innerText = best;
    }
}

/* ====== GENERATE TILE ====== */
function generateTile(value = VARIANTS[variant].spawn(board)) {
    const empty = [];

    for (let r = 0; r < gridSize; r++) {
        for (let c = 0; c < gridSize; c++) {
            if (board[r][c] === 0) empty.push({ r, c });
        }
    }

    if (empty.length === 0) return null;

    const spot = empty[Math.floor(Math.random() * empty.length)];
    board[spot.r][spot.c] = value;
    return spot;
}

/* ====== INPUT ====== */
function isOverlayOpen() {
    return !menuOverlay.classList.contains('hidden') || !winOverlay.classList.contains('hidden');
}

document.addEventListener("keydown", function (e) {
    if (e.key === 'Escape' && !menuOverlay.classList.contains('hidden')) {
        closeMenu();
        return;
    }

    if (!gameStarted || isOverlayOpen() || e.ctrlKey || e.metaKey || e.altKey) return;

    const key = e.key.toLowerCase();

    // Undo with 'U' key
    if (key === 'u') {
        undo();
    } else if (key === 'h') {
        // Hint with 'H' key
        showHint();
    } else if (KEY_DIRECTIONS[e.key]) {
        e.preventDefault(); // Don't scroll the page
        move(KEY_DIRECTIONS[e.key]);
    }
});

/* ====== TOUCH SUPPORT ====== */
let touchStartX = 0;
let touchStartY = 0;
let isSwiping = false;

document.addEventListener('touchstart', (e) => {
    const target = e.target;
    // Only handle touch on the board
    if (target.closest('#board')) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        isSwiping = true;
        e.preventDefault();
    }
}, { passive: false });

document.addEventListener('touchmove', (e) => {
    if (isSwiping) {
        e.preventDefault();
    }
}, { passive: false });

document.addEventListener('touchend', (e) => {
    if (!isSwiping) return;
    isSwiping = false;

    const deltaX = e.changedTouches[0].clientX - touchStartX;
    const deltaY = e.changedTouches[0].clientY - touchStartY;
    const minSwipe = 30;

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
        if (Math.abs(deltaX) > minSwipe) move(deltaX > 0 ? 'right' : 'left');
    } else if (Math.abs(deltaY) > minSwipe) {
        move(deltaY > 0 ? 'down' : 'up');
    }
});

/* ====== SLIDE LOGIC ====== */
// Slides one line toward index 0. Returns the new line plus where each tile went.
function slide(line) {
    const result = Array(line.length).fill(0);
    const shifts = [];
    let points = 0;
    let target = -1;
    let canMerge = false; // A tile can only be merged once per move

    line.forEach((value, from) => {
        if (value === 0) return;

        if (value === STONE) {
            // Stones never move and split the line into independent segments
            result[from] = STONE;
            target = from;
            canMerge = false;
            shifts.push({ from, to: from, merged: false });
            return;
        }

        const mergedValue = canMerge ? VARIANTS[variant].merge(result[target], value) : 0;
        if (mergedValue) {
            result[target] = mergedValue;
            points += mergedValue;
            canMerge = false;
            shifts.push({ from, to: target, merged: true });
        } else {
            target++;
            result[target] = value;
            canMerge = true;
            shifts.push({ from, to: target, merged: false });
        }
    });

    return { result, shifts, points };
}

// Cell positions of line i, ordered from the edge tiles slide toward
function getLinePositions(dir, i) {
    const positions = [];
    for (let j = 0; j < gridSize; j++) {
        if (dir === 'left') positions.push([i, j]);
        else if (dir === 'right') positions.push([i, gridSize - 1 - j]);
        else if (dir === 'up') positions.push([j, i]);
        else positions.push([gridSize - 1 - j, i]);
    }
    return positions;
}

/* ====== MOVE FUNCTIONS ====== */
// Pure: computes the result of a move without changing game state
function computeMove(grid, dir) {
    const next = grid.map(row => [...row]);
    const moves = [];
    let gained = 0;
    let moved = false;

    for (let i = 0; i < gridSize; i++) {
        const positions = getLinePositions(dir, i);
        const { result, shifts, points } = slide(positions.map(([r, c]) => grid[r][c]));

        positions.forEach(([r, c], j) => { next[r][c] = result[j]; });
        shifts.forEach(({ from, to, merged }) => {
            if (from !== to) moved = true;
            moves.push({ from: positions[from], to: positions[to], merged });
        });
        gained += points;
    }

    return { board: next, moves, gained, moved };
}

function move(dir) {
    if (!gameStarted || isOverlayOpen()) return;

    const result = computeMove(board, dir);
    if (!result.moved) return;

    board = result.board;
    score += result.gained;
    moveCount++;

    animateMoves(result.moves);
    const spot = generateTile();
    if (spot) {
        tileEls[spot.r][spot.c] = createTile(spot.r, spot.c, board[spot.r][spot.c], 'new');
    }

    playSound(result.gained > 0 ? 'merge' : 'move');
    updateScore();
    document.getElementById("moves").innerText = moveCount;
    saveState();
    checkProgress();
}

/* ====== GAME OVER ====== */
function canMove() {
    return DIRECTIONS.some(dir => computeMove(board, dir).moved);
}

function checkProgress() {
    const maxTile = Math.max(...board.flat());
    if (maxTile > stats.highestTile) {
        stats.highestTile = maxTile;
        saveStats();
    }

    if (gameMode === 'target' && score >= TARGET_SCORE) {
        endGame(true, `🎯 Đạt ${TARGET_SCORE} điểm!`);
        return;
    }

    if (!canMove()) {
        endGame(false);
        return;
    }

    if (!hasWon && maxTile >= VARIANTS[variant].winTile) {
        hasWon = true;
        pauseTimer();
        setTimeout(() => showWinMessage(maxTile), SLIDE_DURATION * 2);
    }
}

function endGame(won, text) {
    if (!gameStarted) return;
    gameStarted = false;
    stopTimer();

    // Reaching 2048 counts as a win even if the game continued afterwards
    won = won || hasWon;
    stats.totalGames++;
    if (won) stats.wins++;
    saveStats();

    // Add to leaderboard
    if (score > 0) {
        addToLeaderboard(score);
    }

    document.getElementById("undo-btn").disabled = true;
    document.getElementById("message-text").innerText = text || (won ? "🎉 Bạn thắng!" : "Game Over!");
    document.getElementById("message").classList.remove("hidden");
}

/* ====== WIN MESSAGE ====== */
function showWinMessage(tile) {
    if (!gameStarted) return;
    document.getElementById('win-tile').innerText = tile;
    winOverlay.classList.remove('hidden');
    playSound('win');
}

function hideWinMessage() {
    winOverlay.classList.add('hidden');
}

/* ====== STATISTICS ====== */
function saveStats() {
    saveItem('stats2048', JSON.stringify(stats));
    updateStats();
}

function updateStats() {
    document.getElementById('total-games').innerText = stats.totalGames;
    const winRate = stats.totalGames > 0 ? Math.round((stats.wins / stats.totalGames) * 100) : 0;
    document.getElementById('win-rate').innerText = winRate + '%';
    document.getElementById('highest-tile').innerText = stats.highestTile;

    const hours = Math.floor(stats.totalTime / 3600);
    const minutes = Math.floor((stats.totalTime % 3600) / 60);
    document.getElementById('total-time').innerText = `${hours}h ${minutes}m`;
}

/* ====== LEADERBOARD ====== */
function addToLeaderboard(score) {
    leaderboard.push({ score, variant, size: gridSize, mode: gameMode, date: new Date().toISOString() });
    leaderboard.sort((a, b) => b.score - a.score);

    // Keep the top 10 of each variant
    const counts = {};
    leaderboard = leaderboard.filter(entry => {
        const v = entry.variant || 'classic';
        counts[v] = (counts[v] || 0) + 1;
        return counts[v] <= 10;
    });
    saveItem('leaderboard2048', JSON.stringify(leaderboard));
    updateLeaderboard();
}

function updateLeaderboard() {
    const container = document.getElementById('leaderboard');
    container.innerHTML = '';
    document.getElementById('leaderboard-variant').innerText = VARIANTS[selectedVariant].name;

    // Entries saved before variants existed are classic games
    const entries = leaderboard.filter(entry => (entry.variant || 'classic') === selectedVariant);

    if (entries.length === 0) {
        container.innerHTML = '<p class="leaderboard-empty">Chưa có dữ liệu</p>';
        return;
    }

    entries.forEach((entry, index) => {
        const item = document.createElement('div');
        item.className = 'leaderboard-item';

        const rank = document.createElement('span');
        rank.className = 'leaderboard-rank';
        rank.innerText = index < 3 ? ['🥇', '🥈', '🥉'][index] : index + 1;

        // Older entries only stored a generic player name
        const name = document.createElement('span');
        name.className = 'leaderboard-name';
        name.innerText = entry.size
            ? `${entry.size}×${entry.size} · ${MODE_NAMES[entry.mode] || entry.mode}`
            : entry.name;
        if (entry.date) name.title = new Date(entry.date).toLocaleString('vi-VN');

        const scoreEl = document.createElement('span');
        scoreEl.className = 'leaderboard-score';
        scoreEl.innerText = entry.score;

        item.append(rank, name, scoreEl);
        container.appendChild(item);
    });
}

/* ====== MENU FUNCTIONALITY ====== */
const menuToggle = document.getElementById('menu-toggle');
const gridSizeBtns = document.querySelectorAll('.grid-size-btn');

function showMenu() {
    menuOverlay.classList.remove('hidden');
    pauseTimer();
    updateStats();
    updateLeaderboard();
}

function hideMenu() {
    menuOverlay.classList.add('hidden');
    resumeTimer();
}

// Close the menu: resume the current game, or start one if none is running
function closeMenu() {
    hideMenu();
    if (!gameStarted) {
        startGame();
    }
}

menuToggle.addEventListener('click', showMenu);

menuOverlay.addEventListener('click', (e) => {
    if (e.target === menuOverlay) {
        closeMenu();
    }
});

document.getElementById('start-game').addEventListener('click', () => {
    hideMenu();
    startGame();
});

gridSizeBtns.forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.size, 10) === selectedSize);
    btn.addEventListener('click', () => {
        gridSizeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedSize = parseInt(btn.dataset.size, 10);
        saveSettings();
    });
});
