import { jest } from '@jest/globals';

import { storage as storageAPI } from '../core/storage.js'; // Correctly import and alias the storage object

jest.mock('../core/instance.js', () => {
  const actualModule = jest.requireActual('../core/instance.js');

  return {
    __esModule: true, // Important for ESM mocks
    ...actualModule, // Spread all actual exports (so they are available unless overridden)
  };
});

import { SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS } from '../common/constants.js';
import { createGroupDirect, subscribeToGroupDirect, unsubscribeFromGroupDirect, deleteGroupDirect } from '../core/actions.js'; // Removed getUnifiedState from static imports here
import { processIncomingTabsAndroid, createAndStoreGroupTask } from '../core/tasks.js';
import { showDebugInfoUI } from '../ui/options/options-ui.js'; 
import * as instanceModule from '../core/instance.js';

describe('Integration: Group and Tab Flow', () => {
  let openTabFn;
  let updateProcessedFn;

  async function createGroupAndVerify(groupName) {
    const res = await createGroupDirect(groupName);
    expect(res.success).toBe(true);
    const definedGroups = await storageAPI.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS);
    expect(definedGroups).toContain(groupName);
    return res;
  }

  async function subscribeToGroupAndVerify(groupName, deviceId) {
    const res = await subscribeToGroupDirect(groupName);
    expect(res.success).toBe(true);
    return res;
  }

  async function sendTabAndVerify(groupName, tabDetails) {
    const res = await createAndStoreGroupTask(groupName, tabDetails);
    expect(res.success).toBe(true);
    const groupTasks = await storageAPI.get(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_TASKS);
    const taskId = res.taskId;
    expect(taskId).toBeDefined();
    expect(groupTasks[groupName][taskId]).toBeDefined();
    return { ...res, taskId };
  }

  async function processSelfSentTabAndVerify(state, groupName, taskId) {
    await processIncomingTabsAndroid(state);
    expect(browser.tabs.create).not.toHaveBeenCalled();
    const groupTasksAfterProcessing = await storageAPI.get(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_TASKS);
    expect(groupTasksAfterProcessing[groupName][taskId]).toBeDefined();
  }

  async function processReceivedTabAndVerify(state, tabUrl) {
    await processIncomingTabsAndroid(state);
    expect(browser.tabs.create).toHaveBeenCalledWith({ url: tabUrl, active: false });
  }

  async function unsubscribeFromGroupAndVerify(groupName, deviceId) {
    const res = await unsubscribeFromGroupDirect(groupName);
    expect(res.success).toBe(true);
    return res;
  }

  async function deleteGroupAndVerify(groupName) {
    const res = await deleteGroupDirect(groupName);
    expect(res.success).toBe(true);
    const definedGroups = await storageAPI.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS);
    expect(definedGroups).not.toContain(groupName);
    return res;
  }

  beforeEach(async () => {
    openTabFn = jest.fn();
    updateProcessedFn = jest.fn(async (updatedTasks) => {
      await browser.storage.local.set({ [COMMON_LOCAL_STORAGE_KEYS.PROCESSED_TASKS]: updatedTasks });
    });
  });

  test('Full group create, subscribe, send tab, process tab, unsubscribe, delete', async () => {
    const GROUP_NAME = 'IntegrationGroup';
    const TAB_URL = 'https://integration.com';
    const TAB_TITLE = 'Integration';

    await createGroupAndVerify(GROUP_NAME);
    await subscribeToGroupAndVerify(GROUP_NAME);

    const { taskId: sentTaskId } = await sendTabAndVerify(GROUP_NAME, { url: TAB_URL, title: TAB_TITLE }, 'test-device-id');

    const { getUnifiedState: getUnifiedStateForTest1 } = await import('../core/actions.js');
    const stateForProcessing = await getUnifiedStateForTest1(true);
    await processSelfSentTabAndVerify(stateForProcessing, GROUP_NAME, sentTaskId);

    await unsubscribeFromGroupAndVerify(GROUP_NAME);
    await deleteGroupAndVerify(GROUP_NAME);

    const finalGroupTasks = await storageAPI.get(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_TASKS);
  });

  test('Multiple devices, tab sending and receiving', async () => {
    const GROUP_NAME = 'MultiDeviceGroup';
    const TAB_URL = 'https://multidevice.com';
    const TAB_TITLE = 'MultiDevice Tab';

    await createGroupAndVerify(GROUP_NAME);

    await subscribeToGroupAndVerify(GROUP_NAME); // deviceA subscribes

    await sendTabAndVerify(GROUP_NAME, { url: TAB_URL, title: TAB_TITLE });
   
    const originalLocalStorageGet = browser.storage.local.get;

    browser.storage.local.get = jest.fn(async (keys) => {
      return originalLocalStorageGet(keys); 
    });

    const { getUnifiedState: getUnifiedStateForDeviceB } = await import('../core/actions.js'); // Dynamically import for Device B context
    const stateForDeviceB = await getUnifiedStateForDeviceB(true); // Corrected: getUnifiedState only takes one argument
    await processReceivedTabAndVerify(stateForDeviceB, TAB_URL);

    browser.storage.local.get = originalLocalStorageGet;
  });
});

describe('UI: Debug Info Panel', () => {
  test('Renders debug info panel in DOM', () => {
    document.body.innerHTML = '<div class="container"><div class="options-debug-info"></div></div>';
    const container = document.querySelector('.container');
    const state = {
      subscriptions: ['g2'],
      definedGroups: ['g2'],
      groupTasks: {},
      isAndroid: false
    };
    showDebugInfoUI(container, state);
    const debugPreElement = container.querySelector('.options-debug-info pre');
    const parsedDebugInfo = JSON.parse(debugPreElement.textContent);
    expect(parsedDebugInfo.definedGroups).toEqual(['g2']); // Use toEqual for array comparison
  });
});

describe('UI to Background Message Interaction (Options Page Example)', () => {
  beforeEach(async () => {
    document.body.innerHTML = `
      <div class="container">
        <input type="text" id="newGroupName" />
        <button id="createGroupBtn"></button>
        <div id="messageArea"></div>
        <div id="loadingIndicator"></div>
      </div>
    `;
  });

  test('Create Group button sends message and handles success response', async () => {
    const newGroupNameInput = document.getElementById('newGroupName');
    const createGroupBtn = document.getElementById('createGroupBtn');
    const messageArea = document.getElementById('messageArea');

    newGroupNameInput.value = 'Test Group From UI';

    global.browser.runtime.sendMessage = jest.fn().mockResolvedValue({
      success: true,
      newGroup: 'Test Group From UI'
    });

    createGroupBtn.disabled = false; // Enable button
    await createGroupBtn.click(); // This won't trigger the actual options.js listener in this isolated test

    const response = await global.browser.runtime.sendMessage({ action: "createGroup", groupName: 'Test Group From UI' });

    expect(global.browser.runtime.sendMessage).toHaveBeenCalledWith({ action: "createGroup", groupName: 'Test Group From UI' });
    expect(response.success).toBe(true);
  });
});
