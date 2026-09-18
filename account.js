/** Local handle on this browser. One active player. Not an account, signup, or sign-in. */

import { sanitizeName, saveDisplayName } from './board.js';

export const PLAYER_KEY = 'mm-player';

export function loadPlayer() {
    try {
        const raw = JSON.parse(localStorage.getItem(PLAYER_KEY) || 'null');
        if (!raw || typeof raw !== 'object') return null;
        return {
            id: String(raw.id || ''),
            name: sanitizeName(raw.name),
            createdAt: Number(raw.createdAt) || Date.now(),
            movingSeconds: Number(raw.movingSeconds) || 0,
        };
    } catch {
        return null;
    }
}

export function savePlayer(player) {
    try {
        localStorage.setItem(PLAYER_KEY, JSON.stringify(player));
    } catch {
        // private mode
    }
    return player;
}

export function currentHandle() {
    return loadPlayer()?.name || '';
}

export function ensurePlayer(name) {
    const clean = sanitizeName(name);
    let player = loadPlayer();
    if (!player || !player.id) {
        player = {
            id: `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
            name: clean,
            createdAt: Date.now(),
            movingSeconds: 0,
        };
    } else if (clean) {
        player.name = clean;
    }
    if (player.name) saveDisplayName(player.name);
    return savePlayer(player);
}

export function setHandle(name) {
    const clean = sanitizeName(name);
    if (!clean) return loadPlayer();
    return ensurePlayer(clean);
}

export function addMovingSeconds(delta) {
    if (!(delta > 0) || delta > 5) return loadPlayer();
    const player = loadPlayer();
    if (!player) return null;
    player.movingSeconds = (Number(player.movingSeconds) || 0) + delta;
    return savePlayer(player);
}

export function formatMoving(seconds) {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
        return '—';
    }
    const total = Math.floor(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}
