#!/usr/bin/env node
import { Command } from 'commander';
import * as readline from 'readline';
import * as fs from 'fs';
import { printBanner, CLI, createSpinner } from './cli.js';
import {
  loadConfig,
  mergeConfig,
  saveConfig,
  validateConfig,
  CONFIG_FILE,
  SENSITIVITY_PRESETS,
} from './config.js';
import { FrameCapture } from './camera/frame-capture.js';
import { FaceDetector } from './face/face-detector.js';
import { PoseEstimator } from './face/pose-estimator.js';
import { CalibrationManager, CalibrationDataSchema } from './calibration/calibration-manager.js';
import { MonitorDetector } from './monitor/monitor-detector.js';
import { MonitorMapper } from './monitor/monitor-mapper.js';
import { FocusSwitcher } from './monitor/focus-switcher.js';
import {
  isHelperAvailable,
  checkAccessibilityPermission,
} from './native/macos-bridge.js';
import type {
  FrameBuffer,
  HeadPose,
  TrackingState,
  EyeSwitchConfig,
  MonitorLayout,
  CalibrationData,
  SensitivityLevel,
} from './types.js';

// ---------------------------------------------------------------------------
// Package version (injected at build time)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version } = require('../package.json') as { version: string };

// ---------------------------------------------------------------------------
// CLI definition
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name('eyeswitch')
  .description('Head-tracking monitor focus switcher — look at a screen, it gets focus')
  .version(version)
  .option('--calibrate', 'Force recalibration even if data already exists')
  .option('--camera <index>', 'Camera index to use (default: 0)', '0')
  .option('--verbose', 'Log head pose on every frame')
  .option('--dry-run', 'Detect gaze but do not actually switch focus')
  .option('--no-click', 'Warp cursor only — do not simulate a click')
  .option('--sensitivity <level>', 'Sensitivity preset: low | medium | high')
  .option('--calibration-file <path>', 'Custom path to calibration JSON file');

// ---------------------------------------------------------------------------
// calibrate subcommand
// ---------------------------------------------------------------------------

program
  .command('calibrate')
  .description('Run calibration and save results (then exit)')
  .option('--monitor <index>', 'Only recalibrate this monitor (1-based index)')
  .action(async (opts: Record<string, unknown>) => {
    const cfg = loadConfig();
    const monitorIndex =
      opts['monitor'] != null ? parseInt(String(opts['monitor']), 10) - 1 : null;
    await runCalibration(cfg, true, monitorIndex);
    process.exit(0);
  });

// ---------------------------------------------------------------------------
// status subcommand
// ---------------------------------------------------------------------------

program
  .command('status')
  .description('Show current calibration data and detected monitors')
  .action(() => {
    const cfg = loadConfig();
    const detector = new MonitorDetector();
    const calManager = new CalibrationManager(cfg.calibrationFilePath);

    const layout = detector.detect(1);
    const calData = calManager.load();

    CLI.brand('\nDetected monitors:');
    for (const m of layout.monitors) {
      console.log(
        `  ${m.isPrimary ? '★' : '·'} [${m.id}] ${m.name}  ${m.width}×${m.height} @ (${m.x}, ${m.y})`,
      );
    }

    CLI.brand('\nCalibration:');
    if (!calData) {
      CLI.warn('No calibration data found. Run "eyeswitch calibrate" first.');
    } else {
      for (const mc of calData.monitors) {
        const mon = layout.monitors.find((m) => m.id === mc.monitorId);
        const name = mon?.name ?? `Monitor ${mc.monitorId}`;
        console.log(
          `  · ${name}: yaw=${mc.yaw.toFixed(1)}°, pitch=${mc.pitch.toFixed(1)}°` +
            ` (${mc.sampleCount} samples)`,
        );
      }
    }
    console.log('');
    process.exit(0);
  });

// ---------------------------------------------------------------------------
// reset subcommand
// ---------------------------------------------------------------------------

program
  .command('reset')
  .description('Delete calibration data')
  .action(() => {
    const cfg = loadConfig();
    const calManager = new CalibrationManager(cfg.calibrationFilePath);
    calManager.reset();
    CLI.success('Calibration data cleared.');
    process.exit(0);
  });

