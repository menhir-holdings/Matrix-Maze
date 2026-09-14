use std::collections::HashSet;
use std::sync::atomic::{AtomicU64, Ordering};

// Static counter to ensure unique seeds even on fast restarts
static MAZE_COUNTER: AtomicU64 = AtomicU64::new(0);

pub struct Maze {
    pub width: usize,
    pub height: usize,
    pub cells: Vec<Vec<bool>>, // true = wall, false = empty
    pub start: (usize, usize), // Starting position
    pub exit: (usize, usize), // Exit position
}

impl Maze {
    pub fn new(width: usize, height: usize) -> Self {
        let mut maze = Maze {
            width,
            height,
            cells: vec![vec![true; width]; height],
            start: (1, 1), // Default, will be set in generate()
            exit: (width - 2, height - 1), // Default, will be set in generate()
        };
        maze.generate();
        maze
    }

    fn generate(&mut self) {
        // Recursive backtracking algorithm
        let mut stack: Vec<(usize, usize)> = Vec::new();
        let mut visited: HashSet<(usize, usize)> = HashSet::new();
        
        // Generate a high-entropy seed. The per-host entropy sources (clock, thread/PID or
        // Math.random) live in `platform`; the atomic counter guarantees uniqueness even when
        // two mazes are generated within the same instant.
        let counter = MAZE_COUNTER.fetch_add(1, Ordering::Relaxed);
        let mut rng_seed = crate::platform::entropy_seed(counter);
        
        // Pick a random edge (0=top, 1=right, 2=bottom, 3=left)
        rng_seed = rng_seed.wrapping_mul(1103515245).wrapping_add(12345);
        let edge = rng_seed as usize % 4;
        
        let exit = match edge {
            0 => { // Top edge
                rng_seed = rng_seed.wrapping_mul(1103515245).wrapping_add(12345);
                let x = 1 + (rng_seed as usize % (self.width - 2));
                (x, 0)
            },
            1 => { // Right edge
                rng_seed = rng_seed.wrapping_mul(1103515245).wrapping_add(12345);
                let y = 1 + (rng_seed as usize % (self.height - 2));
                (self.width - 1, y)
            },
            2 => { // Bottom edge
                rng_seed = rng_seed.wrapping_mul(1103515245).wrapping_add(12345);
                let x = 1 + (rng_seed as usize % (self.width - 2));
                (x, self.height - 1)
            },
            _ => { // Left edge
                rng_seed = rng_seed.wrapping_mul(1103515245).wrapping_add(12345);
                let y = 1 + (rng_seed as usize % (self.height - 2));
                (0, y)
            },
        };
        self.exit = exit;
        
        // Randomly select a starting position (not too close to exit)
        // Pick a random valid starting position (avoid edges and exit area)
        let mut start = (1, 1);
        let mut attempts = 0;
        loop {
            rng_seed = rng_seed.wrapping_mul(1103515245).wrapping_add(12345);
            let x = 1 + (rng_seed as usize % (self.width - 2));
            rng_seed = rng_seed.wrapping_mul(1103515245).wrapping_add(12345);
            let y = 1 + (rng_seed as usize % (self.height - 2));
            
            // Make sure it's not too close to exit
            let dist_to_exit = ((x as f64 - exit.0 as f64).powi(2) + (y as f64 - exit.1 as f64).powi(2)).sqrt();
            if dist_to_exit > 3.0 || attempts > 50 {
                start = (x, y);
                break;
            }
            attempts += 1;
        }
        
        self.cells[start.1][start.0] = false;
        visited.insert(start);
        stack.push(start);
        self.start = start; // Store the start position
        
        // Track if we've reached the exit
        let mut exit_reached = false;
        
        while let Some(current) = stack.pop() {
            // Check if we've reached the exit area
            if current == exit || 
               (current.0 == exit.0 && exit.1 > 0 && current.1 == exit.1 - 1) ||
               (exit.0 > 0 && current.0 == exit.0 - 1 && current.1 == exit.1) {
                exit_reached = true;
            }
            
            let neighbors = self.get_unvisited_neighbors(current, &visited);
            
            if !neighbors.is_empty() {
                stack.push(current);
                // Simple LCG random selection
                rng_seed = rng_seed.wrapping_mul(1103515245).wrapping_add(12345);
                let next = neighbors[rng_seed as usize % neighbors.len()];
                self.remove_wall_between(current, next);
                self.cells[next.1][next.0] = false;
                visited.insert(next);
                stack.push(next);
            }
        }

        // Ensure exit point is open and connected
        self.cells[exit.1][exit.0] = false;
        
        // If exit wasn't reached, connect it to the nearest visited cell
        if !exit_reached {
            // Find nearest path cell and connect
            let mut min_dist = f64::MAX;
            let mut nearest = (1, 1);
            for y in 1..self.height - 1 {
                for x in 1..self.width - 1 {
                    if !self.cells[y][x] && visited.contains(&(x, y)) {
                        let dist = ((x as f64 - exit.0 as f64).powi(2) + (y as f64 - exit.1 as f64).powi(2)).sqrt();
                        if dist < min_dist {
                            min_dist = dist;
                            nearest = (x, y);
                        }
                    }
                }
            }
            // Create a path from nearest to exit
            let mut current = nearest;
            while current != exit {
                let (cx, cy) = current;
                let (ex, ey) = exit;
                if cx < ex {
                    current = (cx + 1, cy);
                } else if cx > ex {
                    current = (cx - 1, cy);
                } else if cy < ey {
                    current = (cx, cy + 1);
                } else if cy > ey {
                    current = (cx, cy - 1);
                } else {
                    break;
                }
                self.cells[current.1][current.0] = false;
            }
        }
        
        // Create an actual opening in the outer wall at the exit
        // Clear the exit cell and adjacent cell to create opening based on which edge
        self.cells[exit.1][exit.0] = false;
        
        // Clear adjacent cell based on which edge the exit is on
        if exit.1 == 0 { // Top edge - clear cell below
            if exit.1 + 1 < self.height {
                self.cells[exit.1 + 1][exit.0] = false;
            }
        } else if exit.0 == self.width - 1 { // Right edge - clear cell to the left
            if exit.0 > 0 {
                self.cells[exit.1][exit.0 - 1] = false;
            }
        } else if exit.1 == self.height - 1 { // Bottom edge - clear cell above
            if exit.1 > 0 {
                self.cells[exit.1 - 1][exit.0] = false;
            }
        } else if exit.0 == 0 { // Left edge - clear cell to the right
            if exit.0 + 1 < self.width {
                self.cells[exit.1][exit.0 + 1] = false;
            }
        }
    }

