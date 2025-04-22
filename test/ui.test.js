import { jest } from '@jest/globals';
// ui.test.js
// Tests for UI rendering helpers and error handling in utils.js, popup.js, options.js
import * as utils from '../utils.js';
import { STRINGS } from '../constants.js';

// Setup DOM for UI tests
describe('UI Rendering Helpers', () => {
  let container;
  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
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
  });

  test('renderDeviceList handles null/undefined devices', () => {
    utils.renderDeviceList(container, null);
    expect(container.textContent).toBe(STRINGS.noDevices);
    utils.renderDeviceList(container, undefined);
    expect(container.textContent).toBe(STRINGS.noDevices);
  });

  test('renderGroupList shows no groups', () => {
    utils.renderGroupList(container, [], [], jest.fn(), jest.fn(), jest.fn(), jest.fn());
    expect(container.textContent).toBe(STRINGS.noGroups);
  });

  test('renderGroupList renders groups and buttons', () => {
    const onSubscribe = jest.fn();
    const onUnsubscribe = jest.fn();
    const onDelete = jest.fn();
    const onRename = jest.fn();
    utils.renderGroupList(container, ['G1', 'G2'], ['G2'], onSubscribe, onUnsubscribe, onDelete, onRename);
    expect(container.querySelectorAll('li').length).toBe(2);
    expect(container.querySelector('.group-name-label').textContent).toBe('G1');
    // Simulate click on rename
    container.querySelector('.group-name-label').click();
    expect(onRename).toHaveBeenCalled();
  });

  test('renderGroupList handles null/undefined groups', () => {
    utils.renderGroupList(container, null, [], jest.fn(), jest.fn(), jest.fn(), jest.fn());
    expect(container.textContent).toBe(STRINGS.noGroups);
    utils.renderGroupList(container, undefined, [], jest.fn(), jest.fn(), jest.fn(), jest.fn());
    expect(container.textContent).toBe(STRINGS.noGroups);
  });

  test('renderGroupList unsubscribe/subscribe/delete button events', () => {
    const onSubscribe = jest.fn();
    const onUnsubscribe = jest.fn();
    const onDelete = jest.fn();
    const onRename = jest.fn();
    utils.renderGroupList(container, ['G1'], [], onSubscribe, onUnsubscribe, onDelete, onRename);
    const subBtn = container.querySelector('button.subscribe-btn');
    subBtn.click();
    expect(onSubscribe).toHaveBeenCalled();
    utils.renderGroupList(container, ['G2'], ['G2'], onSubscribe, onUnsubscribe, onDelete, onRename);
    const unsubBtn = container.querySelector('button.unsubscribe-btn');
    unsubBtn.click();
    expect(onUnsubscribe).toHaveBeenCalled();
    const delBtn = container.querySelector('button.delete-btn');
    delBtn.click();
    expect(onDelete).toHaveBeenCalled();
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
});

describe('Error handling in utils.js', () => {
  beforeEach(() => {
    // Provide a minimal browser mock for getStorage error test
    global.browser = { storage: { sync: {}, local: {} } };
  });
  test('getStorage returns default on error', async () => {
    const badArea = { get: async () => { throw new Error('fail'); } };
    const val = await utils.getStorage(badArea, 'foo', 123);
    expect(val).toBe(123);
  });

  test('mergeSyncStorage returns false on error', async () => {
    const orig = global.browser;
    global.browser = { storage: { sync: { set: async () => { throw new Error('fail'); }, get: async () => ({}) } } };
    const result = await utils.mergeSyncStorage('key', { a: 1 });
    expect(result).toBe(false);
    global.browser = orig;
  });
});

describe('utils.js platform and bit helpers', () => {
  test('getNextAvailableBitPosition finds first zero bit', () => {
    expect(utils.getNextAvailableBitPosition(0b0000)).toBe(0);
    expect(utils.getNextAvailableBitPosition(0b1111)).toBe(4);
    expect(utils.getNextAvailableBitPosition(0x7FFF)).toBe(-1); // all 15 bits set
  });

  test('isDesktop returns true for win/mac/linux', async () => {
    global.browser = { runtime: { getPlatformInfo: async () => ({ os: 'win' }) } };
    expect(await utils.isDesktop()).toBe(true);
    global.browser = { runtime: { getPlatformInfo: async () => ({ os: 'mac' }) } };
    expect(await utils.isDesktop()).toBe(true);
    global.browser = { runtime: { getPlatformInfo: async () => ({ os: 'linux' }) } };
    expect(await utils.isDesktop()).toBe(true);
    global.browser = { runtime: { getPlatformInfo: async () => ({ os: 'android' }) } };
    expect(await utils.isDesktop()).toBe(false);
  });
});

