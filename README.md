# Matrix Maze

A desktop application featuring a first-person 3D ASCII labyrinth adventure game built with Rust, Tauri, and JavaScript.

## 🎮 [Play Demo / Download]([landing.html](https://matrixmaze.vercel.app))

Visit the [landing page](https://matrixmaze.vercel.app) to see a demo and download the game for your platform.

## Features

- **3D ASCII Raycasting Engine**: Real-time 3D rendering using ASCII characters with depth perception
- **Fractal Dithering**: Surface-stable fractal dithering for enhanced visual quality (using MPL 2.0 licensed code)
- **Procedural Maze Generation**: Randomly generated labyrinths using recursive backtracking algorithm
- **5 levels** with best-time persistence and level-complete flow
- **Adaptive music**: Layered stems (base, pressure, chase, dread) with procedural fallback; click viewport to unlock audio
- **First-Person Controls**: Smooth movement and rotation with WASD + Q/E keys
- **Cross-Platform**: Built with Tauri for Windows, macOS, and Linux support
- **Landing page**: `index.html` on Vercel with release downloads via `api/github-releases.js`

## Controls

- **W**: Move forward
- **S**: Move backward
- **A**: Strafe left
- **D**: Strafe right
- **Q**: Turn left
- **E**: Turn right
- **ESC**: Exit game

## Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) (latest stable version)
- [Node.js](https://nodejs.org/) (v16 or higher)
- npm or yarn

## Installation

1. Clone the repository:
```bash
git clone git@github.com:ledoit/Matrix-Maze.git
cd Matrix-Maze
```

2. Install frontend dependencies (all npm commands run from `app/`):
```bash
cd app
npm install
```

3. The Rust dependencies will be automatically installed when you build the project.

**Current version:** 1.3.0 (`app/package.json`, `app/src-tauri/Cargo.toml`)

## Development

Run the development server:
```bash
cd app
npm install
npm run tauri dev
```

This will:
- Start the Vite dev server for the frontend
- Compile the Rust backend
- Launch the Tauri application window

## Building

Build the application for production:
```bash
cd app
npm run tauri build
```

The built application will be in `app/src-tauri/target/release/` (or `app/src-tauri/target/release/bundle/` for installers).

## Project Structure

```
.
├── index.html             # Landing page (fullscreen playable shell, deployed to Vercel)
├── game/                  # Generated browser game build (iframe embed at /game/)
├── vercel.json            # Vercel deployment config
├── api/                   # Serverless GitHub releases proxy (landing downloads)
├── BUILD.md               # Release build checklist
├── TODO.md                # Open issues (audio polish, mute, perf)
├── app/                   # Game application
│   ├── src/              # Frontend (HTML/CSS/JavaScript)
│   │   ├── main.js       # Game loop (host-agnostic)
│   │   ├── backend.js    # GameBackend: Tauri invoke (desktop) vs WASM (browser)
│   │   ├── wasm/         # Generated wasm-bindgen output (committed)
│   │   └── style.css     # Styling
│   ├── scripts/
│   │   └── build-wasm.sh # Compiles the Rust core to WebAssembly
│   ├── src-tauri/        # Rust backend
│   │   ├── src/
│   │   │   ├── lib.rs    # Shared game library (native + wasm)
│   │   │   ├── main.rs   # Tauri (native) entry point
│   │   │   ├── wasm_api.rs # Browser (wasm-bindgen) entry points
│   │   │   ├── platform.rs # Per-host time / RNG / persistence shims
│   │   │   ├── game.rs   # Game state and logic
│   │   │   ├── maze.rs   # Maze generation
│   │   │   └── raycast.rs # 3D raycasting engine
│   │   └── Cargo.toml    # Rust dependencies (dual-target: native + wasm)
│   ├── index.html        # Game HTML entry point
│   └── package.json       # Node.js dependencies
└── README.md
```

## Playing in the Browser (WebAssembly)

The same Rust game logic that powers the desktop app is compiled to WebAssembly so the game
runs in Chrome/Firefox/Safari with no install. There is no JS reimplementation — `game.rs`,
`maze.rs`, `raycast.rs` and `dither/` are shared between both targets:

- `app/src-tauri/` is a **dual-target crate**. The native build produces the Tauri binary
  (`src/main.rs`); the `wasm32-unknown-unknown` build produces a cdylib whose `src/wasm_api.rs`
  exposes the same `init_game` / `update_game` / `render_frame` / `next_level` entry points.
- Host differences (wall-clock time, RNG entropy, best-time persistence) are isolated in
  `src/platform.rs` — `std` on desktop, `js-sys`/`web-sys` (localStorage) in the browser.
- The frontend `app/src/main.js` talks to a thin `GameBackend` (`app/src/backend.js`) that is
  `TauriBackend` (via `invoke`) on desktop and `WasmBackend` (via the wasm module) in the
  browser. Tauri APIs are only dynamically imported on desktop, so nothing crashes when
  `__TAURI__` is absent.

### Build steps

Prerequisites (one-time):

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.100   # must match the wasm-bindgen crate pin
```

Then, from `app/`:

```bash
npm install
npm run build:wasm     # Rust -> wasm, regenerates app/src/wasm/ (only when Rust changes)
npm run dev            # local dev server (http://localhost:1420)
npm run build:web      # production browser build -> ../game (iframe embed)
```

`app/src/wasm/` and `game/` are committed build artifacts, so the Vite build and Vercel do
**not** need a Rust toolchain — only re-run `build:wasm` / `build:web` when the Rust game logic
or frontend changes.

### Deployment / routes

- **Prod:** https://matrix-maze.menhir-holdings.com/ — sidebar + Play; game embedded
- `/game/` — iframe-only WASM build (not a public entry point)
- Legacy `/play/` and `/dev/` redirect to `/`
- Deploy: push `main` → Vercel. In-flight: PR preview URL (do not redirect `*.vercel.app` previews)

Hub ops (DNS / Vercel lattice): [stonehenge docs/DNS.md](https://github.com/menhir-holdings/stonehenge/blob/main/docs/DNS.md), [docs/VERCEL.md](https://github.com/menhir-holdings/stonehenge/blob/main/docs/VERCEL.md).

## Music (Kaiser)

When this repo lives inside the **Menhir** monorepo, adaptive music is produced in `Audio/Kaiser/composition/projects/matrix-maze/` and copied into `app/public/audio/music/` by the client sync script.

1. Build stems in Kaiser: `Audio/Kaiser/composition/export/convert-stems.bat matrix-maze` (or `.sh` on Unix) after placing WAVs in `Audio/Kaiser/composition/projects/matrix-maze/export/inbox/`.
2. From `app/`: `npm run music:sync`

Details: `app/public/audio/music/README.md` and `Audio/Kaiser/composition/projects/matrix-maze/README.md`.

## How It Works

### 3D Rendering

The game uses a raycasting algorithm similar to classic games like Wolfenstein 3D:
- For each column of the screen, a ray is cast from the player's position
- The ray intersects with walls in the maze
- Distance is calculated and used to determine wall height (perspective projection)
- ASCII characters are chosen based on distance to create depth perception

### Maze Generation

The maze is generated using a recursive backtracking algorithm:
- Creates a perfect maze (one path between any two points)
- Ensures the player starts at a valid position
- Guarantees an exit point

### Game Loop

1. Frontend captures keyboard input
2. Input is sent to the Rust game logic via the active `GameBackend` — Tauri commands on
   desktop, or the WebAssembly module in the browser
3. Game state is updated (player position, rotation)
4. Frame is rendered using raycasting
5. ASCII frame is returned to the frontend and displayed

## License

This project is licensed under "All Rights Reserved" - see the [LICENSE](LICENSE) file for details.

### Dither Module Exception

The dithering module (`app/src-tauri/src/dither/`) is licensed under the Mozilla Public License, v. 2.0 (MPL 2.0). This code was ported from [Dither3D](https://github.com/runevision/Dither3D) by Rune Skovbo Johansen. See [LICENSE-MPL](LICENSE-MPL) for the full MPL 2.0 license text.

The MPL 2.0 license applies only to the files in the `dither/` module. All other code in this repository remains under the "All Rights Reserved" license.