    fn get_unvisited_neighbors(&self, pos: (usize, usize), visited: &HashSet<(usize, usize)>) -> Vec<(usize, usize)> {
        let mut neighbors = Vec::new();
        let (x, y) = pos;

        if x > 2 && !visited.contains(&(x - 2, y)) {
            neighbors.push((x - 2, y));
        }
        if x < self.width - 2 && !visited.contains(&(x + 2, y)) {
            neighbors.push((x + 2, y));
        }
        if y > 2 && !visited.contains(&(x, y - 2)) {
            neighbors.push((x, y - 2));
        }
        if y < self.height - 2 && !visited.contains(&(x, y + 2)) {
            neighbors.push((x, y + 2));
        }

        neighbors
    }

    fn remove_wall_between(&mut self, a: (usize, usize), b: (usize, usize)) {
        let (ax, ay) = a;
        let (bx, by) = b;
        let mid_x = (ax + bx) / 2;
        let mid_y = (ay + by) / 2;
        self.cells[mid_y][mid_x] = false;
    }

    pub fn is_wall(&self, x: usize, y: usize) -> bool {
        if x >= self.width || y >= self.height {
            return true;
        }
        self.cells[y][x]
    }

    pub fn get_cell(&self, x: f64, y: f64) -> bool {
        if x < 0.0 || y < 0.0 {
            return true;
        }
        let ix = x as usize;
        let iy = y as usize;
        self.is_wall(ix, iy)
    }

