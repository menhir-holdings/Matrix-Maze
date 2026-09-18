import { createBackend } from './backend.js';
import { LEVEL_COLORS } from './constants.js';
import { AdaptiveMusic } from './music.js';
import { bindArcadePlate } from './arcade-plate.js';
import { addMovingSeconds, currentHandle, formatMoving, loadPlayer, setHandle } from '../../account.js';
import {
    bindFilterChips,
    currentFilter,
    fetchScores,
    finishPayloadFromState,
    formatClock,
    loadDisplayName,
    profileFromScores,
    recordLevel,
    renderBoardList,
    reviewFinishPayload,
    submitScore,
    wantsReviewSkip,
} from './scores.js';

const loadBoardName = loadDisplayName;

// Initialize colors from constants - sets CSS variables
function updateColorRgbValues() {
    const root = document.documentElement;
    
    // Set HSL color variables from centralized constants
    // Store both full HSL and individual components for flexibility
    LEVEL_COLORS.forEach(({ hsl, name }) => {
        // Full HSL color for direct use (color, border-color, etc.)
        root.style.setProperty(`--${name}-color`, `hsl(${hsl[0]}, ${hsl[1]}%, ${hsl[2]}%)`);
        // Individual HSL components for use in hsla() with alpha (box-shadow, text-shadow, etc.)
        root.style.setProperty(`--${name}-h`, hsl[0]);
        root.style.setProperty(`--${name}-s`, `${hsl[1]}%`);
        root.style.setProperty(`--${name}-l`, `${hsl[2]}%`);
    });
}

let backend = null;
let gameState = null;
let keys = {
    w: false,
    s: false,
    a: false,
    d: false,
    q: false,
    e: false,
};

let mouseDeltaX = 0.0;
let lastFrameTime = null;

// Play/pause coordination for the embedded browser landing (the fullscreen shell in the repo
// root index.html). Only active when the game runs inside an iframe on the web build; the
// desktop app and the standalone /play page run unpaused as before.
let shellControlled = false;
let paused = false;
let hasStarted = false; // whether the player has ever hit PLAY (drives PLAY vs RESUME label)
let pausedAt = null; // wall-clock seconds when the current pause began (for timer compensation)

let viewport = null;
let levelIndicator = null;
let controls = null;
let viewportWidth = 120;
let viewportHeight = 40;
const music = new AdaptiveMusic();
let hasWonScreen = false;
let advancingLevel = false;
let finishNotified = false;
let recordedWinKey = null;
let arcade = null;
let movingFlush = 0;

function winKey(stateObj) {
    if (!stateObj?.has_won) return null;
    return `${stateObj.current_level}:${stateObj.level_completion_time ?? ''}:${stateObj.total_time ?? ''}`;
}

function recordWinScores(stateObj) {
    const key = winKey(stateObj);
    if (!key || key === recordedWinKey) return;
    recordedWinKey = key;
    const time = stateObj.level_completion_time;
    if (typeof time === 'number') {
        recordLevel({
            name: loadDisplayName() || 'RUNNER',
            level: stateObj.current_level,
            time,
        });
    }
}

function notifyFinish(stateObj) {
    if (!stateObj?.has_won || stateObj.current_level !== 8 || finishNotified) return;
    finishNotified = true;
    const payload = finishPayloadFromState(stateObj);
    if (shellControlled) {
        try {
            window.parent.postMessage(
                { source: 'mm-game', type: 'run-complete', run: payload, ...payload },
                window.location.origin
            );
        } catch (err) {
            console.warn('finish post failed:', err);
        }
        pauseToShell();
        return;
    }
    arcade?.showFinish(payload);
}

