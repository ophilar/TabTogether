// background.js

import { SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS, MAX_DEVICES_PER_GROUP, getStorage, mergeSyncStorage, getInstanceId, getInstanceName, deepMerge, getFromStorage, setInStorage, performHeartbeat, performStaleDeviceCheck, performTimeBasedTaskCleanup } from './utils.js';
import { getNextAvailableBitPosition } from './utils.js';

const ALARM_HEARTBEAT = 'deviceHeartbeat';
const ALARM_STALE_CHECK = 'staleDeviceCheck';
const ALARM_TASK_CLEANUP = 'taskCleanup';

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
            [SYNC_STORAGE_KEYS.DEVICE_REGISTRY]: {}
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
        let localGroupBits = await getFromStorage(browser.storage.local, LOCAL_STORAGE_KEYS.GROUP_BITS, {});

        // Only read from sync storage, do not write defaults
        let cachedDefinedGroups = await getFromStorage(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS, undefined);
        let cachedGroupState = await getFromStorage(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, undefined);
        let cachedDeviceRegistry = await getFromStorage(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, undefined);
        if (cachedDefinedGroups === undefined) cachedDefinedGroups = [];
        if (cachedGroupState === undefined) cachedGroupState = {};
        if (cachedDeviceRegistry === undefined) cachedDeviceRegistry = {};

        await setupAlarms();
        await updateContextMenu(cachedDefinedGroups); // Use cachedDefinedGroups if available
        await performHeartbeat(localInstanceId, localInstanceName, localGroupBits, cachedDeviceRegistry); // Perform initial heartbeat/registry update
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
    browser.alarms.create(ALARM_HEARTBEAT, { periodInMinutes: HEARTBEAT_INTERVAL_MIN });
    browser.alarms.create(ALARM_STALE_CHECK, { periodInMinutes: STALE_CHECK_INTERVAL_MIN });
    browser.alarms.create(ALARM_TASK_CLEANUP, { periodInMinutes: TASK_CLEANUP_INTERVAL_MIN });
}

browser.runtime.onInstalled.addListener(initializeExtension);
browser.runtime.onStartup.addListener(initializeExtension);

// --- Alarm Handlers ---

