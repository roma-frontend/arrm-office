/** @type {import('jest').Config} */
const path = require('path');

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: false }],
    // The Babel config is deliberately NOT named `babel.config.js`: Next.js
    // auto-detects that filename and silently disables SWC for the whole app
    // build, which falls back to `@babel/preset-env` and ships ~25 KiB of
    // unnecessary ES5 polyfills (Lighthouse "Legacy JavaScript"). Pointing
    // babel-jest at an explicitly-named file keeps Jest working while letting
    // the production build use SWC + the modern `browserslist` target.
    //
    // The path must be absolute: Jest does not expand `<rootDir>` inside
    // transformer options, so a literal '<rootDir>/…' made Babel fail with
    // "Cannot find module '<rootDir>/jest.babel.config.js'" for every suite that
    // transforms a .js file (i.e. anything importing `convex`).
    '^.+\\.jsx?$': ['babel-jest', { configFile: path.join(__dirname, 'jest.babel.config.js') }],
  },
  transformIgnorePatterns: ['/node_modules/(?!(convex|convex-test)/)'],
  moduleNameMapper: {
    // Convex generated code lives at project root, not under src/ — must be BEFORE generic @/ mapper
    '^@/convex/_generated/(.*)$': '<rootDir>/convex/_generated/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
    // Prevent TensorFlow.js optional peer dependency from crashing test workers
    '^@tensorflow/tfjs-node$': '<rootDir>/src/__tests__/__mocks__/empty-module.ts',
    '^@tensorflow/tfjs-node-gpu$': '<rootDir>/src/__tests__/__mocks__/empty-module.ts',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/**/_generated/**',
    '!src/**/*.stories.tsx',
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'text-summary', 'lcov', 'html', 'json-summary'],
  coverageThreshold: {
    // Coverage floor — ratchet up as coverage improves.
    // Auto-ratchet via: node scripts/ratchet-coverage.mjs
    global: {
      branches: 7,
      functions: 9,
      lines: 11,
      statements: 11,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/.next/', '/out/'],
  coveragePathIgnorePatterns: ['/node_modules/', '/__tests__/', '/_generated/', '/.next/'],
};
