import { jest } from '@jest/globals';
// Automated tests for utils.js
import * as utils from '../utils.js';

global.crypto = { randomUUID: () => 'mock-uuid-1234' };

// Mock browser API for storage and platform
const mockStorage = (() => {
  let store = {};
  return {
    get: jest.fn(async (key) => (typeof key === 'string' ? { [key]: store[key] } : store)),
    set: jest.fn(async (obj) => { Object.assign(store, obj); }),
    clear: jest.fn(async () => { store = {}; })
  };
})();

global.browser = {
  storage: {
    local: mockStorage,
    sync: mockStorage
  },
  runtime: {
    getPlatformInfo: jest.fn(async () => ({ os: 'win' }))
  }
};
global.crypto = { randomUUID: () => 'mock-uuid-1234' };

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
    const id = await utils.getInstanceId();
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