// ---------------------------------------------------------------------------
// config subcommand
// ---------------------------------------------------------------------------

const configCmd = program
  .command('config')
  .description('Read or write config values');

configCmd
  .command('get [key]')
  .description('Show current config (or a specific key)')
  .action((key?: string) => {
    const cfg = loadConfig();
    if (key) {
      const val = (cfg as Record<string, unknown>)[key];
      if (val === undefined) {
        CLI.error(`Unknown config key: ${key}`);
        process.exit(1);
      }
      console.log(`${key} = ${String(val)}`);
    } else {
      CLI.brand('\neyeswitch config:');
      for (const [k, v] of Object.entries(cfg)) {
        console.log(`  ${k.padEnd(26)} ${String(v)}`);
      }
      console.log('');
    }
    process.exit(0);
  });

configCmd
  .command('set <key> <value>')
  .description('Set a config value and save to disk')
  .action((key: string, rawValue: string) => {
    // Type-coerce the raw string value
    let coerced: unknown = rawValue;
    if (rawValue === 'true') coerced = true;
    else if (rawValue === 'false') coerced = false;
    else if (!isNaN(Number(rawValue)) && rawValue.trim() !== '') coerced = Number(rawValue);

    try {
      validateConfig({ [key]: coerced });
    } catch (err) {
      CLI.error(`Invalid value for "${key}": ${String(err)}`);
      process.exit(1);
    }

    // Load raw file JSON (bypass Zod defaults so we only persist what the user set)
    let fileData: Record<string, unknown> = {};
    if (fs.existsSync(CONFIG_FILE)) {
      try {
        fileData = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) as Record<string, unknown>;
      } catch {
        // ignore — start fresh
      }
    }

    const updated = { ...fileData, [key]: coerced };
    const cfg = mergeConfig(loadConfig(), { [key]: coerced });
    saveConfig(cfg);
    void updated; // saved via saveConfig above
    CLI.success(`${key} = ${String(coerced)}`);
    process.exit(0);
  });

// ---------------------------------------------------------------------------
// doctor subcommand
// ---------------------------------------------------------------------------

program
  .command('doctor')
  .description('Check eyeswitch dependencies and permissions')
  .action(async () => {
    const cfg = loadConfig();
    const calManager = new CalibrationManager(cfg.calibrationFilePath);
    let allOk = true;

    console.log('');
    CLI.brand('  eyeswitch doctor\n');

    // 1. Native helper binary
    const helperOk = isHelperAvailable();
    CLI.doctorCheck(
      'Native helper binary',
      helperOk,
      helperOk ? 'bin/eyeswitch-helper exists' : 'Run "npm run build:helper" to compile',
    );
    allOk = allOk && helperOk;

    // 2. Accessibility permission
    const axOk = checkAccessibilityPermission();
    CLI.doctorCheck(
      'Accessibility permission',
      axOk,
      axOk
        ? 'AXIsProcessTrusted = true'
        : 'System Settings → Privacy & Security → Accessibility → enable Terminal',
    );
    allOk = allOk && axOk;

    // 3. Camera
    let cameraOk = false;
    try {
      const capture = new FrameCapture(cfg.cameraIndex, 1);
      // A quick probe: open and immediately stop
      await new Promise<void>((resolve, reject) => {
        let opened = false;
        const timeout = setTimeout(() => {
          if (!opened) reject(new Error('timeout'));
        }, 3000);
        capture.start(async () => {
          if (!opened) {
            opened = true;
            clearTimeout(timeout);
            capture.stop();
            resolve();
          }
        });
      });
      cameraOk = true;
    } catch {
      cameraOk = false;
    }
    CLI.doctorCheck(
      'Camera access',
      cameraOk,
      cameraOk
        ? `Camera index ${cfg.cameraIndex} opened`
        : 'Grant camera access: System Settings → Privacy & Security → Camera',
    );
    allOk = allOk && cameraOk;

    // 4. Calibration data
    const calData = calManager.load();
    const calOk = calData !== null;
    CLI.doctorCheck(
      'Calibration data',
      calOk,
      calOk
        ? `${calData!.monitors.length} monitor(s) calibrated`
        : 'Run "eyeswitch calibrate" to set up',
    );
    // Calibration missing is a warning, not a hard fail
    if (!calOk) allOk = false;

    // 5. TF.js model
    let modelOk = false;
    let modelDetail = '';
    try {
      const faceDetector = new FaceDetector();
      await faceDetector.initialize();
      faceDetector.dispose();
      modelOk = true;
      modelDetail = 'FaceMesh model loaded';
    } catch (err) {
      modelDetail = String(err).split('\n')[0] ?? 'unknown error';
    }
    CLI.doctorCheck('TF.js FaceMesh model', modelOk, modelDetail);
    allOk = allOk && modelOk;

    console.log('');
    if (allOk) {
      CLI.success('All checks passed — eyeswitch is ready to run.');
    } else {
      CLI.warn('Some checks failed. Fix the issues above before running eyeswitch.');
    }
    console.log('');
    process.exit(allOk ? 0 : 1);
  });

