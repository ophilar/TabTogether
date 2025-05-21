import { SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS, STRINGS, BACKGROUND_DEFAULT_TASK_EXPIRY_DAYS } from "../common/constants.js";
import { storage } from "../core/storage.js";
import {
  createGroupDirect,
  deleteGroupDirect,
  renameGroupDirect,
  _addDeviceSubscriptionToGroup, // Assuming exported from actions.js
  _removeDeviceSubscriptionFromGroup, // Assuming exported from actions.js
} from "../core/actions.js"; // createGroupDirect, deleteGroupDirect, renameGroupDirect are used
import { createAndStoreGroupTask, processSubscribedGroupTasks } from "../core/tasks.js";
import { processIncomingTaskBookmark } from "./task-processor.js";
import { performTimeBasedTaskCleanup } from "./cleanup.js";

const ALARM_TASK_CLEANUP = "taskCleanup";
const TASK_CLEANUP_INTERVAL_MIN = 60 * 24 * 2;

async function initializeExtension() {
  console.log("Background: Initializing TabTogether (Advanced)...");
  try {
    console.log("Background: Initializing storage...");
    const syncKeysToInitialize = [SYNC_STORAGE_KEYS.DEFINED_GROUPS, SYNC_STORAGE_KEYS.TASK_EXPIRY_DAYS]; // Only initialize relevant sync keys
    const syncData = await browser.storage.sync.get(syncKeysToInitialize);
    const defaults = {
      [SYNC_STORAGE_KEYS.DEFINED_GROUPS]: [],
      [SYNC_STORAGE_KEYS.TASK_EXPIRY_DAYS]: BACKGROUND_DEFAULT_TASK_EXPIRY_DAYS,
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
    // Ensure LAST_PROCESSED_BOOKMARK_TIMESTAMP is initialized if it's the first run
    const lastProcessedTs = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.LAST_PROCESSED_BOOKMARK_TIMESTAMP, null);
    if (lastProcessedTs === null) {
      console.log("Background: Initializing LAST_PROCESSED_BOOKMARK_TIMESTAMP to 0.");
      await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.LAST_PROCESSED_BOOKMARK_TIMESTAMP, 0);
    }
    const recentlyOpenedUrls = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.RECENTLY_OPENED_URLS, null);
    if (recentlyOpenedUrls === null) {
      console.log("Background: Initializing RECENTLY_OPENED_URLS to {}.");
      await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.RECENTLY_OPENED_URLS, {}); // Ensure it's an object
    }
    await storage.getRootBookmarkFolder(); // Ensure root bookmark folder exists
    const cachedDefinedGroups = syncData[SYNC_STORAGE_KEYS.DEFINED_GROUPS] ?? [];
    await setupAlarms();
    if (browser.contextMenus) {
      await updateContextMenu(cachedDefinedGroups);
    } else {
      console.warn("Background:initializeExtension - ContextMenus API is not available. Context menu features will be disabled.");
    }
    await processSubscribedGroupTasks(); // Process any existing tasks on startup
    console.log(`Background: Initialization complete.`);
  } catch (error) {
    console.error("Background: CRITICAL ERROR during initializeExtension:", error);
  }
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
          LOCAL_STORAGE_KEYS.PROCESSED_BOOKMARK_IDS,
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

async function isTaskBookmark(bookmarkId) {
    try {
        const nodes = await browser.bookmarks.get(bookmarkId);
        if (!nodes || nodes.length === 0) return false;
        const bookmark = nodes[0];

        if (!bookmark || !bookmark.parentId || !bookmark.url || bookmark.url.startsWith("place:")) return false;

        const parentNodes = await browser.bookmarks.get(bookmark.parentId);
        if (!parentNodes || parentNodes.length === 0) return false;
        const parent = parentNodes[0];

        if (!parent || !parent.parentId || parent.url || parent.title === SYNC_STORAGE_KEYS.CONFIG_BOOKMARK_TITLE) return false; 

        const grandParentNodes = await browser.bookmarks.get(parent.parentId);
        if (!grandParentNodes || grandParentNodes.length === 0) return false;
        const grandParent = grandParentNodes[0];
        
        return grandParent && grandParent.title === SYNC_STORAGE_KEYS.ROOT_BOOKMARK_FOLDER_TITLE;
    } catch (e) {
        console.warn(`Background:isTaskBookmark - Error checking bookmark ${bookmarkId}:`, e.message);
        return false;
    }
}

browser.bookmarks.onCreated.addListener(async (id, bookmarkNode) => {
    if (await isTaskBookmark(id)) {
        console.log(`Background:bookmarks.onCreated - Task bookmark created: ${id} - ${bookmarkNode.title}`);
        const openedTabs = await processIncomingTaskBookmark(id, bookmarkNode);
        if (openedTabs && openedTabs.length > 0) {
            for (const tabDetail of openedTabs) {
                await showTabNotification(tabDetail);
            }
        }
    }
});

browser.bookmarks.onChanged.addListener(async (id, changeInfo) => {
    if (changeInfo.url || changeInfo.title) { // Only process if URL or title changed
        if (await isTaskBookmark(id)) {
            console.log(`Background:bookmarks.onChanged - Task bookmark changed: ${id}`, changeInfo);
            const openedTabs = await processIncomingTaskBookmark(id, changeInfo); // processIncomingTaskBookmark can handle changeInfo
            // Notifications for changed tasks might be noisy, decide if needed.
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
      ] = await Promise.all([
        storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []),
        storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS, []),
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
      // Call the consolidated helper from actions.js
      const result = await _addDeviceSubscriptionToGroup(groupToSubscribe);
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
      ); // This value is calculated but not used to update any alarm intervals.
      
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
