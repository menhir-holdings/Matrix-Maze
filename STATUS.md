# Matrix Maze — Status

**Version:** 1.4.0 (8 levels)  
**As of:** 2026-09-17  
**SoT:** [Linear — Matrix Maze](https://linear.app/menhir-holdings/project/matrix-maze-194b0b7b0bd7)  
**Checkout:** `Menhir Holdings/Game/Matrix-Maze`  
**Bookmark:** [https://matmaz.vercel.app](https://matmaz.vercel.app)

## Shipped

- 8 levels, best times (localStorage), level-complete UI, run summary
- Tauri 2 desktop builds (Windows / macOS / Linux)
- Unified web at `/` — Play overlay, embedded WASM game at `/game/`
- WASM port (`GameBackend`), mobile touch controls, pointer-lock + keyboard
- Adaptive music L1–8, level-complete stinger, pause audio ([MT-99](https://linear.app/menhir-holdings/issue/MT-99))
- Gold-path QA automation ([MT-65](https://linear.app/menhir-holdings/issue/MT-65))
- Vercel deploy; GitHub releases proxy for desktop downloads
- `/play` + `/dev` retired ([MT-102](https://linear.app/menhir-holdings/issue/MT-102))
- Web shell restyle (cabinet/title overlay) ([MT-208](https://linear.app/menhir-holdings/issue/MT-208))

## In review

- [MT-223](https://linear.app/menhir-holdings/issue/MT-223) / [MT-230](https://linear.app/menhir-holdings/issue/MT-230) — Compact LEVEL START plate (no flash / no full-width band), **Skip to finish** review control, local **handle** (not accounts). Hiscores + click a name for that player's times. Seeded **philly** 2:39.41.

## Shell vs WASM

| Lives in web chrome (`/`) | Lives in the game view (`/game/` WASM) |
|---|---|
| Title, Play/Resume, **Skip to finish**, handle, pause, controls, download | Maze sim, raycast, movement, level timer |
| Finish handle confirm + hiscores + player profile | L1–7 complete ASCII, `SPACE` next, `R` replay |
| Esc overlay | Pointer-lock look, touch pad, in-run HUD |

One hop after level 8: game posts `run-complete`, shell shows the plate. No extra lobby.

**Cut:** ghost replay of a recorded path. `R` regenerates the maze and keeps the run.

## Backlog

Mute toggle ([MT-48](https://linear.app/menhir-holdings/issue/MT-48) / [MT-67](https://linear.app/menhir-holdings/issue/MT-67)), lobby/fail/complete stingers ([MT-101](https://linear.app/menhir-holdings/issue/MT-101)), centered win ASCII ([MT-100](https://linear.app/menhir-holdings/issue/MT-100)), perf budget ([MT-69](https://linear.app/menhir-holdings/issue/MT-69)).

**Cut from v1:** creature chase ([MT-46](https://linear.app/menhir-holdings/issue/MT-46) canceled).

See [TODO.md](./TODO.md).
