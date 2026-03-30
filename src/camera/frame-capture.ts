import NodeWebcam from 'node-webcam';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import type { FrameBuffer } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FrameCallback = (frame: FrameBuffer) => void;

// ---------------------------------------------------------------------------
// FrameCapture
// ---------------------------------------------------------------------------

/**
 * Captures webcam frames as FrameBuffer objects.
 *
 * node-webcam captures images to disk (JPEG); we read the file back,
 * decode it onto a canvas, and extract the raw RGBA pixel data.
 *
 * This approach keeps us dependency-light while still being compatible
 * with TF.js which consumes canvas ImageData.
 */
export class FrameCapture {
  private webcam: ReturnType<typeof NodeWebcam.create> | null = null;
  private captureInterval: ReturnType<typeof setInterval> | null = null;
  private readonly tmpFile: string;
  private readonly frameWidth = 640;
  private readonly frameHeight = 480;
  private isCapturing = false; // prevents concurrent imagesnap processes
  private consecutiveFailures = 0;
  private static readonly MAX_CONSECUTIVE_FAILURES = 5;

  constructor(
    private readonly cameraIndex: number = 0,
    private readonly targetFps: number = 30,
  ) {
    this.tmpFile = path.join(os.tmpdir(), `eyeswitch-frame-${process.pid}`);
  }

  /**
   * Start capturing frames, calling `onFrame` for each decoded frame.
   */
  start(onFrame: FrameCallback): void {
    if (this.captureInterval !== null) {
      throw new Error('FrameCapture is already running');
    }

    // On Windows, node-webcam shells out to ffmpeg. Prepend the bundled
    // ffmpeg-static binary directory to PATH so no manual install is needed.
    if (process.platform === 'win32') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const ffmpegPath = require('ffmpeg-static') as string;
        const ffmpegDir  = path.dirname(ffmpegPath);
        process.env.PATH = `${ffmpegDir}${path.delimiter}${process.env.PATH ?? ''}`;
      } catch {
        // ffmpeg-static unavailable — user may need to install ffmpeg manually
      }
    }

    // node-webcam uses imagesnap on macOS and ffmpeg on Windows/Linux.
    // On Windows, the DirectShow (dshow) input format is used via ffmpeg.
    const deviceOpt: string | false = process.platform === 'win32'
      ? (this.cameraIndex === 0 ? 'dshow' : `dshow:video=${this.cameraIndex}`)
      : (this.cameraIndex === 0 ? false : `/dev/video${this.cameraIndex}`);

    this.webcam = NodeWebcam.create({
      width: this.frameWidth,
      height: this.frameHeight,
      quality: 85,
      delay: 0,
      saveShots: true,
      output: 'jpeg',
      device: deviceOpt,
      callbackReturn: 'location',
      verbose: false,
    });

    const intervalMs = Math.round(1000 / this.targetFps);

    this.captureInterval = setInterval(() => {
      // Skip if a capture is already in progress — imagesnap takes ~1s per shot
      // so concurrent invocations would race on the same temp file.
      if (this.isCapturing) return;
      this.isCapturing = true;
      this.captureOneFrame(onFrame)
        .then(() => {
          this.consecutiveFailures = 0;
        })
        .catch((err: unknown) => {
          this.consecutiveFailures++;
          if (this.consecutiveFailures >= FrameCapture.MAX_CONSECUTIVE_FAILURES) {
            console.error(
              `[FrameCapture] ${this.consecutiveFailures} consecutive failures — check camera access:`,
              err,
            );
          } else if (process.env.EYESWITCH_DEBUG) {
            console.error('[FrameCapture] error:', err);
          }
        })
        .finally(() => {
          this.isCapturing = false;
        });
    }, intervalMs);
  }

  /**
   * Stop capturing frames.
   */
  stop(): void {
    if (this.captureInterval !== null) {
      clearInterval(this.captureInterval);
      this.captureInterval = null;
    }
    // Clean up tmp files
    for (const ext of ['.jpg', '.jpeg']) {
      const f = `${this.tmpFile}${ext}`;
      if (fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch { /* ignore */ }
      }
    }
  }

  get isRunning(): boolean {
    return this.captureInterval !== null;
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private async captureOneFrame(onFrame: FrameCallback): Promise<void> {
    if (!this.webcam) return;

    const filename = this.tmpFile;

    await new Promise<void>((resolve, reject) => {
      this.webcam!.capture(filename, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // node-webcam appends the extension
    const actualFile = fs.existsSync(`${filename}.jpg`)
      ? `${filename}.jpg`
      : `${filename}.jpeg`;

    const img = await loadImage(actualFile);
    const canvas = createCanvas(this.frameWidth, this.frameHeight);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, this.frameWidth, this.frameHeight);
    const imageData = ctx.getImageData(0, 0, this.frameWidth, this.frameHeight);

    const frame: FrameBuffer = Object.freeze({
      data: new Uint8ClampedArray(imageData.data),
      width: this.frameWidth,
      height: this.frameHeight,
      timestamp: Date.now(),
    });

    onFrame(frame);
  }
}
