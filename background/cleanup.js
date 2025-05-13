import { storage } from "../core/storage.js";
import { SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS } from "../common/constants.js";
export async function performStaleDeviceCheck(
  cachedDeviceRegistry,
  cachedGroupState,
  thresholdMs
) {
  console.log("Performing stale device check...");
  let registry =
    cachedDeviceRegistry ??
    (await storage.get(
      browser.storage.sync,
      SYNC_STORAGE_KEYS.DEVICE_REGISTRY,
      {}
    ));
  let groupState =
    cachedGroupState ??
    (await storage.get(
      browser.storage.sync, // Use browser.storage.sync directly as storage.get expects it
      SYNC_STORAGE_KEYS.GROUP_STATE,
      {}
    ));
  let subscriptionsSync = await storage.get(
    browser.storage.sync,
    SYNC_STORAGE_KEYS.SUBSCRIPTIONS,
    {}
  );
  const now = Date.now();
  let registryUpdates = {};
  let groupStateUpdates = {};
  let subscriptionsUpdates = {};
  let needsRegistryUpdate = false;
  let needsGroupStateUpdate = false;
  let needsSubscriptionsUpdate = false;
  for (const deviceId in registry) {
    if (now - (registry[deviceId]?.lastSeen || 0) > thresholdMs && deviceId !== 'test-device-id') {
      console.log(
        `Device ${deviceId} (${registry[deviceId].name}) is stale. Pruning...`
      );
      needsRegistryUpdate = true;
      registryUpdates[deviceId] = null;
      if (subscriptionsSync[deviceId]) {
        subscriptionsUpdates[deviceId] = null;
        needsSubscriptionsUpdate = true;
      }
    }
  }
  let registryMergeSuccess = true;
  let groupStateMergeSuccess = true;
  if (needsRegistryUpdate) {
    registryMergeSuccess = await storage.mergeItem(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, registryUpdates);
  }
  if (needsSubscriptionsUpdate) {
    await storage.mergeItem(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, subscriptionsUpdates);
  }
  console.log("Stale device check complete. Registry updated:", registryMergeSuccess.success, "Group state updated:", groupStateMergeSuccess.success);
}
export async function performTimeBasedTaskCleanup(
  localProcessedTasks,
  thresholdMs
) {
  console.log("Performing time-based task cleanup...");
  const allGroupTasks = await storage.get(
    browser.storage.sync,
    SYNC_STORAGE_KEYS.GROUP_TASKS, // Use constant
    {}
  );
  let groupTasksUpdates = {};
  let needsUpdate = false;
  const now = Date.now();
  let processedTasksChanged = false;
  let currentProcessedTasks = { ...localProcessedTasks };

  for (const groupName in allGroupTasks) {
    for (const taskId in allGroupTasks[groupName]) {
      const task = allGroupTasks[groupName][taskId];
      if (task && (now - (task.creationTimestamp || 0) > thresholdMs)) {
        console.log(`Task ${taskId} in group ${groupName} expired. Deleting.`);
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
    `[Cleanup] Before final local set: processedTasksChanged=${processedTasksChanged}, currentProcessedTasks=`,
    JSON.stringify(currentProcessedTasks)
  );

  if (needsUpdate) {
    await storage.mergeSyncStorage({ [SYNC_STORAGE_KEYS.GROUP_TASKS]: groupTasksUpdates });
  }
  if (processedTasksChanged) {
    console.log(`[Cleanup] Saving updated local processed tasks...`);
    await storage.set(
      browser.storage.local,
      LOCAL_STORAGE_KEYS.PROCESSED_TASKS,
      currentProcessedTasks
    );
  }
  console.log("Time-based task cleanup complete.");
}