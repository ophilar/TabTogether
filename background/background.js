// background.js

import {
  SYNC_STORAGE_KEYS,
  LOCAL_STORAGE_KEYS,
} from "../common/constants.js";
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
import { createAndStoreGroupTask } from "../core/tasks.js"; // Keep this
import { assignDeviceBitForGroup } from "../core/group-manager.js"; // Renamed function
import { processIncomingTasks } from "./task-processor.js";
import { performHeartbeat } from "./heartbeat.js";
import { performStaleDeviceCheck, performTimeBasedTaskCleanup } from "./cleanup.js";

const ALARM_HEARTBEAT = "deviceHeartbeat";
const ALARM_STALE_CHECK = "staleDeviceCheck";
const ALARM_TASK_CLEANUP = "taskCleanup";

const HEARTBEAT_INTERVAL_MIN = 5; // Every 5 minutes
const STALE_CHECK_INTERVAL_MIN = 60 * 24; // Every day
const TASK_CLEANUP_INTERVAL_MIN = 60 * 24 * 2; // Every 2 days

const DEFAULT_STALE_DEVICE_THRESHOLD_DAYS = 30;
const DEFAULT_TASK_EXPIRY_DAYS = 14;

// --- Initialization ---

async function initializeExtension() {
  console.log("Initializing TabTogether (Advanced)...");
  try {
    console.log("Initializing storage...");
    // Ensure storage.sync has default values if empty
    const syncKeys = Object.values(SYNC_STORAGE_KEYS);
    const syncData = await browser.storage.sync.get(syncKeys);
    const defaults = {
      [SYNC_STORAGE_KEYS.DEFINED_GROUPS]: [],
      [SYNC_STORAGE_KEYS.GROUP_STATE]: {},
      [SYNC_STORAGE_KEYS.GROUP_TASKS]: {},
      [SYNC_STORAGE_KEYS.DEVICE_REGISTRY]: {},
    };
    const updates = {};
    for (const key of syncKeys) {
      if (syncData[key] === undefined) {
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
    let localGroupBits = await storage.get(
      browser.storage.local,
      LOCAL_STORAGE_KEYS.GROUP_BITS,
      {}
    );

    // Use the data fetched earlier (syncData) instead of fetching again
    let cachedDefinedGroups = syncData[SYNC_STORAGE_KEYS.DEFINED_GROUPS] ?? [];
    
    await setupAlarms();
    await updateContextMenu(cachedDefinedGroups); // Use cachedDefinedGroups if available
    await performHeartbeat(
      localInstanceId,
      localInstanceName,
      localGroupBits,
    ); // Perform initial heartbeat/registry update
    console.log(`Initialization complete. Name: ${localInstanceName}`);
  } catch (error) {
    console.error("CRITICAL ERROR during initializeExtension:", error);
  }

  console.log("Initialization complete.");
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
      { // Use block scope for variables
        const localInstanceId = await getInstanceId();
        const localInstanceName = await getInstanceName();
        const localGroupBits = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.GROUP_BITS, {});
        // Heartbeat primarily updates the registry, so fetch it
        // const cachedDeviceRegistry = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {});
        await performHeartbeat(
          localInstanceId,
          localInstanceName,
          localGroupBits,
          // cachedDeviceRegistry // Pass fetched registry
        );
      }
      break;
    case ALARM_STALE_CHECK:
      {
        // Stale check needs registry and group state
        const cachedDeviceRegistry = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {});
        const cachedGroupState = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, {});
        const staleThresholdDays = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.STALE_DEVICE_THRESHOLD_DAYS, DEFAULT_STALE_DEVICE_THRESHOLD_DAYS);
        const currentStaleDeviceThresholdMs = staleThresholdDays * 24 * 60 * 60 * 1000;
        await performStaleDeviceCheck(
          cachedDeviceRegistry, // Pass fetched registry
          cachedGroupState,   // Pass fetched group state
          currentStaleDeviceThresholdMs
        );
      }
      break;
    case ALARM_TASK_CLEANUP:
      {
        // Task cleanup needs local processed tasks and the task expiry setting
        const localProcessedTasks = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.PROCESSED_TASKS, {});
        const taskExpiryDays = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.TASK_EXPIRY_DAYS, DEFAULT_TASK_EXPIRY_DAYS);
        const currentTaskExpiryMs = taskExpiryDays * 24 * 60 * 60 * 1000;
        await performTimeBasedTaskCleanup(localProcessedTasks, currentTaskExpiryMs);
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
        console.error(`Failed to create context menu item for group "${groupName}":`, e.message);
      }
    });
  } catch (e) {
    console.error("Error during top-level context menu creation (e.g., 'no-groups' or 'send-to-group-parent'):", e.message);
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
  if (!menuItemId.startsWith("send-to-") || menuItemId === "send-to-group-parent") {
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
    const allSubscriptions = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, {});
    const deviceRegistry = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {});

    for (const deviceId in allSubscriptions) {
      if (deviceId === localInstanceId) continue; // Don't send to self
      if (allSubscriptions[deviceId] && allSubscriptions[deviceId].includes(groupName)) {
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

  console.log(`Context Menu: Sending task to group ${groupName} from ${localInstanceId}. Recipients: ${recipientDeviceIds?.join(', ') || 'All (except sender)'}`);
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
  if (areaName !== 'sync') return; // Only care about sync changes

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
  if (changes[SYNC_STORAGE_KEYS.SUBSCRIPTIONS]) { // Added SUBSCRIPTIONS check
    console.log("Sync change detected: SUBSCRIPTIONS");
    uiNeedsRefresh = true;
  }

  if (contextMenuNeedsUpdate) {
    const groupsForMenu = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS, []);
    await updateContextMenu(groupsForMenu);
  }

  if (changes[SYNC_STORAGE_KEYS.GROUP_TASKS]) {
    console.log("Sync change detected: GROUP_TASKS. Processing...");
    const newTasksObject = changes[SYNC_STORAGE_KEYS.GROUP_TASKS].newValue;
    if (newTasksObject && typeof newTasksObject === 'object') {
      await processIncomingTasks(newTasksObject);
    } else if (!newTasksObject) {
      console.log("GROUP_TASKS was deleted or set to null. No tasks to process.");
    }
  }

  if (uiNeedsRefresh) {
    try {
      await browser.runtime.sendMessage({ action: "syncDataChanged" });
    } catch (error) {
      if (!error.message?.includes("Could not establish connection") && !error.message?.includes("Receiving end does not exist")) {
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
      const localSubscriptions = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []);
      const localGroupBits = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.GROUP_BITS, {});
      // Fetch fresh sync data for getState to ensure UI has the latest
      const definedGroups = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS, []);
      const groupState = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, {});
      const deviceRegistry = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {});
      const allSubscriptions = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, {}); // For unified state

      return {
        instanceId: localInstanceId,
        instanceName: localInstanceName,
        subscriptions: localSubscriptions, // Local device's subscriptions
        groupBits: localGroupBits,
        definedGroups: definedGroups.sort(),
        groupState,
        deviceRegistry,
        allSubscriptions, // All devices' subscriptions
      };
    }

    case "createGroup": {
      if (!request.groupName || typeof request.groupName !== "string" || request.groupName.trim().length === 0) {
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
      if (!oldName || !newName || typeof newName !== "string" || newName.trim().length === 0) {
        return { success: false, message: "Invalid group name." };
      }
      return await renameGroupDirect(oldName, newName.trim());
    }
    case "renameDevice": {
      const { deviceId, newName } = request;
      if (!deviceId || !newName || typeof newName !== "string" || newName.trim().length === 0) {
        return { success: false, message: "Invalid device ID or name provided." };
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
        return { success: false, message: error.message || "An unexpected error occurred during rename." };
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
      let localSubscriptions = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []);
      let localGroupBits = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.GROUP_BITS, {});

      if (!groupToSubscribe) {
        return { success: false, message: "No group name provided." };
      }
      if (localSubscriptions.includes(groupToSubscribe)) {
        return { success: false, message: "Already subscribed." };
      }

      // Fetch required sync state just before assigning bit
      const initialGroupState = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, {});
      // const initialDeviceRegistry = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {}); // Not directly used by assignDeviceBitForGroup current impl.

      const assignedBit = await assignDeviceBitForGroup(
        groupToSubscribe,
        localInstanceId,
        initialGroupState
        // initialDeviceRegistry // Pass if assignDeviceBitForGroup needs it
      );

      if (assignedBit !== null) {
        localSubscriptions.push(groupToSubscribe);
        localSubscriptions.sort();
        localGroupBits[groupToSubscribe] = assignedBit;

        await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, localSubscriptions);
        await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.GROUP_BITS, localGroupBits);

        // Update this device's entry in the global subscriptions object
        // This ensures that when other devices fetch SUBSCRIPTIONS, this device's new sub is reflected.
        await storage.mergeItem(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, {
            [localInstanceId]: localSubscriptions
        });

        // Heartbeat will ensure DEVICE_REGISTRY.groupBits is up-to-date.
        const localInstanceName = await getInstanceName();
        await performHeartbeat(localInstanceId, localInstanceName, localGroupBits);

        return { success: true, subscribedGroup: groupToSubscribe, assignedBit: assignedBit };
      } else {
        return { success: false, message: "Group is full or error assigning bit." };
      }
    }
    case "unsubscribeFromGroup": {
      const groupToUnsubscribe = request.groupName;
      const localInstanceId = await getInstanceId();
      let localSubscriptions = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []);
      let localGroupBits = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.GROUP_BITS, {});

      if (!groupToUnsubscribe) {
        return { success: false, message: "No group name provided." };
      }
      if (!localSubscriptions.includes(groupToUnsubscribe)) {
        return { success: false, message: "Not subscribed." };
      }

      try {
        const bitToRemove = localGroupBits[groupToUnsubscribe];

        localSubscriptions = localSubscriptions.filter(g => g !== groupToUnsubscribe);
        delete localGroupBits[groupToUnsubscribe];

        await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, localSubscriptions);
        await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.GROUP_BITS, localGroupBits);

        // Update this device's entry in the global subscriptions object
        await storage.mergeItem(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, {
            [localInstanceId]: localSubscriptions
        });

        // Update device registry to mark the bit for this group as null for this device
        await storage.mergeItem(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {
          [localInstanceId]: { groupBits: { [groupToUnsubscribe]: null } },
        });

        // Clear the bit from the group's assignedMask in GROUP_STATE
        if (bitToRemove !== undefined) {
          const groupState = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, {});
          if (groupState[groupToUnsubscribe] && groupState[groupToUnsubscribe].assignedMask !== undefined) {
            const currentMask = groupState[groupToUnsubscribe].assignedMask;
            const newMask = currentMask & ~bitToRemove;
            if (newMask !== currentMask) {
              await storage.mergeItem(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, {
                [groupToUnsubscribe]: { assignedMask: newMask },
              });
            }
          }
        }
        console.log(`Locally unsubscribed from ${groupToUnsubscribe}. Bit ${bitToRemove} cleared.`);
        return { success: true, unsubscribedGroup: groupToUnsubscribe };
      } catch (error) {
        console.error(`Error unsubscribing from group ${groupToUnsubscribe}:`, error);
        return { success: false, message: `Error unsubscribing: ${error.message}` };
      }
    }
    case "sendTabFromPopup": {
      const { groupName, tabData } = request;
      const senderDeviceId = await getInstanceId();

      // Determine recipientDeviceIds
      let recipientDeviceIds = [];
      try {
        const allSubscriptions = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, {});
        const deviceRegistry = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {});
        for (const deviceId in allSubscriptions) {
          if (deviceId === senderDeviceId) continue;
          if (allSubscriptions[deviceId] && allSubscriptions[deviceId].includes(groupName)) {
            if (deviceRegistry[deviceId]) { // Check if device is active
                recipientDeviceIds.push(deviceId);
            }
          }
        }
      } catch(e) {
        console.error("Error determining recipients for popup send:", e);
        recipientDeviceIds = null; // Let createAndStoreGroupTask handle null as "all in group"
      }

      return await createAndStoreGroupTask(groupName, tabData, senderDeviceId, recipientDeviceIds);
    }
    case "heartbeat": {
      const localInstanceId = await getInstanceId();
      const localInstanceName = await getInstanceName();
      const localGroupBits = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.GROUP_BITS, {});
      await performHeartbeat(localInstanceId, localInstanceName, localGroupBits);
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
      const minutes = Math.max(1, Math.min(120, parseInt(request.minutes, 10) || 5));
      await browser.alarms.clear(ALARM_HEARTBEAT);
      await browser.alarms.create(ALARM_HEARTBEAT, { periodInMinutes: minutes });
      return { success: true };
    }
    default:
      console.warn("Unknown action received:", request.action);
      return { success: false, message: `Unknown action: ${request.action}` };
  }
});