browser.alarms.onAlarm.addListener(async (alarm) => {
    // Always fetch latest state from storage
    let localInstanceId = await getInstanceId();
    let localInstanceName = await getInstanceName();
    let localSubscriptions = await getFromStorage(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []);
    let localGroupBits = await getFromStorage(browser.storage.local, LOCAL_STORAGE_KEYS.GROUP_BITS, {});
    let localProcessedTasks = await getFromStorage(browser.storage.local, LOCAL_STORAGE_KEYS.PROCESSED_TASKS, {});
    let cachedDefinedGroups = await getFromStorage(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS, []);
    let cachedGroupState = await getFromStorage(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, {});
    let cachedDeviceRegistry = await getFromStorage(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {});

    console.log(`Alarm triggered: ${alarm.name}`);
    switch (alarm.name) {
        case ALARM_HEARTBEAT:
            await performHeartbeat(localInstanceId, localInstanceName, localGroupBits, cachedDeviceRegistry);
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
    const groups = cachedDefinedGroups ?? await getFromStorage(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS, []);
    const contexts = ["page", "link", "image", "video", "audio", "selection", "tab"];

    if (groups.length === 0) {
        browser.contextMenus.create({
            id: "no-groups", title: "No groups defined", contexts: contexts, enabled: false
        });
        return;
    }

    browser.contextMenus.create({
        id: "send-to-group-parent",
        title: "Send Tab to Group",
        contexts: contexts
    });

    groups.sort().forEach(groupName => {
        browser.contextMenus.create({
            id: `send-to-${groupName}`,
            parentId: "send-to-group-parent",
            title: groupName,
            contexts: contexts
        });
    });
}

browser.contextMenus.onClicked.addListener(async (info, tab) => {
    console.log("BACKGROUND.JS: onContextMenuClicked triggered. Info:", info, "Tab:", tab); // Log both

    if (!info.menuItemId.startsWith("send-to-") || info.menuItemId === "send-to-group-parent") return;

    const groupName = info.menuItemId.replace("send-to-", "");

    // Determine URL and Title
    let urlToSend = info.pageUrl; // Default to the page URL
    let titleToSend = tab?.title || "Link"; // Default to tab title

    if (info.linkUrl) { // Clicked on a link
        urlToSend = info.linkUrl;
        titleToSend = info.linkText || urlToSend;
    } else if (info.srcUrl) { // Clicked on media
        urlToSend = info.srcUrl;
        titleToSend = tab?.title || urlToSend; // Media doesn't have specific link text
    } else if (info.selectionText) { // Clicked on selected text
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
    let localGroupBits = await getFromStorage(browser.storage.local, LOCAL_STORAGE_KEYS.GROUP_BITS, {});
    const senderBit = localGroupBits[groupName] || 0;

    if (!urlToSend || urlToSend === "about:blank") { // Added check for about:blank
        console.error("Could not determine a valid URL to send from context:", info, "Tab:", tab);
        browser.notifications.create({ type: "basic", iconUrl: browser.runtime.getURL("icons/icon-48.png"), title: "Send Failed", message: "Cannot send this type of link/page." });
        return;
    }

    // Set processedMask to senderBit so sender is marked as processed
    const newTask = { [taskId]: { url: urlToSend, title: titleToSend, processedMask: senderBit, creationTimestamp: Date.now() } };
    const update = { [groupName]: newTask };

    console.log(`Sending task ${taskId} to group ${groupName}: ${urlToSend}`);
    const success = await mergeSyncStorage(SYNC_STORAGE_KEYS.GROUP_TASKS, update);

    browser.notifications.create({
        type: "basic",
        iconUrl: browser.runtime.getURL("icons/icon-48.png"),
        title: success ? "Tab Sent" : "Send Failed",
        message: success ? `Sent "${titleToSend}" to group "${groupName}".` : "Failed to save task to sync storage."
    });
});

// --- Storage Change Listener (Updates Caches) ---

browser.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName !== 'sync') return; // Only care about sync changes

    let contextMenuNeedsUpdate = false;

    // Update caches based on changes
    if (changes[SYNC_STORAGE_KEYS.DEFINED_GROUPS]) {
        const cachedDefinedGroups = changes[SYNC_STORAGE_KEYS.DEFINED_GROUPS].newValue ?? [];
        console.log("Cache updated: definedGroups");
        contextMenuNeedsUpdate = true; // Groups changed, update menu
    }
    if (changes[SYNC_STORAGE_KEYS.GROUP_STATE]) {
        const cachedGroupState = changes[SYNC_STORAGE_KEYS.GROUP_STATE].newValue ?? {};
        console.log("Cache updated: groupState");
    }
    if (changes[SYNC_STORAGE_KEYS.DEVICE_REGISTRY]) {
        const cachedDeviceRegistry = changes[SYNC_STORAGE_KEYS.DEVICE_REGISTRY].newValue ?? {};
        console.log("Cache updated: deviceRegistry");
    }

    // Trigger actions based on changes
    if (contextMenuNeedsUpdate) {
        if (cachedDefinedGroups === undefined) cachedDefinedGroups = [];
        await updateContextMenu(cachedDefinedGroups);
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

    let localSubscriptions = await getFromStorage(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []);
    let localGroupBits = await getFromStorage(browser.storage.local, LOCAL_STORAGE_KEYS.GROUP_BITS, {});
    let localProcessedTasks = await getFromStorage(browser.storage.local, LOCAL_STORAGE_KEYS.PROCESSED_TASKS, {});
    const currentSubscriptions = localSubscriptions;
    const currentGroupBits = localGroupBits;
    let currentProcessedTasks = { ...localProcessedTasks };
    let tasksToProcess = [];
    let localProcessedTasksUpdated = false;

    for (const groupName in allGroupTasks) {
        if (currentSubscriptions.includes(groupName)) {
            const myBit = currentGroupBits[groupName];
            if (myBit === undefined) {
                console.warn(`Device subscribed to ${groupName} but has no assigned bit.`);
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
                        console.log(`Task ${taskId} already processed by this device according to sync mask. Marking locally.`);
                        currentProcessedTasks[taskId] = true;
                        localProcessedTasksUpdated = true;
                    }
                }
            }
        }
    }

    if (localProcessedTasksUpdated) {
        localProcessedTasks = currentProcessedTasks;
        await setInStorage(browser.storage.local, LOCAL_STORAGE_KEYS.PROCESSED_TASKS, localProcessedTasks);
    }

    if (tasksToProcess.length > 0) {
        console.log(`Processing ${tasksToProcess.length} new tasks...`);
        // Use cached groupState if available, fetch otherwise
        const cachedGroupState = await getFromStorage(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, {});
        let processedTasksUpdateBatch = {};

        for (const { groupName, taskId, task, myBit } of tasksToProcess) {
            console.log(`Processing task ${taskId} for group ${groupName}: ${task.url}`);
            try {
                await browser.tabs.create({ url: task.url, active: false });
            } catch (error) {
                console.error(`Failed to open tab for task ${taskId}:`, error);
                continue;
            }

            processedTasksUpdateBatch[taskId] = true;
            const newProcessedMask = task.processedMask | myBit;
            const taskUpdate = { [groupName]: { [taskId]: { processedMask: newProcessedMask } } };
            const mergeSuccess = await mergeSyncStorage(SYNC_STORAGE_KEYS.GROUP_TASKS, taskUpdate);

            if (mergeSuccess) {
                const currentGroupState = cachedGroupState[groupName];
                if (currentGroupState && newProcessedMask === currentGroupState.assignedMask) {
                    console.log(`Task ${taskId} fully processed by all assigned devices in group ${groupName}. Cleaning up.`);
                    const cleanupUpdate = { [groupName]: { [taskId]: null } };
                    await mergeSyncStorage(SYNC_STORAGE_KEYS.GROUP_TASKS, cleanupUpdate);
                    delete processedTasksUpdateBatch[taskId];
                }
            } else {
                 console.error(`Failed to merge task update for ${taskId}. It might be processed again.`);
            }
        }

        if (Object.keys(processedTasksUpdateBatch).length > 0) {
            localProcessedTasks = { ...localProcessedTasks, ...processedTasksUpdateBatch };
            await setInStorage(browser.storage.local, LOCAL_STORAGE_KEYS.PROCESSED_TASKS, localProcessedTasks);
        }
    } else {
        console.log("No new tasks require processing.");
    }
}


