import { CalibrationManager } from '../../src/calibration/calibration-manager';
import { MonitorMapper } from '../../src/monitor/monitor-mapper';
import type { HeadPose, MonitorLayout, CalibrationData } from '../../src/types';
import { CALIBRATION_FORMAT_VERSION } from '../../src/config';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLayout(
  entries: Array<{ id: number; x: number }>,
): MonitorLayout {
  const monitors = entries.map((e, i) =>
    Object.freeze({ id: e.id, x: e.x, y: 0, width: 1440, height: 900, name: `M${e.id}`, isPrimary: i === 0 }),
  );
  return Object.freeze({ monitors: Object.freeze(monitors), primaryMonitorId: entries[0]?.id ?? 0 });
}

function makeCalibration(
  entries: Array<{ id: number; yaw: number; pitch?: number }>,
): CalibrationData {
  return Object.freeze({
    version: CALIBRATION_FORMAT_VERSION,
    monitors: Object.freeze(
      entries.map((e) =>
        Object.freeze({
          monitorId: e.id,
          yaw: e.yaw,
          pitch: e.pitch ?? 0,
          sampleCount: 60,
          capturedAt: Date.now(),
        }),
      ),
    ),
    savedAt: Date.now(),
  });
}

function makePose(yaw: number, pitch = 0): HeadPose {
  return Object.freeze({ yaw, pitch, timestamp: Date.now() });
}

// Shared manager — no disk I/O needed for these tests
const manager = new CalibrationManager('/tmp/eyeswitch-gaze-to-monitor-test.json');

// ---------------------------------------------------------------------------
// Tests: end-to-end gaze → monitor pipeline
// ---------------------------------------------------------------------------

describe('gaze-to-monitor pipeline (integration)', () => {
  describe('two-monitor horizontal layout', () => {
    const layout = makeLayout([{ id: 1, x: 0 }, { id: 2, x: 1440 }]);
    const calibration = makeCalibration([
      { id: 1, yaw: -25 },
      { id: 2, yaw:  25 },
    ]);
    const mapper = new MonitorMapper(manager, 0.25);

    it('routes a leftward gaze to monitor 1', () => {
      const result = mapper.map(makePose(-22), calibration, layout, null);
      expect(result?.monitorId).toBe(1);
    });

    it('routes a rightward gaze to monitor 2', () => {
      const result = mapper.map(makePose(22), calibration, layout, null);
      expect(result?.monitorId).toBe(2);
    });

    it('returns a non-negative distance', () => {
      const result = mapper.map(makePose(-22), calibration, layout, null);
      expect(result!.distance).toBeGreaterThanOrEqual(0);
    });

    it('GazeTarget is frozen', () => {
      const result = mapper.map(makePose(-22), calibration, layout, null);
      expect(Object.isFrozen(result)).toBe(true);
    });

    it('hysteresis keeps current monitor at yaw=0 (equidistant)', () => {
      const resultCurrentIs1 = mapper.map(makePose(0), calibration, layout, 1);
      const resultCurrentIs2 = mapper.map(makePose(0), calibration, layout, 2);
      expect(resultCurrentIs1?.monitorId).toBe(1);
      expect(resultCurrentIs2?.monitorId).toBe(2);
    });

    it('returns null when calibration is empty', () => {
      const emptyCalibration = makeCalibration([]);
      const result = mapper.map(makePose(0), emptyCalibration, layout, null);
      expect(result).toBeNull();
    });
  });

  describe('three-monitor horizontal layout', () => {
    const layout = makeLayout([{ id: 1, x: 0 }, { id: 2, x: 1440 }, { id: 3, x: 2880 }]);
    const calibration = makeCalibration([
      { id: 1, yaw: -30 },
      { id: 2, yaw:   0 },
      { id: 3, yaw:  30 },
    ]);
    const mapper = new MonitorMapper(manager, 0.25);

    it.each([
      [-28, 1],
      [  0, 2],
      [ 28, 3],
    ])('yaw=%i maps to monitor %i', (yaw, expectedMonitor) => {
      const result = mapper.map(makePose(yaw), calibration, layout, null);
      expect(result?.monitorId).toBe(expectedMonitor);
    });
  });

  describe('single-monitor layout', () => {
    const layout = makeLayout([{ id: 1, x: 0 }]);
    const calibration = makeCalibration([{ id: 1, yaw: 0 }]);
    const mapper = new MonitorMapper(manager, 0.25);

    it('always maps to the only monitor regardless of gaze angle', () => {
      for (const yaw of [-45, -20, 0, 20, 45]) {
        const result = mapper.map(makePose(yaw), calibration, layout, null);
        expect(result?.monitorId).toBe(1);
      }
    });
  });

  describe('layout/calibration mismatch', () => {
    it('ignores calibration entries for monitors not in layout', () => {
      const layout = makeLayout([{ id: 1, x: 0 }]);
      // Calibration has monitors 1 and 99 — only 1 is in layout
      const calibration = makeCalibration([
        { id:  1, yaw: -20 },
        { id: 99, yaw:  20 }, // ghost monitor
      ]);
      const mapper = new MonitorMapper(manager, 0.25);

      // Even gaze far to the right should map to monitor 1 (only valid option)
      const result = mapper.map(makePose(45), calibration, layout, null);
      expect(result?.monitorId).toBe(1);
    });
  });

  describe('vertical monitor support (pitch-based)', () => {
    const layout = makeLayout([{ id: 1, x: 0 }, { id: 2, x: 0 }]);
    const calibration = makeCalibration([
      { id: 1, yaw: 0, pitch: -10 }, // top monitor
      { id: 2, yaw: 0, pitch:  10 }, // bottom monitor
    ]);
    const mapper = new MonitorMapper(manager, 0.25);

    it('maps upward pitch to top monitor (id=1)', () => {
      const result = mapper.map(makePose(0, -8), calibration, layout, null);
      expect(result?.monitorId).toBe(1);
    });

    it('maps downward pitch to bottom monitor (id=2)', () => {
      const result = mapper.map(makePose(0, 8), calibration, layout, null);
      expect(result?.monitorId).toBe(2);
    });
  });

  describe('CalibrationManager.isCalibrated integration', () => {
    it('reports true when every layout monitor is calibrated', () => {
      const layout = makeLayout([{ id: 1, x: 0 }, { id: 2, x: 1440 }]);
      const calibration = makeCalibration([{ id: 1, yaw: -20 }, { id: 2, yaw: 20 }]);
      expect(manager.isCalibrated(calibration, layout)).toBe(true);
    });

    it('reports false when a layout monitor is not calibrated', () => {
      const layout = makeLayout([{ id: 1, x: 0 }, { id: 2, x: 1440 }, { id: 3, x: 2880 }]);
      const calibration = makeCalibration([{ id: 1, yaw: -20 }, { id: 2, yaw: 20 }]);
      expect(manager.isCalibrated(calibration, layout)).toBe(false);
    });
  });
});
