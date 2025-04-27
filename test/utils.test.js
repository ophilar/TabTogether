import { jest } from '@jest/globals';

import * as utils from '../utils.js';
import { STRINGS } from '../constants.js'; // Import STRINGS and other constants for UI tests

// Mock the constants dependency
jest.mock('../constants.js', () => ({
    STRINGS: {
        deviceNameNotSet: '(Not Set)',
        noDevices: 'No devices registered.',
        noGroups: 'No groups defined. Use Settings to create one.',
        notSubscribed: 'Not subscribed to any groups.',
        subscribedGroups: 'Subscribed groups: ',
        loadingGroups: 'Loading groups...',
        loadingRegistry: 'Loading registry...',
        error: 'Error',
        confirmRenameGroup: (oldName, newName) => `Rename group "${oldName}" to "${newName}"?`,
        confirmDeleteGroup: groupName => `Are you sure you want to delete the group "${groupName}"? This cannot be undone and will affect all devices.`,
        confirmRenameDevice: newName => `Rename device to "${newName}"?`,
        confirmDeleteDevice: deviceName => `Are you sure you want to delete device "${deviceName}"? This cannot be undone and will affect all groups.`,
        sendTabToGroup: groupName => `Send current tab to group '${groupName}'`,
        sendTabToGroupAria: groupName => `Send current tab to group ${groupName}`,
        sendTabToGroupBtn: 'Send Tab to Group',
        sendTabFailed: 'Send failed.',
        sendTabError: error => `Error: ${error}`,
        sendTabCannot: 'Cannot send this type of tab.',
        deviceRenameSuccess: newName => `Device renamed to "${newName}".`,
        deviceDeleteSuccess: deviceName => `Device "${deviceName}" deleted successfully.`,
        groupRenameSuccess: newName => `Group renamed to "${newName}".`,
        groupDeleteSuccess: groupName => `Group "${groupName}" deleted successfully.`,
        groupCreateSuccess: groupName => `Group "${groupName}" created successfully.`,
        groupCreateFailed: 'Failed to create group.',
        groupRenameFailed: 'Rename failed.',
        groupDeleteFailed: 'Failed to delete group.',
        deviceRenameFailed: 'Rename failed.',
        deviceDeleteFailed: 'Delete failed.',
        saveNameFailed: 'Failed to save name.',
        saveNameSuccess: 'Device name saved successfully.',
        loadingSettingsError: error => `Error loading settings: ${error}`,
        testNotificationSent: 'Test notification sent!',
        testNotificationFailed: error => `Failed to send notification: ${error}`,
        androidBanner: 'Note: On Firefox for Android, background processing is not available. Open this page and tap "Sync Now" to process new tabs or changes.'
    },
    DEFAULT_DEVICE_ICON: '💻',
}));

