import { storage } from "../core/storage.js";
import { SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS } from "../common/constants.js";

export async function performStaleDeviceCheck(cachedDeviceRegistry, thresholdMs) {
  console.log("Performing stale device check...");
  let registry = cachedDeviceRegistry ?? (await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {}));
  const now = Date.now();
  let registryUpdates = {};
  let needsRegistryUpdate = false;

  for (const deviceId in registry) {
    if (now - (registry[deviceId]?.lastSeen || 0) > thresholdMs && deviceId !== 'test-device-id') {
      console.log(`Device ${deviceId} (${registry[deviceId].name}) is stale. Pruning...`);
      needsRegistryUpdate = true;
      registryUpdates[deviceId] = null;
    }
  }
  let registryMergeSuccess = true;
  if (needsRegistryUpdate) {
    registryMergeSuccess = await storage.mergeItem(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, registryUpdates);
  }
  // If registry was updated, we need to check subscriptions for any stale devices removed
  let groupStateMergeSuccess = true;
  if (needsRegistryUpdate && registryMergeSuccess.success) {
    let subscriptionsModified = false;
    const currentSyncSubscriptions = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, {});
    for (const groupName in currentSyncSubscriptions) {
      const originalSubscribers = currentSyncSubscriptions[groupName];
      currentSyncSubscriptions[groupName] = originalSubscribers.filter(id => registryUpdates[id] !== null); // Keep if not marked for deletion
      if (currentSyncSubscriptions[groupName].length !== originalSubscribers.length) {
        subscriptionsModified = true;
      }
      if (currentSyncSubscriptions[groupName].length === 0) {
        delete currentSyncSubscriptions[groupName]; // Clean up empty group
      }
    }
    if (subscriptionsModified) {
      groupStateMergeSuccess = await storage.set(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, currentSyncSubscriptions);
    }
  }
  console.log("Stale device check complete. Registry updated:", registryMergeSuccess.success, "Group state updated:", groupStateMergeSuccess);
}

export async function performTimeBasedTaskCleanup(localProcessedTasks, thresholdMs) {
  console.log("Performing time-based task cleanup...");
  const allGroupTasks = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_TASKS, {});
  let groupTasksUpdates = {};
  let needsUpdate = false;
  const now = Date.now();
  let processedTasksChanged = false;
  let currentProcessedTasks = { ...localProcessedTasks };
  const allSyncSubscriptions = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, {});

  for (const groupName in allGroupTasks) {
    for (const taskId in allGroupTasks[groupName]) {
      const needsTaskDelete = false;
      const task = allGroupTasks[groupName][taskId];
      // Condition 1: Task is expired
      if (task && now - (task.creationTimestamp || 0) > thresholdMs) {
        console.log(`Task ${taskId} in group ${groupName} expired. Deleting.`);
        needsTaskDelete = true;
      }
      // Condition 2: Task processed by all current subscribers (and not already marked for time-based deletion)
      else if (task && (!groupTasksUpdates[groupName] || groupTasksUpdates[groupName][taskId] !== null)) {
        const currentSubscribersForGroup = new Set(allSyncSubscriptions[groupName] || []);
        const processedBy = new Set(task.processedByDeviceIds || []);

        // Only consider deletion if there are subscribers and all have processed
        if (currentSubscribersForGroup.size > 0) {
          const allSubscribersProcessed = [...currentSubscribersForGroup].every(subId => processedBy.has(subId));
          if (allSubscribersProcessed) {
            console.log(`Task ${taskId} in group ${groupName} processed by all ${currentSubscribersForGroup.size} subscribers. Deleting.`);
            needsTaskDelete = true
          }
        }
      }
      if (needsTaskDelete) {
        if (!groupTasksUpdates[groupName]) groupTasksUpdates[groupName] = {};
        groupTasksUpdates[groupName][taskId] = null; // Mark for deletion
        needsUpdate = true;
        if (currentProcessedTasks[taskId]) {
          delete currentProcessedTasks[taskId];
          processedTasksChanged = true;
        }
      }
    }
  }

  console.log(
    `[Cleanup] Before final local set: processedTasksChanged=${processedTasksChanged}, currentProcessedTasks=`,
    JSON.stringify(currentProcessedTasks)
  );

  if (needsUpdate) {
    await storage.mergeSyncStorage({ [SYNC_STORAGE_KEYS.GROUP_TASKS]: groupTasksUpdates });
  }
  if (processedTasksChanged) {
    console.log(`[Cleanup] Saving updated local processed tasks...`);
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.PROCESSED_TASKS, currentProcessedTasks);
  }
  console.log("Time-based task cleanup complete.");
}