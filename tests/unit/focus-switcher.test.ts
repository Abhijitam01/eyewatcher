import { FocusSwitcher } from '../../src/monitor/focus-switcher';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockIsHelperAvailable = jest.fn<boolean, []>();
const mockFocusMonitor = jest.fn<void, [number]>();
const mockWarpMonitor = jest.fn<void, [number]>();
const mockGetFocusedMonitorId = jest.fn<number, []>();

jest.mock('../../src/native/macos-bridge', () => ({
  isHelperAvailable: () => mockIsHelperAvailable(),
  focusMonitor: (id: number) => mockFocusMonitor(id),
  warpMonitor: (id: number) => mockWarpMonitor(id),
  getFocusedMonitorId: () => mockGetFocusedMonitorId(),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockIsHelperAvailable.mockReturnValue(true);
});

describe('FocusSwitcher — noClick=false (default)', () => {
  it('calls focusMonitor and returns true when helper is available', () => {
    const switcher = new FocusSwitcher(false, false);
    const result = switcher.focus(42);
    expect(result).toBe(true);
    expect(mockFocusMonitor).toHaveBeenCalledWith(42);
    expect(mockWarpMonitor).not.toHaveBeenCalled();
  });

  it('returns false and logs when helper is unavailable', () => {
    mockIsHelperAvailable.mockReturnValue(false);
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const switcher = new FocusSwitcher(false, false);
    const result = switcher.focus(1);
    expect(result).toBe(false);
    expect(mockFocusMonitor).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('returns false when focusMonitor throws', () => {
    mockFocusMonitor.mockImplementation(() => { throw new Error('oops'); });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const switcher = new FocusSwitcher(false, false);
    expect(switcher.focus(1)).toBe(false);
    consoleSpy.mockRestore();
  });
});

describe('FocusSwitcher — noClick=true', () => {
  it('calls warpMonitor (not focusMonitor) when noClick is true', () => {
    const switcher = new FocusSwitcher(false, true);
    const result = switcher.focus(99);
    expect(result).toBe(true);
    expect(mockWarpMonitor).toHaveBeenCalledWith(99);
    expect(mockFocusMonitor).not.toHaveBeenCalled();
  });

  it('still returns false when helper is unavailable in noClick mode', () => {
    mockIsHelperAvailable.mockReturnValue(false);
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const switcher = new FocusSwitcher(false, true);
    expect(switcher.focus(1)).toBe(false);
    expect(mockWarpMonitor).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe('FocusSwitcher — dry-run mode', () => {
  it('returns false without calling any native functions', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const switcher = new FocusSwitcher(true, false);
    const result = switcher.focus(5);
    expect(result).toBe(false);
    expect(mockFocusMonitor).not.toHaveBeenCalled();
    expect(mockWarpMonitor).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('dry-run takes priority over noClick', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const switcher = new FocusSwitcher(true, true);
    const result = switcher.focus(5);
    expect(result).toBe(false);
    expect(mockWarpMonitor).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe('FocusSwitcher — currentMonitorId', () => {
  it('returns the focused monitor id when helper is available', () => {
    mockGetFocusedMonitorId.mockReturnValue(7);
    const switcher = new FocusSwitcher();
    expect(switcher.currentMonitorId()).toBe(7);
  });

  it('returns null when helper is unavailable', () => {
    mockIsHelperAvailable.mockReturnValue(false);
    const switcher = new FocusSwitcher();
    expect(switcher.currentMonitorId()).toBeNull();
  });

  it('returns null when getFocusedMonitorId throws', () => {
    mockGetFocusedMonitorId.mockImplementation(() => { throw new Error('fail'); });
    const switcher = new FocusSwitcher();
    expect(switcher.currentMonitorId()).toBeNull();
  });
});
