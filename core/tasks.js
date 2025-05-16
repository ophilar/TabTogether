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

  console.log(`Processing incoming tabs for device ${localInstanceId}, subscriptions: ${mySubscriptions.join(', ')}`);

  for (const groupName in allGroupTasks) {
    if (mySubscriptions.includes(groupName)) {
      const tasksInGroupObject = allGroupTasks[groupName]; // This is an object { taskId1: data1, ...}
      // const remainingTasksForGroup = {}; // Rebuild as an object // Not needed if we don't modify sync tasks here

      for (const taskId in tasksInGroupObject) {
        const task = tasksInGroupObject[taskId];

        // Determine if the task should be skipped
        const alreadyProcessed = localProcessedTasks[taskId];
        const sentBySelfOrAlreadyProcessed = task.processedByDeviceIds && task.processedByDeviceIds.includes(localInstanceId);

        if (sentBySelfOrAlreadyProcessed || alreadyProcessed) {
          // If process update didn't work in the past, try again
          if (alreadyProcessed && !sentBySelfOrAlreadyProcessed) {
            allGroupTasks[groupName][taskId].processedByDeviceIds.push(localInstanceId);
            groupTasksModifiedInSync = true;
          }
          continue;
        }

        // Open the tab
        try {
          console.log(`Android: Processing tab: ${task.url} for group ${groupName}, task ID: ${taskId}`);
          await global.browser.tabs.create({ url: task.url, active: false });

          // Add this device to the task's processedByDeviceIds in the main storage object
          // This ensures allGroupTasks reflects the change before a potential save.
          if (!allGroupTasks[groupName][taskId].processedByDeviceIds) {
            allGroupTasks[groupName][taskId].processedByDeviceIds = [];
          }
          if (!allGroupTasks[groupName][taskId].processedByDeviceIds.includes(localInstanceId)) {
            allGroupTasks[groupName][taskId].processedByDeviceIds.push(localInstanceId);
            groupTasksModifiedInSync = true;
          }

          localProcessedTasks[taskId] = Date.now(); // Mark as processed with timestamp
          tasksProcessed = true;
        } catch (e) {
          console.error(`Android: Failed to open tab ${task.url} (task ID: ${taskId}):`, e);
          // Do not mark as processed if opening failed
        }
      }
    }
  }

  if (tasksProcessed) {
    // Save the updated localProcessedTasks
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.PROCESSED_TASKS, localProcessedTasks);
    console.log("Android: Finished processing incoming tabs, updated local processed task list.");
  } else {
    console.log("Android: No new tabs to process for this device.");
  }

   if (groupTasksModifiedInSync) {
    await storage.set(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_TASKS, allGroupTasks);
    console.log('Android: Updated GROUP_TASKS in sync storage with new processedByDeviceIds.');
  }
}

/**
 * Creates a new task and stores it in sync storage.
 * @param {string} groupName - The name of the group.
 * @param {object} tabData - Object containing tab URL and title.
 * @returns {Promise<{success: boolean, taskId: string|null}>}
 */
export async function createAndStoreGroupTask(groupName, tabData) {
  const taskId = globalThis.crypto?.randomUUID?.() || `mock-task-id-${Date.now()}`;
  // Fetch the full GROUP_TASKS object to merge into
  const allGroupTasks = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_TASKS, {});
  const creatorDeviceId = await getInstanceId();

  if (!allGroupTasks[groupName]) {
    allGroupTasks[groupName] = {};
  }

  const newTaskData = {
    url: tabData.url,
    title: tabData.title || tabData.url,
    processedByDeviceIds: [creatorDeviceId], // Sender has "processed" it by creating it
    creationTimestamp: Date.now(),
  };

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