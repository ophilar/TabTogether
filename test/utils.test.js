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

let mockGetInstanceIdUtilFn = jest.fn();
let mockGetInstanceNameUtilFn = jest.fn();
let mockSetInstanceNameUtilFn = jest.fn();
let mockGenerateShortIdUtil = jest.fn(); // If generateShortId is part of instance's public API

jest.mock('../core/instance.js', () => {
    const actualInstanceModule = jest.requireActual('../core/instance.js');
    return {
        __esModule: true,
        getInstanceId: (...args) => mockGetInstanceIdUtilFn(...args),
        getInstanceName: (...args) => mockGetInstanceNameUtilFn(...args),
        setInstanceName: (...args) => mockSetInstanceNameUtilFn(...args),
        generateShortId: (...args) => mockGenerateShortIdUtil(...args),
        _clearInstanceIdCache: actualInstanceModule._clearInstanceIdCache,
        _clearInstanceNameCache: actualInstanceModule._clearInstanceNameCache,
    };
});


import { jest } from '@jest/globals';
import { STRINGS, SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS } from '../common/constants.js';
import { deepMerge, ensureObject } from '../common/utils.js'; // Removed unused imports
import { storage } from '../core/storage.js';
import { isAndroid, _clearPlatformInfoCache } from '../core/platform.js';
import { renderDeviceRegistryUI } from '../ui/options/options-ui.js'; 

