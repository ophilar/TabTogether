import { SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS, STRINGS } from "../common/constants.js";
import { storage } from "../core/storage.js";
import {
  getInstanceId,
  getInstanceName,
  setInstanceName as setInstanceNameInCore,
} from "../core/instance.js";
import {
  createGroupDirect,
  deleteGroupDirect,
  renameGroupDirect,
  deleteDeviceDirect,
  _addDeviceSubscriptionToGroup, // Assuming exported from actions.js
  _removeDeviceSubscriptionFromGroup, // Assuming exported from actions.js
} from "../core/actions.js";
import { createAndStoreGroupTask } from "../core/tasks.js";
import { processIncomingTasks } from "./task-processor.js";
import { performHeartbeat } from "./heartbeat.js";
import {
  performTimeBasedTaskCleanup,
} from "./cleanup.js";

const ALARM_HEARTBEAT = "deviceHeartbeat";
const ALARM_STALE_CHECK = "staleDeviceCheck";
const ALARM_TASK_CLEANUP = "taskCleanup";

const HEARTBEAT_INTERVAL_MIN = 5;
const STALE_CHECK_INTERVAL_MIN = 60 * 24;
const TASK_CLEANUP_INTERVAL_MIN = 60 * 24 * 2;

const BACKGROUND_DEFAULT_TASK_EXPIRY_DAYS = 30;

async function initializeExtension() {
  console.log("Background: Initializing TabTogether (Advanced)...");
  try {
    console.log("Background: Initializing storage...");
    const syncKeysToInitialize = Object.values(SYNC_STORAGE_KEYS);
    const syncData = await browser.storage.sync.get(syncKeysToInitialize);
    const defaults = {
      [SYNC_STORAGE_KEYS.DEFINED_GROUPS]: [],
      [SYNC_STORAGE_KEYS.GROUP_TASKS]: {},
    };
    const updates = {};
    for (const key of syncKeysToInitialize) {
      if (syncData[key] === undefined && defaults[key] !== undefined) {
        updates[key] = defaults[key];
      }
    }
    if (Object.keys(updates).length > 0) {
      await browser.storage.sync.set(updates);
      console.log("Background: Storage initialized with defaults:", updates);
    }
    let localInstanceName = await getInstanceName();
    const cachedDefinedGroups = syncData[SYNC_STORAGE_KEYS.DEFINED_GROUPS] ?? [];
    await setupAlarms();
    if (browser.contextMenus) {
      await updateContextMenu(cachedDefinedGroups);
    } else {
      console.warn("Background:initializeExtension - ContextMenus API is not available. Context menu features will be disabled.");
    }
    await performHeartbeat();
    console.log(`Background: Initialization complete. Name: ${localInstanceName}`);
  } catch (error) {
    console.error("Background: CRITICAL ERROR during initializeExtension:", error);
  }

  // console.log("Background: Initialization complete."); // Already logged inside try or if error
}

async function setupAlarms() {
  await browser.alarms.clearAll();
  console.log("Background: Setting up alarms...");
  browser.alarms.create(ALARM_TASK_CLEANUP, {
    periodInMinutes: TASK_CLEANUP_INTERVAL_MIN,
  });
}

browser.runtime.onInstalled.addListener(initializeExtension);
browser.runtime.onStartup.addListener(initializeExtension);

browser.alarms.onAlarm.addListener(async (alarm) => {
  console.log(`Background: Alarm triggered: ${alarm.name}`);
  switch (alarm.name) {
    case ALARM_TASK_CLEANUP:
      {
        console.log("Background: ALARM_TASK_CLEANUP triggered.");
        const localProcessedTasks = await storage.get(
          browser.storage.local,
          LOCAL_STORAGE_KEYS.PROCESSED_TASKS,
          {}
        );
        const taskExpiryDays = await storage.get(
          browser.storage.sync,
          SYNC_STORAGE_KEYS.TASK_EXPIRY_DAYS,
          BACKGROUND_DEFAULT_TASK_EXPIRY_DAYS
        );
        const currentTaskExpiryMs = taskExpiryDays * 24 * 60 * 60 * 1000;
        await performTimeBasedTaskCleanup(
          localProcessedTasks,
          currentTaskExpiryMs
        );
      }
      break;
  }
});

