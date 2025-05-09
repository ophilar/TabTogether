// core/actions.js

import { storage} from "./storage.js";
import { deepMerge } from "../common/utils.js";
import { SYNC_STORAGE_KEYS, STRINGS } from "../common/constants.js";
import { getInstanceId, getInstanceName } from "./instance.js";
import { isAndroid as checkAndroidPlatform } from "./platform.js"; // Renamed to avoid conflict

/**
 * Retrieves the unified state of the application.
 * @param {boolean} isAndroid - Whether the current platform is Android.
 * @returns {Promise<object>} The application state.
 */
export async function getUnifiedState(isAndroid) {
  try {
    const instanceId = await getInstanceId();
    const instanceName = await getInstanceName(); // Get current device name

    let deviceRegistry = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {});
    let definedGroups = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS, []);
    let subscriptions = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, {});
    let groupTasks = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_TASKS, {});

    // Ensure current device is in registry
    if (!deviceRegistry[instanceId]) {
      deviceRegistry[instanceId] = { name: instanceName, lastSeen: Date.now() };
      await storage.set(browser.storage.sync, { [SYNC_STORAGE_KEYS.DEVICE_REGISTRY]: deviceRegistry });
    } else if (deviceRegistry[instanceId].name !== instanceName || !deviceRegistry[instanceId].lastSeen) {
      // Update name if it changed or lastSeen if missing
      deviceRegistry[instanceId].name = instanceName;
      deviceRegistry[instanceId].lastSeen = Date.now();
      await storage.set(browser.storage.sync, { [SYNC_STORAGE_KEYS.DEVICE_REGISTRY]: deviceRegistry });
    }

    // Ensure subscriptions format is an array for the current device
    const deviceSubscriptions = subscriptions[instanceId] || [];

    return {
      instanceId,
      instanceName,
      deviceRegistry,
      definedGroups: definedGroups.sort(),
      subscriptions: deviceSubscriptions.sort(), // Subscriptions for THIS device
      allSubscriptions: subscriptions, // All devices' subscriptions (for background tasks)
      groupTasks,
      isAndroid,
      error: null,
    };
  } catch (error) {
    console.error("Error in getUnifiedState:", error);
    return { error: error.message || "Failed to load state." };
  }
}

async function updateStorageAndGetResponse(updates, successMessage, itemIdentifier) {
  await storage.mergeSyncStorage(updates);
  return { success: true, message: successMessage, ...itemIdentifier };
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
  return updateStorageAndGetResponse(
    { [SYNC_STORAGE_KEYS.DEFINED_GROUPS]: definedGroups.sort() },
    STRINGS.groupCreateSuccess(trimmedGroupName),
    { newGroup: trimmedGroupName }
  );
}

export async function deleteGroupDirect(groupName) {
  let definedGroups = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS, []);
  let subscriptions = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, {});

  definedGroups = definedGroups.filter(g => g !== groupName);
  for (const deviceId in subscriptions) {
    subscriptions[deviceId] = subscriptions[deviceId].filter(sub => sub !== groupName);
  }
  // Consider also deleting tasks associated with this group from GROUP_TASKS

  return updateStorageAndGetResponse(
    {
      [SYNC_STORAGE_KEYS.DEFINED_GROUPS]: definedGroups,
      [SYNC_STORAGE_KEYS.SUBSCRIPTIONS]: subscriptions,
    },
    STRINGS.groupDeleteSuccess(groupName),
    { deletedGroup: groupName }
  );
}

export async function renameGroupDirect(oldName, newName) {
  if (!newName || typeof newName !== 'string' || newName.trim().length === 0) {
    return { success: false, message: STRINGS.invalidGroupName };
  }
  const trimmedNewName = newName.trim();
  let definedGroups = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS, []);
  let subscriptions = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, {});

  if (definedGroups.includes(trimmedNewName) && oldName !== trimmedNewName) {
    return { success: false, message: STRINGS.groupExists(trimmedNewName) };
  }

  definedGroups = definedGroups.map(g => (g === oldName ? trimmedNewName : g));
  for (const deviceId in subscriptions) {
    subscriptions[deviceId] = subscriptions[deviceId].map(sub => (sub === oldName ? trimmedNewName : sub));
  }

  return updateStorageAndGetResponse(
    {
      [SYNC_STORAGE_KEYS.DEFINED_GROUPS]: definedGroups.sort(),
      [SYNC_STORAGE_KEYS.SUBSCRIPTIONS]: subscriptions,
    },
    STRINGS.groupRenameSuccess(trimmedNewName),
    { renamedGroup: trimmedNewName }
  );
}

