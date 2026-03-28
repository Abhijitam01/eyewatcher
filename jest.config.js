/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/index.ts',
    '!src/**/*.d.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  moduleNameMapper: {
    // Strip .js extensions so ts-jest resolves relative imports to .ts files
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // Mock heavy TF.js deps in tests
    '@tensorflow/tfjs-node': '<rootDir>/tests/__mocks__/tfjs-node.ts',
    '@tensorflow-models/face-landmarks-detection': '<rootDir>/tests/__mocks__/face-landmarks-detection.ts',
    'canvas': '<rootDir>/tests/__mocks__/canvas.ts',
    'node-webcam': '<rootDir>/tests/__mocks__/node-webcam.ts',
  },
  globals: {
    'ts-jest': {
      tsconfig: {
        strict: true,
        esModuleInterop: true,
        noUnusedLocals: false,
        noUnusedParameters: false,
      },
    },
  },
};
