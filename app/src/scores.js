// Local arcade boards plus the shared hiscore client in ../../board.js.
// ScoreRow seam: { id, playerId?, name, total, levels[8], at, movingSeconds? }

export {
    DISPLAY_NAME_KEY,
    MAX_NAME,
    SEED_SCORES,
    sanitizeName,
    loadDisplayName,
    saveDisplayName,
    formatClock,
    runPayloadFromState,
    mergeSeed,
    fetchScores,
    submitScore,
    sortScores,
    profileFromScores,
    renderBoardList,
    bindFilterChips,
    currentFilter,
} from '../../board.js';

import { formatClock, runPayloadFromState, sanitizeName } from '../../board.js';

export const formatTime = formatClock;
export const RUN_BOARD_KEY = 'mm-run-board';
export const LEVEL_BOARD_KEY = 'mm-level-board';

const MAX_RUNS = 20;
const MAX_LEVEL_ROWS = 10;

function readJson(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        return parsed == null ? fallback : parsed;
    } catch {
        return fallback;
    }
}

function writeJson(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // ignore
    }
}

export function loadRunBoard() {
    const rows = readJson(RUN_BOARD_KEY, []);
    return Array.isArray(rows) ? rows : [];
}

export function loadLevelBoard() {
    const data = readJson(LEVEL_BOARD_KEY, {});
    return data && typeof data === 'object' ? data : {};
}

export function recordRun({ name, total, levels }) {
    const row = {
        name: sanitizeName(name) || 'RUNNER',
        total: Number(total),
        levels: Array.isArray(levels) ? levels : [],
        at: Date.now(),
    };
    if (!Number.isFinite(row.total)) return loadRunBoard();
    const board = [...loadRunBoard(), row].sort((a, b) => a.total - b.total).slice(0, MAX_RUNS);
    writeJson(RUN_BOARD_KEY, board);
    return board;
}

export function recordLevel({ name, level, time }) {
    const lvl = String(level);
    const row = {
        name: sanitizeName(name) || 'RUNNER',
        time: Number(time),
        at: Date.now(),
    };
    if (!Number.isFinite(row.time)) return loadLevelBoard();
    const all = loadLevelBoard();
    const list = Array.isArray(all[lvl]) ? all[lvl] : [];
    all[lvl] = [...list, row].sort((a, b) => a.time - b.time).slice(0, MAX_LEVEL_ROWS);
    writeJson(LEVEL_BOARD_KEY, all);
    return all;
}

export function finishPayloadFromState(state) {
    const { total, levels } = runPayloadFromState(state);
    return {
        total: typeof total === 'number' ? total : 0,
        levels,
        bestTotal: typeof state?.best_total_time === 'number' ? state.best_total_time : null,
        newRecord: Boolean(state?.new_record_total),
    };
}
