import { SampleAggregator, medianOfSorted } from '../../src/calibration/sample-aggregator';
import type { CalibrationSample } from '../../src/types';

function makeSample(yaw: number, pitch: number, ts = 0): CalibrationSample {
  return Object.freeze({ yaw, pitch, timestamp: ts });
}

// ---------------------------------------------------------------------------
// medianOfSorted (pure utility)
// ---------------------------------------------------------------------------

describe('medianOfSorted', () => {
  it('returns single element for array of 1', () => {
    expect(medianOfSorted([42])).toBe(42);
  });

  it('returns middle element for odd-length arrays', () => {
    expect(medianOfSorted([1, 3, 5])).toBe(3);
    expect(medianOfSorted([1, 2, 3, 4, 5])).toBe(3);
  });

  it('returns average of two middle elements for even-length arrays', () => {
    expect(medianOfSorted([1, 3])).toBe(2);
    expect(medianOfSorted([1, 2, 3, 4])).toBe(2.5);
  });

  it('returns 0 for empty array', () => {
    expect(medianOfSorted([])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// SampleAggregator
// ---------------------------------------------------------------------------

describe('SampleAggregator', () => {
  it('starts empty', () => {
    const agg = new SampleAggregator();
    expect(agg.count).toBe(0);
    expect(agg.median()).toBeNull();
  });

  it('returns null median when empty', () => {
    expect(new SampleAggregator().median()).toBeNull();
  });

  it('push() returns a new instance (immutable)', () => {
    const agg1 = new SampleAggregator();
    const agg2 = agg1.push(makeSample(10, 5));
    expect(agg1.count).toBe(0);
    expect(agg2.count).toBe(1);
  });

  it('accumulates samples correctly', () => {
    let agg = new SampleAggregator();
    agg = agg.push(makeSample(10, 20));
    agg = agg.push(makeSample(20, 30));
    agg = agg.push(makeSample(30, 40));
    expect(agg.count).toBe(3);
  });

  it('computes correct median yaw and pitch for odd count', () => {
    let agg = new SampleAggregator();
    agg = agg.push(makeSample(30, 3));
    agg = agg.push(makeSample(10, 1));
    agg = agg.push(makeSample(20, 2));

    const result = agg.median()!;
    expect(result.yaw).toBe(20);   // sorted: [10, 20, 30] → 20
    expect(result.pitch).toBe(2);  // sorted: [1, 2, 3] → 2
  });

  it('computes correct median for even count', () => {
    let agg = new SampleAggregator();
    agg = agg.push(makeSample(10, 1));
    agg = agg.push(makeSample(20, 3));

    const result = agg.median()!;
    expect(result.yaw).toBe(15);   // (10+20)/2
    expect(result.pitch).toBe(2);  // (1+3)/2
  });

  it('median result is frozen', () => {
    let agg = new SampleAggregator();
    agg = agg.push(makeSample(5, 5));
    const med = agg.median()!;
    expect(Object.isFrozen(med)).toBe(true);
  });

  it('toArray() returns a frozen copy', () => {
    let agg = new SampleAggregator();
    agg = agg.push(makeSample(1, 2));
    const arr = agg.toArray();
    expect(Object.isFrozen(arr)).toBe(true);
    expect(arr.length).toBe(1);
  });

  it('initialising with existing samples works', () => {
    const initial = [makeSample(5, 5), makeSample(10, 10)];
    const agg = new SampleAggregator(initial);
    expect(agg.count).toBe(2);
  });
});
