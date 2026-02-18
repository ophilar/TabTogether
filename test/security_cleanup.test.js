
import { jest } from '@jest/globals';

// Mock console.log to capture output
const originalConsoleLog = console.log;
const consoleLogs = [];
console.log = (...args) => {
  consoleLogs.push(args.join(' '));
  originalConsoleLog(...args);
};

describe('Security Cleanup', () => {
  let performTimeBasedTaskCleanup;
  let LOCAL_STORAGE_KEYS;

  beforeAll(async () => {
    const cleanupModule = await import('../background/cleanup.js');
    performTimeBasedTaskCleanup = cleanupModule.performTimeBasedTaskCleanup;
    const constantsModule = await import('../common/constants.js');
    LOCAL_STORAGE_KEYS = constantsModule.LOCAL_STORAGE_KEYS;
  });

  beforeEach(() => {
    consoleLogs.length = 0;
  });

  test('should not log sensitive URLs when they expire', async () => {
    // Setup data
    const sensitiveUrl = "https://sensitive.com/user/123?token=secret";
    const now = Date.now();
    const expiredTimestamp = now - 100000; // deeply in the past
    const thresholdMs = 5000;

    // Use global.browser provided by test/setup.js
    // We need to populate storage.local with the expired URL.
    await global.browser.storage.local.set({
        [LOCAL_STORAGE_KEYS.RECENTLY_OPENED_URLS]: {
            [sensitiveUrl]: expiredTimestamp
        }
    });

    // Run cleanup
    await performTimeBasedTaskCleanup({}, thresholdMs);

    // Check logs
    const leakingLog = consoleLogs.find(log => log.includes(sensitiveUrl));
    const safeLog = consoleLogs.find(log => log.includes("Cleanup: A URL expired from recently opened list."));

    // Fail if sensitive URL is found
    expect(leakingLog).toBeUndefined();

    // Fail if safe log is NOT found (ensures we are still logging the event, safely)
    expect(safeLog).toBeDefined();
  });
});
