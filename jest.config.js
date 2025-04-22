export default {
  transform: {},
  testEnvironment: './test/jest.env.js',
  moduleFileExtensions: ['js', 'mjs', 'json', 'node'],
  testMatch: ["**/test/**/*.test.js"],
  setupFilesAfterEnv: ["./test/setup.js"]
};
