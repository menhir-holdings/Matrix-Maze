# Matrix Maze scores

Global board for finished 8-level runs. Display name only — no Clerk, no accounts.

## API

| | |
|---|---|
| `GET /api/scores` | Top 50 full-run times, fastest first. `{ scores, store }` |
| `POST /api/scores` | `{ name, total, levels[8] }` → `{ ok, score, scores, store }` |

Name is 1–16 characters, persisted in the browser as `localStorage.matrix_maze_display_name`.

## Store (Vercel-safe)

`api/scores.js` picks the first available backend:

1. **Vercel KV / Upstash** — `KV_REST_API_URL` + `KV_REST_API_TOKEN`
2. **Vercel Blob** — `BLOB_READ_WRITE_TOKEN`, object `matrix-maze-scores.json`
3. **Memory** — last-resort for a warm lambda. Cold starts empty. Response includes `store: "memory"` so you can tell.

Set KV or Blob on the `matrix-maze` project in team `menhir-holdings` for a durable production board. Preview deploys share the same env if the project already has the token.

`app/src/backend.js` is the Tauri/WASM game host, not a score store.

## Board filters

The finish plate can sort by **full run** or a single **level split** (`levels[n]`). That is per-level hiscores, not a ghost replay.
