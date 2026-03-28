# eyeswitch 👁

**Look at a screen. It gets focus.**

eyeswitch uses your webcam and TensorFlow.js to track where your head is pointing, then automatically moves macOS focus to whichever monitor you're looking at — no keyboard shortcut, no clicking, no magic.

---

## How it works

1. Your webcam captures frames at ~30 fps
2. MediaPipe FaceMesh extracts 468 3D facial landmarks
3. Yaw and pitch are derived from nose tip and eye positions
4. A calibration pass maps your gaze angles to each physical monitor
5. The native macOS helper (`eyeswitch-helper`) moves the cursor and fires a synthetic click to transfer focus

---

## Requirements

- **macOS** only (uses CoreGraphics + Accessibility APIs)
- Node.js ≥ 18
- Xcode Command Line Tools (`xcode-select --install`) — to compile the native helper
- A webcam

---

## Installation

```bash
npm install -g eyeswitch
```

On install, `npm` will automatically compile the native helper binary using `clang`. If it fails, run it manually:

```bash
npm run build:helper
```

Then grant **Accessibility** permission so the helper can move the cursor:

```
System Settings → Privacy & Security → Accessibility → enable Terminal (or your terminal app)
```

---

## Quick start

```bash
# Calibrate (look at each monitor when prompted)
eyeswitch calibrate

# Start tracking
eyeswitch
```

That's it. Move your eyes to a different screen and focus follows.

---

## Commands

### `eyeswitch` (default — start tracking)

```
eyeswitch [options]

Options:
  --calibrate            Force recalibration even if data already exists
  --camera <index>       Camera index (default: 0)
  --sensitivity <level>  Preset: low | medium | high
  --no-click             Warp cursor only — no synthetic click
  --dry-run              Detect gaze without actually switching focus
  --verbose              Print head pose on every frame
  --calibration-file     Custom path to calibration JSON
```

### `eyeswitch calibrate`

Walk through per-monitor calibration. Look at each screen and press Enter — eyeswitch samples your gaze for 2 seconds per monitor.

```
eyeswitch calibrate [--monitor <N>]   # recalibrate only monitor N (1-based)
```

### `eyeswitch config get [key]`

Print the current config (or a single value).

```bash
eyeswitch config get
eyeswitch config get smoothingFactor
```

### `eyeswitch config set <key> <value>`

Persist a config value to `~/.config/eyeswitch/config.json`.

```bash
eyeswitch config set smoothingFactor 0.4
eyeswitch config set switchCooldownMs 300
```

### `eyeswitch doctor`

Run a diagnostic check of all system dependencies.

```
  ✓  Native helper binary
  ✓  Accessibility permission
  ✗  Camera access
  ✓  Calibration data
  ✓  TF.js model
```

Exits 0 if everything is healthy, 1 if any check fails.

### `eyeswitch calibration export`

Dump calibration data to stdout (or a file with `-o`).

```bash
eyeswitch calibration export > ~/cal-backup.json
eyeswitch calibration export -o ~/cal-backup.json
```

### `eyeswitch calibration import <file>`

Load calibration from a JSON file (useful for restoring a backup or sharing across machines).

```bash
eyeswitch calibration import ~/cal-backup.json
```

### `eyeswitch status`

Show whether eyeswitch is calibrated and which monitor is currently focused.

### `eyeswitch reset`

Delete saved calibration data.

---

## Configuration

All values are stored in `~/.config/eyeswitch/config.json`.

| Key | Default | Description |
|---|---|---|
| `smoothingFactor` | `0.3` | EMA smoothing (0 = raw, approaching 1 = very smooth) |
| `switchCooldownMs` | `500` | Minimum ms between focus switches |
| `hysteresisFactor` | `0.25` | Bias toward staying on the current monitor (0–1) |
| `minFaceConfidence` | `0.7` | Minimum detection confidence to process a frame |
| `cameraIndex` | `0` | Which webcam to use |
| `targetFps` | `30` | Frame capture rate |
| `verticalSwitching` | `false` | Enable pitch-based switching for top/bottom monitors |

### Sensitivity presets

Instead of tuning individual values, use `--sensitivity`:

| Preset | smoothingFactor | hysteresisFactor | switchCooldownMs |
|---|---|---|---|
| `low` | 0.5 | 0.40 | 800 ms |
| `medium` | 0.3 | 0.25 | 500 ms (default) |
| `high` | 0.1 | 0.10 | 200 ms |

```bash
eyeswitch --sensitivity high
```

---

## Permissions

eyeswitch needs **two** macOS permissions:

| Permission | Why | Where to grant |
|---|---|---|
| **Camera** | To capture webcam frames for face detection | System Settings → Privacy → Camera |
| **Accessibility** | To move the cursor and simulate clicks | System Settings → Privacy → Accessibility |

If Accessibility is not granted, eyeswitch will warn on startup and tracking will run without focus switching (useful with `--dry-run`).

---

## Platform support

| Platform | Supported |
|---|---|
| macOS | ✅ Full support |
| Linux | ❌ Native helper is macOS-only |
| Windows | ❌ Not supported |

The TypeScript core (face detection, calibration, pose estimation) is platform-agnostic but the focus-switching mechanism uses macOS CoreGraphics and Accessibility APIs exclusively.

---

## Project structure

```
src/
  index.ts                  CLI entry point (Commander.js)
  cli.ts                    Output helpers (chalk, ora)
  config.ts                 Config schema, load/save, sensitivity presets
  types.ts                  Shared TypeScript interfaces
  camera/
    frame-capture.ts        Webcam → FrameBuffer (node-webcam + canvas)
  face/
    face-detector.ts        TF.js MediaPipe FaceMesh wrapper
    pose-estimator.ts       Landmark → yaw/pitch with EMA smoothing
  calibration/
    calibration-manager.ts  Sample collection, persistence, gaze→monitor mapping
    sample-aggregator.ts    Immutable median aggregator for calibration samples
  monitor/
    focus-switcher.ts       Calls native helper to move focus
    monitor-detector.ts     Queries monitor layout via native helper
    monitor-mapper.ts       Maps calibration data to MonitorLayout
  native/
    macos-bridge.ts         TS wrapper around the ObjC helper binary
    helper/
      eyeswitch-helper.m    Native ObjC binary (CoreGraphics, Accessibility)
```

---

## Development

```bash
git clone https://github.com/Abhijitam01/eyewatcher.git
cd eyewatcher
npm install          # also compiles the native helper
npm run build        # tsc → dist/
npm test             # jest (100 tests, ~80% coverage)
npm run typecheck    # tsc --noEmit
```

To iterate on the native helper:

```bash
npm run build:helper   # recompile eyeswitch-helper.m
```

---

## License

MIT
