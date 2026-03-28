import { PoseEstimator, averagePoints, euclidean2D, radToDeg } from '../../src/face/pose-estimator';
import type { FaceLandmarks, Point3D } from '../../src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal 468-point landmark array, all at (cx, cy, 0). */
function makeLandmarks(
  overrides: Partial<Record<number, Point3D>> = {},
  base: Point3D = { x: 100, y: 100, z: 0 },
): ReadonlyArray<Point3D> {
  const pts: Point3D[] = Array.from({ length: 468 }, () => ({ ...base }));
  for (const [idx, pt] of Object.entries(overrides)) {
    pts[Number(idx)] = pt as Point3D;
  }
  return Object.freeze(pts);
}

function makeFaceLandmarks(
  overrides: Partial<Record<number, Point3D>> = {},
): FaceLandmarks {
  return Object.freeze({
    keypoints: makeLandmarks(overrides),
    score: 0.99,
    frameTimestamp: 1000,
  });
}

// ---------------------------------------------------------------------------
// Unit tests — pure utility functions
// ---------------------------------------------------------------------------

describe('averagePoints', () => {
  it('averages two points', () => {
    const pts: ReadonlyArray<Point3D> = [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 20, z: 0 },
    ];
    const avg = averagePoints(pts, [0, 1]);
    expect(avg.x).toBeCloseTo(5);
    expect(avg.y).toBeCloseTo(10);
  });

  it('returns point itself for single index', () => {
    const pts: ReadonlyArray<Point3D> = [{ x: 7, y: 3, z: 0 }];
    const avg = averagePoints(pts, [0]);
    expect(avg.x).toBe(7);
    expect(avg.y).toBe(3);
  });

  it('returns a frozen object', () => {
    const pts: ReadonlyArray<Point3D> = [{ x: 1, y: 2, z: 0 }];
    const avg = averagePoints(pts, [0]);
    expect(Object.isFrozen(avg)).toBe(true);
  });

  it('uses 0 for out-of-bounds keypoint indices (defensive fallback)', () => {
    const pts: ReadonlyArray<Point3D> = [{ x: 10, y: 20, z: 5 }];
    // Index 99 is out of bounds — should default to 0 for x/y/z
    const avg = averagePoints(pts, [0, 99]);
    expect(avg.x).toBeCloseTo(5);   // (10 + 0) / 2
    expect(avg.y).toBeCloseTo(10);  // (20 + 0) / 2
  });
});

describe('euclidean2D', () => {
  it('computes 3-4-5 right triangle', () => {
    const a: Point3D = { x: 0, y: 0, z: 0 };
    const b: Point3D = { x: 3, y: 4, z: 0 };
    expect(euclidean2D(a, b)).toBeCloseTo(5);
  });

  it('returns 0 for identical points', () => {
    const p: Point3D = { x: 5, y: 5, z: 0 };
    expect(euclidean2D(p, p)).toBe(0);
  });
});

describe('radToDeg', () => {
  it('converts π to 180°', () => {
    expect(radToDeg(Math.PI)).toBeCloseTo(180);
  });

  it('converts 0 to 0°', () => {
    expect(radToDeg(0)).toBe(0);
  });

  it('converts negative radians correctly', () => {
    expect(radToDeg(-Math.PI / 2)).toBeCloseTo(-90);
  });
});

// ---------------------------------------------------------------------------
// PoseEstimator
// ---------------------------------------------------------------------------

