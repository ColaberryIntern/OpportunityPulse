module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/../tests', '<rootDir>/tests'],
  testMatch: ['**/*.test.js'],
  modulePaths: ['<rootDir>/node_modules'],
  coverageDirectory: '<rootDir>/../tests/coverage',
  coveragePathIgnorePatterns: ['/node_modules/', '/migrations/', '/seeders/'],
  verbose: true,
};