function bindStandaloneFinish(root, { onPlayAgain } = {}) {
    if (!root) return null;
    const timeEl = root.querySelector('#finish-time');
    const form = root.querySelector('#name-form');
    const nameInput = root.querySelector('#display-name');
    const nameSubmit = root.querySelector('#name-submit');
    const noteEl = root.querySelector('#plate-note');
    const errEl = root.querySelector('#plate-error');
    const wrap = root.querySelector('#board-wrap');
    const list = root.querySelector('#board-list');
    const filter = root.querySelector('#board-filter');
    const again = root.querySelector('#play-again');
    const boardHandle = root.querySelector('#board-handle');
    const boardEditHandle = root.querySelector('#board-edit-handle');
    const boardYou = root.querySelector('#board-you');
    const profileWrap = root.querySelector('#profile-wrap');
    const profileBack = root.querySelector('#profile-back');
    const profileName = root.querySelector('#profile-name');
    const profileOverall = root.querySelector('#profile-overall');
    const profileMoving = root.querySelector('#profile-moving');
    const profileLevels = root.querySelector('#profile-levels');
    let pending = null;
    let rows = [];
    let highlightId = null;

    function paint() {
        renderBoardList(list, rows, {
            filter: currentFilter(filter),
            highlightId,
            onName: showProfile,
        });
    }

    function paintYou() {
        const handle = currentHandle() || loadBoardName();
        if (boardHandle) boardHandle.textContent = handle || '—';
        if (boardYou) boardYou.hidden = !handle;
        if (nameInput && !nameInput.matches(':focus')) nameInput.value = handle;
    }

    function showProfile(row) {
        const me = loadPlayer();
        const movingSeconds =
            me && (me.id === row.playerId || sanitizeStandalone(me.name) === sanitizeStandalone(row.name))
                ? me.movingSeconds
                : row.movingSeconds;
        const profile = profileFromScores(rows, {
            playerId: row.playerId,
            name: row.name,
            movingSeconds,
        });
        if (profileName) profileName.textContent = profile.name;
        if (profileOverall) {
            profileOverall.textContent = profile.bestRun
                ? `Full run ${formatClock(profile.bestRun.total)} · #${profile.overallRank} of ${profile.overallOf}`
                : 'No full-run time yet.';
        }
        if (profileMoving) {
            profileMoving.textContent = `Moving time ${formatMoving(profile.movingSeconds)}`;
        }
        if (profileLevels) {
            profileLevels.replaceChildren();
            profile.levels.forEach((entry) => {
                const li = document.createElement('li');
                const lvl = document.createElement('span');
                lvl.textContent = `L${entry.level}`;
                const time = document.createElement('span');
                time.textContent = formatClock(entry.time);
                const rank = document.createElement('span');
                rank.textContent = entry.rank ? `#${entry.rank} of ${entry.of}` : '—';
                li.append(lvl, time, rank);
                profileLevels.appendChild(li);
            });
        }
        if (form) form.hidden = true;
        if (wrap) wrap.hidden = true;
        if (profileWrap) profileWrap.hidden = false;
    }

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (errEl) errEl.textContent = '';
        if (!pending) {
            setHandle(nameInput?.value);
            paintYou();
            if (form) form.hidden = true;
            if (wrap) wrap.hidden = false;
            return;
        }
        try {
            const player = setHandle(nameInput?.value);
            if (!player?.name) {
                if (errEl) errEl.textContent = 'Set a handle to post the time.';
                nameInput?.focus();
                return;
            }
            const result = await submitScore({
                name: player.name,
                playerId: player.id,
                total: pending.total,
                levels: pending.levels,
                movingSeconds: player.movingSeconds,
            });
            rows = result.scores || [];
            highlightId = result.score?.id || null;
            if (form) form.hidden = true;
            if (wrap) wrap.hidden = false;
            if (profileWrap) profileWrap.hidden = true;
            paint();
            paintYou();
        } catch (err) {
            if (errEl) errEl.textContent = err.message;
        }
    });
    bindFilterChips(filter, () => paint());
    profileBack?.addEventListener('click', () => {
        if (profileWrap) profileWrap.hidden = true;
        if (wrap) wrap.hidden = false;
    });
    boardEditHandle?.addEventListener('click', () => {
        if (form) form.hidden = false;
        if (nameSubmit) nameSubmit.textContent = pending ? 'Submit time' : 'Save handle';
        nameInput?.focus();
        nameInput?.select();
    });
    again?.addEventListener('click', () => onPlayAgain?.());

    return {
        async showFinish(payload) {
            pending = payload;
            highlightId = null;
            root.hidden = false;
            if (form) form.hidden = false;
            if (wrap) wrap.hidden = true;
            if (profileWrap) profileWrap.hidden = true;
            if (timeEl) timeEl.textContent = formatClock(payload?.total);
            if (nameSubmit) nameSubmit.textContent = 'Submit time';
            if (nameInput) nameInput.value = currentHandle() || loadBoardName();
            if (errEl) errEl.textContent = '';
            if (noteEl) {
                noteEl.hidden = !payload?.reviewSkip;
                noteEl.textContent = payload?.reviewSkip
                    ? 'Review skip — last-run or dummy times.'
                    : '';
            }
            paintYou();
            try {
                const data = await fetchScores();
                rows = data.scores;
            } catch {
                rows = [];
            }
            window.setTimeout(() => {
                nameInput?.focus();
                nameInput?.select();
            }, 30);
        },
        hide() {
            root.hidden = true;
        },
        render: paint,
    };
}

