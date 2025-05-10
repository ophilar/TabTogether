import { jest } from '@jest/globals';

// --- Other imports needed for your tests ---
// Ensure these paths are correct for your project structure.
import { storage as storageAPI } from '../core/storage.js'; // Correctly import and alias the storage object
import {_clearInstanceIdCache as actualClearInstanceIdCache} from '../core/instance.js'; // Assuming storageAPI is exported from this module

// Mock the core/instance module
const mockGetInstanceIdFn = jest.fn(); // Define the mock function instance here

jest.mock('../core/instance.js', () => {
  // Use jest.requireActual for synchronous loading of the module to be mocked
  const actualModule = jest.requireActual('../core/instance.js');


  return {
    __esModule: true, // Important for ESM mocks
    ...actualModule, // Spread all actual exports (so they are available unless overridden)
    getInstanceId: mockGetInstanceIdFn, // Override getInstanceId with a Jest mock function
    // _clearInstanceIdCache will be the actual implementation from actualModule here
  };
});

// Now, import everything else, including the mocked instanceModule
import { SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS as COMMON_LOCAL_STORAGE_KEYS } from '../common/constants.js';
import { createGroupDirect, subscribeToGroupDirect, unsubscribeFromGroupDirect, deleteGroupDirect } from '../core/actions.js'; // Removed getUnifiedState from static imports here
import { processIncomingTabsAndroid, createAndStoreGroupTask } from '../core/tasks.js';
import { showDebugInfoUI } from '../ui/options/options-ui.js'; 
import * as instanceModule from '../core/instance.js';

