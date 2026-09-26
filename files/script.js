// ── DOM REFS ───────────────────────────────────────────────────
const boardEl        = document.querySelector('#board');
const titleHeader    = document.querySelector('#titleHeader');
const restartBtn     = document.querySelector('#restartBtn');
const thinkingEl     = document.querySelector('#thinking-indicator');
const missionStatus  = document.querySelector('#mission-status');
const tauntText      = document.querySelector('#taunt-text');
const jokerWinsEl    = document.querySelector('#joker-wins');
const monaWinsEl     = document.querySelector('#mona-wins');
const jokerIndicator = document.querySelector('#joker-indicator');
const monaIndicator  = document.querySelector('#mona-indicator');
const winMessage     = document.querySelector('#win-message');
const modeOverlay    = document.querySelector('#mode-overlay');
const modeCard       = document.querySelector('#mode-card');
const opponentCard   = document.querySelector('#opponent-card');
const matchOverlay   = document.querySelector('#match-overlay');
const matchResultLbl = document.querySelector('#match-result-label');
const matchWinnerNm  = document.querySelector('#match-winner-name');
const p2NameEl       = document.querySelector('#p2-name');
const p2RoleLbl      = document.querySelector('#p2-role-label');
const matchScoreP1   = document.querySelector('#match-score-p1');
const matchScoreP2   = document.querySelector('#match-score-p2');
const modeRulesText  = document.querySelector('#mode-rules-text');
const monaArtImg     = document.querySelector('.mona-art-wrap img');
const MONA_IMG_SRC   = monaArtImg.src; // original Mona art, saved before any opponent swap

// ── OPPONENTS ──────────────────────────────────────────────────
const OPPONENTS = {
    mona: {
        name: 'Mona',
        role: 'Phantom Cat',
        cardClass: 'opp-mona-theme',
        taunts: [
            "I won't go easy on you!",
            "We'll steal your victory!",
            "Don't underestimate me!",
            "Is that the best you got?",
            "Joker, you're mine!",
            "My turn to shine!",
        ],
        winTaunt: 'I stole your victory!',
        winFlash: 'MONA\nWINS!',
    },
    futaba: {
        name: 'Futaba',
        role: 'Oracle',
        cardClass: 'opp-futaba-theme',
        taunts: [
            "Calculating optimal move...",
            "My algorithms never fail.",
            "I've already predicted this.",
            "Processing your defeat.",
            "Oracle sees all!",
            "You can't outsmart the data.",
        ],
        winTaunt: 'Analysis complete. I win.',
        winFlash: 'FUTABA\nWINS!',
    },
};

// ── CONFIG ─────────────────────────────────────────────────────
const CONFIG = {
    3:  { winLength: 3, matchPoints: 1 },
    6:  { winLength: 5, matchPoints: 3 },
    10: { winLength: 5, matchPoints: 5 },
};

// ── STATE ──────────────────────────────────────────────────────
let mode         = 'PVE';
let opponent     = 'mona';   // 'mona' | 'futaba'
let boardSize    = 3;
let winLength    = 3;
let matchPoints  = 1;

let player       = 'X';
let isPauseGame  = false;
let inputCells   = [];
let cells        = [];
let winConditions = [];

let p1RoundWins  = 0;
let p2RoundWins  = 0;
let p1MatchWins  = 0;
let p2MatchWins  = 0;

const jokerTaunts = [
    "Leave it to me.",
    "Looks like I win again.",
    "Phantom Thieves never lose.",
    "Too easy.",
    "Mission accomplished.",
];
const p2PvpTaunts = [
    "My turn now!", "Watch and learn.",
    "You won't beat me.", "I'm just getting started.",
];

// ── MODE SELECT SCREEN ─────────────────────────────────────────
let pendingSize = 3;

