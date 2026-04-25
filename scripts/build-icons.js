#!/usr/bin/env node
/**
 * Icon generation helper for LocalTranscribe.
 *
 * electron-builder auto-converts build/icon.png to platform-specific formats
 * (icns on macOS via iconutil, ico on Windows via its own tooling) during the
 * packaging step on each CI runner. You do NOT need to run this script in CI.
 *
 * Run this locally on macOS only to pre-generate build/icon.icns, which lets
 * you verify the icon looks correct before pushing a release tag.
 *
 * Usage:
 *   node scripts/build-icons.js
 *
 * Requirements (macOS only):
 *   - iconutil (bundled with Xcode Command Line Tools)
 *   - sips     (bundled with macOS)
 *
 * Replace build/icon.png with your 1024x1024 PNG before running.
 */

import { execSync } from 'node:child_process';
import { mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const src = join(root, 'build', 'icon.png');
const iconsetDir = join(root, 'build', 'icon.iconset');

if (process.platform !== 'darwin') {
  console.log('Icon pre-generation only supported on macOS.');
  console.log('electron-builder auto-generates icons during packaging on each CI runner.');
  process.exit(0);
}

if (!existsSync(src)) {
  console.error('build/icon.png not found. Provide a 1024x1024 PNG first.');
  process.exit(1);
}

console.log('Generating icon.iconset…');
if (existsSync(iconsetDir)) rmSync(iconsetDir, { recursive: true });
mkdirSync(iconsetDir);

const sizes = [16, 32, 64, 128, 256, 512, 1024];
for (const s of sizes) {
  execSync(`sips -z ${s} ${s} "${src}" --out "${join(iconsetDir, `icon_${s}x${s}.png`)}"`, { stdio: 'inherit' });
  if (s <= 512) {
    const s2 = s * 2;
    execSync(`sips -z ${s2} ${s2} "${src}" --out "${join(iconsetDir, `icon_${s}x${s}@2x.png`)}"`, { stdio: 'inherit' });
  }
}

console.log('Running iconutil…');
execSync(`iconutil -c icns "${iconsetDir}" -o "${join(root, 'build', 'icon.icns')}"`, { stdio: 'inherit' });
rmSync(iconsetDir, { recursive: true });
console.log('Done → build/icon.icns');
