import type { HeadPose, MonitorLayout, GazeTarget, CalibrationData } from '../types.js';
import type { CalibrationManager } from '../calibration/calibration-manager.js';

// ---------------------------------------------------------------------------
// MonitorMapper
// ---------------------------------------------------------------------------

/**
 * Maps a smoothed head pose to a target monitor using calibration data.
 * Delegates to CalibrationManager.targetMonitor which implements hysteresis.
 */
export class MonitorMapper {
  constructor(
    private readonly calibrationManager: CalibrationManager,
    private readonly hysteresisFactor: number = 0.25,
  ) {}

  /**
   * Returns the best-matching monitor for the given pose.
   * Returns null if calibration data is missing.
   */
  map(
    pose: HeadPose,
    calibration: CalibrationData,
    layout: MonitorLayout,
    currentMonitorId: number | null,
  ): GazeTarget | null {
    const monitorId = this.calibrationManager.targetMonitor(
      pose,
      calibration,
      layout,
      currentMonitorId,
      this.hysteresisFactor,
    );

    if (monitorId === null) return null;

    // Compute actual distance (without hysteresis) for informational purposes
    const mc = calibration.monitors.find((m) => m.monitorId === monitorId);
    const distance = mc
      ? Math.sqrt((pose.yaw - mc.yaw) ** 2 + (pose.pitch - mc.pitch) ** 2)
      : 0;

    return Object.freeze({ monitorId, distance });
  }
}
