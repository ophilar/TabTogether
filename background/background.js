import { SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS, MAX_DEVICES_PER_GROUP } from "../common/constants.js";
import { storage } from "../core/storage.js"; // Import the storage wrapper
import {
  getInstanceId,
  getInstanceName,
  setInstanceName as setInstanceNameInCore,
} from "../core/instance.js";
import {
  renameDeviceDirect,
  createGroupDirect,
  deleteGroupDirect,
  renameGroupDirect,
  deleteDeviceDirect,
} from "../core/actions.js";
import { createAndStoreGroupTask } from "../core/tasks.js";
import { processIncomingTasks } from "./task-processor.js";
import { performHeartbeat } from "./heartbeat.js";
import {
  performStaleDeviceCheck,
  performTimeBasedTaskCleanup,
} from "./cleanup.js";

const ALARM_HEARTBEAT = "deviceHeartbeat";
const ALARM_STALE_CHECK = "staleDeviceCheck";
const ALARM_TASK_CLEANUP = "taskCleanup";

const HEARTBEAT_INTERVAL_MIN = 5; // Every 5 minutes
const STALE_CHECK_INTERVAL_MIN = 60 * 24; // Every day
const TASK_CLEANUP_INTERVAL_MIN = 60 * 24 * 2; // Every 2 days

const BACKGROUND_DEFAULT_STALE_DEVICE_THRESHOLD_DAYS = 30; // Clarify these are background script defaults
const BACKGROUND_DEFAULT_TASK_EXPIRY_DAYS = 14;

// --- Initialization ---
async function initializeExtension() {
  console.log("Initializing TabTogether (Advanced)...");
  try {
    console.log("Initializing storage...");
    // Ensure storage.sync has default values if empty
    const syncKeysToInitialize = Object.values(SYNC_STORAGE_KEYS); // More descriptive name
    const syncData = await browser.storage.sync.get(syncKeysToInitialize);
    const defaults = {
      [SYNC_STORAGE_KEYS.DEFINED_GROUPS]: [],
      [SYNC_STORAGE_KEYS.GROUP_STATE]: {},
      [SYNC_STORAGE_KEYS.GROUP_TASKS]: {},
      [SYNC_STORAGE_KEYS.DEVICE_REGISTRY]: {},
      [SYNC_STORAGE_KEYS.SUBSCRIPTIONS]: {}, // Initialize synchronized subscriptions
    };
    const updates = {};
    for (const key of syncKeysToInitialize) {
      if (syncData[key] === undefined && defaults[key] !== undefined) { // Ensure default exists
        updates[key] = defaults[key];
      }
    }
    if (Object.keys(updates).length > 0) {
      await browser.storage.sync.set(updates);
      console.log("Storage initialized with defaults:", updates);
    }

    // Fetch local data first
    let localInstanceId = await getInstanceId();
    let localInstanceName = await getInstanceName();

    // Use the data fetched earlier (syncData) instead of fetching again
    const cachedDefinedGroups = syncData[SYNC_STORAGE_KEYS.DEFINED_GROUPS] ?? [];

    await setupAlarms();
    await updateContextMenu(cachedDefinedGroups); // Use cachedDefinedGroups if available
    await performHeartbeat(localInstanceId, localInstanceName); // Perform initial heartbeat
    console.log(`Initialization complete. Name: ${localInstanceName}`);
  } catch (error) {
    console.error("CRITICAL ERROR during initializeExtension:", error);
  }

  // console.log("Initialization complete."); // Already logged inside try or if error
}

async function setupAlarms() {
  // Clear existing alarms in case intervals changed
  await browser.alarms.clearAll();
  console.log("Setting up alarms...");
  browser.alarms.create(ALARM_HEARTBEAT, {
    periodInMinutes: HEARTBEAT_INTERVAL_MIN,
  });
  browser.alarms.create(ALARM_STALE_CHECK, {
    periodInMinutes: STALE_CHECK_INTERVAL_MIN,
  });
  browser.alarms.create(ALARM_TASK_CLEANUP, {
    periodInMinutes: TASK_CLEANUP_INTERVAL_MIN,
  });
}

browser.runtime.onInstalled.addListener(initializeExtension);
browser.runtime.onStartup.addListener(initializeExtension);

// --- Alarm Handlers ---

