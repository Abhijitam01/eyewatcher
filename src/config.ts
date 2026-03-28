import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { z } from 'zod';
import type { EyeSwitchConfig, PartialConfig } from './types.js';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const ConfigSchema = z.object({
  smoothingFactor: z.number().min(0).max(0.99).default(0.3),
  switchCooldownMs: z.number().min(100).max(5000).default(500),
  hysteresisFactor: z.number().min(0).max(0.99).default(0.25),
  minFaceConfidence: z.number().min(0.1).max(1).default(0.7),
  cameraIndex: z.number().int().min(0).default(0),
  calibrationFilePath: z
    .string()
    .default(path.join(os.homedir(), '.config', 'eyeswitch', 'calibration.json')),
  targetFps: z.number().int().min(5).max(60).default(30),
  verticalSwitching: z.boolean().default(false),
});

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_CONFIG: EyeSwitchConfig = Object.freeze(ConfigSchema.parse({}));

const CONFIG_DIR = path.join(os.homedir(), '.config', 'eyeswitch');
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// ---------------------------------------------------------------------------
// Load / Save
// ---------------------------------------------------------------------------

/**
 * Load config from disk, merging with defaults.
 * Returns a frozen (immutable) config object.
 */
export function loadConfig(overrides: PartialConfig = {}): EyeSwitchConfig {
  let fileData: Record<string, unknown> = {};

  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
      fileData = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // Malformed config — fall back to defaults
    }
  }

  const merged = { ...fileData, ...overrides };
  const parsed = ConfigSchema.parse(merged);
  return Object.freeze(parsed);
}

/**
 * Persist config to disk. Creates the config directory if needed.
 */
export function saveConfig(config: EyeSwitchConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}

/**
 * Validate a partial config object. Throws a ZodError if invalid.
 */
export function validateConfig(partial: PartialConfig): PartialConfig {
  return ConfigSchema.partial().parse(partial);
}

/**
 * Merge partial overrides onto a base config, returning a new frozen object.
 */
export function mergeConfig(
  base: EyeSwitchConfig,
  overrides: PartialConfig,
): EyeSwitchConfig {
  const merged = ConfigSchema.parse({ ...base, ...overrides });
  return Object.freeze(merged);
}

// ---------------------------------------------------------------------------
// Sensitivity presets
// ---------------------------------------------------------------------------

import type { SensitivityLevel } from './types.js';

export const SENSITIVITY_PRESETS: Record<SensitivityLevel, PartialConfig> = Object.freeze({
  low:    Object.freeze({ smoothingFactor: 0.5, hysteresisFactor: 0.4,  switchCooldownMs: 800 }),
  medium: Object.freeze({ smoothingFactor: 0.3, hysteresisFactor: 0.25, switchCooldownMs: 500 }),
  high:   Object.freeze({ smoothingFactor: 0.1, hysteresisFactor: 0.1,  switchCooldownMs: 200 }),
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Version of the calibration file format. */
export const CALIBRATION_FORMAT_VERSION = 2;

/** Number of seconds to sample gaze per monitor during calibration. */
export const CALIBRATION_DURATION_S = 2;

/** Landmark index for nose tip in MediaPipe 468-point model. */
export const NOSE_TIP_INDEX = 1;

/** Landmark indices for left and right eye centres. */
export const LEFT_EYE_INDICES = [33, 133] as const;
export const RIGHT_EYE_INDICES = [362, 263] as const;

/** Empirical yaw/pitch scaling factor from 2D offset ratio. */
export const POSE_SCALING_FACTOR = 1.5;