function sanitizeStandalone(name) {
    return String(name || '').trim().toLowerCase();
}

async function replayIfWon() {
    if (advancingLevel) return false;
    if (!hasWonScreen) return false;
    const stateObj = parseGameState();
    if (!stateObj) return false;

    advancingLevel = true;
    try {
        gameState = await backend.replayLevel(gameState);
        hasWonScreen = false;
        recordedWinKey = null;
        finishNotified = false;
        arcade?.hide();
        if (viewport) viewport.focus();
        return true;
    } finally {
        advancingLevel = false;
    }
}

async function playAgainFromPlate() {
    if (advancingLevel) return;
    advancingLevel = true;
    try {
        gameState = await backend.initGame();
        hasWonScreen = false;
        recordedWinKey = null;
        finishNotified = false;
        arcade?.hide();
        lastFrameTime = performance.now() / 1000.0;
        if (viewport) viewport.focus();
    } finally {
        advancingLevel = false;
    }
}

function parseGameState() {
    if (!gameState) return null;
    try {
        return JSON.parse(gameState);
    } catch {
        return null;
    }
}

async function advanceIfWon() {
    if (advancingLevel) return false;
    if (!hasWonScreen) return false;

    const stateObj = parseGameState();
    if (stateObj?.current_level === 8) {
        notifyFinish(stateObj);
        return false;
    }

    advancingLevel = true;
    try {
        gameState = await backend.nextLevel(gameState);
        hasWonScreen = false;
        recordedWinKey = null;
        if (viewport) viewport.focus();
        return true;
    } finally {
        advancingLevel = false;
    }
}

function finishPlateOpen() {
    const plate = document.getElementById('finish-plate');
    return Boolean(plate && !plate.hidden);
}

function shouldHoldViewportFocus() {
    return !paused && !finishPlateOpen();
}

function syncWinScreenFlag(stateObj) {
    hasWonScreen = Boolean(stateObj?.has_won);
    if (!shouldHoldViewportFocus()) return;
    if (hasWonScreen && viewport && document.activeElement !== viewport) {
        viewport.focus();
    }
}

