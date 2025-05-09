// core/tasks.js

import { storage } from "./storage.js";
import { SYNC_STORAGE_KEYS } from "../common/constants.js";
import { getInstanceId } from "./instance.js";

/**
 * Processes incoming tabs for the current device, typically on Android or manual sync.
 * Opens tabs from tasks and then clears those tasks.
 * @param {object} currentState - The current application state, including groupTasks and subscriptions.
 * @returns {Promise<void>}
 */
export async function processIncomingTabsAndroid(currentState) {
  const instanceId = currentState.instanceId || await getInstanceId();
  const mySubscriptions = currentState.subscriptions || [];
  let groupTasks = currentState.groupTasks || await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_TASKS, {});
  let tasksProcessed = false;

  console.log(`Processing incoming tabs for device ${instanceId}, subscriptions: ${mySubscriptions.join(', ')}`);

  for (const groupName in groupTasks) {
    if (mySubscriptions.includes(groupName)) {
      const tasksInGroupObject = groupTasks[groupName]; // This is an object { taskId1: data1, ...}
      const remainingTasksForGroup = {}; // Rebuild as an object

      for (const taskId in tasksInGroupObject) {
        const task = tasksInGroupObject[taskId];
        // Check if task is for this device (or if no specific recipient, and this device is subscribed)
        // And ensure task was not sent BY this device
        if (task.recipientDeviceIds && !task.recipientDeviceIds.includes(instanceId)) {
            remainingTasksForGroup[taskId] = task; // Keep task: Not for me
            continue;
        }
        if (task.senderDeviceId === instanceId) {
            remainingTasksForGroup[taskId] = task; // Keep task: Don't open tabs I sent
            continue;
        }

        // Open the tab
        try {
          console.log(`Opening tab: ${task.url} for group ${groupName}`);
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

// You might add other task-related functions here, e.g.:

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
    processedBy: { [senderDeviceId]: true }, // Sender is marked as processed
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