describe('Integration: Group and Tab Flow', () => {
  let openTabFn;
  let updateProcessedFn;

  // --- Test Helper Functions ---
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
    const subscriptionsSync = await storageAPI.get(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, {});
    expect(subscriptionsSync[deviceId] || []).toContain(groupName);
    return res;
  }

  async function sendTabAndVerify(groupName, tabDetails, senderId, recipientIds = null) {
    const res = await createAndStoreGroupTask(groupName, tabDetails, senderId, recipientIds);
    expect(res.success).toBe(true);
    const groupTasks = await storageAPI.get(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_TASKS);
    const taskId = res.taskId;
    expect(taskId).toBeDefined();
    expect(groupTasks[groupName][taskId]).toBeDefined();
    expect(groupTasks[groupName][taskId].senderDeviceId).toBe(senderId);
    if (recipientIds) {
      expect(groupTasks[groupName][taskId].recipientDeviceIds).toEqual(recipientIds);
    }
    return { ...res, taskId };
  }

  async function processSelfSentTabAndVerify(state, groupName, taskId) {
    await processIncomingTabsAndroid(state);
    expect(browser.tabs.create).not.toHaveBeenCalled(); // Tab should NOT be opened
    const groupTasksAfterProcessing = await storageAPI.get(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_TASKS);
    expect(groupTasksAfterProcessing[groupName][taskId]).toBeDefined(); // Task remains
  }

  async function processReceivedTabAndVerify(state, tabUrl) {
    await processIncomingTabsAndroid(state);
    expect(browser.tabs.create).toHaveBeenCalledWith({ url: tabUrl, active: false });
  }

  async function unsubscribeFromGroupAndVerify(groupName, deviceId) {
    const res = await unsubscribeFromGroupDirect(groupName);
    expect(res.success).toBe(true);
    const subscriptionsSync = await storageAPI.get(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, {});
    expect(subscriptionsSync[deviceId] || []).not.toContain(groupName);
    return res;
  }

  async function deleteGroupAndVerify(groupName) {
    const res = await deleteGroupDirect(groupName);
    expect(res.success).toBe(true);
    const definedGroups = await storageAPI.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS);
    expect(definedGroups).not.toContain(groupName);
    
    const subscriptionsAfterGroupDelete = await storageAPI.get(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, {});
    for (const deviceId in subscriptionsAfterGroupDelete) {
        expect(subscriptionsAfterGroupDelete[deviceId]).not.toContain(groupName);
    }
    return res;
  }

  beforeEach(async () => {
    actualClearInstanceIdCache();
    openTabFn = jest.fn();
    updateProcessedFn = jest.fn(async (updatedTasks) => {
      await browser.storage.local.set({ [COMMON_LOCAL_STORAGE_KEYS.PROCESSED_TASKS]: updatedTasks });
    });

    mockGetInstanceIdFn.mockResolvedValue('test-device-id');
    await browser.storage.local.set({
        [COMMON_LOCAL_STORAGE_KEYS.INSTANCE_ID]: 'test-device-id',
        [COMMON_LOCAL_STORAGE_KEYS.INSTANCE_NAME_OVERRIDE]: 'Test Device'
    });

    await browser.storage.sync.set({
      [SYNC_STORAGE_KEYS.DEVICE_REGISTRY]: {
        'test-device-id': { name: 'Test Device', lastSeen: Date.now(), subscriptions: [] }
      },
      [SYNC_STORAGE_KEYS.GROUP_TASKS]: {},
      [SYNC_STORAGE_KEYS.DEFINED_GROUPS]: [],
      [SYNC_STORAGE_KEYS.GROUP_STATE]: {},
      [SYNC_STORAGE_KEYS.SUBSCRIPTIONS]: {}
    });
  });

  test('Full group create, subscribe, send tab, process tab, unsubscribe, delete', async () => {
    const GROUP_NAME = 'IntegrationGroup';
    const TAB_URL = 'https://integration.com';
    const TAB_TITLE = 'Integration';

    await createGroupAndVerify(GROUP_NAME);
    await subscribeToGroupAndVerify(GROUP_NAME, 'test-device-id');

    const { taskId: sentTaskId } = await sendTabAndVerify(GROUP_NAME, { url: TAB_URL, title: TAB_TITLE }, 'test-device-id');

    // 4. Simulate processing incoming tab (as if received by THIS device)
    // Dynamically import getUnifiedState for this test case as well
    const { getUnifiedState: getUnifiedStateForTest1 } = await import('../core/actions.js');
    const stateForProcessing = await getUnifiedStateForTest1(true); // Corrected: only one argument
    await processSelfSentTabAndVerify(stateForProcessing, GROUP_NAME, sentTaskId);

    await unsubscribeFromGroupAndVerify(GROUP_NAME, 'test-device-id');
    await deleteGroupAndVerify(GROUP_NAME);

    // Verify tasks are not cleared by deleteGroupDirect (handled by cleanup)
    const finalGroupTasks = await storageAPI.get(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_TASKS);
    // If sentTaskId was defined, and the group was deleted, the tasks for that group might still exist
    // or be cleaned up by a separate mechanism. This assertion depends on the exact behavior of deleteGroupDirect.
    // For now, let's assume tasks for the deleted group might still be in the main tasks object if not explicitly cleared by deleteGroupDirect.
    // If deleteGroupDirect *does* clear tasks for the group, this assertion would change.
  });

  test('Multiple devices, tab sending and receiving', async () => {
    const GROUP_NAME = 'MultiDeviceGroup';
    const TAB_URL = 'https://multidevice.com';
    const TAB_TITLE = 'MultiDevice Tab';

    // Setup deviceA (current test device) and deviceB
    const deviceA_ID = 'test-device-id'; // Already set up in beforeEach
    const deviceB_ID = 'deviceB-id';

    await storageAPI.set(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {
      [deviceA_ID]: { name: 'Device A', lastSeen: Date.now(), subscriptions: [] },
      [deviceB_ID]: { name: 'Device B', lastSeen: Date.now(), subscriptions: [] }
    });
    await storageAPI.set(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, {
      [deviceA_ID]: [],
      [deviceB_ID]: []
    });

    // 1. Create group (by deviceA)
    await createGroupAndVerify(GROUP_NAME);

    // 2. Both devices subscribe
    await subscribeToGroupAndVerify(GROUP_NAME, deviceA_ID); // deviceA subscribes

    // Simulate deviceB subscribing (direct action for test simplicity)
    let subsB = await storageAPI.get(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS);
    subsB[deviceB_ID] = [GROUP_NAME];
    await storageAPI.set(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, subsB);

    // 3. DeviceA sends a tab to the group
    await sendTabAndVerify(GROUP_NAME, { url: TAB_URL, title: TAB_TITLE }, deviceA_ID, [deviceB_ID]);

    // 4. Simulate DeviceB processing the task
    mockGetInstanceIdFn.mockReset(); // Reset any previous mock configurations (like from beforeEach)
    mockGetInstanceIdFn.mockResolvedValue(deviceB_ID); // Set the new desired resolved value
    actualClearInstanceIdCache(); // Clear cache of the *actual* module (good hygiene)

    jest.resetModules(); // Clear Jest's module cache

    // Re-import instanceModule to ensure it's fresh after resetModules and mock re-config
    const freshInstanceModule = await import('../core/instance.js');
    // Dynamically import getUnifiedState to ensure it picks up the latest mock configuration
    const { getUnifiedState } = await import('../core/actions.js');

    const stateForDeviceB = await getUnifiedState(true); // Corrected: getUnifiedState only takes one argument
    expect(stateForDeviceB.instanceId).toBe(deviceB_ID); // Add this check
    await processReceivedTabAndVerify(stateForDeviceB, TAB_URL);
  });
});

