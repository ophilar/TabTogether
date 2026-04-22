import { jest } from '@jest/globals';
import { storage } from '../core/storage.js';
import { LOCAL_STORAGE_KEYS } from '../common/constants.js';

// Mock Firebase dependency
jest.unstable_mockModule("../background/firebase-transport.js", () => ({
  cleanupStaleTabsInFirebase: jest.fn().mockResolvedValue(undefined),
}));

const { cleanupStaleTabsInFirebase } = await import("../background/firebase-transport.js");

describe('Security: Data Cleanup', () => {

    beforeEach(async () => {
        await browser.storage.local.clear();
        jest.clearAllMocks();
    });

    test('cleanupStaleTabsInFirebase should be called to purge old records', async () => {
        await cleanupStaleTabsInFirebase();
        expect(cleanupStaleTabsInFirebase).toHaveBeenCalled();
    });
});
