#!/usr/bin/env node
/**
 * Gold-path smoke checks for Matrix Maze production (MT-65).
 * Usage: node scripts/gold-path-smoke.mjs
 * Env: GOLD_PATH_URL (default https://matrix-maze.menhir-holdings.com)
 */

const base = (process.env.GOLD_PATH_URL || 'https://matrix-maze.menhir-holdings.com').replace(/\/$/, '');

async function fetchText(path) {
  const url = `${base}${path}`;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return { url, text: await res.text() };
}

function assertIncludes(haystack, needle, label) {
  if (!haystack.includes(needle)) {
    throw new Error(`${label}: expected to include "${needle}"`);
  }
}

async function main() {
  const checks = [];

  const landing = await fetchText('/');
  assertIncludes(landing.text, 'id="play-btn"', 'landing play button');
  assertIncludes(landing.text, '/game/', 'embedded game iframe');
  assertIncludes(landing.text, 'id="finish-plate"', 'landing finish plate');
  assertIncludes(landing.text, 'Skip to finish', 'landing skip to finish');
  assertIncludes(landing.text, 'id="handle-form"', 'landing handle form');
  if (/sign\s*up|sign\s*in|create an account/i.test(landing.text)) {
    throw new Error('landing: must not use account / sign-in copy');
  }
  assertIncludes(landing.text, 'favicon.svg', 'landing favicon');
  if (landing.text.includes('#9c968b')) {
    throw new Error('landing: mid-grey #9c968b must not remain');
  }
  checks.push(`landing ${landing.url}`);

  const scoresRes = await fetch(`${base}/api/scores`, { headers: { Accept: 'application/json' } });
  if (!scoresRes.ok) throw new Error(`/api/scores → HTTP ${scoresRes.status}`);
  const scoresJson = await scoresRes.json();
  if (!Array.isArray(scoresJson.scores)) throw new Error('/api/scores: expected { scores: [] }');
  checks.push(`scores store=${scoresJson.store || 'unknown'}`);

  const game = await fetchText('/game/');
  assertIncludes(game.text, 'Level 1', 'game level indicator');
  assertIncludes(game.text, 'WASD', 'game controls hint');
  checks.push(`game shell ${game.url}`);

  const scriptMatch = game.text.match(/src="(\/game\/assets\/index-[a-f0-9]+\.js)"/);
  if (!scriptMatch) throw new Error('game shell: main JS bundle not found');
  const bundle = await fetchText(scriptMatch[1]);
  let wasmPath;
  const wasmInBundle = bundle.text.match(/matrix_maze_bg-[a-f0-9]+\.wasm/);
  if (wasmInBundle) {
    wasmPath = `/game/assets/${wasmInBundle[0]}`;
  } else {
    const bgJsMatch = bundle.text.match(/matrix_maze_bg-[a-f0-9]+\.js/);
    if (!bgJsMatch) throw new Error('game bundle: wasm loader chunk not found');
    const bgJs = await fetchText(`/game/assets/${bgJsMatch[0]}`);
    const wasmInLoader = bgJs.text.match(/matrix_maze_bg-[a-f0-9]+\.wasm/);
    if (!wasmInLoader) throw new Error('wasm loader: wasm asset reference not found');
    wasmPath = `/game/assets/${wasmInLoader[0]}`;
  }
  const wasmRes = await fetch(`${base}${wasmPath}`);
  if (!wasmRes.ok) throw new Error(`${wasmPath} → HTTP ${wasmRes.status}`);
  const wasmBytes = (await wasmRes.arrayBuffer()).byteLength;
  if (wasmBytes < 50_000) throw new Error(`${wasmPath}: suspiciously small (${wasmBytes} bytes)`);
  checks.push(`wasm ${wasmPath} (${wasmBytes} bytes)`);

  console.log('Gold-path smoke OK:');
  for (const line of checks) console.log(`  ✓ ${line}`);
}

main().catch((err) => {
  console.error('Gold-path smoke FAILED:', err.message);
  process.exit(1);
});
