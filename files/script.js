// ===============================================================
// PHANTOM STRIKE: TIC-TAC-TOE
//
// How the game works, in short:
//   1. The mode overlay asks for a board size and a mode (PVE or PVP).
//   2. startGame() sets up the rules for that board size and builds the board.
//   3. Each click calls tapCell(). In PVE, the AI then moves with aiPick().
//   4. After every move, checkWinner() looks for a winning line or a draw.
//   5. A match is several rounds. The first player to win `matchPoints`
//      rounds wins the match and the result overlay is shown.
//
// Players: Joker is always 'X' and moves first. Player 2 (the AI or a
// second human) is always 'O'.
//
// The board is stored as a flat array. On a 3x3 board the indexes are:
//     0 | 1 | 2
//     3 | 4 | 5
//     6 | 7 | 8
// so the cell at row r, column c is at index r * boardSize + c.
// ===============================================================

// ── DOM REFS ───────────────────────────────────────────────────
// Grab every page element we update, once, so we don't search for them repeatedly.
// The right-hand panel was built for Mona, which is why its elements are
// named "mona..." even when Futaba or Player 2 is using it.
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

// ── SOUND ──────────────────────────────────────────────────────
// Sound effects are synthesized with Web Audio, so no files are needed.
const sfxBtn = document.querySelector('#sfx-btn');

// Read/save the on/off setting in the browser so it is remembered next visit.
// Wrapped in try/catch because storage can be blocked (e.g. private browsing).
function loadPref(key) {
    try { return localStorage.getItem(key) !== 'off'; } catch { return true; }
}
function savePref(key, on) {
    try { localStorage.setItem(key, on ? 'on' : 'off'); } catch {}
}

let sfxOn    = loadPref('sfx');
let audioCtx = null;   // created on the first sound, because browsers only allow audio after a click

function updateSfxButton() {
    sfxBtn.textContent = `SFX: ${sfxOn ? 'On' : 'Off'}`;
}

function toggleSfx() {
    sfxOn = !sfxOn;
    savePref('sfx', sfxOn);
    updateSfxButton();
}

// Play one short note.
//   freq:  pitch in Hz (higher number = higher note)
//   start: delay in seconds before the note starts
//   dur:   how long the note lasts, in seconds
//   type:  waveform, which changes the character of the sound
//          ('square' = retro/buzzy, 'triangle' = soft, 'sawtooth' = harsh)
//   vol:   starting volume (0 to 1); it fades out to silence over `dur`
function tone(freq, start, dur, type = 'square', vol = 0.12) {
    const t   = audioCtx.currentTime + start;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + dur);
}

// Each sound effect is one or more notes.
// win/lose play four notes in a row: rising sounds happy, falling sounds sad.
const SFX = {
    x:    () => tone(660, 0, 0.12, 'square', 0.08),
    o:    () => tone(440, 0, 0.14, 'triangle', 0.15),
    win:  () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.1, 0.25)),
    lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, i * 0.14, 0.3, 'sawtooth', 0.08)),
    draw: () => [330, 330].forEach((f, i) => tone(f, i * 0.18, 0.15, 'triangle', 0.15)),
};

// Play a sound effect by name, e.g. playSfx('win'). Does nothing when SFX is off.
function playSfx(name) {
    if (!sfxOn) return;
    try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        SFX[name]();
    } catch {}
}

updateSfxButton();

// ── OPPONENTS ──────────────────────────────────────────────────
// The AI characters you can play against in PVE. Both use the same AI;
// only the name, text and look are different.
//   taunts:   random line shown each time the AI moves
//   winTaunt: line shown when the AI wins a round
//   winFlash: big text flashed when the AI wins a 1-round match
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
// Rules for each board size:
//   winLength:   how many in a row win a round
//   matchPoints: how many rounds you must win to win the match
const CONFIG = {
    3:  { winLength: 3, matchPoints: 1 },
    6:  { winLength: 5, matchPoints: 3 },
    10: { winLength: 5, matchPoints: 5 },
};

