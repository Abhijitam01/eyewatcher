import { focusMonitor, warpMonitor, getFocusedMonitorId, isHelperAvailable } from '../native/macos-bridge.js';

// ---------------------------------------------------------------------------
// FocusSwitcher
// ---------------------------------------------------------------------------

/**
 * Switches macOS focus to the given monitor via the native helper.
 * In dry-run mode all operations are logged but not executed.
 */
export class FocusSwitcher {
  constructor(
    private readonly dryRun: boolean = false,
    private readonly noClick: boolean = false,
  ) {}

  /**
   * Move focus to the given monitor display ID.
   * Returns true on success, false if the helper is unavailable or dry-run.
   */
  focus(monitorId: number): boolean {
    if (this.dryRun) {
      console.log(`[dry-run] Would focus monitor ${monitorId}`);
      return false;
    }

    if (!isHelperAvailable()) {
      console.warn(
        'Native helper not available — cannot switch focus. ' +
          'Run "npm run build:helper" to compile it.',
      );
      return false;
    }

    try {
      if (this.noClick) {
        warpMonitor(monitorId);
      } else {
        focusMonitor(monitorId);
      }
      return true;
    } catch (err) {
      console.error(`[FocusSwitcher] Failed to focus monitor ${monitorId}:`, err);
      return false;
    }
  }

  /**
   * Return the currently focused monitor ID, or null if unavailable.
   */
  currentMonitorId(): number | null {
    if (!isHelperAvailable()) return null;
    try {
      return getFocusedMonitorId();
    } catch {
      return null;
    }
  }
}
