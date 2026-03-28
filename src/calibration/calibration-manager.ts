import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import type {
  CalibrationData,
  CalibrationSample,
  MonitorCalibration,
  MonitorLayout,
  HeadPose,
} from '../types.js';
import { SampleAggregator } from './sample-aggregator.js';
import {
  CALIBRATION_FORMAT_VERSION,
  CALIBRATION_DURATION_S,
} from '../config.js';

// ---------------------------------------------------------------------------
// Persistence schema
// ---------------------------------------------------------------------------

const MonitorCalibrationSchema = z.object({
  monitorId: z.number(),
  yaw: z.number(),
  pitch: z.number(),
  sampleCount: z.number(),
  capturedAt: z.number(),
});

export const CalibrationDataSchema = z.object({
  version: z.number(),
  monitors: z.array(MonitorCalibrationSchema),
  savedAt: z.number(),
});

// ---------------------------------------------------------------------------
// CalibrationManager
// ---------------------------------------------------------------------------

/**
 * Manages the calibration lifecycle:
 *  - Interactive sampling (2 seconds per monitor)
 *  - Persistence (read/write JSON)
 *  - Target-monitor lookup
 */
export class CalibrationManager {
  constructor(private readonly filePath: string) {}

  // ---------------------------------------------------------------------------
  // Calibration workflow
  // ---------------------------------------------------------------------------

  /**
   * Collect gaze samples for a single monitor over CALIBRATION_DURATION_S seconds.
   * Calls `onProgress(pct)` with 0–1 as sampling progresses.
   * Returns a MonitorCalibration or null if not enough face data was captured.
   */
  async collectSamples(
    monitorId: number,
    getPose: () => HeadPose | null,
    onProgress: (pct: number) => void = () => {},
    targetFps = 30,
  ): Promise<MonitorCalibration | null> {
    const durationMs = CALIBRATION_DURATION_S * 1000;
    const intervalMs = Math.round(1000 / targetFps);
    const startTime = Date.now();

    let aggregator = new SampleAggregator();

    await new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const pct = Math.min(elapsed / durationMs, 1);
        onProgress(pct);

        const pose = getPose();
        if (pose !== null) {
          const sample: CalibrationSample = {
            yaw: pose.yaw,
            pitch: pose.pitch,
            timestamp: pose.timestamp,
          };
          aggregator = aggregator.push(sample);
        }

        if (elapsed >= durationMs) {
          clearInterval(timer);
          resolve();
        }
      }, intervalMs);
    });

    const result = aggregator.median();
    if (result === null || aggregator.count < 5) return null;

    return Object.freeze({
      monitorId,
      yaw: result.yaw,
      pitch: result.pitch,
      sampleCount: aggregator.count,
      capturedAt: Date.now(),
    });
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  /** Load calibration data from disk. Returns null if none exists or is invalid. */
  load(): CalibrationData | null {
    if (!fs.existsSync(this.filePath)) return null;

    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = CalibrationDataSchema.parse(JSON.parse(raw));
      if (parsed.version !== CALIBRATION_FORMAT_VERSION) return null;
      return Object.freeze({
        version: parsed.version,
        monitors: Object.freeze(parsed.monitors.map((m) => Object.freeze(m))),
        savedAt: parsed.savedAt,
      });
    } catch {
      return null;
    }
  }

  /** Save calibration data to disk, creating directories as needed. */
  save(data: CalibrationData): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  /** Build a CalibrationData object from per-monitor results. */
  buildData(
    monitorCalibrations: ReadonlyArray<MonitorCalibration>,
  ): CalibrationData {
    return Object.freeze({
      version: CALIBRATION_FORMAT_VERSION,
      monitors: Object.freeze([...monitorCalibrations]),
      savedAt: Date.now(),
    });
  }

  /** Delete the calibration file. */
  reset(): void {
    if (fs.existsSync(this.filePath)) {
      fs.unlinkSync(this.filePath);
    }
  }

  // ---------------------------------------------------------------------------
  // Gaze → target monitor
  // ---------------------------------------------------------------------------

  /**
   * Determine which monitor the user is looking at using Euclidean distance
   * in yaw/pitch space, with hysteresis to prevent flickering.
   *
   * @param pose          Current smoothed head pose
   * @param data          Loaded calibration data
   * @param layout        Current monitor layout (for validation)
   * @param currentId     Currently focused monitor ID (for hysteresis)
   * @param hysteresis    Fraction by which current monitor distance is reduced (default 0.25)
   */
  targetMonitor(
    pose: HeadPose,
    data: CalibrationData,
    layout: MonitorLayout,
    currentId: number | null,
    hysteresis = 0.25,
  ): number | null {
    // Only consider monitors that exist in both layout and calibration data
    const validIds = new Set(layout.monitors.map((m) => m.id));
    const calibrated = data.monitors.filter((m) => validIds.has(m.monitorId));

    if (calibrated.length === 0) return null;

    let bestId: number | null = null;
    let bestDist = Infinity;

    for (const mc of calibrated) {
      let dist = Math.sqrt(
        (pose.yaw - mc.yaw) ** 2 + (pose.pitch - mc.pitch) ** 2,
      );

      // Hysteresis: reduce effective distance for the current monitor
      if (mc.monitorId === currentId) {
        dist *= 1 - hysteresis;
      }

      if (dist < bestDist) {
        bestDist = dist;
        bestId = mc.monitorId;
      }
    }

    return bestId;
  }

  /**
   * Whether calibration data is present for all monitors in the layout.
   */
  isCalibrated(data: CalibrationData | null, layout: MonitorLayout): boolean {
    if (!data) return false;
    const calibratedIds = new Set(data.monitors.map((m) => m.monitorId));
    return layout.monitors.every((m) => calibratedIds.has(m.id));
  }
}
