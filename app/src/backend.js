// GameBackend abstraction.
//
// The game loop in main.js talks to one of two hosts through the same interface:
//   - TauriBackend: native desktop. Calls the Rust game logic via Tauri `invoke`.
//   - WasmBackend:  browser. Calls the same Rust logic compiled to WebAssembly.
//
// The host is detected once at startup. Crucially, `@tauri-apps/api` and the wasm module are
// only ever *dynamically* imported by the backend that needs them, so a plain browser never
// touches Tauri internals (no `invoke` call can crash when `__TAURI__` is missing) and the
// desktop build never downloads the wasm.

function isTauri() {
    return (
        typeof window !== 'undefined' &&
        (typeof window.__TAURI_INTERNALS__ !== 'undefined' ||
            typeof window.__TAURI__ !== 'undefined')
    );
}

// Desktop backend: thin wrapper over Tauri commands. Argument keys are camelCase; Tauri maps
// them to the snake_case command parameters on the Rust side.
class TauriBackend {
    constructor(invoke) {
        this.invoke = invoke;
        this.isDesktop = true;
    }

    static async create() {
        const { invoke } = await import('@tauri-apps/api/core');
        return new TauriBackend(invoke);
    }

    initGame() {
        return this.invoke('init_game');
    }

    updateGame(stateJson, input) {
        return this.invoke('update_game', { stateJson, input });
    }

    // Resolves to [frame, updatedState].
    renderFrame(stateJson, width, height) {
        return this.invoke('render_frame', { stateJson, width, height });
    }

    nextLevel(stateJson) {
        return this.invoke('next_level', { stateJson });
    }

    replayLevel(stateJson) {
        return this.invoke('replay_level', { stateJson });
    }

    // Closes the desktop window. No-op fallback if the API is unavailable.
    async closeWindow() {
        try {
            const { getCurrentWindow } = await import('@tauri-apps/api/window');
            await getCurrentWindow().close();
        } catch (err) {
            console.warn('Window close failed:', err);
        }
    }
}

// Browser backend: the identical Rust logic via wasm-bindgen. The wasm exports mirror the
// Tauri commands one-for-one and speak the same JSON strings, so main.js needs no branching.
class WasmBackend {
    constructor(wasm) {
        this.wasm = wasm;
        this.isDesktop = false;
    }

    static async create() {
        // Load the wasm-bindgen glue and the wasm binary URL (resolved by the bundler) together.
        const [wasm, { default: wasmUrl }] = await Promise.all([
            import('./wasm/matrix_maze.js'),
            import('./wasm/matrix_maze_bg.wasm?url'),
        ]);
        await wasm.default({ module_or_path: wasmUrl });
        return new WasmBackend(wasm);
    }

    initGame() {
        return this.wasm.init_game();
    }

    // The sim takes player input as a JSON string (wasm-bindgen does not deserialize structs
    // the way Tauri's command layer does).
    updateGame(stateJson, input) {
        return this.wasm.update_game(stateJson, JSON.stringify(input));
    }

    // Returns [frame, updatedState] — same shape as the Tauri tuple.
    renderFrame(stateJson, width, height) {
        return this.wasm.render_frame(stateJson, width, height);
    }

    nextLevel(stateJson) {
        return this.wasm.next_level(stateJson);
    }

    replayLevel(stateJson) {
        return this.wasm.replay_level(stateJson);
    }

    // No desktop window in the browser.
    async closeWindow() {}
}

// Selects and initializes the backend for the current host.
export async function createBackend() {
    return isTauri() ? TauriBackend.create() : WasmBackend.create();
}
