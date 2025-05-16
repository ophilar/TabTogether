// test/instance.test.js

// --- JEST MOCKS (at the very top) ---
const mockGenerateShortIdInternal = jest.fn();
jest.mock('../core/id-utils.js', () => ({
    __esModule: true,
    generateShortId: mockGenerateShortIdInternal,
}));

const mockGetPlatformInfoInternal = jest.fn();
jest.mock('../core/platform.js', () => ({
    __esModule: true,
    getPlatformInfoCached: mockGetPlatformInfoInternal,
    _clearPlatformInfoCache: jest.fn(), // Mock clear function if needed
}));

// We will use the actual storage module but spy on its methods
// Or, if storage itself is complex, mock it too. For now, let's spy.
import { storage as actualStorage } from '../core/storage.js';

// --- IMPORTS ---
import { jest } from '@jest/globals';
import { SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS } from '../common/constants.js';
// Import the ACTUAL functions from core/instance.js
import {
    getInstanceId,
    getInstanceName,
    setInstanceName,
    _clearInstanceIdCache, // For resetting state between tests
    _clearInstanceNameCache,
} from '../core/instance.js';

// --- GLOBAL TEST SETUP ---
describe('core/instance.js', () => {
    let mockLocalStorage;
    let mockSyncStorage;
    let consoleWarnSpy, consoleErrorSpy;

    beforeEach(async () => {
        // Reset mocks for dependencies
        mockGenerateShortIdInternal.mockReset();
        mockGetPlatformInfoInternal.mockReset();

        // Clear instance module caches
        _clearInstanceIdCache();
        _clearInstanceNameCache();

        // Setup spies on the actual storage module's methods
        // These spies will allow us to see if storage.get/set are called by instance.js
        // and control their return values if necessary for specific test branches.
        jest.spyOn(actualStorage, 'get');
        jest.spyOn(actualStorage, 'set');
        jest.spyOn(actualStorage, 'mergeItem');


        // Use the global browser mock for storage interactions
        mockLocalStorage = global.browser.storage.local;
        mockSyncStorage = global.browser.storage.sync;

        await mockLocalStorage.clear();
        await mockSyncStorage.clear();
        // Default setup for storage often needed by instance.js
        await mockSyncStorage.set({ [SYNC_STORAGE_KEYS.DEVICE_REGISTRY]: {} });
        await mockLocalStorage.set({ [LOCAL_STORAGE_KEYS.INSTANCE_ID]: null });
        await mockLocalStorage.set({ [LOCAL_STORAGE_KEYS.INSTANCE_NAME_OVERRIDE]: null });


        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks(); // Restores all spies
        consoleWarnSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });

    // --- getInstanceId Tests ---
    describe('getInstanceId', () => {
        test('should generate a new ID, store it in local storage, and cache it if none exists', async () => {
            const expectedNewId = 'newlyGeneratedId';
            mockGenerateShortIdInternal.mockReturnValue(expectedNewId);
            // Ensure local storage initially has no ID
            actualStorage.get.mockImplementation(async (area, key) => {
                if (area === mockLocalStorage && key === LOCAL_STORAGE_KEYS.INSTANCE_ID) return null;
                if (area === mockSyncStorage && key === SYNC_STORAGE_KEYS.DEVICE_REGISTRY) return {};
                return undefined;
            });
            actualStorage.set.mockResolvedValue(true);


            const id1 = await getInstanceId();
            expect(id1).toBe(expectedNewId);
            expect(mockGenerateShortIdInternal).toHaveBeenCalledTimes(1);
            expect(actualStorage.get).toHaveBeenCalledWith(mockLocalStorage, LOCAL_STORAGE_KEYS.INSTANCE_ID);
            expect(actualStorage.set).toHaveBeenCalledWith(mockLocalStorage, LOCAL_STORAGE_KEYS.INSTANCE_ID, expectedNewId);

            // Call again, should return cached ID
            const id2 = await getInstanceId();
            expect(id2).toBe(expectedNewId);
            expect(mockGenerateShortIdInternal).toHaveBeenCalledTimes(1); // Not called again
            expect(actualStorage.get).toHaveBeenCalledTimes(1); // Not called again for local ID
        });

        test('should retrieve an existing ID from local storage and cache it', async () => {
            const existingId = 'existingLocalId';
            actualStorage.get.mockResolvedValueOnce(existingId); // For local storage get

            const id1 = await getInstanceId();
            expect(id1).toBe(existingId);
            expect(actualStorage.get).toHaveBeenCalledWith(mockLocalStorage, LOCAL_STORAGE_KEYS.INSTANCE_ID);
            expect(mockGenerateShortIdInternal).not.toHaveBeenCalled();
            expect(actualStorage.set).not.toHaveBeenCalledWith(mockLocalStorage, LOCAL_STORAGE_KEYS.INSTANCE_ID, expect.anything());

            // Call again, should return cached ID
            const id2 = await getInstanceId();
            expect(id2).toBe(existingId);
            expect(actualStorage.get).toHaveBeenCalledTimes(1); // Still only called once for local ID
        });

        test('should handle collisions when generating a new ID', async () => {
            const collidingId1 = 'collide1';
            const collidingId2 = 'collide2';
            const uniqueId = 'uniqueIdAfterCollision';

            mockGenerateShortIdInternal
                .mockReturnValueOnce(collidingId1)
                .mockReturnValueOnce(collidingId2)
                .mockReturnValueOnce(uniqueId);

            // Simulate empty local storage for ID, and a device registry with colliding IDs
            actualStorage.get.mockImplementation(async (area, key) => {
                if (area === mockLocalStorage && key === LOCAL_STORAGE_KEYS.INSTANCE_ID) return null;
                if (area === mockSyncStorage && key === SYNC_STORAGE_KEYS.DEVICE_REGISTRY) {
                    return {
                        [collidingId1]: { name: 'Device Collide 1' },
                        [collidingId2]: { name: 'Device Collide 2' },
                    };
                }
                return undefined;
            });
            actualStorage.set.mockResolvedValue(true);

            const id = await getInstanceId();
            expect(id).toBe(uniqueId);
            expect(mockGenerateShortIdInternal).toHaveBeenCalledTimes(3);
            expect(actualStorage.set).toHaveBeenCalledWith(mockLocalStorage, LOCAL_STORAGE_KEYS.INSTANCE_ID, uniqueId);
        });

        test('should stop trying to generate ID after max attempts on collision', async () => {
            mockGenerateShortIdInternal.mockReturnValue('alwaysCollidingId');
             actualStorage.get.mockImplementation(async (area, key) => {
                if (area === mockLocalStorage && key === LOCAL_STORAGE_KEYS.INSTANCE_ID) return null;
                if (area === mockSyncStorage && key === SYNC_STORAGE_KEYS.DEVICE_REGISTRY) {
                    return { 'alwaysCollidingId': { name: 'Existing Device' } };
                }
                return undefined;
            });
            actualStorage.set.mockResolvedValue(true);

            const id = await getInstanceId(); // Will use the last generated ID despite collision after max attempts
            expect(id).toBe('alwaysCollidingId');
            expect(mockGenerateShortIdInternal).toHaveBeenCalledTimes(10); // Max attempts
            expect(actualStorage.set).toHaveBeenCalledWith(mockLocalStorage, LOCAL_STORAGE_KEYS.INSTANCE_ID, 'alwaysCollidingId');
        });
    });

    // --- getInstanceName Tests ---
    describe('getInstanceName', () => {
        beforeEach(() => {
            // Ensure getInstanceId is also using the spied/mocked storage for these tests
            // For simplicity, let's assume getInstanceId works and returns a known ID for these name tests
            // Or, mock getInstanceId itself if its complexity interferes.
            // Here, we'll let the actual getInstanceId run but control its storage interaction.
            actualStorage.get.mockImplementation(async (area, key, defaultValue) => {
                if (area === mockLocalStorage && key === LOCAL_STORAGE_KEYS.INSTANCE_ID) return 'test-instance-id';
                if (area === mockLocalStorage && key === LOCAL_STORAGE_KEYS.INSTANCE_NAME_OVERRIDE) return null;
                if (area === mockSyncStorage && key === SYNC_STORAGE_KEYS.DEVICE_REGISTRY) return { 'test-instance-id': { name: 'Registry Name' } };
                return defaultValue;
            });
        });

        test('should return name from local override if set', async () => {
            const overrideName = 'My Local Override Name';
            actualStorage.get.mockImplementation(async (area, key) => {
                if (area === mockLocalStorage && key === LOCAL_STORAGE_KEYS.INSTANCE_NAME_OVERRIDE) return overrideName;
                if (area === mockLocalStorage && key === LOCAL_STORAGE_KEYS.INSTANCE_ID) return 'any-id'; // Needed by getInstanceName
                return undefined;
            });

            const name1 = await getInstanceName();
            expect(name1).toBe(overrideName);
            expect(actualStorage.get).toHaveBeenCalledWith(mockLocalStorage, LOCAL_STORAGE_KEYS.INSTANCE_NAME_OVERRIDE, "");
            expect(mockGetPlatformInfoInternal).not.toHaveBeenCalled();

            const name2 = await getInstanceName(); // Should be cached
            expect(name2).toBe(overrideName);
            expect(actualStorage.get).toHaveBeenCalledTimes(1); // For the override
        });

        test('should return name from sync registry if local override is not set or empty', async () => {
            const registryName = 'Device Name From Registry';
            const instanceId = 'registry-test-id';
            actualStorage.get.mockImplementation(async (area, key) => {
                if (area === mockLocalStorage && key === LOCAL_STORAGE_KEYS.INSTANCE_NAME_OVERRIDE) return '   '; // Empty override
                if (area === mockLocalStorage && key === LOCAL_STORAGE_KEYS.INSTANCE_ID) return instanceId;
                if (area === mockSyncStorage && key === SYNC_STORAGE_KEYS.DEVICE_REGISTRY) {
                    return { [instanceId]: { name: registryName, lastSeen: Date.now() } };
                }
                return undefined;
            });

            const name = await getInstanceName();
            expect(name).toBe(registryName);
            expect(actualStorage.get).toHaveBeenCalledWith(mockLocalStorage, LOCAL_STORAGE_KEYS.INSTANCE_NAME_OVERRIDE, "");
            expect(actualStorage.get).toHaveBeenCalledWith(mockLocalStorage, LOCAL_STORAGE_KEYS.INSTANCE_ID);
            expect(actualStorage.get).toHaveBeenCalledWith(mockSyncStorage, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {});
            expect(mockGetPlatformInfoInternal).not.toHaveBeenCalled();
        });

        test('should generate default name if no override and no registry name', async () => {
            const instanceId = 'default-name-test-id';
            mockGetPlatformInfoInternal.mockResolvedValue({ os: 'mac' });
            actualStorage.get.mockImplementation(async (area, key) => {
                if (area === mockLocalStorage && key === LOCAL_STORAGE_KEYS.INSTANCE_NAME_OVERRIDE) return null;
                if (area === mockLocalStorage && key === LOCAL_STORAGE_KEYS.INSTANCE_ID) return instanceId;
                if (area === mockSyncStorage && key === SYNC_STORAGE_KEYS.DEVICE_REGISTRY) return {}; // Empty registry
                return undefined;
            });

            const name = await getInstanceName();
            expect(name).toBe('Mac Device'); // Based on mocked platform info
            expect(mockGetPlatformInfoInternal).toHaveBeenCalledTimes(1);
        });

        test('should generate "Windows Device" for "win" platform', async () => {
            mockGetPlatformInfoInternal.mockResolvedValue({ os: 'win' });
            actualStorage.get.mockImplementation(async (area, key) => {
                 if (area === mockLocalStorage && key === LOCAL_STORAGE_KEYS.INSTANCE_NAME_OVERRIDE) return null;
                 if (area === mockLocalStorage && key === LOCAL_STORAGE_KEYS.INSTANCE_ID) return 'win-device-id';
                 if (area === mockSyncStorage && key === SYNC_STORAGE_KEYS.DEVICE_REGISTRY) return {};
                 return undefined;
            });
            expect(await getInstanceName()).toBe('Windows Device');
        });


        test('should generate fallback "My Device" if platform info fails', async () => {
            mockGetPlatformInfoInternal.mockRejectedValue(new Error('Platform info error'));
            actualStorage.get.mockImplementation(async (area, key) => {
                 if (area === mockLocalStorage && key === LOCAL_STORAGE_KEYS.INSTANCE_NAME_OVERRIDE) return null;
                 if (area === mockLocalStorage && key === LOCAL_STORAGE_KEYS.INSTANCE_ID) return 'fallback-device-id';
                 if (area === mockSyncStorage && key === SYNC_STORAGE_KEYS.DEVICE_REGISTRY) return {};
                 return undefined;
            });
            const name = await getInstanceName();
            expect(name).toBe('My Device');
            expect(consoleWarnSpy).toHaveBeenCalledWith("Could not get platform info for default name, using generic default:", expect.any(Error));
        });
    });

    // --- setInstanceName Tests ---
    describe('setInstanceName', () => {
        const testId = 'set-name-test-id';
        beforeEach(() => {
            // Ensure getInstanceId returns our testId for setInstanceName
            actualStorage.get.mockImplementation(async (area, key) => {
                if (area === mockLocalStorage && key === LOCAL_STORAGE_KEYS.INSTANCE_ID) return testId;
                // Allow other gets for registry etc.
                if (area === mockSyncStorage && key === SYNC_STORAGE_KEYS.DEVICE_REGISTRY) return {};
                return undefined;
            });
            actualStorage.set.mockResolvedValue(true); // Default success for storage.set
            actualStorage.mergeItem.mockResolvedValue({ success: true, mergedData: {}, dataChanged: true }); // Default for merge
        });

        test('should set local override, update sync registry, and clear name cache', async () => {
            const newName = 'My Awesome New Name';
            const result = await setInstanceName(newName);

            expect(result.success).toBe(true);
            expect(result.newName).toBe(newName);

            expect(actualStorage.set).toHaveBeenCalledWith(mockLocalStorage, LOCAL_STORAGE_KEYS.INSTANCE_NAME_OVERRIDE, newName);
            expect(actualStorage.mergeItem).toHaveBeenCalledWith(
                mockSyncStorage,
                SYNC_STORAGE_KEYS.DEVICE_REGISTRY,
                expect.objectContaining({
                    [testId]: expect.objectContaining({
                        name: newName,
                        lastSeen: expect.any(Number),
                    }),
                })
            );

            // Verify cache was cleared by trying to get name again (it should re-fetch/re-generate if not for override)
            _clearInstanceNameCache(); // Manual clear for test verification step
            actualStorage.get.mockImplementation(async (area, key) => { // Setup for re-fetch
                 if (area === mockLocalStorage && key === LOCAL_STORAGE_KEYS.INSTANCE_NAME_OVERRIDE) return newName;
                 return undefined;
            });
            expect(await getInstanceName()).toBe(newName);
        });

        test('should return error if name is empty', async () => {
            const result = await setInstanceName('   ');
            expect(result.success).toBe(false);
            expect(result.message).toBe('Device name cannot be empty.');
            expect(actualStorage.set).not.toHaveBeenCalledWith(mockLocalStorage, LOCAL_STORAGE_KEYS.INSTANCE_NAME_OVERRIDE, expect.anything());
        });

        test('should return error if local storage set fails', async () => {
            actualStorage.set.mockImplementation(async (area, key) => {
                if (area === mockLocalStorage && key === LOCAL_STORAGE_KEYS.INSTANCE_NAME_OVERRIDE) return false; // Simulate failure
                return true;
            });
            const result = await setInstanceName('A Name');
            expect(result.success).toBe(false);
            expect(result.message).toBe('Failed to save device name locally.');
        });

        test('should return error if getInstanceId fails (e.g. returns null)', async () => {
            // Override the specific getInstanceId mock for this one call path
             actualStorage.get.mockImplementation(async (area, key) => {
                if (area === mockLocalStorage && key === LOCAL_STORAGE_KEYS.INSTANCE_ID) return null; // Simulate no ID
                return undefined;
            });
            const result = await setInstanceName('A Name');
            expect(result.success).toBe(false);
            expect(result.message).toBe('Could not retrieve instance ID to update registry.');
        });

        test('should return error if sync storage mergeItem fails', async () => {
            actualStorage.mergeItem.mockResolvedValue({ success: false, message: 'Sync merge failed' });
            const result = await setInstanceName('A Name');
            expect(result.success).toBe(false);
            expect(result.message).toBe('Sync merge failed');
        });
    });
});