async function updateContextMenu(cachedDefinedGroups) {
  if (!browser.contextMenus) {
    console.warn("Background:updateContextMenu - ContextMenus API is not available. Skipping update.");
    return;
  }
  console.log("Background:updateContextMenu - Updating context menus.");
  await browser.contextMenus.removeAll();
  const groups =
    cachedDefinedGroups ??
    (await storage.get(
      browser.storage.sync,
      SYNC_STORAGE_KEYS.DEFINED_GROUPS,
      []
    ));
  const contexts = [
    "page",
    "link",
    "image",
    "video",
    "audio",
    "selection",
    "tab",
  ];

  try {
    if (groups.length === 0) {
      console.log("Background:updateContextMenu - No groups defined, creating disabled menu item.");
      browser.contextMenus.create({
        id: "no-groups",
        title: STRINGS.contextMenuNoGroups,
        contexts: contexts,
        enabled: false,
      });
      return;
    }

    console.log("Background:updateContextMenu - Creating parent 'Send Tab to Group' menu.");
    browser.contextMenus.create({
      id: "send-to-group-parent",
      title: STRINGS.contextMenuSendTabToGroup,
      contexts: contexts,
    });

    groups.sort().forEach((groupName) => {
      try {
        // console.log(`Background:updateContextMenu - Creating menu item for group: "${groupName}"`); // Can be verbose
        browser.contextMenus.create({
          id: `send-to-${groupName}`,
          parentId: "send-to-group-parent",
          title: groupName,
          contexts: contexts,
        });
      } catch (e) {
        console.error(
          `Background:updateContextMenu - Failed to create context menu item for group "${groupName}":`,
          e.message
        );
      }
    });
  } catch (e) {
    console.error(
      "Background:updateContextMenu - Error during top-level context menu creation:",
      e.message
    );
  }
}

if (browser.contextMenus) {
  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    console.log(
      "Background:onContextMenuClicked - Triggered. Info:", info, "Tab:", tab
    );

    const menuItemId = info.menuItemId?.toString() || "";
    if (
      !menuItemId.startsWith("send-to-") ||
      menuItemId === "send-to-group-parent"
    ) {
      return;
    }

    const groupName = menuItemId.replace("send-to-", "");

    let urlToSend = info.pageUrl;
    let titleToSend = tab?.title || "Link";

    if (info.linkUrl) {
      urlToSend = info.linkUrl;
      titleToSend = info.linkText || urlToSend;
    } else if (info.mediaType && info.srcUrl) {
      urlToSend = info.srcUrl;
      titleToSend = tab?.title || urlToSend;
    } else if (info.selectionText) {
      urlToSend = info.pageUrl || tab?.url;
      titleToSend = `"${info.selectionText}" on ${tab?.title || urlToSend}`;
    } else if (tab?.url) {
      urlToSend = tab.url;
      titleToSend = tab?.title || urlToSend;
    }

    if (!urlToSend || urlToSend === "about:blank") {
      console.error(
        "Background:onContextMenuClicked - Could not determine a valid URL to send from context:", info, "Tab:", tab
      );
      browser.notifications.create({
        type: "basic",
        iconUrl: browser.runtime.getURL("icons/icon-48.png"),
        title: STRINGS.notificationSendFailedTitle,
        message: STRINGS.notificationCannotSendLink,
      });
      return;
    }

    const tabData = { url: urlToSend, title: titleToSend };

    console.log(
      `Background:onContextMenuClicked - Sending task to group ${groupName}. URL: ${urlToSend}`
    );
    const { success, message: taskMessage } = await createAndStoreGroupTask(groupName, tabData);

    const notificationMessage = success
      ? STRINGS.notificationTabSentMessage(titleToSend, groupName)
      : taskMessage || STRINGS.sendTabFailed;

    browser.notifications.create({
      type: "basic",
      iconUrl: browser.runtime.getURL("icons/icon-48.png"),
      title: success ? STRINGS.notificationTabSentTitle : STRINGS.notificationSendFailedTitle,
      message: notificationMessage,
    });
  });
} else {
  console.warn("Background: ContextMenus API is not available. Skipping context menu click listener setup.");
}

