module.exports = {
  testEnvironment: 'node',
  setupFiles: ['./test/polyfills.cjs'],
  transform: {
    '^.+\\.(js|mjs)$': 'babel-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(firebase|@firebase)/)',
  ],
  moduleNameMapper: {
    '^firebase/app$': '<rootDir>/node_modules/firebase/app/dist/index.cjs.js',
    '^firebase/auth$': '<rootDir>/node_modules/firebase/auth/dist/index.cjs.js',
    '^firebase/database$': '<rootDir>/node_modules/firebase/database/dist/index.cjs.js',
  },
  moduleFileExtensions: ['js', 'mjs', 'json', 'node'],
  testMatch: ["**/test/**/*.test.js"],
  setupFilesAfterEnv: ["./test/setup.js"]
};
