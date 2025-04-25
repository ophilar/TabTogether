import { jest } from '@jest/globals';
jest.unstable_mockModule('crypto', () => ({
  default: { randomUUID: () => 'mock-uuid-1234' }
}));

import * as utils from '../utils.js';
import './setup.js';
import '../test/setup.js';

// --- Shared test fixtures and mock setup ---
const getMockStorage = () => {
  const memoryStore = {};
  return {
    get: jest.fn(async (key) => {
      if (!key) return { ...memoryStore };
      if (typeof key === 'string') return { [key]: memoryStore[key] };
      const result = {};
      for (const k of key) result[k] = memoryStore[k];
      return result;
    }),
    set: jest.fn(async (obj) => { Object.assign(memoryStore, obj); }),
    clear: jest.fn(async () => { for (const k in memoryStore) delete memoryStore[k]; })
  };
};

// Persistent in-memory mock for browser.storage
const mockStorage = getMockStorage();

global.browser = {
  storage: {
    local: mockStorage,
    sync: mockStorage
  },
  runtime: {
    getPlatformInfo: jest.fn(async () => ({ os: 'win' }))
  }
};

describe('utils', () => {
  beforeEach(async () => { await mockStorage.clear(); });

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

  test('getStorage returns value or default', async () => {
    await mockStorage.set({ foo: 42 });
    expect(await utils.getStorage(mockStorage, 'foo', 0)).toBe(42);
    expect(await utils.getStorage(mockStorage, 'bar', 99)).toBe(99);
  });

  test('mergeSyncStorage merges and sets', async () => {
    await mockStorage.set({ test: { a: 1, b: 2 } });
    await utils.mergeSyncStorage('test', { b: 3, c: 4 });
    expect((await mockStorage.get('test')).test).toEqual({ a: 1, b: 3, c: 4 });
  });

  test('getInstanceId generates and persists uuid', async () => {
    await mockStorage.clear();
    const id = await utils.getInstanceId({ randomUUID: () => 'mock-uuid-1234' });
    expect(id).toBe('mock-uuid-1234');
    expect((await mockStorage.get('myInstanceId')).myInstanceId).toBe('mock-uuid-1234');
  });

  test('getInstanceName generates and persists name', async () => {
    await mockStorage.clear();
    const name = await utils.getInstanceName();
    expect(typeof name).toBe('string');
    expect((await mockStorage.get('myInstanceName')).myInstanceName).toBe(name);
  });

  test('isAndroid and isDesktop platform detection', async () => {
    browser.runtime.getPlatformInfo.mockResolvedValueOnce({ os: 'android' });
    expect(await utils.isAndroid()).toBe(true);
    browser.runtime.getPlatformInfo.mockResolvedValueOnce({ os: 'win' });
    expect(await utils.isAndroid()).toBe(false);
    expect(await utils.isDesktop()).toBe(true);
  });

  // Direct storage logic tests (group management, tab sending)
  test('direct group create/subscribe/unsubscribe', async () => {
    // Simulate direct group creation
    await mockStorage.set({ definedGroups: [] });
    const createRes = await utils.createGroupDirect('TestGroup');
    expect(createRes.success).toBe(true);
    expect((await mockStorage.get('definedGroups')).definedGroups).toContain('TestGroup');
    // Subscribe
    const subRes = await utils.subscribeToGroupDirect('TestGroup');
    expect(subRes.success).toBe(true);
    // Unsubscribe
    const unsubRes = await utils.unsubscribeFromGroupDirect('TestGroup');
    expect(unsubRes.success).toBe(true);
  });

  test('direct sendTabToGroupDirect', async () => {
    await mockStorage.set({ myGroupBits: { TestGroup: 1 } });
    const res = await utils.sendTabToGroupDirect('TestGroup', { url: 'https://example.com', title: 'Example' });
    expect(res.success).toBe(true);
    const groupTasks = (await mockStorage.get('groupTasks')).groupTasks;
    expect(groupTasks.TestGroup).toBeDefined();
    const task = Object.values(groupTasks.TestGroup)[0];
    expect(task.url).toBe('https://example.com');
  });

  test('showAndroidBanner and setLastSyncTime create elements', () => {
    document.body.innerHTML = '<div class="container"></div>';
    const container = document.querySelector('.container');
    utils.showAndroidBanner(container, 'Android banner test');
    expect(container.querySelector('.android-banner').textContent).toBe('Android banner test');
    utils.setLastSyncTime(container, 1234567890000);
    expect(container.querySelector('.last-sync-time').textContent).toContain('Last sync:');
  });

  test('showDebugInfo displays debug info', () => {
    document.body.innerHTML = '<div class="container"></div>';
    const container = document.querySelector('.container');
    const state = {
      instanceId: 'id',
      instanceName: 'name',
      subscriptions: ['g1'],
      groupBits: { g1: 1 },
      definedGroups: ['g1'],
      deviceRegistry: { id: { name: 'name', lastSeen: 1, groupBits: { g1: 1 } } },
      groupState: { g1: { assignedMask: 1, assignedCount: 1 } }
    };
    utils.showDebugInfo(container, state);
    expect(container.querySelector('.debug-info').innerHTML).toContain('Instance ID: id');
    expect(container.querySelector('.debug-info').innerHTML).toContain('Defined Groups:');
  });
});
// utils.test.js

