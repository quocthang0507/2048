let board;
let score = 0;
let best = localStorage.getItem("best2048") || 0;
let gridSize = 4;
let gameStarted = false;
let gameMode = 'classic'; // classic, time, target
let moveCount = 0;
let history = [];
let maxHistory = 3;
let soundEnabled = true;
let startTime = null;
let timerInterval = null;
let hasWon = false;
let tileIdCounter = 0;
let tiles = {};
let currentCellSize = 95;
let currentGap = 10;

// Board sizing constants
const VIEWPORT_PADDING = 40; // Account for container padding and margins (synced with CSS --viewport-padding)
const MIN_CELL_SIZE = 50; // Minimum cell size for playability on small screens
const SMALL_CELL_THRESHOLD = 70; // Cell size threshold for using smaller gap (smaller screens need tighter layout)
const DEFAULT_GAP = 10; // Standard gap between tiles for normal screens
const SMALL_GAP = 8; // Reduced gap for smaller screens to maximize space
const FONT_SIZE_RATIO = 0.35; // Base font size as 35% of cell size for optimal readability
const LARGE_FONT_RATIO = 0.85; // Font size for tiles 128-512 (reduced to fit 3 digits)
const XLARGE_FONT_RATIO = 0.75; // Font size for tiles 1024+ (reduced to fit 4 digits)

// Statistics
let stats = JSON.parse(localStorage.getItem("stats2048")) || {
    totalGames: 0,
    wins: 0,
    highestTile: 0,
    totalTime: 0
};

// Leaderboard
let leaderboard = JSON.parse(localStorage.getItem("leaderboard2048")) || [];

document.getElementById("best").innerText = best;
updateStats();
updateLeaderboard();

window.onload = function () {
    showMenu();
};

// Update board size on window resize
window.addEventListener('resize', () => {
    if (gameStarted) {
        updateBoardSize();
    }
});

document.getElementById("new-game").onclick = startGame;
document.getElementById("restart").onclick = startGame;
document.getElementById("continue-game").onclick = () => {
    hideWinMessage();
    hasWon = true;
};
document.getElementById("new-game-win").onclick = () => {
    hideWinMessage();
    startGame();
};

/* ====== THEME MANAGEMENT ====== */
const themeButtons = document.querySelectorAll('.theme-btn');
let currentTheme = localStorage.getItem('theme2048') || 'light';

function setTheme(theme) {
    document.body.className = theme;
    currentTheme = theme;
    localStorage.setItem('theme2048', theme);
    
    const themeToggle = document.getElementById('theme-toggle');
    const themeIcons = {
        light: '🌙',
        dark: '☀️',
        neon: '✨',
        pastel: '🎨'
    };
    themeToggle.innerText = themeIcons[theme] || '🌙';
}

themeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        themeButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        setTheme(btn.dataset.theme);
    });
});

// Set initial theme
setTheme(currentTheme);
themeButtons.forEach(btn => {
    if (btn.dataset.theme === currentTheme) {
        btn.classList.add('active');
    }
});

document.getElementById("theme-toggle").onclick = () => {
    const themes = ['light', 'dark', 'neon', 'pastel'];
    const currentIndex = themes.indexOf(currentTheme);
    const nextTheme = themes[(currentIndex + 1) % themes.length];
    setTheme(nextTheme);
    
    themeButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === nextTheme);
    });
};

/* ====== SOUND ====== */
document.getElementById("sound-toggle").onclick = () => {
    soundEnabled = !soundEnabled;
    document.getElementById("sound-toggle").innerText = soundEnabled ? '🔊' : '🔇';
    localStorage.setItem('sound2048', soundEnabled);
};

soundEnabled = localStorage.getItem('sound2048') !== 'false';
document.getElementById("sound-toggle").innerText = soundEnabled ? '🔊' : '🔇';

function playSound(type) {
    if (!soundEnabled) return;
    
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    if (type === 'move') {
        oscillator.frequency.value = 200;
        gainNode.gain.value = 0.1;
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.05);
    } else if (type === 'merge') {
        oscillator.frequency.value = 400;
        gainNode.gain.value = 0.15;
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.1);
    } else if (type === 'win') {
        [262, 330, 392, 523].forEach((freq, i) => {
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();
            osc.connect(gain);
            gain.connect(audioContext.destination);
            osc.frequency.value = freq;
            gain.gain.value = 0.1;
            osc.start(audioContext.currentTime + i * 0.1);
            osc.stop(audioContext.currentTime + i * 0.1 + 0.2);
        });
    }
}

