// background.js

import {
  SYNC_STORAGE_KEYS,
  LOCAL_STORAGE_KEYS,
  MAX_DEVICES_PER_GROUP,
  mergeSyncStorage,
  getInstanceId,
  getInstanceName,
  deepMerge,
  performHeartbeat,
  performStaleDeviceCheck,
  performTimeBasedTaskCleanup,
  renameDeviceDirect,
  createGroupDirect,
  deleteGroupDirect,
  renameGroupDirect,
  deleteDeviceDirect,
  createAndStoreGroupTask // Assuming this is also in utils.js
} from "./utils.js";
import { getNextAvailableBitPosition } from "./utils.js";

const ALARM_HEARTBEAT = "deviceHeartbeat";
const ALARM_STALE_CHECK = "staleDeviceCheck";
const ALARM_TASK_CLEANUP = "taskCleanup";

const HEARTBEAT_INTERVAL_MIN = 5; // Every 5 minutes
const STALE_CHECK_INTERVAL_MIN = 60 * 24; // Every day
const TASK_CLEANUP_INTERVAL_MIN = 60 * 24 * 2; // Every 2 days

const STALE_DEVICE_THRESHOLD_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const TASK_EXPIRY_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

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

    // Save platform info to storage.local if not already present
    const platformInfo = await browser.runtime.getPlatformInfo();
    await browser.storage.local.set({ platformInfo });

    // Fetch local data first
    let localInstanceId = await getInstanceId();
    let localInstanceName = await getInstanceName();
    let localGroupBits = await storage.get(
      browser.storage.local,
      LOCAL_STORAGE_KEYS.GROUP_BITS,
      {}
    );

    // Only read from sync storage, do not write defaults
    let cachedDefinedGroups = await storage.get(
      browser.storage.sync,
      SYNC_STORAGE_KEYS.DEFINED_GROUPS,
      undefined
    );
    let cachedGroupState = await storage.get(
      browser.storage.sync,
      SYNC_STORAGE_KEYS.GROUP_STATE,
      undefined
    );
    let cachedDeviceRegistry = await storage.get(
      browser.storage.sync,
      SYNC_STORAGE_KEYS.DEVICE_REGISTRY,
      undefined
    );
    if (cachedDefinedGroups === undefined) cachedDefinedGroups = [];
    if (cachedGroupState === undefined) cachedGroupState = {};
    if (cachedDeviceRegistry === undefined) cachedDeviceRegistry = {};

    await setupAlarms();
    await updateContextMenu(cachedDefinedGroups); // Use cachedDefinedGroups if available
    await performHeartbeat(
      localInstanceId,
      localInstanceName,
      localGroupBits,
      cachedDeviceRegistry
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
  // Always fetch latest state from storage
  let localInstanceId = await getInstanceId();
  let localInstanceName = await getInstanceName();
  let localSubscriptions = await storage.get(
    browser.storage.local,
    LOCAL_STORAGE_KEYS.SUBSCRIPTIONS,
    []
  );
  let localGroupBits = await storage.get(
    browser.storage.local,
    LOCAL_STORAGE_KEYS.GROUP_BITS,
    {}
  );
  let localProcessedTasks = await storage.get(
    browser.storage.local,
    LOCAL_STORAGE_KEYS.PROCESSED_TASKS,
    {}
  );
  let cachedDefinedGroups = await storage.get(
    browser.storage.sync,
    SYNC_STORAGE_KEYS.DEFINED_GROUPS,
    []
  );
  let cachedGroupState = await storage.get(
    browser.storage.sync,
    SYNC_STORAGE_KEYS.GROUP_STATE,
    {}
  );
  let cachedDeviceRegistry = await storage.get(
    browser.storage.sync,
    SYNC_STORAGE_KEYS.DEVICE_REGISTRY,
    {}
  );

  console.log(`Alarm triggered: ${alarm.name}`);
  switch (alarm.name) {
    case ALARM_HEARTBEAT:
      await performHeartbeat(
        localInstanceId,
        localInstanceName,
        localGroupBits,
        cachedDeviceRegistry
      );
      break;
    case ALARM_STALE_CHECK:
      await performStaleDeviceCheck(cachedDeviceRegistry, cachedGroupState);
      break;
    case ALARM_TASK_CLEANUP:
      await performTimeBasedTaskCleanup(localProcessedTasks);
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
    browser.contextMenus.create({
      id: `send-to-${groupName}`,
      parentId: "send-to-group-parent",
      title: groupName,
      contexts: contexts,
    });
  });
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
    // Clicked on a link
    urlToSend = info.linkUrl;
    titleToSend = info.linkText || urlToSend;
  } else if (info.srcUrl) {
    // Clicked on media
    urlToSend = info.srcUrl;
    titleToSend = tab?.title || urlToSend; // Media doesn't have specific link text
  } else if (info.selectionText) {
    // Clicked on selected text
    urlToSend = info.pageUrl || tab?.url; // Send the page URL
    titleToSend = `"${info.selectionText}" on ${tab?.title || urlToSend}`;
  } else if (info.menuItemId.startsWith("send-to-") && tab) {
    // Clicked directly on the tab context menu item OR page/frame context
    // The 'tab' object passed to the listener IS the relevant tab
    urlToSend = tab.url;
    titleToSend = tab.title || urlToSend;
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
  const success = await mergeSyncStorage(SYNC_STORAGE_KEYS.GROUP_TASKS, update);

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

    // Check if definedGroups changed
    if (changes[SYNC_STORAGE_KEYS.DEFINED_GROUPS]) {
        console.log("Cache updated: definedGroups");
        contextMenuNeedsUpdate = true; // Mark that menu needs update
    }
    // Check other keys (no need to cache them here if only used elsewhere)
    if (changes[SYNC_STORAGE_KEYS.GROUP_STATE]) {
        console.log("Cache updated: groupState");
    }
    if (changes[SYNC_STORAGE_KEYS.DEVICE_REGISTRY]) {
        console.log("Cache updated: deviceRegistry");
    }

    // Trigger actions based on changes
    if (contextMenuNeedsUpdate) {
        // Fetch the latest definedGroups right before updating the menu
        const groupsForMenu = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS, []);
        await updateContextMenu(groupsForMenu); // Pass the freshly fetched groups
    }

    if (changes[SYNC_STORAGE_KEYS.GROUP_TASKS]) {
        console.log("Detected change in group tasks, processing...");
        await processIncomingTasks(changes[SYNC_STORAGE_KEYS.GROUP_TASKS].newValue); // Pass only new value
    }
});

