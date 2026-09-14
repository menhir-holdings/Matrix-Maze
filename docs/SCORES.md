# Matrix Maze scores

Global hiscores for finished 8-level runs, plus a local-first player row.

## Row seam

Swap the store later without changing the UI:

```
ScoreRow { id, playerId?, name, total, levels[8], at, movingSeconds? }
Player   { id, name, createdAt, movingSeconds }
```

`playerId` is the account key. Names are display-only (1–16 chars). Clicking a name on the hiscore list opens a profile: best full-run + rank, per-level time + rank, and **moving** playtime (WASD / QE / mouse look only — pause, idle, level-complete, and game-complete do not count).

## API

| | |
|---|---|
| `GET /api/scores` | Top 50 full-run times, fastest first. `{ scores, store }` always merged with `scores-seed.json` |
| `POST /api/scores` | `{ name, total, levels[8], playerId?, movingSeconds? }` → `{ ok, score, scores, store }` |

Local player lives in `localStorage.mm-player`. Display name also in `matrix_maze_display_name`.

Seeded hiscore: **philly** 2:39.41 (`scores-seed.json`). Remove or edit that file when live times replace it.

## Store (Vercel-safe)

`api/scores.js` picks the first available backend:

1. **Vercel KV / Upstash** — `KV_REST_API_URL` + `KV_REST_API_TOKEN`
2. **Vercel Blob** — `BLOB_READ_WRITE_TOKEN`, object `matrix-maze-scores.json`
3. **Memory** — last-resort for a warm lambda. Cold starts empty. Response includes `store: "memory"` so you can tell.

Point `loadStore` / `saveStore` at Postgres when it exists; keep the row shape.

`app/src/backend.js` is the Tauri/WASM game host, not a score store.

## Hiscore filters

Chip buttons sort by **full run** or a single **level split** (`levels[n]`). That is per-level hiscores, not a ghost replay.