describe('utils', () => {
    let mockStorage;
    let mockSyncStorage;
    let consoleErrorSpy, consoleWarnSpy, consoleLogSpy;

    beforeEach(async () => {   
        mockStorage = global.browser.storage.local;
        mockSyncStorage = global.browser.storage.sync;

        // Reset platformInfo cache
        if (mockStorage._getStore) {
            delete mockStorage._getStore().platformInfo;
        }
        // global.browser.runtime.getPlatformInfo.mockResolvedValue({ os: 'win' });
        
        // Suppress console output during tests unless needed for debugging
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        // Restore console spies
        consoleErrorSpy.mockRestore();
        consoleWarnSpy.mockRestore();
        consoleLogSpy.mockRestore();
    });

    // --- Core Utilities (deepMerge, isObject) ---
    describe('Core Utilities', () => {
        test('deepMerge merges deeply and deletes keys', () => {
            const a = { foo: { bar: 1 }, baz: 2 };
            const b = { foo: { bar: 2 }, baz: null };
            expect(utils.deepMerge(a, b)).toEqual({ foo: { bar: 2 } });
        });

        test('isObject works', () => {
            expect(utils.isObject({})).toBe(true);
            expect(utils.isObject([])).toBe(false);
            expect(utils.isObject(null)).toBe(false);
        });
    });

    // --- Type Safety Helpers ---
    describe('Type Safety Helpers', () => {
        test('ensureObject returns object or fallback', () => {
            expect(utils.ensureObject({ a: 1 })).toEqual({ a: 1 });
            expect(utils.ensureObject(null)).toEqual({});
            expect(utils.ensureObject(undefined)).toEqual({});
            expect(utils.ensureObject([])).toEqual({});
            expect(utils.ensureObject('string')).toEqual({});
            expect(utils.ensureObject(123)).toEqual({});
            expect(utils.ensureObject(true, { x: 0 })).toEqual({ x: 0 });
        });

        test('ensureArray returns array or fallback', () => {
            expect(utils.ensureArray([1, 2])).toEqual([1, 2]);
            expect(utils.ensureArray(null)).toEqual([]);
            expect(utils.ensureArray(undefined)).toEqual([]);
            expect(utils.ensureArray({})).toEqual([]);
            expect(utils.ensureArray('string')).toEqual([]);
            expect(utils.ensureArray(123)).toEqual([]);
            expect(utils.ensureArray(true, ['a'])).toEqual(['a']);
        });

        test('ensureString returns string or fallback', () => {
            expect(utils.ensureString('hello')).toBe('hello');
            expect(utils.ensureString(null)).toBe('');
            expect(utils.ensureString(undefined)).toBe('');
            expect(utils.ensureString({})).toBe('');
            expect(utils.ensureString([])).toBe('');
            expect(utils.ensureString(123)).toBe('');
            expect(utils.ensureString(true, 'def')).toBe('def');
        });
    });

    // --- Storage Access Helpers (storage.get / storage.set / storage object / mergeSyncStorage) ---
    describe('Storage Access Helpers', () => {
        test('storage.get retrieves value', async () => {
            await mockStorage.set({ testKey: 'testValue' });
            const value = await utils.storage.get(mockStorage, 'testKey');
            expect(value).toBe('testValue');
            expect(mockStorage.get).toHaveBeenCalledWith('testKey');
        });

        test('storage.get returns default value if not found', async () => {
            const value = await utils.storage.get(mockStorage, 'nonExistentKey', 'defaultValue');
            expect(value).toBe('defaultValue');
        });

        test('storage.get handles errors and returns default', async () => {
            // Configure mock to throw error on 'get' for 'anyKey'
            mockStorage._simulateError('get', 'anyKey');
            const value = await utils.storage.get(mockStorage, 'anyKey', 'fallback');
            expect(value).toBe('fallback');
            // Error should have been logged by storage.get
            expect(console.error).toHaveBeenCalledWith('Error getting anyKey:', expect.any(Error));
        });

        test('storage.set sets value', async () => {
            const success = await utils.storage.set(mockStorage, 'newKey', { data: 1 });
            expect(success).toBe(true);
            expect(mockStorage.set).toHaveBeenCalledWith({ newKey: { data: 1 } });
            const stored = await mockStorage.get('newKey');
            expect(stored.newKey).toEqual({ data: 1 });
        });

        test('storage.set handles errors and returns false', async () => {
            // Configure mock to throw error on 'set' for 'failKey'
            mockStorage._simulateError('set', 'failKey');
            const success = await utils.storage.set(mockStorage, 'failKey', 'value');
            expect(success).toBe(false);
            // Error should have been logged by storage.set
            expect(console.error).toHaveBeenCalledWith('Error setting failKey:', expect.any(Error));
        });

        // Test the 'storage' object wrapper
        test('storage.get retrieves value', async () => {
            await mockSyncStorage.set({ syncKey: 'syncValue' });
            const value = await utils.storage.get(mockSyncStorage, 'syncKey');
            expect(value).toBe('syncValue');
        });

        test('storage.set sets value', async () => {
            await utils.storage.set(mockSyncStorage, 'anotherSyncKey', [1, 2]);
            const stored = await mockSyncStorage.get('anotherSyncKey');
            expect(stored.anotherSyncKey).toEqual([1, 2]);
        });

        test('storage.merge performs deep merge', async () => {
            await mockSyncStorage.set({ mergeKey: { a: 1, b: { x: 10 } } });
            const success = await utils.storage.merge(mockSyncStorage, 'mergeKey', { b: { y: 20 }, c: 3 });
            expect(success).toBe(true);
            const stored = await mockSyncStorage.get('mergeKey');
            expect(stored.mergeKey).toEqual({ a: 1, b: { x: 10, y: 20 }, c: 3 });
        });

        test('storage.merge handles null for deletion', async () => {
            await mockSyncStorage.set({ mergeKey: { a: 1, b: 2 } });
            const success = await utils.storage.merge(mockSyncStorage, 'mergeKey', { b: null });
            expect(success).toBe(true);
            const stored = await mockSyncStorage.get('mergeKey');
            expect(stored.mergeKey).toEqual({ a: 1 });
        });

        // Test mergeSyncStorage (uses storage.get/set internally)
        test('mergeSyncStorage merges and sets', async () => {
            await mockSyncStorage.set({ test: { a: 1, b: 2 } });
            await utils.mergeSyncStorage('test', { b: 3, c: 4 });
            expect((await mockSyncStorage.get('test')).test).toEqual({ a: 1, b: 3, c: 4 });
        });

        test('mergeSyncStorage returns false on error', async () => {
            // Configure mock to throw error on 'set' for 'key'
            mockSyncStorage._simulateError('set', 'key');
            const result = await utils.mergeSyncStorage('key', { a: 1 });
            expect(result).toBe(false);
            // Error should have been logged by mergeSyncStorage
            expect(console.error).toHaveBeenCalledWith('Failed to set merged data for key "key"');
        });
    });

    // --- Instance ID/Name ---
    describe('Instance ID/Name', () => {
        test('getInstanceId generates new ID if none exists', async () => {
            const id = await utils.getInstanceId(); // Call without argument
            expect(id).toBe('mock-uuid-1234');
            expect(globalThis.crypto.randomUUID).toHaveBeenCalledTimes(1);
            expect(mockStorage.set).toHaveBeenCalledWith({ [utils.LOCAL_STORAGE_KEYS.INSTANCE_ID]: 'mock-uuid-1234' });
            expect(mockSyncStorage.set).toHaveBeenCalledWith({ [utils.LOCAL_STORAGE_KEYS.INSTANCE_ID]: 'mock-uuid-1234' });
        });

        test('getInstanceId retrieves from local storage first', async () => {
            mockStorage._getStore()[utils.LOCAL_STORAGE_KEYS.INSTANCE_ID] = 'local-id';
            const id = await utils.getInstanceId(); // Call without argument
            expect(id).toBe('local-id');
            expect(globalThis.crypto.randomUUID).not.toHaveBeenCalled();
            // Check it syncs the local ID to sync storage
            expect(mockSyncStorage.set).toHaveBeenCalledWith({ [utils.LOCAL_STORAGE_KEYS.INSTANCE_ID]: 'local-id' });
        });

        test('getInstanceId retrieves from sync storage if local is empty', async () => {
            mockSyncStorage._getStore()[utils.LOCAL_STORAGE_KEYS.INSTANCE_ID] = 'sync-id';
            const id = await utils.getInstanceId(); // Call without argument
            expect(id).toBe('sync-id');
            expect(globalThis.crypto.randomUUID).not.toHaveBeenCalled();
            // Check it saves the sync ID to local storage
            expect(mockStorage.set).toHaveBeenCalledWith({ [utils.LOCAL_STORAGE_KEYS.INSTANCE_ID]: 'sync-id' });
            // Check it re-saves to sync storage (idempotent)
            expect(mockSyncStorage.set).not.toHaveBeenCalledWith({ [utils.LOCAL_STORAGE_KEYS.INSTANCE_ID]: 'sync-id' });
        });

        test('getInstanceName generates default name if none exists', async () => {
            global.browser.runtime.getPlatformInfo.mockResolvedValue({ os: 'mac' });
            const name = await utils.getInstanceName();
            expect(name).toBe('Mac Device');
            expect(global.browser.runtime.getPlatformInfo).toHaveBeenCalledTimes(1);
            expect(mockStorage.set).toHaveBeenCalledWith({ [utils.LOCAL_STORAGE_KEYS.INSTANCE_NAME]: 'Mac Device' });
            expect(mockSyncStorage.set).toHaveBeenCalledWith({ [utils.LOCAL_STORAGE_KEYS.INSTANCE_NAME]: 'Mac Device' });
        });

        test('getInstanceName handles windows platform name', async () => {
            global.browser.runtime.getPlatformInfo.mockResolvedValue({ os: 'win' });
            const name = await utils.getInstanceName();
            expect(name).toBe('Windows Device');
        });

        test('getInstanceName retrieves from local storage first', async () => {
            mockStorage._getStore()[utils.LOCAL_STORAGE_KEYS.INSTANCE_NAME] = 'local-name';
            const name = await utils.getInstanceName();
            expect(name).toBe('local-name');
            expect(global.browser.runtime.getPlatformInfo).not.toHaveBeenCalled();
            expect(mockSyncStorage.set).toHaveBeenCalledWith({ [utils.LOCAL_STORAGE_KEYS.INSTANCE_NAME]: 'local-name' });
        });

        test('getInstanceName retrieves from sync storage if local is empty', async () => {
            mockSyncStorage._getStore()[utils.LOCAL_STORAGE_KEYS.INSTANCE_NAME] = 'sync-name';
            const name = await utils.getInstanceName();
            expect(name).toBe('sync-name');
            expect(global.browser.runtime.getPlatformInfo).not.toHaveBeenCalled();
            expect(mockStorage.set).toHaveBeenCalledWith({ [utils.LOCAL_STORAGE_KEYS.INSTANCE_NAME]: 'sync-name' });
            expect(mockSyncStorage.set).not.toHaveBeenCalledWith({ [utils.LOCAL_STORAGE_KEYS.INSTANCE_NAME]: 'sync-name' });
        });
    });

    // --- Platform Info & Bitmask Helpers ---
    describe('Platform Info & Bitmask Helpers', () => {
        test('isAndroid and isDesktop platform detection', async () => {
            const clearCache = () => { if (mockStorage._getStore) delete mockStorage._getStore().platformInfo; };

            clearCache();
            global.browser.runtime.getPlatformInfo.mockResolvedValue({ os: 'win' });
            expect(await utils.isDesktop()).toBe(true);
            expect(await utils.isAndroid()).toBe(false);

            clearCache();
            global.browser.runtime.getPlatformInfo.mockResolvedValue({ os: 'mac' });
            expect(await utils.isDesktop()).toBe(true);
            expect(await utils.isAndroid()).toBe(false);

            clearCache();
            global.browser.runtime.getPlatformInfo.mockResolvedValue({ os: 'linux' });
            expect(await utils.isDesktop()).toBe(true);
            expect(await utils.isAndroid()).toBe(false);

            clearCache();
            global.browser.runtime.getPlatformInfo.mockResolvedValue({ os: 'android' });
            expect(await utils.isDesktop()).toBe(false);
            expect(await utils.isAndroid()).toBe(true);

            clearCache();
            global.browser.runtime.getPlatformInfo.mockResolvedValue({ os: 'chromeos' });
            expect(await utils.isDesktop()).toBe(false);
            expect(await utils.isAndroid()).toBe(false);
        });

        test('getPlatformInfoCached uses cache', async () => {
            mockStorage._getStore()['platformInfo'] = { os: 'cached-os' };
            const info = await utils.getPlatformInfoCached();
            expect(info).toEqual({ os: 'cached-os' });
            expect(global.browser.runtime.getPlatformInfo).not.toHaveBeenCalled();
        });

        test('getPlatformInfoCached fetches and caches if not in storage', async () => {
            global.browser.runtime.getPlatformInfo.mockResolvedValue({ os: 'fetched-os' });
            const info = await utils.getPlatformInfoCached();
            expect(info).toEqual({ os: 'fetched-os' });
            expect(global.browser.runtime.getPlatformInfo).toHaveBeenCalledTimes(1);
            const cached = await mockStorage.get('platformInfo');
            expect(cached.platformInfo).toEqual({ os: 'fetched-os' });
        });

        test('getNextAvailableBitPosition finds first zero bit', () => {
            expect(utils.getNextAvailableBitPosition(0b0000)).toBe(0);
            expect(utils.getNextAvailableBitPosition(0b0001)).toBe(1);
            expect(utils.getNextAvailableBitPosition(0b0011)).toBe(2);
            expect(utils.getNextAvailableBitPosition(0b0101)).toBe(1);
            expect(utils.getNextAvailableBitPosition(0b1111)).toBe(4);
            expect(utils.getNextAvailableBitPosition(0x7FFF)).toBe(-1); // all 15 bits set (0 to 14)
        });
    });

    // --- Generic List/Object Updaters ---
    describe('Generic Storage Updaters', () => {
        test('addToList adds item and sorts', async () => {
            await utils.storage.set(mockStorage, 'myList', ['b', 'a']);
            await utils.addToList(mockStorage, 'myList', 'c');
            const list = await utils.storage.get(mockStorage, 'myList');
            expect(list).toEqual(['a', 'b', 'c']);
        });

        test('addToList does not add duplicate', async () => {
            await utils.storage.set(mockStorage, 'myList', ['a', 'b']);
            await utils.addToList(mockStorage, 'myList', 'a');
            const list = await utils.storage.get(mockStorage, 'myList');
            expect(list).toEqual(['a', 'b']);
        });

        test('removeFromList removes item', async () => {
            await utils.storage.set(mockStorage, 'myList', ['a', 'b', 'c']);
            await utils.removeFromList(mockStorage, 'myList', 'b');
            const list = await utils.storage.get(mockStorage, 'myList');
            expect(list).toEqual(['a', 'c']);
        });

        test('renameInList renames item', async () => {
            await utils.storage.set(mockStorage, 'myList', ['a', 'b', 'c']);
            await utils.renameInList(mockStorage, 'myList', 'b', 'b_new');
            const list = await utils.storage.get(mockStorage, 'myList');
            expect(list).toEqual(['a', 'b_new', 'c']); // Assumes sort happens elsewhere or isn't needed here
        });

        test('updateObjectKey renames property', async () => {
            await utils.storage.set(mockStorage, 'myObj', { oldKey: 1, other: 2 });
            await utils.updateObjectKey(mockStorage, 'myObj', 'oldKey', 'newKey');
            const obj = await utils.storage.get(mockStorage, 'myObj');
            expect(obj).toEqual({ newKey: 1, other: 2 });
        });

        test('removeObjectKey removes property', async () => {
            await utils.storage.set(mockStorage, 'myObj', { keyToRemove: 1, other: 2 });
            await utils.removeObjectKey(mockStorage, 'myObj', 'keyToRemove');
            const obj = await utils.storage.get(mockStorage, 'myObj');
            expect(obj).toEqual({ other: 2 });
        });
    });

    // --- Direct Storage Logic (Groups, Devices, Tabs) ---
    describe('Direct Storage Logic (Groups, Devices, Tabs)', () => {
        test('create, rename, and delete group', async () => {
            // Uses mockSyncStorage because these operate on sync
            await mockSyncStorage.set({ definedGroups: [] });
            let res = await utils.createGroupDirect('G1');
            expect(res.success).toBe(true);
            expect((await mockSyncStorage.get('definedGroups')).definedGroups).toContain('G1');

            res = await utils.renameGroupDirect('G1', 'G2');
            expect(res.success).toBe(true);
            expect((await mockSyncStorage.get('definedGroups')).definedGroups).toContain('G2');
            expect((await mockSyncStorage.get('definedGroups')).definedGroups).not.toContain('G1');

            res = await utils.deleteGroupDirect('G2');
            expect(res.success).toBe(true);
            expect((await mockSyncStorage.get('definedGroups')).definedGroups).not.toContain('G2');
        });

        test('subscribe/unsubscribe affects local and sync storage', async () => {
            // Setup
            await mockSyncStorage.set({ definedGroups: ['TestGroup'], groupState: { TestGroup: { assignedMask: 0 } } });
            await mockStorage.set({ myInstanceId: 'device-sub-test', mySubscriptions: [], myGroupBits: {} });

            // Subscribe
            const subRes = await utils.subscribeToGroupDirect('TestGroup');
            expect(subRes.success).toBe(true);
            expect(subRes.assignedBit).toBeDefined();
            const assignedBit = subRes.assignedBit;

            // Check local storage
            expect((await mockStorage.get('mySubscriptions')).mySubscriptions).toContain('TestGroup');
            expect((await mockStorage.get('myGroupBits')).myGroupBits.TestGroup).toBe(assignedBit);

            // Check sync storage
            expect((await mockSyncStorage.get('groupState')).groupState.TestGroup.assignedMask).toBe(assignedBit);
            expect((await mockSyncStorage.get('deviceRegistry')).deviceRegistry['device-sub-test'].groupBits.TestGroup).toBe(assignedBit);

            // Unsubscribe
            const unsubRes = await utils.unsubscribeFromGroupDirect('TestGroup');
            expect(unsubRes.success).toBe(true);

            // Check local storage
            expect((await mockStorage.get('mySubscriptions')).mySubscriptions).not.toContain('TestGroup');
            expect((await mockStorage.get('myGroupBits')).myGroupBits.TestGroup).toBeUndefined();

            // Check sync storage
            expect((await mockSyncStorage.get('groupState')).groupState.TestGroup.assignedMask).toBe(0); // Bit removed
            expect((await mockSyncStorage.get('deviceRegistry')).deviceRegistry['device-sub-test'].groupBits.TestGroup).toBeUndefined();
        });

        test('device rename and delete', async () => {
            // Uses both sync (registry) and local (instance name if self)
            await mockSyncStorage.set({ deviceRegistry: { id1: { name: 'Old', lastSeen: 1, groupBits: {} } } });
            await mockStorage.set({ myInstanceId: 'id1', myInstanceName: 'Old' }); // Simulate renaming self

            let res = await utils.renameDeviceDirect('id1', 'NewName');
            expect(res.success).toBe(true);
            expect((await mockSyncStorage.get('deviceRegistry')).deviceRegistry.id1.name).toBe('NewName');
            // Check local name updated because it was self
            expect((await mockStorage.get('myInstanceName')).myInstanceName).toBe('NewName');

            res = await utils.deleteDeviceDirect('id1');
            expect(res.success).toBe(true);
            expect((await mockSyncStorage.get('deviceRegistry')).deviceRegistry.id1).toBeUndefined();
            // Check local subscriptions/bits cleared because it was self
            expect((await mockStorage.get('mySubscriptions')).mySubscriptions).toEqual([]);
            expect((await mockStorage.get('myGroupBits')).myGroupBits).toEqual({});
        });

        test('sendTabToGroupDirect creates task in sync storage', async () => {
            // sendTabToGroupDirect uses local groupBits to find senderBit, writes task to sync
            await mockStorage.set({ myGroupBits: { TestGroup: 1 } }); // Sender has bit 1
            const res = await utils.sendTabToGroupDirect('TestGroup', { url: 'https://example.com', title: 'Example' });
            expect(res.success).toBe(true);

            const groupTasks = (await mockSyncStorage.get('groupTasks')).groupTasks;
            expect(groupTasks.TestGroup).toBeDefined();
            const task = Object.values(groupTasks.TestGroup)[0];
            expect(task.url).toBe('https://example.com');
            expect(task.processedMask).toBe(1); // Sender's bit should be set
        });

        test('processIncomingTabs opens tab and updates masks', async () => {
            // Setup: Task exists, sent by bit 1. Receiver is bit 2.
            const taskId = 'task-abc';
            await mockSyncStorage.set({
                groupTasks: {
                    G1: { [taskId]: { url: 'https://a.com', title: 'A', processedMask: 1, creationTimestamp: Date.now() } }
                }
            });
            await mockStorage.set({ processedTaskIds: {} }); // Receiver hasn't processed it locally

            const openTabFn = jest.fn(); // Mock the function that opens the tab
            const updateProcessedFn = jest.fn(async (updatedTasks) => {
                // Simulate updating local storage
                await mockStorage.set({ [utils.LOCAL_STORAGE_KEYS.PROCESSED_TASKS]: updatedTasks });
            });

            // Simulate processing by a DIFFERENT device (bit 2)
            const processingState = {
                definedGroups: ['G1'], // Not strictly needed by processIncomingTabs
                groupBits: { G1: 2 }, // This device has bit 2
                subscriptions: ['G1']
            };

            await utils.processIncomingTabs(processingState, openTabFn, updateProcessedFn);

            // Assertions
            expect(openTabFn).toHaveBeenCalledWith('https://a.com', 'A'); // Tab should be opened
            expect(updateProcessedFn).toHaveBeenCalledWith({ [taskId]: true }); // Marked locally processed
            expect((await mockStorage.get(utils.LOCAL_STORAGE_KEYS.PROCESSED_TASKS))[utils.LOCAL_STORAGE_KEYS.PROCESSED_TASKS]).toEqual({ [taskId]: true });

            // Check sync storage mask update (processIncomingTabs calls set directly)
            expect(mockSyncStorage.set).toHaveBeenCalledWith(expect.objectContaining({
                [utils.SYNC_STORAGE_KEYS.GROUP_TASKS]: expect.objectContaining({
                    G1: expect.objectContaining({
                        [taskId]: expect.objectContaining({ processedMask: 3 }) // 1 (sender) | 2 (receiver) = 3
                    })
                })
            }));
        });

        test('processIncomingTabs does not open already processed tab', async () => {
            const taskId = 'task-xyz';
            // Setup: Task exists, processed by bit 1 (sender) and bit 2 (this device)
            await mockSyncStorage.set({
                groupTasks: {
                    G1: { [taskId]: { url: 'https://b.com', title: 'B', processedMask: 3, creationTimestamp: Date.now() } }
                }
            });
            await mockStorage.set({ processedTaskIds: { [taskId]: true } }); // Also marked locally

            mockSyncStorage.set.mockClear();
            mockStorage.set.mockClear();

            const openTabFn = jest.fn();
            const updateProcessedFn = jest.fn();

            const processingState = { groupBits: { G1: 2 }, subscriptions: ['G1'] };
            await utils.processIncomingTabs(processingState, openTabFn, updateProcessedFn);

            expect(openTabFn).not.toHaveBeenCalled(); // Should NOT open tab
            expect(updateProcessedFn).not.toHaveBeenCalled(); // No local update needed
            // Sync storage set should not have been called for this task's mask
            expect(mockSyncStorage.set).not.toHaveBeenCalledWith(expect.objectContaining({
                [utils.SYNC_STORAGE_KEYS.GROUP_TASKS]: expect.objectContaining({
                    G1: expect.objectContaining({
                        [taskId]: expect.anything()
                    })
                })
            }));
        });
    });

    // --- Background Logic Helpers (Heartbeat, Cleanup) ---
    describe('Background Logic Helpers', () => {
        test('performHeartbeat merges correct data into deviceRegistry', async () => {
            const instanceId = 'test-id-1';
            const instanceName = 'Test Device';
            const groupBits = { groupA: 1, groupB: 4 };
            const initialRegistry = {
                'other-id': { name: 'Other', lastSeen: Date.now() - 10000, groupBits: {} }
            };
            await utils.storage.set(mockSyncStorage, utils.SYNC_STORAGE_KEYS.DEVICE_REGISTRY, initialRegistry);

            const beforeTimestamp = Date.now();
            await utils.performHeartbeat(instanceId, instanceName, groupBits, {}); // Pass empty cache
            const afterTimestamp = Date.now();

            const registry = await utils.storage.get(mockSyncStorage, utils.SYNC_STORAGE_KEYS.DEVICE_REGISTRY);

            expect(registry['other-id']).toEqual(initialRegistry['other-id']);
            expect(registry[instanceId]).toBeDefined();
            expect(registry[instanceId].name).toBe(instanceName);
            expect(registry[instanceId].groupBits).toEqual(groupBits);
            expect(registry[instanceId].lastSeen).toBeGreaterThanOrEqual(beforeTimestamp);
            expect(registry[instanceId].lastSeen).toBeLessThanOrEqual(afterTimestamp);

            // Check merge was called correctly (via storage.set in mergeSyncStorage)
            expect(mockSyncStorage.set).toHaveBeenCalledWith({
                [utils.SYNC_STORAGE_KEYS.DEVICE_REGISTRY]: expect.objectContaining({
                    [instanceId]: expect.objectContaining({
                        name: instanceName,
                        groupBits: groupBits,
                        lastSeen: expect.any(Number)
                    })
                })
            });
        });

        test('performHeartbeat handles missing instanceId', async () => {
            await utils.performHeartbeat(null, 'Test Name', {}, {});
            expect(mockSyncStorage.set).not.toHaveBeenCalled();
            expect(console.warn).toHaveBeenCalledWith("Heartbeat skipped: Instance ID not available yet.");
        });

        test('performStaleDeviceCheck removes stale devices and updates masks', async () => {
            const now = Date.now();
            const staleTime = now - (1000 * 60 * 60 * 24 * 31); // 31 days ago
            const recentTime = now - (1000 * 60 * 60); // 1 hour ago
            await mockSyncStorage.set({
                deviceRegistry: {
                    'stale-id': { name: 'Stale', lastSeen: staleTime, groupBits: { G1: 1, G2: 4 } },
                    'recent-id': { name: 'Recent', lastSeen: recentTime, groupBits: { G1: 2 } }
                },
                groupState: {
                    G1: { assignedMask: 1 | 2 }, // Bits 1 and 2 assigned
                    G2: { assignedMask: 4 }      // Bit 4 assigned
                }
            });

            await utils.performStaleDeviceCheck(undefined, undefined); // Pass empty caches

            const finalRegistry = await mockSyncStorage.get('deviceRegistry');
            const finalGroupState = await mockSyncStorage.get('groupState');

            expect(finalRegistry.deviceRegistry['stale-id']).toBeUndefined(); // Stale device removed
            expect(finalRegistry.deviceRegistry['recent-id']).toBeDefined(); // Recent device kept

            expect(finalGroupState.groupState.G1.assignedMask).toBe(2); // Bit 1 removed
            expect(finalGroupState.groupState.G2.assignedMask).toBe(0); // Bit 4 removed
        });

        test('performTimeBasedTaskCleanup removes expired tasks', async () => {
            const now = Date.now();
            const expiredTime = now - (1000 * 60 * 60 * 24 * 15); // 15 days ago
            const recentTime = now - (1000 * 60 * 60); // 1 hour ago
            await mockSyncStorage.set({
                groupTasks: {
                    G1: {
                        'expired-task': { url: 'a', title: 'A', processedMask: 0, creationTimestamp: expiredTime },
                        'recent-task': { url: 'b', title: 'B', processedMask: 0, creationTimestamp: recentTime }
                    }
                }
            });
            const initialProcessedTasks = { 'expired-task': true };
            await mockStorage.set({ [utils.LOCAL_STORAGE_KEYS.PROCESSED_TASKS]: initialProcessedTasks });

            // Fetch the initial local state to pass to the function, like background.js does
            const fetchedInitialProcessed = await mockStorage.get(utils.LOCAL_STORAGE_KEYS.PROCESSED_TASKS);
            // Pass the actual object, defaulting to {} if not found (though it should be found here)
            await utils.performTimeBasedTaskCleanup(fetchedInitialProcessed[utils.LOCAL_STORAGE_KEYS.PROCESSED_TASKS] || {});

            const finalGroupTasks = await mockSyncStorage.get('groupTasks');
            // Use the constant for the key when fetching final state
            const finalProcessed = await mockStorage.get(utils.LOCAL_STORAGE_KEYS.PROCESSED_TASKS);

            expect(finalGroupTasks.groupTasks.G1['expired-task']).toBeUndefined(); // Expired task removed
            expect(finalGroupTasks.groupTasks.G1['recent-task']).toBeDefined(); // Recent task kept
            // Access the final state correctly using the key
            expect(finalProcessed[utils.LOCAL_STORAGE_KEYS.PROCESSED_TASKS]['expired-task']).toBeUndefined(); // Local processed ID removed
        });
    });

    // --- Debounce ---
    describe('debounce', () => {
        jest.useFakeTimers();

        test('executes function after delay', () => {
            const func = jest.fn();
            const debouncedFunc = utils.debounce(func, 100);
            debouncedFunc();
            expect(func).not.toHaveBeenCalled();
            jest.advanceTimersByTime(100);
            expect(func).toHaveBeenCalledTimes(1);
        });

        test('cancels previous timer if called again within delay', () => {
            const func = jest.fn();
            const debouncedFunc = utils.debounce(func, 100);
            debouncedFunc();
            jest.advanceTimersByTime(50);
            debouncedFunc(); // Reset timer
            jest.advanceTimersByTime(50);
            expect(func).not.toHaveBeenCalled();
            jest.advanceTimersByTime(50);
            expect(func).toHaveBeenCalledTimes(1);
        });

        test('passes arguments to the original function', () => {
            const func = jest.fn();
            const debouncedFunc = utils.debounce(func, 100);
            const arg1 = { data: 1 };
            debouncedFunc(arg1, 'test');
            jest.advanceTimersByTime(100);
            expect(func).toHaveBeenCalledWith(arg1, 'test');
        });

        // Restore real timers after debounce tests
        afterAll(() => {
            jest.useRealTimers();
        });
    });

    // --- HTML Template Utility & UI Rendering Helpers ---
    describe('UI Rendering Helpers (DOM)', () => {
        let container;

        // Setup DOM before each test in this block
        beforeEach(() => {
            document.body.innerHTML = ''; // Clear previous DOM
            container = document.createElement('div');
            document.body.appendChild(container);
        });

        test('html template utility creates simple element', () => {
            const frag = utils.html`<div>Hello</div>`;
            const div = frag.querySelector('div');
            expect(div).not.toBeNull();
            expect(div.textContent).toBe('Hello');
        });

        test('html template utility interpolates values', () => {
            const name = 'World';
            const className = 'greeting';
            const frag = utils.html`<p class="${className}">Hello ${name}!</p>`;
            const p = frag.querySelector('p');
            expect(p).not.toBeNull();
            expect(p.className).toBe('greeting');
            expect(p.textContent).toBe('Hello World!');
        });

        test('html template utility handles multiple elements', () => {
            const frag = utils.html`<span>One</span><span>Two</span>`;
            const spans = frag.querySelectorAll('span');
            expect(spans.length).toBe(2);
            expect(spans[0].textContent).toBe('One');
        });

        test('html template utility handles null/undefined values gracefully', () => {
            const frag = utils.html`<div>${undefined}${null}</div>`;
            const div = frag.querySelector('div');
            expect(div.textContent).toBe('');
        });

        test('renderDeviceList shows no devices', () => {
            utils.renderDeviceList(container, {});
            expect(container.textContent).toBe(STRINGS.noDevices);
        });

        test('renderDeviceList renders devices and highlights', () => {
            const devices = {
                id1: { name: 'Alpha', lastSeen: 1234567890000 },
                id2: { name: 'Beta', lastSeen: 1234567891000 }
            };
            utils.renderDeviceList(container, devices, 'id2');
            expect(container.querySelectorAll('li').length).toBe(2);
            expect(container.querySelector('.this-device').textContent).toContain('Beta');
            expect(container.querySelector('li:not(.this-device)').textContent).toContain('Alpha');
        });

        test('renderGroupList shows no groups', () => {
            utils.renderGroupList(container, [], [], jest.fn(), jest.fn(), jest.fn(), jest.fn());
            expect(container.textContent).toBe(STRINGS.noGroups);
        });

        test('renderGroupList renders groups and buttons correctly', () => {
            const onSubscribe = jest.fn();
            const onUnsubscribe = jest.fn();
            const onDelete = jest.fn();
            const onRename = jest.fn();
            utils.renderGroupList(container, ['G1', 'G2'], ['G2'], onSubscribe, onUnsubscribe, onDelete, onRename);

            const items = container.querySelectorAll('li');
            expect(items.length).toBe(2);

            // Check G1 (not subscribed)
            const g1Item = items[0];
            expect(g1Item.querySelector('.group-name-label').textContent).toBe('G1');
            const subBtn = g1Item.querySelector('.subscribe-btn');
            expect(subBtn).not.toBeNull();
            expect(g1Item.querySelector('.unsubscribe-btn')).toBeNull();

            // Check G2 (subscribed)
            const g2Item = items[1];
            expect(g2Item.querySelector('.group-name-label').textContent).toBe('G2');
            expect(g2Item.querySelector('.subscribe-btn')).toBeNull();
            const unsubBtn = g2Item.querySelector('.unsubscribe-btn');
            expect(unsubBtn).not.toBeNull();

            // Simulate clicks
            subBtn.click();
            expect(onSubscribe).toHaveBeenCalledTimes(1);

            unsubBtn.click();
            expect(onUnsubscribe).toHaveBeenCalledTimes(1);

            const g1DeleteBtn = g1Item.querySelector('.delete-btn');
            g1DeleteBtn.click();
            expect(onDelete).toHaveBeenCalledTimes(1);

            const g2NameSpan = g2Item.querySelector('.group-name-label');
            g2NameSpan.click();
            expect(onRename).toHaveBeenCalledTimes(1);
        });

        test('renderDeviceName fallback', () => {
            utils.renderDeviceName(container, '');
            expect(container.textContent).toBe(STRINGS.deviceNameNotSet);
            utils.renderDeviceName(container, 'MyDevice');
            expect(container.textContent).toBe('MyDevice');
        });

        test('renderSubscriptions fallback and normal', () => {
            utils.renderSubscriptions(container, []);
            expect(container.textContent).toBe(STRINGS.notSubscribed);
            utils.renderSubscriptions(container, ['A', 'B']);
            expect(container.textContent).toBe(STRINGS.subscribedGroups + 'A, B');
        });

        test('showAndroidBanner creates and updates banner', () => {
            // Need a child for insertBefore logic
            container.appendChild(document.createElement('span'));
            utils.showAndroidBanner(container, 'Banner1');
            const banner1 = container.querySelector('.android-banner');
            expect(banner1).not.toBeNull();
            expect(banner1.textContent).toBe('Banner1');

            utils.showAndroidBanner(container, 'Banner2');
            const banner2 = container.querySelector('.android-banner');
            expect(banner2).not.toBeNull();
            expect(banner2.textContent).toBe('Banner2');
            expect(container.querySelectorAll('.android-banner').length).toBe(1); // Ensure it updated, not added
        });

        test('setLastSyncTime creates and updates sync time', () => {
            // Need a child for insertBefore logic
            container.appendChild(document.createElement('span'));
            utils.setLastSyncTime(container, 1234567890000);
            const time1 = container.querySelector('.last-sync-time');
            expect(time1).not.toBeNull();
            expect(time1.textContent).toContain('Last sync:');

            utils.setLastSyncTime(container, 1234567891000);
            const time2 = container.querySelector('.last-sync-time');
            expect(time2).not.toBeNull();
            expect(time2.textContent).toContain('Last sync:');
            expect(container.querySelectorAll('.last-sync-time').length).toBe(1); // Ensure it updated
        });

        test('showDebugInfo displays debug info', () => {
            const state = {
                instanceId: 'id', instanceName: 'name', subscriptions: ['g1'],
                groupBits: { g1: 1 }, definedGroups: ['g1'],
                deviceRegistry: { id: { name: 'name', lastSeen: 1, groupBits: { g1: 1 } } },
                groupState: { g1: { assignedMask: 1 } }
            };
            utils.showDebugInfo(container, state);
            const debugDiv = container.querySelector('.debug-info');
            expect(debugDiv).not.toBeNull();
            expect(debugDiv.innerHTML).toContain('Instance ID: id');
            expect(debugDiv.innerHTML).toContain('Defined Groups: ["g1"]');
            expect(debugDiv.innerHTML).toContain('Device Registry: {"id":{"name":"name","lastSeen":1,"groupBits":{"g1":1}}}');
        });
    });
});
