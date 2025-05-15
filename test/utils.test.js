const mockedStringsObject = {
    deviceNameNotSet: '(Not Set)',
    noDevices: 'No devices registered.',
    noGroups: 'No groups defined. Use Settings to create one.',
    notSubscribed: 'Not subscribed to any groups.',
    subscribedGroups: 'Subscribed groups: ',
    loadingGroups: 'Loading groups...',
    loadingRegistry: 'Loading registry...',
    error: 'Error',
    sendTabFailed: 'Send failed.',
    sendTabCannot: 'Cannot send this type of tab.',
    groupCreateFailed: 'Failed to create group.',
    groupRenameFailed: 'Rename failed.',
    groupDeleteFailed: 'Failed to delete group.',
    deviceRenameFailed: 'Rename failed.',
    deviceDeleteFailed: 'Delete failed.',
    testNotificationSent: 'Test notification sent!',
    androidBanner: 'Note: On Firefox for Android, background processing is not available. Open this page and tap "Sync Now" to process new tabs or changes.',
    SYNC_INFO_MESSAGE_POPUP: "TabTogether uses Firefox Sync for cross-device features. Ensure you're signed in & add-on sync is enabled.",
    SYNC_INFO_MESSAGE_OPTIONS: "TabTogether relies on Firefox Sync to share data across your devices. Please ensure you are signed into your Firefox Account and that add-on data synchronization is enabled in your Firefox settings for the best experience.",
    groupExists: (groupName) => `${groupName} already exists.`,
};

jest.mock('../common/constants.js', () => {
    const actualConstants = jest.requireActual('../common/constants.js');
    const actualStrings = actualConstants.STRINGS || {};
    return {
        __esModule: true,
        ...actualConstants,
        STRINGS: { // Ensure STRINGS is always an object
            ...actualStrings,
            ...mockedStringsObject,
        },
    };
});
  
const mockGenerateShortIdUtil = jest.fn();
jest.mock('../core/id-utils.js', () => ({
    __esModule: true,
    generateShortId: mockGenerateShortIdUtil,
}));

import { jest } from '@jest/globals';
import { STRINGS, SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS } from '../common/constants.js';
import { deepMerge, isObject as isObjectUtil, ensureObject, ensureArray, ensureString } from '../common/utils.js';
import { storage, addToList, removeFromList, renameInList, updateObjectKey, removeObjectKey} from '../core/storage.js';
import { getPlatformInfoCached, isAndroid, _clearPlatformInfoCache } from '../core/platform.js';
import { createGroupDirect, renameGroupDirect, deleteGroupDirect, subscribeToGroupDirect, unsubscribeFromGroupDirect, renameDeviceDirect, deleteDeviceDirect } from '../core/actions.js';
import { createAndStoreGroupTask } from '../core/tasks.js';
import { performHeartbeat } from '../background/heartbeat.js';
import { performStaleDeviceCheck, performTimeBasedTaskCleanup } from '../background/cleanup.js';
import { renderDeviceRegistryUI, renderGroupListUI as renderGroupList, setLastSyncTimeUI as setLastSyncTime, showDebugInfoUI as showDebugInfo, displaySyncRequirementBanner, createInlineEditControlsUI, cancelInlineEditUI, createDeviceListItemUI } from '../ui/options/options-ui.js';
import * as instanceModule from '../core/instance.js'; 
import { showAndroidBanner } from '../ui/shared/shared-ui.js';
import { debounce } from '../common/utils.js';