    fn is_wall_i(&self, x: i32, y: i32) -> bool {
        if x < 0 || y < 0 {
            return true;
        }
        self.is_wall(x as usize, y as usize)
    }

    pub fn circle_blocked(&self, x: f64, y: f64, radius: f64) -> bool {
        self.deepest_hit(x, y, radius).is_some()
    }

    pub fn contact_normal(&self, x: f64, y: f64, radius: f64) -> Option<(f64, f64)> {
        self.deepest_hit(x, y, radius).map(|(nx, ny, _)| (nx, ny))
    }

    fn deepest_hit(&self, x: f64, y: f64, radius: f64) -> Option<(f64, f64, f64)> {
        let mut best_pen = 0.0;
        let mut best = None;
        let min_x = (x - radius).floor() as i32 - 1;
        let max_x = (x + radius).floor() as i32 + 1;
        let min_y = (y - radius).floor() as i32 - 1;
        let max_y = (y + radius).floor() as i32 + 1;

        for iy in min_y..=max_y {
            for ix in min_x..=max_x {
                if !self.is_wall_i(ix, iy) {
                    continue;
                }
                if let Some((nx, ny, pen)) = circle_vs_cell(x, y, radius, ix, iy) {
                    if pen > best_pen {
                        best_pen = pen;
                        best = Some((nx, ny, pen));
                    }
                }
            }
        }
        best
    }

    fn resolve_overlap(&self, mut x: f64, mut y: f64, radius: f64) -> (f64, f64) {
        for _ in 0..4 {
            match self.deepest_hit(x, y, radius) {
                Some((nx, ny, pen)) if pen > 1e-8 => {
                    x += nx * (pen + 1e-4);
                    y += ny * (pen + 1e-4);
                }
                _ => break,
            }
        }
        (x, y)
    }

    /// Quake / Source move-slide: try the intended displacement; on a hit, walk
    /// to the contact, project leftover velocity onto the wall tangent, retry.
    /// Circle vs cell AABB so corners get a diagonal normal — not sticky
    /// axis-lock, not bounce.
    pub fn move_slide(&self, mut x: f64, mut y: f64, mut dx: f64, mut dy: f64, radius: f64) -> (f64, f64) {
        const CLIP_ITERS: usize = 4;
        const EPS: f64 = 1e-8;

        (x, y) = self.resolve_overlap(x, y, radius);

        for _ in 0..CLIP_ITERS {
            let dist = (dx * dx + dy * dy).sqrt();
            if dist < EPS {
                break;
            }

            let dest_x = x + dx;
            let dest_y = y + dy;
            if !self.circle_blocked(dest_x, dest_y, radius) {
                return (dest_x, dest_y);
            }

            let mut lo = 0.0;
            let mut hi = 1.0;
            for _ in 0..14 {
                let mid = (lo + hi) * 0.5;
                if self.circle_blocked(x + dx * mid, y + dy * mid, radius) {
                    hi = mid;
                } else {
                    lo = mid;
                }
            }

            x += dx * lo;
            y += dy * lo;
            (x, y) = self.resolve_overlap(x, y, radius);

            let leftover = (1.0 - lo).max(0.0);
            if leftover < 1e-6 {
                break;
            }

            let rem_x = dx * leftover;
            let rem_y = dy * leftover;
            let Some((nx, ny)) = self
                .contact_normal(x + rem_x * 0.01, y + rem_y * 0.01, radius)
                .or_else(|| self.contact_normal(x, y, radius))
            else {
                break;
            };

            let into = rem_x * nx + rem_y * ny;
            if into > 0.0 {
                break;
            }
            dx = rem_x - nx * into;
            dy = rem_y - ny * into;
        }

        self.resolve_overlap(x, y, radius)
    }
}