// ── STATE ──────────────────────────────────────────────────────
// Everything that changes while the game is running.
let mode         = 'PVE';    // 'PVE' (vs AI) | 'PVP' (two humans)
let opponent     = 'mona';   // 'mona' | 'futaba'
let boardSize    = 3;        // 3, 6 or 10
let winLength    = 3;        // copied from CONFIG when a game starts
let matchPoints  = 1;        // copied from CONFIG when a game starts

let player       = 'X';      // whose turn it is: 'X' (Joker) or 'O' (Player 2)
let isPauseGame  = false;    // true while the AI is thinking or a round has ended, so clicks are ignored
let inputCells   = [];       // the board data: 'X', 'O' or '' (empty) for each cell
let cells        = [];       // the matching <div> elements on the page
let winConditions = [];      // every possible winning line, as lists of cell indexes

let p1RoundWins  = 0;        // rounds won in the current match
let p2RoundWins  = 0;
let p1MatchWins  = 0;        // matches won in total (the big number on each card)
let p2MatchWins  = 0;

// Lines shown in the taunt box when Joker wins a round
const jokerTaunts = [
    "Leave it to me.",
    "Looks like I win again.",
    "Phantom Thieves never lose.",
    "Too easy.",
    "Mission accomplished.",
];
// Lines shown when Player 2 wins a round in PVP
const p2PvpTaunts = [
    "My turn now!", "Watch and learn.",
    "You won't beat me.", "I'm just getting started.",
];

// ── MODE SELECT SCREEN ─────────────────────────────────────────
// The overlay has two steps: (1) pick size + mode, (2) pick an opponent (PVE only).
let pendingSize = 3;   // size chosen on the overlay; only applied when the game starts

// Called by the 3x3 / 6x6 / 10x10 buttons on the overlay

function selectSize(size) {
    pendingSize = size;
    document.querySelectorAll('.mode-size-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.mode-size-btn[onclick="selectSize(${size})"]`).classList.add('active');
    updateModeRules();
}

// Show the rules for the selected size under the buttons
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

// PVE clicked: switch the overlay to the "Choose Opponent" step
function goToOpponentPick() {
    modeCard.style.display = 'none';
    opponentCard.style.display = 'flex';
    const oppMonaImg = document.querySelector('#opp-mona-img');
    if (oppMonaImg) oppMonaImg.src = MONA_IMG_SRC;
}

// "Back" on the opponent step
function goBackToMode() {
    opponentCard.style.display = 'none';
    modeCard.style.display = 'flex';
}

// Start a new match. Called by the PVP button or by an opponent button.
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

    // Fade the overlay out, then hide it once the 250ms fade animation is done
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

// Change the right-hand panel's picture and colors to match the chosen opponent
function applyOpponentTheme(opp) {
    const monaArtWrap = document.querySelector('.mona-art-wrap');
    const monaCard    = document.querySelector('.mona-card');
    if (opp === 'futaba') {
        monaArtWrap.classList.add('futaba-theme');
        monaCard.classList.add('futaba-card');
        monaArtImg.src = 'character_pics/futaba_pic.png';
        monaArtImg.style.objectFit = 'contain';
        monaArtImg.style.objectPosition = '';
        monaArtImg.style.background = '#fff';
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
        monaArtImg.style.background = '#fff';
        monaArtImg.style.display = '';
    }
}

// Re-open the mode overlay (after a match ends, or when a size button is clicked in-game)
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
// Clicking a size above the board doesn't change it right away. It opens the
// mode overlay with that size pre-selected, so a fresh match can be started.
document.querySelectorAll('.size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        pendingSize = parseInt(btn.dataset.size);
        document.querySelectorAll('.mode-size-btn').forEach(b => b.classList.remove('active'));
        document.querySelector(`.mode-size-btn[onclick="selectSize(${pendingSize})"]`).classList.add('active');
        showModeSelect();
    });
});

