# Gold-path QA — Matrix Maze

**Linear:** [MT-65](https://linear.app/menhir-holdings/issue/MT-65)

Cold load → **Play** → complete all **8 levels** → finish run summary, without a desktop install.

## Automated checks

```bash
cd app
CARGO_TARGET_DIR=/tmp/matrix-maze-cargo-target cargo test gold_path --manifest-path src-tauri/Cargo.toml --lib
npm run qa:gold-path
```

On Windows, set `CARGO_TARGET_DIR` to a path **without spaces** if the repo lives under a spaced folder (Tauri winres quirk).

- **Rust tests** — `GameState::next_level()` advances 1→8 then restarts; run times persist between levels.
- **Smoke script** — production landing (`/`), embedded game shell (`/game/`), WASM bundle, and level-1 HUD text.

Default smoke target: `https://matrix-maze.menhir-holdings.com`. Override with `GOLD_PATH_URL`.

## Manual browser matrix

Run once per browser after a hard refresh (empty cache). Production URL unless testing a Vercel preview.

| Step | Chrome | Safari | Firefox |
|------|--------|--------|---------|
| Cold load `/` — sidebar + **Play** visible | ☐ | ☐ | ☐ |
| Click **Play** — iframe loads, pointer lock / focus | ☐ | ☐ | ☐ |
| Level 1 HUD shows `LEVEL 1` | ☐ | ☐ | ☐ |
| Reach exit — level-complete overlay | ☐ | ☐ | ☐ |
| Space / Enter / tap advances to next level | ☐ | ☐ | ☐ |
| Levels 2–8 complete without reload | ☐ | ☐ | ☐ |
| After level 8 — name plate + board + play again | ☐ | ☐ | ☐ |

**Controls:** WASD move, Q/E turn, SPACE continue (levels 1–7), **R** replay this level, name plate after level 8.

## Notes

- Audio may require a first user gesture; unmute OS/browser if stems are silent.
- Best times persist in `localStorage`; clear site data for a fully fresh run.
- Windows spacebar quirks tracked in [MT-45](https://linear.app/menhir-holdings/issue/MT-45); tap/click fallback should still advance.