browser.alarms.onAlarm.addListener(async (alarm) => {
  // Fetch state only as needed within each case

  console.log(`Alarm triggered: ${alarm.name}`);
  switch (alarm.name) {
    case ALARM_HEARTBEAT:
      {
        // Use block scope for variables
        const localInstanceId = await getInstanceId();
        const localInstanceName = await getInstanceName();
        await performHeartbeat(localInstanceId, localInstanceName);
      }
      break;
    case ALARM_STALE_CHECK:
      {
        // Stale check needs registry and group state
        const cachedDeviceRegistry = await storage.get(
          browser.storage.sync,
          SYNC_STORAGE_KEYS.DEVICE_REGISTRY,
          {}
        );
        const cachedGroupState = await storage.get(
          browser.storage.sync,
          SYNC_STORAGE_KEYS.GROUP_STATE,
          {}
        );
        const staleThresholdDays = await storage.get(
          browser.storage.sync,
          SYNC_STORAGE_KEYS.STALE_DEVICE_THRESHOLD_DAYS,
          BACKGROUND_DEFAULT_STALE_DEVICE_THRESHOLD_DAYS
        );
        const currentStaleDeviceThresholdMs =
          staleThresholdDays * 24 * 60 * 60 * 1000;
        await performStaleDeviceCheck(
          cachedDeviceRegistry, // Pass fetched registry
          cachedGroupState, // Pass fetched group state
          currentStaleDeviceThresholdMs
        );
      }
      break;
    case ALARM_TASK_CLEANUP:
      {
        // Task cleanup needs local processed tasks and the task expiry setting
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

// --- Context Menu ---

async function updateContextMenu(cachedDefinedGroups) {
  await browser.contextMenus.removeAll();
  // Use cache if available, otherwise fetch
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
      browser.contextMenus.create({
        id: "no-groups",
        title: "No groups defined",
        contexts: contexts,
        enabled: false,
      });
      return;
    }

    browser.contextMenus.create({
      id: "send-to-group-parent",
      title: "Send Tab to Group",
      contexts: contexts,
    });

    groups.sort().forEach((groupName) => {
      try {
        browser.contextMenus.create({
          id: `send-to-${groupName}`,
          parentId: "send-to-group-parent",
          title: groupName,
          contexts: contexts,
        });
      } catch (e) {
        console.error(
          `Failed to create context menu item for group "${groupName}":`,
          e.message
        );
      }
    });
  } catch (e) {
    console.error(
      "Error during top-level context menu creation (e.g., 'no-groups' or 'send-to-group-parent'):",
      e.message
    );
  }
}

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  console.log(
    "BACKGROUND.JS: onContextMenuClicked triggered. Info:",
    info,
    "Tab:",
    tab
  ); // Log both

  const menuItemId = info.menuItemId?.toString() || ""; // Ensure it's a string
  if (
    !menuItemId.startsWith("send-to-") ||
    menuItemId === "send-to-group-parent"
  ) {
    return;
  }

  const groupName = menuItemId.replace("send-to-", "");
  const localInstanceId = await getInstanceId();

  // Determine URL and Title
  let urlToSend = info.pageUrl; // Default to the page URL
  let titleToSend = tab?.title || "Link"; // Default to tab title

  if (info.linkUrl) {
    urlToSend = info.linkUrl;
    titleToSend = info.linkText || urlToSend;
  } else if (info.mediaType && info.srcUrl) {
    urlToSend = info.srcUrl;
    titleToSend = tab?.title || urlToSend;
  } else if (info.selectionText) {
    urlToSend = info.pageUrl || tab?.url; // Send the page URL
    titleToSend = `"${info.selectionText}" on ${tab?.title || urlToSend}`;
  } else if (tab?.url) {
    urlToSend = tab.url;
    titleToSend = tab?.title || urlToSend;
  }

  if (!urlToSend || urlToSend === "about:blank") {
    console.error(
      "Could not determine a valid URL to send from context:",
      info,
      "Tab:",
      tab
    );
    browser.notifications.create({
      type: "basic",
      iconUrl: browser.runtime.getURL("icons/icon-48.png"),
      title: "Send Failed",
      message: "Cannot send this type of link/page.",
    });
    return;
  }

  const tabData = { url: urlToSend, title: titleToSend };

  // Determine recipientDeviceIds for createAndStoreGroupTask
  // This requires fetching devices subscribed to the group.
  let recipientDeviceIds = [];
  try {
    const allSubscriptionsSync = await storage.get(
      browser.storage.sync,
      SYNC_STORAGE_KEYS.SUBSCRIPTIONS,
      {}
    ); // This is SUBSCRIPTIONS_SYNC
    const deviceRegistry = await storage.get(
      browser.storage.sync,
      SYNC_STORAGE_KEYS.DEVICE_REGISTRY,
      {}
    );

    for (const deviceId in allSubscriptionsSync) {
      if (deviceId === localInstanceId) continue; // Don't send to self
      if (
        allSubscriptionsSync[deviceId] &&
        allSubscriptionsSync[deviceId].includes(groupName)
      ) {
        // Check if device is still active in registry (optional, but good practice)
        if (deviceRegistry[deviceId]) {
          recipientDeviceIds.push(deviceId);
        }
      }
    }
  } catch (e) {
    console.error("Error determining recipients for context menu send:", e);
    // Proceed with empty recipients (task will be for anyone in group except sender if recipientDeviceIds is null/empty in createAndStoreGroupTask)
    // or handle error more gracefully. For now, let createAndStoreGroupTask handle null.
    recipientDeviceIds = null;
  }

  console.log(
    `Context Menu: Sending task to group ${groupName} from ${localInstanceId}. Recipients: ${
      recipientDeviceIds?.join(", ") || "All (except sender)"
    }`
  );
  const { success, message: taskMessage } = await createAndStoreGroupTask(
    groupName,
    tabData,
    localInstanceId,
    recipientDeviceIds
  );

  const notificationMessage = success
    ? `Sent "${titleToSend}" to group "${groupName}".`
    : taskMessage || "Failed to send tab.";

  browser.notifications.create({
    type: "basic",
    iconUrl: browser.runtime.getURL("icons/icon-48.png"),
    title: success ? "Tab Sent" : "Send Failed",
    message: notificationMessage,
  });
});

