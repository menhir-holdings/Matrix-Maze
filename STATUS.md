# Matrix Maze — Status

**Version:** 1.4.0 (8 levels)  
**As of:** 2026-09-14  
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
- Web shell restyle ([MT-208](https://linear.app/menhir-holdings/issue/MT-208))

## In review

- [MT-223](https://linear.app/menhir-holdings/issue/MT-223) — Readable HUD contrast, Quake/Source wall-slide, display-name board after last level. Per-level hiscores + `R` replay started. Shell vs WASM cut documented on the issue.

## Backlog

Mute toggle ([MT-48](https://linear.app/menhir-holdings/issue/MT-48) / [MT-67](https://linear.app/menhir-holdings/issue/MT-67)), lobby/fail/complete stingers ([MT-101](https://linear.app/menhir-holdings/issue/MT-101)), centered win ASCII ([MT-100](https://linear.app/menhir-holdings/issue/MT-100)), perf budget ([MT-69](https://linear.app/menhir-holdings/issue/MT-69)). Ghost replay of a saved path is **not** in this pass.

**Cut from v1:** creature chase ([MT-46](https://linear.app/menhir-holdings/issue/MT-46) canceled).

See [TODO.md](./TODO.md).
