use crate::maze::{Maze, PLAYER_RADIUS};
use crate::platform;
use crate::raycast::cast_ray;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GameState {
    pub player_x: f64,
    pub player_y: f64,
    pub player_angle: f64,
    pub maze: MazeData,
    pub exit_x: f64,
    pub exit_y: f64,
    pub has_won: bool,
    pub current_level: u8, // 1-8
    pub level_start_time: f64, // Time when current level started (seconds since epoch)
    pub level_completion_time: Option<f64>, // Time for current level (seconds elapsed)
    pub total_time: f64, // Cumulative time across all levels
    pub run_times: Vec<Option<f64>>, // Actual completion times for each level in this run (8 elements)
    pub best_times: Vec<Option<f64>>, // Best time for each level (8 elements)
    pub best_total_time: Option<f64>, // Best time for all 8 levels combined
    pub new_record_level: Option<u8>, // Level where new record was set (1-8, or None)
    pub new_record_total: bool, // True if new total record was set
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MazeData {
    pub width: usize,
    pub height: usize,
    pub cells: Vec<Vec<bool>>,
    pub start: (usize, usize),
    pub exit: (usize, usize),
}

impl From<&Maze> for MazeData {
    fn from(maze: &Maze) -> Self {
        MazeData {
            width: maze.width,
            height: maze.height,
            cells: maze.cells.clone(),
            start: maze.start,
            exit: maze.exit,
        }
    }
}

impl From<MazeData> for Maze {
    fn from(data: MazeData) -> Self {
        Maze {
            width: data.width,
            height: data.height,
            cells: data.cells,
            start: data.start,
            exit: data.exit,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PlayerInput {
    pub forward: bool,
    pub backward: bool,
    pub left: bool,
    pub right: bool,
    pub turn_left: bool,
    pub turn_right: bool,
    pub mouse_delta_x: f64,
    pub delta_time: f64, // Time elapsed since last frame in seconds
}

/// Blank a plate behind HUD text so letters sit on black, not dither.
fn stamp_line(line: &mut [char], width: usize, text: &str, blank_plate: bool) {
    if width == 0 {
        return;
    }
    if blank_plate {
        for slot in line.iter_mut().take(width) {
            *slot = ' ';
        }
    }
    if text.is_empty() {
        return;
    }
    let count = text.chars().count();
    let start = width.saturating_sub(count) / 2;
    for (i, ch) in text.chars().enumerate() {
        let col = start + i;
        if col < width {
            line[col] = ch;
        }
    }
}

impl GameState {
    pub fn new() -> Self {
        let (best_times, best_total_time) = Self::load_best_times();
        Self::new_level(1, vec![None; 8], best_times, best_total_time, 0.0)
    }
    
    pub fn next_level(&self) -> Self {
        if self.current_level < 8 {
            // Store the current level's completion time in run_times
            let mut new_run_times = self.run_times.clone();
            let level_idx = (self.current_level - 1) as usize;
            if level_idx < new_run_times.len() {
                new_run_times[level_idx] = self.level_completion_time;
            }
            
            let mut new_state = Self::new_level(
                self.current_level + 1,
                new_run_times,
                self.best_times.clone(),
                self.best_total_time,
                self.total_time,
            );
            // Reset record flags when moving to next level
            new_state.new_record_level = None;
            new_state.new_record_total = false;
            new_state
        } else {
            // Restart from level 1
            Self::new()
        }
    }

    /// Replay the current level: new maze, same level index, prior run times kept.
    /// If this level was already scored, drop that split and subtract it from total.
    pub fn replay_level(&self) -> Self {
        let mut run_times = self.run_times.clone();
        let level_idx = (self.current_level.saturating_sub(1)) as usize;
        if level_idx < run_times.len() {
            run_times[level_idx] = None;
        }

        let mut total_time = self.total_time;
        if self.has_won {
            if let Some(t) = self.level_completion_time {
                total_time = (total_time - t).max(0.0);
            }
        }

        let mut next = Self::new_level(
            self.current_level,
            run_times,
            self.best_times.clone(),
            self.best_total_time,
            total_time,
        );
        next.new_record_level = None;
        next.new_record_total = false;
        next
    }
    
    pub fn new_level(level: u8, run_times: Vec<Option<f64>>, best_times: Vec<Option<f64>>, best_total_time: Option<f64>, total_time: f64) -> Self {
        let maze_size = (7 + level as usize) as usize; // 8, 9, 10, 11, 12, 13, 14, 15
        let maze = Maze::new(maze_size, maze_size);
        // Use the random exit position from maze generation
        let exit_x = maze.exit.0 as f64 + 0.5;
        let exit_y = maze.exit.1 as f64 + 0.5;
        
        // Use the start position from maze generation
        let start = maze.start;
        let end = maze.exit;
        
        // Save maze map to file
        Self::save_maze_map(&maze, start, end);
        
        // Calculate initial angle to face an open direction from start position
        let start_x = start.0 as f64 + 0.5;
        let start_y = start.1 as f64 + 0.5;
        
        let mut initial_angle = 0.0;
        // Check which directions are open from the random start position
        if start.0 + 1 < maze.width && !maze.is_wall(start.0 + 1, start.1) {
            initial_angle = 0.0; // Face east (right)
        }
        else if start.1 + 1 < maze.height && !maze.is_wall(start.0, start.1 + 1) {
            initial_angle = std::f64::consts::PI / 2.0; // Face south (down)
        }
        else if start.0 > 0 && !maze.is_wall(start.0 - 1, start.1) {
            initial_angle = std::f64::consts::PI; // Face west (left)
        }
        else if start.1 > 0 && !maze.is_wall(start.0, start.1 - 1) {
            initial_angle = -std::f64::consts::PI / 2.0; // Face north (up)
        }
        // Fallback: face towards exit
        else {
            let dx = exit_x - start_x;
            let dy = exit_y - start_y;
            initial_angle = dy.atan2(dx);
        }
        
        // Get current time in seconds
        let level_start_time = platform::now_secs();

        GameState {
            player_x: start_x,
            player_y: start_y,
            player_angle: initial_angle,
            maze: MazeData::from(&maze),
            exit_x,
            exit_y,
            has_won: false,
            current_level: level,
            level_start_time,
            level_completion_time: None,
            total_time,
            run_times,
            best_times,
            best_total_time,
            new_record_level: None,
            new_record_total: false,
        }
    }
    
    pub fn save_best_times(best_times: &[Option<f64>], best_total_time: Option<f64>) {
        const CURRENT_VERSION: &str = "1.4.0";

        let data = serde_json::json!({
            "version": CURRENT_VERSION,
            "best_times": best_times,
            "best_total_time": best_total_time,
        });

        // Persistence backend differs per host (file on desktop, localStorage in the browser).
        platform::store_best_times(&serde_json::to_string_pretty(&data).unwrap());
    }

    pub fn load_best_times() -> (Vec<Option<f64>>, Option<f64>) {
        const CURRENT_VERSION: &str = "1.4.0";

        if let Some(content) = platform::load_best_times() {
            if let Ok(data) = serde_json::from_str::<serde_json::Value>(&content) {
                // Check version - if it doesn't match, reset best times
                let file_version = data["version"].as_str().unwrap_or("");
                if file_version != CURRENT_VERSION {
                    // Version mismatch - reset best times
                    return (vec![None; 8], None);
                }
                
                let best_times: Vec<Option<f64>> = data["best_times"]
                    .as_array()
                    .map(|arr| {
                        arr.iter()
                            .map(|v| {
                                if v.is_null() {
                                    None
                                } else {
                                    v.as_f64()
                                }
                            })
                            .collect()
                    })
                    .unwrap_or_else(|| vec![None; 8]);
                let best_total_time = if data["best_total_time"].is_null() {
                    None
                } else {
                    data["best_total_time"].as_f64()
                };
                return (best_times, best_total_time);
            }
        }
        
        // Return defaults if file doesn't exist or can't be parsed
        (vec![None; 8], None)
    }
    
    fn save_maze_map(maze: &Maze, start: (usize, usize), end: (usize, usize)) {
        let mut output = String::new();

        // Generate the map
        for y in 0..maze.height {
            for x in 0..maze.width {
                if (x, y) == start {
                    output.push('P');
                } else if (x, y) == end {
                    output.push('E');
                } else if maze.is_wall(x, y) {
                    output.push('█');
                } else {
                    output.push(' ');
                }
            }
            output.push('\n');
        }

        // Debug aid: written to disk on desktop, ignored in the browser.
        platform::store_maze_map(&output);
    }

    pub fn update(&mut self, input: &PlayerInput) {
        // Don't process any input if already won
        if self.has_won {
            return;
        }
        
        // Use delta time to make movement frame-rate independent
        // Base speeds are per second, so multiply by delta_time
        // Clamp delta_time to prevent huge jumps (e.g., if tab was inactive)
        let delta_time = input.delta_time.min(0.1); // Cap at 100ms (10fps minimum)
        
        let move_speed_per_second = 1.8; // Units per second (0.03 per frame at 60fps, slower than original 0.05)
        let turn_speed_per_second = 3.6; // Radians per second (0.06 per frame at 60fps, slower than original 0.10)
        let move_speed = move_speed_per_second * delta_time;
        let turn_speed = turn_speed_per_second * delta_time;
        let maze: Maze = self.maze.clone().into();

        // Handle rotation
        if input.turn_left {
            self.player_angle -= turn_speed;
        }
        if input.turn_right {
            self.player_angle += turn_speed;
        }
        // Handle mouse/trackpad turning
        self.player_angle += input.mouse_delta_x * turn_speed_per_second * 2.0 * delta_time;

        // Normalize angle
        self.player_angle = self.player_angle % (2.0 * std::f64::consts::PI);
        if self.player_angle < 0.0 {
            self.player_angle += 2.0 * std::f64::consts::PI;
        }

        // One wish vector, then Quake/Source move-slide (not per-key axis lock).
        let mut wish_x = 0.0;
        let mut wish_y = 0.0;
        if input.forward {
            wish_x += self.player_angle.cos();
            wish_y += self.player_angle.sin();
        }
        if input.backward {
            wish_x -= self.player_angle.cos();
            wish_y -= self.player_angle.sin();
        }
        if input.left {
            let left_angle = self.player_angle - std::f64::consts::PI / 2.0;
            wish_x += left_angle.cos();
            wish_y += left_angle.sin();
        }
        if input.right {
            let right_angle = self.player_angle + std::f64::consts::PI / 2.0;
            wish_x += right_angle.cos();
            wish_y += right_angle.sin();
        }
        let wish_len = (wish_x * wish_x + wish_y * wish_y).sqrt();
        if wish_len > 0.0 {
            let dx = wish_x / wish_len * move_speed;
            let dy = wish_y / wish_len * move_speed;
            let (nx, ny) = maze.move_slide(self.player_x, self.player_y, dx, dy, PLAYER_RADIUS);
            self.player_x = nx;
            self.player_y = ny;
        }
        
        // Check if player reached the exit - stop movement
        let dist_to_exit = ((self.player_x - self.exit_x).powi(2) + (self.player_y - self.exit_y).powi(2)).sqrt();
        if dist_to_exit < 0.5 && !self.has_won {
            self.has_won = true;
            // Stop player at exit position
            let dx_to_exit = self.exit_x - self.player_x;
            let dy_to_exit = self.exit_y - self.player_y;
            self.player_x = self.exit_x - dx_to_exit * 0.1; // Stop just before exit
            self.player_y = self.exit_y - dy_to_exit * 0.1;
            
            // Record completion time for this level
            let current_time = platform::now_secs();
            let level_time = current_time - self.level_start_time;
            self.level_completion_time = Some(level_time);
            
            // Update best time for this level if it's better
            let level_idx = (self.current_level - 1) as usize;
            if level_idx < self.best_times.len() {
                if self.best_times[level_idx].is_none() || 
                   self.best_times[level_idx].unwrap() > level_time {
                    self.best_times[level_idx] = Some(level_time);
                    self.new_record_level = Some(self.current_level);
                }
            }
            
            // Store this level's completion time in run_times
            let level_idx = (self.current_level - 1) as usize;
            if level_idx < self.run_times.len() {
                self.run_times[level_idx] = Some(level_time);
            }
            
            // Update total time
            self.total_time += level_time;
            
            // Update best total time if this is the final level and we completed all levels
            if self.current_level == 8 {
                if self.best_total_time.is_none() || 
                   self.best_total_time.unwrap() > self.total_time {
                    self.best_total_time = Some(self.total_time);
                    self.new_record_total = true;
                }
            }
            
            // Save best times after updating
            Self::save_best_times(&self.best_times, self.best_total_time);
        }
    }

    pub fn render_frame(&mut self, width: usize, height: usize) -> String {
        let maze: Maze = self.maze.clone().into();
        let fov = std::f64::consts::PI / 2.0; // 90 degrees (zoomed out)
        let max_distance = 20.0;
        
        // Continue with normal rendering even if won - we'll overlay message at the end
        
        // Pre-calculate raycast results for each column
        // Store: (distance, wall_type, passed_exit, exit_threshold_dist, hit_x, hit_y)
        let mut column_data: Vec<(f64, u8, bool, Option<f64>, f64, f64)> = Vec::with_capacity(width);
        for col in 0..width {
            let ray_angle = self.player_angle - fov / 2.0 + (col as f64 / width as f64) * fov;
            let result = cast_ray(
                self.player_x, 
                self.player_y, 
                ray_angle, 
                &maze, 
                max_distance,
                Some(self.exit_x),
                Some(self.exit_y),
            );
            column_data.push((result.distance, result.wall_type, result.passed_exit, result.exit_threshold_dist, result.hit_x, result.hit_y));
        }
        
        let mut frame = String::new();
        
        // Create dither pattern (reuse across frame for performance)
        use crate::dither::DitherPattern;
        let dither = DitherPattern::new();
        
        // Render row by row
        for row in 0..height {
            for col in 0..width {
                let (distance, wall_type, passed_exit, exit_threshold_dist, hit_x, hit_y) = column_data[col];
                
                // Calculate wall height based on distance (perspective projection)
                let wall_render_dist = distance;
                let wall_height = if wall_render_dist > 0.01 {
                    (height as f64 / wall_render_dist).min(height as f64 * 2.0)
                } else {
                    height as f64 * 2.0
                };
                
                let wall_start = ((height as f64 - wall_height) / 2.0) as usize;
                let wall_end = (wall_start + wall_height as usize).min(height);
                
                if row < wall_start {
                    // Ceiling
                    frame.push(' ');
                } else if row < wall_end {
                    // Wall - if ray passed through exit threshold, make threshold line invisible
                    if passed_exit && exit_threshold_dist.is_some() {
                        let threshold_dist = exit_threshold_dist.unwrap();
                        // Make threshold line invisible
                        if (wall_render_dist - threshold_dist).abs() < 0.2 {
                            frame.push(' '); // Invisible exit threshold line
                        } else {
                            // Calculate per-pixel dithering with row position for vertical variation
                            frame.push(crate::raycast::get_dithered_ascii_char_with_row(
                                distance,
                                wall_type,
                                max_distance,
                                hit_x,
                                hit_y,
                                row as f64,
                                &dither,
                            ));
                        }
                    } else {
                        // Calculate per-pixel dithering with row position for vertical variation
                        frame.push(crate::raycast::get_dithered_ascii_char_with_row(
                            distance,
                            wall_type,
                            max_distance,
                            hit_x,
                            hit_y,
                            row as f64,
                            &dither,
                        ));
                    }
                } else {
                    // Floor - stop at exit threshold if ray passed through exit
                    if passed_exit {
                        // Check if floor position is before exit threshold
                        let floor_dist = calculate_floor_distance(
                            col,
                            row,
                            width,
                            height,
                            fov,
                            self.player_angle,
                        );
                        if let Some(threshold) = exit_threshold_dist {
                            if floor_dist < threshold {
                                frame.push(get_floor_char(floor_dist, max_distance));
                            } else {
                                frame.push(' ');
                            }
                        } else {
                            frame.push(' ');
                        }
                    } else {
                        let floor_dist = calculate_floor_distance(
                            col,
                            row,
                            width,
                            height,
                            fov,
                            self.player_angle,
                        );
                        if floor_dist < max_distance {
                            frame.push(get_floor_char(floor_dist, max_distance));
                        } else {
                            frame.push(' ');
                        }
                    }
                }
            }
            
            if row < height - 1 {
                frame.push('\n');
            }
        }
        
        // Overlay win message if player has won (using ASCII art)
        if self.has_won {
            // Special summary layout for the final level
            if self.current_level == 8 {
                return self.render_final_win_screen(width, height, &frame);
            }
            
            // ASCII art for "LEVEL COMPLETE!" - for levels 1-7
            let ascii_art = vec![
                "██╗     ███████╗██╗   ██╗███████╗██╗         ██████╗ ██████╗ ███╗   ███╗██████╗ ██╗     ███████╗████████╗███████╗",
                "██║     ██╔════╝██║   ██║██╔════╝██║        ██╔════╝██╔═══██╗████╗ ████║██╔══██╗██║     ██╔════╝╚══██╔══╝██╔════╝",
                "██║     █████╗  ██║   ██║█████╗  ██║        ██║     ██║   ██║██╔████╔██║██████╔╝██║     █████╗     ██║   █████╗  ",
                "██║     ██╔══╝  ╚██╗ ██╔╝██╔══╝  ██║        ██║     ██║   ██║██║╚██╔╝██║██╔═══╝ ██║     ██╔══╝     ██║   ██╔══╝  ",
                "███████╗███████╗ ╚████╔╝ ███████╗███████╗   ╚██████╗╚██████╔╝██║ ╚═╝ ██║██║     ███████╗███████╗   ██║   ███████╗",
                "╚══════╝╚══════╝  ╚═══╝  ╚══════╝╚══════╝    ╚═════╝ ╚═════╝ ╚═╝     ╚═╝╚═╝     ╚══════╝╚══════╝   ╚═╝   ╚══════╝",
            ];
            
            // Format level completion time
            let level_time_str = if let Some(time) = self.level_completion_time {
                let minutes = (time as u64) / 60;
                let seconds = (time as u64) % 60;
                let milliseconds = ((time % 1.0) * 100.0) as u64;
                format!("Time: {:02}:{:02}.{:02}", minutes, seconds, milliseconds)
            } else {
                "Time: --:--".to_string()
            };
            
            // Format best time for this level
            let level_idx = (self.current_level - 1) as usize;
            let best_level_time_str = if level_idx < self.best_times.len() && self.best_times[level_idx].is_some() {
                let best = self.best_times[level_idx].unwrap();
                let minutes = (best as u64) / 60;
                let seconds = (best as u64) % 60;
                let milliseconds = ((best % 1.0) * 100.0) as u64;
                format!("Best: {:02}:{:02}.{:02}", minutes, seconds, milliseconds)
            } else {
                "Best: --:--".to_string()
            };
            
            let next_level_str = "SPACE continue   R replay level";
            
            let art_height = ascii_art.len();
            let art_start_row = (height.saturating_sub(art_height + 4)) / 2;
            let time_row = art_start_row + art_height + 1;
            let best_row = time_row + 1;
            let next_row = best_row + 3; // 2 blank lines after best (best_row + 1, +2, then next_row at +3)
            
            // Check for personal best message
            let personal_best_str = if self.new_record_level == Some(self.current_level) {
                " PERSONAL BEST!".to_string()
            } else {
                String::new()
            };
            
            // Combine time and personal best
            let time_with_pb = format!("{}{}", level_time_str, personal_best_str);
            
            let lines: Vec<&str> = frame.split('\n').collect();
            let mut new_frame = String::new();
            
            for (row_idx, line) in lines.iter().enumerate() {
                // Ensure line is exactly width characters
                let mut new_line: Vec<char> = line.chars().take(width).collect();
                // Pad line to exact width if needed
                while new_line.len() < width {
                    new_line.push(' ');
                }
                // Truncate if longer (shouldn't happen, but safety check)
                new_line.truncate(width);
                
                // Overlay ASCII art (centered) - always show even with personal best
                if row_idx >= art_start_row && row_idx < art_start_row + art_height {
                    let art_line_idx = row_idx - art_start_row;
                    if art_line_idx < ascii_art.len() {
                        stamp_line(&mut new_line, width, ascii_art[art_line_idx], true);
                    }
                }
                // Overlay level time message with personal best
                else if row_idx == time_row {
                    stamp_line(&mut new_line, width, &time_with_pb, true);
                }
                // Overlay best level time
                else if row_idx == best_row {
                    stamp_line(&mut new_line, width, &best_level_time_str, true);
                }
                // Overlay next level message at bottom
                else if row_idx == next_row {
                    stamp_line(&mut new_line, width, next_level_str, true);
                }
                
                new_frame.push_str(&new_line.iter().collect::<String>());
                if row_idx < lines.len() - 1 {
                    new_frame.push('\n');
                }
            }
            return new_frame;
        }
        
        // Overlay start message that flashes for 3 seconds
        let current_time = platform::now_secs();
        let elapsed = current_time - self.level_start_time;
        if elapsed < 3.0 {
            // Flash: show for 0.5s, hide for 0.3s, repeat
            let flash_cycle = 0.8; // 0.5s on + 0.3s off
            let phase = (elapsed % flash_cycle) / flash_cycle;
            if phase < 0.625 { // Show for 62.5% of cycle (0.5s / 0.8s)
                let message = format!("LEVEL {} - FIND THE EXIT!", self.current_level);
                let message_row = height / 2;

                let lines: Vec<&str> = frame.split('\n').collect();
                let mut new_frame = String::new();
                for (row_idx, line) in lines.iter().enumerate() {
                    let mut new_line: Vec<char> = line.chars().take(width).collect();
                    while new_line.len() < width {
                        new_line.push(' ');
                    }
                    new_line.truncate(width);
                    // Clear a 3-row band so the cue sits on black, not dither.
                    if row_idx + 1 >= message_row && row_idx <= message_row + 1 {
                        if row_idx == message_row {
                            stamp_line(&mut new_line, width, &message, true);
                        } else {
                            for ch in new_line.iter_mut() {
                                *ch = ' ';
                            }
                        }
                    }
                    new_frame.push_str(&new_line.iter().collect::<String>());
                    if row_idx < lines.len() - 1 {
                        new_frame.push('\n');
                    }
                }
                return new_frame;
            }
        }
        
        frame
    }
    
    fn render_final_win_screen(&self, width: usize, height: usize, frame: &str) -> String {
        // ASCII art for "LEVEL COMPLETE!" - always show
        let ascii_art = vec![
            "██╗     ███████╗██╗   ██╗███████╗██╗         ██████╗ ██████╗ ███╗   ███╗██████╗ ██╗     ███████╗████████╗███████╗",
            "██║     ██╔════╝██║   ██║██╔════╝██║        ██╔════╝██╔═══██╗████╗ ████║██╔══██╗██║     ██╔════╝╚══██╔══╝██╔════╝",
            "██║     █████╗  ██║   ██║█████╗  ██║        ██║     ██║   ██║██╔████╔██║██████╔╝██║     █████╗     ██║   █████╗  ",
            "██║     ██╔══╝  ╚██╗ ██╔╝██╔══╝  ██║        ██║     ██║   ██║██║╚██╔╝██║██╔═══╝ ██║     ██╔══╝     ██║   ██╔══╝  ",
            "███████╗███████╗ ╚████╔╝ ███████╗███████╗   ╚██████╗╚██████╔╝██║ ╚═╝ ██║██║     ███████╗███████╗   ██║   ███████╗",
            "╚══════╝╚══════╝  ╚═══╝  ╚══════╝╚══════╝    ╚═════╝ ╚═════╝ ╚═╝     ╚═╝╚═╝     ╚══════╝╚══════╝   ╚═╝   ╚══════╝",
        ];
        
        // Format final level time
        let final_level_time_str = if let Some(time) = self.level_completion_time {
            let minutes = (time as u64) / 60;
            let seconds = (time as u64) % 60;
            let milliseconds = ((time % 1.0) * 100.0) as u64;
            format!("{:02}:{:02}.{:02}", minutes, seconds, milliseconds)
        } else {
            "--:--".to_string()
        };
        
        // Check for personal best and append to time
        let personal_best_suffix = if self.new_record_level == Some(8) || self.new_record_total {
            " PERSONAL BEST!"
        } else {
            ""
        };
        let time_with_pb = format!("Time: {}{}", final_level_time_str, personal_best_suffix);
        
        // Format best time for the final level (level 8)
        let final_best_str = if self.best_times.len() > 7 && self.best_times[7].is_some() {
            let best = self.best_times[7].unwrap();
            let minutes = (best as u64) / 60;
            let seconds = (best as u64) % 60;
            let milliseconds = ((best % 1.0) * 100.0) as u64;
            format!("{:02}:{:02}.{:02}", minutes, seconds, milliseconds)
        } else {
            "--:--".to_string()
        };
        
        // Format times for levels 1-7 (use actual run times, not best times)
        let format_time = |time_opt: Option<f64>| -> String {
            if let Some(time) = time_opt {
                let minutes = (time as u64) / 60;
                let seconds = (time as u64) % 60;
                let milliseconds = ((time % 1.0) * 100.0) as u64;
                format!("{:02}:{:02}.{:02}", minutes, seconds, milliseconds)
            } else {
                "--:--".to_string()
            }
        };
        
        let per_level_time = |idx: usize| -> String {
            if self.run_times.len() > idx { format_time(self.run_times[idx]) } else { "--:--".to_string() }
        };
        
        // Format total time
        let total_time_str = {
            let minutes = (self.total_time as u64) / 60;
            let seconds = (self.total_time as u64) % 60;
            let milliseconds = ((self.total_time % 1.0) * 100.0) as u64;
            format!("{:02}:{:02}.{:02}", minutes, seconds, milliseconds)
        };
        
        // Format best total time with personal best indicator
        let best_total_pb_suffix = if self.new_record_total {
            " PERSONAL BEST!"
        } else {
            ""
        };
        let best_total_str = if let Some(best) = self.best_total_time {
            let minutes = (best as u64) / 60;
            let seconds = (best as u64) % 60;
            let milliseconds = ((best % 1.0) * 100.0) as u64;
            format!("{:02}:{:02}.{:02}{}", minutes, seconds, milliseconds, best_total_pb_suffix)
        } else {
            format!("--:--{}", best_total_pb_suffix)
        };
        
        // All texts in single column (centered)
        let texts = vec![
            time_with_pb,
            format!("Best: {}", final_best_str),
            String::new(), // Empty line
            format!("Level 1: {}", per_level_time(0)),
            format!("Level 2: {}", per_level_time(1)),
            format!("Level 3: {}", per_level_time(2)),
            format!("Level 4: {}", per_level_time(3)),
            format!("Level 5: {}", per_level_time(4)),
            format!("Level 6: {}", per_level_time(5)),
            format!("Level 7: {}", per_level_time(6)),
            String::new(), // Empty line between levels and total
            format!("Total: {}", total_time_str),
            format!("Best total: {}", best_total_str),
            String::new(), // Empty line
            "Name the run on the plate — or SPACE to play again".to_string(),
        ];
        
        // Calculate starting row (center vertically, accounting for ASCII art)
        let art_height = ascii_art.len();
        let total_text_lines = texts.len();
        let art_start_row = (height.saturating_sub(art_height + total_text_lines + 1)) / 2;
        let start_row = art_start_row + art_height + 1;
        
        let lines: Vec<&str> = frame.split('\n').collect();
        let mut new_frame = String::new();
        
        for (row_idx, line) in lines.iter().enumerate() {
            // Ensure line is exactly width characters
            let mut new_line: Vec<char> = line.chars().take(width).collect();
            // Pad line to exact width if needed
            while new_line.len() < width {
                new_line.push(' ');
            }
            // Truncate if longer (shouldn't happen, but safety check)
            new_line.truncate(width);
            
            // Overlay ASCII art (centered) - always show
            if row_idx >= art_start_row && row_idx < art_start_row + art_height {
                let art_line_idx = row_idx - art_start_row;
                if art_line_idx < ascii_art.len() {
                    stamp_line(&mut new_line, width, ascii_art[art_line_idx], true);
                }
            }
            
            // Overlay texts (centered)
            if row_idx >= start_row && row_idx < start_row + texts.len() {
                let text_idx = row_idx - start_row;
                if text_idx < texts.len() {
                    let text = &texts[text_idx];
                    if !text.is_empty() {
                        stamp_line(&mut new_line, width, text, true);
                    }
                }
            }
            
            new_frame.push_str(&new_line.iter().collect::<String>());
            if row_idx < lines.len() - 1 {
                new_frame.push('\n');
            }
        }
        
        new_frame
    }
}

fn calculate_floor_distance(
    _col: usize,
    row: usize,
    _width: usize,
    height: usize,
    _fov: f64,
    _player_angle: f64,
) -> f64 {
    let p = (row as f64 - height as f64 / 2.0) / (height as f64 / 2.0);
    let distance = 1.0 / p.max(0.1);
    distance
}

fn get_floor_char(distance: f64, max_distance: f64) -> char {
    let normalized_dist = (distance / max_distance).min(1.0);
    if normalized_dist < 0.3 {
        '.'
    } else if normalized_dist < 0.6 {
        ','
    } else {
        ' '
    }
}

#[cfg(test)]
mod gold_path_tests {
    use super::*;

    #[test]
    fn advances_through_all_eight_levels_then_restarts() {
        let mut state = GameState::new();
        assert_eq!(state.current_level, 1);

        for expected in 1..=8u8 {
            assert_eq!(state.current_level, expected);
            state.has_won = true;
            state.level_completion_time = Some(10.0);
            state = state.next_level();
            assert!(!state.has_won);
        }

        assert_eq!(state.current_level, 1);
    }

    #[test]
    fn records_completion_times_between_levels() {
        let mut state = GameState::new();

        for level in 1..=7u8 {
            state.has_won = true;
            state.level_completion_time = Some(level as f64 * 5.0);
            let next = state.next_level();
            assert_eq!(next.current_level, level + 1);
            assert_eq!(next.run_times[level as usize - 1], Some(level as f64 * 5.0));
            state = next;
        }
    }

    #[test]
    fn replay_level_keeps_index_and_drops_current_split() {
        let mut state = GameState::new();
        state.has_won = true;
        state.level_completion_time = Some(9.0);
        state.total_time = 9.0;
        state.run_times[0] = Some(9.0);

        let replayed = state.replay_level();
        assert_eq!(replayed.current_level, 1);
        assert!(!replayed.has_won);
        assert_eq!(replayed.run_times[0], None);
        assert_eq!(replayed.total_time, 0.0);
    }
}