// Initialize game
async function init() {
    // Initialize color system
    updateColorRgbValues();
    
    viewport = document.getElementById('viewport');
    levelIndicator = document.getElementById('level-indicator');
    controls = document.getElementById('controls');
    if (!viewport) {
        console.error('Viewport element not found');
        return;
    }
    
    // Make viewport focusable for keyboard input
    viewport.setAttribute('tabindex', '0');
    viewport.focus();

    // Wire up on-screen touch controls for mobile web
    setupTouchControls();

    const finishRoot = document.getElementById('finish-plate');
    const arcadeRoot = document.getElementById('arcade-plate');
    if (finishRoot) {
        arcade = bindStandaloneFinish(finishRoot, { onPlayAgain: playAgainFromPlate });
    } else if (arcadeRoot) {
        arcade = bindArcadePlate(arcadeRoot, { onPlayAgain: playAgainFromPlate });
    }
    
    // Set up FPS-style mouse look using Pointer Lock API
    viewport.addEventListener('click', async () => {
        // Ensure viewport has focus when clicked
        viewport.focus();
        await music.startIfNeeded();

        // On the win screen a tap advances to the next level / restarts. This is the touch
        // equivalent of pressing SPACE, so mobile players (who have no keyboard) can progress.
        if (await advanceIfWon()) {
            return;
        }

        try {
            await viewport.requestPointerLock();
        } catch (err) {
            console.warn('Pointer lock failed:', err);
        }
    });
    
    // Ensure viewport regains focus if it loses it (especially important on win screen)
    viewport.addEventListener('blur', () => {
        if (!shouldHoldViewportFocus()) return;
        setTimeout(() => {
            if (!shouldHoldViewportFocus()) return;
            if (viewport && document.activeElement === document.body) {
                try {
                    if (gameState) {
                        const gameStateObj = JSON.parse(gameState);
                        if (gameStateObj && gameStateObj.has_won) {
                            viewport.focus();
                        }
                    }
                } catch (e) {
                    // Ignore parse errors
                }
            }
        }, 100);
    });
    
    // Track mouse movement when pointer is locked
    document.addEventListener('mousemove', (e) => {
        if (document.pointerLockElement === viewport) {
            // movementX gives relative movement when pointer is locked.
            // Sensitivity boosted 6x (was / 100.0) for faster turning on the web build.
            mouseDeltaX = (e.movementX / 100.0) * 6.0;
        }
    });
    
    // Handle pointer lock change events
    document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement !== viewport) {
            // Pointer was unlocked, reset mouse delta
            mouseDeltaX = 0.0;
            // Exiting pointer lock (e.g. Escape, which the browser consumes) pauses the
            // embedded landing so the sidebar/PLAY overlay returns.
            if (shellControlled && !paused) {
                pauseToShell();
            }
        }
    });
    
    try {
        // Select the host backend (Tauri invoke on desktop, WASM in the browser).
        backend = await createBackend();

        // When embedded in the web landing shell, start paused behind a PLAY button. The
        // shell (repo root index.html) shows its sidebar until the player starts.
        shellControlled = !backend.isDesktop && window.self !== window.top;
        if (shellControlled) {
            paused = true;
            pausedAt = performance.now() / 1000.0;
            window.addEventListener('message', handleShellMessage);
        } else if (wantsReviewSkip()) {
            arcade?.showFinish(reviewFinishPayload());
        }

        const stateJson = await backend.initGame();
        gameState = stateJson;
        console.log('Game initialized, state:', stateJson.substring(0, 100));
        lastFrameTime = performance.now() / 1000.0; // Initialize frame time
        resizeViewport();
        if (shellControlled) {
            // Tell the shell we're ready and currently paused so it shows the sidebar/PLAY.
            postToShell('ready');
            postToShell('paused');
        }
        gameLoop();
    } catch (error) {
        console.error('Failed to initialize game:', error);
    }
}

// Wires the on-screen mobile buttons to the same `keys` flags the keyboard uses. Each button
// presses its key on pointerdown and releases it on pointerup/leave/cancel, so holding a button
// produces continuous movement and multiple buttons can be held at once (multi-touch).
function setupTouchControls() {
    const buttons = document.querySelectorAll('#touch-controls .touch-btn');
    buttons.forEach((btn) => {
        const key = btn.getAttribute('data-key');
        if (!key || !(key in keys)) return;

        const press = (e) => {
            e.preventDefault();
            // Starting the audio + game requires a user gesture; a control tap counts.
            if (paused && shellControlled) {
                startPlaying();
            }
            music.startIfNeeded();
            keys[key] = true;
            btn.classList.add('active');
        };
        const release = (e) => {
            if (e) e.preventDefault();
            keys[key] = false;
            btn.classList.remove('active');
        };

        btn.addEventListener('pointerdown', press);
        btn.addEventListener('pointerup', release);
        btn.addEventListener('pointerleave', release);
        btn.addEventListener('pointercancel', release);
        // Prevent the browser's synthetic mouse/scroll/context behaviors on touch.
        btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });
}

// --- Embedded-shell play/pause coordination (web landing only) ---

// Notifies the parent landing shell of a state change ('ready' | 'playing' | 'paused').
function postToShell(type, payload) {
    if (!shellControlled) return;
    try {
        window.parent.postMessage({ source: 'mm-game', type, payload }, window.location.origin);
    } catch (err) {
        console.warn('postToShell failed:', err);
    }
}

