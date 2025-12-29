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
    const cellSize = Math.min(95, Math.floor(400 / gridSize));
    const gap = 10;
    
    boardDiv.style.gridTemplateColumns = `repeat(${gridSize}, ${cellSize}px)`;
    boardDiv.style.gridTemplateRows = `repeat(${gridSize}, ${cellSize}px)`;
    boardDiv.style.gap = `${gap}px`;
    boardDiv.style.padding = `${gap}px`;
    boardDiv.style.width = 'fit-content';
}

/* ====== RENDER BOARD ====== */
function updateBoard() {
    let boardDiv = document.getElementById("board");
    boardDiv.innerHTML = "";

    for (let r = 0; r < gridSize; r++) {
        for (let c = 0; c < gridSize; c++) {
            let tile = document.createElement("div");
            tile.classList.add("tile");

            let value = board[r][c];
            if (value > 0) {
                tile.innerText = value;
                tile.classList.add("tile-" + value);
                
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

            boardDiv.appendChild(tile);
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

document.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
});

document.addEventListener('touchend', (e) => {
    if (!gameStarted) return;
    
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    
    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;
    
    const minSwipe = 50;
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