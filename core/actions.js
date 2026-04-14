import { storage } from "./storage.js";
import { SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS, STRINGS } from "../common/constants.js";

/**
 * Retrieves the unified state of the application.
 * @param {boolean} isAndroid - Whether the current platform is Android.
 * @returns {Promise<object>} The application state.
 */
export async function getUnifiedState(isAndroid) {
  try {
    const [subscriptions, nickname, history] = await Promise.all([
      storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []),
      storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.DEVICE_NICKNAME, "Unknown Device"),
      storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.TAB_HISTORY, [])
    ]);

    const groupTasks = {};

    return {
      subscriptions,
      definedGroups: subscriptions.sort(), // In the new architecture, definedGroups are basically your subscriptions
      groupTasks,
      isAndroid,
      nickname,
      history,
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

  // Since groups are now managed implicitly via subscription to the synced groupId
  // creating a group just means subscribing to it locally.
  await _addDeviceSubscriptionToGroup(trimmedGroupName);

  return { success: true, message: STRINGS.groupCreateSuccess(trimmedGroupName), newGroup: trimmedGroupName };
}

export async function deleteGroupDirect(groupName) {
  // Remove the group key from the local subscriptions object
  await _removeDeviceSubscriptionFromGroup(groupName);

  return { success: true, message: STRINGS.groupDeleteSuccess(groupName), deletedGroup: groupName };
}

export async function renameGroupDirect(oldName, newName) {
  if (!newName || typeof newName !== 'string' || newName.trim().length === 0) {
    return { success: false, message: STRINGS.invalidGroupName };
  }
  const trimmedNewName = newName.trim();

  // Rename the group key in local subscriptions
  let localSubscriptions = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []);
  if (localSubscriptions.includes(oldName)) {
    localSubscriptions = localSubscriptions.map(g => (g === oldName ? trimmedNewName : g));
    localSubscriptions = [...new Set(localSubscriptions)].sort();
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, localSubscriptions);
    console.log(`Actions: Renamed local subscription "${oldName}" to "${trimmedNewName}"`);
  }

  return { success: true, message: STRINGS.groupRenameSuccess(trimmedNewName), renamedGroup: trimmedNewName };
}

/**
 * Internal helper to add a device's subscription to a group, updating both local and sync storage.
 * @param {string} groupName - The name of the group to subscribe to.
 * @returns {Promise<{success: boolean, message?: string, subscribedGroup?: string}>}
 * @private
 */
async function _addDeviceSubscriptionToGroup(groupName) {
  let localSubscriptions = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []);
  if (!localSubscriptions.includes(groupName)) {
    localSubscriptions.push(groupName);
    localSubscriptions = [...new Set(localSubscriptions)].sort();
    const success = await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, localSubscriptions);
    if (success) {
      console.log(`Actions: Added local subscription to group "${groupName}"`);
      return { success: true, message: STRINGS.subscribedToGroup(groupName), subscribedGroup: groupName };
    } else {
      console.error(`Actions: Failed to save local subscription for group "${groupName}"`);
      return { success: false, message: STRINGS.failedToSubscribe };
    }
  } else {
    // Already subscribed, consider it a success.
    console.log(`Actions: Already subscribed to group "${groupName}"`);
    return { success: true, message: STRINGS.subscribedToGroup(groupName), subscribedGroup: groupName };
  }
}

/**
 * Internal helper to remove a device's subscription from a group, updating both local and sync storage.
 * @param {string} groupName - The name of the group to unsubscribe from.
 * @returns {Promise<{success: boolean, message?: string, unsubscribedGroup?: string}>}
 * @private
 */
async function _removeDeviceSubscriptionFromGroup(groupName) {
  // Update local subscriptions
  let changed = false;
  let localSubscriptions = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []);
  if (localSubscriptions.includes(groupName)) {
    localSubscriptions = localSubscriptions.filter(sub => sub !== groupName);
    const success = await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, localSubscriptions);
    if (success) {
      console.log(`Actions: Removed local subscription for group "${groupName}"`);
      changed = true;
    } else {
      console.error(`Actions: Failed to save removal of local subscription for group "${groupName}"`);
      return { success: false, message: STRINGS.failedToUnsubscribe };
    }
  }
  return { success: true, message: changed ? STRINGS.unsubscribedFromGroup(groupName) : `Not subscribed to "${groupName}".`, unsubscribedGroup: groupName };
}

export async function subscribeToGroupDirect(groupName) {
  return _addDeviceSubscriptionToGroup(groupName);
}

export async function unsubscribeFromGroupDirect(groupName) {
  return _removeDeviceSubscriptionFromGroup(groupName);
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

export { _addDeviceSubscriptionToGroup, _removeDeviceSubscriptionFromGroup };
