import { storage} from "./storage.js";
import { SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS, STRINGS } from "../common/constants.js";
import { getInstanceId, getInstanceName, setInstanceName as setInstanceNameInCore } from "./instance.js";

/**
 * Retrieves the unified state of the application.
 * @param {boolean} isAndroid - Whether the current platform is Android.
 * @returns {Promise<object>} The application state.
 */
export async function getUnifiedState(isAndroid) {
  try {
    const instanceId = await getInstanceId();
    // Get current device name (authoritative for UI, prioritizes local override)
    const instanceName = await getInstanceName();
    // Explicitly get the local override to determine if it's set
    const localNameOverride = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.INSTANCE_NAME_OVERRIDE, "");

    let deviceRegistry = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {});
    let definedGroups = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS, []);
    let subscriptions = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, {});
    let groupTasks = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_TASKS, {});

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
      // Only update the name in sync registry if a local override is explicitly set
      // AND it differs from the name currently in the sync registry.
      if (localNameOverride.trim() !== "" && deviceRegistry[instanceId].name !== localNameOverride.trim()) {
        deviceRegistry[instanceId].name = localNameOverride.trim();
        deviceRegistryNeedsUpdate = true;
      }
    }

    if (deviceRegistryNeedsUpdate) {
      await storage.set(browser.storage.sync, { [SYNC_STORAGE_KEYS.DEVICE_REGISTRY]: deviceRegistry });
    }

    // subscriptions is { groupName: [deviceId] }.
    // We need to derive this device's subscriptions for the UI.
    const deviceSubscriptions = [];
    for (const groupName in subscriptions) {
      if (subscriptions[groupName] && subscriptions[groupName].includes(instanceId)) {
        deviceSubscriptions.push(groupName);
      }
    }

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
  // Remove the group key from the subscriptions object
  if (subscriptions[groupName]) delete subscriptions[groupName];
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
    // Rename the group key in subscriptions
  if (subscriptions[oldName]) {
    subscriptions[trimmedNewName] = subscriptions[oldName];
    delete subscriptions[oldName];
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

  // Also update local subscriptions for immediate UI consistency
  let localSubscriptions = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []);
  if (!localSubscriptions.includes(groupName)) {
    localSubscriptions.push(groupName);
    localSubscriptions.sort();
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, localSubscriptions);
  }

  let subscriptions = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, {});
  // Check if already subscribed in sync
  if (subscriptions[groupName] && subscriptions[groupName].includes(instanceId)) {
     return { success: true, message: `Already subscribed to "${groupName}".`, subscribedGroup: groupName };
  }
  // Add device to the group's subscriber list in sync
  if (!subscriptions[groupName]) {
    subscriptions[groupName] = [];
  }
  subscriptions[groupName].push(instanceId);
  subscriptions[groupName].sort();
  
  const success = await storage.set(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, subscriptions);

  if (success) {
    return { success: true, message: `Subscribed to "${groupName}".`, subscribedGroup: groupName };
  }
  return { success: false, message: "Failed to save subscription." };
}

export async function unsubscribeFromGroupDirect(groupName) {
  const instanceId = await getInstanceId();
  let syncSubscriptions = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, {});
  if (syncSubscriptions[groupName]) {
    const initialLength = syncSubscriptions[groupName].length;
    syncSubscriptions[groupName] = syncSubscriptions[groupName].filter(id => id !== instanceId);
    if (syncSubscriptions[groupName].length === 0) {
      delete syncSubscriptions[groupName]; // Clean up empty group entry
    }
    if (syncSubscriptions[groupName].length < initialLength) { // If something was actually removed
      const success = await storage.set(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, syncSubscriptions);
      if (success) {
        // Also update local subscriptions for immediate UI consistency
        let localSubscriptions = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []);
        localSubscriptions = localSubscriptions.filter(sub => sub !== groupName);
        await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, localSubscriptions);
        return { success: true, message: `Unsubscribed from "${groupName}".`, unsubscribedGroup: groupName };
      }
      return { success: false, message: "Failed to save unsubscription to sync." };
    }
  }
  // If not found in sync, it means it wasn't subscribed (or sync is stale).
  // Treat as success for unsubscription action.
  return { success: true, message: `Not subscribed to "${groupName}".`, unsubscribedGroup: groupName };
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
    return await setInstanceNameInCore(newName.trim());
  } else {
    return browser.runtime.sendMessage({ action: "renameDevice", newName });
  }
}

// Add other unified actions (createGroup, deleteGroup, deleteDevice) if needed,
// following the pattern of checking `isAndroid` and either calling the Direct
// function or sending a message to the background script.
// For options.js, many of these are already handled by checking isAndroid before calling
// the Direct version or sending a message. The Unified versions here are useful
// if other parts of the extension (e.g., popup) need these actions without
// repeating the isAndroid check.