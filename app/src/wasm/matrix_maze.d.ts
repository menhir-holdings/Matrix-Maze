/* tslint:disable */
/* eslint-disable */

export function init_game(): string;

export function next_level(state_json: string): string;

/**
 * Returns `[frame, updated_state_json]` — the second element carries any state the render
 * step mutated, matching the tuple the Tauri command returns.
 */
export function render_frame(state_json: string, width: number, height: number): string[];

export function replay_level(state_json: string): string;

export function restart_game(): string;

/**
 * Routes Rust panics to the browser console so a bad frame surfaces a real message
 * instead of an opaque `unreachable` trap. Called once by the JS loader.
 */
export function start(): void;

export function update_game(state_json: string, input_json: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly init_game: () => [number, number];
    readonly next_level: (a: number, b: number) => [number, number];
    readonly render_frame: (a: number, b: number, c: number, d: number) => [number, number];
    readonly replay_level: (a: number, b: number) => [number, number];
    readonly restart_game: () => [number, number];
    readonly start: () => void;
    readonly update_game: (a: number, b: number, c: number, d: number) => [number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_drop_slice: (a: number, b: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
