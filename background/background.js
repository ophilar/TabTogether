import { SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS, MAX_DEVICES_PER_GROUP, STRINGS } from "../common/constants.js";
import { storage } from "../core/storage.js";
import {
  getInstanceId,
  getInstanceName,
  setInstanceName as setInstanceNameInCore,
  _clearInstanceNameCache as clearBackgroundInstanceNameCache,
} from "../core/instance.js";
import {
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

const HEARTBEAT_INTERVAL_MIN = 5;
const STALE_CHECK_INTERVAL_MIN = 60 * 24;
const TASK_CLEANUP_INTERVAL_MIN = 60 * 24 * 2;

const BACKGROUND_DEFAULT_STALE_DEVICE_THRESHOLD_DAYS = 30;
const BACKGROUND_DEFAULT_TASK_EXPIRY_DAYS = 14;

async function initializeExtension() {
  console.log("Initializing TabTogether (Advanced)...");
  try {
    console.log("Initializing storage...");
    const syncKeysToInitialize = Object.values(SYNC_STORAGE_KEYS);
    const syncData = await browser.storage.sync.get(syncKeysToInitialize);
    const defaults = {
      [SYNC_STORAGE_KEYS.DEFINED_GROUPS]: [],
      [SYNC_STORAGE_KEYS.GROUP_STATE]: {},
      [SYNC_STORAGE_KEYS.GROUP_TASKS]: {},
      [SYNC_STORAGE_KEYS.DEVICE_REGISTRY]: {},
      [SYNC_STORAGE_KEYS.SUBSCRIPTIONS]: {},
    };
    const updates = {};
    for (const key of syncKeysToInitialize) {
      if (syncData[key] === undefined && defaults[key] !== undefined) {
        updates[key] = defaults[key];
      }
    }
    if (Object.keys(updates).length > 0) {
      await browser.storage.sync.set(updates);
      console.log("Storage initialized with defaults:", updates);
    }
    let localInstanceId = await getInstanceId();
    let localInstanceName = await getInstanceName();
    const cachedDefinedGroups = syncData[SYNC_STORAGE_KEYS.DEFINED_GROUPS] ?? [];
    await setupAlarms();
    await updateContextMenu(cachedDefinedGroups);
    await performHeartbeat();
    console.log(`Initialization complete. Name: ${localInstanceName}`);
  } catch (error) {
    console.error("CRITICAL ERROR during initializeExtension:", error);
  }

  // console.log("Initialization complete."); // Already logged inside try or if error
}

async function setupAlarms() {
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

browser.alarms.onAlarm.addListener(async (alarm) => {
  console.log(`Alarm triggered: ${alarm.name}`);
  switch (alarm.name) {
    case ALARM_HEARTBEAT:
      {
        await performHeartbeat();
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
          cachedDeviceRegistry,
          cachedGroupState,
          currentStaleDeviceThresholdMs
        );
      }
      break;
    case ALARM_TASK_CLEANUP:
      {
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
      browser.contextMenus.create({
        id: "no-groups",
        title: STRINGS.contextMenuNoGroups,
        contexts: contexts,
        enabled: false,
      });
      return;
    }

    browser.contextMenus.create({
      id: "send-to-group-parent",
      title: STRINGS.contextMenuSendTabToGroup,
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
  );

  const menuItemId = info.menuItemId?.toString() || "";
  if (
    !menuItemId.startsWith("send-to-") ||
    menuItemId === "send-to-group-parent"
  ) {
    return;
  }

  const groupName = menuItemId.replace("send-to-", "");
  const localInstanceId = await getInstanceId();

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
      "Could not determine a valid URL to send from context:",
      info,
      "Tab:",
      tab
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
        if (deviceRegistry[deviceId]) {
          recipientDeviceIds.push(deviceId);
        }
      }
    }
  } catch (e) {
    console.error("Error determining recipients for context menu send:", e);
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
    ? STRINGS.notificationTabSentMessage(titleToSend, groupName)
    : taskMessage || STRINGS.sendTabFailed;

  browser.notifications.create({
    type: "basic",
    iconUrl: browser.runtime.getURL("icons/icon-48.png"),
    title: success ? STRINGS.notificationTabSentTitle : STRINGS.notificationSendFailedTitle,
    message: notificationMessage,
  });
});

browser.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName !== "sync") return;
  let contextMenuNeedsUpdate = false;
  let uiNeedsRefresh = false;

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
          await showTabNotification(tabDetail);
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

