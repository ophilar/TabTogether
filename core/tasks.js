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
  // Get a mutable copy if it comes from currentState, or fetch fresh
  let allGroupTasksFromState = currentState.groupTasks || await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_TASKS, {});
  // It's better to work on a deep copy if we plan to modify and then decide to merge or set
  // Or, build a separate updates object. Let's go with a separate updates object.
  let taskUpdatesForSync = {};
  let groupTasksModifiedInSync = false;
  let localProcessedTasks = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.PROCESSED_TASKS, {});
  let tasksProcessedLocallyThisRun = false; // Renamed for clarity

  console.log(`Processing incoming tabs for device ${localInstanceId}, subscriptions: ${mySubscriptions.join(', ')}`);

  for (const groupName in allGroupTasksFromState) {
    if (mySubscriptions.includes(groupName)) {
      const tasksInGroupObject = allGroupTasksFromState[groupName]; // This is an object { taskId1: data1, ...}

      for (const taskId in tasksInGroupObject) {
        const task = tasksInGroupObject[taskId];

        // Determine if the task should be skipped
        const alreadyProcessed = localProcessedTasks[taskId];
        const sentBySelfOrAlreadyProcessed = task.processedByDeviceIds && task.processedByDeviceIds.includes(localInstanceId);
        const alreadyProcessedInSyncByThisDevice = task.processedByDeviceIds && task.processedByDeviceIds.includes(localInstanceId);

        if (alreadyProcessedInSyncByThisDevice || alreadyProcessed) {
          // If process update didn't work in the past, try again
          // Self-correction: if locally processed but not marked in sync, update sync.
          if (alreadyProcessed && !alreadyProcessedInSyncByThisDevice) {
            // Prepare update for this specific task
            const currentProcessedBy = task.processedByDeviceIds || [];
            const updatedProcessedBy = [...currentProcessedBy, localInstanceId];

            if (!taskUpdatesForSync[groupName]) taskUpdatesForSync[groupName] = {};
            if (!taskUpdatesForSync[groupName][taskId]) taskUpdatesForSync[groupName][taskId] = {};
            taskUpdatesForSync[groupName][taskId].processedByDeviceIds = updatedProcessedBy;
            groupTasksModifiedInSync = true;
          }
          continue;
        }

        // Open the tab
        try {
          console.log(`Android: Processing tab: ${task.url} for group ${groupName}, task ID: ${taskId}`);
          await global.browser.tabs.create({ url: task.url, active: false });

          // Add this device to the task's processedByDeviceIds for sync update
          const currentProcessedBy = task.processedByDeviceIds || [];
          const updatedProcessedBy = [...currentProcessedBy, localInstanceId];

          if (!taskUpdatesForSync[groupName]) taskUpdatesForSync[groupName] = {};
          if (!taskUpdatesForSync[groupName][taskId]) taskUpdatesForSync[groupName][taskId] = {};
          taskUpdatesForSync[groupName][taskId].processedByDeviceIds = updatedProcessedBy;
          groupTasksModifiedInSync = true;

          localProcessedTasks[taskId] = Date.now(); // Mark as processed with timestamp
          tasksProcessedLocallyThisRun = true;
        } catch (e) {
          console.error(`Android: Failed to open tab ${task.url} (task ID: ${taskId}):`, e);
          // Do not mark as processed if opening failed
        }
      }
    }
  }

  if (tasksProcessedLocallyThisRun) {
    // Save the updated localProcessedTasks
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.PROCESSED_TASKS, localProcessedTasks);
    console.log("Android: Finished processing incoming tabs, updated local processed task list.");
  } else {
    console.log("Android: No new tabs to process for this device.");
  }

   if (groupTasksModifiedInSync) {
    const mergeResult = await storage.mergeItem(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_TASKS, taskUpdatesForSync);
    if (mergeResult.success) console.log('Android: Merged processedByDeviceIds updates into GROUP_TASKS in sync storage.');
    else console.error('Android: FAILED to merge processedByDeviceIds updates into GROUP_TASKS in sync storage.');
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
  const creatorDeviceId = await getInstanceId();

  const newTaskData = {
    url: tabData.url,
    title: tabData.title || tabData.url,
    processedByDeviceIds: [creatorDeviceId], // Sender has "processed" it by creating it
    creationTimestamp: Date.now(),
  };

  const taskUpdate = { [groupName]: { [taskId]: newTaskData } };
  const opResult = await storage.mergeItem(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_TASKS, taskUpdate);

  if (!opResult.success) {
    console.error(`Failed to store task ${taskId} for group ${groupName}.`);
    return { success: false, taskId: null, message: opResult.message || "Failed to save task to sync storage." };
  }
  console.log(`Task ${taskId} created for group ${groupName}:`, newTaskData);
  return { success: true, taskId };
}