// ---------------------------------------------------------------------------
// calibration subcommand (export / import)
// ---------------------------------------------------------------------------

const calCmd = program
  .command('calibration')
  .description('Manage calibration data');

calCmd
  .command('export')
  .description('Export calibration data as JSON (stdout or --output file)')
  .option('-o, --output <file>', 'Write to file instead of stdout')
  .action((opts: Record<string, unknown>) => {
    const cfg = loadConfig();
    const calManager = new CalibrationManager(cfg.calibrationFilePath);
    const data = calManager.load();
    if (!data) {
      CLI.error('No calibration data found. Run "eyeswitch calibrate" first.');
      process.exit(1);
    }
    const json = JSON.stringify(data, null, 2);
    if (opts['output']) {
      fs.writeFileSync(String(opts['output']), json, 'utf8');
      CLI.success(`Exported to ${String(opts['output'])}`);
    } else {
      process.stdout.write(json + '\n');
    }
    process.exit(0);
  });

calCmd
  .command('import <file>')
  .description('Import calibration data from a JSON file')
  .action((file: string) => {
    const cfg = loadConfig();
    const calManager = new CalibrationManager(cfg.calibrationFilePath);
    let raw: string;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch {
      CLI.error(`Cannot read file: ${file}`);
      process.exit(1);
    }
    let data: CalibrationData;
    try {
      const parsed = CalibrationDataSchema.parse(JSON.parse(raw));
      data = Object.freeze({
        version: parsed.version,
        monitors: Object.freeze(parsed.monitors.map((m) => Object.freeze(m))),
        savedAt: parsed.savedAt,
      }) as CalibrationData;
    } catch (err) {
      CLI.error(`Invalid calibration file: ${String(err)}`);
      process.exit(1);
    }
    calManager.save(data);
    CLI.success(`Imported ${data.monitors.length} monitor(s) from ${file}`);
    process.exit(0);
  });

// ---------------------------------------------------------------------------
// Main tracking command
// ---------------------------------------------------------------------------

program.action(async (opts: Record<string, unknown>) => {
  const overrides = {
    cameraIndex: opts['camera'] ? parseInt(String(opts['camera']), 10) : undefined,
    calibrationFilePath: opts['calibrationFile'] ? String(opts['calibrationFile']) : undefined,
  };
  // Remove undefined keys
  const cleanOverrides = Object.fromEntries(
    Object.entries(overrides).filter(([, v]) => v !== undefined),
  );

  // Apply sensitivity preset if provided
  const sensitivityKey = opts['sensitivity'] as SensitivityLevel | undefined;
  const sensitivityOverrides =
    sensitivityKey && sensitivityKey in SENSITIVITY_PRESETS
      ? SENSITIVITY_PRESETS[sensitivityKey]
      : {};

  const cfg = mergeConfig(loadConfig(), { ...cleanOverrides, ...sensitivityOverrides });
  const forceCalibrate = Boolean(opts['calibrate']);
  const dryRun = Boolean(opts['dryRun']);
  const noClick = Boolean(opts['noClick']);
  const verbose = Boolean(opts['verbose']);

  printBanner(version);

  await runMain(cfg, { forceCalibrate, dryRun, noClick, verbose });
});

