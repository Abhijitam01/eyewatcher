/**
 * Shared TypeScript interfaces for eyeswitch.
 * All types are Readonly to enforce immutability throughout the codebase.
 */

// ---------------------------------------------------------------------------
// Camera / Frame
// ---------------------------------------------------------------------------

export interface FrameBuffer {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly timestamp: number; // ms since epoch
}

// ---------------------------------------------------------------------------
// Face Detection / Landmarks
// ---------------------------------------------------------------------------

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export interface Point3D extends Point2D {
  readonly z: number;
}

export interface FaceDetection {
  readonly box: {
    readonly xMin: number;
    readonly yMin: number;
    readonly xMax: number;
    readonly yMax: number;
    readonly width: number;
    readonly height: number;
  };
  readonly score: number;
}

export interface FaceLandmarks {
  readonly keypoints: ReadonlyArray<Point3D>;
  readonly score: number;
  readonly frameTimestamp: number;
}

// ---------------------------------------------------------------------------
// Head Pose
// ---------------------------------------------------------------------------

export interface HeadPose {
  /** Horizontal rotation in degrees. Negative = left, positive = right. */
  readonly yaw: number;
  /** Vertical rotation in degrees. Negative = down, positive = up. */
  readonly pitch: number;
  readonly timestamp: number;
}

export interface SmoothedPose extends HeadPose {
  readonly isSmoothed: true;
}

// ---------------------------------------------------------------------------
// Monitor
// ---------------------------------------------------------------------------

export interface Monitor {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly name: string;
  readonly isPrimary: boolean;
}

export interface MonitorLayout {
  readonly monitors: ReadonlyArray<Monitor>;
  readonly primaryMonitorId: number;
}

// ---------------------------------------------------------------------------
// Calibration
// ---------------------------------------------------------------------------

export interface CalibrationSample {
  readonly yaw: number;
  readonly pitch: number;
  readonly timestamp: number;
}

/** Calibration data stored per-monitor. */
export interface MonitorCalibration {
  readonly monitorId: number;
  readonly yaw: number;
  readonly pitch: number;
  readonly sampleCount: number;
  readonly capturedAt: number; // ms since epoch
}

export interface CalibrationData {
  readonly version: number;
  readonly monitors: ReadonlyArray<MonitorCalibration>;
  readonly savedAt: number;
}

// ---------------------------------------------------------------------------
// Gaze Mapping
// ---------------------------------------------------------------------------

export interface GazeTarget {
  readonly monitorId: number;
  /** Euclidean distance in yaw/pitch space (after hysteresis) */
  readonly distance: number;
}

// ---------------------------------------------------------------------------
// Config (user-editable settings)
// ---------------------------------------------------------------------------

export interface EyeSwitchConfig {
  /** EMA smoothing factor. 0 = no smoothing, 1 = no responsiveness. Default: 0.3 */
  readonly smoothingFactor: number;
  /** Minimum ms between focus switches. Default: 500 */
  readonly switchCooldownMs: number;
  /** Hysteresis penalty for non-active monitor (0–1). Default: 0.25 */
  readonly hysteresisFactor: number;
  /** Minimum face detection confidence to process a frame. Default: 0.7 */
  readonly minFaceConfidence: number;
  /** Camera index to use. Default: 0 */
  readonly cameraIndex: number;
  /** Custom path to calibration file. */
  readonly calibrationFilePath: string;
  /** Frames per second target. Default: 30 */
  readonly targetFps: number;
  /** Enable vertical (pitch-based) switching for top/bottom monitors. Default: false */
  readonly verticalSwitching: boolean;
}

export type PartialConfig = Partial<EyeSwitchConfig>;

export type SensitivityLevel = 'low' | 'medium' | 'high';

// ---------------------------------------------------------------------------
// Runtime state (immutable snapshots passed between modules)
// ---------------------------------------------------------------------------

export interface TrackingState {
  readonly currentMonitorId: number | null;
  readonly lastSwitchAt: number;
  readonly frameCount: number;
  readonly isPaused: boolean;
}
