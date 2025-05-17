const mockGenerateShortIdInternal = jest.fn();
const mockGetPlatformInfoInternal = jest.fn();

import { storage as actualStorage } from '../core/storage.js';

jest.mock('../core/platform.js', () => ({
    __esModule: true,
    getPlatformInfoCached: jest.fn(), // This will be mockGetPlatformInfoInternal
    _clearPlatformInfoCache: jest.fn(),
}));

import { jest } from '@jest/globals';
import { SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS } from '../common/constants.js';
import * as actualInstanceModule from '../core/instance.js';

const {
    getInstanceId, getInstanceName, setInstanceName,
    _clearInstanceIdCache, _clearInstanceNameCache
} = actualInstanceModule;

describe('core/instance.js', () => {
    let mockLocalStorage;
    let mockSyncStorage;
    let consoleWarnSpy, consoleErrorSpy;

    let mockedGetPlatformInfoCached;
    let spiedGenerateShortId;

    beforeEach(async () => {
        mockGenerateShortIdInternal.mockReset();
        mockGetPlatformInfoInternal.mockReset();
        const platform = await import('../core/platform.js');
        mockedGetPlatformInfoCached = platform.getPlatformInfoCached;
        mockedGetPlatformInfoCached.mockImplementation(mockGetPlatformInfoInternal);

        spiedGenerateShortId = jest.spyOn(actualInstanceModule, 'generateShortId').mockImplementation(mockGenerateShortIdInternal);

        _clearInstanceIdCache();
        _clearInstanceNameCache();

        jest.spyOn(actualStorage, 'get');
        jest.spyOn(actualStorage, 'set');
        jest.spyOn(actualStorage, 'mergeItem');

        mockLocalStorage = global.browser.storage.local;
        mockSyncStorage = global.browser.storage.sync;

        await mockLocalStorage.clear();
        await mockSyncStorage.clear();
        await mockSyncStorage.set({ [SYNC_STORAGE_KEYS.DEVICE_REGISTRY]: {} });
        await mockLocalStorage.set({ [LOCAL_STORAGE_KEYS.INSTANCE_ID]: null });
        await mockLocalStorage.set({ [LOCAL_STORAGE_KEYS.INSTANCE_NAME_OVERRIDE]: null });

        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks(); // Restores all spies
        // consoleWarnSpy.mockRestore();
        // consoleErrorSpy.mockRestore();
    });

    describe('getInstanceId', () => {
        test('should generate a new ID, store it in local storage, and cache it if none exists', async () => {
            const expectedNewId = 'newlyGeneratedId';
            mockGenerateShortIdInternal.mockReturnValue(expectedNewId); // This mock will be used by the spy
            actualStorage.get.mockImplementation(async (area, key) => {
                if (area === mockLocalStorage && key === LOCAL_STORAGE_KEYS.INSTANCE_ID) return null;
                if (area === mockSyncStorage && key === SYNC_STORAGE_KEYS.DEVICE_REGISTRY) return {}; 
                return undefined;
            });
            actualStorage.set.mockResolvedValue(true);

            const id1 = await getInstanceId();
            expect(id1).toBe(expectedNewId);
            expect(spiedGenerateShortId).toHaveBeenCalledTimes(1); // Check the spy
            expect(actualStorage.get).toHaveBeenCalledWith(mockLocalStorage, LOCAL_STORAGE_KEYS.INSTANCE_ID);
            expect(actualStorage.set).toHaveBeenCalledWith(mockLocalStorage, LOCAL_STORAGE_KEYS.INSTANCE_ID, expectedNewId);

            const id2 = await getInstanceId();
            expect(id2).toBe(expectedNewId);
            expect(spiedGenerateShortId).toHaveBeenCalledTimes(1); // Not called again
            expect(actualStorage.get).toHaveBeenCalledTimes(1); // Not called again for local ID
        });

        test('should retrieve an existing ID from local storage and cache it', async () => {
            const existingId = 'existingLocalId';
            actualStorage.get.mockResolvedValueOnce(existingId); // For local storage get

            const id1 = await getInstanceId();
            expect(id1).toBe(existingId);
            expect(actualStorage.get).toHaveBeenCalledWith(mockLocalStorage, LOCAL_STORAGE_KEYS.INSTANCE_ID);
            expect(spiedGenerateShortId).not.toHaveBeenCalled();
            expect(actualStorage.set).not.toHaveBeenCalledWith(mockLocalStorage, LOCAL_STORAGE_KEYS.INSTANCE_ID, expect.anything());

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
            expect(spiedGenerateShortId).toHaveBeenCalledTimes(3);
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
            expect(spiedGenerateShortId).toHaveBeenCalledTimes(10); // Max attempts
            expect(actualStorage.set).toHaveBeenCalledWith(mockLocalStorage, LOCAL_STORAGE_KEYS.INSTANCE_ID, 'alwaysCollidingId');
        });
    });

    describe('getInstanceName', () => {
        beforeEach(() => {
            actualStorage.get.mockImplementation(async (area, key, defaultValue) => {
                if (area === mockLocalStorage && key === LOCAL_STORAGE_KEYS.INSTANCE_ID) return 'test-instance-id';
                if (area === mockLocalStorage && key === LOCAL_STORAGE_KEYS.INSTANCE_NAME_OVERRIDE) return ""; 
                if (area === mockSyncStorage && key === SYNC_STORAGE_KEYS.DEVICE_REGISTRY) return { 'test-instance-id': { name: 'Registry Name' } };
                return defaultValue;
            });
        });

        test('should return name from local override if set', async () => {
            const overrideName = 'My Local Override Name';
            actualStorage.get.mockImplementation(async (area, key) => {
                if (area === mockLocalStorage && key === LOCAL_STORAGE_KEYS.INSTANCE_NAME_OVERRIDE) return overrideName;
                if (area === mockLocalStorage && key === LOCAL_STORAGE_KEYS.INSTANCE_ID) return 'any-id';
                return undefined;
            });

            const name1 = await getInstanceName();
            expect(name1).toBe(overrideName);
            expect(actualStorage.get).toHaveBeenCalledWith(mockLocalStorage, LOCAL_STORAGE_KEYS.INSTANCE_NAME_OVERRIDE, "");
            expect(mockedGetPlatformInfoCached).not.toHaveBeenCalled();

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
            expect(mockedGetPlatformInfoCached).not.toHaveBeenCalled();
        });

        test('should generate default name if no override and no registry name', async () => {
            const instanceId = 'default-name-test-id';
            mockGetPlatformInfoInternal.mockResolvedValueOnce({ os: 'mac' }); // Use mockResolvedValueOnce for test-specific platform
            actualStorage.get.mockImplementation(async (area, key) => {
                if (area === mockLocalStorage && key === LOCAL_STORAGE_KEYS.INSTANCE_NAME_OVERRIDE) return null;
                if (area === mockLocalStorage && key === LOCAL_STORAGE_KEYS.INSTANCE_ID) return instanceId;
                if (area === mockSyncStorage && key === SYNC_STORAGE_KEYS.DEVICE_REGISTRY) return {}; // Empty registry
                return undefined;
            });
            const name = await getInstanceName();
            expect(name).toBe('Mac Device'); // Based on mocked platform info
            expect(mockedGetPlatformInfoCached).toHaveBeenCalledTimes(1);
        });

        test('should generate "Windows Device" for "win" platform', async () => {
            mockGetPlatformInfoInternal.mockResolvedValueOnce({ os: 'win' });
            actualStorage.get.mockImplementation(async (area, key) => {
                 if (area === mockLocalStorage && key === LOCAL_STORAGE_KEYS.INSTANCE_NAME_OVERRIDE) return null;
                 if (area === mockLocalStorage && key === LOCAL_STORAGE_KEYS.INSTANCE_ID) return 'win-device-id';
                 if (area === mockSyncStorage && key === SYNC_STORAGE_KEYS.DEVICE_REGISTRY) return {};
                 return undefined;
            });
            expect(await getInstanceName()).toBe('Windows Device');
        });


        test('should generate fallback "My Device" if platform info fails', async () => {
            mockGetPlatformInfoInternal.mockRejectedValueOnce(new Error('Platform info error'));
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

    describe('setInstanceName', () => {
        const testId = 'set-name-test-id';
        beforeEach(() => {
            actualStorage.get.mockImplementation(async (area, key) => {
                if (area === mockLocalStorage && key === LOCAL_STORAGE_KEYS.INSTANCE_ID) return testId;
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
            // Spy on getInstanceId *within this test only* to make it return null
            const getInstanceIdSpy = jest.spyOn(actualInstanceModule, 'getInstanceId').mockResolvedValueOnce(null);

            const result = await setInstanceName('A Name');
            expect(result.success).toBe(false);
            expect(result.message).toBe('Could not retrieve instance ID to update registry.');
            getInstanceIdSpy.mockRestore(); // Clean up the spy
        });

        test('should return error if sync storage mergeItem fails', async () => {
            actualStorage.mergeItem.mockResolvedValue({ success: false, message: 'Sync merge failed' });
            const result = await setInstanceName('A Name');
            expect(result.success).toBe(false);
            expect(result.message).toBe('Sync merge failed');
        });
    });
});