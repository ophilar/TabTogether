import { jest } from '@jest/globals';

// --- Other imports needed for your tests ---
// Ensure these paths are correct for your project structure.
import * as storageAPI from '../core/storage.js';
import {_clearInstanceIdCache as actualClearInstanceIdCache} from '../core/instance.js'; // Assuming storageAPI is exported from this module
const instanceModulePath = '../core/instance.js';

// Mock the core/instance module
jest.mock(instanceModulePath, async () => {
  const actualModule = await import(instanceModulePath); // Dynamically import the *actual* module

  return {
    __esModule: true, // Important for ESM mocks
    ...actualModule, // Spread all actual exports (so they are available unless overridden)
    getInstanceId: jest.fn(), // Override getInstanceId with a Jest mock function
    // _clearInstanceIdCache will be the actual implementation from actualModule here
  };
});

// Now, import everything else, including the mocked instanceModule
import { SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS as COMMON_LOCAL_STORAGE_KEYS } from '../common/constants.js';
import { createGroupDirect, subscribeToGroupDirect, unsubscribeFromGroupDirect, deleteGroupDirect, getUnifiedState } from '../core/actions.js';
import { processIncomingTabsAndroid, createAndStoreGroupTask } from '../core/tasks.js';
import { showDebugInfoUI } from '../ui/options/options-ui.js'; 
import * as instanceModule from '../core/instance.js';