function selectSize(size) {
    pendingSize = size;
    document.querySelectorAll('.mode-size-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.mode-size-btn[onclick="selectSize(${size})"]`).classList.add('active');
    updateModeRules();
}

function updateModeRules() {
    const cfg = CONFIG[pendingSize];
    const roundRule = pendingSize === 3
        ? `Get ${cfg.winLength} in a row to win`
        : `Get ${cfg.winLength} in a row to win a round`;
    const matchRule = cfg.matchPoints === 1
        ? `First to win the round wins the match`
        : `First to win ${cfg.matchPoints} rounds wins the match`;
    modeRulesText.innerHTML = `<span>${roundRule}</span><span>${matchRule}</span>`;
}

function goToOpponentPick() {
    modeCard.style.display = 'none';
    opponentCard.style.display = 'flex';
    const oppMonaImg = document.querySelector('#opp-mona-img');
    if (oppMonaImg) oppMonaImg.src = MONA_IMG_SRC;
}

function goBackToMode() {
    opponentCard.style.display = 'none';
    modeCard.style.display = 'flex';
}

function startGame(selectedMode, selectedOpponent) {
    mode = selectedMode;
    boardSize = pendingSize;
    const cfg = CONFIG[boardSize];
    winLength   = cfg.winLength;
    matchPoints = cfg.matchPoints;

    if (mode === 'PVE') {
        opponent = selectedOpponent || 'mona';
        const opp = OPPONENTS[opponent];
        p2NameEl.textContent  = opp.name;
        p2RoleLbl.textContent = opp.role;
        // Swap right panel art & theme
        applyOpponentTheme(opponent);
    } else {
        p2NameEl.textContent  = 'Player 2';
        p2RoleLbl.textContent = 'Player 2';
    }

    // Sync in-game size buttons
    document.querySelectorAll('.size-btn').forEach(b => {
        b.classList.toggle('active', parseInt(b.dataset.size) === boardSize);
    });

    // Reset match
    p1RoundWins = p2RoundWins = p1MatchWins = p2MatchWins = 0;
    jokerWinsEl.textContent = monaWinsEl.textContent = 0;

    modeOverlay.classList.remove('show');
    setTimeout(() => {
        modeOverlay.style.display = 'none';
        // Reset overlay steps for next time
        modeCard.style.display = 'flex';
        opponentCard.style.display = 'none';
    }, 250);

    buildBoard();
    startRound();
}

function applyOpponentTheme(opp) {
    const monaArtWrap = document.querySelector('.mona-art-wrap');
    const monaCard    = document.querySelector('.mona-card');
    if (opp === 'futaba') {
        monaArtWrap.classList.add('futaba-theme');
        monaCard.classList.add('futaba-card');
        monaArtImg.src = 'character_pics/futaba.jpg';
        monaArtImg.style.objectFit = 'cover';
        monaArtImg.style.objectPosition = 'center 40%';
        monaArtImg.style.background = '#1a3a1a';
        monaArtImg.style.display = '';
        // Remove emoji fallback if present
        const futabaArt = monaArtWrap.querySelector('.futaba-art');
        if (futabaArt) futabaArt.style.display = 'none';
    } else {
        monaArtWrap.classList.remove('futaba-theme');
        monaCard.classList.remove('futaba-card');
        monaArtImg.src = MONA_IMG_SRC;
        monaArtImg.style.objectFit = 'contain';
        monaArtImg.style.objectPosition = '';
        monaArtImg.style.background = '#cc0010';
        monaArtImg.style.display = '';
    }
}

function showModeSelect() {
    matchOverlay.classList.remove('show');
    matchOverlay.style.display = 'none';
    modeCard.style.display = 'flex';
    opponentCard.style.display = 'none';
    modeOverlay.style.display  = 'flex';
    setTimeout(() => modeOverlay.classList.add('show'), 10);
    updateModeRules();
}

// ── IN-GAME SIZE BUTTONS ───────────────────────────────────────
document.querySelectorAll('.size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        pendingSize = parseInt(btn.dataset.size);
        document.querySelectorAll('.mode-size-btn').forEach(b => b.classList.remove('active'));
        document.querySelector(`.mode-size-btn[onclick="selectSize(${pendingSize})"]`).classList.add('active');
        showModeSelect();
    });
});

// ── BUILD BOARD ────────────────────────────────────────────────
function buildBoard() {
    const cellSize = boardSize === 3 ? 110 : boardSize === 6 ? 72 : 52;
    const gap      = boardSize === 3 ? 8 : 5;
    const fontSize = boardSize === 3 ? 64 : boardSize === 6 ? 38 : 26;
    const total    = boardSize * boardSize;

    boardEl.innerHTML = '';
    boardEl.style.gridTemplateColumns = `repeat(${boardSize}, ${cellSize}px)`;
    boardEl.style.gridTemplateRows    = `repeat(${boardSize}, ${cellSize}px)`;
    boardEl.style.gap = `${gap}px`;

    inputCells = new Array(total).fill('');
    cells = [];

    for (let i = 0; i < total; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.index = i;
        cell.style.fontSize = `${fontSize}px`;
        cell.addEventListener('click', () => tapCell(cell, i));
        boardEl.appendChild(cell);
        cells.push(cell);
    }

    winConditions = buildWinConditions();
}

