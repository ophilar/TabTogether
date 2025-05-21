import { storage } from "../core/storage.js";
import { SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS } from "../common/constants.js";

export async function performTimeBasedTaskCleanup(localProcessedTasks, thresholdMs) {
  console.log("Cleanup:performTimeBasedTaskCleanup - Performing time-based task cleanup...");
  const allGroupTasks = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_TASKS, {});
  let groupTasksUpdates = {};
  let needsUpdate = false;
  const now = Date.now();
  let processedTasksChanged = false;
  let currentProcessedTasks = { ...localProcessedTasks };

  for (const groupName in allGroupTasks) {
    for (const taskId in allGroupTasks[groupName]) {
      const task = allGroupTasks[groupName][taskId];
      if (task && now - (task.creationTimestamp || 0) > thresholdMs) {
        console.log(`Cleanup:performTimeBasedTaskCleanup - Task ${taskId} in group ${groupName} expired. Deleting.`);
        if (!groupTasksUpdates[groupName]) groupTasksUpdates[groupName] = {};
        groupTasksUpdates[groupName][taskId] = null;
        needsUpdate = true;
        if (currentProcessedTasks[taskId]) {
          delete currentProcessedTasks[taskId];
          processedTasksChanged = true;
        }
      }
    }
  }

  console.log(
    `Cleanup:performTimeBasedTaskCleanup - Before final local set: processedTasksChanged=${processedTasksChanged}, currentProcessedTasks=`,
    JSON.stringify(currentProcessedTasks)
  );

  if (needsUpdate) {
    await storage.mergeSyncStorage({ [SYNC_STORAGE_KEYS.GROUP_TASKS]: groupTasksUpdates });
    console.log("Cleanup:performTimeBasedTaskCleanup - Merged GROUP_TASKS updates to sync storage.");
  }
  if (processedTasksChanged) {
    console.log(`Cleanup:performTimeBasedTaskCleanup - Saving updated local processed tasks...`);
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.PROCESSED_TASKS, currentProcessedTasks);
  }
  console.log("Cleanup:performTimeBasedTaskCleanup - Complete.");
}