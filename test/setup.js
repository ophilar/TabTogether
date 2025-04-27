// test/setup.js
import { jest } from '@jest/globals';

// --- Mock crypto ---
// Directly mock the function on the global object
globalThis.crypto = {
    randomUUID: jest.fn() // Assign the mock function directly
};

// --- Mock browser APIs ---
const getMockStorage = () => {
    // ... (rest of getMockStorage remains the same) ...
    const memoryStore = {};
    const errorConfig = { getError: null, setError: null };
    return {
        get: jest.fn(async (keyOrKeys) => {
            if (errorConfig.getError && (
                (typeof keyOrKeys === 'string' && keyOrKeys === errorConfig.getError) ||
                (Array.isArray(keyOrKeys) && keyOrKeys.includes(errorConfig.getError)) ||
                (typeof keyOrKeys === 'object' && keyOrKeys !== null && errorConfig.getError in keyOrKeys)
            )) {
                throw new Error(`Simulated get error for key: ${errorConfig.getError}`);
            }
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
            if (errorConfig.setError && Object.keys(obj).includes(errorConfig.setError)) {
                throw new Error(`Simulated set error for key: ${errorConfig.setError}`);
            }
            for (const key in obj) {
                memoryStore[key] = obj[key];
            }
        }),
        clear: jest.fn(async () => {
            for (const k in memoryStore) delete memoryStore[k];
            errorConfig.getError = null;
            errorConfig.setError = null;
        }),
        _getStore: () => memoryStore,
        _simulateError: (type, key) => {
            if (type === 'get') errorConfig.getError = key;
            if (type === 'set') errorConfig.setError = key;
        }
    };
};

// --- Reset mocks before each test ---
beforeEach(() => {
    // Reset all mocks (call counts, implementations, etc.)
    jest.clearAllMocks();

    // Reset crypto mock specifically
    if (typeof globalThis.crypto === 'undefined') {
        globalThis.crypto = {};
    }
    globalThis.crypto.randomUUID = jest.fn().mockReturnValue('mock-uuid-1234'); // Assign and set default value

    // Assign the mock storage to the global browser object
    global.browser = {
        storage: {
            local: getMockStorage(),
            sync: getMockStorage(),
        },
        runtime: {
            getPlatformInfo: jest.fn(async () => ({ os: 'win' })),
            getURL: jest.fn(path => `moz-extension://test-uuid/${path}`),
            sendMessage: jest.fn().mockResolvedValue({ success: true }),
        },
        notifications: {
            create: jest.fn().mockResolvedValue('test-notif-id'),
        },
        tabs: {
            create: jest.fn().mockResolvedValue({ id: 123, url: 'mock-tab-url' })
        },
        // Add contextMenus mock if needed
        contextMenus: {
            create: jest.fn(),
            removeAll: jest.fn(),
            onClicked: {
                addListener: jest.fn(),
                removeListener: jest.fn(),
            },
        },
        // Add alarms mock if needed
        alarms: {
            create: jest.fn(),
            clear: jest.fn(),
            clearAll: jest.fn(),
            onAlarm: {
                addListener: jest.fn(),
                removeListener: jest.fn(),
            },
        },
    };

    // Explicitly clear storage content using the mock's clear method
    return Promise.all([
        global.browser.storage.local.clear(),
        global.browser.storage.sync.clear()
    ]);
});