browser.storage.onChanged.addListener(async (changes, areaName) => {
  console.log(`Background:storage.onChanged - Detected in area: '${areaName}'. Changes:`, JSON.stringify(changes));
  if (areaName !== "sync") return;
  let contextMenuNeedsUpdate = false;
  let specificRefreshActions = new Set();

  if (changes[SYNC_STORAGE_KEYS.DEFINED_GROUPS]) {
    console.log("Background:storage.onChanged - DEFINED_GROUPS changed.");
    contextMenuNeedsUpdate = true;
    specificRefreshActions.add("definedGroupsChanged");
  }

  if (contextMenuNeedsUpdate && browser.contextMenus) {
    console.log("Background:storage.onChanged - Context menu needs update due to storage change.");
    const groupsForMenu = await storage.get(
      browser.storage.sync,
      SYNC_STORAGE_KEYS.DEFINED_GROUPS,
      []
    );
    await updateContextMenu(groupsForMenu);
  }

  if (changes[SYNC_STORAGE_KEYS.GROUP_TASKS]) {
    console.log("Background:storage.onChanged - GROUP_TASKS changed. Processing...");
    const newTasksObject = changes[SYNC_STORAGE_KEYS.GROUP_TASKS].newValue;
    if (newTasksObject && typeof newTasksObject === "object") {
      const openedTabs = await processIncomingTasks(newTasksObject);
      if (openedTabs && openedTabs.length > 0) {
        for (const tabDetail of openedTabs) {
          await showTabNotification(tabDetail);
        }
      }
    } else if (!newTasksObject) {
      console.log(
        "Background:storage.onChanged - GROUP_TASKS was deleted or set to null. No tasks to process."
      );
    }
  }

  if (specificRefreshActions.size > 0) {
    try {
      await browser.runtime.sendMessage({
        // This message is intended for the options page if it's open
        action: "specificSyncDataChanged",
        changedItems: Array.from(specificRefreshActions)
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

browser.runtime.onMessage.addListener(async (request, sender) => {
  console.log("Message received:", request.action, "Data:", request);
  console.log(`Background:runtime.onMessage - Received action: '${request.action}' from sender:`, sender?.tab?.id || sender?.id || 'unknown');

  switch (request.action) {
    case "getState": {
      console.log("Background:runtime.onMessage - Handling 'getState'.");
      const [
        localSubscriptions,
        definedGroups,
        groupState,
      ] = await Promise.all([
        storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []),
        storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS, []),
      ]);

      return {
        subscriptions: localSubscriptions,
        definedGroups: definedGroups.sort(),
        groupState,
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
      // Call the consolidated helper from actions.js
      const result = await _addDeviceSubscriptionToGroup(groupToSubscribe);
      if (result.success) {
        await performHeartbeat();
      }
      return result;
    }
    case "unsubscribeFromGroup": {
      console.log(`Background:runtime.onMessage - Handling 'unsubscribeFromGroup' for group: "${request.groupName}"`);
      const groupToUnsubscribe = request.groupName;
      let localSubscriptions = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []);

      if (!groupToUnsubscribe) {
        return { success: false, message: STRINGS.noGroupNameProvided };
      }
      // Call the consolidated helper from actions.js
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
      
      return { success: true };
    }
    default:
      console.warn(`Background:runtime.onMessage - Unknown action received: '${request.action}'`);
      return { success: false, message: STRINGS.actionUnknown(request.action) };
  }
});

async function showTabNotification({ title, url, groupName, faviconUrl }) {
  console.log(`Background:showTabNotification - Displaying notification for tab: "${title}" from group: "${groupName}"`);
  await browser.notifications.create({
    type: "basic",
    iconUrl: faviconUrl || browser.runtime.getURL("icons/icon-48.png"),
    title: STRINGS.notificationTabReceivedTitle(groupName),
    message: title || url || (STRINGS.tabReceivedMessage || "Tab received"),
    contextMessage: url || "",
  });
}
