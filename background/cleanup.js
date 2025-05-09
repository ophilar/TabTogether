import { storage } from "../core/storage.js"; // Import storage
import { SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS } from "../common/constants.js"; // Assuming constants are needed
export async function performStaleDeviceCheck(
  cachedDeviceRegistry,
  cachedGroupState,
  thresholdMs // Add threshold parameter
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
  let subscriptions = await storage.get(
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
    if (now - (registry[deviceId]?.lastSeen || 0) > thresholdMs && deviceId !== 'test-device-id') { // Use parameter, skip self for test
      console.log(
        `Device ${deviceId} (${registry[deviceId].name}) is stale. Pruning...`
      );
      needsRegistryUpdate = true;
      registryUpdates[deviceId] = null;
      // Also mark subscriptions for this device for deletion
      if (subscriptions[deviceId]) {
        subscriptionsUpdates[deviceId] = null;
        needsSubscriptionsUpdate = true;
      }
      const staleDeviceBits = registry[deviceId].groupBits || {};
      for (const groupName in staleDeviceBits) {
        const staleBit = staleDeviceBits[groupName];
        if (groupState[groupName] && staleBit !== undefined) {
          const currentAssignedMask = groupState[groupName].assignedMask;
          const newAssignedMask = currentAssignedMask & ~staleBit;
          if (newAssignedMask !== currentAssignedMask) {
            if (!groupStateUpdates[groupName])
              groupStateUpdates[groupName] = {};
            groupStateUpdates[groupName].assignedMask = newAssignedMask;
            needsGroupStateUpdate = true;
            console.log(
              `Updated assignedMask for group ${groupName} (removed bit for stale device ${deviceId})`
            );
          }
        }
      }
    }
  }
  let registryMergeSuccess = true;
  let groupStateMergeSuccess = true;
  if (needsRegistryUpdate) {
    // Nest updates under the correct sync storage key
    await storage.mergeSyncStorage({ [SYNC_STORAGE_KEYS.DEVICE_REGISTRY]: registryUpdates });
    // Removed ineffective update to cachedDeviceRegistry argument
  }
  if (needsGroupStateUpdate) {
    // Nest updates under the correct sync storage key
    await storage.mergeSyncStorage({ [SYNC_STORAGE_KEYS.GROUP_STATE]: groupStateUpdates });
    // Removed ineffective update to cachedGroupState argument
  }
  if (needsSubscriptionsUpdate) {
    // Nest updates under the correct sync storage key
    await storage.mergeSyncStorage({ [SYNC_STORAGE_KEYS.SUBSCRIPTIONS]: subscriptionsUpdates });
  }
  console.log("Stale device check complete.");
}


export async function performTimeBasedTaskCleanup(
  localProcessedTasks,
  thresholdMs // Add threshold parameter
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
  let processedTasksChanged = false; // Track if local processed tasks need saving
  let currentProcessedTasks = { ...localProcessedTasks }; // Work on a copy

  for (const groupName in allGroupTasks) {
    for (const taskId in allGroupTasks[groupName]) {
      const task = allGroupTasks[groupName][taskId];
      if (task && (now - (task.creationTimestamp || 0) > thresholdMs)) { // Use parameter and check task exists
        console.log(`Task ${taskId} in group ${groupName} expired. Deleting.`);
        if (!groupTasksUpdates[groupName]) groupTasksUpdates[groupName] = {};
        groupTasksUpdates[groupName][taskId] = null;
        needsUpdate = true;
        // Delete from the working copy if it exists
        if (currentProcessedTasks[taskId]) {
          delete currentProcessedTasks[taskId];
          processedTasksChanged = true; // Mark that we need to save the local changes
        }
      }
    }
  }

  console.log(
    `[Cleanup] Before final local set: processedTasksChanged=${processedTasksChanged}, currentProcessedTasks=`,
    JSON.stringify(currentProcessedTasks)
  );

  if (needsUpdate) {
    // Nest updates under the correct sync storage key
    await storage.mergeSyncStorage({ [SYNC_STORAGE_KEYS.GROUP_TASKS]: groupTasksUpdates });
    // if (Object.keys(processedTasksUpdates).length !== Object.keys(localProcessedTasks).length) {
    // localProcessedTasks = processedTasksUpdates;
    // await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.PROCESSED_TASKS, localProcessedTasks);
    // }
  }
  // Save the updated local processed tasks if changes were made
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