// --- Message Handling (Uses Caches for getState) ---

browser.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    console.log("Message received:", request.action, "Data:", request);

    // Always fetch latest state from storage
    let localInstanceId = await getInstanceId();
    let localInstanceName = await getInstanceName();
    let localSubscriptions = await getFromStorage(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []);
    let localGroupBits = await getFromStorage(browser.storage.local, LOCAL_STORAGE_KEYS.GROUP_BITS, {});
    let localProcessedTasks = await getFromStorage(browser.storage.local, LOCAL_STORAGE_KEYS.PROCESSED_TASKS, []);
    let cachedDefinedGroups = await getFromStorage(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS, []);
    let cachedGroupState = await getFromStorage(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, {});
    let cachedDeviceRegistry = await getFromStorage(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {});

    switch (request.action) {
        case "getState":
            // Return cached data primarily
            // Fetch fresh only if cache is null (should only happen if init failed)
            const groups = cachedDefinedGroups ?? await getFromStorage(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS, []);
            const state = cachedGroupState ?? await getFromStorage(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, {});
            const registry = cachedDeviceRegistry ?? await getFromStorage(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {});

            return {
                instanceId: localInstanceId,
                instanceName: localInstanceName,
                subscriptions: localSubscriptions,
                groupBits: localGroupBits,
                definedGroups: groups,
                groupState: state,
                deviceRegistry: registry
            };

        case "setInstanceName":
            // ... (logic remains the same, performHeartbeat updates cache) ...
            if (!request.name || typeof request.name !== 'string' || request.name.trim().length === 0) {
                return { success: false, message: "Invalid name provided." };
            }
            localInstanceName = request.name.trim();
            await browser.storage.local.set({ [LOCAL_STORAGE_KEYS.INSTANCE_NAME]: localInstanceName });
            await performHeartbeat(localInstanceId, localInstanceName, localGroupBits, cachedDeviceRegistry); // Updates registry and potentially cache
            return { success: true, newName: localInstanceName }; // Return new name for UI update

        case "createGroup": {
            if (!request.groupName || typeof request.groupName !== 'string' || request.groupName.trim().length === 0) {
                return { success: false, message: "Invalid group name provided." };
            }
            return await createGroupDirect(request.groupName.trim());
        }
        case "deleteGroup": {
            if (!request.groupName) return { success: false, message: "No group name provided." };
            return await deleteGroupDirect(request.groupName);
        }
        case "renameGroup": {
            const { oldName, newName } = request;
            if (!oldName || !newName || typeof newName !== 'string' || newName.trim().length === 0) {
                return { success: false, message: "Invalid group name." };
            }
            return await renameGroupDirect(oldName, newName);
        }
        case "renameDevice": {
            const { deviceId, newName } = request;
            if (!deviceId || !newName || typeof newName !== 'string' || newName.trim().length === 0) {
                return { success: false, message: "Invalid device or name." };
            }
            return await renameDeviceDirect(deviceId, newName);
        }
        case "deleteDevice": {
            const { deviceId } = request;
            if (!deviceId) return { success: false, message: "No device ID provided." };
            return await deleteDeviceDirect(deviceId);
        }
        case "subscribeToGroup":
            // ... (logic remains the same, performHeartbeat updates cache) ...
            const groupToSubscribe = request.groupName;
             if (!groupToSubscribe) return { success: false, message: "No group name provided." };
            if (!localSubscriptions.includes(groupToSubscribe)) {
                const assignedBit = await assignBitForGroup(groupToSubscribe, localInstanceId, localGroupBits, cachedGroupState, cachedDeviceRegistry); // This updates registry/state
                if (assignedBit !== null) {
                    localSubscriptions.push(groupToSubscribe);
                    localSubscriptions.sort();
                    localGroupBits[groupToSubscribe] = assignedBit;
                    await browser.storage.local.set({ [LOCAL_STORAGE_KEYS.SUBSCRIPTIONS]: localSubscriptions });
                    await browser.storage.local.set({ [LOCAL_STORAGE_KEYS.GROUP_BITS]: localGroupBits });
                    await performHeartbeat(localInstanceId, localInstanceName, localGroupBits, cachedDeviceRegistry); // Ensure full localGroupBits map is synced
                    return { success: true, subscribedGroup: groupToSubscribe, assignedBit: assignedBit }; // Return info for UI update
                } else {
                    return { success: false, message: "Group is full or error assigning bit." };
                }
            }
            return { success: false, message: "Already subscribed." };

        case "unsubscribeFromGroup":
            // ... (logic remains the same, storage listener updates cache) ...
            const groupToUnsubscribe = request.groupName;
             if (!groupToUnsubscribe) return { success: false, message: "No group name provided." };
            if (localSubscriptions.includes(groupToUnsubscribe)) {
                try {
                    const removedBit = localGroupBits[groupToUnsubscribe];
                    localSubscriptions = localSubscriptions.filter(g => g !== groupToUnsubscribe);
                    delete localGroupBits[groupToUnsubscribe];
                    await browser.storage.local.set({ [LOCAL_STORAGE_KEYS.SUBSCRIPTIONS]: localSubscriptions });
                    await browser.storage.local.set({ [LOCAL_STORAGE_KEYS.GROUP_BITS]: localGroupBits });
                    console.log(`Locally unsubscribed from ${groupToUnsubscribe}.`);

                    if (removedBit !== undefined) {
                        const registryUpdate = { [localInstanceId]: { groupBits: { [groupToUnsubscribe]: null } } };
                        await mergeSyncStorage(SYNC_STORAGE_KEYS.DEVICE_REGISTRY, registryUpdate);

                        // Use cache for read, fetch if needed
                        const groupState = cachedGroupState ?? await getFromStorage(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, {});
                        if (groupState[groupToUnsubscribe]) {
                            const currentMask = groupState[groupToUnsubscribe].assignedMask;
                            const newMask = currentMask & ~removedBit;
                            if (newMask !== currentMask) {
                                await mergeSyncStorage(SYNC_STORAGE_KEYS.GROUP_STATE, { [groupToUnsubscribe]: { assignedMask: newMask } });
                            }
                        } else {
                            console.warn(`Group state for ${groupToUnsubscribe} not found during unsubscribe mask update.`);
                        }
                    } else {
                        console.warn(`Could not find bit for group ${groupToUnsubscribe} during unsubscribe cleanup.`);
                    }
                    // Cache will be updated by storage listener
                    return { success: true, unsubscribedGroup: groupToUnsubscribe }; // Return info for UI update

                } catch (error) {
                    console.error(`Error unsubscribing from group ${groupToUnsubscribe}:`, error);
                    return { success: false, message: `Error unsubscribing: ${error.message}` };
                }
            } else {
                return { success: false, message: "Not subscribed." };
            }

        case "sendTabFromPopup": {
            const { groupName, tabData } = request;
            let localGroupBits = await getFromStorage(browser.storage.local, LOCAL_STORAGE_KEYS.GROUP_BITS, {});
            const senderBit = localGroupBits[groupName] || 0;
            return await createAndStoreGroupTask(groupName, tabData, senderBit);
        }

        case "heartbeat":
            // Manual heartbeat for popup open/send
            localInstanceId = await getInstanceId();
            localInstanceName = await getInstanceName();
            localGroupBits = await getFromStorage(browser.storage.local, LOCAL_STORAGE_KEYS.GROUP_BITS, {});
            cachedDeviceRegistry = await getFromStorage(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {});
            await performHeartbeat(localInstanceId, localInstanceName, localGroupBits, cachedDeviceRegistry);
            return { success: true };

        case "testNotification": {
            await browser.notifications.create({
                type: "basic",
                iconUrl: browser.runtime.getURL("icons/icon-48.png"),
                title: "TabTogether Test",
                message: "This is a test notification."
            });
            return { success: true };
        }
        case "setSyncInterval": {
            const minutes = Math.max(1, Math.min(120, parseInt(request.minutes, 10) || 5));
            await browser.alarms.clear('deviceHeartbeat');
            await browser.alarms.create('deviceHeartbeat', { periodInMinutes: minutes });
            sendResponse && sendResponse({ success: true });
            return true;
        }
        default:
            console.warn("Unknown action received:", request.action);
            return Promise.reject(new Error(`Unknown action: ${request.action}`));
    }
});

