import { storage, recordSuccessfulSyncTime } from "./storage.js";
import { SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS, STRINGS, MAX_DEVICES_PER_GROUP } from "../common/constants.js";
import { getInstanceId, getInstanceName, setInstanceName } from "./instance.js";

/**
 * Retrieves the unified state of the application.
 * @param {boolean} isAndroid - Whether the current platform is Android.
 * @returns {Promise<object>} The application state.
 */
export async function getUnifiedState(isAndroid) {
  try {
    const instanceId = await getInstanceId();
    const instanceName = await getInstanceName();  // Get current device name (authoritative for UI, prioritizes local override)
    let thisDeviceSubscriptions = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []);

    const syncDataToGet = {
      [SYNC_STORAGE_KEYS.DEVICE_REGISTRY]: {},
      [SYNC_STORAGE_KEYS.DEFINED_GROUPS]: [],
      [SYNC_STORAGE_KEYS.GROUP_TASKS]: {},
    };
    const syncData = await browser.storage.sync.get(syncDataToGet);

    let deviceRegistry = syncData[SYNC_STORAGE_KEYS.DEVICE_REGISTRY];
    let definedGroups = syncData[SYNC_STORAGE_KEYS.DEFINED_GROUPS];
    let groupTasks = syncData[SYNC_STORAGE_KEYS.GROUP_TASKS];

    let deviceRegistryNeedsUpdate = false;
    // Ensure current device is in registry
    if (!deviceRegistry[instanceId]) {
      // Device not in registry, add it. instanceName here will be from local override if set, or default.
      deviceRegistry[instanceId] = { name: instanceName, lastSeen: Date.now() };
      deviceRegistryNeedsUpdate = true;
    } else {
      // Device is in registry. Always update lastSeen.
      if (deviceRegistry[instanceId].lastSeen !== Date.now()) { // Avoid write if identical (unlikely)
        deviceRegistry[instanceId].lastSeen = Date.now();
        deviceRegistryNeedsUpdate = true;
      }
      // Ensure the name in the device registry matches the current authoritative instanceName.
      if (deviceRegistry[instanceId].name !== instanceName) {
        deviceRegistry[instanceId].name = instanceName;
        deviceRegistryNeedsUpdate = true;
      }
    }

    if (deviceRegistryNeedsUpdate) {
      // Optimized: Only merge the changes for the current instanceId
      const updatePayload = { [instanceId]: deviceRegistry[instanceId] };
      await storage.mergeItem(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, updatePayload);
      await recordSuccessfulSyncTime(); // Record sync time
    }

    if (thisDeviceSubscriptions.length === 0) {
      let allSyncSubscriptions = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, {});
      // 'allSyncSubscriptions' is { groupName: [deviceId, ...] }.
      // We need to derive this device's subscriptions (a list of group names).
      for (const groupName in allSyncSubscriptions) {
        if (allSyncSubscriptions[groupName] && allSyncSubscriptions[groupName].includes(instanceId)) {
          thisDeviceSubscriptions.push(groupName); // Add to the (currently empty) thisDeviceSubscriptions array
        }
      }
      await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, thisDeviceSubscriptions);
      // Note: This is a local storage set, not a sync storage set for subscriptions.
      // If this derivation implies a sync was read successfully, recordSuccessfulSyncTime could be called here too,
      // or rely on the fact that deviceRegistry update above would have called it.
    }

    return {
      instanceId,
      instanceName,
      deviceRegistry,
      definedGroups: definedGroups.sort(),
      subscriptions: thisDeviceSubscriptions.sort(),
      groupTasks,
      isAndroid,
      error: null,
    };
  } catch (error) {
    console.error("Error in getUnifiedState:", error);
    return { error: error.message || "Failed to load state." };
  }
}

// --- Direct Actions (primarily for Android or when background script is unavailable) ---
export async function createGroupDirect(groupName) {
  if (!groupName || typeof groupName !== 'string' || groupName.trim().length === 0) {
    return { success: false, message: STRINGS.invalidGroupName };
  }
  const trimmedGroupName = groupName.trim();
  const definedGroups = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS, []);
  if (definedGroups.includes(trimmedGroupName)) {
    return { success: false, message: STRINGS.groupExists(trimmedGroupName) };
  }
  definedGroups.push(trimmedGroupName);
  definedGroups.sort();
  const success = await storage.set(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS, definedGroups);
  if (success) {
    return { success: true, message: STRINGS.groupCreateSuccess(trimmedGroupName), newGroup: trimmedGroupName };
  }
  return { success: false, message: "Failed to save new group." };
}

