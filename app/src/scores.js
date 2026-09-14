// Local arcade boards. Same display name for the full-run list and per-level hiscores.
// No accounts. Browser and the desktop webview both use localStorage.

export const DISPLAY_NAME_KEY = 'matrix_maze_display_name';
export const RUN_BOARD_KEY = 'mm-run-board';
export const LEVEL_BOARD_KEY = 'mm-level-board';

const MAX_NAME = 16;
const MAX_RUNS = 20;
const MAX_LEVEL_ROWS = 10;

export function sanitizeName(raw) {
    const cleaned = String(raw || '')
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_NAME);
    return cleaned;
}

export function loadDisplayName() {
    try {
        return sanitizeName(localStorage.getItem(DISPLAY_NAME_KEY) || '');
    } catch {
        return '';
    }
}

export function saveDisplayName(name) {
    const cleaned = sanitizeName(name);
    try {
        if (cleaned) localStorage.setItem(DISPLAY_NAME_KEY, cleaned);
    } catch {
        // Private mode / quota — keep going with the in-memory name.
    }
    return cleaned;
}

export function formatTime(seconds) {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
        return '--:--.--';
    }
    const minutes = Math.floor(seconds / 60);
    const whole = Math.floor(seconds % 60);
    const hundredths = Math.floor((seconds % 1) * 100);
    return `${String(minutes).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

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
    const levels = Array.isArray(state?.run_times)
        ? state.run_times.map((t) => (typeof t === 'number' ? t : null))
        : [];
    return {
        total: typeof state?.total_time === 'number' ? state.total_time : 0,
        levels,
        bestTotal: typeof state?.best_total_time === 'number' ? state.best_total_time : null,
        newRecord: Boolean(state?.new_record_total),
    };
}

export const formatClock = formatTime;

export async function fetchScores() {
    try {
        const res = await fetch('/api/scores', { headers: { Accept: 'application/json' } });
        if (res.ok) {
            const data = await res.json();
            return {
                scores: Array.isArray(data.scores) ? data.scores : [],
                store: data.store || 'unknown',
            };
        }
    } catch {
        // Fall through to the local board.
    }
    return {
        scores: loadRunBoard().map((row, i) => ({
            id: `local-${row.at || i}`,
            name: row.name,
            total: row.total,
            levels: row.levels,
            at: row.at,
        })),
        store: 'local',
    };
}

export async function submitScore({ name, total, levels }) {
    const clean = saveDisplayName(name);
    const local = recordRun({ name: clean, total, levels });
    try {
        const res = await fetch('/api/scores', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ name: clean, total, levels }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
            return data;
        }
    } catch {
        // Local board still accepted the time.
    }
    const score = local[0] || { name: clean, total, levels, at: Date.now() };
    return {
        ok: true,
        store: 'local',
        score: { ...score, id: `local-${score.at}` },
        scores: local.map((row) => ({ ...row, id: `local-${row.at}` })),
    };
}

export function sortScores(scores, filter) {
    const list = Array.isArray(scores) ? [...scores] : [];
    if (filter === 'run' || !filter) {
        return list
            .filter((row) => typeof row.total === 'number')
            .sort((a, b) => a.total - b.total);
    }
    const idx = Number(filter) - 1;
    return list
        .filter((row) => typeof row.levels?.[idx] === 'number')
        .sort((a, b) => a.levels[idx] - b.levels[idx]);
}

export function renderBoardList(ol, scores, { filter = 'run', highlightId = null } = {}) {
    if (!ol) return;
    ol.replaceChildren();
    const rows = sortScores(scores, filter).slice(0, 20);
    if (!rows.length) {
        const empty = document.createElement('li');
        empty.className = 'board-empty';
        empty.textContent = 'No times yet. Be the first.';
        ol.appendChild(empty);
        return;
    }
    rows.forEach((row, i) => {
        const li = document.createElement('li');
        if (highlightId && row.id === highlightId) li.classList.add('is-you');
        const rank = document.createElement('span');
        rank.className = 'board-rank';
        rank.textContent = String(i + 1);
        const who = document.createElement('span');
        who.className = 'board-name';
        who.textContent = row.name || 'Runner';
        const time = document.createElement('span');
        time.className = 'board-time';
        const idx = filter === 'run' || !filter ? null : Number(filter) - 1;
        time.textContent = formatTime(idx === null ? row.total : row.levels?.[idx]);
        li.append(rank, who, time);
        ol.appendChild(li);
    });
}