// Handles messages from the shell (currently just the PLAY/RESUME action).
function handleShellMessage(e) {
    const data = e.data;
    if (!data || data.source !== 'mm-shell') return;
    if (data.type === 'play') {
        startPlaying();
    } else if (data.type === 'chrome') {
        if (!paused) pauseToShell();
        if (document.pointerLockElement) document.exitPointerLock();
        if (viewport) viewport.blur();
    } else if (data.type === 'restart' || data.type === 'play-again') {
        playAgainFromPlate().then(() => {
            if (paused) startPlaying();
        });
    } else if (data.type === 'replay') {
        replayIfWon().then(() => {
            if (paused) startPlaying();
        });
    }
}

// Resumes play from a paused state. The first PLAY starts a fresh game; subsequent resumes
// continue the current one, shifting the level start time forward so paused time isn't counted.
async function startPlaying() {
    if (!paused) return;

    if (!hasStarted) {
        // First launch: begin a fresh game so its timer starts now, not at page load.
        gameState = await backend.initGame();
        hasStarted = true;
    } else if (pausedAt !== null) {
        gameState = shiftLevelStart(gameState, performance.now() / 1000.0 - pausedAt);
    }

    pausedAt = null;
    paused = false;
    lastFrameTime = performance.now() / 1000.0; // avoid a large delta on the first live frame
    const handle = currentHandle() || loadDisplayName();
    if (handle) setHandle(handle);
    await music.resume();
    if (viewport) viewport.focus();
    postToShell('playing');
}

// Pauses play and asks the shell to reveal its sidebar/PLAY overlay again.
async function pauseToShell() {
    if (paused) return;
    paused = true;
    pausedAt = performance.now() / 1000.0;
    if (movingFlush > 0) {
        addMovingSeconds(movingFlush);
        movingFlush = 0;
    }
    await music.suspend();
    if (document.pointerLockElement) {
        document.exitPointerLock();
    }
    postToShell('paused');
}

// Advances `level_start_time` by `deltaSeconds` so time spent paused doesn't count toward the
// level timer. Operates on the JSON state string the backend hands back.
function shiftLevelStart(stateJson, deltaSeconds) {
    try {
        const obj = JSON.parse(stateJson);
        if (typeof obj.level_start_time === 'number') {
            obj.level_start_time += deltaSeconds;
            return JSON.stringify(obj);
        }
    } catch (e) {
        // Leave state untouched on parse failure.
    }
    return stateJson;
}

function resizeViewport() {
    if (!viewport) return;
    
    const container = document.getElementById('app');
    if (!container) return;
    
    // Set font properties first to measure actual character size
    viewport.style.fontSize = '12px';
    viewport.style.lineHeight = '16px';
    viewport.style.fontFamily = "'Courier New', 'Monaco', 'Menlo', monospace";
    viewport.style.whiteSpace = 'pre';
    
    // Measure actual character width by creating a test element
    const testChar = document.createElement('span');
    testChar.style.position = 'absolute';
    testChar.style.visibility = 'hidden';
    testChar.style.fontSize = '12px';
    testChar.style.fontFamily = "'Courier New', 'Monaco', 'Menlo', monospace";
    testChar.style.whiteSpace = 'pre';
    testChar.textContent = 'M'; // Use 'M' as it's typically the widest character
    document.body.appendChild(testChar);
    const charWidth = testChar.offsetWidth;
    const charHeight = parseInt(getComputedStyle(testChar).lineHeight) || 16;
    document.body.removeChild(testChar);
    
    // Account for border (2px on each side = 4px) and padding (10px on each side = 20px)
    const borderPadding = 4 + 20; // 24px total
    const availableWidth = container.clientWidth - borderPadding - 40; // Extra 40 for margins
    const availableHeight = container.clientHeight - borderPadding - 24;
    
    viewportWidth = Math.floor(availableWidth / charWidth);
    viewportHeight = Math.floor(availableHeight / charHeight);
    
    // Ensure minimum size
    viewportWidth = Math.max(80, Math.min(viewportWidth, 200));
    viewportHeight = Math.max(30, Math.min(viewportHeight, 80));
    
    // Calculate content height
    const contentHeight = viewportHeight * charHeight;
    
    // Don't set width here - let displayFrame measure the actual rendered width
    // Just set height and max-width constraint
    const exactHeight = contentHeight + 20 + 4; // padding + border
    
    // Set max-width to container limit to prevent overflow
    const maxAllowedWidth = container.clientWidth - 40;
    viewport.style.maxWidth = `${maxAllowedWidth}px`;
    viewport.style.height = `${exactHeight}px`;
    viewport.style.overflow = 'visible'; // Ensure nothing is clipped
}