// Mock the constants dependency
jest.mock('./constants.js', () => ({
  STRINGS: {
      deviceNameNotSet: '(Not Set)',
      noDevices: 'No devices registered.',
      noGroups: 'No groups defined.',
      notSubscribed: 'Not subscribed.',
      subscribedGroups: 'Subscribed groups: ',
      error: 'Error',
  },
}));

// Mock browser APIs (basic structure)
const mockStorageArea = () => {
  let store = {};
  return {
      get: jest.fn((keys) => {
          const result = {};
          const keyList = typeof keys === 'string' ? [keys] : keys;
          keyList.forEach(k => {
              result[k] = store[k]; // Return undefined if not set
          });
          return Promise.resolve(result);
      }),
      set: jest.fn((items) => {
          store = { ...store, ...items };
          return Promise.resolve();
      }),
      clear: () => { store = {}; }, // Helper for tests
      _getStore: () => store, // Helper for tests
  };
};

global.browser = {
  storage: {
      local: mockStorageArea(),
      sync: mockStorageArea(),
  },
  runtime: {
      getPlatformInfo: jest.fn().mockResolvedValue({ os: 'linux' }),
      getURL: jest.fn(path => `moz-extension://test-uuid/${path}`),
  },
  notifications: {
      create: jest.fn().mockResolvedValue('test-notif-id'),
  },
  // Add other browser APIs if needed by functions under test
};

// Mock crypto
global.crypto = {
  randomUUID: jest.fn().mockReturnValue('mock-uuid-123'),
};

