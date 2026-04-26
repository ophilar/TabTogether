import { storage } from "./storage.js";
import { LOCAL_STORAGE_KEYS, STRINGS } from "../common/constants.js";
import { getGroupMembers } from "../background/firebase-transport.js";

/**
 * Retrieves the unified state of the application.
 */
export async function getUnifiedState(isAndroid) {
  try {
    const [subscriptions, nickname, history] = await Promise.all([
      storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []),
      storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.DEVICE_NICKNAME, "Unknown Device"),
      storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.TAB_HISTORY, [])
    ]);

    // Track presence for all subscribed groups
    const groupMembersArray = await Promise.all(
      subscriptions.map(async (group) => ({
        group,
        members: await getGroupMembers(group)
      }))
    );
    const groupMembers = {};
    for (const { group, members } of groupMembersArray) {
      groupMembers[group] = members;
    }

    return {
      subscriptions,
      definedGroups: [...subscriptions].sort(),
      groupMembers,
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

// --- Direct Actions ---
export async function createGroupDirect(groupName) {
  if (!groupName || typeof groupName !== 'string' || groupName.trim().length === 0) {
    return { success: false, message: STRINGS.invalidGroupName };
  }
  const trimmedGroupName = groupName.trim();
  await subscribeToGroupDirect(trimmedGroupName);
  return { success: true, message: STRINGS.groupCreateSuccess(trimmedGroupName), newGroup: trimmedGroupName };
}

export async function deleteGroupDirect(groupName) {
  await unsubscribeFromGroupDirect(groupName);
  return { success: true, message: STRINGS.groupDeleteSuccess(groupName), deletedGroup: groupName };
}

export async function renameGroupDirect(oldName, newName) {
  if (!newName || typeof newName !== 'string' || newName.trim().length === 0) {
    return { success: false, message: STRINGS.invalidGroupName };
  }
  const trimmedNewName = newName.trim();

  let localSubscriptions = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []);
  if (localSubscriptions.includes(oldName)) {
    localSubscriptions = localSubscriptions.map(g => (g === oldName ? trimmedNewName : g));
    localSubscriptions = [...new Set(localSubscriptions)].sort();
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, localSubscriptions);
  }

  return { success: true, message: STRINGS.groupRenameSuccess(trimmedNewName), renamedGroup: trimmedNewName };
}

export async function subscribeToGroupDirect(groupName) {
  let localSubscriptions = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []);
  if (!localSubscriptions.includes(groupName)) {
    localSubscriptions.push(groupName);
    localSubscriptions = [...new Set(localSubscriptions)].sort();
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, localSubscriptions);
    return { success: true, message: `Subscribed to ${groupName}`, subscribedGroup: groupName };
  }
  return { success: true, subscribedGroup: groupName };
}

export async function unsubscribeFromGroupDirect(groupName) {
  let localSubscriptions = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []);
  if (localSubscriptions.includes(groupName)) {
    localSubscriptions = localSubscriptions.filter(sub => sub !== groupName);
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, localSubscriptions);
  }
  return { success: true, unsubscribedGroup: groupName };
}

// --- Unified Actions ---
export async function createGroupUnified(groupName, isAndroid) {
  return isAndroid ? createGroupDirect(groupName) : browser.runtime.sendMessage({ action: "createGroup", groupName });
}

export async function deleteGroupUnified(groupName, isAndroid) {
  return isAndroid ? deleteGroupDirect(groupName) : browser.runtime.sendMessage({ action: "deleteGroup", groupName });
}

export async function renameGroupUnified(oldName, newName, isAndroid) {
  return isAndroid ? renameGroupDirect(oldName, newName) : browser.runtime.sendMessage({ action: "renameGroup", oldName, newName });
}

export async function subscribeToGroupUnified(groupName, isAndroid) {
  return isAndroid ? subscribeToGroupDirect(groupName) : browser.runtime.sendMessage({ action: "subscribeToGroup", groupName });
}

export async function unsubscribeFromGroupUnified(groupName, isAndroid) {
  return isAndroid ? unsubscribeFromGroupDirect(groupName) : browser.runtime.sendMessage({ action: "unsubscribeFromGroup", groupName });
}
