// test/setup.js
import { jest } from '@jest/globals';

// --- Mock crypto ---
export const mockRandomUUID = jest.fn();
globalThis.crypto = {
    randomUUID: mockRandomUUID
};

// --- Mock browser APIs (Consolidate from utils.test.js) ---
const getMockStorage = () => {
    const memoryStore = {};
    const errorConfig = { getError: null, setError: null };
    return {
        get: jest.fn(async (keyOrKeys) => {
             // --- Simulate get error ---
             // *** THIS IS THE CORRECTED CONDITION ***
             if (errorConfig.getError && (
                 (typeof keyOrKeys === 'string' && keyOrKeys === errorConfig.getError) ||
                 (Array.isArray(keyOrKeys) && keyOrKeys.includes(errorConfig.getError)) ||
                 (typeof keyOrKeys === 'object' && keyOrKeys !== null && errorConfig.getError in keyOrKeys)
             )) {
                 throw new Error(`Simulated get error for key: ${errorConfig.getError}`);
             }
             // --- Original get logic ---
             if (!keyOrKeys) return { ...memoryStore };
             if (typeof keyOrKeys === 'string') {
                 return { [keyOrKeys]: memoryStore[keyOrKeys] };
             }
             if (Array.isArray(keyOrKeys)) {
                 const result = {};
                 for (const k of keyOrKeys) result[k] = memoryStore[k];
                 return result;
             }
             if (typeof keyOrKeys === 'object' && keyOrKeys !== null) {
                 const result = {};
                 for (const k in keyOrKeys) {
                     result[k] = memoryStore[k] ?? keyOrKeys[k];
                 }
                 return result;
             }
             return {};
        }),
        set: jest.fn(async (obj) => {
            // Simulate set error
            if (errorConfig.setError && Object.keys(obj).includes(errorConfig.setError)) {
                 throw new Error(`Simulated set error for key: ${errorConfig.setError}`);
            }
            // Simulate browser.storage.set which overwrites keys provided
            for (const key in obj) {
                memoryStore[key] = obj[key];
            }
        }),
        clear: jest.fn(async () => {
            for (const k in memoryStore) delete memoryStore[k];
            errorConfig.getError = null;
            errorConfig.setError = null;
        }),
         _getStore: () => memoryStore, // Helper for tests to inspect storage
         _simulateError: (type, key) => { // Helper to configure errors
             if (type === 'get') errorConfig.getError = key;
             if (type === 'set') errorConfig.setError = key;
         }
    };
};

// Assign the mock storage to the global browser object
global.browser = {
    storage: {
        local: getMockStorage(),
        sync: getMockStorage(),
    },
    runtime: {
        getPlatformInfo: jest.fn(async () => ({ os: 'win' })), // Default mock
        getURL: jest.fn(path => `moz-extension://test-uuid/${path}`),
    },
    notifications: {
        create: jest.fn().mockResolvedValue('test-notif-id'),
    },
    tabs: {
        create: jest.fn().mockResolvedValue({ id: 123, url: 'mock-tab-url' })
    }
    // Add other browser APIs as needed
};

// --- Reset mocks before each test ---
beforeEach(() => {
  // Reset crypto
  mockRandomUUID.mockClear();
  mockRandomUUID.mockReturnValue('mock-uuid-1234'); // Default mock value

  // Reset storage mocks (clear data and mocks)
  jest.clearAllMocks(); // Clears call counts etc. for all mocks

  // Explicitly clear storage content using the mock's clear method
  return Promise.all([
      global.browser.storage.local.clear(),
      global.browser.storage.sync.clear()
  ]).then(() => {
      // Re-apply default mock implementations if clearAllMocks removed them
      // (Often not needed if mocks are defined as above, but good practice)
      global.browser.runtime.getPlatformInfo.mockResolvedValue({ os: 'win' });
      global.browser.notifications.create.mockResolvedValue('test-notif-id');
      global.browser.tabs.create.mockResolvedValue({ id: 123, url: 'mock-tab-url' });
  });
});