export async function deleteGroupDirect(groupName) {
  let definedGroups = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS, []);
  definedGroups = definedGroups.filter(g => g !== groupName);
  const groupsSuccess = await storage.set(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS, definedGroups);

  // Remove the group key from the local subscriptions object
  let localSubscriptions = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []);
  if (localSubscriptions.includes(groupName)) { // Corrected: condition and array manipulation
    localSubscriptions = localSubscriptions.filter(g => g !== groupName);
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, localSubscriptions);
  }

  // Remove the group key from the remote subscriptions object
  let subsSuccess = true;
  let syncSubscriptions = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, {});
  if (syncSubscriptions[groupName]) {
    delete syncSubscriptions[groupName];
    subsSuccess = await storage.set(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, syncSubscriptions); // Corrected: use syncSubscriptions
  }
  // Delete tasks associated with this group from GROUP_TASKS
  let tasksSuccess = true;
  let tasks = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_TASKS, {});
  if (tasks[groupName]) {
    delete tasks[groupName];
    const taskMergeResult = await storage.mergeItem(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_TASKS, { [groupName]: null });
    tasksSuccess = taskMergeResult.success;
  }

  if (groupsSuccess && subsSuccess && tasksSuccess) {
    return { success: true, message: STRINGS.groupDeleteSuccess(groupName), deletedGroup: groupName };
  }
  return { success: false, message: "Failed to fully delete group its tasks and update subscriptions." };
}

export async function renameGroupDirect(oldName, newName) {
  if (!newName || typeof newName !== 'string' || newName.trim().length === 0) {
    return { success: false, message: STRINGS.invalidGroupName };
  }
  const trimmedNewName = newName.trim();

  // Rename the group key in local subscriptions
  let localSubscriptions = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []);
  if (localSubscriptions.includes(oldName)) { // Corrected: array check and update
    localSubscriptions = localSubscriptions.map(g => (g === oldName ? trimmedNewName : g));
    // Ensure the new name isn't duplicated if it somehow already existed (unlikely for a rename target)
    // and then sort.
    localSubscriptions = [...new Set(localSubscriptions)].sort();
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, localSubscriptions);
  }

  let definedGroups = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS, []);
  let syncSubscriptionsObject = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, {});
  let groupTasks = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_TASKS, {});

  if (definedGroups.includes(trimmedNewName) && oldName !== trimmedNewName) {
    return { success: false, message: STRINGS.groupExists(trimmedNewName) };
  }

  definedGroups = definedGroups.map(g => (g === oldName ? trimmedNewName : g));
  // Rename the group key in subscriptions
  if (syncSubscriptionsObject[oldName]) { // Corrected: use syncSubscriptionsObject
    syncSubscriptionsObject[trimmedNewName] = syncSubscriptionsObject[oldName];
    delete syncSubscriptionsObject[oldName];
  }
  // Rename the group key in groupTasks
  let tasksSuccess = true;
  if (groupTasks[oldName]) {
    groupTasks[trimmedNewName] = groupTasks[oldName];
    delete groupTasks[oldName];
    const taskMergeResult = await storage.mergeItem(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_TASKS, { [oldName]: null, [trimmedNewName]: groupTasks[trimmedNewName] });
    tasksSuccess = taskMergeResult.success;
  }

  const groupsSuccess = await storage.set(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS, definedGroups.sort());
  const subsSuccess = await storage.set(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, syncSubscriptionsObject); // Corrected: use syncSubscriptionsObject
  if (groupsSuccess && subsSuccess && tasksSuccess) {
    return { success: true, message: STRINGS.groupRenameSuccess(trimmedNewName), renamedGroup: trimmedNewName };
  }
  return { success: false, message: "Failed to fully rename group and update subscriptions." };
}

/**
 * Internal helper to add a device's subscription to a group, updating both local and sync storage.
 * @param {string} instanceId - The ID of the device subscribing.
 * @param {string} groupName - The name of the group to subscribe to.
 * @returns {Promise<{success: boolean, message?: string, subscribedGroup?: string}>}
 * @private
 */
async function _addDeviceSubscriptionToGroup(instanceId, groupName) {
  let syncSubscriptions = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, {});

  // Check MAX_DEVICES_PER_GROUP
  if (syncSubscriptions[groupName] &&
    syncSubscriptions[groupName].length >= MAX_DEVICES_PER_GROUP &&
    !syncSubscriptions[groupName].includes(instanceId) // Only fail if this device isn't already one of them
  ) {
    return { success: false, message: STRINGS.groupFull(groupName), subscribedGroup: groupName };
  }

  // Update local subscriptions
  let localSubscriptions = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []);
  if (!localSubscriptions.includes(groupName)) { // Corrected: Add groupName if not present
    localSubscriptions.push(groupName);
    localSubscriptions.sort();
    localSubscriptions = [...new Set(localSubscriptions)].sort();
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, localSubscriptions);
  }

  // Check if already subscribed in sync
  if (syncSubscriptions[groupName] && syncSubscriptions[groupName].includes(instanceId)) {
    return { success: true, message: `Already subscribed to "${groupName}".`, subscribedGroup: groupName };
  }

  // Add device to the group's subscriber list in sync
  if (!syncSubscriptions[groupName]) {
    syncSubscriptions[groupName] = [];
  }
  syncSubscriptions[groupName].push(instanceId);
  syncSubscriptions[groupName].sort();

  const success = await storage.set(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, syncSubscriptions);

  if (success) {
    return { success: true, message: `Subscribed to "${groupName}".`, subscribedGroup: groupName };
  }
  return { success: false, message: "Failed to save subscription." };
}

