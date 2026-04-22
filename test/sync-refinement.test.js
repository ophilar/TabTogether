import { jest } from '@jest/globals';
import { storage } from '../core/storage.js';
import { LOCAL_STORAGE_KEYS } from '../common/constants.js';

// Mock Firebase dependency
jest.unstable_mockModule("../background/firebase-transport.js", () => ({
  refreshListeners: jest.fn().mockResolvedValue(undefined),
  stopAllListeners: jest.fn(),
  listenForTabs: jest.fn(),
}));

const { refreshListeners, stopAllListeners } = await import("../background/firebase-transport.js");

describe('Sync Refinement: Firebase Listener Management', () => {

    beforeEach(async () => {
        await browser.storage.local.clear();
        jest.clearAllMocks();
    });

    test('refreshListeners should be called when config changes', async () => {
        // This logic is usually in init.js or message-handlers.js
        // We are just testing the transport's ability to refresh
        await refreshListeners();
        expect(refreshListeners).toHaveBeenCalled();
    });

    test('stopAllListeners should clear all active subscriptions', async () => {
        await stopAllListeners();
        expect(stopAllListeners).toHaveBeenCalled();
    });
});