/* ====== GAME MODE ====== */
const modeButtons = document.querySelectorAll('.mode-btn');

modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        modeButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        gameMode = btn.dataset.mode;
    });
});

/* ====== TIMER ====== */
function startTimer() {
    startTime = Date.now();
    clearInterval(timerInterval);
    
    if (gameMode === 'time') {
        document.getElementById('time-box').style.display = 'block';
        let timeLeft = 180; // 3 minutes
        
        timerInterval = setInterval(() => {
            timeLeft--;
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;
            document.getElementById('timer').innerText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                endGame(false);
            }
        }, 1000);
    }
}

function stopTimer() {
    clearInterval(timerInterval);
    if (startTime) {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        stats.totalTime += elapsed;
        saveStats();
    }
}

/* ====== GAME INIT ====== */
function startGame() {
    board = [];
    for (let r = 0; r < gridSize; r++) {
        board[r] = [];
        for (let c = 0; c < gridSize; c++) {
            board[r][c] = 0;
        }
    }

    score = 0;
    moveCount = 0;
    history = [];
    hasWon = false;
    document.getElementById("score").innerText = score;
    document.getElementById("moves").innerText = moveCount;
    document.getElementById("message").classList.add("hidden");
    document.getElementById("undo-btn").disabled = true;
    
    if (gameMode !== 'time') {
        document.getElementById('time-box').style.display = 'none';
    }

    generateTile(true);
    generateTile(true);
    updateBoard();
    updateBoardSize();
    gameStarted = true;
    
    startTimer();
    saveState();
}

