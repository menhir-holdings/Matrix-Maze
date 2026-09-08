# Matrix Maze — runtime music

OGG stems here are **copied from Kaiser**, not authored directly.

## Source of truth

`Menhir/Audio/Kaiser/composition/projects/matrix-maze/export/out/ogg/` (and `mp3/`)

## Update

1. In Kaiser: put WAVs in `projects/matrix-maze/export/inbox/`, then from Kaiser root:
   - `export\convert-stems.bat matrix-maze` (Windows) or `./export/convert-stems.sh matrix-maze`
2. From **this** directory’s app root (`Games/Matrix-Maze/app`):

   ```bash
   npm run music:sync
   ```

3. Reload the game / dev server.

Expected files (from Kaiser `project.json`):

- `matrix_maze_base.ogg`
- `matrix_maze_pressure.ogg`
- `matrix_maze_chase.ogg`
- `matrix_maze_dread.ogg`

Sync script: `scripts/sync-music-from-kaiser.js` (client-specific; other games add their own).