// --- Task Processing (Remains largely the same logic) ---
async function processIncomingTasks(allGroupTasks) {
  // ... (processIncomingTasks logic remains the same as the previous version) ...
  // It already uses local caches (localSubscriptions, localGroupBits, localProcessedTasks)
  // It fetches groupState only when needed for cleanup check.
  if (!allGroupTasks) {
    console.log("Group tasks cleared, skipping processing.");
    return;
  }

  let localSubscriptions = await storage.get(
    browser.storage.local,
    LOCAL_STORAGE_KEYS.SUBSCRIPTIONS,
    []
  );
  let localGroupBits = await storage.get(
    browser.storage.local,
    LOCAL_STORAGE_KEYS.GROUP_BITS,
    {}
  );
  let localProcessedTasks = await storage.get(
    browser.storage.local,
    LOCAL_STORAGE_KEYS.PROCESSED_TASKS,
    {}
  );
  const currentSubscriptions = localSubscriptions;
  const currentGroupBits = localGroupBits;
  let currentProcessedTasks = { ...localProcessedTasks };
  let tasksToProcess = [];
  let localProcessedTasksUpdated = false;

  for (const groupName in allGroupTasks) {
    if (currentSubscriptions.includes(groupName)) {
      const myBit = currentGroupBits[groupName];
      if (myBit === undefined) {
        console.warn(
          `Device subscribed to ${groupName} but has no assigned bit.`
        );
        continue;
      }
      const bitPosition = Math.log2(myBit);

      for (const taskId in allGroupTasks[groupName]) {
        if (!currentProcessedTasks[taskId]) {
          const task = allGroupTasks[groupName][taskId];
          // --- Only process if my bit is not set in processedMask ---
          if (!((task.processedMask & myBit) === myBit)) {
            tasksToProcess.push({ groupName, taskId, task, myBit });
          } else {
            console.log(
              `Task ${taskId} already processed by this device according to sync mask. Marking locally.`
            );
            currentProcessedTasks[taskId] = true;
            localProcessedTasksUpdated = true;
          }
        }
      }
    }
  }

  if (localProcessedTasksUpdated) {
    localProcessedTasks = currentProcessedTasks;
    await storage.set(
      browser.storage.local,
      LOCAL_STORAGE_KEYS.PROCESSED_TASKS,
      localProcessedTasks
    );
  }

  if (tasksToProcess.length > 0) {
    console.log(`Processing ${tasksToProcess.length} new tasks...`);
    // Use cached groupState if available, fetch otherwise
    const cachedGroupState = await storage.get(
      browser.storage.sync,
      SYNC_STORAGE_KEYS.GROUP_STATE,
      {}
    );
    let processedTasksUpdateBatch = {};

    for (const { groupName, taskId, task, myBit } of tasksToProcess) {
      console.log(
        `Processing task ${taskId} for group ${groupName}: ${task.url}`
      );
      try {
        await browser.tabs.create({ url: task.url, active: false });
      } catch (error) {
        console.error(`Failed to open tab for task ${taskId}:`, error);
        continue;
      }

      processedTasksUpdateBatch[taskId] = true;
      const newProcessedMask = task.processedMask | myBit;
      const taskUpdate = {
        [groupName]: { [taskId]: { processedMask: newProcessedMask } },
      };
      const mergeSuccess = await mergeSyncStorage(
        SYNC_STORAGE_KEYS.GROUP_TASKS,
        taskUpdate
      );

      if (mergeSuccess) {
        const currentGroupState = cachedGroupState[groupName];
        if (
          currentGroupState &&
          newProcessedMask === currentGroupState.assignedMask
        ) {
          console.log(
            `Task ${taskId} fully processed by all assigned devices in group ${groupName}. Cleaning up.`
          );
          const cleanupUpdate = { [groupName]: { [taskId]: null } };
          await mergeSyncStorage(SYNC_STORAGE_KEYS.GROUP_TASKS, cleanupUpdate);
          delete processedTasksUpdateBatch[taskId];
        }
      } else {
        console.error(
          `Failed to merge task update for ${taskId}. It might be processed again.`
        );
      }
    }

    if (Object.keys(processedTasksUpdateBatch).length > 0) {
      localProcessedTasks = {
        ...localProcessedTasks,
        ...processedTasksUpdateBatch,
      };
      await storage.set(
        browser.storage.local,
        LOCAL_STORAGE_KEYS.PROCESSED_TASKS,
        localProcessedTasks
      );
    }
  } else {
    console.log("No new tasks require processing.");
  }
}

