import { fetchScores, renderBoardList, submitScore } from '../../board.js';
import {
    formatTime,
    loadDisplayName,
    loadLevelBoard,
    loadRunBoard,
    recordRun,
    saveDisplayName,
} from './scores.js';

function rowHtml(rank, name, timeLabel) {
    return `<li class="board-row"><span class="board-rank">${rank}</span><span class="board-name">${escapeHtml(name)}</span><span class="board-time">${timeLabel}</span></li>`;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function emptyList(message) {
    return `<li class="board-empty">${escapeHtml(message)}</li>`;
}

export function bindArcadePlate(root, { onPlayAgain } = {}) {
    if (!root) return null;

    const nameInput = root.querySelector('#racer-name');
    const submitBtn = root.querySelector('#racer-submit');
    const timeEl = root.querySelector('#plate-time');
    const noteEl = root.querySelector('#plate-note');
    const runList = root.querySelector('#run-board');
    const levelList = root.querySelector('#level-board');
    const playAgain = root.querySelector('#plate-again');
    const tabs = root.querySelectorAll('[data-board-tab]');
    const panels = {
        run: root.querySelector('[data-board-panel="run"]'),
        level: root.querySelector('[data-board-panel="level"]'),
    };

    let pending = null;
    let submitted = false;
    let remoteRows = [];
    let highlightId = null;

    if (nameInput) {
        nameInput.value = loadDisplayName();
        nameInput.maxLength = 16;
        nameInput.autocomplete = 'nickname';
    }

    function showTab(name) {
        tabs.forEach((tab) => {
            const on = tab.getAttribute('data-board-tab') === name;
            tab.classList.toggle('is-on', on);
            tab.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        if (panels.run) panels.run.hidden = name !== 'run';
        if (panels.level) panels.level.hidden = name !== 'level';
    }

    function renderRunBoard(highlightAt) {
        if (!runList) return;
        if (remoteRows.length) {
            renderBoardList(runList, remoteRows, { filter: 'run', highlightId });
            return;
        }
        const rows = loadRunBoard();
        if (!rows.length) {
            runList.innerHTML = emptyList('No full-run times yet.');
            return;
        }
        runList.innerHTML = rows
            .map((row, i) => {
                const marked = highlightAt && row.at === highlightAt ? ' is-you' : '';
                return rowHtml(i + 1, row.name, formatTime(row.total)).replace(
                    'board-row',
                    `board-row${marked}`
                );
            })
            .join('');
    }

    function renderLevelBoard() {
        if (!levelList) return;
        const all = loadLevelBoard();
        const chunks = [];
        for (let level = 1; level <= 8; level += 1) {
            const rows = Array.isArray(all[String(level)]) ? all[String(level)] : [];
            const best = rows[0];
            chunks.push(
                `<li class="board-level"><span class="board-rank">L${level}</span><span class="board-name">${
                    best ? escapeHtml(best.name) : '—'
                }</span><span class="board-time">${best ? formatTime(best.time) : '--:--.--'}</span></li>`
            );
        }
        levelList.innerHTML = chunks.join('');
    }

    function render() {
        renderRunBoard(pending?.at);
        renderLevelBoard();
    }

    async function refreshRemote() {
        try {
            const data = await fetchScores();
            remoteRows = data.scores || [];
        } catch {
            remoteRows = [];
        }
    }

    async function submitName() {
        if (!pending) {
            const name = saveDisplayName(nameInput?.value || '');
            if (nameInput) nameInput.value = name;
            await refreshRemote();
            render();
            return;
        }
        const name = saveDisplayName(nameInput?.value || '');
        if (nameInput) nameInput.value = name;
        if (!name) {
            if (noteEl) noteEl.textContent = 'Set a handle to post the time.';
            nameInput?.focus();
            return;
        }
        if (!submitted) {
            recordRun({ name, total: pending.total, levels: pending.levels });
            try {
                const result = await submitScore({
                    name,
                    total: pending.total,
                    levels: pending.levels,
                });
                remoteRows = result.scores || [];
                highlightId = result.score?.id || null;
            } catch (err) {
                if (noteEl) noteEl.textContent = err.message || 'Saved locally. Global board unavailable.';
                submitted = true;
                pending.at = Date.now();
                render();
                showTab('run');
                return;
            }
            submitted = true;
            pending.at = Date.now();
        }
        if (noteEl) noteEl.textContent = pending.newRecord ? 'Personal best on the board.' : 'On the board.';
        render();
        showTab('run');
    }

    tabs.forEach((tab) => {
        tab.addEventListener('click', () => showTab(tab.getAttribute('data-board-tab')));
    });
    submitBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        submitName();
    });
    nameInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            submitName();
        }
    });
    playAgain?.addEventListener('click', () => {
        onPlayAgain?.();
    });

    render();
    showTab('run');

    return {
        showFinish(payload) {
            pending = payload
                ? {
                      total: payload.total,
                      levels: payload.levels || [],
                      newRecord: Boolean(payload.newRecord),
                      at: null,
                  }
                : null;
            submitted = false;
            root.hidden = false;
            root.classList.add('is-finish');
            if (timeEl) timeEl.textContent = formatTime(pending?.total);
            if (noteEl) {
                noteEl.textContent = pending
                    ? 'Confirm your handle, post the time, then play again.'
                    : 'Local full-run and per-level times.';
            }
            if (nameInput) {
                nameInput.value = loadDisplayName();
                nameInput.focus();
                nameInput.select();
            }
            render();
            showTab('run');
        },
        showBoard() {
            pending = null;
            submitted = false;
            root.hidden = false;
            root.classList.remove('is-finish');
            if (timeEl) timeEl.textContent = '';
            if (noteEl) noteEl.textContent = 'Local full-run and per-level times.';
            if (nameInput) nameInput.value = loadDisplayName();
            render();
            showTab('run');
        },
        hide() {
            root.hidden = true;
            root.classList.remove('is-finish');
        },
        render,
    };
}