/// Player collision radius in maze cells. Keeps the eye off the wall face.
pub const PLAYER_RADIUS: f64 = 0.22;

fn circle_vs_cell(px: f64, py: f64, r: f64, ix: i32, iy: i32) -> Option<(f64, f64, f64)> {
    let left = ix as f64;
    let right = left + 1.0;
    let top = iy as f64;
    let bottom = top + 1.0;

    let closest_x = px.clamp(left, right);
    let closest_y = py.clamp(top, bottom);
    let dx = px - closest_x;
    let dy = py - closest_y;
    let dist2 = dx * dx + dy * dy;

    if dist2 > 1e-12 {
        let dist = dist2.sqrt();
        if dist >= r {
            return None;
        }
        return Some((dx / dist, dy / dist, r - dist));
    }

    // Center is inside the solid: push out along the shallowest face, plus radius.
    let dl = px - left;
    let dr = right - px;
    let dt = py - top;
    let db = bottom - py;
    let min = dl.min(dr).min(dt).min(db);
    if (min - dl).abs() < 1e-12 {
        Some((-1.0, 0.0, r + dl))
    } else if (min - dr).abs() < 1e-12 {
        Some((1.0, 0.0, r + dr))
    } else if (min - dt).abs() < 1e-12 {
        Some((0.0, -1.0, r + dt))
    } else {
        Some((0.0, 1.0, r + db))
    }
}

#[cfg(test)]
mod move_slide_tests {
    use super::*;

    fn corridor() -> Maze {
        Maze {
            width: 5,
            height: 3,
            cells: vec![
                vec![true, true, true, true, true],
                vec![true, false, false, false, true],
                vec![true, true, true, true, true],
            ],
            start: (1, 1),
            exit: (3, 1),
        }
    }

    #[test]
    fn open_move_reaches_destination() {
        let maze = corridor();
        let (x, y) = maze.move_slide(2.5, 1.5, 0.3, 0.0, PLAYER_RADIUS);
        assert!((x - 2.8).abs() < 1e-6, "x={x}");
        assert!((y - 1.5).abs() < 1e-6, "y={y}");
    }

    #[test]
    fn head_on_wall_does_not_bounce() {
        let maze = corridor();
        let (x, y) = maze.move_slide(2.5, 1.5, 0.0, -0.6, PLAYER_RADIUS);
        assert!((x - 2.5).abs() < 0.02, "x={x}");
        assert!(y >= 1.0 + PLAYER_RADIUS - 0.02, "must not enter the wall, y={y}");
        assert!(y < 1.5, "should close on the wall, y={y}");
    }

    #[test]
    fn angled_hit_slides_along_tangent() {
        let maze = corridor();
        let start_x = 2.5;
        let (x, y) = maze.move_slide(start_x, 1.5, 0.35, -0.55, PLAYER_RADIUS);
        assert!(x > start_x + 0.12, "leftover should slide along +X, got x={x}");
        assert!(y < 1.5, "should approach the north wall, y={y}");
        assert!(
            y >= 1.0 + PLAYER_RADIUS - 0.03,
            "must not enter the wall, y={y}"
        );
        assert!(
            !maze.circle_blocked(x, y, PLAYER_RADIUS),
            "must not enter the wall"
        );
    }

    #[test]
    fn all_or_nothing_would_stick_slide_does_not() {
        let maze = corridor();
        let dest_x = 2.5 + 0.35;
        let dest_y = 1.5 - 0.55;
        assert!(
            maze.circle_blocked(dest_x, dest_y, PLAYER_RADIUS),
            "intended move must hit so this is a real slide case"
        );
        let (x, _) = maze.move_slide(2.5, 1.5, 0.35, -0.55, PLAYER_RADIUS);
        assert!(x > 2.5, "slide must keep the tangent component");
    }
}


