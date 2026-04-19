import { LOCAL_STORAGE_KEYS, STRINGS } from "../common/constants.js";
import { storage } from "../core/storage.js";
import {
  createGroupDirect,
  deleteGroupDirect,
  renameGroupDirect,
  subscribeToGroupDirect,
  unsubscribeFromGroupDirect,
} from "../core/actions.js";
import { createAndStoreGroupTask } from "../core/tasks.js";
import { refreshListeners } from "./firebase-transport.js";

export function initMessageHandlers() {
  browser.runtime.onMessage.addListener(async (message, sender) => {
    console.log(`Background:runtime.onMessage - Received action: '${message.action}' from sender:`, sender?.tab?.id || sender?.id || "unknown");

    switch (message.action) {
      case "getState": {
        console.log("Background:runtime.onMessage - Handling 'getState'.");
        const subscriptions = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []);
        return { 
          subscriptions, 
          definedGroups: [...subscriptions].sort() 
        };
      }

      case "createGroup":
        if (message.groupName && typeof message.groupName === 'string' && message.groupName.trim().length !== 0) {
          return await createGroupDirect(message.groupName.trim());
        }
        return { success: false, message: STRINGS.invalidGroupName };

      case "deleteGroup":
        if (!message.groupName) return { success: false, message: STRINGS.noGroupNameProvided };
        return await deleteGroupDirect(message.groupName);

      case "renameGroup": {
        const { oldName, newName } = message;
        if (oldName && newName && typeof newName === 'string' && newName.trim().length !== 0) {
          return await renameGroupDirect(oldName, newName.trim());
        }
        return { success: false, message: STRINGS.invalidGroupName };
      }

      case "subscribeToGroup": {
        const groupName = message.groupName;
        if (!groupName) return { success: false, message: STRINGS.noGroupNameProvided };
        return await subscribeToGroupDirect(groupName);
      }
 
      case "unsubscribeFromGroup": {
        const groupName = message.groupName;
        if (!groupName) return { success: false, message: STRINGS.noGroupNameProvided };
        return await unsubscribeFromGroupDirect(groupName);
      }

      case "sendTabFromPopup": {
        const { groupName, tabData } = message;
        return await createAndStoreGroupTask(groupName, tabData);
      }

      case "testNotification":
        await browser.notifications.create({
          type: "basic",
          iconUrl: browser.runtime.getURL("icons/icon-48.png"),
          title: STRINGS.notificationTestTitle,
          message: STRINGS.notificationTestMessage
        });
        return { success: true };

      case "heartbeat":
        return { success: true, message: "Heartbeat processed." };

      default:
        console.warn(`Background:runtime.onMessage - Unknown action received: '${message.action}'`);
        return { success: false, message: STRINGS.actionUnknown(message.action) };
    }
  });

  browser.storage.onChanged.addListener(async (changes, areaName) => {
    console.log(`Background:storage.onChanged - Detected in area: '${areaName}'. Changes:`, JSON.stringify(changes));
    
    let itemsToNotify = new Set();
    let shouldRefreshListeners = false;

    if (areaName === "local") {
      if (changes[LOCAL_STORAGE_KEYS.LAST_SYNC_TIME]) {
        itemsToNotify.add("lastSyncTimeChanged");
      }
      if (changes[LOCAL_STORAGE_KEYS.SUBSCRIPTIONS]) {
        itemsToNotify.add("subscriptionsChanged");
        shouldRefreshListeners = true;
      }
      if (changes[LOCAL_STORAGE_KEYS.SYNC_PASSWORD]) {
        shouldRefreshListeners = true;
      }
      if (changes[LOCAL_STORAGE_KEYS.GROUP_ID]) {
        shouldRefreshListeners = true;
      }
    }

    if (shouldRefreshListeners) {
      console.log("Background: Storage change detected, refreshing Firebase listeners...");
      await refreshListeners();
    }

    if (itemsToNotify.size > 0) {
      try {
        await browser.runtime.sendMessage({
          action: "specificSyncDataChanged",
          changedItems: Array.from(itemsToNotify)
        });
      } catch (err) {
        // UI might be closed, ignore
        if (!err.message?.includes("Could not establish connection") && !err.message?.includes("Receiving end does not exist")) {
          console.warn("Background:storage.onChanged - Could not send specificSyncDataChanged message:", err.message);
        }
      }
    }
  });
}