// Removed playNotificationSound function

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

// Example usage: showTabNotification({ title, url, groupName, faviconUrl }) when sending/receiving tabs
  };
  const update = { [groupName]: newTask };

  console.log(`Sending task ${taskId} to group ${groupName}: ${urlToSend}`);
  const { success } = await storage.mergeItem(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_TASKS, update);

  browser.notifications.create({
    type: "basic",
    iconUrl: browser.runtime.getURL("icons/icon-48.png"),
    title: success ? "Tab Sent" : "Send Failed",
    message: success
      ? `Sent "${titleToSend}" to group "${groupName}".`
      : "Failed to save task to sync storage.",
  });
});

// --- Storage Change Listener (Updates Caches) ---

browser.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName !== 'sync') return; // Only care about sync changes

  let contextMenuNeedsUpdate = false;
  let uiNeedsRefresh = false; // Flag for UI refresh

  // Check if definedGroups changed
  if (changes[SYNC_STORAGE_KEYS.DEFINED_GROUPS]) {
    console.log("Cache updated: definedGroups");
    contextMenuNeedsUpdate = true; // Mark that menu needs update
  }
  // Check other keys (no need to cache them here if only used elsewhere)
  if (changes[SYNC_STORAGE_KEYS.GROUP_STATE]) {
    console.log("Cache updated: groupState");
    uiNeedsRefresh = true; // Group state changes might affect UI
  }
  if (changes[SYNC_STORAGE_KEYS.DEVICE_REGISTRY]) {
    console.log("Cache updated: deviceRegistry");
    uiNeedsRefresh = true; // Device registry changes affect UI
  }

  // Trigger actions based on changes
  if (contextMenuNeedsUpdate) {
    // Fetch the latest definedGroups right before updating the menu
    const groupsForMenu = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS, []);
    await updateContextMenu(groupsForMenu); // Pass the freshly fetched groups
  }

  if (changes[SYNC_STORAGE_KEYS.GROUP_TASKS]) {
    console.log("Detected change in group tasks, processing...");
    // Ensure newValue exists and is an object, as expected by processIncomingTasks (if it were fully implemented)
    const newTasks = changes[SYNC_STORAGE_KEYS.GROUP_TASKS].newValue;
    if (newTasks && typeof newTasks === 'object') {
      await processIncomingTasks(newTasks); // Call the imported function
    }
  }

  // Notify UI pages if relevant data changed
  if (uiNeedsRefresh) {
    try {
      // Send message to potentially open options/popup pages
      // No specific target needed, just send to the extension runtime
      await browser.runtime.sendMessage({ action: "syncDataChanged" });
    } catch (error) {
      console.warn("Could not send syncDataChanged message (maybe no UI pages open):", error.message);
    }
  }
});

