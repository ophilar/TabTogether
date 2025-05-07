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
      const tasksForGroup = groupTasks[groupName];
      const tasksToKeep = [];

      for (const task of tasksForGroup) {
        // Check if task is for this device (or if no specific recipient, and this device is subscribed)
        // And ensure task was not sent BY this device
        if (task.recipientDeviceIds && !task.recipientDeviceIds.includes(instanceId)) {
            tasksToKeep.push(task); // Not for me
            continue;
        }
        if (task.senderDeviceId === instanceId) {
            tasksToKeep.push(task); // Don't open tabs I sent
            continue;
        }

        // Open the tab
        try {
          console.log(`Opening tab: ${task.url} for group ${groupName}`);
          await browser.tabs.create({ url: task.url, active: false });
          tasksProcessed = true;
        } catch (e) {
          console.error(`Failed to open tab ${task.url}:`, e);
          tasksToKeep.push(task); // Keep task if opening failed
        }
      }
      groupTasks[groupName] = tasksToKeep; // Update tasks for the group
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
// export async function createAndStoreGroupTask(groupName, url, recipientDeviceIds = null) { ... }