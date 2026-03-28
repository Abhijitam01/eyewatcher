import { MonitorMapper } from '../../src/monitor/monitor-mapper';
import { CalibrationManager } from '../../src/calibration/calibration-manager';
import type {
  HeadPose,
  MonitorLayout,
  CalibrationData,
} from '../../src/types';
import { CALIBRATION_FORMAT_VERSION } from '../../src/config';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLayout(monitors: MonitorLayout['monitors']): MonitorLayout {
  return Object.freeze({
    monitors: Object.freeze(monitors),
    primaryMonitorId: monitors[0]?.id ?? 0,
  });
}

function makePose(yaw: number, pitch: number): HeadPose {
  return Object.freeze({ yaw, pitch, timestamp: Date.now() });
}

function makeCalibration(entries: Array<{ id: number; yaw: number; pitch: number }>): CalibrationData {
  return Object.freeze({
    version: CALIBRATION_FORMAT_VERSION,
    monitors: Object.freeze(
      entries.map((e) =>
        Object.freeze({
          monitorId: e.id,
          yaw: e.yaw,
          pitch: e.pitch,
          sampleCount: 60,
          capturedAt: Date.now(),
        }),
      ),
    ),
    savedAt: Date.now(),
  });
}

// Use a real CalibrationManager (we only need targetMonitor logic)
// Point to a non-existent file so no disk I/O occurs in tests
const calManager = new CalibrationManager('/tmp/eyeswitch-test-calibration.json');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MonitorMapper', () => {
  const layout = makeLayout([
    Object.freeze({ id: 1, x: 0,    y: 0, width: 1440, height: 900, name: 'Left',  isPrimary: true }),
    Object.freeze({ id: 2, x: 1440, y: 0, width: 1440, height: 900, name: 'Right', isPrimary: false }),
  ]);

  const calibration = makeCalibration([
    { id: 1, yaw: -20, pitch: 0 },  // looking left
    { id: 2, yaw:  20, pitch: 0 },  // looking right
  ]);

  it('maps gaze near left calibration point to monitor 1', () => {
    const mapper = new MonitorMapper(calManager, 0.25);
    const target = mapper.map(makePose(-18, 0), calibration, layout, null);
    expect(target?.monitorId).toBe(1);
  });

  it('maps gaze near right calibration point to monitor 2', () => {
    const mapper = new MonitorMapper(calManager, 0.25);
    const target = mapper.map(makePose(18, 0), calibration, layout, null);
    expect(target?.monitorId).toBe(2);
  });

  it('returns frozen GazeTarget', () => {
    const mapper = new MonitorMapper(calManager, 0.25);
    const target = mapper.map(makePose(-18, 0), calibration, layout, null);
    expect(target).not.toBeNull();
    expect(Object.isFrozen(target)).toBe(true);
  });

  it('includes distance in result', () => {
    const mapper = new MonitorMapper(calManager, 0.25);
    const target = mapper.map(makePose(-18, 0), calibration, layout, null);
    expect(typeof target?.distance).toBe('number');
    expect(target!.distance).toBeGreaterThanOrEqual(0);
  });

  it('hysteresis keeps current monitor at boundary (yaw = 0)', () => {
    // yaw=0 is equidistant between monitors calibrated at -20 and +20
    // With hysteresis, whichever is current should be preferred
    const mapper = new MonitorMapper(calManager, 0.25);

    const atBoundary = makePose(0, 0);

    const resultWhenCurrentIs1 = mapper.map(atBoundary, calibration, layout, 1);
    const resultWhenCurrentIs2 = mapper.map(atBoundary, calibration, layout, 2);

    // Each should prefer their respective current monitor
    expect(resultWhenCurrentIs1?.monitorId).toBe(1);
    expect(resultWhenCurrentIs2?.monitorId).toBe(2);
  });

  it('returns null when calibration has no valid monitors', () => {
    const mapper = new MonitorMapper(calManager, 0.25);
    const emptyCalibration = makeCalibration([]);
    const target = mapper.map(makePose(0, 0), emptyCalibration, layout, null);
    expect(target).toBeNull();
  });

  it('handles single-monitor layout', () => {
    const singleLayout = makeLayout([
      Object.freeze({ id: 1, x: 0, y: 0, width: 1440, height: 900, name: 'Only', isPrimary: true }),
    ]);
    const singleCal = makeCalibration([{ id: 1, yaw: 0, pitch: 0 }]);

    const mapper = new MonitorMapper(calManager, 0.25);
    const target = mapper.map(makePose(45, 10), singleCal, singleLayout, null);
    expect(target?.monitorId).toBe(1);
  });

  it('three-monitor layout — maps to correct monitor', () => {
    const threeLayout = makeLayout([
      Object.freeze({ id: 1, x: 0,    y: 0, width: 1440, height: 900, name: 'L', isPrimary: false }),
      Object.freeze({ id: 2, x: 1440, y: 0, width: 1440, height: 900, name: 'C', isPrimary: true  }),
      Object.freeze({ id: 3, x: 2880, y: 0, width: 1440, height: 900, name: 'R', isPrimary: false }),
    ]);
    const threeCal = makeCalibration([
      { id: 1, yaw: -30, pitch: 0 },
      { id: 2, yaw:   0, pitch: 0 },
      { id: 3, yaw:  30, pitch: 0 },
    ]);

    const mapper = new MonitorMapper(calManager, 0.25);
    expect(mapper.map(makePose(-28, 0), threeCal, threeLayout, null)?.monitorId).toBe(1);
    expect(mapper.map(makePose(  2, 0), threeCal, threeLayout, null)?.monitorId).toBe(2);
    expect(mapper.map(makePose( 28, 0), threeCal, threeLayout, null)?.monitorId).toBe(3);
  });
});