describe('utils', () => {
    let mockStorage;
    let mockSyncStorage;
    let mockGetInstanceNameFromTestFile; // Declare the mock function
    let consoleErrorSpy, consoleWarnSpy, consoleLogSpy;

    beforeEach(async () => {
        mockGetInstanceNameFromTestFile = jest.fn(); // Initialize for each test
        mockGenerateShortIdUtil.mockReset(); // Reset the mock for generateShortId
        instanceModule._clearInstanceIdCache(); 
        instanceModule._clearInstanceNameCache(); 
        if (typeof _clearPlatformInfoCache === 'function') { // Ensure it's imported
            _clearPlatformInfoCache();
        }

        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => { });

        mockStorage = global.browser.storage.local;
        mockSyncStorage = global.browser.storage.sync;
    });

    describe('Core Utilities', () => {
        test('deepMerge merges deeply and deletes keys', () => {
            const a = { foo: { bar: 1 }, baz: 2 };
            const b = { foo: { bar: 2 }, baz: null };
            expect(deepMerge(a, b)).toEqual({ foo: { bar: 2 } });
        });

        test('isObject works', () => {
            expect(isObjectUtil({})).toBe(true);
            expect(isObjectUtil([])).toBe(false);
            expect(isObjectUtil(null)).toBe(false);
        });
    });
    describe('Type Safety Helpers', () => {
        test('ensureObject returns object or fallback', () => {
            expect(ensureObject({ a: 1 })).toEqual({ a: 1 });
            expect(ensureObject(null)).toEqual({});
            expect(ensureObject(undefined)).toEqual({});
            expect(ensureObject([])).toEqual({});
            expect(ensureObject('string')).toEqual({});
            expect(ensureObject(123)).toEqual({});
            expect(ensureObject(true, { x: 0 })).toEqual({ x: 0 });
        });

        test('ensureArray returns array or fallback', () => {
            expect(ensureArray([1, 2])).toEqual([1, 2]);
            expect(ensureArray(null)).toEqual([]);
            expect(ensureArray(undefined)).toEqual([]);
            expect(ensureArray({})).toEqual([]);
            expect(ensureArray('string')).toEqual([]);
            expect(ensureArray(123)).toEqual([]);
            expect(ensureArray(true, ['a'])).toEqual(['a']);
        });

        test('ensureString returns string or fallback', () => {
            expect(ensureString('hello')).toBe('hello');
            expect(ensureString(null)).toBe('');
            expect(ensureString(undefined)).toBe('');
            expect(ensureString({})).toBe('');
            expect(ensureString([])).toBe('');
            expect(ensureString(123)).toBe('');
            expect(ensureString(true, 'def')).toBe('def');
        });
    });
    describe('Storage Access Helpers', () => {
        test('storage.get retrieves value', async () => {
            await mockStorage.set({ testKey: 'testValue' });
            const value = await storage.get(mockStorage, 'testKey');
            expect(value).toBe('testValue');
            expect(mockStorage.get).toHaveBeenCalledWith('testKey');
        });

        test('storage.get returns default value if not found', async () => {
            const value = await storage.get(mockStorage, 'nonExistentKey', 'defaultValue');
            expect(value).toBe('defaultValue');
        });

        test('storage.get handles errors and returns default', async () => {
            mockStorage._simulateError('get', 'anyKey');
            const value = await storage.get(mockStorage, 'anyKey', 'fallback');
            expect(value).toBe('fallback');
            expect(console.error).toHaveBeenCalledWith('Error getting anyKey from local storage:', expect.any(Error));
        });

        test('storage.set sets value', async () => {
            const success = await storage.set(mockStorage, 'newKey', { data: 1 });
            expect(success).toBe(true);
            expect(mockStorage.set).toHaveBeenCalledWith({ newKey: { data: 1 } });
            const stored = await mockStorage.get('newKey');
            expect(stored.newKey).toEqual({ data: 1 });
        });
        test('storage.set handles errors and returns false', async () => {
            mockStorage._simulateError('set', 'failKey');
            const success = await storage.set(mockStorage, 'failKey', 'value');
            expect(success).toBe(false);
            expect(console.error).toHaveBeenCalledWith('Error setting failKey in local storage:', expect.any(Error));
        });

        test('storage.get retrieves value', async () => {
            await mockSyncStorage.set({ syncKey: 'syncValue' });
            const value = await storage.get(mockSyncStorage, 'syncKey');
            expect(value).toBe('syncValue');
        });

        test('storage.set sets value', async () => {
            await storage.set(mockSyncStorage, 'anotherSyncKey', [1, 2]);
            const stored = await mockSyncStorage.get('anotherSyncKey');
            expect(stored.anotherSyncKey).toEqual([1, 2]);
        });

        test('storage.mergeItem performs deep merge', async () => {
            await mockSyncStorage.set({ mergeKey: { a: 1, b: { x: 10 } } });
            const result = await storage.mergeItem(mockSyncStorage, 'mergeKey', { b: { y: 20 }, c: 3 });
            expect(result.success).toBe(true);
            const stored = await mockSyncStorage.get('mergeKey');
            expect(stored.mergeKey).toEqual({ a: 1, b: { x: 10, y: 20 }, c: 3 });
        });

        test('storage.mergeItem handles null for deletion', async () => {
            await mockSyncStorage.set({ mergeKey: { a: 1, b: 2 } });
            const result = await storage.mergeItem(mockSyncStorage, 'mergeKey', { b: null });
            expect(result.success).toBe(true);
            const stored = await mockSyncStorage.get('mergeKey');
            expect(stored.mergeKey).toEqual({ a: 1 });
        });
        test('mergeSyncStorage merges and sets', async () => {
            await mockSyncStorage.set({ test: { a: 1, b: 2 } });
            await storage.mergeSyncStorage({ test: { b: 3, c: 4 } });
            expect((await storage.get(mockSyncStorage, 'test'))).toEqual({ a: 1, b: 3, c: 4 });
        });

        test('mergeSyncStorage returns false on error', async () => {
            mockSyncStorage.set = jest.fn().mockRejectedValue(new Error("Simulated set error"));
            await storage.mergeSyncStorage({ key: { a: 1 } });
            expect(console.error).toHaveBeenCalledWith("Error merging sync storage:", expect.any(Error), { newData: { key: { a: 1 } } });
        });
        test('storage.mergeItem handles concurrent-like updates correctly (conceptual)', async () => {
            const key = 'concurrentTestKey';
            await mockSyncStorage.set({ [key]: { count: 0, data: {} } });
            const op1Updates = { count: 1, data: { op1: true } };
            const op2Updates = { data: { op2: true } };

            await storage.mergeItem(mockSyncStorage, key, op1Updates);
            await storage.mergeItem(mockSyncStorage, key, op2Updates);

            const finalState = await storage.get(mockSyncStorage, key);
            expect(finalState).toEqual({ count: 1, data: { op1: true, op2: true } });
        });

        test('storage.mergeItem returns error on failure', async () => {
            const storageGetSpy = jest.spyOn(storage, 'get').mockRejectedValueOnce(new Error("Simulated storage.get error for mergeItem"));
            const result = await storage.mergeItem(mockSyncStorage, 'errorKey', { b: null });
            expect(result.success).toBe(false);
            expect(result.mergedData).toBeNull();
            expect(console.error).toHaveBeenCalledWith(
                "Error merging item errorKey in sync storage:",
                expect.any(Error),
                "Updates:",
                { b: null }
            );
            storageGetSpy.mockRestore();
        });
    });
    describe('Instance ID/Name', () => {
        // test('getInstanceId generates new ID if none exists', async () => {
        //     const expectedNewId = 'abcdefgh';
        //     mockGenerateShortIdUtil.mockReturnValue(expectedNewId);
        //     await global.browser.storage.sync.set({ [SYNC_STORAGE_KEYS.DEVICE_REGISTRY]: {} });
        //     const id = await instanceModule.getInstanceId();
        //     expect(id).toBe(expectedNewId);
        //     expect(global.browser.storage.local.set).toHaveBeenCalledWith({ [LOCAL_STORAGE_KEYS.INSTANCE_ID]: id });
        // });

        test('getInstanceId retrieves from local storage first', async () => {
            mockStorage._getStore()[LOCAL_STORAGE_KEYS.INSTANCE_ID] = 'local-id';
            const id = await instanceModule.getInstanceId(); 
            expect(id).toBe('local-id');
            expect(mockGenerateShortIdUtil).not.toHaveBeenCalled();
            expect(global.browser.storage.local.set).not.toHaveBeenCalled(); // Should not be called if ID is found and valid
        });

        // test('getInstanceId generates unique short ID on collision', async () => {
        //     const existingId = 'EXISTING';
        //     const expectedUniqueId = 'ijklmnop';
        //     mockGenerateShortIdUtil
        //         .mockReturnValueOnce(existingId)
        //         .mockReturnValueOnce(existingId) // Second attempt, still collision
        //         .mockReturnValueOnce(expectedUniqueId); // Third attempt, unique
        //     await storage.set(mockSyncStorage, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, { [existingId]: { name: "Existing Device" } });
        //     const id = await instanceModule.getInstanceId(); 
        //     expect(id).toHaveLength(8);
        //     expect(id).not.toBe(existingId);
        //     expect(id).toBe(expectedUniqueId);
        //     expect(mockStorage.set).toHaveBeenCalledWith({ [LOCAL_STORAGE_KEYS.INSTANCE_ID]: id });
        // });

        test('getInstanceName generates default name if none exists', async () => {
            global.browser.runtime.getPlatformInfo.mockResolvedValue({ os: 'mac' });
            const mockId = 'test-inst-id';
            await storage.set(mockStorage, LOCAL_STORAGE_KEYS.INSTANCE_ID, mockId);
            await storage.set(mockSyncStorage, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {});
            mockGetInstanceNameFromTestFile.mockResolvedValue('Mac Device');
            const name = await instanceModule.getInstanceName(); 
            expect(name).toBe('Mac Device');
           
        });

        test('getInstanceName handles windows platform name', async () => {
            global.browser.runtime.getPlatformInfo.mockResolvedValue({ os: 'win' });
            const mockId = 'test-inst-id-win';
            await storage.set(mockStorage, LOCAL_STORAGE_KEYS.INSTANCE_ID, mockId);
            await storage.set(mockSyncStorage, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {});
            mockGetInstanceNameFromTestFile.mockResolvedValue('Windows Device');
            const name = await instanceModule.getInstanceName();
            expect(name).toBe('Windows Device');
            expect(global.browser.runtime.getPlatformInfo).toHaveBeenCalled();
        });

        test('getInstanceName retrieves from local override first', async () => {
            await storage.set(mockStorage, LOCAL_STORAGE_KEYS.INSTANCE_NAME_OVERRIDE, 'Local Override Name');
            mockGetInstanceNameFromTestFile.mockResolvedValue('Local Override Name');
            const name = await instanceModule.getInstanceName();
            expect(name).toBe('Local Override Name');
            expect(global.browser.runtime.getPlatformInfo).not.toHaveBeenCalled();
        });

        test('getInstanceName uses registry name if local override is empty string', async () => {
            await storage.set(mockStorage, LOCAL_STORAGE_KEYS.INSTANCE_NAME_OVERRIDE, '   ');
            const mockId = 'id-for-registry-empty-override';
            await storage.set(mockStorage, LOCAL_STORAGE_KEYS.INSTANCE_ID, mockId);
            await storage.set(mockSyncStorage, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, { [mockId]: { name: 'Registry Name From Empty Override' } });
            mockGetInstanceNameFromTestFile.mockResolvedValue('Registry Name From Empty Override');
            const name = await instanceModule.getInstanceName();
            expect(name).toBe('Registry Name From Empty Override');
        });

        test('getInstanceName falls back to generated default if platformInfo fails', async () => {
            global.browser.runtime.getPlatformInfo.mockRejectedValue(new Error("Platform info unavailable"));
            const mockId = 'id-for-platform-fail';
            await storage.set(mockStorage, LOCAL_STORAGE_KEYS.INSTANCE_ID, mockId);
            await storage.set(mockSyncStorage, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {});
            mockGetInstanceNameFromTestFile.mockResolvedValue('My Device');
            const name = await instanceModule.getInstanceName();
            expect(name).toBe('My Device');
        });

        test('getInstanceName retrieves from sync registry if local override is empty', async () => {
            const mockId = 'id-for-registry';
            await storage.set(mockStorage, LOCAL_STORAGE_KEYS.INSTANCE_ID, mockId);
            await storage.set(mockSyncStorage, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, { [mockId]: { name: 'Registry Name' } });
            mockGetInstanceNameFromTestFile.mockResolvedValue('Registry Name');
            const name = await instanceModule.getInstanceName();
            expect(name).toBe('Registry Name');
        });

        describe('setInstanceName', () => {
            test('setInstanceName updates local override, sync registry, and cache', async () => {
                const mockId = 'device-to-set-name';
                await storage.set(mockStorage, LOCAL_STORAGE_KEYS.INSTANCE_ID, mockId);
                mockGetInstanceNameFromTestFile.mockResolvedValue('New Device Name'); // For the final check
                instanceModule._clearInstanceNameCache(); 

                const success = await instanceModule.setInstanceName('New Device Name');
                expect(success.success).toBe(true);
                expect(success.newName).toBe('New Device Name');

                expect(await storage.get(mockStorage, LOCAL_STORAGE_KEYS.INSTANCE_NAME_OVERRIDE)).toBe('New Device Name');
                const registry = await storage.get(mockSyncStorage, SYNC_STORAGE_KEYS.DEVICE_REGISTRY);
                expect(registry[mockId].name).toBe('New Device Name');
                expect(registry[mockId].lastSeen).toBeDefined();
                expect(await instanceModule.getInstanceName()).toBe('New Device Name'); 
            });
        });
    });
    describe('Platform Info & Bitmask Helpers', () => {
        test('isAndroid and isDesktop platform detection', async () => {
            _clearPlatformInfoCache();
            global.browser.runtime.getPlatformInfo.mockResolvedValue({ os: 'win' });
            expect(await isAndroid()).toBe(false);

            _clearPlatformInfoCache();
            global.browser.runtime.getPlatformInfo.mockResolvedValue({ os: 'mac' });
            expect(await isAndroid()).toBe(false);

            _clearPlatformInfoCache();
            global.browser.runtime.getPlatformInfo.mockResolvedValue({ os: 'linux' });
            expect(await isAndroid()).toBe(false);

            _clearPlatformInfoCache();
            global.browser.runtime.getPlatformInfo.mockResolvedValue({ os: 'android' });
            expect(await isAndroid()).toBe(true);

            _clearPlatformInfoCache();
            global.browser.runtime.getPlatformInfo.mockResolvedValue({ os: 'chromeos' });
            expect(await isAndroid()).toBe(false);
        });

        test('getPlatformInfoCached uses cache', async () => {
            _clearPlatformInfoCache();
            global.browser.runtime.getPlatformInfo.mockResolvedValueOnce({ os: 'cached-os' });
            await getPlatformInfoCached(); 
            const info = await getPlatformInfoCached();
            expect(info).toEqual({ os: 'cached-os' });
            expect(global.browser.runtime.getPlatformInfo).toHaveBeenCalledTimes(1); 
        });

        test('getPlatformInfoCached fetches and caches if not in storage', async () => {
            _clearPlatformInfoCache();
            global.browser.runtime.getPlatformInfo.mockResolvedValue({ os: 'fetched-os' });
            const info = await getPlatformInfoCached();
            expect(info).toEqual({ os: 'fetched-os' });
            expect(global.browser.runtime.getPlatformInfo).toHaveBeenCalledTimes(1);
        });
    });
    describe('Generic Storage Updaters', () => {
        test('addToList adds item and sorts', async () => {
            await storage.set(mockStorage, 'myList', ['b', 'a']);
            await addToList(mockStorage, 'myList', 'c');
            const list = await storage.get(mockStorage, 'myList');
            expect(list).toEqual(['a', 'b', 'c']);
        });

        test('addToList does not add duplicate', async () => {
            await storage.set(mockStorage, 'myList', ['a', 'b']);
            await addToList(mockStorage, 'myList', 'a');
            const list = await storage.get(mockStorage, 'myList');
            expect(list).toEqual(['a', 'b']);
        });

        test('removeFromList removes item', async () => {
            await storage.set(mockStorage, 'myList', ['a', 'b', 'c']);
            await removeFromList(mockStorage, 'myList', 'b');
            const list = await storage.get(mockStorage, 'myList');
            expect(list).toEqual(['a', 'c']);
        });

        test('renameInList renames item', async () => {
            await storage.set(mockStorage, 'myList', ['a', 'b', 'c']);
            await renameInList(mockStorage, 'myList', 'b', 'b_new');
            const list = await storage.get(mockStorage, 'myList');
            expect(list).toEqual(['a', 'b_new', 'c']);
        });

        test('updateObjectKey renames property', async () => {
            await storage.set(mockStorage, 'myObj', { oldKey: 1, other: 2 });
            await updateObjectKey(mockStorage, 'myObj', 'oldKey', 'newKey');
            const obj = await storage.get(mockStorage, 'myObj');
            expect(obj).toEqual({ newKey: 1, other: 2 });
        });

        test('removeObjectKey removes property', async () => {
            await storage.set(mockStorage, 'myObj', { keyToRemove: 1, other: 2 });
            await removeObjectKey(mockStorage, 'myObj', 'keyToRemove');
            const obj = await storage.get(mockStorage, 'myObj');
            expect(obj).toEqual({ other: 2 });
        });
    });
    describe('Direct Storage Logic (Groups, Devices, Tabs)', () => {
        test('create, rename, and delete group', async () => {
            await storage.set(mockSyncStorage, SYNC_STORAGE_KEYS.DEFINED_GROUPS, []);
            let res = await createGroupDirect('G1');
            expect(res.success).toBe(true);
            expect(await storage.get(mockSyncStorage, SYNC_STORAGE_KEYS.DEFINED_GROUPS)).toContain('G1');

            res = await renameGroupDirect('G1', 'G2');
            expect(res.success).toBe(true);
            expect(await storage.get(mockSyncStorage, SYNC_STORAGE_KEYS.DEFINED_GROUPS)).toContain('G2');
            expect(await storage.get(mockSyncStorage, SYNC_STORAGE_KEYS.DEFINED_GROUPS)).not.toContain('G1');

            res = await deleteGroupDirect('G2');
            expect(res.success).toBe(true);
            expect(await storage.get(mockSyncStorage, SYNC_STORAGE_KEYS.DEFINED_GROUPS)).not.toContain('G2');
        });

        test('createGroupDirect trims whitespace and handles existing group', async () => {
            await storage.set(mockSyncStorage, SYNC_STORAGE_KEYS.DEFINED_GROUPS, ['Existing Group']);
            let res = await createGroupDirect('  New Group  ');
            expect(res.success).toBe(true);
            expect(res.newGroup).toBe('New Group');
            expect(await storage.get(mockSyncStorage, SYNC_STORAGE_KEYS.DEFINED_GROUPS)).toContain('New Group');

            res = await createGroupDirect('Existing Group');
            expect(res.success).toBe(false);
            expect(res.message).toBe(STRINGS.groupExists('Existing Group'));
        });

        test('createGroupDirect handles storage set failure', async () => {
            mockSyncStorage._simulateError('set', SYNC_STORAGE_KEYS.DEFINED_GROUPS);
            const res = await createGroupDirect('ErrorGroup');
                expect(res.success).toBe(false);
            expect(console.error).toHaveBeenCalledWith(
                `Error setting ${SYNC_STORAGE_KEYS.DEFINED_GROUPS} in sync storage:`, expect.any(Error)
            );
        });

        test('subscribe/unsubscribe affects sync storage', async () => {
            await storage.set(mockSyncStorage, SYNC_STORAGE_KEYS.DEFINED_GROUPS, ['TestGroup']);
            const testInstanceId = 'device-sub-test';
            await storage.set(mockStorage, LOCAL_STORAGE_KEYS.INSTANCE_ID, testInstanceId);
            await storage.set(mockSyncStorage, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, {});
            await storage.set(mockStorage, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []);
            const subRes = await subscribeToGroupDirect('TestGroup');
            expect(subRes.success).toBe(true);
            const subscriptionsAfterSub = await storage.get(mockSyncStorage, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, {});
            expect(subscriptionsAfterSub['device-sub-test'] || []).toContain('TestGroup');
            const unsubRes = await unsubscribeFromGroupDirect('TestGroup');
            expect(unsubRes.success).toBe(true);

            const subscriptionsAfterUnsub = await storage.get(mockSyncStorage, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, {});
            expect(subscriptionsAfterUnsub[testInstanceId] || []).not.toContain('TestGroup');
        });

        test('subscribeToGroupDirect handles already subscribed', async () => {
            const instanceId = 'sub-test-id';
            await storage.set(mockStorage, LOCAL_STORAGE_KEYS.INSTANCE_ID, instanceId);
            await storage.set(mockSyncStorage, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, { [instanceId]: ['ExistingGroup'] });
            const res = await subscribeToGroupDirect('ExistingGroup');
            expect(res.success).toBe(true);
            const subscriptions = await storage.get(mockSyncStorage, SYNC_STORAGE_KEYS.SUBSCRIPTIONS);
            expect(subscriptions[instanceId]).toContain('ExistingGroup');
            expect(subscriptions[instanceId].filter(g => g === 'ExistingGroup').length).toBe(1);
        });

        test('device rename and delete', async () => {
            const instanceId = 'id1';
            await storage.set(mockSyncStorage, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, { [instanceId]: { name: 'Old', lastSeen: 1 } });
            await storage.set(mockStorage, LOCAL_STORAGE_KEYS.INSTANCE_ID, instanceId);
            await storage.set(mockStorage, LOCAL_STORAGE_KEYS.INSTANCE_NAME, 'Old');

            let res = await renameDeviceDirect(instanceId, 'NewName');
            expect(res.success).toBe(true);
            const registryAfterRename = await storage.get(mockSyncStorage, SYNC_STORAGE_KEYS.DEVICE_REGISTRY);
            expect(registryAfterRename[instanceId].name).toBe('NewName');
            res = await deleteDeviceDirect(instanceId);
            expect(res.success).toBe(true);
            const registryAfterDelete = await storage.get(mockSyncStorage, SYNC_STORAGE_KEYS.DEVICE_REGISTRY);
            expect(registryAfterDelete[instanceId]).toBeUndefined();
        });

        test('createAndStoreGroupTask creates task in sync storage', async () => {
            const instanceId = 'sender-device-id';
            await storage.set(mockStorage, LOCAL_STORAGE_KEYS.INSTANCE_ID, instanceId);
            await storage.set(mockSyncStorage, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, { [instanceId]: { name: 'Sender', lastSeen: Date.now() } });

            const tabData = { url: 'https://example.com', title: 'Example' };
            const groupName = 'TestGroupForTask';

            const res = await createAndStoreGroupTask(groupName, tabData, instanceId);
            expect(res.success).toBe(true);
            expect(res.taskId).toBeDefined();

            const groupTasks = await storage.get(mockSyncStorage, SYNC_STORAGE_KEYS.GROUP_TASKS);
            expect(groupTasks[groupName]).toBeDefined();
            const task = groupTasks[groupName][res.taskId];
            expect(task.url).toBe('https://example.com');
            expect(task.senderDeviceId).toBe(instanceId);
        });

        test('createAndStoreGroupTask with recipientDeviceIds', async () => {
            const senderId = 'sender1';
            const recipientIds = ['recipientA', 'recipientB'];
            const tabData = { url: 'https://recipients.com', title: 'For Recipients' };
            const groupName = 'TargetedGroup';

            const res = await createAndStoreGroupTask(groupName, tabData, senderId, recipientIds);
            expect(res.success).toBe(true);
            const groupTasks = await storage.get(mockSyncStorage, SYNC_STORAGE_KEYS.GROUP_TASKS);
            const task = groupTasks[groupName][res.taskId];
            expect(task.recipientDeviceIds).toEqual(recipientIds);
        });
    });
    describe('Background Logic Helpers', () => {
        test('performHeartbeat merges correct data into deviceRegistry', async () => {
            const instanceId = 'test-id-1';
            const instanceName = 'Test Device';
            const initialRegistry = {
                'other-id': { name: 'Other', lastSeen: Date.now() - 10000 }
            };            
            // Set the instance ID in mock local storage for getInstanceId (if original was called, or for other parts)
            await storage.set(mockStorage, LOCAL_STORAGE_KEYS.INSTANCE_ID, instanceId);
            // Set the instance name override in mock local storage.
            // This ensures that if the original getInstanceName is called (e.g., if the mock isn't fully effective here),
            // it will pick up the correct name.
            await storage.set(mockStorage, LOCAL_STORAGE_KEYS.INSTANCE_NAME_OVERRIDE, instanceName);

            global.browser.runtime.getPlatformInfo.mockResolvedValue({ os: 'mac' }); 
            mockGenerateShortIdUtil.mockReturnValue(instanceId); // generateShortId is sync
            mockGetInstanceNameFromTestFile.mockResolvedValue(instanceName); // This mock should be hit by performHeartbeat
            await mockSyncStorage.set({ [SYNC_STORAGE_KEYS.DEVICE_REGISTRY]: initialRegistry });
            const beforeTimestamp = Date.now();
            await performHeartbeat();
            const afterTimestamp = Date.now();

            const registry = await storage.get(mockSyncStorage, SYNC_STORAGE_KEYS.DEVICE_REGISTRY);

            expect(registry['other-id']).toEqual(initialRegistry['other-id']);
            expect(registry[instanceId]).toBeDefined();
            expect(registry[instanceId].name).toBe(instanceName);
            expect(registry[instanceId].groupBits).toBeUndefined();
            expect(registry[instanceId].lastSeen).toBeGreaterThanOrEqual(beforeTimestamp);
            expect(registry[instanceId].lastSeen).toBeLessThanOrEqual(afterTimestamp);

            expect(mockSyncStorage.set).toHaveBeenCalledWith(expect.objectContaining({
                [SYNC_STORAGE_KEYS.DEVICE_REGISTRY]: expect.objectContaining({
                    [instanceId]: expect.objectContaining({
                        name: instanceName,
                        lastSeen: expect.any(Number)
                    })
                })
            }));
        });
        // test('performHeartbeat handles missing instanceId', async () => {
        //     mockGenerateShortIdUtil.mockReturnValue(null); // generateShortId is sync
        //     global.browser.runtime.getPlatformInfo.mockResolvedValue({ os: 'mac' }); 
        //     mockGetInstanceNameFromTestFile.mockResolvedValue('Any NameForHeartbeat'); 
        //     await performHeartbeat();
        //     expect(consoleWarnSpy).toHaveBeenCalledWith("Heartbeat skipped: Instance ID not available yet.");
        // });

        test('performStaleDeviceCheck removes stale devices and updates masks', async () => {
            const now = Date.now();
            const staleTime = now - (1000 * 60 * 60 * 24 * 31); // 31 days ago
            const recentTime = now - (1000 * 60 * 60); // 1 hour ago
            await storage.set(mockSyncStorage, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {
                'stale-id': { name: 'Stale', lastSeen: staleTime },
                'recent-id': { name: 'Recent', lastSeen: recentTime }
            });
            await storage.set(mockSyncStorage, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, {
                'stale-id': ['G1', 'G2'],
                'recent-id': ['G1']
            });
            await performStaleDeviceCheck(undefined, undefined, 1000 * 60 * 60 * 24 * 30);
            const finalRegistry = await storage.get(mockSyncStorage, SYNC_STORAGE_KEYS.DEVICE_REGISTRY);
            const finalSubscriptions = await storage.get(mockSyncStorage, SYNC_STORAGE_KEYS.SUBSCRIPTIONS);

            expect(finalRegistry['stale-id']).toBeUndefined();
            expect(finalRegistry['recent-id']).toBeDefined();
            expect(finalSubscriptions['stale-id']).toBeUndefined();
        });

        test('performStaleDeviceCheck with no stale devices', async () => {
            const initialRegistry = { 'recent-id': { name: 'Recent', lastSeen: Date.now() } };
            await storage.set(mockSyncStorage, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, initialRegistry);
            await performStaleDeviceCheck(undefined, undefined, 1000 * 60 * 60 * 24 * 30);
            expect(await storage.get(mockSyncStorage, SYNC_STORAGE_KEYS.DEVICE_REGISTRY)).toEqual(initialRegistry);
        });

        test('performTimeBasedTaskCleanup removes expired tasks', async () => {
            const now = Date.now();
            const expiredTime = now - (1000 * 60 * 60 * 24 * 15); // 15 days ago
            const recentTime = now - (1000 * 60 * 60); // 1 hour ago
            await mockSyncStorage.set({
                [SYNC_STORAGE_KEYS.GROUP_TASKS]: {
                    G1: {
                        'expired-task': { url: 'a', title: 'A', senderDeviceId: 'dev1', processedByDeviceIds: [], creationTimestamp: expiredTime },
                        'recent-task': { url: 'b', title: 'B', senderDeviceId: 'dev2', processedByDeviceIds: [], creationTimestamp: recentTime }
                    }
                }
            });
            const initialProcessedTasks = { 'expired-task': true };
            await storage.set(mockStorage, LOCAL_STORAGE_KEYS.PROCESSED_TASKS, initialProcessedTasks);

            const fetchedInitialProcessed = await storage.get(mockStorage, LOCAL_STORAGE_KEYS.PROCESSED_TASKS);
            await performTimeBasedTaskCleanup(fetchedInitialProcessed || {}, 1000 * 60 * 60 * 24 * 14);
            const finalGroupTasks = await storage.get(mockSyncStorage, SYNC_STORAGE_KEYS.GROUP_TASKS);
            const finalProcessed = await storage.get(mockStorage, LOCAL_STORAGE_KEYS.PROCESSED_TASKS);

            expect(finalGroupTasks.G1['expired-task']).toBeUndefined();
            expect(finalGroupTasks.G1['recent-task']).toBeDefined();
            expect(finalProcessed['expired-task']).toBeUndefined();
        });

        test('performTimeBasedTaskCleanup with no expired tasks', async () => {
            const now = Date.now();
            const recentTime = now - (1000 * 60 * 60); // 1 hour ago
            const initialTasks = { G1: { 'recent-task': { url: 'b', title: 'B', senderDeviceId: 'dev2', processedByDeviceIds: [], creationTimestamp: recentTime } } };
            await mockSyncStorage.set({ [SYNC_STORAGE_KEYS.GROUP_TASKS]: initialTasks });
            const initialProcessed = { 'some-other-task': true };
            await storage.set(mockStorage, LOCAL_STORAGE_KEYS.PROCESSED_TASKS, initialProcessed);

            await performTimeBasedTaskCleanup(initialProcessed, 1000 * 60 * 60 * 24 * 14);
            expect(await storage.get(mockSyncStorage, SYNC_STORAGE_KEYS.GROUP_TASKS)).toEqual(initialTasks);
            expect(await storage.get(mockStorage, LOCAL_STORAGE_KEYS.PROCESSED_TASKS)).toEqual(initialProcessed);
        });
    });
    describe('debounce', () => {
        jest.useFakeTimers();

        test('executes function after delay', () => {
            const func = jest.fn();
            const debouncedFunc = debounce(func, 100);
            debouncedFunc();
            expect(func).not.toHaveBeenCalled();
            jest.advanceTimersByTime(100);
            expect(func).toHaveBeenCalledTimes(1);
        });

        test('cancels previous timer if called again within delay', () => {
            const func = jest.fn();
            const debouncedFunc = debounce(func, 100);
            debouncedFunc();
            jest.advanceTimersByTime(50); // Call again before timeout
            debouncedFunc(); // Reset timer
            jest.advanceTimersByTime(50);
            expect(func).not.toHaveBeenCalled();
            jest.advanceTimersByTime(50);
            expect(func).toHaveBeenCalledTimes(1);
        });

        test('passes arguments to the original function', () => {
            const func = jest.fn();
            const debouncedFunc = debounce(func, 100);
            const arg1 = { data: 1 };
            debouncedFunc(arg1, 'test');
            jest.advanceTimersByTime(100);
            expect(func).toHaveBeenCalledWith(arg1, 'test');
        });
        afterAll(() => {
            jest.useRealTimers();
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
            const currentState = { deviceRegistry: {}, instanceId: 'local-id-test-1' };
            const mockHandlers = {
                startRenameCurrentDevice: jest.fn(),
                handleRemoveSelfDevice: jest.fn(),
                handleDeleteDevice: jest.fn()
            };
            renderDeviceRegistryUI(container, currentState, mockHandlers);
            expect(container.textContent).toBe(STRINGS.noDevices);
        });

        test('renderDeviceRegistryUI renders devices and highlights "This Device"', () => {
            const devices = {
                id1: { name: 'Alpha', lastSeen: 1234567890000 },
                id2: { name: 'Beta', lastSeen: 1234567891000 }
            };
            const localInstanceId = 'id2';
            const currentState = { deviceRegistry: devices, instanceId: localInstanceId };
            const mockHandlers = {
                startRenameCurrentDevice: jest.fn(),
                handleRemoveSelfDevice: jest.fn(),
                handleDeleteDevice: jest.fn()
            };

            renderDeviceRegistryUI(container, currentState, mockHandlers);

            expect(container.querySelectorAll('li').length).toBe(2);
            const thisDeviceLi = container.querySelector('.this-device');
            expect(thisDeviceLi).not.toBeNull();
            expect(thisDeviceLi.textContent).toContain('Beta');
            expect(thisDeviceLi.textContent).toContain('(This Device)');

            const otherDeviceLi = container.querySelector('li:not(.this-device)');
            expect(otherDeviceLi).not.toBeNull();
            expect(otherDeviceLi.textContent).toContain('Alpha');
        });

        test('renderGroupList shows no groups', () => {
            renderGroupList(container, [], [], jest.fn(), jest.fn(), jest.fn(), jest.fn());
            expect(container.textContent).toBe(STRINGS.noGroups);
        });

        test('renderGroupList renders groups and buttons correctly', () => {
            const mockHandlers = {
                handleSubscribe: jest.fn(),
                handleUnsubscribe: jest.fn(),
                handleDeleteGroup: jest.fn(),
                startRenameGroup: jest.fn()
            };
            renderGroupList(container, ['G1', 'G2'], ['G2'], mockHandlers);

            const items = container.querySelectorAll('li');
            expect(items.length).toBe(2);

            const g1Item = container.querySelector('li[role="listitem"]');
            expect(g1Item.querySelector('.group-name-label').textContent).toBe('G1');
            const subBtn = Array.from(g1Item.querySelectorAll('button')).find(b => b.textContent === 'Subscribe');
            expect(subBtn).not.toBeNull();
            expect(Array.from(g1Item.querySelectorAll('button')).find(b => b.textContent === 'Unsubscribe')).toBeUndefined();

            const g2Item = container.querySelectorAll('li[role="listitem"]')[1];
            expect(g2Item.querySelector('.group-name-label').textContent).toBe('G2');
            expect(Array.from(g2Item.querySelectorAll('button')).find(b => b.textContent === 'Subscribe')).toBeUndefined();
            const unsubBtn = Array.from(g2Item.querySelectorAll('button')).find(b => b.textContent === 'Unsubscribe');
            expect(unsubBtn).not.toBeNull();

            if (subBtn) subBtn.click();
            expect(mockHandlers.handleSubscribe).toHaveBeenCalledTimes(1);

            if (unsubBtn) unsubBtn.click();
            expect(mockHandlers.handleUnsubscribe).toHaveBeenCalledTimes(1);

            const g1DeleteBtn = g1Item.querySelector('.danger');
            g1DeleteBtn.click();
            expect(mockHandlers.handleDeleteGroup).toHaveBeenCalledTimes(1);

            const g2NameSpan = g2Item.querySelector('.group-name-label');
            g2NameSpan.click();
            expect(mockHandlers.startRenameGroup).toHaveBeenCalledTimes(1);
        });

        test('showAndroidBanner creates and updates banner', () => {
            container.appendChild(document.createElement('span'));
            showAndroidBanner(container, 'Banner1');
            const banner1 = container.querySelector('.android-banner');
            expect(banner1).not.toBeNull();
            expect(banner1.textContent).toBe('Banner1');

            showAndroidBanner(container, 'Banner2');
            const banner2 = container.querySelector('.android-banner');
            expect(banner2).not.toBeNull();
            expect(banner2.textContent).toBe('Banner2');
            expect(container.querySelectorAll('.android-banner').length).toBe(1);
        });

        test('setLastSyncTime creates and updates sync time', () => {
            container.appendChild(document.createElement('span'));
            setLastSyncTime(container, 1234567890000);
            const time1 = container.querySelector('.last-sync-time');
            expect(time1).not.toBeNull();
            expect(time1.textContent).toContain('Last sync (this view):');

            setLastSyncTime(container, 1234567891000);
            const time2 = container.querySelector('.last-sync-time');
            expect(time2).not.toBeNull();
            expect(time2.textContent).toContain('Last sync (this view):');
            expect(container.querySelectorAll('.last-sync-time').length).toBe(1);
        });

        test('showDebugInfo displays debug info', () => {
            const state = {
                instanceId: 'id', instanceName: 'name', subscriptions: ['g1'],
                definedGroups: ['g1'],
                deviceRegistry: { "dev1": { name: "Device 1" } },
                groupTasks: { "g1": { "task1": {} } },
                isAndroid: false
            };
            const expectedDebugState = { instanceId: 'id', instanceName: 'name', subscriptions: ['g1'], definedGroups: ['g1'], deviceRegistryCount: 1, groupTasksCount: 1, isAndroid: false };

            showDebugInfo(container, state);
            const debugDiv = container.querySelector('.options-debug-info');
            expect(debugDiv).not.toBeNull();
            const debugPre = debugDiv.querySelector('pre');
            expect(debugPre).not.toBeNull();
            const parsedDebugInfo = JSON.parse(debugPre.textContent);
            expect(parsedDebugInfo).toEqual(expectedDebugState);
        });

        test('displaySyncRequirementBanner adds banner to container', async () => {
            const mockStorageAPI = {
                get: jest.fn().mockResolvedValue(false),
                set: jest.fn().mockResolvedValue(undefined),
            };

            await displaySyncRequirementBanner(container, mockStorageAPI);
            const banner = container.querySelector('.sync-requirement-banner');
            expect(banner).not.toBeNull();
            expect(banner.textContent).toContain("TabTogether relies on Firefox Sync");
            await displaySyncRequirementBanner(container, mockStorageAPI);
            expect(container.querySelectorAll('.sync-requirement-banner').length).toBe(1);
        });

        test('displaySyncRequirementBanner does nothing if container is null', () => {
            expect(() => displaySyncRequirementBanner(null)).not.toThrow();
        });
    });
});