export async function subscribeToGroupDirect(groupName) {
  const instanceId = await getInstanceId();
  let subscriptions = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, {});
  if (!subscriptions[instanceId]) {
    subscriptions[instanceId] = [];
  }
  if (!subscriptions[instanceId].includes(groupName)) {
    subscriptions[instanceId].push(groupName);
    subscriptions[instanceId].sort();
  }
  return updateStorageAndGetResponse(
    { [SYNC_STORAGE_KEYS.SUBSCRIPTIONS]: subscriptions },
    `Subscribed to "${groupName}".`, // Consider moving to STRINGS
    { subscribedGroup: groupName }
  );
}

export async function unsubscribeFromGroupDirect(groupName) {
  const instanceId = await getInstanceId();
  let subscriptions = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, {});
  if (subscriptions[instanceId]) {
    subscriptions[instanceId] = subscriptions[instanceId].filter(sub => sub !== groupName);
  }
  return updateStorageAndGetResponse(
    { [SYNC_STORAGE_KEYS.SUBSCRIPTIONS]: subscriptions },
    `Unsubscribed from "${groupName}".`, // Consider moving to STRINGS
    { unsubscribedGroup: groupName }
  );
}

export async function renameDeviceDirect(deviceId, newName) {
  if (!newName || typeof newName !== 'string' || newName.trim().length === 0) {
    return { success: false, message: STRINGS.invalidDeviceName };
  }
  const trimmedNewName = newName.trim();
  let deviceRegistry = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {});
  if (deviceRegistry[deviceId]) {
    deviceRegistry[deviceId].name = trimmedNewName;
    deviceRegistry[deviceId].lastSeen = Date.now(); // Update lastSeen on modification
  } else {
    return { success: false, message: "Device not found in registry." }; // STRINGS
  }
  return updateStorageAndGetResponse(
    { [SYNC_STORAGE_KEYS.DEVICE_REGISTRY]: deviceRegistry },
    STRINGS.deviceRenameSuccess(trimmedNewName),
    { renamedDevice: trimmedNewName }
  );
}

export async function deleteDeviceDirect(deviceId) {
  let deviceRegistry = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {});
  let subscriptions = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, {});
  const deviceName = deviceRegistry[deviceId]?.name || "Unknown Device";

  if (deviceRegistry[deviceId]) {
    delete deviceRegistry[deviceId];
  }
  if (subscriptions[deviceId]) {
    delete subscriptions[deviceId];
  }
  // Consider cleaning up tasks sent BY this device if relevant

  return updateStorageAndGetResponse(
    {
      [SYNC_STORAGE_KEYS.DEVICE_REGISTRY]: deviceRegistry,
      [SYNC_STORAGE_KEYS.SUBSCRIPTIONS]: subscriptions,
    },
    STRINGS.deviceDeleteSuccess(deviceName),
    { deletedDevice: deviceName }
  );
}

// --- Unified Actions (decide between direct call or background message) ---

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

export async function renameDeviceUnified(deviceId, newName, isAndroid) {
  if (isAndroid) {
    // On Android, if it's the current device, update its name directly.
    // Renaming other devices from Android might not be a primary use case,
    // but if needed, it would also be a direct storage modification.
    const instanceId = await getInstanceId();
    if (deviceId === instanceId) {
        // Update local storage for instance name if it's self
        await storage.set(browser.storage.local, { [LOCAL_STORAGE_KEYS.INSTANCE_NAME_OVERRIDE]: newName.trim() });
    }
    return renameDeviceDirect(deviceId, newName);
  } else {
    return browser.runtime.sendMessage({ action: "renameDevice", deviceId, newName });
  }
}

// Add other unified actions (createGroup, deleteGroup, deleteDevice) if needed,
// following the pattern of checking `isAndroid` and either calling the Direct
// function or sending a message to the background script.
// For options.js, many of these are already handled by checking isAndroid before calling
// the Direct version or sending a message. The Unified versions here are useful
// if other parts of the extension (e.g., popup) need these actions without
// repeating the isAndroid check.