// --- Message Handling (Uses Caches for getState) ---

browser.runtime.onMessage.addListener(async (request, sender) => {
  // Removed sendResponse param for clarity
  console.log("Message received:", request.action, "Data:", request);

  // Define a variable to hold the response
  let response;

  // Fetch state needed for multiple actions (can be optimized later if needed)
  let localInstanceId = await getInstanceId();
  let localInstanceName = await getInstanceName();
  let localSubscriptions = await storage.get(
    browser.storage.local,
    LOCAL_STORAGE_KEYS.SUBSCRIPTIONS,
    []
  );
  let localGroupBits = await storage.get(
    browser.storage.local,
    LOCAL_STORAGE_KEYS.GROUP_BITS,
    {}
  );
  let localProcessedTasks = await storage.get(
    browser.storage.local,
    LOCAL_STORAGE_KEYS.PROCESSED_TASKS,
    []
  );
  let cachedDefinedGroups = await storage.get(
    browser.storage.sync,
    SYNC_STORAGE_KEYS.DEFINED_GROUPS,
    []
  );
  let cachedGroupState = await storage.get(
    browser.storage.sync,
    SYNC_STORAGE_KEYS.GROUP_STATE,
    {}
  );
  let cachedDeviceRegistry = await storage.get(
    browser.storage.sync,
    SYNC_STORAGE_KEYS.DEVICE_REGISTRY,
    {}
  );

  switch (request.action) {
    case "getState":
      // Return cached data primarily
      response = {
        instanceId: localInstanceId,
        instanceName: localInstanceName,
        subscriptions: localSubscriptions,
        groupBits: localGroupBits,
        definedGroups: cachedDefinedGroups ?? [], // Ensure array default
        groupState: cachedGroupState ?? {}, // Ensure object default
        deviceRegistry: cachedDeviceRegistry ?? {}, // Ensure object default
      };
      break; // Don't forget break statements

    case "setInstanceName":
      if (
        !request.name ||
        typeof request.name !== "string" ||
        request.name.trim().length === 0
      ) {
        response = { success: false, message: "Invalid name provided." };
      } else {
        localInstanceName = request.name.trim();
        await storage.set(
          browser.storage.local,
          LOCAL_STORAGE_KEYS.INSTANCE_NAME,
          localInstanceName
        );
        await performHeartbeat(
          localInstanceId,
          localInstanceName,
          localGroupBits,
          cachedDeviceRegistry
        );
        response = { success: true, newName: localInstanceName };
      }
      break;

    case "createGroup": {
      // Use block scope for constants if needed
      if (
        !request.groupName ||
        typeof request.groupName !== "string" ||
        request.groupName.trim().length === 0
      ) {
        response = { success: false, message: "Invalid group name provided." };
      } else {
        // Assuming createGroupDirect is imported correctly
        response = await createGroupDirect(request.groupName.trim());
      }
      break;
    }
    case "deleteGroup": {
      if (!request.groupName) {
        response = { success: false, message: "No group name provided." };
      } else {
        // Assuming deleteGroupDirect is imported correctly
        response = await deleteGroupDirect(request.groupName);
      }
      break;
    }
    case "renameGroup": {
      const { oldName, newName } = request;
      if (
        !oldName ||
        !newName ||
        typeof newName !== "string" ||
        newName.trim().length === 0
      ) {
        response = { success: false, message: "Invalid group name." };
      } else {
        // Assuming renameGroupDirect is imported correctly
        response = await renameGroupDirect(oldName, newName.trim()); // Trim newName
      }
      break;
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
        response = {
          success: false,
          message: "Invalid device ID or name provided.",
        };
      } else {
        try {
          // renameDeviceDirect should already be imported
          response = await renameDeviceDirect(deviceId, newName.trim());
        } catch (error) {
          console.error("Error during renameDeviceDirect call:", error);
          response = {
            success: false,
            message:
              error.message || "An unexpected error occurred during rename.",
          };
        }
      }
      // Log the response determined within this case
      console.log(
        "!!! Background (renameDevice case): Determined response:",
        response
      );
      break; // Break from case
    }
    case "deleteDevice": {
      const { deviceId } = request;
      if (!deviceId) {
        response = { success: false, message: "No device ID provided." };
      } else {
        // Assuming deleteDeviceDirect is imported correctly
        response = await deleteDeviceDirect(deviceId);
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
      if (!groupToSubscribe) {
        response = { success: false, message: "No group name provided." };
      } else if (localSubscriptions.includes(groupToSubscribe)) {
        response = { success: false, message: "Already subscribed." };
      } else {
        const assignedBit = await assignBitForGroup(
          groupToSubscribe,
          localInstanceId,
          localGroupBits,
          cachedGroupState,
          cachedDeviceRegistry
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
          await performHeartbeat(
            localInstanceId,
            localInstanceName,
            localGroupBits,
            cachedDeviceRegistry
          );
          response = {
            success: true,
            subscribedGroup: groupToSubscribe,
            assignedBit: assignedBit,
          };
        } else {
          response = {
            success: false,
            message: "Group is full or error assigning bit.",
          };
        }
      }
      break;
    }
    case "unsubscribeFromGroup": {
      const groupToUnsubscribe = request.groupName;
      if (!groupToUnsubscribe) {
        response = { success: false, message: "No group name provided." };
      } else if (!localSubscriptions.includes(groupToUnsubscribe)) {
        response = { success: false, message: "Not subscribed." };
      } else {
        try {
          const removedBit = localGroupBits[groupToUnsubscribe];
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

          if (removedBit !== undefined) {
            const registryUpdate = {
              [localInstanceId]: { groupBits: { [groupToUnsubscribe]: null } },
            };
            await mergeSyncStorage(
              SYNC_STORAGE_KEYS.DEVICE_REGISTRY,
              registryUpdate
            );

            const groupState =
              cachedGroupState ??
              (await storage.get(
                browser.storage.sync,
                SYNC_STORAGE_KEYS.GROUP_STATE,
                {}
              ));
            if (groupState[groupToUnsubscribe]) {
              const currentMask = groupState[groupToUnsubscribe].assignedMask;
              const newMask = currentMask & ~removedBit;
              if (newMask !== currentMask) {
                await mergeSyncStorage(SYNC_STORAGE_KEYS.GROUP_STATE, {
                  [groupToUnsubscribe]: { assignedMask: newMask },
                });
              }
            } else {
              console.warn(
                `Group state for ${groupToUnsubscribe} not found during unsubscribe mask update.`
              );
            }
          } else {
            console.warn(
              `Could not find bit for group ${groupToUnsubscribe} during unsubscribe cleanup.`
            );
          }
          response = { success: true, unsubscribedGroup: groupToUnsubscribe };
        } catch (error) {
          console.error(
            `Error unsubscribing from group ${groupToUnsubscribe}:`,
            error
          );
          response = {
            success: false,
            message: `Error unsubscribing: ${error.message}`,
          };
        }
      }
      break;
    }
    case "sendTabFromPopup": {
      const { groupName, tabData } = request;
      const senderBit = localGroupBits[groupName] || 0;
      // Assuming createAndStoreGroupTask is imported correctly
      response = await createAndStoreGroupTask(groupName, tabData, senderBit);
      break;
    }
    case "heartbeat":
      // Manual heartbeat
      await performHeartbeat(
        localInstanceId,
        localInstanceName,
        localGroupBits,
        cachedDeviceRegistry
      );
      response = { success: true };
      break;

    case "testNotification": {
      await browser.notifications.create({
        type: "basic",
        iconUrl: browser.runtime.getURL("icons/icon-48.png"),
        title: "TabTogether Test",
        message: "This is a test notification.",
      });
      response = { success: true };
      break;
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
      response = { success: true };
      break;
    }
    default:
      console.warn("Unknown action received:", request.action);
      response = {
        success: false,
        message: `Unknown action: ${request.action}`,
      };
      break;
  }

  // Log *before* returning from the listener function itself
  console.log(
    `!!! Background: Final response for action ${request.action}:`,
    response
  );
  return response; // Return the determined response from the listener
});