// ── BUILD BOARD ────────────────────────────────────────────────
// Create the grid of cells on the page. Bigger boards get smaller cells and text
// so they still fit on screen.
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

    // Work out all winning lines once per board, so checking a win later is quick
    winConditions = buildWinConditions();
}

// ── WIN CONDITIONS ─────────────────────────────────────────────
// List every group of `winLength` cells in a straight line.
// Example on 3x3: [0,1,2] is the top row, [0,4,8] is a diagonal.
// On bigger boards a line is shorter than a row, so each row contains
// several lines, e.g. on 6x6 with 5 in a row: [0..4] and [1..5].
function buildWinConditions() {
    const n = boardSize, w = winLength;
    const conds = [];
    // Horizontal lines: start at column c and go right
    for (let r = 0; r < n; r++)
        for (let c = 0; c <= n - w; c++)
            conds.push(Array.from({length: w}, (_, k) => r * n + c + k));
    // Vertical lines: start at row r and go down
    for (let c = 0; c < n; c++)
        for (let r = 0; r <= n - w; r++)
            conds.push(Array.from({length: w}, (_, k) => (r + k) * n + c));
    // Diagonal lines going down-right (\)
    for (let r = 0; r <= n - w; r++)
        for (let c = 0; c <= n - w; c++)
            conds.push(Array.from({length: w}, (_, k) => (r + k) * n + c + k));
    // Diagonal lines going down-left (/)
    for (let r = 0; r <= n - w; r++)
        for (let c = w - 1; c < n; c++)
            conds.push(Array.from({length: w}, (_, k) => (r + k) * n + c - k));
    return conds;
}

// ── ROUND FLOW ─────────────────────────────────────────────────
// Clear the board for a new round. Joker (X) always goes first.
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
// Runs when a human clicks a cell.
function tapCell(cell, index) {
    // Ignore clicks on filled cells, and while the AI is thinking or the round is over
    if (cell.textContent !== '' || isPauseGame) return;
    updateCell(cell, index);
    if (checkWinner()) return;
    changePlayer();
    setTurnIndicator();
    // In PVE, after Joker moves it's the AI's turn
    if (mode === 'PVE' && player === 'O') aiPick();
}

// Put the current player's mark in a cell (used by both humans and the AI)

function updateCell(cell, index) {
    cell.textContent = player;
    inputCells[index] = player;
    playSfx(player === 'X' ? 'x' : 'o');
    cell.classList.add(player === 'X' ? 'x-cell' : 'o-cell');
    // 'placed' triggers a short pop animation; remove it afterwards so it can play again
    cell.classList.add('placed');
    setTimeout(() => cell.classList.remove('placed'), 300);
}

function changePlayer() { player = player === 'X' ? 'O' : 'X'; }