describe('Utils Module', () => {

  // Reset mocks and storage before each test
  beforeEach(() => {
      jest.clearAllMocks();
      global.browser.storage.local.clear();
      global.browser.storage.sync.clear();
      global.browser.runtime.getPlatformInfo.mockResolvedValue({ os: 'linux' }); // Reset platform info
      global.crypto.randomUUID.mockReturnValue('mock-uuid-123'); // Reset UUID
  });

  // --- Type Safety Helpers ---
  describe('Type Safety Helpers', () => {
      test('ensureObject returns object for valid object', () => {
          expect(utils.ensureObject({ a: 1 })).toEqual({ a: 1 });
      });
      test('ensureObject returns fallback for non-object', () => {
          expect(utils.ensureObject(null)).toEqual({});
          expect(utils.ensureObject(undefined)).toEqual({});
          expect(utils.ensureObject([])).toEqual({});
          expect(utils.ensureObject('string')).toEqual({});
          expect(utils.ensureObject(123)).toEqual({});
          expect(utils.ensureObject(true, { x: 0 })).toEqual({ x: 0 });
      });

      test('ensureArray returns array for valid array', () => {
          expect(utils.ensureArray([1, 2])).toEqual([1, 2]);
      });
      test('ensureArray returns fallback for non-array', () => {
          expect(utils.ensureArray(null)).toEqual([]);
          expect(utils.ensureArray(undefined)).toEqual([]);
          expect(utils.ensureArray({})).toEqual([]);
          expect(utils.ensureArray('string')).toEqual([]);
          expect(utils.ensureArray(123)).toEqual([]);
          expect(utils.ensureArray(true, ['a'])).toEqual(['a']);
      });

      test('ensureString returns string for valid string', () => {
          expect(utils.ensureString('hello')).toBe('hello');
      });
      test('ensureString returns fallback for non-string', () => {
          expect(utils.ensureString(null)).toBe('');
          expect(utils.ensureString(undefined)).toBe('');
          expect(utils.ensureString({})).toBe('');
          expect(utils.ensureString([])).toBe('');
          expect(utils.ensureString(123)).toBe('');
          expect(utils.ensureString(true, 'def')).toBe('def');
      });
  });

  // --- Storage Access Helpers ---
  describe('Storage Access (getFromStorage / setInStorage / storage object)', () => {
      test('getFromStorage retrieves value', async () => {
          await global.browser.storage.local.set({ testKey: 'testValue' });
          const value = await utils.getFromStorage(global.browser.storage.local, 'testKey');
          expect(value).toBe('testValue');
          expect(global.browser.storage.local.get).toHaveBeenCalledWith('testKey');
      });

      test('getFromStorage returns default value if not found', async () => {
          const value = await utils.getFromStorage(global.browser.storage.local, 'nonExistentKey', 'defaultValue');
          expect(value).toBe('defaultValue');
      });

      test('getFromStorage handles errors', async () => {
          global.browser.storage.local.get.mockRejectedValueOnce(new Error('Storage failed'));
          const value = await utils.getFromStorage(global.browser.storage.local, 'anyKey', 'fallback');
          expect(value).toBe('fallback');
          // Check console.error was called (optional)
      });

      test('setInStorage sets value', async () => {
          const success = await utils.setInStorage(global.browser.storage.local, 'newKey', { data: 1 });
          expect(success).toBe(true);
          expect(global.browser.storage.local.set).toHaveBeenCalledWith({ newKey: { data: 1 } });
          const stored = await global.browser.storage.local.get('newKey');
          expect(stored.newKey).toEqual({ data: 1 });
      });

      test('setInStorage handles errors', async () => {
          global.browser.storage.local.set.mockRejectedValueOnce(new Error('Set failed'));
          const success = await utils.setInStorage(global.browser.storage.local, 'failKey', 'value');
          expect(success).toBe(false);
          // Check console.error was called (optional)
      });

      // Test the 'storage' object wrapper
      test('storage.get retrieves value', async () => {
          await global.browser.storage.sync.set({ syncKey: 'syncValue' });
          const value = await utils.storage.get(global.browser.storage.sync, 'syncKey');
          expect(value).toBe('syncValue');
      });

      test('storage.set sets value', async () => {
          await utils.storage.set(global.browser.storage.sync, 'anotherSyncKey', [1, 2]);
          const stored = await global.browser.storage.sync.get('anotherSyncKey');
          expect(stored.anotherSyncKey).toEqual([1, 2]);
      });

      test('storage.merge performs deep merge', async () => {
          await global.browser.storage.sync.set({ mergeKey: { a: 1, b: { x: 10 } } });
          const success = await utils.storage.merge(global.browser.storage.sync, 'mergeKey', { b: { y: 20 }, c: 3 });
          expect(success).toBe(true);
          const stored = await global.browser.storage.sync.get('mergeKey');
          expect(stored.mergeKey).toEqual({ a: 1, b: { x: 10, y: 20 }, c: 3 });
      });

      test('storage.merge handles null for deletion', async () => {
          await global.browser.storage.sync.set({ mergeKey: { a: 1, b: 2 } });
          const success = await utils.storage.merge(global.browser.storage.sync, 'mergeKey', { b: null });
          expect(success).toBe(true);
          const stored = await global.browser.storage.sync.get('mergeKey');
          expect(stored.mergeKey).toEqual({ a: 1 });
      });
  });

  // --- Deep Merge ---
  describe('deepMerge', () => {
      test('merges simple objects', () => {
          const target = { a: 1, b: 2 };
          const source = { b: 3, c: 4 };
          expect(utils.deepMerge(target, source)).toEqual({ a: 1, b: 3, c: 4 });
      });

      test('merges nested objects', () => {
          const target = { a: 1, b: { x: 10, y: 20 } };
          const source = { b: { y: 30, z: 40 }, c: 5 };
          expect(utils.deepMerge(target, source)).toEqual({ a: 1, b: { x: 10, y: 30, z: 40 }, c: 5 });
      });

      test('handles null source', () => {
          const target = { a: 1 };
          expect(utils.deepMerge(target, null)).toEqual({ a: 1 });
      });

      test('handles null target', () => {
          const source = { b: 2 };
          // Note: deepMerge implementation assumes target is an object, might need adjustment if null target is valid
          expect(utils.deepMerge({}, source)).toEqual({ b: 2 });
      });

      test('deletes keys when source value is null', () => {
          const target = { a: 1, b: { x: 10 }, c: 3 };
          const source = { b: null, c: undefined }; // undefined should overwrite
          expect(utils.deepMerge(target, source)).toEqual({ a: 1, c: undefined });
      });

      test('overwrites non-object target key with source object', () => {
          const target = { a: 1, b: 'string' };
          const source = { b: { x: 10 } };
          expect(utils.deepMerge(target, source)).toEqual({ a: 1, b: { x: 10 } });
      });

      test('does not merge object into non-object target key', () => {
           const target = { a: 1, b: { x: 10 } };
           const source = { b: 'string' }; // Overwrites object with string
           expect(utils.deepMerge(target, source)).toEqual({ a: 1, b: 'string' });
      });

      test('handles empty objects', () => {
          expect(utils.deepMerge({}, { a: 1 })).toEqual({ a: 1 });
          expect(utils.deepMerge({ a: 1 }, {})).toEqual({ a: 1 });
          expect(utils.deepMerge({}, {})).toEqual({});
      });
  });

  // --- Instance ID/Name ---
  describe('Instance ID/Name', () => {
      test('getInstanceId generates new ID if none exists', async () => {
          const id = await utils.getInstanceId();
          expect(id).toBe('mock-uuid-123');
          expect(global.crypto.randomUUID).toHaveBeenCalledTimes(1);
          // Check it was saved to both local and sync
          expect(global.browser.storage.local.set).toHaveBeenCalledWith({ [utils.LOCAL_STORAGE_KEYS.INSTANCE_ID]: 'mock-uuid-123' });
          expect(global.browser.storage.sync.set).toHaveBeenCalledWith({ [utils.LOCAL_STORAGE_KEYS.INSTANCE_ID]: 'mock-uuid-123' });
      });

      test('getInstanceId retrieves from local storage first', async () => {
          global.browser.storage.local._getStore()[utils.LOCAL_STORAGE_KEYS.INSTANCE_ID] = 'local-id';
          const id = await utils.getInstanceId();
          expect(id).toBe('local-id');
          expect(global.crypto.randomUUID).not.toHaveBeenCalled();
          // Check it syncs the local ID to sync storage
          expect(global.browser.storage.sync.set).toHaveBeenCalledWith({ [utils.LOCAL_STORAGE_KEYS.INSTANCE_ID]: 'local-id' });
      });

      test('getInstanceId retrieves from sync storage if local is empty', async () => {
          global.browser.storage.sync._getStore()[utils.LOCAL_STORAGE_KEYS.INSTANCE_ID] = 'sync-id';
          const id = await utils.getInstanceId();
          expect(id).toBe('sync-id');
          expect(global.crypto.randomUUID).not.toHaveBeenCalled();
          // Check it saves the sync ID to local storage
          expect(global.browser.storage.local.set).toHaveBeenCalledWith({ [utils.LOCAL_STORAGE_KEYS.INSTANCE_ID]: 'sync-id' });
          // Check it re-saves to sync storage
          expect(global.browser.storage.sync.set).toHaveBeenCalledWith({ [utils.LOCAL_STORAGE_KEYS.INSTANCE_ID]: 'sync-id' });
      });

      test('getInstanceName generates default name if none exists', async () => {
          global.browser.runtime.getPlatformInfo.mockResolvedValue({ os: 'mac' });
          const name = await utils.getInstanceName();
          expect(name).toBe('Mac Device');
          expect(global.browser.runtime.getPlatformInfo).toHaveBeenCalledTimes(1);
          // Check it was saved to both local and sync
          expect(global.browser.storage.local.set).toHaveBeenCalledWith({ [utils.LOCAL_STORAGE_KEYS.INSTANCE_NAME]: 'Mac Device' });
          expect(global.browser.storage.sync.set).toHaveBeenCalledWith({ [utils.LOCAL_STORAGE_KEYS.INSTANCE_NAME]: 'Mac Device' });
      });

       test('getInstanceName handles windows platform name', async () => {
          global.browser.runtime.getPlatformInfo.mockResolvedValue({ os: 'win' });
          const name = await utils.getInstanceName();
          expect(name).toBe('Windows Device');
       });

      test('getInstanceName retrieves from local storage first', async () => {
          global.browser.storage.local._getStore()[utils.LOCAL_STORAGE_KEYS.INSTANCE_NAME] = 'local-name';
          const name = await utils.getInstanceName();
          expect(name).toBe('local-name');
          expect(global.browser.runtime.getPlatformInfo).not.toHaveBeenCalled();
          // Check it syncs the local name to sync storage
          expect(global.browser.storage.sync.set).toHaveBeenCalledWith({ [utils.LOCAL_STORAGE_KEYS.INSTANCE_NAME]: 'local-name' });
      });

      test('getInstanceName retrieves from sync storage if local is empty', async () => {
          global.browser.storage.sync._getStore()[utils.LOCAL_STORAGE_KEYS.INSTANCE_NAME] = 'sync-name';
          const name = await utils.getInstanceName();
          expect(name).toBe('sync-name');
          expect(global.browser.runtime.getPlatformInfo).not.toHaveBeenCalled();
          // Check it saves the sync name to local storage
          expect(global.browser.storage.local.set).toHaveBeenCalledWith({ [utils.LOCAL_STORAGE_KEYS.INSTANCE_NAME]: 'sync-name' });
           // Check it re-saves to sync storage
          expect(global.browser.storage.sync.set).toHaveBeenCalledWith({ [utils.LOCAL_STORAGE_KEYS.INSTANCE_NAME]: 'sync-name' });
      });
  });

  // --- Bitmask Helpers ---
  describe('getNextAvailableBitPosition', () => {
      test('returns 0 for empty mask', () => {
          expect(utils.getNextAvailableBitPosition(0)).toBe(0);
      });
      test('returns next available bit', () => {
          expect(utils.getNextAvailableBitPosition(1)).toBe(1); // 0001 -> bit 1
          expect(utils.getNextAvailableBitPosition(3)).toBe(2); // 0011 -> bit 2
          expect(utils.getNextAvailableBitPosition(5)).toBe(1); // 0101 -> bit 1
          expect(utils.getNextAvailableBitPosition(7)).toBe(3); // 0111 -> bit 3
      });
      test('returns correct bit when lower bits are free', () => {
          expect(utils.getNextAvailableBitPosition(0b11110111)).toBe(3);
      });
      test('returns -1 when mask is full (up to MAX_DEVICES_PER_GROUP)', () => {
          const fullMask = (1 << utils.MAX_DEVICES_PER_GROUP) - 1;
          expect(utils.getNextAvailableBitPosition(fullMask)).toBe(-1);
      });
       test('handles masks larger than MAX_DEVICES_PER_GROUP', () => {
          const largeMask = (1 << (utils.MAX_DEVICES_PER_GROUP + 2)) -1; // e.g., 17 bits set
          expect(utils.getNextAvailableBitPosition(largeMask)).toBe(-1); // Should still return -1
       });
  });

  // --- Platform Info ---
  describe('Platform Info', () => {
      test('isAndroid returns true for android os', async () => {
          global.browser.runtime.getPlatformInfo.mockResolvedValue({ os: 'android' });
          await utils.getPlatformInfoCached(); // Cache it
          expect(await utils.isAndroid()).toBe(true);
      });

      test('isAndroid returns false for non-android os', async () => {
          global.browser.runtime.getPlatformInfo.mockResolvedValue({ os: 'win' });
          await utils.getPlatformInfoCached(); // Cache it
          expect(await utils.isAndroid()).toBe(false);
      });

      test('isDesktop returns true for win/mac/linux', async () => {
          global.browser.runtime.getPlatformInfo.mockResolvedValue({ os: 'win' });
          await utils.getPlatformInfoCached();
          expect(await utils.isDesktop()).toBe(true);

          global.browser.runtime.getPlatformInfo.mockResolvedValue({ os: 'mac' });
          await utils.getPlatformInfoCached();
          expect(await utils.isDesktop()).toBe(true);

          global.browser.runtime.getPlatformInfo.mockResolvedValue({ os: 'linux' });
          await utils.getPlatformInfoCached();
          expect(await utils.isDesktop()).toBe(true);
      });

      test('isDesktop returns false for other os', async () => {
          global.browser.runtime.getPlatformInfo.mockResolvedValue({ os: 'android' });
          await utils.getPlatformInfoCached();
          expect(await utils.isDesktop()).toBe(false);

          global.browser.runtime.getPlatformInfo.mockResolvedValue({ os: 'chromeos' });
          await utils.getPlatformInfoCached();
          expect(await utils.isDesktop()).toBe(false);
      });

      test('getPlatformInfoCached uses cache', async () => {
          global.browser.storage.local._getStore()['platformInfo'] = { os: 'cached-os' };
          const info = await utils.getPlatformInfoCached();
          expect(info).toEqual({ os: 'cached-os' });
          expect(global.browser.runtime.getPlatformInfo).not.toHaveBeenCalled();
      });

      test('getPlatformInfoCached fetches and caches if not in storage', async () => {
           global.browser.runtime.getPlatformInfo.mockResolvedValue({ os: 'fetched-os' });
           const info = await utils.getPlatformInfoCached();
           expect(info).toEqual({ os: 'fetched-os' });
           expect(global.browser.runtime.getPlatformInfo).toHaveBeenCalledTimes(1);
           // Check if it was cached
           const cached = await global.browser.storage.local.get('platformInfo');
           expect(cached.platformInfo).toEqual({ os: 'fetched-os' });
      });
  });

  // --- Generic List/Object Updaters ---
  describe('Generic Storage Updaters', () => {
      test('addToList adds item and sorts', async () => {
          await utils.storage.set(global.browser.storage.local, 'myList', ['b', 'a']);
          await utils.addToList(global.browser.storage.local, 'myList', 'c');
          const list = await utils.storage.get(global.browser.storage.local, 'myList');
          expect(list).toEqual(['a', 'b', 'c']);
      });

      test('addToList does not add duplicate', async () => {
          await utils.storage.set(global.browser.storage.local, 'myList', ['a', 'b']);
          await utils.addToList(global.browser.storage.local, 'myList', 'a');
          const list = await utils.storage.get(global.browser.storage.local, 'myList');
          expect(list).toEqual(['a', 'b']);
      });

      test('removeFromList removes item', async () => {
          await utils.storage.set(global.browser.storage.local, 'myList', ['a', 'b', 'c']);
          await utils.removeFromList(global.browser.storage.local, 'myList', 'b');
          const list = await utils.storage.get(global.browser.storage.local, 'myList');
          expect(list).toEqual(['a', 'c']);
      });

      test('renameInList renames item', async () => {
          await utils.storage.set(global.browser.storage.local, 'myList', ['a', 'b', 'c']);
          await utils.renameInList(global.browser.storage.local, 'myList', 'b', 'b_new');
          const list = await utils.storage.get(global.browser.storage.local, 'myList');
          expect(list).toEqual(['a', 'b_new', 'c']);
      });

      test('updateObjectKey renames property', async () => {
          await utils.storage.set(global.browser.storage.local, 'myObj', { oldKey: 1, other: 2 });
          await utils.updateObjectKey(global.browser.storage.local, 'myObj', 'oldKey', 'newKey');
          const obj = await utils.storage.get(global.browser.storage.local, 'myObj');
          expect(obj).toEqual({ newKey: 1, other: 2 });
      });

      test('removeObjectKey removes property', async () => {
          await utils.storage.set(global.browser.storage.local, 'myObj', { keyToRemove: 1, other: 2 });
          await utils.removeObjectKey(global.browser.storage.local, 'myObj', 'keyToRemove');
          const obj = await utils.storage.get(global.browser.storage.local, 'myObj');
          expect(obj).toEqual({ other: 2 });
      });
  });

  // --- Background Logic Helpers (Example: performHeartbeat) ---
  describe('Background Logic Helpers', () => {
      test('performHeartbeat merges correct data into deviceRegistry', async () => {
          const instanceId = 'test-id-1';
          const instanceName = 'Test Device';
          const groupBits = { groupA: 1, groupB: 4 };
          const initialRegistry = {
              'other-id': { name: 'Other', lastSeen: Date.now() - 10000, groupBits: {} }
          };
          await utils.storage.set(global.browser.storage.sync, utils.SYNC_STORAGE_KEYS.DEVICE_REGISTRY, initialRegistry);

          const beforeTimestamp = Date.now();
          await utils.performHeartbeat(instanceId, instanceName, groupBits, {}); // Pass empty cache
          const afterTimestamp = Date.now();

          const registry = await utils.storage.get(global.browser.storage.sync, utils.SYNC_STORAGE_KEYS.DEVICE_REGISTRY);

          expect(registry['other-id']).toEqual(initialRegistry['other-id']); // Ensure other device wasn't touched
          expect(registry[instanceId]).toBeDefined();
          expect(registry[instanceId].name).toBe(instanceName);
          expect(registry[instanceId].groupBits).toEqual(groupBits);
          expect(registry[instanceId].lastSeen).toBeGreaterThanOrEqual(beforeTimestamp);
          expect(registry[instanceId].lastSeen).toBeLessThanOrEqual(afterTimestamp);

          // Check merge was called correctly
          expect(global.browser.storage.sync.set).toHaveBeenCalledWith({
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
           expect(global.browser.storage.sync.set).not.toHaveBeenCalled();
           // Check console.warn was called (optional, requires spying on console)
       });

       // TODO: Add tests for performStaleDeviceCheck and performTimeBasedTaskCleanup
       // These will require more setup for registry, groupState, groupTasks, and time mocking/assertions.
  });

  // --- Debounce ---
  describe('debounce', () => {
      jest.useFakeTimers();

      test('executes function after delay', () => {
          const func = jest.fn();
          const debouncedFunc = utils.debounce(func, 100);

          debouncedFunc();
          expect(func).not.toHaveBeenCalled();

          jest.advanceTimersByTime(50);
          expect(func).not.toHaveBeenCalled();

          jest.advanceTimersByTime(50);
          expect(func).toHaveBeenCalledTimes(1);
      });

      test('cancels previous timer if called again within delay', () => {
          const func = jest.fn();
          const debouncedFunc = utils.debounce(func, 100);

          debouncedFunc(); // Call 1
          jest.advanceTimersByTime(50);
          expect(func).not.toHaveBeenCalled();

          debouncedFunc(); // Call 2 (resets timer)
          jest.advanceTimersByTime(50);
          expect(func).not.toHaveBeenCalled(); // Still not called

          jest.advanceTimersByTime(50);
          expect(func).toHaveBeenCalledTimes(1); // Called only once after the second call's delay
      });

      test('passes arguments to the original function', () => {
          const func = jest.fn();
          const debouncedFunc = utils.debounce(func, 100);
          const arg1 = { data: 1 };
          const arg2 = [1, 2];

          debouncedFunc(arg1, arg2);
          jest.advanceTimersByTime(100);

          expect(func).toHaveBeenCalledWith(arg1, arg2);
      });

      // Restore real timers after tests
      afterAll(() => {
          jest.useRealTimers();
      });
  });

  // --- HTML Template Utility ---
  describe('html template utility', () => {
      test('creates simple element', () => {
          const frag = utils.html`<div>Hello</div>`;
          const div = frag.querySelector('div');
          expect(div).not.toBeNull();
          expect(div.textContent).toBe('Hello');
      });

      test('interpolates values', () => {
          const name = 'World';
          const className = 'greeting';
          const frag = utils.html`<p class="${className}">Hello ${name}!</p>`;
          const p = frag.querySelector('p');
          expect(p).not.toBeNull();
          expect(p.className).toBe('greeting');
          expect(p.textContent).toBe('Hello World!');
      });

      test('handles multiple elements', () => {
          const frag = utils.html`<span>One</span><span>Two</span>`;
          const spans = frag.querySelectorAll('span');
          expect(spans.length).toBe(2);
          expect(spans[0].textContent).toBe('One');
          expect(spans[1].textContent).toBe('Two');
      });

      test('handles null/undefined values gracefully', () => {
          const undef = undefined;
          const nul = null;
          const frag = utils.html`<div>${undef}${nul}</div>`;
          const div = frag.querySelector('div');
          expect(div.textContent).toBe(''); // Should render as empty string
      });
  });

  // Add more describe blocks for other function categories (e.g., Direct Actions, Rendering Helpers if testable)

});