// ── WIN CONDITIONS ─────────────────────────────────────────────
function buildWinConditions() {
    const n = boardSize, w = winLength;
    const conds = [];
    for (let r = 0; r < n; r++)
        for (let c = 0; c <= n - w; c++)
            conds.push(Array.from({length: w}, (_, k) => r * n + c + k));
    for (let c = 0; c < n; c++)
        for (let r = 0; r <= n - w; r++)
            conds.push(Array.from({length: w}, (_, k) => (r + k) * n + c));
    for (let r = 0; r <= n - w; r++)
        for (let c = 0; c <= n - w; c++)
            conds.push(Array.from({length: w}, (_, k) => (r + k) * n + c + k));
    for (let r = 0; r <= n - w; r++)
        for (let c = w - 1; c < n; c++)
            conds.push(Array.from({length: w}, (_, k) => (r + k) * n + c - k));
    return conds;
}

// ── ROUND FLOW ─────────────────────────────────────────────────
function startRound() {
    restartBtn.classList.remove('visible');
    inputCells.fill('');
    const fontSize = boardSize === 3 ? 64 : boardSize === 6 ? 38 : 26;
    cells.forEach(cell => {
        cell.textContent = '';
        cell.className   = 'cell';
        cell.style.fontSize = `${fontSize}px`;
    });
    isPauseGame = false;
    player = 'X';
    setTurnIndicator();
    updateMatchScoreBar();
    thinkingEl.style.display = mode === 'PVE' ? '' : 'none';
}

// ── CELL CLICK ─────────────────────────────────────────────────
function tapCell(cell, index) {
    if (cell.textContent !== '' || isPauseGame) return;
    updateCell(cell, index);
    if (checkWinner()) return;
    changePlayer();
    setTurnIndicator();
    if (mode === 'PVE' && player === 'O') aiPick();
}

function updateCell(cell, index) {
    cell.textContent = player;
    inputCells[index] = player;
    cell.classList.add(player === 'X' ? 'x-cell' : 'o-cell');
    cell.classList.add('placed');
    setTimeout(() => cell.classList.remove('placed'), 300);
}

function changePlayer() { player = player === 'X' ? 'O' : 'X'; }

function setTurnIndicator() {
    const opp = OPPONENTS[opponent];
    const p2Name = mode === 'PVP' ? 'Player 2' : opp.name;
    if (player === 'X') {
        jokerIndicator.classList.remove('hidden');
        monaIndicator.classList.add('hidden');
        titleHeader.textContent   = mode === 'PVP' ? "Joker's Turn" : 'Your Turn';
        missionStatus.textContent = 'Infiltrating';
    } else {
        monaIndicator.classList.remove('hidden');
        jokerIndicator.classList.add('hidden');
        titleHeader.textContent   = `${p2Name}'s Turn`;
        missionStatus.textContent = mode === 'PVP' ? 'Counterattack' : 'Holding Back';
    }
}

// ── AI ─────────────────────────────────────────────────────────
function aiPick() {
    isPauseGame = true;
    thinkingEl.classList.add('visible');
    const opp = OPPONENTS[opponent];
    tauntText.textContent = opp.taunts[Math.floor(Math.random() * opp.taunts.length)];
    const delay = boardSize === 3 ? 900 : boardSize === 6 ? 600 : 400;
    setTimeout(() => {
        thinkingEl.classList.remove('visible');
        const idx = findBestMove();
        updateCell(cells[idx], idx);
        if (!checkWinner()) {
            changePlayer();
            setTurnIndicator();
            isPauseGame = false;
        }
    }, delay);
}

function findBestMove() {
    for (const line of winConditions) {
        const empty = line.filter(i => inputCells[i] === '');
        if (line.filter(i => inputCells[i] === 'O').length === winLength - 1 && empty.length === 1) return empty[0];
    }
    for (const line of winConditions) {
        const empty = line.filter(i => inputCells[i] === '');
        if (line.filter(i => inputCells[i] === 'X').length === winLength - 1 && empty.length === 1) return empty[0];
    }
    if (boardSize === 3 && inputCells[4] === '') return 4;
    return scoredPick();
}

function scoredPick() {
    const n = boardSize;
    const scores = new Array(n * n).fill(0);
    for (const line of winConditions) {
        const oC = line.filter(i => inputCells[i] === 'O').length;
        const xC = line.filter(i => inputCells[i] === 'X').length;
        if (oC > 0 && xC > 0) continue;
        const bonus = oC > 0 ? Math.pow(10, oC) : xC > 0 ? Math.pow(10, xC) * 0.8 : 1;
        line.forEach(i => { if (inputCells[i] === '') scores[i] += bonus; });
    }
    const center = Math.floor(n / 2);
    for (let r = 0; r < n; r++)
        for (let c = 0; c < n; c++)
            scores[r * n + c] += Math.max(0, n - Math.abs(r - center) - Math.abs(c - center)) * 0.5;
    const empties = scores.map((s, i) => ({s, i})).filter(x => inputCells[x.i] === '');
    if (!empties.length) return 0;
    const max = Math.max(...empties.map(x => x.s));
    const best = empties.filter(x => x.s === max);
    return best[Math.floor(Math.random() * best.length)].i;
}