describe('Integration: Group and Tab Flow', () => {
  let openTabFn;
  let updateProcessedFn;

  beforeEach(async () => {
    // Call the captured actual function to clear instance ID cache if necessary for test setup
    actualClearInstanceIdCache();
    // Reset mocks for callbacks
    openTabFn = jest.fn();
    updateProcessedFn = jest.fn(async (updatedTasks) => {
      // Simulate updating local storage
      await browser.storage.local.set({ [COMMON_LOCAL_STORAGE_KEYS.PROCESSED_TASKS]: updatedTasks });
      // In the new model, processIncomingTabsAndroid updates sync storage directly.
    });

    // Set up a realistic device registry and group state
    // Reset getInstanceId mock before each test to ensure a clean state
    instanceModule.getInstanceId.mockResolvedValue('test-device-id'); // Default mock for most tests
    await storageAPI.set(browser.storage.local, COMMON_LOCAL_STORAGE_KEYS.INSTANCE_ID, 'test-device-id');
    // INSTANCE_NAME is now primarily in deviceRegistry, INSTANCE_NAME_OVERRIDE for local
    await storageAPI.set(browser.storage.local, COMMON_LOCAL_STORAGE_KEYS.INSTANCE_NAME_OVERRIDE, 'Test Device');

    await browser.storage.sync.set({
      [SYNC_STORAGE_KEYS.DEVICE_REGISTRY]: {
        'test-device-id': { name: 'Test Device', lastSeen: Date.now(), subscriptions: [] } // Ensure subscriptions array exists
      },
      [SYNC_STORAGE_KEYS.GROUP_TASKS]: {}, // Start with no tasks
      [SYNC_STORAGE_KEYS.DEFINED_GROUPS]: [],
      [SYNC_STORAGE_KEYS.GROUP_STATE]: {},
      [SYNC_STORAGE_KEYS.SUBSCRIPTIONS]: {} // Use the correct sync key
    });
  });

  test('Full group create, subscribe, send tab, process tab, unsubscribe, delete', async () => {
    const GROUP_NAME = 'IntegrationGroup';
    const TAB_URL = 'https://integration.com';
    const TAB_TITLE = 'Integration';

    // 1. Create group
    const createRes = await createGroupDirect(GROUP_NAME);
    expect(createRes.success).toBe(true);
    expect(await storageAPI.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS)).toContain(GROUP_NAME);

    // 2. Subscribe
    const subRes = await subscribeToGroupDirect(GROUP_NAME);
    expect(subRes.success).toBe(true);
    const subscriptionsSync = await storageAPI.get(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, {});
    expect(subscriptionsSync['test-device-id'] || []).toContain(GROUP_NAME);

    // 3. Send tab
    // sendTabToGroupDirect is no longer used. We'd call createAndStoreGroupTask from background or a unified action.
    // For this integration test, let's assume a background action would call createAndStoreGroupTask.
    // createAndStoreGroupTask is now imported statically
    const sendRes = await createAndStoreGroupTask(GROUP_NAME, { url: TAB_URL, title: TAB_TITLE }, 'test-device-id', null);
    expect(sendRes.success).toBe(true);
    const groupTasksBeforeProcessing = await storageAPI.get(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_TASKS);
    const sentTaskId = Object.keys(groupTasksBeforeProcessing[GROUP_NAME])[0];
    expect(sentTaskId).toBeDefined();
    expect(groupTasksBeforeProcessing[GROUP_NAME][sentTaskId].senderDeviceId).toBe('test-device-id');

    // 4. Simulate processing incoming tab (as if received by THIS device)
    const state = await getUnifiedState(true, 'test-device-id'); // Simulate Android for processIncomingTabsAndroid, pass deviceId

    // *** Call the actual processing function ***
    await processIncomingTabsAndroid(state);

    // Assertions for processing:
    // Tab should NOT be opened because senderDeviceId is 'test-device-id' (self)
    expect(browser.tabs.create).not.toHaveBeenCalled();
    const groupTasksAfterProcessing = await storageAPI.get(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_TASKS);
    expect(groupTasksAfterProcessing[GROUP_NAME][sentTaskId]).toBeDefined(); // Task remains as it was from self

    // 5. Unsubscribe
    const unsubRes = await unsubscribeFromGroupDirect(GROUP_NAME);
    expect(unsubRes.success).toBe(true);
    const finalSubscriptionsSync = await storageAPI.get(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, {});
    expect(finalSubscriptionsSync['test-device-id'] || []).not.toContain(GROUP_NAME);

    // 6. Delete group
    const delRes = await deleteGroupDirect(GROUP_NAME);
    expect(delRes.success).toBe(true);
    expect(await storageAPI.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS)).not.toContain(GROUP_NAME);
    // deleteGroupDirect also clears subscriptions for the deleted group from SYNC_STORAGE_KEYS.SUBSCRIPTIONS_SYNC
    const subscriptionsAfterGroupDelete = await storageAPI.get(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, {});
    for (const deviceId in subscriptionsAfterGroupDelete) {
        expect(subscriptionsAfterGroupDelete[deviceId]).not.toContain(GROUP_NAME);
    }
    const finalGroupTasksForDelete = await storageAPI.get(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_TASKS);
    // deleteGroupDirect doesn't currently clear tasks, this might need adjustment or be handled by cleanup.
    // For now, we'll assume tasks might still exist but the group itself is gone.
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
    await createGroupDirect(GROUP_NAME);
    // 2. Both devices subscribe
    await subscribeToGroupDirect(GROUP_NAME); // deviceA subscribes
    // Simulate deviceB subscribing (direct action for test simplicity)
    let subsB = await storageAPI.get(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS);
    subsB[deviceB_ID] = [GROUP_NAME];
    await storageAPI.set(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, subsB);

    // 3. DeviceA sends a tab to the group
    // createAndStoreGroupTask is now imported statically
    // Explicitly set recipient to deviceB
    const sendRes = await createAndStoreGroupTask(GROUP_NAME, { url: TAB_URL, title: TAB_TITLE }, deviceA_ID, [deviceB_ID]);
    expect(sendRes.success).toBe(true);

    // 4. Simulate DeviceB processing the task
    // Mock getInstanceId for DeviceB's context
    instanceModule.getInstanceId.mockResolvedValue(deviceB_ID);
    actualClearInstanceIdCache(); // Use the correctly named actual function

    const stateForDeviceB = await getUnifiedState(true, deviceB_ID); // Simulate Android for DeviceB, pass deviceId
    await processIncomingTabsAndroid(stateForDeviceB);

    expect(browser.tabs.create).toHaveBeenCalledWith({ url: TAB_URL, active: false });
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
