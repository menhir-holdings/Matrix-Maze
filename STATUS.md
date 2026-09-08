# Matrix Maze — Status

**Version:** 1.4.0 (8 levels)  
**As of:** 2026-09-08  
**SoT:** [Linear — Matrix Maze](https://linear.app/menhir-holdings/project/matrix-maze-194b0b7b0bd7) (Completed)  
**Checkout:** `Menhir Holdings/Game/Matrix-Maze`

## Shipped

- 8 levels, best times (localStorage), level-complete UI, run summary
- Tauri 2 desktop builds (Windows / macOS / Linux)
- Unified web at [matrix-maze.menhir-holdings.com](https://matrix-maze.menhir-holdings.com/) — sidebar, Play button, embedded WASM game
- WASM port (`GameBackend`), mobile touch controls, pointer-lock + keyboard
- Adaptive music L1–8, level-complete stinger, pause audio ([MT-99](https://linear.app/menhir-holdings/issue/MT-99))
- Gold-path QA automation ([MT-65](https://linear.app/menhir-holdings/issue/MT-65))
- Vercel deploy; GitHub releases proxy for desktop downloads

## Shipped (recent)

- [MT-102](https://linear.app/menhir-holdings/issue/MT-102) — Unified web at `/`; `/play` + `/dev` retired
- [MT-45](https://linear.app/menhir-holdings/issue/MT-45) — Windows spacebar on level-complete
- [MT-99](https://linear.app/menhir-holdings/issue/MT-99) — Adaptive music + SFX
- [MT-65](https://linear.app/menhir-holdings/issue/MT-65) — Gold-path smoke + checklist

## Backlog

Mute toggle ([MT-48](https://linear.app/menhir-holdings/issue/MT-48) / [MT-67](https://linear.app/menhir-holdings/issue/MT-67)), lobby/fail/complete stingers ([MT-101](https://linear.app/menhir-holdings/issue/MT-101)), centered win ASCII ([MT-100](https://linear.app/menhir-holdings/issue/MT-100)), perf budget ([MT-69](https://linear.app/menhir-holdings/issue/MT-69)).

**Cut from v1:** creature chase ([MT-46](https://linear.app/menhir-holdings/issue/MT-46) canceled).

See [TODO.md](./TODO.md).