// ── WIN / DRAW CHECK ───────────────────────────────────────────
function checkWinner() {
    for (const line of winConditions) {
        if (line.every(i => inputCells[i] === player)) {
            handleRoundWin(line);
            return true;
        }
    }
    if (inputCells.every(c => c !== '')) { handleDraw(); return true; }
    return false;
}

function handleRoundWin(line) {
    isPauseGame = true;
    line.forEach(i => cells[i].classList.add('winner-cell'));
    const isP1 = player === 'X';
    const opp  = OPPONENTS[opponent];
    const p2Name = mode === 'PVP' ? 'Player 2' : opp.name;

    if (isP1) {
        p1RoundWins++;
        showWinFlash(matchPoints === 1 ? 'PHANTOM\nSTRIKE!' : 'ROUND\nJOKER!');
        tauntText.textContent = jokerTaunts[Math.floor(Math.random() * jokerTaunts.length)];
    } else {
        p2RoundWins++;
        const label = mode === 'PVP' ? 'P2' : opp.name.toUpperCase();
        showWinFlash(matchPoints === 1 ? opp.winFlash : `ROUND\n${label}!`);
        tauntText.textContent = mode === 'PVP'
            ? p2PvpTaunts[Math.floor(Math.random() * p2PvpTaunts.length)]
            : opp.winTaunt;
    }

    updateMatchScoreBar();

    setTimeout(() => {
        if (p1RoundWins >= matchPoints) {
            endMatch('X');
        } else if (p2RoundWins >= matchPoints) {
            endMatch('O');
        } else {
            titleHeader.textContent   = isP1 ? 'Joker wins round!' : `${p2Name} wins round!`;
            missionStatus.textContent = 'Next Round';
            restartBtn.classList.add('visible');
        }
    }, 1600);
}

function handleDraw() {
    isPauseGame = true;
    titleHeader.textContent   = 'Draw!';
    missionStatus.textContent = 'Standoff';
    tauntText.textContent     = "We're evenly matched!";
    showWinFlash('DRAW!');
    setTimeout(() => { restartBtn.classList.add('visible'); }, 1600);
}

function endMatch(winner) {
    const isP1 = winner === 'X';
    const opp  = OPPONENTS[opponent];
    const winnerName = isP1 ? 'Joker' : (mode === 'PVP' ? 'Player 2' : opp.name);
    if (isP1) { p1MatchWins++; jokerWinsEl.textContent = p1MatchWins; }
    else       { p2MatchWins++; monaWinsEl.textContent  = p2MatchWins; }
    matchResultLbl.textContent = isP1 ? 'MISSION COMPLETE' : 'MISSION FAILED';
    matchWinnerNm.textContent  = winnerName;
    matchOverlay.style.display = 'flex';
    setTimeout(() => matchOverlay.classList.add('show'), 10);
}

// ── MATCH SCORE BAR ────────────────────────────────────────────
function updateMatchScoreBar() {
    const pip = (count, total, cls) => {
        let html = '';
        for (let i = 0; i < total; i++)
            html += `<span class="score-pip ${i < count ? cls + ' filled' : ''}"></span>`;
        return html;
    };
    matchScoreP1.innerHTML = pip(p1RoundWins, matchPoints, 'pip-p1');
    matchScoreP2.innerHTML = pip(p2RoundWins, matchPoints, 'pip-p2');
}

function showWinFlash(text) {
    winMessage.textContent = text;
    winMessage.classList.add('show');
    setTimeout(() => winMessage.classList.remove('show'), 1400);
}

restartBtn.addEventListener('click', () => { buildBoard(); startRound(); });

function resetScore() {
    p1MatchWins = p2MatchWins = p1RoundWins = p2RoundWins = 0;
    jokerWinsEl.textContent = monaWinsEl.textContent = 0;
    buildBoard(); startRound();
}

// ── INIT ───────────────────────────────────────────────────────
updateModeRules();
modeOverlay.style.display = 'flex';
setTimeout(() => modeOverlay.classList.add('show'), 10);
jokerIndicator.classList.remove('hidden');
buildBoard();