async function gameLoop() {
    if (!gameState) return;
    
    // Calculate delta time for frame-rate independent movement
    const currentTime = performance.now() / 1000.0; // Convert to seconds
    let deltaTime = 0.016; // Default to ~60fps if first frame
    if (lastFrameTime !== null) {
        deltaTime = currentTime - lastFrameTime;
    }
    lastFrameTime = currentTime;
    
    // Parse game state to check if won
    let gameStateObj = null;
    try {
        gameStateObj = JSON.parse(gameState);
    } catch (e) {
        // If parsing fails, continue with update
    }
    
    // Get input (only if not won)
    const input = {
        forward: gameStateObj?.has_won ? false : keys.w,
        backward: gameStateObj?.has_won ? false : keys.s,
        left: gameStateObj?.has_won ? false : keys.a,
        right: gameStateObj?.has_won ? false : keys.d,
        turn_left: gameStateObj?.has_won ? false : keys.q,
        turn_right: gameStateObj?.has_won ? false : keys.e,
        mouse_delta_x: gameStateObj?.has_won ? 0.0 : mouseDeltaX,
        delta_time: deltaTime,
    };

    const activelyMoving =
        !paused &&
        !gameStateObj?.has_won &&
        (keys.w || keys.a || keys.s || keys.d || keys.q || keys.e || Math.abs(mouseDeltaX) > 0.0001);
    if (activelyMoving) {
        movingFlush += Math.min(Math.max(deltaTime, 0), 0.05);
        if (movingFlush >= 1) {
            addMovingSeconds(movingFlush);
            movingFlush = 0;
        }
    }

    // Reset mouse delta after using it
    mouseDeltaX = 0.0;

    // Update game state
    try {
        const wasWonBeforeUpdate = Boolean(gameStateObj?.has_won);

        // While paused (embedded landing, pre-PLAY), keep rendering the current frame so the
        // shell shows a live teaser, but don't advance the simulation.
        if (!paused) {
            gameState = await backend.updateGame(gameState, input);
        }

        // Render frame (returns [frame, updatedState])
        const [frame, updatedState] = await backend.renderFrame(
            gameState,
            viewportWidth,
            viewportHeight,
        );

        // Update game state in case freeze frame was captured
        gameState = updatedState;

        const stateAfterUpdate = parseGameState();
        if (!wasWonBeforeUpdate && stateAfterUpdate?.has_won) {
            music.playLevelComplete(stateAfterUpdate.current_level || 1);
        }
        syncWinScreenFlag(stateAfterUpdate);
        if (stateAfterUpdate?.has_won) {
            recordWinScores(stateAfterUpdate);
            if (stateAfterUpdate.current_level === 8) {
                notifyFinish(stateAfterUpdate);
            }
        }

        // Display frame
        displayFrame(frame);
    } catch (error) {
        console.error('Game loop error:', error);
        console.error('Game state:', gameState);
    }

    requestAnimationFrame(gameLoop);
}

