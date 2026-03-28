import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CalibrationManager } from '../../src/calibration/calibration-manager';
import { CALIBRATION_FORMAT_VERSION } from '../../src/config';
import type { HeadPose, MonitorLayout } from '../../src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tmpFile(name: string): string {
  return path.join(os.tmpdir(), `eyeswitch-test-${name}-${Date.now()}.json`);
}

function makeLayout(ids: number[]): MonitorLayout {
  const monitors = ids.map((id, i) =>
    Object.freeze({ id, x: i * 1440, y: 0, width: 1440, height: 900, name: `M${id}`, isPrimary: i === 0 }),
  );
  return Object.freeze({ monitors: Object.freeze(monitors), primaryMonitorId: ids[0] ?? 0 });
}

// A mock getPose that always returns the same pose
function fixedPose(yaw: number, pitch: number): () => HeadPose {
  return () => Object.freeze({ yaw, pitch, timestamp: Date.now() });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CalibrationManager — full workflow', () => {
  let filePath: string;
  let manager: CalibrationManager;

  beforeEach(() => {
    filePath = tmpFile('cal-workflow');
    manager = new CalibrationManager(filePath);
  });

  afterEach(() => {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });

  // -------------------------------------------------------------------------
  // collectSamples
  // -------------------------------------------------------------------------

  it('collects samples and returns a frozen MonitorCalibration', async () => {
    const result = await manager.collectSamples(
      1,
      fixedPose(-20, 0),
      () => {},
      200, // 200fps → collects many samples in 2s (test uses real time — keep duration low)
    );
    // collectSamples runs for CALIBRATION_DURATION_S (2s). To keep the test
    // fast we rely on the fact that 2s is acceptable in CI, but if we want it
    // faster we can spy on the timer.  For this integration test we accept the
    // 2s runtime in exchange for testing the full pipeline.
    expect(result).not.toBeNull();
    expect(result!.monitorId).toBe(1);
    expect(result!.yaw).toBeCloseTo(-20, 1);
    expect(result!.pitch).toBeCloseTo(0, 1);
    expect(result!.sampleCount).toBeGreaterThan(0);
    expect(Object.isFrozen(result)).toBe(true);
  }, 10_000);

  it('returns null when getPose always returns null', async () => {
    const result = await manager.collectSamples(
      1,
      () => null,
      () => {},
      200,
    );
    expect(result).toBeNull();
  }, 10_000);

  it('invokes onProgress with values in [0, 1]', async () => {
    const values: number[] = [];
    await manager.collectSamples(
      1,
      fixedPose(0, 0),
      (pct) => { values.push(pct); },
      200,
    );
    expect(values.length).toBeGreaterThan(0);
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    // Last value must be 1 (or close to 1 — the interval fires when elapsed >= duration)
    expect(values[values.length - 1]).toBe(1);
  }, 10_000);

  // -------------------------------------------------------------------------
  // buildData / save / load round-trip
  // -------------------------------------------------------------------------

  it('saves and reloads calibration data correctly', () => {
    const cal = manager.buildData([
      Object.freeze({ monitorId: 1, yaw: -20, pitch: 0, sampleCount: 60, capturedAt: 1000 }),
      Object.freeze({ monitorId: 2, yaw:  20, pitch: 0, sampleCount: 60, capturedAt: 1000 }),
    ]);

    manager.save(cal);
    expect(fs.existsSync(filePath)).toBe(true);

    const loaded = manager.load();
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(CALIBRATION_FORMAT_VERSION);
    expect(loaded!.monitors).toHaveLength(2);
    expect(loaded!.monitors[0]!.monitorId).toBe(1);
    expect(loaded!.monitors[0]!.yaw).toBe(-20);
    expect(Object.isFrozen(loaded)).toBe(true);
    expect(Object.isFrozen(loaded!.monitors)).toBe(true);
    expect(Object.isFrozen(loaded!.monitors[0])).toBe(true);
  });

  it('load() returns null when file does not exist', () => {
    expect(manager.load()).toBeNull();
  });

  it('load() returns null for corrupted JSON', () => {
    fs.writeFileSync(filePath, '{ not valid json }', 'utf8');
    expect(manager.load()).toBeNull();
  });

  it('load() returns null for mismatched format version', () => {
    const badVersion = { version: 9999, monitors: [], savedAt: Date.now() };
    fs.writeFileSync(filePath, JSON.stringify(badVersion), 'utf8');
    expect(manager.load()).toBeNull();
  });

  // -------------------------------------------------------------------------
  // reset
  // -------------------------------------------------------------------------

  it('reset() deletes the calibration file', () => {
    const cal = manager.buildData([
      Object.freeze({ monitorId: 1, yaw: 0, pitch: 0, sampleCount: 10, capturedAt: 1000 }),
    ]);
    manager.save(cal);
    expect(fs.existsSync(filePath)).toBe(true);

    manager.reset();
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('reset() is a no-op when file does not exist', () => {
    expect(() => manager.reset()).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // isCalibrated
  // -------------------------------------------------------------------------

  it('isCalibrated() returns true when all monitors are calibrated', () => {
    const cal = manager.buildData([
      Object.freeze({ monitorId: 1, yaw: -20, pitch: 0, sampleCount: 60, capturedAt: 1000 }),
      Object.freeze({ monitorId: 2, yaw:  20, pitch: 0, sampleCount: 60, capturedAt: 1000 }),
    ]);
    const layout = makeLayout([1, 2]);
    expect(manager.isCalibrated(cal, layout)).toBe(true);
  });

  it('isCalibrated() returns false when a monitor is missing', () => {
    const cal = manager.buildData([
      Object.freeze({ monitorId: 1, yaw: -20, pitch: 0, sampleCount: 60, capturedAt: 1000 }),
    ]);
    const layout = makeLayout([1, 2]);
    expect(manager.isCalibrated(cal, layout)).toBe(false);
  });

  it('isCalibrated() returns false for null data', () => {
    const layout = makeLayout([1, 2]);
    expect(manager.isCalibrated(null, layout)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // targetMonitor (via calibration manager directly)
  // -------------------------------------------------------------------------

  it('targetMonitor() selects the closest calibrated monitor', () => {
    const cal = manager.buildData([
      Object.freeze({ monitorId: 1, yaw: -20, pitch: 0, sampleCount: 60, capturedAt: 1000 }),
      Object.freeze({ monitorId: 2, yaw:  20, pitch: 0, sampleCount: 60, capturedAt: 1000 }),
    ]);
    const layout = makeLayout([1, 2]);
    const pose: HeadPose = Object.freeze({ yaw: -18, pitch: 0, timestamp: Date.now() });
    expect(manager.targetMonitor(pose, cal, layout, null)).toBe(1);
  });

  it('targetMonitor() applies hysteresis to current monitor', () => {
    const cal = manager.buildData([
      Object.freeze({ monitorId: 1, yaw: -20, pitch: 0, sampleCount: 60, capturedAt: 1000 }),
      Object.freeze({ monitorId: 2, yaw:  20, pitch: 0, sampleCount: 60, capturedAt: 1000 }),
    ]);
    const layout = makeLayout([1, 2]);
    const pose: HeadPose = Object.freeze({ yaw: 0, pitch: 0, timestamp: Date.now() });
    // At yaw=0 (equidistant), hysteresis keeps current monitor
    expect(manager.targetMonitor(pose, cal, layout, 1)).toBe(1);
    expect(manager.targetMonitor(pose, cal, layout, 2)).toBe(2);
  });

  it('targetMonitor() returns null for empty calibration', () => {
    const cal = manager.buildData([]);
    const layout = makeLayout([1, 2]);
    const pose: HeadPose = Object.freeze({ yaw: 0, pitch: 0, timestamp: Date.now() });
    expect(manager.targetMonitor(pose, cal, layout, null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Single-monitor recalibration merge
// ---------------------------------------------------------------------------

describe('CalibrationManager — single-monitor recalibration merge', () => {
  let filePath: string;
  let manager: CalibrationManager;

  beforeEach(() => {
    filePath = tmpFile('cal-merge');
    manager = new CalibrationManager(filePath);
  });

  afterEach(() => {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });

  it('preserves data for other monitors when recalibrating a single monitor', async () => {
    // Seed calibration for monitors 1 and 2
    const initial = manager.buildData([
      Object.freeze({ monitorId: 1, yaw: -20, pitch: 0, sampleCount: 60, capturedAt: 1000 }),
      Object.freeze({ monitorId: 2, yaw:  20, pitch: 0, sampleCount: 60, capturedAt: 1000 }),
    ]);
    manager.save(initial);

    // Recalibrate only monitor 2 (new pose: yaw=25)
    const newMc = await manager.collectSamples(2, fixedPose(25, 0), () => {}, 200);
    expect(newMc).not.toBeNull();

    // Merge: keep monitor 1, replace monitor 2
    const existing = manager.load()!;
    const preserved = existing.monitors.filter((m) => m.monitorId !== 2);
    const merged = manager.buildData([...preserved, newMc!]);
    manager.save(merged);

    // Reload and verify
    const reloaded = manager.load()!;
    expect(reloaded.monitors).toHaveLength(2);

    const mon1 = reloaded.monitors.find((m) => m.monitorId === 1)!;
    const mon2 = reloaded.monitors.find((m) => m.monitorId === 2)!;

    // Monitor 1 is unchanged
    expect(mon1.yaw).toBe(-20);
    expect(mon1.sampleCount).toBe(60);

    // Monitor 2 is updated with the new pose
    expect(mon2.yaw).toBeCloseTo(25, 1);
    expect(mon2.sampleCount).toBeGreaterThan(0);
  }, 10_000);

  it('adds a new monitor entry when it did not exist before', async () => {
    // Start with only monitor 1 calibrated
    const initial = manager.buildData([
      Object.freeze({ monitorId: 1, yaw: -20, pitch: 0, sampleCount: 60, capturedAt: 1000 }),
    ]);
    manager.save(initial);

    // "Recalibrate" monitor 3 (new)
    const newMc = await manager.collectSamples(3, fixedPose(30, 5), () => {}, 200);
    expect(newMc).not.toBeNull();

    const existing = manager.load()!;
    const preserved = existing.monitors.filter((m) => m.monitorId !== 3);
    const merged = manager.buildData([...preserved, newMc!]);
    manager.save(merged);

    const reloaded = manager.load()!;
    expect(reloaded.monitors).toHaveLength(2);
    expect(reloaded.monitors.find((m) => m.monitorId === 1)).toBeDefined();
    expect(reloaded.monitors.find((m) => m.monitorId === 3)).toBeDefined();
  }, 10_000);
});