/**
 * Internal helper to remove a device's subscription from a group, updating both local and sync storage.
 * @param {string} instanceId - The ID of the device unsubscribing.
 * @param {string} groupName - The name of the group to unsubscribe from.
 * @returns {Promise<{success: boolean, message?: string, unsubscribedGroup?: string}>}
 * @private
 */
async function _removeDeviceSubscriptionFromGroup(instanceId, groupName) {
  // Update local subscriptions
  let localSubscriptions = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []);
  if (localSubscriptions.includes(groupName)) {
    localSubscriptions = localSubscriptions.filter(sub => sub !== groupName);
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, localSubscriptions);
  }

  let syncSubscriptions = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, {});
  if (syncSubscriptions[groupName]) {
    const initialLength = syncSubscriptions[groupName].length;
    syncSubscriptions[groupName] = syncSubscriptions[groupName].filter(id => id !== instanceId);

    if (syncSubscriptions[groupName].length === 0) {
      delete syncSubscriptions[groupName]; // Clean up empty group entry
    }
    // Check if the group entry still exists before accessing its length
    const groupStillExistsAfterFilter = Object.prototype.hasOwnProperty.call(syncSubscriptions, groupName);
    const newLength = groupStillExistsAfterFilter ? syncSubscriptions[groupName].length : 0;
    if (newLength < initialLength) { // If something was actually removed or the group entry was deleted
      const success = await storage.set(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, syncSubscriptions);
      if (success) {
        return { success: true, message: `Unsubscribed from "${groupName}".`, unsubscribedGroup: groupName };
      }
      return { success: false, message: "Failed to save unsubscription to sync." };
    }
  }
  // If not found in sync, it means it wasn't subscribed (or sync is stale).
  // Treat as success for unsubscription action.
  return { success: true, message: `Not subscribed to "${groupName}".`, unsubscribedGroup: groupName };
}

export async function subscribeToGroupDirect(groupName) {
  const instanceId = await getInstanceId();
  return _addDeviceSubscriptionToGroup(instanceId, groupName);
}

export async function unsubscribeFromGroupDirect(groupName) {
  const instanceId = await getInstanceId();
  return _removeDeviceSubscriptionFromGroup(instanceId, groupName);
}

export async function deleteDeviceDirect(deviceId) {
  let deviceRegistry = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {});
  const deviceName = deviceRegistry[deviceId]?.name || "Unknown Device"; // Get name AFTER fetching registry

  if (deviceRegistry[deviceId]) {
    delete deviceRegistry[deviceId];
  }
  const registrySuccess = await storage.set(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, deviceRegistry);
  // Remove device from all groups it was subscribed to in sync
  let subscriptions = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, {});
  for (const groupName in subscriptions) {
    subscriptions[groupName] = subscriptions[groupName].filter(id => id !== deviceId);
    if (subscriptions[groupName].length === 0) delete subscriptions[groupName]; // Clean up empty group entry
  }
  const subsSuccess = await storage.set(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, subscriptions);

  if (registrySuccess && subsSuccess) {
    return { success: true, message: STRINGS.deviceDeleteSuccess(deviceName), deletedDevice: deviceName };
  }
  return { success: false, message: "Failed to fully delete device and update subscriptions." };
}

// --- Unified Actions (decide between direct call or background message) ---

export async function createGroupUnified(groupName, isAndroid) {
  if (isAndroid) {
    return createGroupDirect(groupName);
  } else {
    return browser.runtime.sendMessage({ action: "createGroup", groupName });
  }
}

export async function deleteGroupUnified(groupName, isAndroid) {
  if (isAndroid) {
    return deleteGroupDirect(groupName);
  } else {
    return browser.runtime.sendMessage({ action: "deleteGroup", groupName });
  }
}

export async function renameGroupUnified(oldName, newName, isAndroid) {
  if (isAndroid) {
    return renameGroupDirect(oldName, newName);
  } else {
    return browser.runtime.sendMessage({ action: "renameGroup", oldName, newName });
  }
}

export async function deleteDeviceUnified(deviceId, isAndroid) {
  if (isAndroid) {
    return deleteDeviceDirect(deviceId);
  } else {
    return browser.runtime.sendMessage({ action: "deleteDevice", deviceId });
  }
}

export async function subscribeToGroupUnified(groupName, isAndroid) {
  if (isAndroid) {
    return subscribeToGroupDirect(groupName);
  } else {
    return browser.runtime.sendMessage({ action: "subscribeToGroup", groupName });
  }
}

export async function unsubscribeFromGroupUnified(groupName, isAndroid) {
  if (isAndroid) {
    return unsubscribeFromGroupDirect(groupName);
  } else {
    return browser.runtime.sendMessage({ action: "unsubscribeFromGroup", groupName });
  }
}

export async function renameDeviceUnified(newName, isAndroid) {
  if (isAndroid) {
    // On Android, if it's the current device, update its name directly with instance.setInstanceName
    return await setInstanceName(newName.trim());
  } else {
    return browser.runtime.sendMessage({ action: "renameDevice", newName });
  }
}

export { _addDeviceSubscriptionToGroup, _removeDeviceSubscriptionFromGroup };