describe('utils', () => {
    let mockStorage;
    let mockSyncStorage;
    let consoleErrorSpy, consoleWarnSpy, consoleLogSpy;

    let performHeartbeat;
    let getUnifiedState, createGroupDirect, renameGroupDirect, deleteGroupDirect, subscribeToGroupDirect, unsubscribeFromGroupDirect, deleteDeviceDirect;
    let createAndStoreGroupTask;
    let performStaleDeviceCheck, performTimeBasedTaskCleanup;

    let instanceModule;

    beforeEach(async () => {
        jest.resetModules();

        mockGetInstanceIdUtilFn = jest.fn();
        mockGetInstanceNameUtilFn = jest.fn();
        mockSetInstanceNameUtilFn = jest.fn();
        mockGenerateShortIdUtil = jest.fn();

        mockGetInstanceIdUtilFn.mockResolvedValue('utils-default-mock-id');
        mockGetInstanceNameUtilFn.mockResolvedValue('Utils Default Mock Name');
        mockSetInstanceNameUtilFn.mockResolvedValue({ success: true, newName: 'Utils Default Set Name' });
        mockGenerateShortIdUtil.mockReturnValue('default-short-id'); // Default for generateShortId if used

        const heartbeatModule = await import('../background/heartbeat.js');
        performHeartbeat = heartbeatModule.performHeartbeat;

        const actionsModule = await import('../core/actions.js');
        getUnifiedState = actionsModule.getUnifiedState;
        createGroupDirect = actionsModule.createGroupDirect;
        renameGroupDirect = actionsModule.renameGroupDirect;
        deleteGroupDirect = actionsModule.deleteGroupDirect;
        subscribeToGroupDirect = actionsModule.subscribeToGroupDirect;
        unsubscribeFromGroupDirect = actionsModule.unsubscribeFromGroupDirect;
        deleteDeviceDirect = actionsModule.deleteDeviceDirect;

        const tasksModule = await import('../core/tasks.js');
        createAndStoreGroupTask = tasksModule.createAndStoreGroupTask;

        const cleanupModule = await import('../background/cleanup.js');
        performStaleDeviceCheck = cleanupModule.performStaleDeviceCheck;
        performTimeBasedTaskCleanup = cleanupModule.performTimeBasedTaskCleanup;

        instanceModule = await import('../core/instance.js'); // Re-import the mocked module
        
        if (typeof _clearPlatformInfoCache === 'function') _clearPlatformInfoCache();
        instanceModule._clearInstanceIdCache();
        instanceModule._clearInstanceNameCache();

        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => { });

        mockStorage = global.browser.storage.local;
        mockSyncStorage = global.browser.storage.sync;
        
        jest.spyOn(global.Math, 'random').mockReturnValue(0.123456789);
        
        await mockStorage.clear();
        await mockSyncStorage.clear();
        await mockSyncStorage.set({
            [SYNC_STORAGE_KEYS.DEVICE_REGISTRY]: {},
            [SYNC_STORAGE_KEYS.SUBSCRIPTIONS]: {},
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

    describe('Instance ID/Name (Verifying Mock Usage by Other Utilities)', () => {
        // test('Utilities calling getInstanceId receive the mocked ID', async () => {
        //     const specificIdForTest = 'id-for-utility-test';
        //     mockGetInstanceIdUtilFn.mockResolvedValue(specificIdForTest);

        //     mockGetInstanceNameUtilFn.mockResolvedValue('Some Name');
        //     await performHeartbeat(); // performHeartbeat calls getInstanceId internally
        //     expect(mockGetInstanceIdUtilFn).toHaveBeenCalled();
        // });

        // test('Utilities calling getInstanceName receive the mocked Name', async () => {
        //     const specificNameForTest = 'name-for-utility-test';
        //     mockGetInstanceNameUtilFn.mockResolvedValue(specificNameForTest);

        //     mockGetInstanceIdUtilFn.mockResolvedValue('some-id'); // Dependency for performHeartbeat
        //     await performHeartbeat(); // performHeartbeat calls getInstanceName
        //     expect(mockGetInstanceNameUtilFn).toHaveBeenCalled();
        // });

        //  test('Utilities calling setInstanceName trigger the mock', async () => {
        //     const nameToSet = 'name-via-utility';
        //     const mockResponse = {success: true, newName: nameToSet};
        //     mockSetInstanceNameUtilFn.mockResolvedValue(mockResponse);

        //     const result = await instanceModule.setInstanceName(nameToSet); // Direct call for simplicity here

        //     expect(mockSetInstanceNameUtilFn).toHaveBeenCalledWith(nameToSet);
        //     expect(result).toEqual(mockResponse);
        // });
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

        // test('subscribe/unsubscribe affects sync storage', async () => {
        //     const groupName = 'UtilsSubGroup';
        //     await createGroupDirect(groupName); // Ensure group exists
        //     const testInstanceId = 'utils-device-sub-id';
        //     mockGetInstanceIdUtilFn.mockResolvedValue(testInstanceId); // Configure for subscribe/unsubscribe

        //     const subRes = await subscribeToGroupDirect(groupName);
        //     expect(subRes.success).toBe(true);
        //     const subscriptionsAfterSub = await storage.get(mockSyncStorage, SYNC_STORAGE_KEYS.SUBSCRIPTIONS);
        //     expect(subscriptionsAfterSub[groupName]).toContain(testInstanceId);

        //     const unsubRes = await unsubscribeFromGroupDirect(groupName);
        //     expect(unsubRes.success).toBe(true);
        //     const subscriptionsAfterUnsub = await storage.get(mockSyncStorage, SYNC_STORAGE_KEYS.SUBSCRIPTIONS);
        //     expect(subscriptionsAfterUnsub[groupName] || []).not.toContain(testInstanceId);
        // });

        test('device delete', async () => {
            const instanceId = 'utils-id-to-delete';
            await storage.set(mockSyncStorage, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, { [instanceId]: { name: 'Device to Delete', lastSeen: 1 } });
            const res = await deleteDeviceDirect(instanceId);
            expect(res.success).toBe(true);
            expect(await storage.get(mockSyncStorage, SYNC_STORAGE_KEYS.DEVICE_REGISTRY)).not.toHaveProperty(instanceId);
        });

        test('createAndStoreGroupTask creates task', async () => {
            const senderId = 'utils-sender-task-id';
            const tabData = { url: 'https://example.com/utils', title: 'Utils Example' };
            const groupName = 'UtilsTaskGroup';
            mockGetInstanceIdUtilFn.mockResolvedValue(senderId); // createAndStoreGroupTask uses getInstanceId
            global.crypto.randomUUID.mockReturnValue('utils-fixed-task-uuid');

            const res = await createAndStoreGroupTask(groupName, tabData);
            expect(res.success).toBe(true);
            expect(res.taskId).toBe('utils-fixed-task-uuid');
        });
    });

    describe('Background Logic Helpers', () => {
        // test('performHeartbeat merges correct data into deviceRegistry', async () => {
        //     const instanceId = 'utils-heartbeat-id';
        //     const instanceName = 'Utils Heartbeat Device';
        //     mockGetInstanceIdUtilFn.mockResolvedValue(instanceId);
        //     mockGetInstanceNameUtilFn.mockResolvedValue(instanceName);

        //     await mockSyncStorage.set({ [SYNC_STORAGE_KEYS.DEVICE_REGISTRY]: { 'other': {name: 'o', lastSeen:0}} });
        //     const beforeTimestamp = Date.now();
        //     await performHeartbeat(); // Calls mocked getInstanceId/Name

        //     const registry = await storage.get(mockSyncStorage, SYNC_STORAGE_KEYS.DEVICE_REGISTRY);
        //     expect(registry[instanceId]).toBeDefined();
        //     expect(registry[instanceId].name).toBe(instanceName);
        //     expect(registry[instanceId].lastSeen).toBeGreaterThanOrEqual(beforeTimestamp);
        // });

        // test('performHeartbeat handles missing instanceId', async () => {
        //     mockGetInstanceIdUtilFn.mockResolvedValue(null); // Configure mock
        //     await performHeartbeat();
        //     expect(consoleWarnSpy).toHaveBeenCalledWith("Heartbeat skipped: Instance ID not available yet.");
        // });

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

        // test('performStaleDeviceCheck removes stale devices', async () => {
        //     const now = Date.now();
        //     const staleTime = now - (1000 * 60 * 60 * 24 * 31);
        //     await storage.set(mockSyncStorage, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, { 'stale-id': { name: 'Stale', lastSeen: staleTime }});
        //     await storage.set(mockSyncStorage, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, { 'stale-id': ['G1']});
        //     await performStaleDeviceCheck(undefined, undefined, 1000 * 60 * 60 * 24 * 30);
        //     expect(await storage.get(mockSyncStorage, SYNC_STORAGE_KEYS.DEVICE_REGISTRY)).not.toHaveProperty('stale-id');
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

    describe('UI Rendering Helpers (DOM)', () => {
        let container;
        beforeEach(() => {
            document.body.innerHTML = '';
            container = document.createElement('div');
            document.body.appendChild(container);
        });
        test('renderDeviceRegistryUI shows no devices', () => {
            renderDeviceRegistryUI(container, { deviceRegistry: {}, instanceId: 'id', instanceName: 'name' }, {});
            expect(container.textContent).toBe(STRINGS.noDevices);
        });
    });
});