describe('PoseEstimator', () => {
  // For a face looking straight: nose tip is at the horizontal midpoint of the eyes.
  // Eyes: left=(80,100), right=(120,100) → midX=100, IPD=40
  // Nose tip at (100, 130) → offsetX=0, yaw=0
  // offsetY=(100-130)/40 = -0.75
  it('estimates ~0° yaw for a frontal face', () => {
    const fl = makeFaceLandmarks({
      33:  { x: 80,  y: 100, z: 0 },
      133: { x: 80,  y: 100, z: 0 },
      362: { x: 120, y: 100, z: 0 },
      263: { x: 120, y: 100, z: 0 },
      1:   { x: 100, y: 130, z: 0 }, // nose at midpoint
    });
    const estimator = new PoseEstimator(0);
    const pose = estimator.estimateRaw(fl);
    expect(pose.yaw).toBeCloseTo(0, 0);
  });

  it('estimates positive yaw when nose is offset right', () => {
    // Nose right of midpoint → head turned right
    const fl = makeFaceLandmarks({
      33:  { x: 80,  y: 100, z: 0 },
      133: { x: 80,  y: 100, z: 0 },
      362: { x: 120, y: 100, z: 0 },
      263: { x: 120, y: 100, z: 0 },
      1:   { x: 115, y: 130, z: 0 }, // nose right of centre
    });
    const estimator = new PoseEstimator(0);
    const pose = estimator.estimateRaw(fl);
    expect(pose.yaw).toBeGreaterThan(0);
  });

  it('estimates negative yaw when nose is offset left', () => {
    const fl = makeFaceLandmarks({
      33:  { x: 80,  y: 100, z: 0 },
      133: { x: 80,  y: 100, z: 0 },
      362: { x: 120, y: 100, z: 0 },
      263: { x: 120, y: 100, z: 0 },
      1:   { x: 85,  y: 130, z: 0 }, // nose left of centre
    });
    const estimator = new PoseEstimator(0);
    const pose = estimator.estimateRaw(fl);
    expect(pose.yaw).toBeLessThan(0);
  });

  it('returns frozen SmoothedPose', () => {
    const fl = makeFaceLandmarks();
    const estimator = new PoseEstimator(0.3);
    const pose = estimator.estimate(fl);
    expect(Object.isFrozen(pose)).toBe(true);
    expect(pose.isSmoothed).toBe(true);
  });

  it('applies EMA smoothing correctly', () => {
    const estimator = new PoseEstimator(0.5);

    // First call — raw pose (e.g. yaw ≈ 0)
    const fl1 = makeFaceLandmarks({
      33:  { x: 80,  y: 100, z: 0 }, 133: { x: 80,  y: 100, z: 0 },
      362: { x: 120, y: 100, z: 0 }, 263: { x: 120, y: 100, z: 0 },
      1:   { x: 100, y: 130, z: 0 },
    });
    const p1 = estimator.estimate(fl1);

    // Second call — nose shifted right giving a positive yaw
    const fl2 = makeFaceLandmarks({
      33:  { x: 80,  y: 100, z: 0 }, 133: { x: 80,  y: 100, z: 0 },
      362: { x: 120, y: 100, z: 0 }, 263: { x: 120, y: 100, z: 0 },
      1:   { x: 120, y: 130, z: 0 }, // max right
    });
    const p2 = estimator.estimate(fl2);

    // p2.yaw should be between p1.yaw and raw p2 yaw (EMA blending)
    expect(p2.yaw).toBeGreaterThan(p1.yaw);
    expect(p2.yaw).toBeLessThan(estimator.estimateRaw(fl2).yaw + 0.1);
  });

  it('reset() clears EMA state', () => {
    const estimator = new PoseEstimator(0.1); // low alpha — very sticky
    const fl = makeFaceLandmarks({
      33:  { x: 80,  y: 100, z: 0 }, 133: { x: 80,  y: 100, z: 0 },
      362: { x: 120, y: 100, z: 0 }, 263: { x: 120, y: 100, z: 0 },
      1:   { x: 120, y: 130, z: 0 },
    });

    estimator.estimate(fl); // set state
    estimator.reset();

    // After reset, first call returns raw value again
    const raw = estimator.estimateRaw(fl).yaw;
    const afterReset = estimator.estimate(fl).yaw;
    expect(afterReset).toBeCloseTo(raw, 1);
  });

  it('handles degenerate case where IPD is 0 (returns 0 angles)', () => {
    const fl = makeFaceLandmarks({
      33: { x: 100, y: 100, z: 0 }, 133: { x: 100, y: 100, z: 0 },
      362: { x: 100, y: 100, z: 0 }, 263: { x: 100, y: 100, z: 0 },
      1:   { x: 100, y: 100, z: 0 },
    });
    const estimator = new PoseEstimator(0);
    const pose = estimator.estimateRaw(fl);
    expect(pose.yaw).toBe(0);
    expect(pose.pitch).toBe(0);
  });
});
