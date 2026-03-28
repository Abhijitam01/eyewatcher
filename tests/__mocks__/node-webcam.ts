// Mock for node-webcam

const NodeWebcam = {
  create: jest.fn(() => ({
    capture: jest.fn((_file: string, cb: (err: null) => void) => cb(null)),
  })),
};

export default NodeWebcam;
module.exports = NodeWebcam;