program.parseAsync(process.argv).catch((err: unknown) => {
  CLI.error(String(err));
  process.exit(1);
});

// ---------------------------------------------------------------------------
// Calibration flow
// ---------------------------------------------------------------------------

async function runCalibration(
  cfg: EyeSwitchConfig,
  exitAfter: boolean,
  monitorIndex: number | null = null,
): Promise<CalibrationData | null> {
  const detector = new MonitorDetector();
  const layout = detector.detect(2);

  const calManager = new CalibrationManager(cfg.calibrationFilePath);
  const faceDetector = new FaceDetector();
  const poseEstimator = new PoseEstimator(cfg.smoothingFactor);

  // Filter to single monitor if --monitor N was given
  const monitorsToCalibrate =
    monitorIndex !== null
      ? layout.monitors.filter((_, i) => i === monitorIndex)
      : [...layout.monitors];

  if (monitorsToCalibrate.length === 0) {
    CLI.error(
      `Monitor index ${monitorIndex != null ? monitorIndex + 1 : '?'} not found ` +
        `(detected ${layout.monitors.length} monitor(s)).`,
    );
    return null;
  }

  CLI.info('Loading face detection model…');
  const initSpinner = createSpinner('Initialising TF.js FaceMesh…').start();
  await faceDetector.initialize();
  initSpinner.succeed('Model ready');

  // Shared pose/confidence state updated by camera loop
  let latestPose: HeadPose | null = null;
  let latestConfidence: number | null = null;

  const capture = new FrameCapture(cfg.cameraIndex, cfg.targetFps);
  capture.start(async (frame: FrameBuffer) => {
    const landmarks = await faceDetector.detect(frame, cfg.minFaceConfidence);
    latestPose = landmarks ? poseEstimator.estimate(landmarks) : null;
    latestConfidence = landmarks?.score ?? null;
  });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const waitForEnter = () =>
    new Promise<void>((resolve) => rl.question('', () => resolve()));

  const newCalibrations = [];

  for (let i = 0; i < monitorsToCalibrate.length; i++) {
    const monitor = monitorsToCalibrate[i];
    CLI.calibrationPrompt(monitor.name, i + 1, monitorsToCalibrate.length);
    await waitForEnter();

    const spinner = createSpinner('Sampling…').start();

    const mc = await calManager.collectSamples(
      monitor.id,
      () => latestPose,
      (pct) => CLI.calibrationProgress(pct, spinner, latestConfidence),
      cfg.targetFps,
    );

    if (!mc) {
      spinner.fail(`Could not detect face for ${monitor.name} — please retry`);
      i--; // retry this monitor
      continue;
    }

    spinner.stop();
    CLI.calibrationResult(monitor.name, mc.yaw, mc.pitch);
    newCalibrations.push(mc);
  }

  rl.close();
  capture.stop();
  faceDetector.dispose();

  // If recalibrating a single monitor, merge into existing data
  const existingData = monitorIndex !== null ? calManager.load() : null;
  const existingMonitors = existingData
    ? existingData.monitors.filter(
        (m) => !newCalibrations.some((nc) => nc.monitorId === m.monitorId),
      )
    : [];

  const data = calManager.buildData([...existingMonitors, ...newCalibrations]);
  calManager.save(data);
  CLI.success(`Calibration saved to ${cfg.calibrationFilePath}`);

  if (exitAfter) return data;
  return data;
}

// ---------------------------------------------------------------------------
// Main tracking loop
// ---------------------------------------------------------------------------

