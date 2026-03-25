import { LOCAL_STORAGE_KEYS, SYNC_STORAGE_KEYS, STRINGS } from "../common/constants.js";
import { storage, recordSuccessfulSyncTime } from "../core/storage.js";
import {
  createGroupDirect,
  deleteGroupDirect,
  renameGroupDirect,
  _addDeviceSubscriptionToGroup,
  _removeDeviceSubscriptionFromGroup,
  getDefinedGroupsFromBookmarks,
} from "../core/actions.js";
import { createAndStoreGroupTask, processSubscribedGroupTasks } from "../core/tasks.js";
import { ALARM_PERIODIC_SYNC } from "./alarms.js";

export async function notifyOptionsPageGroupsChanged() {
  try {
    await browser.runtime.sendMessage({ action: "specificSyncDataChanged", changedItems: ["definedGroupsChanged"] });
  } catch (error) {
    if (!error.message?.includes("Could not establish connection") && !error.message?.includes("Receiving end does not exist")) {
      console.warn("Background:notifyOptionsPageGroupsChanged - Could not send message to options page:", error.message);
    }
  }
}

export function initMessageHandlers() {
  browser.runtime.onMessage.addListener(async (request, sender) => {
    console.log(`Background:runtime.onMessage - Received action: '${request.action}' from sender:`, sender?.tab?.id || sender?.id || 'unknown');

    switch (request.action) {
      case "getState": {
        console.log("Background:runtime.onMessage - Handling 'getState'.");
        const [
          localSubscriptions,
          definedGroups,
        ] = await Promise.all([
          storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []),
          getDefinedGroupsFromBookmarks(),
        ]);
        return {
          subscriptions: localSubscriptions,
          definedGroups: definedGroups.sort(),
        };
      }

      case "createGroup": {
        console.log(`Background:runtime.onMessage - Handling 'createGroup' with name: "${request.groupName}"`);
        if (
          !request.groupName ||
          typeof request.groupName !== "string" ||
          request.groupName.trim().length === 0
        ) {
          return { success: false, message: STRINGS.invalidGroupName };
        }
        return await createGroupDirect(request.groupName.trim());
      }
      case "deleteGroup": {
        console.log(`Background:runtime.onMessage - Handling 'deleteGroup' with name: "${request.groupName}"`);
        if (!request.groupName) {
          return { success: false, message: STRINGS.noGroupNameProvided };
        }
        return await deleteGroupDirect(request.groupName);
      }
      case "renameGroup": {
        console.log(`Background:runtime.onMessage - Handling 'renameGroup' from "${request.oldName}" to "${request.newName}"`);
        const { oldName, newName } = request;
        if (!oldName || !newName || typeof newName !== "string" || newName.trim().length === 0
        ) {
          return { success: false, message: STRINGS.invalidGroupName };
        }
        return await renameGroupDirect(oldName, newName.trim());
      }

      case "subscribeToGroup": {
        console.log(`Background:runtime.onMessage - Handling 'subscribeToGroup' for group: "${request.groupName}"`);
        const groupToSubscribe = request.groupName;

        if (!groupToSubscribe) {
          return { success: false, message: STRINGS.noGroupNameProvided };
        }
        return await _addDeviceSubscriptionToGroup(groupToSubscribe);
      }
      case "unsubscribeFromGroup": {
        console.log(`Background:runtime.onMessage - Handling 'unsubscribeFromGroup' for group: "${request.groupName}"`);
        const groupToUnsubscribe = request.groupName;

        if (!groupToUnsubscribe) {
          return { success: false, message: STRINGS.noGroupNameProvided };
        }
        return await _removeDeviceSubscriptionFromGroup(groupToUnsubscribe);
      }
      case "sendTabFromPopup": {
        console.log(`Background:runtime.onMessage - Handling 'sendTabFromPopup' for group: "${request.groupName}"`);
        const { groupName, tabData } = request;
        return await createAndStoreGroupTask(groupName, tabData);
      }
      case "testNotification": {
        console.log("Background:runtime.onMessage - Handling 'testNotification'.");
        await browser.notifications.create({
          type: "basic",
          iconUrl: browser.runtime.getURL("icons/icon-48.png"),
          title: STRINGS.notificationTestTitle,
          message: STRINGS.notificationTestMessage,
        });
        return { success: true };
      }
      case "setSyncInterval": {
        console.log(`Background:runtime.onMessage - Handling 'setSyncInterval' to ${request.minutes} minutes.`);
        const minutes = Math.max(
          1,
          Math.min(120, parseInt(request.minutes, 10) || 5)
        );
        browser.alarms.create(ALARM_PERIODIC_SYNC, {
          periodInMinutes: minutes,
        });
        return { success: true };
      }
      default:
        console.warn(`Background:runtime.onMessage - Unknown action received: '${request.action}'`);
        return { success: false, message: STRINGS.actionUnknown(request.action) };
    }
  });

  browser.storage.onChanged.addListener(async (changes, areaName) => {
    console.log(`Background:storage.onChanged - Detected in area: '${areaName}'. Changes:`, JSON.stringify(changes));
    let refreshActionsForOptions = new Set();

    if (areaName === "sync") {
      if (changes[SYNC_STORAGE_KEYS.TASK_EXPIRY_DAYS]) {
        console.log("Background:storage.onChanged - TASK_EXPIRY_DAYS changed.");
      }
    } else if (areaName === "local") {
      if (changes[LOCAL_STORAGE_KEYS.LAST_SYNC_TIME]) {
        console.log("Background:storage.onChanged - LAST_SYNC_TIME changed.");
        refreshActionsForOptions.add("lastSyncTimeChanged");
      }
    }

    if (refreshActionsForOptions.size > 0) {
      try {
        await browser.runtime.sendMessage({
          action: "specificSyncDataChanged",
          changedItems: Array.from(refreshActionsForOptions)
        });
      } catch (error) {
        if (
          !error.message?.includes("Could not establish connection") &&
          !error.message?.includes("Receiving end does not exist")
        ) {
          console.warn("Background:storage.onChanged - Could not send specificSyncDataChanged message to options page (it might be closed):", error.message);
        }
      }
    }
  });
}
