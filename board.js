/** Shared display-name + global board client. No accounts. */

export const DISPLAY_NAME_KEY = 'matrix_maze_display_name';
export const MAX_NAME = 16;

export function sanitizeName(raw) {
    const trimmed = String(raw || '')
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return trimmed.slice(0, MAX_NAME);
}

export function loadDisplayName() {
    try {
        return sanitizeName(localStorage.getItem(DISPLAY_NAME_KEY) || '');
    } catch {
        return '';
    }
}

export function saveDisplayName(name) {
    const clean = sanitizeName(name);
    try {
        if (clean) localStorage.setItem(DISPLAY_NAME_KEY, clean);
    } catch {
        // Private mode can throw; the run still submits.
    }
    return clean;
}

export function formatClock(seconds) {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
        return '--:--.--';
    }
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const hundredths = Math.floor((seconds % 1) * 100);
    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

export function runPayloadFromState(state) {
    const levels = Array.from({ length: 8 }, (_, i) => {
        const t = state?.run_times?.[i];
        return typeof t === 'number' && Number.isFinite(t) ? t : null;
    });
    const total = typeof state?.total_time === 'number' ? state.total_time : null;
    return { total, levels };
}

const LOCAL_BOARD_KEY = 'mm-run-board';

function readLocalBoard() {
    try {
        const rows = JSON.parse(localStorage.getItem(LOCAL_BOARD_KEY) || '[]');
        return Array.isArray(rows) ? rows : [];
    } catch {
        return [];
    }
}

function writeLocalBoard(rows) {
    try {
        localStorage.setItem(LOCAL_BOARD_KEY, JSON.stringify(rows.slice(0, 50)));
    } catch {
        // ignore
    }
}

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
        // Fall through to the local board (desktop / offline / cold API).
    }
    return { scores: readLocalBoard(), store: 'local' };
}

export async function submitScore({ name, total, levels }) {
    const clean = saveDisplayName(name);
    try {
        const res = await fetch('/api/scores', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ name: clean, total, levels }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) return data;
        throw new Error(data.error || `Submit failed (${res.status})`);
    } catch (err) {
        const row = {
            id: `local-${Date.now()}`,
            name: clean || 'RUNNER',
            total,
            levels: Array.isArray(levels) ? levels : [],
            at: Date.now(),
        };
        const scores = [row, ...readLocalBoard()].sort((a, b) => a.total - b.total).slice(0, 50);
        writeLocalBoard(scores);
        if (!clean) throw err;
        return { ok: true, score: row, scores, store: 'local' };
    }
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
        time.textContent = formatClock(idx === null ? row.total : row.levels?.[idx]);
        li.append(rank, who, time);
        ol.appendChild(li);
    });
}
