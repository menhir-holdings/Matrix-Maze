import { defineConfig } from 'vite';

function isWebGameBuild() {
  const idx = process.argv.indexOf('--outDir');
  if (idx === -1) return false;
  return String(process.argv[idx + 1] || '').replace(/\\/g, '/').endsWith('game');
}

export default defineConfig({
  // Set here (not `--base=/game/`) so Git Bash/MSYS cannot rewrite the prefix.
  base: isWebGameBuild() ? '/game/' : '/',
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    fs: {
      allow: ['..'],
    },
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: ['es2021', 'chrome100', 'safari13'],
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});

