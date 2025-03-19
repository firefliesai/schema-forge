import type { JestConfigWithTsJest } from 'ts-jest';

/**
 * Centralized place to handle all the jest setup.
 * This is reusable for both `e2e` and `unit tests`.
 *
 * Simplifies the maintenance of the configuration
 * and makes it safer as now we can use TypeScript
 * powers for these configurations too.
 */
const jestConfig: JestConfigWithTsJest = {
  rootDir: '.',
  verbose: true,
  moduleFileExtensions: ['js', 'json', 'ts'],
  testEnvironment: 'node',
  testMatch: ['**/*.spec.ts'],
  testPathIgnorePatterns: ['node_modules', 'dist'],
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  moduleNameMapper: {}
};

export default jestConfig;
