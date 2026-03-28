import { listMonitors, isHelperAvailable } from '../native/macos-bridge.js';
import type { MonitorLayout } from '../types.js';

// ---------------------------------------------------------------------------
// MonitorDetector
// ---------------------------------------------------------------------------

/**
 * Detects connected monitors via the native macOS helper binary.
 * Falls back to a single-monitor stub if the helper is not available.
 */
export class MonitorDetector {
  /**
   * Returns the current monitor layout.
   * Throws if fewer than `minMonitors` are detected.
   */
  detect(minMonitors = 1): MonitorLayout {
    if (!isHelperAvailable()) {
      return this.fallbackLayout();
    }

    const layout = listMonitors();

    if (layout.monitors.length < minMonitors) {
      throw new Error(
        `eyeswitch requires at least ${minMonitors} monitor(s), but only ` +
          `${layout.monitors.length} detected.`,
      );
    }

    return layout;
  }

  /**
   * Stub layout used when the native helper is unavailable.
   * Useful for --dry-run and tests.
   */
  fallbackLayout(): MonitorLayout {
    return Object.freeze({
      monitors: Object.freeze([
        Object.freeze({
          id: 1,
          x: 0,
          y: 0,
          width: 1440,
          height: 900,
          name: 'Built-in Display',
          isPrimary: true,
        }),
      ]),
      primaryMonitorId: 1,
    });
  }
}
