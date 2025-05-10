import { jest } from '@jest/globals';

import { SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS } from '../common/constants.js';
import { createGroupDirect, subscribeToGroupDirect, unsubscribeFromGroupDirect, deleteGroupDirect, getUnifiedState } from '../core/actions.js';
import { processIncomingTabsAndroid } from '../core/tasks.js';
import { _clearInstanceIdCache } from '../core/instance.js';
import { storage } from '../core/storage.js';
import { showDebugInfoUI } from '../ui/options/options-ui.js'; // Assuming this is where showDebugInfo moved


describe('Integration: Group and Tab Flow', () => {
  let openTabFn;
  let updateProcessedFn;

  beforeEach(async () => {
    _clearInstanceIdCache(); // Clear instance ID cache
    // Reset mocks for callbacks
    openTabFn = jest.fn();
    updateProcessedFn = jest.fn(async (updatedTasks) => {
      // Simulate updating local storage
      await browser.storage.local.set({ [LOCAL_STORAGE_KEYS.PROCESSED_TASKS]: updatedTasks });
      // In the new model, processIncomingTabsAndroid updates sync storage directly.
    });

    // Set up a realistic device registry and group state
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.INSTANCE_ID, 'test-device-id');
    // INSTANCE_NAME is now primarily in deviceRegistry, INSTANCE_NAME_OVERRIDE for local
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.INSTANCE_NAME_OVERRIDE, 'Test Device');

    await browser.storage.sync.set({
      [SYNC_STORAGE_KEYS.DEVICE_REGISTRY]: {
        'test-device-id': { name: 'Test Device', lastSeen: Date.now() } // No groupBits
      },
      [SYNC_STORAGE_KEYS.GROUP_TASKS]: {}, // Start with no tasks
      [SYNC_STORAGE_KEYS.DEFINED_GROUPS]: [],
      [SYNC_STORAGE_KEYS.GROUP_STATE]: {},
      [SYNC_STORAGE_KEYS.SUBSCRIPTIONS_SYNC]: {} // Use the new sync key
    });
  });

  test('Full group create, subscribe, send tab, process tab, unsubscribe, delete', async () => {
    const GROUP_NAME = 'IntegrationGroup';
    const TAB_URL = 'https://integration.com';
    const TAB_TITLE = 'Integration';

    // 1. Create group
    const createRes = await createGroupDirect(GROUP_NAME);
    expect(createRes.success).toBe(true);
    expect(await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS)).toContain(GROUP_NAME);

    // 2. Subscribe
    const subRes = await subscribeToGroupDirect(GROUP_NAME);
    expect(subRes.success).toBe(true);
    const subscriptionsSync = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS_SYNC);
    expect(subscriptionsSync['test-device-id']).toContain(GROUP_NAME);

    // 3. Send tab
    // sendTabToGroupDirect is no longer used. We'd call createAndStoreGroupTask from background or a unified action.
    // For this integration test, let's assume a background action would call createAndStoreGroupTask.
    // We'll simulate that part.
    const { createAndStoreGroupTask } = await import('../core/tasks.js'); // Assuming it's moved here
    const sendRes = await createAndStoreGroupTask(GROUP_NAME, { url: TAB_URL, title: TAB_TITLE }, 'test-device-id', null);
    expect(sendRes.success).toBe(true);
    const groupTasksBeforeProcessing = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_TASKS);
    const sentTaskId = Object.keys(groupTasksBeforeProcessing[GROUP_NAME])[0];
    expect(sentTaskId).toBeDefined();
    expect(groupTasksBeforeProcessing[GROUP_NAME][sentTaskId].senderDeviceId).toBe('test-device-id');

    // 4. Simulate processing incoming tab (as if received by THIS device)
    const state = await getUnifiedState(true); // Simulate Android for processIncomingTabsAndroid

    // *** Call the actual processing function ***
    await processIncomingTabsAndroid(state);

    // Assertions for processing:
    // Tab should NOT be opened because senderDeviceId is 'test-device-id' (self)
    expect(browser.tabs.create).not.toHaveBeenCalled();
    const groupTasksAfterProcessing = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_TASKS);
    expect(groupTasksAfterProcessing[GROUP_NAME][sentTaskId]).toBeDefined(); // Task remains as it was from self

    // 5. Unsubscribe
    const unsubRes = await unsubscribeFromGroupDirect(GROUP_NAME);
    expect(unsubRes.success).toBe(true);
    const finalSubscriptionsSync = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS_SYNC);
    expect(finalSubscriptionsSync['test-device-id']).not.toContain(GROUP_NAME);

    // 6. Delete group
    const delRes = await deleteGroupDirect(GROUP_NAME);
    expect(delRes.success).toBe(true);
    expect(await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS)).not.toContain(GROUP_NAME);
    // deleteGroupDirect also clears subscriptions for the deleted group from SYNC_STORAGE_KEYS.SUBSCRIPTIONS_SYNC
    const subscriptionsAfterGroupDelete = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS_SYNC);
    for (const deviceId in subscriptionsAfterGroupDelete) {
        expect(subscriptionsAfterGroupDelete[deviceId]).not.toContain(GROUP_NAME);
    }
    const finalGroupTasksForDelete = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_TASKS);
    // deleteGroupDirect doesn't currently clear tasks, this might need adjustment or be handled by cleanup.
    // For now, we'll assume tasks might still exist but the group itself is gone.
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