// Update the title, status text and the dot showing whose turn it is
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
// The AI's turn: show "thinking", wait a moment so it feels natural, then move.
function aiPick() {
    isPauseGame = true;   // block clicks while the AI thinks
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

// Decide where the AI plays, in this order of priority:
//   1. If the AI can win right now, do it.
//   2. If Joker is one move from winning, block that cell.
//   3. On 3x3, take the center if it's free (the strongest square).
//   4. Otherwise pick the best cell by score (see scoredPick).
// A line is "one move from winning" when it has winLength - 1 of the same
// mark and exactly one empty cell.
function findBestMove() {
    // 1. Win
    for (const line of winConditions) {
        const empty = line.filter(i => inputCells[i] === '');
        if (line.filter(i => inputCells[i] === 'O').length === winLength - 1 && empty.length === 1) return empty[0];
    }
    // 2. Block
    for (const line of winConditions) {
        const empty = line.filter(i => inputCells[i] === '');
        if (line.filter(i => inputCells[i] === 'X').length === winLength - 1 && empty.length === 1) return empty[0];
    }
    // 3. Center (index 4 is the middle of a 3x3 board)
    if (boardSize === 3 && inputCells[4] === '') return 4;
    // 4. Best score
    return scoredPick();
}

// Give every empty cell a score and return the highest-scoring one.
// For each winning line that is still possible for someone:
//   - a line with only O's helps the AI build toward a win
//   - a line with only X's is a threat worth blocking early
//   - an empty line is a small bonus
// More marks in a line = much bigger score (10, 100, 1000...).
// Attacking is weighted a bit higher than blocking (the 0.8).
// Lines that contain both X and O can't be won by anyone, so they're skipped.
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
    // Small bonus for cells near the center, which take part in more lines
    const center = Math.floor(n / 2);
    for (let r = 0; r < n; r++)
        for (let c = 0; c < n; c++)
            scores[r * n + c] += Math.max(0, n - Math.abs(r - center) - Math.abs(c - center)) * 0.5;
    // Keep only empty cells, then pick randomly among the ones tied for the top score
    const empties = scores.map((s, i) => ({s, i})).filter(x => inputCells[x.i] === '');
    if (!empties.length) return 0;
    const max = Math.max(...empties.map(x => x.s));
    const best = empties.filter(x => x.s === max);
    return best[Math.floor(Math.random() * best.length)].i;
}

// ── WIN / DRAW CHECK ───────────────────────────────────────────
// Check the board after a move. Returns true if the round is over.
// Only the player who just moved can have won, so we only check their mark.
function checkWinner() {
    for (const line of winConditions) {
        if (line.every(i => inputCells[i] === player)) {
            handleRoundWin(line);
            return true;
        }
    }
    // Board full with no winner = draw
    if (inputCells.every(c => c !== '')) { handleDraw(); return true; }
    return false;
}

// Someone completed a line: highlight it, update scores, then either end the
// match or show the "next round" button.
function handleRoundWin(line) {
    isPauseGame = true;
    // Highlight the winning cells
    line.forEach(i => cells[i].classList.add('winner-cell'));
    const isP1 = player === 'X';
    const opp  = OPPONENTS[opponent];
    const p2Name = mode === 'PVP' ? 'Player 2' : opp.name;

    // In PVP either player winning is a "win"; in PVE losing to the AI plays the lose sound
    playSfx(isP1 || mode === 'PVP' ? 'win' : 'lose');

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

    // Wait for the win animation (1.6s) before showing what happens next
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

// Board filled with no winner: nobody gets a point, offer a new round
function handleDraw() {
    isPauseGame = true;
    titleHeader.textContent   = 'Draw!';
    missionStatus.textContent = 'Standoff';
    tauntText.textContent     = "We're evenly matched!";
    showWinFlash('DRAW!');
    playSfx('draw');
    setTimeout(() => { restartBtn.classList.add('visible'); }, 1600);
}

// Someone reached matchPoints: add to their total wins and show the result overlay
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
// Draw the small circles ("pips") beside "MATCH": one per round needed to win,
// filled in for each round a player has won.
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

// Show the big text in the middle of the screen for 1.4 seconds
function showWinFlash(text) {
    winMessage.textContent = text;
    winMessage.classList.add('show');
    setTimeout(() => winMessage.classList.remove('show'), 1400);
}

// "Restart Mission" button: start the next round of the same match
restartBtn.addEventListener('click', () => { buildBoard(); startRound(); });

// "Reset Score" button in the header: zero every score and start over
function resetScore() {
    p1MatchWins = p2MatchWins = p1RoundWins = p2RoundWins = 0;
    jokerWinsEl.textContent = monaWinsEl.textContent = 0;
    buildBoard(); startRound();
}

// ── INIT ───────────────────────────────────────────────────────
// Runs once when the page loads: show the mode overlay and an empty board behind it.
updateModeRules();
modeOverlay.style.display = 'flex';
setTimeout(() => modeOverlay.classList.add('show'), 10);
jokerIndicator.classList.remove('hidden');
buildBoard();
