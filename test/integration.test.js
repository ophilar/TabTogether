import { jest } from '@jest/globals';

import * as utils from '../utils.js';
import { SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS } from '../utils.js'; // Import keys

describe('Integration: Group and Tab Flow', () => {
  let openTabFn;
  let updateProcessedFn;

  beforeEach(async () => {
    // Reset mocks for callbacks
    openTabFn = jest.fn();
    updateProcessedFn = jest.fn(async (updatedTasks) => {
      // Simulate updating local storage
      await browser.storage.local.set({ [LOCAL_STORAGE_KEYS.PROCESSED_TASKS]: updatedTasks });
    });

    // Set up a realistic device registry and group state
    await browser.storage.local.set({
      [LOCAL_STORAGE_KEYS.INSTANCE_ID]: 'test-device-id',
      [LOCAL_STORAGE_KEYS.INSTANCE_NAME]: 'Test Device',
      [LOCAL_STORAGE_KEYS.PROCESSED_TASKS]: {} // Start with no processed tasks
    });
    await browser.storage.sync.set({
      [SYNC_STORAGE_KEYS.DEVICE_REGISTRY]: {
        'test-device-id': { name: 'Test Device', lastSeen: Date.now(), groupBits: {} }
      },
      [SYNC_STORAGE_KEYS.GROUP_TASKS]: {}, // Start with no tasks
      [SYNC_STORAGE_KEYS.DEFINED_GROUPS]: [],
      [SYNC_STORAGE_KEYS.GROUP_STATE]: {}
    });
  });

  test('Full group create, subscribe, send tab, process tab, unsubscribe, delete', async () => {
    const GROUP_NAME = 'IntegrationGroup';
    const TAB_URL = 'https://integration.com';
    const TAB_TITLE = 'Integration';

    // 1. Create group
    const createRes = await utils.createGroupDirect(GROUP_NAME);
    expect(createRes.success).toBe(true);
    expect((await browser.storage.sync.get(SYNC_STORAGE_KEYS.DEFINED_GROUPS))[SYNC_STORAGE_KEYS.DEFINED_GROUPS]).toContain(GROUP_NAME);
    expect((await browser.storage.sync.get(SYNC_STORAGE_KEYS.GROUP_STATE))[SYNC_STORAGE_KEYS.GROUP_STATE][GROUP_NAME]).toBeDefined();
    
    // 2. Subscribe
    const subRes = await utils.subscribeToGroupDirect(GROUP_NAME);
    expect(subRes.success).toBe(true);
    const myBit = subRes.assignedBit; // Get the assigned bit for later checks
    expect(myBit).toBeGreaterThan(0);
    expect((await browser.storage.local.get(LOCAL_STORAGE_KEYS.SUBSCRIPTIONS))[LOCAL_STORAGE_KEYS.SUBSCRIPTIONS]).toContain(GROUP_NAME);
    expect((await browser.storage.local.get(LOCAL_STORAGE_KEYS.GROUP_BITS))[LOCAL_STORAGE_KEYS.GROUP_BITS][GROUP_NAME]).toBe(myBit);

    // 3. Send tab
    const sendRes = await utils.sendTabToGroupDirect(GROUP_NAME, { url: TAB_URL, title: TAB_TITLE });
    expect(sendRes.success).toBe(true);
    const groupTasksBeforeProcessing = await browser.storage.sync.get(SYNC_STORAGE_KEYS.GROUP_TASKS);
    const sentTaskId = Object.keys(groupTasksBeforeProcessing[SYNC_STORAGE_KEYS.GROUP_TASKS][GROUP_NAME])[0];
    expect(sentTaskId).toBeDefined();
    // Verify sender's bit is set initially
    expect(groupTasksBeforeProcessing[SYNC_STORAGE_KEYS.GROUP_TASKS][GROUP_NAME][sentTaskId].processedMask).toBe(myBit);


    // 4. Simulate processing incoming tab (as if received by THIS device)
    //    Fetch the current state needed by processIncomingTabs
    const state = await utils.getUnifiedState(false); // Assuming desktop for test simplicity

    // *** Call the actual processing function ***
    await utils.processIncomingTabs(state, openTabFn, updateProcessedFn);

    // Assertions for processing:
    // - Tab should NOT be opened because the sender bit (myBit) is already set in processedMask
    expect(openTabFn).not.toHaveBeenCalled();
    // - Local processed tasks should NOT be updated because the mask already indicated processing by self
    expect(updateProcessedFn).not.toHaveBeenCalled();
    // - Sync storage mask should remain unchanged (still just myBit)
    const groupTasksAfterProcessing = await browser.storage.sync.get(SYNC_STORAGE_KEYS.GROUP_TASKS);
    expect(groupTasksAfterProcessing[SYNC_STORAGE_KEYS.GROUP_TASKS][GROUP_NAME][sentTaskId].processedMask).toBe(myBit);
    
    // 5. Unsubscribe
    const unsubRes = await utils.unsubscribeFromGroupDirect(GROUP_NAME);
    expect(unsubRes.success).toBe(true);
    expect((await browser.storage.local.get(LOCAL_STORAGE_KEYS.SUBSCRIPTIONS))[LOCAL_STORAGE_KEYS.SUBSCRIPTIONS]).not.toContain(GROUP_NAME);
    expect((await browser.storage.local.get(LOCAL_STORAGE_KEYS.GROUP_BITS))[LOCAL_STORAGE_KEYS.GROUP_BITS][GROUP_NAME]).toBeUndefined();
    // Check sync state reflects unsubscription
    expect((await browser.storage.sync.get(SYNC_STORAGE_KEYS.GROUP_STATE))[SYNC_STORAGE_KEYS.GROUP_STATE][GROUP_NAME].assignedMask & myBit).toBe(0);

    // 6. Delete group
    const delRes = await utils.deleteGroupDirect(GROUP_NAME);
    expect(delRes.success).toBe(true);
    expect((await browser.storage.sync.get(SYNC_STORAGE_KEYS.DEFINED_GROUPS))[SYNC_STORAGE_KEYS.DEFINED_GROUPS]).not.toContain(GROUP_NAME);
    expect((await browser.storage.sync.get(SYNC_STORAGE_KEYS.GROUP_STATE))[SYNC_STORAGE_KEYS.GROUP_STATE][GROUP_NAME]).toBeUndefined();
    // Tasks for the group should also be gone (deleteGroupDirect handles this)
    expect((await browser.storage.sync.get(SYNC_STORAGE_KEYS.GROUP_TASKS))[SYNC_STORAGE_KEYS.GROUP_TASKS][GROUP_NAME]).toBeUndefined();
  });
});

// UI test (smoke test for debug info rendering)
describe('UI: Debug Info Panel', () => {
  test('Renders debug info panel in DOM', () => {
    document.body.innerHTML = '<div class="container"></div>';
    const container = document.querySelector('.container');
    const state = {
      instanceId: 'uiid',
      instanceName: 'uiname',
      subscriptions: ['g2'],
      groupBits: { g2: 2 },
      definedGroups: ['g2'],
      deviceRegistry: { uiid: { name: 'uiname', lastSeen: 2, groupBits: { g2: 2 } } },
      groupState: { g2: { assignedMask: 2, assignedCount: 1 } }
    };
    utils.showDebugInfo(container, state);
    expect(container.querySelector('.debug-info').innerHTML).toContain('Instance ID: uiid');
    expect(container.querySelector('.debug-info').innerHTML).toContain('Defined Groups:');
  });
});