// --- Helper for Bit Assignment (Refactored for bit reuse, no assignedCount) ---
async function assignBitForGroup(
  groupName,
  localInstanceId,
  localGroupBits,
  cachedGroupState,
  cachedDeviceRegistry
) {
  const MAX_RETRIES = 5;
  const BASE_DELAY_MS = 100;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const groupState =
        cachedGroupState ??
        (await storage.get(
          browser.storage.sync,
          SYNC_STORAGE_KEYS.GROUP_STATE,
          {}
        ));
      const currentGroupData = groupState[groupName];
      if (!currentGroupData) {
        console.error(
          `Group ${groupName} does not exist in groupState. Cannot assign bit.`
        );
        return null;
      }
      const currentAssignedMask = currentGroupData.assignedMask;
      const bitPosition = getNextAvailableBitPosition(currentAssignedMask);
      if (bitPosition === -1) {
        console.error(
          `Group ${groupName} is full (${MAX_DEVICES_PER_GROUP} devices). Cannot assign bit.`
        );
        return null;
      }
      const myBit = 1 << bitPosition;
      // Optimistic Lock Check (fetch fresh state for check)
      const checkGroupState = await storage.get(
        browser.storage.sync,
        SYNC_STORAGE_KEYS.GROUP_STATE,
        {}
      );
      const checkGroupData = checkGroupState[groupName];
      if (!checkGroupData) {
        console.warn(
          `Group state for ${groupName} missing during bit assignment. Retrying...`
        );
        const delay =
          BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * BASE_DELAY_MS;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      // If the bit is now taken, retry
      if (((checkGroupData.assignedMask >> bitPosition) & 1) !== 0) {
        console.warn(
          `Race condition: bit ${bitPosition} for group ${groupName} is now taken. Retrying...`
        );
        const delay =
          BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * BASE_DELAY_MS;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      // Proceed with update
      const newAssignedMask = currentAssignedMask | myBit;
      const update = { [groupName]: { assignedMask: newAssignedMask } };
      const success = await mergeSyncStorage(
        SYNC_STORAGE_KEYS.GROUP_STATE,
        update
      );
      if (success) {
        // Update registry immediately
        const registryUpdate = {
          [localInstanceId]: { groupBits: { [groupName]: myBit } },
        };
        await mergeSyncStorage(
          SYNC_STORAGE_KEYS.DEVICE_REGISTRY,
          registryUpdate
        );
        if (cachedGroupState)
          cachedGroupState = deepMerge(cachedGroupState, update);
        if (cachedDeviceRegistry)
          cachedDeviceRegistry = deepMerge(
            cachedDeviceRegistry,
            registryUpdate
          );
        console.log(
          `Assigned bit ${myBit} (pos ${bitPosition}) to device ${localInstanceId} for group ${groupName}`
        );
        return myBit;
      } else {
        console.error(
          `Failed to merge group state for ${groupName} during bit assignment. Retrying...`
        );
        await new Promise((resolve) =>
          setTimeout(resolve, 50 + Math.random() * 100)
        );
        continue;
      }
    } catch (error) {
      console.error(
        `Error during bit assignment attempt ${attempt + 1} for ${groupName}:`,
        error
      );
      if (attempt < MAX_RETRIES - 1) {
        const delay =
          BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * BASE_DELAY_MS;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  console.error(
    `Failed to assign bit for ${groupName} after ${MAX_RETRIES} retries.`
  );
  return null;
}

// Utility: Play notification sound
async function playNotificationSound(sound) {
  if (sound === "none") return;
  let url = "";
  if (sound === "chime")
    url = "https://cdn.jsdelivr.net/gh/ophilar/TabTogether-assets/chime.mp3";
  if (sound === "ding")
    url = "https://cdn.jsdelivr.net/gh/ophilar/TabTogether-assets/ding.mp3";
  if (sound === "default") url = "";
  if (url) {
    const audio = new Audio(url);
    audio.volume = 0.7;
    audio.play();
  }
}

// Enhanced notification for tab send/receive
async function showTabNotification({ title, url, groupName, faviconUrl }) {
  const sound = await storage.get(
    browser.storage.local,
    "notifSound",
    "default"
  );
  const duration = await storage.get(
    browser.storage.local,
    "notifDuration",
    5
  );
  await playNotificationSound(sound);
  const notifId = await browser.notifications.create({
    type: "basic",
    iconUrl: faviconUrl || browser.runtime.getURL("icons/icon-48.png"),
    title: `TabTogether: ${groupName ? "Group " + groupName : "Tab Received"}`,
    message: title || url || "Tab received",
    contextMessage: url || "",
    requireInteraction: false,
  });
  if (duration > 0) {
    setTimeout(() => browser.notifications.clear(notifId), duration * 1000);
  }
}

// Example usage: showTabNotification({ title, url, groupName, faviconUrl }) when sending/receiving tabs