// Handle device removal from all groups and registry
browser.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
    if (msg.action === 'deleteDevice') {
        try {
            const deviceId = msg.deviceId;
            const deviceRegistry = await getFromStorage(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {});
            if (!deviceRegistry[deviceId]) return sendResponse({ success: false, message: 'Device not found.' });
            const groupBits = deviceRegistry[deviceId].groupBits || {};
            delete deviceRegistry[deviceId];
            await setInStorage(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, deviceRegistry);
            // Remove device's bit from all groupState.assignedMask
            const groupState = await getFromStorage(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, {});
            let groupStateChanged = false;
            for (const groupName in groupBits) {
                const bit = groupBits[groupName];
                if (groupState[groupName] && bit !== undefined) {
                    const currentMask = groupState[groupName].assignedMask;
                    const newMask = currentMask & ~bit;
                    if (newMask !== currentMask) {
                        groupState[groupName].assignedMask = newMask;
                        groupStateChanged = true;
                    }
                }
            }
            if (groupStateChanged) {
                await setInStorage(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, groupState);
            }
            // Remove local data if this is the current device
            const localId = await getFromStorage(browser.storage.local, LOCAL_STORAGE_KEYS.INSTANCE_ID);
            if (deviceId === localId) {
                await setInStorage(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []);
                await setInStorage(browser.storage.local, LOCAL_STORAGE_KEYS.GROUP_BITS, {});
            }
            sendResponse({ success: true });
        } catch (e) {
            sendResponse({ success: false, message: e.message });
        }
        return true;
    }
});