// --- Message Handling (Uses Caches for getState) ---

browser.runtime.onMessage.addListener(async (request, sender) => {
  // Removed sendResponse param for clarity
  console.log("Message received:", request.action, "Data:", request);

  // Define a variable to hold the response

  // Fetch sync data as needed within cases, or consider a more robust caching strategy
  // if performance becomes an issue. For now, fetch within relevant cases.

  switch (request.action) {
    case "getState":
      // Return cached data primarily
      // This would now be a handler function, e.g., generalHandlers.handleGetState(request.data, sender)
      // For brevity, direct implementation is shown, but it should be in a handler.
      {
        const localInstanceId = await getInstanceId();
        const localInstanceName = await getInstanceName();
        const localSubscriptions = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []);
        const localGroupBits = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.GROUP_BITS, {});
        return { // Directly return the response object
          instanceId: localInstanceId,
          instanceName: localInstanceName,
          subscriptions: localSubscriptions,
          groupBits: localGroupBits,
          definedGroups: await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS, []),
          groupState: await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, {}),
          deviceRegistry: await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {}),
        };
      }
      // break; // No longer needed if returning directly

    // Example of how other cases would call handlers:
    // case "setInstanceName":
    //   return await deviceActionHandlers.handleSetInstanceName(request.data, sender);
    // case "createGroup":
    //   return await groupActionHandlers.handleCreateGroup(request.data, sender);
    // case "deleteGroup":
    //   return await groupActionHandlers.handleDeleteGroup(request.data, sender);
    // ... and so on for all other actions.
    // The logic within each case below would be moved to its respective handler function.

    // The following cases are kept for now to show where the logic *was*,
    // but in the refactored version, they'd be calls to handler functions.
    // For a truly concise diff, these would be replaced by handler calls.

    case "createGroup": {
      // Use block scope for constants if needed
      if (
        !request.groupName ||
        typeof request.groupName !== "string" ||
        request.groupName.trim().length === 0
      ) {
        return { success: false, message: "Invalid group name provided." };
      } else {
        // Assuming createGroupDirect is imported correctly
        return await createGroupDirect(request.groupName.trim());
      }
    }
    case "deleteGroup": {
      if (!request.groupName) {
        return { success: false, message: "No group name provided." };
      } else {
        // Assuming deleteGroupDirect is imported correctly
        return await deleteGroupDirect(request.groupName);
      }
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
      } else {
        // Assuming renameGroupDirect is imported correctly
        return await renameGroupDirect(oldName, newName.trim()); // Trim newName
      }
    }
    case "renameDevice": {
      // Keep block scope
      const { deviceId, newName } = request;
      if (
        !deviceId ||
        !newName ||
        typeof newName !== "string" ||
        newName.trim().length === 0
      ) {
        console.error("renameDevice validation failed:", request);
        return {
          success: false,
          message: "Invalid device ID or name provided.",
        };
      } else {
        try {
          const localInstanceId = await getInstanceId();
          if (deviceId === localInstanceId) {
            // Renaming the current device
            return await setInstanceNameInCore(newName.trim());
          } else {
            // Renaming another device (only update sync registry)
            return await renameDeviceDirect(deviceId, newName.trim());
          }
        } catch (error) {
          console.error("Error during renameDeviceDirect call:", error);
          return {
            success: false,
            message:
              error.message || "An unexpected error occurred during rename.",
          };
        }
      }
    }
    case "deleteDevice": {
      const { deviceId } = request;
      if (!deviceId) {
        return { success: false, message: "No device ID provided." };
      } else {
        // Assuming deleteDeviceDirect is imported correctly
        return await deleteDeviceDirect(deviceId);
      }
      break;

      // try {
      //     const deviceId = msg.deviceId;
      //     const deviceRegistry = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {});
      //     if (!deviceRegistry[deviceId]) return sendResponse({ success: false, message: 'Device not found.' });
      //     const groupBits = deviceRegistry[deviceId].groupBits || {};
      //     delete deviceRegistry[deviceId];
      //     await storage.set(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, deviceRegistry);
      //     // Remove device's bit from all groupState.assignedMask
      //     const groupState = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, {});
      //     let groupStateChanged = false;
      //     for (const groupName in groupBits) {
      //         const bit = groupBits[groupName];
      //         if (groupState[groupName] && bit !== undefined) {
      //             const currentMask = groupState[groupName].assignedMask;
      //             const newMask = currentMask & ~bit;
      //             if (newMask !== currentMask) {
      //                 groupState[groupName].assignedMask = newMask;
      //                 groupStateChanged = true;
      //             }
      //         }
      //     }
      //     if (groupStateChanged) {
      //         await storage.set(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, groupState);
      //     }
      //     // Remove local data if this is the current device
      //     const localId = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.INSTANCE_ID);
      //     if (deviceId === localId) {
      //         await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []);
      //         await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.GROUP_BITS, {});
      //     }
      //     sendResponse({ success: true });
      // } catch (e) {
      //     sendResponse({ success: false, message: e.message });
      // }
    }

    case "subscribeToGroup": {
      const groupToSubscribe = request.groupName;
      const localInstanceId = await getInstanceId(); // Fetch as needed
      let localSubscriptions = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []);
      let localGroupBits = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.GROUP_BITS, {});

      if (!groupToSubscribe) {
        return { success: false, message: "No group name provided." };
      } else if (localSubscriptions.includes(groupToSubscribe)) {
        return { success: false, message: "Already subscribed." };
      } else {
        // Fetch required sync state just before assigning bit
        const cachedGroupState = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, {});
        const cachedDeviceRegistry = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {});

        // FIXME: Argument mismatch and placeholder implementation for assignBitForGroup.
        // The assignBitForGroup function in core/group-manager.js expects (groupName, currentGroups, currentSubscriptions).
        // The call below passes (groupToSubscribe, localInstanceId, localGroupBits).
        // This will not work correctly with the current placeholder assignBitForGroup.
        // This entire bit assignment logic needs to be properly designed and implemented.
        const assignedBit = await assignBitForGroup(
          groupToSubscribe,
          cachedGroupState, // Example: Passing relevant state, but assignBitForGroup needs to be designed to use it
          cachedDeviceRegistry // Example: Passing relevant state
          // localInstanceId, localGroupBits might be needed by a real implementation
        );
        if (assignedBit !== null) {
          localSubscriptions.push(groupToSubscribe);
          localSubscriptions.sort();
          localGroupBits[groupToSubscribe] = assignedBit;
          await storage.set(
            browser.storage.local,
            LOCAL_STORAGE_KEYS.SUBSCRIPTIONS,
            localSubscriptions
          );
          await storage.set(
            browser.storage.local,
            LOCAL_STORAGE_KEYS.GROUP_BITS,
            localGroupBits
          );
          const localInstanceName = await getInstanceName(); // Fetch for heartbeat
          const registryForSubUpdate = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {});
          await performHeartbeat(
            localInstanceId,
            localInstanceName,
            localGroupBits,
            // registryForSubUpdate // Pass the fetched registry
          );
          return {
            success: true,
            subscribedGroup: groupToSubscribe,
            assignedBit: assignedBit,
          };
        } else {
          return {
            success: false,
            message: "Group is full or error assigning bit.",
          };
        }
      }
    }
    case "unsubscribeFromGroup": {
      const groupToUnsubscribe = request.groupName;
      const localInstanceId = await getInstanceId(); // Fetch as needed
      let localSubscriptions = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []);
      let localGroupBits = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.GROUP_BITS, {});

      if (!groupToUnsubscribe) {
        return { success: false, message: "No group name provided." };
      } else if (!localSubscriptions.includes(groupToUnsubscribe)) {
        return { success: false, message: "Not subscribed." };
      } else {
        try {
          localSubscriptions = localSubscriptions.filter(
            (g) => g !== groupToUnsubscribe
          );
          delete localGroupBits[groupToUnsubscribe];
          // const removedBit = localGroupBits[groupToUnsubscribe]; // Get bit *before* potential modification
          // The original code had `removedBit` fetched *after* `delete localGroupBits[groupToUnsubscribe]`, which would make it undefined.
          // However, the current logic for updating sync storage for unsubscribe doesn't seem to use `removedBit` directly in the way subscribe does.
          // It sets groupBits for the device to null for that group.

          await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, localSubscriptions);
          await storage.set(
            browser.storage.local,
            LOCAL_STORAGE_KEYS.GROUP_BITS,
            localGroupBits
          );
          console.log(`Locally unsubscribed from ${groupToUnsubscribe}.`);
          const removedBit = localGroupBits[groupToUnsubscribe]; // Get bit *after* potential modification

          // Update device registry to remove the group from its groupBits
          // This part seems correct: mark the specific group bit as null for this device.
          // The `removedBit` variable itself isn't directly used in this specific update structure,
          // but the principle of clearing the device's association is.
          // The actual bit value might be needed if groupState.assignedMask is to be cleared for this specific bit.
          // For now, the registry update is to nullify the device's bit for the group.
            const registryUpdate = {
              [localInstanceId]: { groupBits: { [groupToUnsubscribe]: null } },
            };
            const registryMergeResult = await storage.mergeItem(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, registryUpdate);
            if (registryMergeResult.success && removedBit !== undefined) { // Ensure registry update was fine and bit was known
              const groupState = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, {});
              if (groupState[groupToUnsubscribe]) {
              // Only update group state mask if registry update was successful
                const currentMask = groupState[groupToUnsubscribe].assignedMask;
                const newMask = currentMask & ~removedBit;
                if (newMask !== currentMask) {
                  await storage.mergeItem(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, {
                    [groupToUnsubscribe]: { assignedMask: newMask },
                  });
                }
              }
            } else {
              console.error(`Failed to update device registry during unsubscribe for ${groupToUnsubscribe}. Skipping group state mask update.`);
              // Potentially add logic to retry registry update later
            }

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
    }
    case "sendTabFromPopup": {
      const { groupName, tabData } = request;
      const senderDeviceId = await getInstanceId(); // Get the actual sender device ID

      // Assuming createAndStoreGroupTask is imported correctly
      return await createAndStoreGroupTask(groupName, tabData, senderDeviceId);
    }
    case "heartbeat":
      // Manual heartbeat
      // Fetch latest registry state before performing heartbeat
      const localInstanceId = await getInstanceId(); // Fetch as needed
      const localInstanceName = await getInstanceName();
      const localGroupBits = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.GROUP_BITS, {});

      // const cachedDeviceRegistryForHeartbeat = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {});
      await performHeartbeat(
        localInstanceId,
        localInstanceName,
        localGroupBits,
        // cachedDeviceRegistryForHeartbeat // Pass the correctly fetched registry
      );
      return { success: true };
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
      await browser.alarms.clear(ALARM_HEARTBEAT); // Use constant
      await browser.alarms.create(ALARM_HEARTBEAT, {
        periodInMinutes: minutes,
      }); // Use constant
      return { success: true };
    }
    default:
      console.warn("Unknown action received:", request.action);
      return {
        success: false,
        message: `Unknown action: ${request.action}`,
      };
  }
  // The 'return true' to keep the message channel open for async sendResponse is implicitly handled
  // by returning a Promise from the async listener function.
});

// Removed playNotificationSound function

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

// Example usage: showTabNotification({ title, url, groupName, faviconUrl }) when sending/receiving tabs
