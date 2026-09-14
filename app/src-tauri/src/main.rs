#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

// The game logic lives in the `matrix_maze` library crate (see src/lib.rs), shared with the
// browser (wasm) build. This binary is the native Tauri host only; it is excluded from the
// wasm target, where src/wasm_api.rs provides the equivalent entry points.

#[cfg(not(target_arch = "wasm32"))]
use matrix_maze::game::{GameState, PlayerInput};

#[cfg(not(target_arch = "wasm32"))]
#[tauri::command]
fn init_game() -> String {
    let game_state = GameState::new();
    serde_json::to_string(&game_state).unwrap()
}

#[cfg(not(target_arch = "wasm32"))]
#[tauri::command]
fn update_game(state_json: String, input: PlayerInput) -> String {
    let mut game_state: GameState = serde_json::from_str(&state_json).unwrap();
    game_state.update(&input);
    serde_json::to_string(&game_state).unwrap()
}

#[cfg(not(target_arch = "wasm32"))]
#[tauri::command]
fn render_frame(state_json: String, width: usize, height: usize) -> (String, String) {
    let mut game_state: GameState = serde_json::from_str(&state_json).unwrap();
    let frame = game_state.render_frame(width, height);
    // Return both the frame and the updated state (in case freeze frame was captured)
    (frame, serde_json::to_string(&game_state).unwrap())
}

#[cfg(not(target_arch = "wasm32"))]
#[tauri::command]
fn restart_game() -> String {
    let game_state = GameState::new();
    serde_json::to_string(&game_state).unwrap()
}

#[cfg(not(target_arch = "wasm32"))]
#[tauri::command]
fn next_level(state_json: String) -> String {
    let game_state: GameState = serde_json::from_str(&state_json).unwrap();
    let next_state = game_state.next_level();
    serde_json::to_string(&next_state).unwrap()
}

#[cfg(not(target_arch = "wasm32"))]
#[tauri::command]
fn replay_level(state_json: String) -> String {
    let game_state: GameState = serde_json::from_str(&state_json).unwrap();
    serde_json::to_string(&game_state.replay_level()).unwrap()
}

#[cfg(not(target_arch = "wasm32"))]
fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![init_game, update_game, render_frame, restart_game, next_level, replay_level])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// The wasm target builds only the library (`cargo build --lib`); this stub keeps the binary
// target compilable if it is ever built for wasm directly.
#[cfg(target_arch = "wasm32")]
fn main() {}