function saveState() {
    if (history.length >= maxHistory) {
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
    if (history.length <= 1) return;
    
    history.pop(); // Remove current state
    const previousState = history[history.length - 1];
    
    board = previousState.board.map(row => [...row]);
    score = previousState.score;
    moveCount = previousState.moveCount;
    
    document.getElementById("score").innerText = score;
    document.getElementById("moves").innerText = moveCount;
    updateBoard();
    
    document.getElementById("undo-btn").disabled = history.length <= 1;
}

/* ====== HINT ====== */
document.getElementById("hint-btn").onclick = showHint;

function showHint() {
    const directions = ['left', 'right', 'up', 'down'];
    let bestMove = null;
    let bestScore = -1;
    
    directions.forEach(dir => {
        const testBoard = board.map(row => [...row]);
        const originalBoard = board;
        board = testBoard;
        
        let moved = false;
        if (dir === 'left') moved = moveLeft(true);
        else if (dir === 'right') moved = moveRight(true);
        else if (dir === 'up') moved = moveUp(true);
        else if (dir === 'down') moved = moveDown(true);
        
        if (moved) {
            const emptyCount = testBoard.flat().filter(v => v === 0).length;
            const maxTile = Math.max(...testBoard.flat());
            const heuristic = emptyCount * 100 + maxTile;
            
            if (heuristic > bestScore) {
                bestScore = heuristic;
                bestMove = dir;
            }
        }
        
        board = originalBoard;
    });
    
    if (bestMove) {
        // Highlight suggested direction
        const tiles = document.querySelectorAll('.tile');
        tiles.forEach(tile => tile.classList.remove('hint'));
        
        setTimeout(() => {
            alert(`Gợi ý: Nhấn phím mũi tên ${bestMove === 'left' ? '⬅️' : bestMove === 'right' ? '➡️' : bestMove === 'up' ? '⬆️' : '⬇️'}`);
        }, 100);
    }
}

/* ====== UPDATE BOARD SIZE ====== */
function updateBoardSize() {
    const boardDiv = document.getElementById('board');
    const boardGrid = boardDiv.querySelector('.board-grid');
    
    // Calculate optimal cell size based on screen width
    const maxWidth = window.innerWidth - VIEWPORT_PADDING;
    const maxCellSize = 95;
    const padding = 10;
    
    // Determine gap size based on available width
    // Use smaller gap for narrower screens to fit more content
    const estimatedCellSize = Math.floor((maxWidth - (2 * padding)) / gridSize);
    currentGap = estimatedCellSize < SMALL_CELL_THRESHOLD ? SMALL_GAP : DEFAULT_GAP;
    
    // Calculate cell size to fit the screen with the appropriate gap
    const availableWidth = maxWidth - (2 * padding) - ((gridSize - 1) * currentGap);
    currentCellSize = Math.floor(availableWidth / gridSize);
    
    // Cap at maximum size for larger screens
    currentCellSize = Math.min(currentCellSize, maxCellSize);
    
    // Ensure minimum size for playability
    currentCellSize = Math.max(currentCellSize, MIN_CELL_SIZE);
    
    if (boardGrid) {
        boardGrid.style.gridTemplateColumns = `repeat(${gridSize}, ${currentCellSize}px)`;
        boardGrid.style.gridTemplateRows = `repeat(${gridSize}, ${currentCellSize}px)`;
        boardGrid.style.gap = `${currentGap}px`;
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
function getTilePosition(row, col) {
    return {
        left: col * (currentCellSize + currentGap),
        top: row * (currentCellSize + currentGap)
    };
}

function updateTilePositions() {
    Object.keys(tiles).forEach(id => {
        const tile = tiles[id];
        if (tile.element) {
            const pos = getTilePosition(tile.row, tile.col);
            tile.element.style.left = `${pos.left}px`;
            tile.element.style.top = `${pos.top}px`;
            tile.element.style.width = `${currentCellSize}px`;
            tile.element.style.height = `${currentCellSize}px`;
        }
    });
}

function initBoard() {
    const boardDiv = document.getElementById("board");
    boardDiv.innerHTML = "";
    tiles = {};
    tileIdCounter = 0;
    
    // Create background grid
    const boardGrid = document.createElement("div");
    boardGrid.className = "board-grid";
    boardGrid.style.gridTemplateColumns = `repeat(${gridSize}, ${currentCellSize}px)`;
    boardGrid.style.gridTemplateRows = `repeat(${gridSize}, ${currentCellSize}px)`;
    boardGrid.style.gap = `${currentGap}px`;
    
    for (let r = 0; r < gridSize; r++) {
        for (let c = 0; c < gridSize; c++) {
            const cell = document.createElement("div");
            cell.className = "cell-bg";
            boardGrid.appendChild(cell);
        }
    }
    boardDiv.appendChild(boardGrid);
    
    // Create tile container
    const tileContainer = document.createElement("div");
    tileContainer.className = "tile-container";
    tileContainer.id = "tile-container";
    boardDiv.appendChild(tileContainer);
}

function updateBoard() {
    const tileContainer = document.getElementById("tile-container");
    if (!tileContainer) {
        initBoard();
        return updateBoard();
    }
    
    // Build a map of current board state by position
    const newBoardState = {};
    for (let r = 0; r < gridSize; r++) {
        for (let c = 0; c < gridSize; c++) {
            if (board[r][c] > 0) {
                newBoardState[`${r}-${c}`] = board[r][c];
            }
        }
    }
    
    // Update existing tiles or mark them for removal
    const tilesToRemove = [];
    Object.keys(tiles).forEach(id => {
        const tile = tiles[id];
        const currentKey = `${tile.row}-${tile.col}`;
        
        // Check if tile still exists at current position with same value
        if (newBoardState[currentKey] === tile.value) {
            // Tile hasn't moved, keep it
            delete newBoardState[currentKey];
        } else {
            // Try to find if this tile moved to a new position
            let found = false;
            for (let key in newBoardState) {
                if (newBoardState[key] === tile.value) {
                    const [newR, newC] = key.split('-').map(Number);
                    
                    // Check if no other tile is already claiming this position
                    let claimed = false;
                    for (let otherId in tiles) {
                        if (otherId !== id && tiles[otherId].row === newR && tiles[otherId].col === newC) {
                            claimed = true;
                            break;
                        }
                    }
                    
                    if (!claimed) {
                        // This tile moved to this new position
                        tile.row = newR;
                        tile.col = newC;
                        const pos = getTilePosition(newR, newC);
                        tile.element.style.left = `${pos.left}px`;
                        tile.element.style.top = `${pos.top}px`;
                        tile.element.className = `tile tile-${tile.value}`;
                        tile.element.innerText = tile.value;
                        delete newBoardState[key];
                        found = true;
                        break;
                    }
                }
            }
            
            if (!found) {
                // Tile was merged or removed
                tilesToRemove.push(id);
            }
        }
    });
    
    // Remove tiles that were merged
    tilesToRemove.forEach(id => {
        if (tiles[id].element && tiles[id].element.parentNode) {
            tiles[id].element.parentNode.removeChild(tiles[id].element);
        }
        delete tiles[id];
    });
    
    // Create new tiles that appeared
    for (let key in newBoardState) {
        const [r, c] = key.split('-').map(Number);
        const value = newBoardState[key];
        
        const tileId = `tile-${tileIdCounter++}`;
        const tileElement = document.createElement("div");
        tileElement.className = `tile tile-${value}`;
        tileElement.id = tileId;
        tileElement.innerText = value;
        
        const pos = getTilePosition(r, c);
        tileElement.style.left = `${pos.left}px`;
        tileElement.style.top = `${pos.top}px`;
        tileElement.style.width = `${currentCellSize}px`;
        tileElement.style.height = `${currentCellSize}px`;
        
        tiles[tileId] = {
            element: tileElement,
            row: r,
            col: c,
            value: value
        };
        
        tileContainer.appendChild(tileElement);
        
        // Add new animation after a tiny delay to trigger CSS transition
        setTimeout(() => {
            tileElement.classList.add("new");
        }, 10);
        
        // Track highest tile
        if (value > stats.highestTile) {
            stats.highestTile = value;
            saveStats();
        }
        
        // Check for win
        if (value === 2048 && !hasWon) {
            setTimeout(() => showWinMessage(value), 500);
            hasWon = true;
        }
    }

    document.getElementById("score").innerText = score;
    if (score > best) {
        best = score;
        localStorage.setItem("best2048", best);
        document.getElementById("best").innerText = best;
    }
    
    // Check target score for target mode
    if (gameMode === 'target' && score >= 10000) {
        endGame(true);
    }
}

/* ====== GENERATE TILE ====== */
function generateTile(isNew = false) {
    let empty = [];

    for (let r = 0; r < gridSize; r++) {
        for (let c = 0; c < gridSize; c++) {
            if (board[r][c] === 0) empty.push({ r, c });
        }
    }

    if (empty.length === 0) return;

    let spot = empty[Math.floor(Math.random() * empty.length)];
    board[spot.r][spot.c] = Math.random() < 0.9 ? 2 : 4;

    if (!isNew) {
        setTimeout(() => {
            const tiles = document.querySelectorAll(".tile");
            const index = spot.r * gridSize + spot.c;
            if (tiles[index]) {
                tiles[index].classList.add("new");
            }
        }, 50);
    }
}

/* ====== INPUT ====== */
document.addEventListener("keydown", function (e) {
    if (!gameStarted) return;
    
    // Undo with 'U' key
    if (e.key.toLowerCase() === 'u') {
        undo();
        return;
    }
    
    // Hint with 'H' key
    if (e.key.toLowerCase() === 'h') {
        showHint();
        return;
    }
    
    let moved = false;

    if (e.key === "ArrowLeft") moved = moveLeft();
    else if (e.key === "ArrowRight") moved = moveRight();
    else if (e.key === "ArrowUp") moved = moveUp();
    else if (e.key === "ArrowDown") moved = moveDown();

    if (moved) {
        playSound('move');
        moveCount++;
        document.getElementById("moves").innerText = moveCount;
        generateTile();
        updateBoard();
        saveState();
        checkGameOver();
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
    if (!gameStarted || !isSwiping) {
        isSwiping = false;
        return;
    }
    
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    
    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;
    
    const minSwipe = 30;
    let moved = false;
    
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
        if (Math.abs(deltaX) > minSwipe) {
            moved = deltaX > 0 ? moveRight() : moveLeft();
        }
    } else {
        if (Math.abs(deltaY) > minSwipe) {
            moved = deltaY > 0 ? moveDown() : moveUp();
        }
    }
    
    if (moved) {
        playSound('move');
        moveCount++;
        document.getElementById("moves").innerText = moveCount;
        generateTile();
        updateBoard();
        saveState();
        checkGameOver();
    }
    
    isSwiping = false;
});

/* ====== SLIDE LOGIC ====== */
function slide(row) {
    row = row.filter(v => v !== 0);

    for (let i = 0; i < row.length - 1; i++) {
        if (row[i] === row[i + 1]) {
            row[i] *= 2;
            score += row[i];
            row[i + 1] = 0;
            playSound('merge');
        }
    }

    row = row.filter(v => v !== 0);
    while (row.length < gridSize) row.push(0);

    return row;
}

/* ====== MOVE FUNCTIONS ====== */
function moveLeft(test = false) {
    let moved = false;
    for (let r = 0; r < gridSize; r++) {
        let original = board[r].slice();
        let newRow = slide(board[r]);
        board[r] = newRow;
        if (JSON.stringify(original) !== JSON.stringify(newRow)) moved = true;
    }
    return moved;
}

function moveRight(test = false) {
    let moved = false;
    for (let r = 0; r < gridSize; r++) {
        let original = board[r].slice();
        let reversed = board[r].slice().reverse();
        let newRow = slide(reversed).reverse();
        board[r] = newRow;
        if (JSON.stringify(original) !== JSON.stringify(newRow)) moved = true;
    }
    return moved;
}

function moveUp(test = false) {
    let moved = false;
    for (let c = 0; c < gridSize; c++) {
        let col = [];
        for (let r = 0; r < gridSize; r++) {
            col.push(board[r][c]);
        }
        let original = col.slice();
        let newCol = slide(col);
        for (let r = 0; r < gridSize; r++) board[r][c] = newCol[r];
        if (JSON.stringify(original) !== JSON.stringify(newCol)) moved = true;
    }
    return moved;
}

function moveDown(test = false) {
    let moved = false;
    for (let c = 0; c < gridSize; c++) {
        let col = [];
        for (let r = 0; r < gridSize; r++) {
            col.push(board[r][c]);
        }
        let original = col.slice();
        let reversed = col.reverse();
        let newCol = slide(reversed).reverse();
        for (let r = 0; r < gridSize; r++) board[r][c] = newCol[r];
        if (JSON.stringify(original) !== JSON.stringify(newCol)) moved = true;
    }
    return moved;
}

/* ====== GAME OVER ====== */
function checkGameOver() {
    for (let r = 0; r < gridSize; r++) {
        for (let c = 0; c < gridSize; c++) {
            if (board[r][c] === 0) return;
            if (c < gridSize - 1 && board[r][c] === board[r][c + 1]) return;
            if (r < gridSize - 1 && board[r][c] === board[r + 1][c]) return;
        }
    }

    endGame(false);
}

function endGame(won) {
    gameStarted = false;
    stopTimer();
    
    stats.totalGames++;
    if (won) stats.wins++;
    saveStats();
    
    // Add to leaderboard
    if (score > 0) {
        addToLeaderboard(score);
    }
    
    document.getElementById("message-text").innerText = won ? "🎉 Bạn thắng!" : "Game Over!";
    document.getElementById("message").classList.remove("hidden");
}

/* ====== WIN MESSAGE ====== */
function showWinMessage(tile) {
    document.getElementById('win-tile').innerText = tile;
    document.getElementById('win-message').classList.remove('hidden');
    playSound('win');
}

function hideWinMessage() {
    document.getElementById('win-message').classList.add('hidden');
}

/* ====== STATISTICS ====== */
function saveStats() {
    localStorage.setItem('stats2048', JSON.stringify(stats));
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
    const name = `Player ${leaderboard.length + 1}`;
    leaderboard.push({ name, score, date: new Date().toISOString() });
    leaderboard.sort((a, b) => b.score - a.score);
    leaderboard = leaderboard.slice(0, 10);
    localStorage.setItem('leaderboard2048', JSON.stringify(leaderboard));
    updateLeaderboard();
}

function updateLeaderboard() {
    const container = document.getElementById('leaderboard');
    container.innerHTML = '';
    
    if (leaderboard.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-color); opacity: 0.6;">Chưa có dữ liệu</p>';
        return;
    }
    
    leaderboard.forEach((entry, index) => {
        const item = document.createElement('div');
        item.className = 'leaderboard-item';
        item.innerHTML = `
            <span class="leaderboard-rank">${index < 3 ? ['🥇', '🥈', '🥉'][index] : index + 1}</span>
            <span class="leaderboard-name">${entry.name}</span>
            <span class="leaderboard-score">${entry.score}</span>
        `;
        container.appendChild(item);
    });
}

/* ====== MENU FUNCTIONALITY ====== */
const menuOverlay = document.getElementById('game-menu');
const menuToggle = document.getElementById('menu-toggle');
const gridSizeBtns = document.querySelectorAll('.grid-size-btn');

function showMenu() {
    menuOverlay.classList.remove('hidden');
    updateStats();
    updateLeaderboard();
}

function hideMenu() {
    menuOverlay.classList.add('hidden');
}

menuToggle.addEventListener('click', showMenu);

menuOverlay.addEventListener('click', (e) => {
    if (e.target === menuOverlay) {
        hideMenu();
        if (!gameStarted) {
            startGame();
        }
    }
});

gridSizeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        gridSizeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        gridSize = parseInt(btn.dataset.size);
        
        startGame();
        hideMenu();
    });
});