browser.runtime.onMessage.addListener(async (request, sender) => {
  console.log("Message received:", request.action, "Data:", request);

  switch (request.action) {
    case "getState": {
      const [
          localInstanceId,
          localInstanceName,
          localSubscriptions,
          definedGroups,
          groupState,
          deviceRegistry,
          allSubscriptionsSync,
      ] = await Promise.all([
          getInstanceId(),
          getInstanceName(),
          storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []),
          storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS, []),
          storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, {}),
          storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {}),
          storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, {}),
      ]);

      return {
        instanceId: localInstanceId,
        instanceName: localInstanceName,
        subscriptions: localSubscriptions,
        definedGroups: definedGroups.sort(),
        groupState,
        deviceRegistry,
        allSubscriptions: allSubscriptionsSync,
      };
    }

    case "createGroup": {
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
      if (!request.groupName) {
        return { success: false, message: STRINGS.noGroupNameProvided };
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
        return { success: false, message: STRINGS.invalidGroupName };
      }
      return await renameGroupDirect(oldName, newName.trim());
    }
    case "renameDevice": {
      const { newName } = request;
      if (
        !newName ||
        typeof newName !== "string" ||
        newName.trim().length === 0
      ) {
        return {
          success: false,
          message: STRINGS.invalidDeviceName,
        };
      }
      try {
        const setResult = await setInstanceNameInCore(newName.trim());
        if (setResult.success) {
          clearBackgroundInstanceNameCache(); 
        }
        return setResult;      
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
        return { success: false, message: STRINGS.noDeviceIdProvided };
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
        return { success: false, message: STRINGS.noGroupNameProvided };
      }
      if (localSubscriptions.includes(groupToSubscribe)) {
        return { success: false, message: STRINGS.alreadySubscribed };
      }

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
      if (MAX_DEVICES_PER_GROUP && currentSubscribersToGroup >= MAX_DEVICES_PER_GROUP) {
        return {
          success: false,
          message: STRINGS.groupFull(groupToSubscribe),
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
        return { success: false, message: STRINGS.noGroupNameProvided };
      }
      if (!localSubscriptions.includes(groupToUnsubscribe)) {
        return { success: false, message: STRINGS.notSubscribedToGroup };
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
              recipientDeviceIds.push(deviceId);
            }
          }
        }
      } catch (e) {
        console.error("Error determining recipients for popup send:", e);
        recipientDeviceIds = null;
      }

      return await createAndStoreGroupTask(
        groupName,
        tabData,
        senderDeviceId,
        recipientDeviceIds
      );
    }
    case "heartbeat": {
      await performHeartbeat();
      return { success: true };
    }
    case "testNotification": {
      await browser.notifications.create({
        type: "basic",
        iconUrl: browser.runtime.getURL("icons/icon-48.png"),
        title: STRINGS.notificationTestTitle,
        message: STRINGS.notificationTestMessage,
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
      return { success: false, message: STRINGS.actionUnknown(request.action) };
  }
});

async function showTabNotification({ title, url, groupName, faviconUrl }) {
  await browser.notifications.create({
    type: "basic",
    iconUrl: faviconUrl || browser.runtime.getURL("icons/icon-48.png"),
    title: STRINGS.notificationTabReceivedTitle(groupName),
    message: title || url || (STRINGS.tabReceivedMessage || "Tab received"),
    contextMessage: url || "",
  });
}