// --- Storage Change Listener (Updates Caches) ---

browser.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName !== "sync") return; // Only care about sync changes

  let contextMenuNeedsUpdate = false;
  let uiNeedsRefresh = false; // Flag for UI refresh

  if (changes[SYNC_STORAGE_KEYS.DEFINED_GROUPS]) {
    console.log("Sync change detected: DEFINED_GROUPS");
    contextMenuNeedsUpdate = true;
    uiNeedsRefresh = true;
  }
  if (changes[SYNC_STORAGE_KEYS.GROUP_STATE]) {
    console.log("Sync change detected: GROUP_STATE");
    uiNeedsRefresh = true;
  }
  if (changes[SYNC_STORAGE_KEYS.DEVICE_REGISTRY]) {
    console.log("Sync change detected: DEVICE_REGISTRY");
    uiNeedsRefresh = true;
  }
  if (changes[SYNC_STORAGE_KEYS.SUBSCRIPTIONS]) {
    // Added SUBSCRIPTIONS check
    console.log("Sync change detected: SUBSCRIPTIONS");
    uiNeedsRefresh = true;
  }

  if (contextMenuNeedsUpdate) {
    const groupsForMenu = await storage.get(
      browser.storage.sync,
      SYNC_STORAGE_KEYS.DEFINED_GROUPS,
      []
    );
    await updateContextMenu(groupsForMenu);
  }

  if (changes[SYNC_STORAGE_KEYS.GROUP_TASKS]) {
    console.log("Sync change detected: GROUP_TASKS. Processing...");
    const newTasksObject = changes[SYNC_STORAGE_KEYS.GROUP_TASKS].newValue;
    if (newTasksObject && typeof newTasksObject === "object") {
      const openedTabs = await processIncomingTasks(newTasksObject);
      if (openedTabs && openedTabs.length > 0) {
        for (const tabDetail of openedTabs) {
          await showTabNotification(tabDetail); // Call showTabNotification for each opened tab
        }
      }
    } else if (!newTasksObject) {
      console.log(
        "GROUP_TASKS was deleted or set to null. No tasks to process."
      );
    }
  }

  if (uiNeedsRefresh) {
    try {
      await browser.runtime.sendMessage({ action: "syncDataChanged" });
    } catch (error) {
      if (
        !error.message?.includes("Could not establish connection") &&
        !error.message?.includes("Receiving end does not exist")
      ) {
        console.warn("Could not send syncDataChanged message:", error.message);
      }
    }
  }
});

// --- Message Handling (Uses Caches for getState) ---