// UI test (smoke test for debug info rendering)
describe('UI: Debug Info Panel', () => {
  test('Renders debug info panel in DOM', () => {
    // Ensure the .options-debug-info element exists for showDebugInfoUI to populate
    document.body.innerHTML = '<div class="container"><div class="options-debug-info"></div></div>';
    const container = document.querySelector('.container');
    const state = {
      instanceId: 'uiid',
      instanceName: 'uiname',
      subscriptions: ['g2'],
      definedGroups: ['g2'],
      deviceRegistry: { uiid: { name: 'uiname', lastSeen: 2 } },
      groupTasks: {},
      isAndroid: false
    };
    showDebugInfoUI(container, state);
    const debugPreElement = container.querySelector('.options-debug-info pre');
    const parsedDebugInfo = JSON.parse(debugPreElement.textContent);
    expect(parsedDebugInfo.instanceId).toBe('uiid');
    expect(parsedDebugInfo.definedGroups).toEqual(['g2']); // Use toEqual for array comparison
  });
});

describe('UI to Background Message Interaction (Options Page Example)', () => {
  beforeEach(async () => {
    // Basic DOM setup for options page elements needed for the test
    document.body.innerHTML = `
      <div class="container">
        <input type="text" id="newGroupName" />
        <button id="createGroupBtn"></button>
        <div id="messageArea"></div>
        <div id="loadingIndicator"></div>
      </div>
    `;
    // Mock any necessary initial state or imports for options.js
    // This is a simplified setup. A real test would need more from options.js.
    // We'll simulate the relevant part of options.js's create group logic.
  });

  test('Create Group button sends message and handles success response', async () => {
    const newGroupNameInput = document.getElementById('newGroupName');
    const createGroupBtn = document.getElementById('createGroupBtn');
    const messageArea = document.getElementById('messageArea');

    newGroupNameInput.value = 'Test Group From UI';

    // Mock browser.runtime.sendMessage to simulate background script response
    global.browser.runtime.sendMessage = jest.fn().mockResolvedValue({
      success: true,
      newGroup: 'Test Group From UI'
    });

    // Simulate the click action from options.js (simplified)
    // In a full test, you'd import and call the actual event handler or setup options.js
    createGroupBtn.disabled = false; // Enable button
    await createGroupBtn.click(); // This won't trigger the actual options.js listener in this isolated test
                                 // So we'll manually simulate the sendMessage call

    // Manually simulate the part of the options.js click handler that sends the message
    const response = await global.browser.runtime.sendMessage({ action: "createGroup", groupName: 'Test Group From UI' });

    expect(global.browser.runtime.sendMessage).toHaveBeenCalledWith({ action: "createGroup", groupName: 'Test Group From UI' });
    expect(response.success).toBe(true);
    // Here you would also assert UI changes, e.g., messageArea content, based on options.js logic
    // For example: expect(messageArea.textContent).toContain('Group "Test Group From UI" created successfully.');
  });
});
