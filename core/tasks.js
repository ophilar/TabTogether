// core/tasks.js

import { storage } from "./storage.js";
import { SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS } from "../common/constants.js";
import { getInstanceId } from "./instance.js";

/**
 * Processes incoming tabs for the current device, typically on Android or manual sync.
 * Opens tabs from tasks and then clears those tasks.
 * @param {object} currentState - The current application state, including groupTasks and subscriptions.
 * @returns {Promise<void>}
 */
export async function processIncomingTabsAndroid(currentState) {
  const localInstanceId = currentState.instanceId || await getInstanceId();
  const mySubscriptions = currentState.subscriptions || []; // Array of group names
  let allGroupTasks = currentState.groupTasks || await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_TASKS, {});
  let tasksProcessed = false;
  let localProcessedTasks = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.PROCESSED_TASKS, {});

  console.log(`Processing incoming tabs for device ${instanceId}, subscriptions: ${mySubscriptions.join(', ')}`);

  for (const groupName in groupTasks) {
    if (mySubscriptions.includes(groupName)) {
      const tasksInGroupObject = groupTasks[groupName]; // This is an object { taskId1: data1, ...}
      // const remainingTasksForGroup = {}; // Rebuild as an object // Not needed if we don't modify sync tasks here

      for (const taskId in tasksInGroupObject) {
        const task = tasksInGroupObject[taskId];

        // 1. Skip if sent by self
        if (task.senderDeviceId === localInstanceId) {
            continue;
        }

        // 2. Skip if already processed locally
        if (localProcessedTasks[taskId]) {
            continue;
        }

        // 3. Skip if recipients are specified and this device is not one of them
        if (task.recipientDeviceIds && Array.isArray(task.recipientDeviceIds) && task.recipientDeviceIds.length > 0) {
            if (!task.recipientDeviceIds.includes(localInstanceId)) {
                continue;
            }
        }
        // If no recipientDeviceIds, it's for all subscribed members of the group (excluding sender)

        // Open the tab
        try {
          console.log(`Android: Processing tab: ${task.url} for group ${groupName}, task ID: ${taskId}`);
          await global.browser.tabs.create({ url: task.url, active: false });
          localProcessedTasks[taskId] = Date.now(); // Mark as processed with timestamp
          tasksProcessed = true;
        } catch (e) {
          console.error(`Android: Failed to open tab ${task.url} (task ID: ${taskId}):`, e);
          // Do not mark as processed if opening failed
        }
      }
      // groupTasks[groupName] = remainingTasksForGroup; // Update tasks for the group // Not modifying sync tasks here
    }
  }

  if (tasksProcessed) {
    // Save the updated localProcessedTasks
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.PROCESSED_TASKS, localProcessedTasks);
    // Note: We are NOT modifying SYNC_STORAGE_KEYS.GROUP_TASKS here.
    // Task cleanup from sync storage is handled by performTimeBasedTaskCleanup.
    console.log("Android: Finished processing incoming tabs, updated local processed task list.");
  } else {
    console.log("Android: No new tabs to process for this device.");
  }
}

/**
 * Creates a new task and stores it in sync storage.
 * @param {string} groupName - The name of the group.
 * @param {object} tabData - Object containing tab URL and title.
 * @param {string} senderDeviceId - The ID of the sending device.
 * @param {string[]|null} [recipientDeviceIds=null] - Array of specific recipient device IDs. If null, task is for all in group (except sender).
 * @returns {Promise<{success: boolean, taskId: string|null}>}
 */
export async function createAndStoreGroupTask(groupName, tabData, senderDeviceId, recipientDeviceIds = null) {
  const taskId = globalThis.crypto?.randomUUID?.() || `mock-task-id-${Date.now()}`;
  // Fetch the full GROUP_TASKS object to merge into
  const allGroupTasks = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_TASKS, {});

  if (!allGroupTasks[groupName]) {
    allGroupTasks[groupName] = {};
  }

  const newTaskData = {
    url: tabData.url,
    title: tabData.title || tabData.url,
    senderDeviceId: senderDeviceId,
    creationTimestamp: Date.now(),
  };

  // Only add recipientDeviceIds if it's a non-empty array
  if (recipientDeviceIds && Array.isArray(recipientDeviceIds) && recipientDeviceIds.length > 0) {
    newTaskData.recipientDeviceIds = recipientDeviceIds;
  }

  allGroupTasks[groupName][taskId] = newTaskData;

  // Set the entire updated GROUP_TASKS object back.
  // storage.set is appropriate here as we're replacing the whole value for this key.
  // If concurrent writes to different tasks within GROUP_TASKS are a concern,
  // a mergeItem approach at the taskId level would be needed, but it complicates things.
  // Given task creation is relatively infrequent, direct set should be okay.
  const opSuccess = await storage.set(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_TASKS, allGroupTasks);

  if (!opSuccess) {
    console.error(`Failed to store task ${taskId} for group ${groupName}.`);
    return { success: false, taskId: null, message: "Failed to save task to sync storage." };
  }
  console.log(`Task ${taskId} created for group ${groupName}:`, newTaskData);
  return { success: true, taskId };
}
            continue;
        }

        // Open the tab
        try {
          console.log(`Processing tab: ${task.url} for group ${groupName}`);
          // In a test environment, browser.tabs.create might be a mock.
          // Ensure it's awaited if it returns a promise.
          await global.browser.tabs.create({ url: task.url, active: false });
          tasksProcessed = true;
          // If processed successfully, DO NOT add to remainingTasksForGroup
        } catch (e) {
          console.error(`Failed to open tab ${task.url}:`, e);
          remainingTasksForGroup[taskId] = task; // Keep task if opening failed
        }
      }
      groupTasks[groupName] = remainingTasksForGroup; // Update tasks for the group
    }
  }

  if (tasksProcessed) {
    await storage.set(browser.storage.sync, { [SYNC_STORAGE_KEYS.GROUP_TASKS]: groupTasks });
    console.log("Finished processing incoming tabs, updated tasks in storage.");
  } else {
    console.log("No new tabs to process for this device.");
  }
}

export async function createAndStoreGroupTask(groupName, tabData, senderDeviceId, recipientDeviceIds = null) {
  const taskId = globalThis.crypto?.randomUUID?.() || `mock-task-id-${Date.now()}`;
  const groupTasks = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_TASKS, {});

  if (!groupTasks[groupName]) {
    groupTasks[groupName] = {};
  }

  const newTaskData = {
    url: tabData.url,
    title: tabData.title || tabData.url,
    senderDeviceId: senderDeviceId,
    recipientDeviceIds: recipientDeviceIds, // Store recipient IDs
    creationTimestamp: Date.now(),
  };

  if (recipientDeviceIds && Array.isArray(recipientDeviceIds) && recipientDeviceIds.length > 0) {
    newTaskData.recipientDeviceIds = recipientDeviceIds;
  }

  groupTasks[groupName][taskId] = newTaskData;

  const success = await storage.set(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_TASKS, groupTasks);
  if (!success) {
    console.error(`Failed to store task ${taskId} for group ${groupName}.`);
    return { success: false, taskId: null };
  }
  return { success: true, taskId };
}