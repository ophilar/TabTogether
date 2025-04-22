export default {
  transform: {},
  testEnvironment: 'jsdom',
  moduleFileExtensions: ['js', 'mjs', 'json', 'node'],
  testMatch: ["**/test/**/*.test.js"],
  setupFilesAfterEnv: ["./test/setup.js"]
};
