// This file has been replaced by jest.config.cjs for CommonJS compatibility with Jest.
// Removed custom testEnvironment; using default jsdom environment.
module.exports = {
  testEnvironment: 'jsdom',
  transform: {},
  moduleFileExtensions: ['js', 'mjs', 'json', 'node'],
  testMatch: ["**/test/**/*.test.js"],
  setupFilesAfterEnv: ["./test/setup.js"]
};
