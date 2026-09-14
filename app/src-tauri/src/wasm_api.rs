//! Browser entry points. These mirror the Tauri commands in `main.rs` one-for-one so the
//! JavaScript `GameBackend` can treat both hosts identically: every call takes/returns the
//! same JSON strings the desktop path uses. Player input arrives as a JSON string because
//! wasm-bindgen does not deserialize arbitrary structs the way Tauri's command layer does.

use crate::game::{GameState, PlayerInput};
use wasm_bindgen::prelude::*;

/// Routes Rust panics to the browser console so a bad frame surfaces a real message
/// instead of an opaque `unreachable` trap. Called once by the JS loader.
#[wasm_bindgen(start)]
pub fn start() {
    std::panic::set_hook(Box::new(|info| {
        web_sys::console::error_1(&info.to_string().into());
    }));
}

#[wasm_bindgen]
pub fn init_game() -> String {
    serde_json::to_string(&GameState::new()).unwrap()
}

#[wasm_bindgen]
pub fn update_game(state_json: String, input_json: String) -> String {
    let mut game_state: GameState = serde_json::from_str(&state_json).unwrap();
    let input: PlayerInput = serde_json::from_str(&input_json).unwrap();
    game_state.update(&input);
    serde_json::to_string(&game_state).unwrap()
}

/// Returns `[frame, updated_state_json]` — the second element carries any state the render
/// step mutated, matching the tuple the Tauri command returns.
#[wasm_bindgen]
pub fn render_frame(state_json: String, width: usize, height: usize) -> Vec<String> {
    let mut game_state: GameState = serde_json::from_str(&state_json).unwrap();
    let frame = game_state.render_frame(width, height);
    vec![frame, serde_json::to_string(&game_state).unwrap()]
}

#[wasm_bindgen]
pub fn restart_game() -> String {
    serde_json::to_string(&GameState::new()).unwrap()
}

#[wasm_bindgen]
pub fn next_level(state_json: String) -> String {
    let game_state: GameState = serde_json::from_str(&state_json).unwrap();
    serde_json::to_string(&game_state.next_level()).unwrap()
}

#[wasm_bindgen]
pub fn replay_level(state_json: String) -> String {
    let game_state: GameState = serde_json::from_str(&state_json).unwrap();
    serde_json::to_string(&game_state.replay_level()).unwrap()
}
