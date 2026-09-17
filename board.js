/**
 * Hiscores client.
 *
 * Store seam (swap later without UI changes):
 *   ScoreRow { id, playerId?, name, total, levels[8], at, movingSeconds? }
 *   GET/POST /api/scores  →  KV → Blob → memory, always merged with scores-seed.json
 * Point loadStore/saveStore at Postgres when it exists; keep this row shape.
 */

export const DISPLAY_NAME_KEY = 'matrix_maze_display_name';
export const MAX_NAME = 16;

/** Keep in sync with scores-seed.json (local / desktop fallback). */
export const SEED_SCORES = [
    {
        id: 'seed-philly-run',
        playerId: 'philly',
        name: 'philly',
        total: 159.41,
        levels: [null, null, null, null, null, null, null, null],
        at: 1726272000000,
    },
];

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

export function mergeSeed(rows) {
    const list = Array.isArray(rows) ? [...rows] : [];
    for (const seed of SEED_SCORES) {
        const taken = list.some(
            (row) =>
                row.id === seed.id ||
                (row.playerId && row.playerId === seed.playerId) ||
                sanitizeName(row.name).toLowerCase() === seed.name
        );
        if (!taken) list.push(seed);
    }
    return list;
}

export async function fetchScores() {
    try {
        const res = await fetch('/api/scores', { headers: { Accept: 'application/json' } });
        if (res.ok) {
            const data = await res.json();
            return {
                scores: mergeSeed(Array.isArray(data.scores) ? data.scores : []),
                store: data.store || 'unknown',
            };
        }
    } catch {
        // Fall through to the local board (desktop / offline / cold API).
    }
    return { scores: mergeSeed(readLocalBoard()), store: 'local' };
}

export async function submitScore({ name, total, levels, playerId, movingSeconds }) {
    const clean = saveDisplayName(name);
    const body = { name: clean, total, levels, playerId, movingSeconds };
    try {
        const res = await fetch('/api/scores', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
            return { ...data, scores: mergeSeed(data.scores || []) };
        }
        throw new Error(data.error || `Submit failed (${res.status})`);
    } catch (err) {
        const row = {
            id: `local-${Date.now()}`,
            playerId: playerId || null,
            name: clean || 'RUNNER',
            total,
            levels: Array.isArray(levels) ? levels : [],
            movingSeconds: typeof movingSeconds === 'number' ? movingSeconds : undefined,
            at: Date.now(),
        };
        const local = [row, ...readLocalBoard()].sort((a, b) => a.total - b.total).slice(0, 50);
        writeLocalBoard(local);
        if (!clean) throw err;
        return { ok: true, score: row, scores: mergeSeed(local), store: 'local' };
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

function samePlayer(row, { playerId, name }) {
    if (playerId && row.playerId && row.playerId === playerId) return true;
    return sanitizeName(row.name).toLowerCase() === sanitizeName(name).toLowerCase();
}

export function profileFromScores(scores, ident) {
    const list = Array.isArray(scores) ? scores : [];
    const mine = list.filter((row) => samePlayer(row, ident));
    const runRows = sortScores(list, 'run');
    const bestRun = sortScores(mine, 'run')[0] || null;
    const overallRank = bestRun
        ? runRows.findIndex((row) => row.id === bestRun.id) + 1
        : null;
    const levels = Array.from({ length: 8 }, (_, i) => {
        const key = String(i + 1);
        const ranked = sortScores(list, key);
        const best = sortScores(mine, key)[0] || null;
        const time = best ? best.levels[i] : null;
        const rank = best ? ranked.findIndex((row) => row.id === best.id) + 1 : null;
        return { level: i + 1, time, rank, of: ranked.length };
    });
    const movingFromRows = mine.reduce((max, row) => {
        const value = Number(row.movingSeconds);
        return Number.isFinite(value) && value > max ? value : max;
    }, 0);
    return {
        name: ident.name || mine[0]?.name || 'Runner',
        playerId: ident.playerId || mine[0]?.playerId || null,
        bestRun,
        overallRank,
        overallOf: runRows.length,
        levels,
        movingSeconds:
            typeof ident.movingSeconds === 'number' ? ident.movingSeconds : movingFromRows || undefined,
    };
}

export function renderBoardList(ol, scores, { filter = 'run', highlightId = null, onName = null } = {}) {
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
        const who = document.createElement('button');
        who.type = 'button';
        who.className = 'hiscore-name';
        who.textContent = row.name || 'Runner';
        if (onName) {
            who.addEventListener('click', () => onName(row));
        }
        const time = document.createElement('span');
        time.className = 'board-time';
        const idx = filter === 'run' || !filter ? null : Number(filter) - 1;
        time.textContent = formatClock(idx === null ? row.total : row.levels?.[idx]);
        li.append(rank, who, time);
        ol.appendChild(li);
    });
}

export function bindFilterChips(root, onChange) {
    if (!root) return;
    const chips = [...root.querySelectorAll('[data-filter]')];
    chips.forEach((chip) => {
        chip.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            chips.forEach((c) => {
                const on = c === chip;
                c.classList.toggle('is-on', on);
                c.setAttribute('aria-selected', on ? 'true' : 'false');
            });
            onChange?.(chip.getAttribute('data-filter') || 'run');
        });
    });
}

export function currentFilter(root) {
    return root?.querySelector('[data-filter].is-on')?.getAttribute('data-filter') || 'run';
}

/** QC skip: `?finish=1` or `?level=8` opens the finish plate without playing 8 levels. */
export function wantsReviewSkip(search = typeof location !== 'undefined' ? location.search : '') {
    const q = new URLSearchParams(search);
    if (q.get('finish') === '1') return true;
    return q.get('level') === '8';
}

/** Last local run if one exists, else dummy splits. For review skip only. */
export function reviewFinishPayload() {
    const last = readLocalBoard().find((row) => typeof row.total === 'number');
    if (last) {
        return {
            total: last.total,
            levels: Array.from({ length: 8 }, (_, i) =>
                typeof last.levels?.[i] === 'number' ? last.levels[i] : null
            ),
            newRecord: false,
            reviewSkip: true,
        };
    }
    const levels = [19.5, 21, 22.5, 24, 25.5, 27, 28.5, 30];
    return {
        total: levels.reduce((sum, n) => sum + n, 0),
        levels,
        newRecord: false,
        reviewSkip: true,
    };
}
