import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';
import '@tensorflow/tfjs-backend-cpu';
import * as tf from '@tensorflow/tfjs-core';
import { createCanvas } from '@napi-rs/canvas';
import type { FrameBuffer, FaceLandmarks, Point3D } from '../types.js';

// ---------------------------------------------------------------------------
// FaceDetector
// ---------------------------------------------------------------------------

/**
 * Wraps the TensorFlow.js MediaPipe FaceMesh model.
 * Extracts 468 3D facial landmarks from a raw FrameBuffer.
 */
export class FaceDetector {
  private detector: faceLandmarksDetection.FaceLandmarksDetector | null = null;

  /**
   * Load and warm up the TF.js model.
   * Must be called before any call to detect().
   */
  async initialize(): Promise<void> {
    // The tfjs-node native backend doesn't have the 'Transform' kernel required
    // by MediaPipe FaceMesh. Fall back to the pure-JS CPU backend which has it.
    await tf.setBackend('cpu');
    await tf.ready();

    const model = faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh;
    this.detector = await faceLandmarksDetection.createDetector(model, {
      runtime: 'tfjs',
      refineLandmarks: false,
      maxFaces: 1,
    });

    // Warm up with a blank frame to avoid cold-start latency
    await this.warmUp();
  }

  /**
   * Detect face landmarks in a single frame.
   * Returns null if no face is found or confidence is below threshold.
   */
  async detect(
    frame: FrameBuffer,
    minConfidence = 0.7,
  ): Promise<FaceLandmarks | null> {
    if (!this.detector) {
      throw new Error('FaceDetector not initialised — call initialize() first');
    }

    const canvas = this.frameToCanvas(frame);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const faces = await this.detector.estimateFaces(canvas as any);

    if (faces.length === 0) return null;

    const face = faces[0];

    // The tfjs runtime sets face.score to a probability; check it
    const score = (face as { score?: number }).score ?? 1.0;
    if (score < minConfidence) return null;

    const keypoints: ReadonlyArray<Point3D> = Object.freeze(
      face.keypoints.map((kp) =>
        Object.freeze({
          x: kp.x,
          y: kp.y,
          z: kp.z ?? 0,
        }),
      ),
    );

    return Object.freeze({
      keypoints,
      score,
      frameTimestamp: frame.timestamp,
    });
  }

  dispose(): void {
    if (this.detector) {
      this.detector.dispose();
      this.detector = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private frameToCanvas(frame: FrameBuffer): any {
    const canvas = createCanvas(frame.width, frame.height);
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(frame.width, frame.height);
    imageData.data.set(frame.data);
    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }

  private async warmUp(): Promise<void> {
    const dummyFrame: FrameBuffer = {
      data: new Uint8ClampedArray(640 * 480 * 4).fill(128),
      width: 640,
      height: 480,
      timestamp: 0,
    };
    await this.detect(dummyFrame);
  }
}