browser.runtime.onMessage.addListener(async (request, sender) => {
  console.log("Message received:", request.action, "Data:", request);

  switch (request.action) {
    case "getState": {
      const localInstanceId = await getInstanceId();
      const localInstanceName = await getInstanceName();
      const localSubscriptions = await storage.get(
        browser.storage.local,
        LOCAL_STORAGE_KEYS.SUBSCRIPTIONS,
        []
      );
      // Fetch fresh sync data for getState to ensure UI has the latest
      const definedGroups = await storage.get(
        browser.storage.sync,
        SYNC_STORAGE_KEYS.DEFINED_GROUPS,
        []
      );
      const groupState = await storage.get(
        browser.storage.sync,
        SYNC_STORAGE_KEYS.GROUP_STATE,
        {}
      );
      const deviceRegistry = await storage.get(
        browser.storage.sync,
        SYNC_STORAGE_KEYS.DEVICE_REGISTRY,
        {}
      );
      const allSubscriptionsSync = await storage.get(
        browser.storage.sync,
        SYNC_STORAGE_KEYS.SUBSCRIPTIONS,
        {}
      ); // Use the correct key for sync

      return {
        instanceId: localInstanceId,
        instanceName: localInstanceName,
        subscriptions: localSubscriptions, // Local device's subscriptions
        definedGroups: definedGroups.sort(),
        groupState,
        deviceRegistry,
        allSubscriptions: allSubscriptionsSync, // All devices' subscriptions from sync (already correct)
      };
    }

    case "createGroup": {
      if (
        !request.groupName ||
        typeof request.groupName !== "string" ||
        request.groupName.trim().length === 0
      ) {
        return { success: false, message: "Invalid group name provided." };
      }
      return await createGroupDirect(request.groupName.trim());
    }
    case "deleteGroup": {
      if (!request.groupName) {
        return { success: false, message: "No group name provided." };
      }
      return await deleteGroupDirect(request.groupName);
    }
    case "renameGroup": {
      const { oldName, newName } = request;
      if (
        !oldName ||
        !newName ||
        typeof newName !== "string" ||
        newName.trim().length === 0
      ) {
        return { success: false, message: "Invalid group name." };
      }
      return await renameGroupDirect(oldName, newName.trim());
    }
    case "renameDevice": {
      const { deviceId, newName } = request;
      if (
        !deviceId ||
        !newName ||
        typeof newName !== "string" ||
        newName.trim().length === 0
      ) {
        return {
          success: false,
          message: "Invalid device ID or name provided.",
        };
      }
      try {
        const localInstanceId = await getInstanceId();
        if (deviceId === localInstanceId) {
          return await setInstanceNameInCore(newName.trim());
        } else {
          return await renameDeviceDirect(deviceId, newName.trim());
        }
      } catch (error) {
        console.error("Error during renameDevice call:", error);
        return {
          success: false,
          message:
            error.message || "An unexpected error occurred during rename.",
        };
      }
    }
    case "deleteDevice": {
      const { deviceId } = request;
      if (!deviceId) {
        return { success: false, message: "No device ID provided." };
      }
      return await deleteDeviceDirect(deviceId);
    }

    case "subscribeToGroup": {
      const groupToSubscribe = request.groupName;
      const localInstanceId = await getInstanceId();
      let localSubscriptions = await storage.get(
        browser.storage.local,
        LOCAL_STORAGE_KEYS.SUBSCRIPTIONS,
        []
      );

      if (!groupToSubscribe) {
        return { success: false, message: "No group name provided." };
      }
      if (localSubscriptions.includes(groupToSubscribe)) {
        return { success: false, message: "Already subscribed." };
      }

      // Check MAX_DEVICES_PER_GROUP
      const allSubscriptionsSync = await storage.get(
        browser.storage.sync,
        SYNC_STORAGE_KEYS.SUBSCRIPTIONS,
        {}
      );
      let currentSubscribersToGroup = 0;
      for (const deviceId in allSubscriptionsSync) {
        if (
          allSubscriptionsSync[deviceId] &&
          allSubscriptionsSync[deviceId].includes(groupToSubscribe)
        ) {
          currentSubscribersToGroup++;
        }
      }
      if (MAX_DEVICES_PER_GROUP && currentSubscribersToGroup >= MAX_DEVICES_PER_GROUP) { // Check if MAX_DEVICES_PER_GROUP is defined
        return {
          success: false,
          message: `Group "${groupToSubscribe}" is full.`,
        };
      }

      try {
        localSubscriptions.push(groupToSubscribe);
        localSubscriptions.sort();

        await storage.set(
          browser.storage.local,
          LOCAL_STORAGE_KEYS.SUBSCRIPTIONS,
          localSubscriptions
        );

        await storage.mergeItem(
          browser.storage.sync,
          SYNC_STORAGE_KEYS.SUBSCRIPTIONS,
          {
            [localInstanceId]: localSubscriptions,
          }
        );

        const localInstanceName = await getInstanceName();
        await performHeartbeat(localInstanceId, localInstanceName);

        return { success: true, subscribedGroup: groupToSubscribe };
      } catch (error) {
        console.error(`Error subscribing to group ${groupToSubscribe}:`, error);
        return {
          success: false,
          message: `Error subscribing: ${error.message}`,
        };
      }
    }
    case "unsubscribeFromGroup": {
      const groupToUnsubscribe = request.groupName;
      const localInstanceId = await getInstanceId();
      let localSubscriptions = await storage.get(
        browser.storage.local,
        LOCAL_STORAGE_KEYS.SUBSCRIPTIONS,
        []
      );

      if (!groupToUnsubscribe) {
        return { success: false, message: "No group name provided." };
      }
      if (!localSubscriptions.includes(groupToUnsubscribe)) {
        return { success: false, message: "Not subscribed." };
      }

      try {
        localSubscriptions = localSubscriptions.filter(
          (g) => g !== groupToUnsubscribe
        );

        await storage.set(
          browser.storage.local,
          LOCAL_STORAGE_KEYS.SUBSCRIPTIONS,
          localSubscriptions
        );

        await storage.mergeItem(
          browser.storage.sync,
          SYNC_STORAGE_KEYS.SUBSCRIPTIONS,
          {
            [localInstanceId]: localSubscriptions,
          }
        );

        console.log(`Locally unsubscribed from ${groupToUnsubscribe}.`);
        return { success: true, unsubscribedGroup: groupToUnsubscribe };
      } catch (error) {
        console.error(
          `Error unsubscribing from group ${groupToUnsubscribe}:`,
          error
        );
        return {
          success: false,
          message: `Error unsubscribing: ${error.message}`,
        };
      }
    }
    case "sendTabFromPopup": {
      const { groupName, tabData } = request;
      const senderDeviceId = await getInstanceId();

      // Determine recipientDeviceIds
      let recipientDeviceIds = [];
      try {
        const allSubscriptionsSync = await storage.get(
          browser.storage.sync,
          SYNC_STORAGE_KEYS.SUBSCRIPTIONS,
          {}
        );
        const deviceRegistry = await storage.get(
          browser.storage.sync,
          SYNC_STORAGE_KEYS.DEVICE_REGISTRY,
          {}
        );
        for (const deviceId in allSubscriptionsSync) {
          if (deviceId === senderDeviceId) continue;
          if (
            allSubscriptionsSync[deviceId] &&
            allSubscriptionsSync[deviceId].includes(groupName)
          ) {
            if (deviceRegistry[deviceId]) {
              // Check if device is active
              recipientDeviceIds.push(deviceId);
            }
          }
        }
      } catch (e) {
        console.error("Error determining recipients for popup send:", e);
        recipientDeviceIds = null; // Let createAndStoreGroupTask handle null as "all in group"
      }

      return await createAndStoreGroupTask(
        groupName,
        tabData,
        senderDeviceId,
        recipientDeviceIds
      );
    }
    case "heartbeat": {
      const localInstanceId = await getInstanceId();
      const localInstanceName = await getInstanceName();
      await performHeartbeat(localInstanceId, localInstanceName);
      return { success: true };
    }
    case "testNotification": {
      await browser.notifications.create({
        type: "basic",
        iconUrl: browser.runtime.getURL("icons/icon-48.png"),
        title: "TabTogether Test",
        message: "This is a test notification.",
      });
      return { success: true };
    }
    case "setSyncInterval": {
      const minutes = Math.max(
        1,
        Math.min(120, parseInt(request.minutes, 10) || 5)
      );
      await browser.alarms.clear(ALARM_HEARTBEAT);
      await browser.alarms.create(ALARM_HEARTBEAT, {
        periodInMinutes: minutes,
      });
      return { success: true };
    }
    default:
      console.warn("Unknown action received:", request.action);
      return { success: false, message: `Unknown action: ${request.action}` };
  }
});

// Enhanced notification for tab send/receive
async function showTabNotification({ title, url, groupName, faviconUrl }) {
  // Removed sound and duration logic - use system defaults
  await browser.notifications.create({
    type: "basic",
    iconUrl: faviconUrl || browser.runtime.getURL("icons/icon-48.png"),
    title: `TabTogether: ${groupName ? "Group " + groupName : "Tab Received"}`,
    message: title || url || "Tab received",
    contextMessage: url || "",
  });
}
