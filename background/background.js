// background.js

import {
  SYNC_STORAGE_KEYS,
  LOCAL_STORAGE_KEYS,
  MAX_DEVICES_PER_GROUP,
  STRINGS // Assuming STRINGS might be needed for notifications etc.
} from "../common/constants.js";
import { storage } from "../core/storage.js"; // Import the storage wrapper
import {
  getInstanceId,
  getInstanceName,
} from "../core/instance.js";
import {
  renameDeviceDirect,
  createGroupDirect,
  deleteGroupDirect,
  renameGroupDirect,
  deleteDeviceDirect,
} from "../core/actions.js";
import { createAndStoreGroupTask } from "../core/tasks.js";
import { getNextAvailableBitPosition } from "../core/bitmask.js";
// Placeholder imports for refactored logic
import { assignBitForGroupFromManager } from "../core/group-manager.js"; // Assuming this is the new location
import { processTasksFromStorage } from "./task-processor.js"; // Assuming this is the new location
import { performHeartbeat } from "./heartbeat.js";
import { performStaleDeviceCheck, performTimeBasedTaskCleanup } from "./cleanup.js";
// Placeholder imports for message handlers
import * as generalHandlers from "./message-handlers/generalHandlers.js";
import * as groupActionHandlers from "./message-handlers/groupActionHandlers.js";
import * as deviceActionHandlers from "./message-handlers/deviceActionHandlers.js";
import * as taskActionHandlers from "./message-handlers/taskActionHandlers.js";

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
  try {
    console.log("Initializing TabTogether (Advanced)...");
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
    let cachedGroupState = await storage.get(
      browser.storage.sync,
      SYNC_STORAGE_KEYS.GROUP_STATE,
      {} // Default to empty object
    );
    let cachedDeviceRegistry = await storage.get(
      browser.storage.sync,
      SYNC_STORAGE_KEYS.DEVICE_REGISTRY,
      {} // Default to empty object
    );

    await setupAlarms();
    await updateContextMenu(cachedDefinedGroups); // Use cachedDefinedGroups if available
    await performHeartbeat(
      localInstanceId,
      localInstanceName,
      localGroupBits,
      // cachedDeviceRegistry // performHeartbeat now fetches its own registry
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
        // const cachedDeviceRegistry = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {});
        // const cachedGroupState = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, {});
        const staleThresholdDays = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.STALE_DEVICE_THRESHOLD_DAYS, DEFAULT_STALE_DEVICE_THRESHOLD_DAYS);
        const currentStaleDeviceThresholdMs = staleThresholdDays * 24 * 60 * 60 * 1000;
        await performStaleDeviceCheck(
          // cachedDeviceRegistry, // Pass fetched registry
          // cachedGroupState,   // Pass fetched group state
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

  if (
    !info.menuItemId.startsWith("send-to-") ||
    info.menuItemId === "send-to-group-parent"
  )
    return;

  const groupName = info.menuItemId.replace("send-to-", "");

  // Determine URL and Title
  let urlToSend = info.pageUrl; // Default to the page URL
  let titleToSend = tab?.title || "Link"; // Default to tab title

  if (info.linkUrl) {
    // Priority 1: Clicked on a link
    urlToSend = info.linkUrl;
    titleToSend = info.linkText || urlToSend;
  } else if (info.mediaType && info.srcUrl) { // Check mediaType exists
    // Clicked on media
    urlToSend = info.srcUrl;
    titleToSend = tab?.title || urlToSend; // Media doesn't have specific link text
  } else if (info.selectionText) {
    // Clicked on selected text
    urlToSend = info.pageUrl || tab?.url; // Send the page URL
    titleToSend = `"${info.selectionText}" on ${tab?.title || urlToSend}`;
  } else if (tab?.url) {
    // Fallback to tab URL if available (covers page, frame, tab contexts)
    // Ensure tab and tab.url exist
    urlToSend = tab.url;
    titleToSend = tab?.title || urlToSend;
  }

  const taskId = crypto.randomUUID();
  // --- Get sender's bit for processedMask ---
  let localGroupBits = await storage.get(
    browser.storage.local,
    LOCAL_STORAGE_KEYS.GROUP_BITS,
    {}
  );
  const senderBit = localGroupBits[groupName] || 0;

  if (!urlToSend || urlToSend === "about:blank") {
    // Added check for about:blank
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

  // Set processedMask to senderBit so sender is marked as processed
  const newTask = {
    [taskId]: {
      url: urlToSend,
      title: titleToSend,
      processedMask: senderBit,
      creationTimestamp: Date.now(),
    },
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
    await processTasksFromStorage(changes[SYNC_STORAGE_KEYS.GROUP_TASKS].newValue); // Call the imported function
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
    case "setInstanceName":
      if (
        !request.name ||
        typeof request.name !== "string" ||
        request.name.trim().length === 0
      ) {
        return { success: false, message: "Invalid name provided." };
      } else {
        const localInstanceId = await getInstanceId(); // Fetch as needed
        let localInstanceName = request.name.trim();
        const localGroupBits = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.GROUP_BITS, {});
        // 1. Update local storage cache

        await storage.set(
          browser.storage.local,
          LOCAL_STORAGE_KEYS.INSTANCE_NAME,
          localInstanceName
        );
        // 2. Fetch registry and trigger heartbeat to update the name
        const registryForNameUpdate = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {});
        await performHeartbeat( // Heartbeat updates the name in the registry
          localInstanceId,
          localInstanceName,
          localGroupBits,
          registryForNameUpdate // Pass the fetched registry
        );
        return { success: true, newName: localInstanceName };
      }

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
          // renameDeviceDirect should already be imported
          return await renameDeviceDirect(deviceId, newName.trim());
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

        const assignedBit = await assignBitForGroupFromManager( // Call the imported function
          groupToSubscribe,
          localInstanceId,
          localGroupBits,
      // cachedGroupState, // These would be fetched within the manager or handler
      // cachedDeviceRegistry
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
          console.log(`Locally unsubscribed from ${groupToUnsubscribe}.`);
          const removedBit = localGroupBits[groupToUnsubscribe]; // Get bit *after* potential modification

          // Fetch required sync state just before updating sync
          // const cachedDeviceRegistry = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {});

          if (removedBit !== undefined) {
            const registryUpdate = {
              [localInstanceId]: { groupBits: { [groupToUnsubscribe]: null } },
            };
            const registryMergeResult = await storage.mergeItem(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, registryUpdate);

            const groupState = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, {});
            if (groupState[groupToUnsubscribe]) {
              // Only update group state mask if registry update was successful
              if (registryMergeResult.success) {
                const currentMask = groupState[groupToUnsubscribe].assignedMask;
                const newMask = currentMask & ~removedBit;
                if (newMask !== currentMask) {
                  await storage.mergeItem(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, {
                    [groupToUnsubscribe]: { assignedMask: newMask },
                  });
                }
              } else {
                console.error(`Failed to update device registry during unsubscribe for ${groupToUnsubscribe}. Skipping group state mask update.`);
                // Potentially add logic to retry registry update later
              }
            } else {
              console.warn(
                `Group state for ${groupToUnsubscribe} not found during unsubscribe mask update.`
              );
            }
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
      const localGroupBits = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.GROUP_BITS, {}); // Fetch as needed
      const senderBit = localGroupBits[groupName] || 0;
      // Assuming createAndStoreGroupTask is imported correctly
      return await createAndStoreGroupTask(groupName, tabData, senderBit);
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