async function runMain(
  cfg: EyeSwitchConfig,
  opts: { forceCalibrate: boolean; dryRun: boolean; noClick: boolean; verbose: boolean },
): Promise<void> {
  const monitorDetector = new MonitorDetector();
  const calManager = new CalibrationManager(cfg.calibrationFilePath);
  const focusSwitcher = new FocusSwitcher(opts.dryRun, opts.noClick);

  // Check Accessibility permission and warn if missing
  if (!opts.dryRun && !checkAccessibilityPermission()) {
    CLI.warn(
      'Accessibility permission not granted.\n' +
        '  → System Settings → Privacy & Security → Accessibility → enable Terminal\n' +
        '  Focus switching will not work until this is granted.',
    );
  }

  // Require at least 2 monitors for tracking to be meaningful
  const layout: MonitorLayout = monitorDetector.detect(opts.dryRun ? 1 : 2);

  // Calibration
  let calData: CalibrationData | null = calManager.load();
  if (!calData || opts.forceCalibrate || !calManager.isCalibrated(calData, layout)) {
    if (calData && !opts.forceCalibrate) {
      CLI.warn('Calibration data is incomplete — starting calibration…');
    } else if (!calData) {
      CLI.info('No calibration data found — starting calibration…');
    }
    calData = await runCalibration(cfg, false);
    if (!calData) {
      CLI.error('Calibration failed.');
      process.exit(1);
    }
  }

  const capturedCalibration = calData;

  // Model init
  CLI.info('Loading face detection model…');
  const initSpinner = createSpinner('Initialising TF.js FaceMesh…').start();
  const faceDetector = new FaceDetector();
  await faceDetector.initialize();
  initSpinner.succeed('Model ready — tracking started');

  if (opts.dryRun) CLI.warn('Dry-run mode: focus switches will be logged only');
  if (opts.noClick) CLI.warn('No-click mode: cursor will warp but not click');

  const poseEstimator = new PoseEstimator(cfg.smoothingFactor);
  const monitorMapper = new MonitorMapper(calManager, cfg.hysteresisFactor);

  let state: TrackingState = Object.freeze({
    currentMonitorId: focusSwitcher.currentMonitorId(),
    lastSwitchAt: 0,
    frameCount: 0,
    isPaused: false,
  });

  // Pause on 'p' keypress
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.on('data', (buf: Buffer) => {
      if (buf.toString() === 'p') {
        state = Object.freeze({ ...state, isPaused: !state.isPaused });
        if (state.isPaused) {
          CLI.warn('\nTracking paused — press p to resume');
        } else {
          CLI.info('\nTracking resumed');
        }
      }
      // Ctrl+C
      if (buf[0] === 3) process.emit('SIGINT');
    });
  }

  // Graceful shutdown
  let running = true;
  const shutdown = () => {
    running = false;
    capture.stop();
    faceDetector.dispose();
    CLI.newline();
    CLI.info('eyeswitch stopped');
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  const capture = new FrameCapture(cfg.cameraIndex, cfg.targetFps);
  capture.start(async (frame: FrameBuffer) => {
    if (!running || state.isPaused) return;

    const landmarks = await faceDetector.detect(frame, cfg.minFaceConfidence);
    if (!landmarks) return;

    const pose = poseEstimator.estimate(landmarks);
    const target = monitorMapper.map(
      pose,
      capturedCalibration,
      layout,
      state.currentMonitorId,
    );

    if (!target) return;

    const monitorName =
      layout.monitors.find((m) => m.id === target.monitorId)?.name ??
      `Monitor ${target.monitorId}`;

    if (opts.verbose) {
      CLI.trackingStatus(monitorName, pose.yaw, pose.pitch);
    }

    state = Object.freeze({
      ...state,
      frameCount: state.frameCount + 1,
    });

    // Switch if target differs from current and cooldown elapsed
    const now = Date.now();
    const cooldownOk = now - state.lastSwitchAt >= cfg.switchCooldownMs;
    const monitorChanged = target.monitorId !== state.currentMonitorId;

    if (monitorChanged && cooldownOk) {
      const fromName =
        state.currentMonitorId !== null
          ? (layout.monitors.find((m) => m.id === state.currentMonitorId)?.name ?? null)
          : null;

      CLI.focusSwitch(fromName, monitorName);
      focusSwitcher.focus(target.monitorId);

      state = Object.freeze({
        ...state,
        currentMonitorId: target.monitorId,
        lastSwitchAt: now,
      });
    }
  });

  // Keep process alive
  await new Promise<void>((resolve) => {
    process.on('SIGINT', resolve);
    process.on('SIGTERM', resolve);
  });
}