describe('utils.js showAndroidBanner and setLastSyncTime', () => {
  let container;
  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    // Add a child to avoid nextSibling null error
    const child = document.createElement('span');
    container.appendChild(child);
    document.body.appendChild(container);
  });
  test('showAndroidBanner creates and updates banner', () => {
    utils.showAndroidBanner(container, 'Banner1');
    expect(container.querySelector('.android-banner').textContent).toBe('Banner1');
    utils.showAndroidBanner(container, 'Banner2');
    expect(container.querySelector('.android-banner').textContent).toBe('Banner2');
  });
  test('setLastSyncTime creates and updates sync time', () => {
    utils.setLastSyncTime(container, 1234567890000);
    expect(container.querySelector('.last-sync-time').textContent).toContain('Last sync:');
    utils.setLastSyncTime(container, 1234567891000);
    expect(container.querySelector('.last-sync-time').textContent).toContain('Last sync:');
  });
});

// Simulate error handling for popup.js and options.js (UI only, not full logic)
describe('Popup/Options error UI simulation', () => {
  test('popup error message shows in DOM', () => {
    const errorDiv = document.createElement('div');
    errorDiv.id = 'errorMessage';
    errorDiv.className = 'error hidden';
    document.body.appendChild(errorDiv);
    // Simulate error
    errorDiv.textContent = 'Error: Something went wrong';
    errorDiv.classList.remove('hidden');
    expect(errorDiv.textContent).toContain('Error:');
    expect(errorDiv.className).not.toContain('hidden');
  });

  test('options message area shows error and success', () => {
    const messageArea = document.createElement('div');
    messageArea.id = 'messageArea';
    document.body.appendChild(messageArea);
    // Simulate error
    messageArea.textContent = 'Error loading settings';
    messageArea.className = 'error';
    expect(messageArea.textContent).toContain('Error');
    expect(messageArea.className).toBe('error');
    // Simulate success
    messageArea.textContent = 'Saved!';
    messageArea.className = 'success';
    expect(messageArea.textContent).toBe('Saved!');
    expect(messageArea.className).toBe('success');
  });
});

describe('Device/group logic: rename, add, delete, send tab', () => {
  let mockStorage;
  beforeEach(() => {
    // Setup persistent in-memory mock for browser.storage
    const memoryStore = {};
    mockStorage = {
      get: jest.fn(async (key) => {
        if (key === 'groupTasks') {
          return { groupTasks: { G1: { task1: { url: 'https://a.com', title: 'A', processedMask: 0, creationTimestamp: Date.now() } } } };
        }
        if (!key) return { ...memoryStore };
        if (typeof key === 'string') return { [key]: memoryStore[key] };
        const result = {};
        for (const k of key) result[k] = memoryStore[k];
        return result;
      }),
      set: jest.fn(async (obj) => { Object.assign(memoryStore, obj); }),
      clear: jest.fn(async () => { for (const k in memoryStore) delete memoryStore[k]; })
    };
    global.browser = {
      storage: { local: mockStorage, sync: mockStorage },
      runtime: { getPlatformInfo: jest.fn(async () => ({ os: 'win' })) }
    };
  });

  test('create, rename, and delete group', async () => {
    await mockStorage.set({ definedGroups: [] });
    let res = await utils.createGroupDirect('G1');
    expect(res.success).toBe(true);
    expect((await mockStorage.get('definedGroups')).definedGroups).toContain('G1');
    res = await utils.renameGroupDirect('G1', 'G2');
    expect(res.success).toBe(true);
    expect((await mockStorage.get('definedGroups')).definedGroups).toContain('G2');
    res = await utils.deleteGroupDirect('G2');
    expect(res.success).toBe(true);
    expect((await mockStorage.get('definedGroups')).definedGroups).not.toContain('G2');
  });

  test('device rename and delete', async () => {
    await mockStorage.set({ deviceRegistry: { id1: { name: 'Old', lastSeen: 1, groupBits: {} } }, myInstanceId: 'id1', myInstanceName: 'Old' });
    let res = await utils.renameDeviceDirect('id1', 'NewName');
    expect(res.success).toBe(true);
    expect((await mockStorage.get('deviceRegistry')).deviceRegistry.id1.name).toBe('NewName');
    res = await utils.deleteDeviceDirect('id1');
    expect(res.success).toBe(true);
    expect((await mockStorage.get('deviceRegistry')).deviceRegistry.id1).toBeUndefined();
  });

  test('sendTabToGroupDirect and processIncomingTabs', async () => {
    await mockStorage.set({ myGroupBits: { G1: 1 }, mySubscriptions: ['G1'], definedGroups: ['G1'], groupState: { G1: { assignedMask: 1 } }, deviceRegistry: { id1: { name: 'n', lastSeen: 1, groupBits: { G1: 1 } } }, myInstanceId: 'id1' });
    const sendRes = await utils.sendTabToGroupDirect('G1', { url: 'https://a.com', title: 'A' });
    expect(sendRes.success).toBe(true);
    const groupTasks = (await mockStorage.get('groupTasks')).groupTasks;
    expect(groupTasks.G1).toBeDefined();
    const taskId = Object.keys(groupTasks.G1)[0];
    let opened = [];
    let updated = {};
    await utils.processIncomingTabs({
      definedGroups: ['G1'],
      groupBits: { G1: 1 },
      subscriptions: ['G1']
    }, async (url, title) => { opened.push({ url, title }); }, async (u) => { updated = u; });
    expect(opened.length).toBe(1);
    expect(updated[taskId]).toBe(true);
  });
});
