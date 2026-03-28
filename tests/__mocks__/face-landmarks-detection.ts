// Mock for @tensorflow-models/face-landmarks-detection

export const SupportedModels = {
  MediaPipeFaceMesh: 'MediaPipeFaceMesh',
};

export async function createDetector() {
  return {
    estimateFaces: jest.fn().mockResolvedValue([]),
    dispose: jest.fn(),
  };
}
