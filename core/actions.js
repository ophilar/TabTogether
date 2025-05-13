// core/actions.js

import { storage} from "./storage.js";
import { SYNC_STORAGE_KEYS, STRINGS } from "../common/constants.js";
import { getInstanceId, getInstanceName, setInstanceName as setInstanceNameInCore } from "./instance.js";

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

    // Ensure subscriptions format is an array for the current device - CORRECTED. Use subscriptios object and extract the array for this device
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
  let subscriptions = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, {});

  definedGroups = definedGroups.filter(g => g !== groupName);
  for (const deviceId in subscriptions) {
    subscriptions[deviceId] = subscriptions[deviceId].filter(sub => sub !== groupName);
  }
  // Consider also deleting tasks associated with this group from GROUP_TASKS
  const groupsSuccess = await storage.set(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS, definedGroups);
  const subsSuccess = await storage.set(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, subscriptions);

  if (groupsSuccess && subsSuccess) {
    return { success: true, message: STRINGS.groupDeleteSuccess(groupName), deletedGroup: groupName };
  }
  return { success: false, message: "Failed to fully delete group and update subscriptions." };
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

  const groupsSuccess = await storage.set(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS, definedGroups.sort());
  const subsSuccess = await storage.set(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, subscriptions);

  if (groupsSuccess && subsSuccess) {
    return { success: true, message: STRINGS.groupRenameSuccess(trimmedNewName), renamedGroup: trimmedNewName };
  }
  return { success: false, message: "Failed to fully rename group and update subscriptions." };
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
  const success = await storage.set(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, subscriptions);
  if (success) {
    return { success: true, message: `Subscribed to "${groupName}".`, subscribedGroup: groupName };
  }
  return { success: false, message: "Failed to save subscription." };
}

export async function unsubscribeFromGroupDirect(groupName) {
  const instanceId = await getInstanceId();
  let subscriptions = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, {});
  if (subscriptions[instanceId]) {
    subscriptions[instanceId] = subscriptions[instanceId].filter(sub => sub !== groupName);
  }
  const success = await storage.set(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, subscriptions);
  if (success) {
    return { success: true, message: `Unsubscribed from "${groupName}".`, unsubscribedGroup: groupName };
  }
  return { success: false, message: "Failed to save unsubscription." };
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
  const success = await storage.set(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, deviceRegistry);
  if (success) {
    return { success: true, message: STRINGS.deviceRenameSuccess(trimmedNewName), renamedDevice: trimmedNewName };
  }
  return { success: false, message: "Failed to save device rename." };
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

  const registrySuccess = await storage.set(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, deviceRegistry);
  const subsSuccess = await storage.set(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, subscriptions);

  if (registrySuccess && subsSuccess) {
    return { success: true, message: STRINGS.deviceDeleteSuccess(deviceName), deletedDevice: deviceName };
  }
  return { success: false, message: "Failed to fully delete device and update subscriptions." };
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
    const instanceId = await getInstanceId();
    if (deviceId === instanceId) {
        return await setInstanceNameInCore(newName.trim()); // Use instance.setInstanceName for current device
    }
    return renameDeviceDirect(deviceId, newName.trim()); // For other devices on Android, update sync directly
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