function displayFrame(frame) {
    if (!viewport) return;
    
    // Measure actual rendered width of one line BEFORE setting content
    // Extract first line to measure
    const firstLineEnd = frame.indexOf('\n');
    const testLine = firstLineEnd > 0 ? frame.substring(0, firstLineEnd) : (frame.split('\n')[0] || '');
    
    // Create test element with exact same styling as viewport
    const testElement = document.createElement('div');
    testElement.style.position = 'absolute';
    testElement.style.visibility = 'hidden';
    testElement.style.fontSize = getComputedStyle(viewport).fontSize || '12px';
    testElement.style.fontFamily = getComputedStyle(viewport).fontFamily || "'Courier New', 'Monaco', 'Menlo', monospace";
    testElement.style.whiteSpace = 'pre';
    testElement.style.letterSpacing = getComputedStyle(viewport).letterSpacing || '0';
    testElement.textContent = testLine;
    document.body.appendChild(testElement);
    const actualLineWidth = testElement.offsetWidth;
    document.body.removeChild(testElement);
    
    // Calculate exact viewport width: actual line width + padding + border
    const borderPadding = 24; // 4px border (2px each side) + 20px padding (10px each side)
    const exactWidth = actualLineWidth + borderPadding;
    
    // Get container (#app) - the viewport should fit within this container
    // The container uses flexbox, so we need to ensure viewport doesn't exceed its width
    const container = document.getElementById('app');
    if (container) {
        // Use the container's actual client width as the maximum
        // This ensures the viewport (including border) fits within the green box
        const maxAllowedWidth = container.clientWidth;
        
        // Constrain viewport to fit within container - the exactWidth already includes border+padding
        viewport.style.width = `${Math.min(exactWidth, maxAllowedWidth)}px`;
        viewport.style.maxWidth = `${maxAllowedWidth}px`; // Hard CSS limit
    } else {
        viewport.style.width = `${exactWidth}px`;
    }
    
    // Now set the frame content
    viewport.textContent = frame;
    
    // Update level indicator, viewport, and controls color class
    if (gameState) {
        try {
            const gameStateObj = JSON.parse(gameState);
            const level = gameStateObj.current_level || 1;
            if (levelIndicator) {
                levelIndicator.textContent = `Level ${level}`;
                levelIndicator.className = `level-${level}`;
            }
            music.setLevel(level);
            viewport.className = `level-${level}`;
            if (controls) {
                controls.className = `level-${level}`;
            }
            
            if (shouldHoldViewportFocus() && gameStateObj.has_won && document.activeElement !== viewport) {
                viewport.focus();
            }
            syncWinScreenFlag(gameStateObj);
        } catch (e) {
            // Ignore parse errors
        }
    }
}

// Win-advance keys: capture on document so Windows receives Space/Enter even if focus drifts.
document.addEventListener(
    'keydown',
    async (e) => {
        if (paused && e.key !== 'Escape') return;
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
        if (e.key !== ' ' && e.key !== 'Spacebar' && e.key !== 'Enter') return;
        if (!hasWonScreen) return;
        e.preventDefault();
        e.stopPropagation();
        await advanceIfWon();
    },
    true
);

// Keyboard event handlers - listen on window to catch all keys
window.addEventListener('keydown', async (e) => {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    // Ignore gameplay keys while paused behind the landing overlay (Escape still handled below).
    if (paused && e.key !== 'Escape') {
        return;
    }

    if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') {
        if (hasWonScreen) return;
    }
    
    switch (e.key.toLowerCase()) {
        case 'w':
            keys.w = true;
            e.preventDefault();
            break;
        case 's':
            keys.s = true;
            e.preventDefault();
            break;
        case 'a':
            keys.a = true;
            e.preventDefault();
            break;
        case 'd':
            keys.d = true;
            e.preventDefault();
            break;
        case 'q':
            keys.q = true;
            e.preventDefault();
            break;
        case 'e':
            keys.e = true;
            e.preventDefault();
            break;
        case 'r':
            if (hasWonScreen) {
                e.preventDefault();
                await replayIfWon();
            }
            break;
        case 'escape':
            if (shellControlled) {
                // In the web landing: pause and bring the sidebar/PLAY overlay back.
                pauseToShell();
            } else if (document.pointerLockElement) {
                document.exitPointerLock();
            } else if (backend?.isDesktop) {
                // Desktop only — the browser has no window to close.
                backend.closeWindow();
            }
            e.preventDefault();
            break;
    }
});

window.addEventListener('keyup', (e) => {
    switch (e.key.toLowerCase()) {
        case 'w':
            keys.w = false;
            break;
        case 's':
            keys.s = false;
            break;
        case 'a':
            keys.a = false;
            break;
        case 'd':
            keys.d = false;
            break;
        case 'q':
            keys.q = false;
            break;
        case 'e':
            keys.e = false;
            break;
    }
});

// Handle window resize
window.addEventListener('resize', () => {
    resizeViewport();
});

// Start the game when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

