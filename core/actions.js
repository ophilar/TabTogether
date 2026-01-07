import { storage } from "./storage.js"; // Assuming getRootBookmarkFolder etc are exported or accessible
import { SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS, STRINGS } from "../common/constants.js";

/**
 * Retrieves the unified state of the application.
 * @param {boolean} isAndroid - Whether the current platform is Android.
 * @returns {Promise<object>} The application state.
 */
export async function getUnifiedState(isAndroid) {
  try {
    let subscriptions = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []);

    const definedGroups = await getDefinedGroupsFromBookmarks(); // Helper to get group names from bookmark folders
    const groupTasks = {}; // Tasks are individual bookmarks, not fetched as a single object here.
    const nickname = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.DEVICE_NICKNAME, "Unknown Device");
    const history = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.TAB_HISTORY, []);

    return {
      subscriptions,
      definedGroups: definedGroups.sort(),
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

export async function getDefinedGroupsFromBookmarks() {
  const rootFolder = await storage.getRootBookmarkFolder();
  if (!rootFolder) return [];
  const children = await browser.bookmarks.getChildren(rootFolder.id);
  return children.filter(child => !child.url && child.title !== SYNC_STORAGE_KEYS.CONFIG_BOOKMARK_TITLE) // Access via SYNC_STORAGE_KEYS
    .map(folder => folder.title);
}

// --- Direct Actions (primarily for Android or when background script is unavailable) ---
export async function createGroupDirect(groupName) {
  if (!groupName || typeof groupName !== 'string' || groupName.trim().length === 0) {
    return { success: false, message: STRINGS.invalidGroupName };
  }
  const trimmedGroupName = groupName.trim();
  const rootFolder = await storage.getRootBookmarkFolder();
  if (!rootFolder) {
    return { success: false, message: "Could not access root bookmark folder." };
  }

  const definedGroups = await getDefinedGroupsFromBookmarks();
  if (definedGroups.includes(trimmedGroupName)) {
    return { success: false, message: STRINGS.groupExists(trimmedGroupName) };
  }
  const groupFolder = await storage.getGroupBookmarkFolder(trimmedGroupName, rootFolder.id); // This creates if not exists
  const success = !!groupFolder;
  console.log(`Actions: Created group "${trimmedGroupName}" (success: ${success})`);
  if (success) {
    return { success: true, message: STRINGS.groupCreateSuccess(trimmedGroupName), newGroup: trimmedGroupName };
  }
  return { success: false, message: "Failed to save new group." };
}

export async function deleteGroupDirect(groupName) {
  const rootFolder = await storage.getRootBookmarkFolder();
  let groupsSuccess = false;
  if (rootFolder) {
    const groupFolder = await storage.getGroupBookmarkFolder(groupName, rootFolder.id); // Gets existing
    if (groupFolder) {
      await browser.bookmarks.removeTree(groupFolder.id); // removeTree deletes folder and contents
      groupsSuccess = true;
    } else { groupsSuccess = true; /* Group didn't exist, so deletion is "successful" */ }
  }
  console.log(`Actions: Deleted group "${groupName}" (groupsSuccess: ${groupsSuccess})`);

  // Remove the group key from the local subscriptions object
  let localSubscriptions = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []);
  if (localSubscriptions.includes(groupName)) { // Corrected: condition and array manipulation
    localSubscriptions = localSubscriptions.filter(g => g !== groupName);
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, localSubscriptions);
  }

  // Tasks are deleted when the bookmark folder is removed.
  const tasksSuccess = true;

  if (groupsSuccess && tasksSuccess) {
    return { success: true, message: STRINGS.groupDeleteSuccess(groupName), deletedGroup: groupName };
  }
  return { success: false, message: "Failed to fully delete group its tasks and update subscriptions." };
}

export async function renameGroupDirect(oldName, newName) {
  if (!newName || typeof newName !== 'string' || newName.trim().length === 0) {
    return { success: false, message: STRINGS.invalidGroupName };
  }
  const trimmedNewName = newName.trim();
  const rootFolder = await storage.getRootBookmarkFolder();
  if (!rootFolder) {
    return { success: false, message: "Could not access root bookmark folder." };
  }


  // Rename the group key in local subscriptions
  let localSubscriptions = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []);
  if (localSubscriptions.includes(oldName)) { // Corrected: array check and update
    localSubscriptions = localSubscriptions.map(g => (g === oldName ? trimmedNewName : g));
    // Ensure the new name isn't duplicated if it somehow already existed (unlikely for a rename target)
    // and then sort.
    localSubscriptions = [...new Set(localSubscriptions)].sort();
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, localSubscriptions);
    console.log(`Actions: Renamed local subscription "${oldName}" to "${trimmedNewName}"`);
  }

  const definedGroups = await getDefinedGroupsFromBookmarks();

  if (definedGroups.includes(trimmedNewName) && oldName !== trimmedNewName) {
    return { success: false, message: STRINGS.groupExists(trimmedNewName) };
  }

  let groupsSuccess = false;
  let tasksSuccess = true;

  const groupFolderToRename = await storage.getGroupBookmarkFolder(oldName, rootFolder.id);
  if (groupFolderToRename) {
    await browser.bookmarks.update(groupFolderToRename.id, { title: trimmedNewName });
    groupsSuccess = true;
  } else {
    // Old group folder didn't exist, perhaps create new one or error?
    // For now, let's say if old doesn't exist, rename is not applicable in this context.
    return { success: false, message: `Group "${oldName}" not found to rename.` };
  }
  console.log(`Actions: Renamed group "${oldName}" to "${trimmedNewName}" (groupsSuccess: ${groupsSuccess})`);
  if (groupsSuccess && tasksSuccess) {
    return { success: true, message: STRINGS.groupRenameSuccess(trimmedNewName), renamedGroup: trimmedNewName };
  }
  return { success: false, message: "Failed to fully rename group and update subscriptions." };
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
