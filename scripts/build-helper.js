#!/usr/bin/env node
/**
 * scripts/build-helper.js
 *
 * Cross-platform build script for the eyeswitch native helper binary.
 * Invoked automatically via "npm run build:helper" (and postinstall).
 *
 * macOS  → clang (Xcode Command Line Tools required)
 * Windows → gcc via MinGW/MSYS2 (preferred) or MSVC cl.exe (fallback)
 * Linux  → not yet supported; prints a warning and exits cleanly
 */

'use strict';

const { execSync, spawnSync } = require('child_process');
const path = require('path');
const fs   = require('fs');

const ROOT     = path.resolve(__dirname, '..');
const SRC_DIR  = path.join(ROOT, 'src', 'native', 'helper');
const BIN_DIR  = path.join(ROOT, 'bin');

function ensureBinDir() {
  if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
  }
}

function commandExists(cmd) {
  const result = spawnSync(cmd, ['--version'], { stdio: 'ignore', shell: false });
  return result.status === 0 || result.error == null && result.status !== null;
}

function run(cmd, description) {
  console.log(`  → ${description}`);
  try {
    execSync(cmd, { stdio: 'inherit', cwd: ROOT });
  } catch (err) {
    console.error(`\n  ✗ Build failed: ${description}`);
    console.error(`    Command: ${cmd}`);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// macOS
// ---------------------------------------------------------------------------
function buildMacOS() {
  const src = path.join(SRC_DIR, 'eyeswitch-helper.m');
  const out = path.join(BIN_DIR, 'eyeswitch-helper');

  if (!fs.existsSync(src)) {
    throw new Error(`Source file not found: ${src}`);
  }

  const cmd = [
    'clang',
    '-framework Cocoa',
    '-framework CoreGraphics',
    '-framework AppKit',
    '-framework ApplicationServices',
    `"${src}"`,
    `-o "${out}"`,
  ].join(' ');

  run(cmd, 'Compiling macOS native helper with clang');
  fs.chmodSync(out, 0o755);
  console.log(`  ✓ Built: ${path.relative(ROOT, out)}`);
}

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------
function buildWindows() {
  const prebuilt = path.join(ROOT, 'bin', 'prebuilt', 'eyeswitch-helper.exe');
  const out      = path.join(BIN_DIR, 'eyeswitch-helper.exe');

  // Use the pre-compiled binary shipped in the npm package (no compiler needed)
  if (fs.existsSync(prebuilt)) {
    fs.copyFileSync(prebuilt, out);
    console.log('  ✓ Using pre-built: bin/prebuilt/eyeswitch-helper.exe');
    return;
  }

  // Developer fallback: compile from source when prebuilt is not present
  const src = path.join(SRC_DIR, 'eyeswitch-helper-win.c');

  if (!fs.existsSync(src)) {
    throw new Error(`Source file not found: ${src}`);
  }

  // Prefer gcc (MinGW/MSYS2)
  if (commandExists('gcc')) {
    const cmd = `gcc "${src}" -o "${out}" -luser32 -lgdi32 -DUNICODE -D_UNICODE`;
    run(cmd, 'Compiling Windows native helper with gcc (MinGW)');
    console.log(`  ✓ Built: ${path.relative(ROOT, out)}`);
    return;
  }

  // Fallback: MSVC cl.exe
  if (commandExists('cl')) {
    const cmd = `cl "${src}" /Fe:"${out}" /link user32.lib gdi32.lib`;
    run(cmd, 'Compiling Windows native helper with MSVC cl');
    console.log(`  ✓ Built: ${path.relative(ROOT, out)}`);
    return;
  }

  throw new Error(
    'No suitable C compiler found.\n' +
    '  Please install one of:\n' +
    '    • MinGW/MSYS2 with gcc  (https://www.msys2.org/)\n' +
    '    • Visual Studio Build Tools (https://aka.ms/vs/17/release/vs_BuildTools.exe)\n' +
    '  Then re-run: npm run build:helper',
  );
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
function main() {
  console.log('\nBuilding eyeswitch native helper...');
  ensureBinDir();

  try {
    if (process.platform === 'darwin') {
      buildMacOS();
    } else if (process.platform === 'win32') {
      buildWindows();
    } else {
      console.warn(
        `  ⚠ Platform "${process.platform}" is not yet supported by the native helper.\n` +
        '    Monitor detection will fall back to stub mode.\n' +
        '    Focus switching will be unavailable.',
      );
      process.exit(0);
    }
  } catch (err) {
    console.error('\n  Helper build failed (non-fatal):', err.message ?? err);
    console.error('  eyeswitch will run in limited mode without focus switching.');
    // Exit 0 so "npm install" succeeds even without a compiler
    process.exit(0);
  }

  console.log('');
}

main();
