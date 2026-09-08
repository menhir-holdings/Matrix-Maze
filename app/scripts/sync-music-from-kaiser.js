#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Matrix Maze — sync built music from Kaiser into this app.
 * Source of truth: Menhir/Audio/Kaiser/composition/projects/<project-id>/export/out/
 * Reads stem list from that project's project.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, '..');
const args = process.argv.slice(2);

const projectIndex = args.indexOf('--project');
const projectId = projectIndex !== -1 && args[projectIndex + 1] ? args[projectIndex + 1] : 'matrix-maze';

const kaiserIndex = args.indexOf('--kaiser-root');
const kaiserRoot = kaiserIndex !== -1 && args[kaiserIndex + 1]
  ? path.resolve(process.cwd(), args[kaiserIndex + 1])
  : path.resolve(appDir, '../../../Audio/Kaiser/composition');

const configPath = path.join(kaiserRoot, 'projects', projectId, 'project.json');
if (!fs.existsSync(configPath)) {
  console.error(`Kaiser project config not found: ${configPath}`);
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const stemPrefix = config.stemPrefix;
const stems = config.stems || [];
if (!stemPrefix || stems.length === 0) {
  console.error('Invalid Kaiser project config: missing stemPrefix/stems');
  process.exit(1);
}

const srcOggDir = path.join(kaiserRoot, 'projects', projectId, 'export', 'out', 'ogg');
const srcMp3Dir = path.join(kaiserRoot, 'projects', projectId, 'export', 'out', 'mp3');
const targetDir = path.join(appDir, 'public', 'audio', 'music');

fs.mkdirSync(targetDir, { recursive: true });

for (const stem of stems) {
  const baseName = `${stemPrefix}_${stem}`;
  const oggSrc = path.join(srcOggDir, `${baseName}.ogg`);
  const mp3Src = path.join(srcMp3Dir, `${baseName}.mp3`);
  const oggDst = path.join(targetDir, `${baseName}.ogg`);
  const mp3Dst = path.join(targetDir, `${baseName}.mp3`);

  if (!fs.existsSync(oggSrc)) {
    console.error(`Missing OGG stem (run Kaiser export/convert-stems first): ${oggSrc}`);
    process.exit(1);
  }
  fs.copyFileSync(oggSrc, oggDst);
  if (fs.existsSync(mp3Src)) {
    fs.copyFileSync(mp3Src, mp3Dst);
  }
  console.log(`Synced: ${baseName}.ogg${fs.existsSync(mp3Src) ? ' + .mp3' : ''}`);
}

console.log(`Done. Synced Kaiser project '${projectId}' → ${targetDir}`);
