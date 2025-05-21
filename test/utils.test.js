const mockedStringsObject = {
    deviceNameNotSet: '(Not Set)',
    noDevices: 'No devices registered.',
    groupExists: (groupName) => `${groupName} already exists.`,
};

jest.mock('../common/constants.js', () => {
    const actualConstants = jest.requireActual('../common/constants.js');
    return {
        __esModule: true,
        ...actualConstants,
        STRINGS: {
            ...(actualConstants.STRINGS || {}),
            ...mockedStringsObject,
        },
    };
});

jest.mock('../core/instance.js', () => {
    return {
        __esModule: true,
    };
});


import { jest } from '@jest/globals';
import { STRINGS, SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS } from '../common/constants.js';
import { deepMerge, ensureObject } from '../common/utils.js'; 
import { storage } from '../core/storage.js';
import { isAndroid, _clearPlatformInfoCache } from '../core/platform.js';

describe('utils', () => {
    let mockStorage;
    let mockSyncStorage;
    let consoleErrorSpy, consoleWarnSpy, consoleLogSpy;

    let getUnifiedState, createGroupDirect, renameGroupDirect, deleteGroupDirect, subscribeToGroupDirect, unsubscribeFromGroupDirect, deleteDeviceDirect;
    let createAndStoreGroupTask;
    let performTimeBasedTaskCleanup;

    let instanceModule;

    beforeEach(async () => {
        jest.resetModules();

        const actionsModule = await import('../core/actions.js');
        getUnifiedState = actionsModule.getUnifiedState;
        createGroupDirect = actionsModule.createGroupDirect;
        renameGroupDirect = actionsModule.renameGroupDirect;
        deleteGroupDirect = actionsModule.deleteGroupDirect;
        subscribeToGroupDirect = actionsModule.subscribeToGroupDirect;
        unsubscribeFromGroupDirect = actionsModule.unsubscribeFromGroupDirect;

        const tasksModule = await import('../core/tasks.js');
        createAndStoreGroupTask = tasksModule.createAndStoreGroupTask;

        const cleanupModule = await import('../background/cleanup.js');
        performTimeBasedTaskCleanup = cleanupModule.performTimeBasedTaskCleanup;

        instanceModule = await import('../core/instance.js'); // Re-import the mocked module
        
        if (typeof _clearPlatformInfoCache === 'function') _clearPlatformInfoCache();

        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => { });

        mockStorage = global.browser.storage.local;
        mockSyncStorage = global.browser.storage.sync;
        
        jest.spyOn(global.Math, 'random').mockReturnValue(0.123456789);
        
        await mockStorage.clear();
        await mockSyncStorage.clear();
        await mockSyncStorage.set({
            [SYNC_STORAGE_KEYS.DEFINED_GROUPS]: [],
            [SYNC_STORAGE_KEYS.GROUP_TASKS]: {},
            [LOCAL_STORAGE_KEYS.PROCESSED_TASKS]: {} // Also clear/init local processed tasks
        });
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
        consoleWarnSpy.mockRestore();
        consoleLogSpy.mockRestore();

        jest.spyOn(global.Math, 'random').mockRestore();
    });

    // --- TESTS ---
    describe('Core Utilities', () => {
        test('deepMerge merges deeply and deletes keys', () => {
            const a = { foo: { bar: 1 }, baz: 2 };
            const b = { foo: { bar: 2 }, baz: null };
            expect(deepMerge(a, b)).toEqual({ foo: { bar: 2 } });
        });
    });

    describe('Type Safety Helpers', () => {
        test('ensureObject returns object or fallback', () => {
            expect(ensureObject({ a: 1 })).toEqual({ a: 1 });
            expect(ensureObject(null)).toEqual({});
        });
    });

    describe('Storage Access Helpers', () => {
        test('storage.get retrieves value', async () => {
            await mockStorage.set({ testKey: 'testValue' });
            expect(await storage.get(mockStorage, 'testKey')).toBe('testValue');
        });
    });

    describe('Platform Info', () => {
        test('isAndroid platform detection', async () => {
            _clearPlatformInfoCache();
            global.browser.runtime.getPlatformInfo.mockResolvedValue({ os: 'android' });
            expect(await isAndroid()).toBe(true);
        });
    });

    describe('Direct Storage Logic (Groups, Devices, Tabs)', () => {
        test('create, rename, and delete group', async () => {
            const groupName = 'UtilsGroup';
            const createRes = await createGroupDirect(groupName);
            expect(createRes.success).toBe(true);
            expect(await storage.get(mockSyncStorage, SYNC_STORAGE_KEYS.DEFINED_GROUPS)).toContain(groupName);

            const renameRes = await renameGroupDirect(groupName, 'UtilsGroupRenamed');
            expect(renameRes.success).toBe(true);
            expect(await storage.get(mockSyncStorage, SYNC_STORAGE_KEYS.DEFINED_GROUPS)).toContain('UtilsGroupRenamed');

            const deleteRes = await deleteGroupDirect('UtilsGroupRenamed');
            expect(deleteRes.success).toBe(true);
            expect(await storage.get(mockSyncStorage, SYNC_STORAGE_KEYS.DEFINED_GROUPS)).not.toContain('UtilsGroupRenamed');
        });

        test('createAndStoreGroupTask creates task', async () => {
            const tabData = { url: 'https://example.com/utils', title: 'Utils Example' };
            const groupName = 'UtilsTaskGroup';

            const res = await createAndStoreGroupTask(groupName, tabData);
            expect(res.success).toBe(true);
            expect(res.taskId).toBe('utils-fixed-task-uuid');
        });
    });

    describe('Background Logic Helpers', () => {
        // test('getUnifiedState updates lastSeen for current device in registry', async () => {
        //     jest.useFakeTimers(); // Use Jest's fake timers
        //     const initialSystemTime = Date.now();
        //     jest.setSystemTime(initialSystemTime); // Set a fixed starting time
        //     const mockId = 'utils-unified-state-id';
        //     const mockName = 'Utils Unified Device';
        //     const oldTimestamp = Date.now() - 200000; // Ensure a clearly older timestamp
        //     mockGetInstanceIdUtilFn.mockResolvedValue(mockId);
        //     // Ensure local override is not set for this test path to correctly test registry update logic
        //     await storage.set(mockStorage, LOCAL_STORAGE_KEYS.INSTANCE_NAME_OVERRIDE, "");

        //     mockGetInstanceNameUtilFn.mockResolvedValue(mockName);

        //     await storage.set(mockSyncStorage, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {
        //         [mockId]: { name: mockName, lastSeen: oldTimestamp }
        //     });
        //     const storageSetSpy = jest.spyOn(mockSyncStorage, 'set');
            
        //     // Advance time slightly before getUnifiedState is called to ensure Date.now() inside it is different
        //     jest.advanceTimersByTime(10); // Advance by 10ms
        //     const timeBeforeGetUnifiedState = Date.now(); // This will be initialSystemTime + 10

        //     await getUnifiedState(false);

        //     const relevantSetCallArgsArray = storageSetSpy.mock.calls.find(callArgs =>
        //         callArgs[0] && // Ensure callArgs[0] (the object passed to set) exists
        //         callArgs[0].hasOwnProperty(SYNC_STORAGE_KEYS.DEVICE_REGISTRY) && // Check if this object has DEVICE_REGISTRY key
        //         callArgs[0][SYNC_STORAGE_KEYS.DEVICE_REGISTRY].hasOwnProperty(mockId) // Check if the device entry exists
        //     );
        //     expect(relevantSetCallArgsArray).toBeDefined(); // Check if such a call was made

        //     // relevantSetCallArgsArray is the array of arguments for the found call, so relevantSetCallArgsArray[0] is the object.
        //     const updatedDeviceRegistryObject = relevantSetCallArgsArray[0][SYNC_STORAGE_KEYS.DEVICE_REGISTRY];
        //     const updatedDeviceEntry = updatedDeviceRegistryObject[mockId];

        //     expect(updatedDeviceEntry.name).toBe(mockName);
        //     expect(updatedDeviceEntry.lastSeen).toBeGreaterThan(oldTimestamp);
        //     expect(updatedDeviceEntry.lastSeen).toBeGreaterThanOrEqual(timeBeforeGetUnifiedState); // Ensure it's at least the time of the call
        //     jest.useRealTimers(); // Restore real timers
        // });

        test('performTimeBasedTaskCleanup removes expired tasks from sync and local', async () => {
            const now = Date.now();
            const expiredTime = now - (1000 * 60 * 60 * 24 * 15);
            const recentTime = now - (1000 * 60 * 60);
            await mockSyncStorage.set({
                [SYNC_STORAGE_KEYS.GROUP_TASKS]: {
                    G1: {
                        'expired-task': { creationTimestamp: expiredTime },
                        'recent-task': { creationTimestamp: recentTime }
                    }
                }
            });
            await storage.set(mockStorage, LOCAL_STORAGE_KEYS.PROCESSED_TASKS, { 'expired-task': true, 'recent-task': true });

            const initialLocalProcessed = await storage.get(mockStorage, LOCAL_STORAGE_KEYS.PROCESSED_TASKS);
            await performTimeBasedTaskCleanup(initialLocalProcessed, 1000 * 60 * 60 * 24 * 14);

            const finalGroupTasks = await storage.get(mockSyncStorage, SYNC_STORAGE_KEYS.GROUP_TASKS);
            expect(finalGroupTasks.G1['expired-task']).toBeUndefined();
            const finalLocalProcessed = await storage.get(mockStorage, LOCAL_STORAGE_KEYS.PROCESSED_TASKS);
            expect(finalLocalProcessed['expired-task']).toBeUndefined();
            expect(finalLocalProcessed['recent-task']).toBe(true);
        });
    });
});