// --- Helper for Bit Assignment (Refactored for bit reuse, no assignedCount) ---
async function assignBitForGroup(groupName, localInstanceId, localGroupBits, cachedGroupState, cachedDeviceRegistry) {
    const MAX_RETRIES = 5;
    const BASE_DELAY_MS = 100;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const groupState = cachedGroupState ?? await getFromStorage(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, {});
            const currentGroupData = groupState[groupName];
            if (!currentGroupData) {
                console.error(`Group ${groupName} does not exist in groupState. Cannot assign bit.`);
                return null;
            }
            const currentAssignedMask = currentGroupData.assignedMask;
            const bitPosition = getNextAvailableBitPosition(currentAssignedMask);
            if (bitPosition === -1) {
                console.error(`Group ${groupName} is full (${MAX_DEVICES_PER_GROUP} devices). Cannot assign bit.`);
                return null;
            }
            const myBit = 1 << bitPosition;
            // Optimistic Lock Check (fetch fresh state for check)
            const checkGroupState = await getFromStorage(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, {});
            const checkGroupData = checkGroupState[groupName];
            if (!checkGroupData) {
                console.warn(`Group state for ${groupName} missing during bit assignment. Retrying...`);
                const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * BASE_DELAY_MS;
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            // If the bit is now taken, retry
            if (((checkGroupData.assignedMask >> bitPosition) & 1) !== 0) {
                console.warn(`Race condition: bit ${bitPosition} for group ${groupName} is now taken. Retrying...`);
                const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * BASE_DELAY_MS;
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            // Proceed with update
            const newAssignedMask = currentAssignedMask | myBit;
            const update = { [groupName]: { assignedMask: newAssignedMask } };
            const success = await mergeSyncStorage(SYNC_STORAGE_KEYS.GROUP_STATE, update);
            if (success) {
                // Update registry immediately
                const registryUpdate = { [localInstanceId]: { groupBits: { [groupName]: myBit } } };
                await mergeSyncStorage(SYNC_STORAGE_KEYS.DEVICE_REGISTRY, registryUpdate);
                if (cachedGroupState) cachedGroupState = deepMerge(cachedGroupState, update);
                if (cachedDeviceRegistry) cachedDeviceRegistry = deepMerge(cachedDeviceRegistry, registryUpdate);
                console.log(`Assigned bit ${myBit} (pos ${bitPosition}) to device ${localInstanceId} for group ${groupName}`);
                return myBit;
            } else {
                console.error(`Failed to merge group state for ${groupName} during bit assignment. Retrying...`);
                await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
                continue;
            }
        } catch (error) {
            console.error(`Error during bit assignment attempt ${attempt + 1} for ${groupName}:`, error);
            if (attempt < MAX_RETRIES - 1) {
                const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * BASE_DELAY_MS;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    console.error(`Failed to assign bit for ${groupName} after ${MAX_RETRIES} retries.`);
    return null;
}

// Utility: Play notification sound
async function playNotificationSound(sound) {
    if (sound === 'none') return;
    let url = '';
    if (sound === 'chime') url = 'https://cdn.jsdelivr.net/gh/ophilar/TabTogether-assets/chime.mp3';
    if (sound === 'ding') url = 'https://cdn.jsdelivr.net/gh/ophilar/TabTogether-assets/ding.mp3';
    if (sound === 'default') url = '';
    if (url) {
        const audio = new Audio(url);
        audio.volume = 0.7;
        audio.play();
    }
}

// Enhanced notification for tab send/receive
async function showTabNotification({ title, url, groupName, faviconUrl }) {
    const sound = await getFromStorage(browser.storage.local, 'notifSound', 'default');
    const duration = await getFromStorage(browser.storage.local, 'notifDuration', 5);
    await playNotificationSound(sound);
    const notifId = await browser.notifications.create({
        type: 'basic',
        iconUrl: faviconUrl || browser.runtime.getURL('icons/icon-48.png'),
        title: `TabTogether: ${groupName ? 'Group ' + groupName : 'Tab Received'}`,
        message: title || url || 'Tab received',
        contextMessage: url || '',
        requireInteraction: false
    });
    if (duration > 0) {
        setTimeout(() => browser.notifications.clear(notifId), duration * 1000);
    }
}

// Example usage: showTabNotification({ title, url, groupName, faviconUrl }) when sending/receiving tabs
