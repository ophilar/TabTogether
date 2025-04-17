// background.js

// Import necessary functions from utils.js (assuming utils.js is loaded via manifest)
// If using Modules (MV3): import { SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS, MAX_DEVICES_PER_GROUP, getStorage, mergeSyncStorage, getInstanceId, getInstanceName } from './utils.js';

const ALARM_HEARTBEAT = 'deviceHeartbeat';
const ALARM_STALE_CHECK = 'staleDeviceCheck';
const ALARM_TASK_CLEANUP = 'taskCleanup';

const HEARTBEAT_INTERVAL_MIN = 60 * 6; // Every 6 hours
const STALE_CHECK_INTERVAL_MIN = 60 * 24; // Every day
const TASK_CLEANUP_INTERVAL_MIN = 60 * 24 * 2; // Every 2 days

const STALE_DEVICE_THRESHOLD_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const TASK_EXPIRY_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

// --- Local State & Caches ---
let localInstanceId = null;
let localInstanceName = null;
let localSubscriptions = [];
let localGroupBits = {};
let localProcessedTasks = {};

// Caches for sync data to reduce reads in getState
let cachedDefinedGroups = null;
let cachedGroupState = null;
let cachedDeviceRegistry = null;
let isInitialized = false; // Flag to track initialization completion

// --- Initialization ---

async function initializeExtension() {
    try {
        console.log("Initializing TabTogether (Advanced)...");
        isInitialized = false; // Mark as not initialized until done

        // Fetch local data first
        localInstanceId = await getInstanceId();
        localInstanceName = await getInstanceName();
        localSubscriptions = await getStorage(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []);
        localGroupBits = await getStorage(browser.storage.local, LOCAL_STORAGE_KEYS.GROUP_BITS, {});
        localProcessedTasks = await getStorage(browser.storage.local, LOCAL_STORAGE_KEYS.PROCESSED_TASKS, {});

        // Fetch and cache sync data
        try {
            [cachedDefinedGroups, cachedGroupState, cachedDeviceRegistry] = await Promise.all([
                getStorage(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS, []),
                getStorage(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, {}),
                getStorage(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {})
            ]);
            console.log("Initial sync data cached.");
        } catch (error) {
            console.error("Failed to fetch initial sync data for caching:", error);
            // Proceed without cache, it will be populated by storage listener or next getState call
            cachedDefinedGroups = [];
            cachedGroupState = {};
            cachedDeviceRegistry = {};
        }


        await setupAlarms();
        await updateContextMenu(); // Use cachedDefinedGroups if available
        await performHeartbeat(); // Perform initial heartbeat/registry update
        console.log(`Initialization complete. Name: ${localInstanceName}`);
    } catch (error) {
        console.error("CRITICAL ERROR during initializeExtension:", error);
    }

    isInitialized = true; // Mark initialization complete
    console.log(`Initialization complete. ID: ${localInstanceId}, Name: ${localInstanceName}`);
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
    // Ensure initialization is complete before running alarms
    if (!isInitialized) {
        console.warn(`Alarm ${alarm.name} triggered before initialization complete. Skipping.`);
        return;
    }
    console.log(`Alarm triggered: ${alarm.name}`);
    switch (alarm.name) {
        case ALARM_HEARTBEAT:
            await performHeartbeat();
            break;
        case ALARM_STALE_CHECK:
            await performStaleDeviceCheck();
            break;
        case ALARM_TASK_CLEANUP:
            await performTimeBasedTaskCleanup();
            break;
    }
});

// --- Core Logic Functions ---

async function performHeartbeat() {
    if (!localInstanceId) {
        console.warn("Heartbeat skipped: Instance ID not available yet.");
        return;
    }
    console.log("Performing heartbeat...");
    const update = {
        [localInstanceId]: {
            name: localInstanceName, // Update name if changed locally
            lastSeen: Date.now(),
            groupBits: localGroupBits // Ensure registry reflects current local subscriptions/bits
        }
    };
    // Update sync storage
    const success = await mergeSyncStorage(SYNC_STORAGE_KEYS.DEVICE_REGISTRY, update);
    // Update local cache on success
    if (success && cachedDeviceRegistry) {
         cachedDeviceRegistry = deepMerge(cachedDeviceRegistry, update); // Keep cache consistent
    }
    console.log("Heartbeat complete.");
}

async function performStaleDeviceCheck() {
    console.log("Performing stale device check...");
    // Use cache first, fetch if needed (should be populated after init)
    let registry = cachedDeviceRegistry ?? await getStorage(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {});
    let groupState = cachedGroupState ?? await getStorage(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, {});

    const now = Date.now();
    let registryUpdates = {};
    let groupStateUpdates = {};
    let needsRegistryUpdate = false;
    let needsGroupStateUpdate = false;

    for (const deviceId in registry) {
        if (now - registry[deviceId].lastSeen > STALE_DEVICE_THRESHOLD_MS) {
            console.log(`Device ${deviceId} (${registry[deviceId].name}) is stale. Pruning...`);
            needsRegistryUpdate = true;
            registryUpdates[deviceId] = null; // Mark for deletion via merge

            const staleDeviceBits = registry[deviceId].groupBits || {};
            for (const groupName in staleDeviceBits) {
                const staleBit = staleDeviceBits[groupName];
                if (groupState[groupName] && staleBit !== undefined) {
                    const currentAssignedMask = groupState[groupName].assignedMask;
                    const newAssignedMask = currentAssignedMask & ~staleBit; // Remove the bit

                    if (newAssignedMask !== currentAssignedMask) {
                        if (!groupStateUpdates[groupName]) groupStateUpdates[groupName] = {};
                        groupStateUpdates[groupName].assignedMask = newAssignedMask;
                        needsGroupStateUpdate = true;
                        console.log(`Updated assignedMask for group ${groupName} (removed bit for stale device ${deviceId})`);
                    }
                }
            }
        }
    }

    let registryMergeSuccess = true;
    let groupStateMergeSuccess = true;

    if (needsRegistryUpdate) {
        registryMergeSuccess = await mergeSyncStorage(SYNC_STORAGE_KEYS.DEVICE_REGISTRY, registryUpdates);
        if (registryMergeSuccess && cachedDeviceRegistry) {
            cachedDeviceRegistry = deepMerge(cachedDeviceRegistry, registryUpdates); // Update cache
        }
    }
    if (needsGroupStateUpdate) {
        groupStateMergeSuccess = await mergeSyncStorage(SYNC_STORAGE_KEYS.GROUP_STATE, groupStateUpdates);
         if (groupStateMergeSuccess && cachedGroupState) {
            cachedGroupState = deepMerge(cachedGroupState, groupStateUpdates); // Update cache
        }
    }
    console.log("Stale device check complete.");
}

async function performTimeBasedTaskCleanup() {
    console.log("Performing time-based task cleanup...");
    const allGroupTasks = await getStorage(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_TASKS, {}); // Fetch fresh tasks
    let groupTasksUpdates = {};
    let needsUpdate = false;
    const now = Date.now();
    let processedTasksUpdates = { ...localProcessedTasks }; // Copy local state to modify

    for (const groupName in allGroupTasks) {
        for (const taskId in allGroupTasks[groupName]) {
            const task = allGroupTasks[groupName][taskId];
            if (now - task.creationTimestamp > TASK_EXPIRY_MS) {
                console.log(`Task ${taskId} in group ${groupName} expired. Deleting.`);
                if (!groupTasksUpdates[groupName]) groupTasksUpdates[groupName] = {};
                groupTasksUpdates[groupName][taskId] = null; // Mark for deletion via merge
                needsUpdate = true;

                // Also clean up local processed task ID
                if (processedTasksUpdates[taskId]) {
                    delete processedTasksUpdates[taskId];
                }
            }
        }
    }

    if (needsUpdate) {
        await mergeSyncStorage(SYNC_STORAGE_KEYS.GROUP_TASKS, groupTasksUpdates);
        // Update local storage only once after the loop if changes were made
        if (Object.keys(processedTasksUpdates).length !== Object.keys(localProcessedTasks).length) {
             localProcessedTasks = processedTasksUpdates; // Update in-memory cache
             await browser.storage.local.set({ [LOCAL_STORAGE_KEYS.PROCESSED_TASKS]: localProcessedTasks });
        }
    }
    console.log("Time-based task cleanup complete.");
}

// --- Context Menu ---

async function updateContextMenu() {
    await browser.contextMenus.removeAll();
    // Use cache if available, otherwise fetch
    const groups = cachedDefinedGroups ?? await getStorage(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS, []);
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

    if (!urlToSend || urlToSend === "about:blank") { // Added check for about:blank
        console.error("Could not determine a valid URL to send from context:", info, "Tab:", tab);
        browser.notifications.create({ type: "basic", iconUrl: browser.runtime.getURL("icons/icon-48.png"), title: "Send Failed", message: "Cannot send this type of link/page." });
        return;
    }

    const newTask = { [taskId]: { url: urlToSend, title: titleToSend, processedMask: 0, creationTimestamp: Date.now() } };
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
        cachedDefinedGroups = changes[SYNC_STORAGE_KEYS.DEFINED_GROUPS].newValue ?? [];
        console.log("Cache updated: definedGroups");
        contextMenuNeedsUpdate = true; // Groups changed, update menu
    }
    if (changes[SYNC_STORAGE_KEYS.GROUP_STATE]) {
        cachedGroupState = changes[SYNC_STORAGE_KEYS.GROUP_STATE].newValue ?? {};
        console.log("Cache updated: groupState");
    }
    if (changes[SYNC_STORAGE_KEYS.DEVICE_REGISTRY]) {
        cachedDeviceRegistry = changes[SYNC_STORAGE_KEYS.DEVICE_REGISTRY].newValue ?? {};
        console.log("Cache updated: deviceRegistry");
    }

    // Trigger actions based on changes
    if (contextMenuNeedsUpdate) {
        await updateContextMenu();
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
                    if (!((task.processedMask >> bitPosition) & 1)) {
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
        await browser.storage.local.set({ [LOCAL_STORAGE_KEYS.PROCESSED_TASKS]: localProcessedTasks });
    }

    if (tasksToProcess.length > 0) {
        console.log(`Processing ${tasksToProcess.length} new tasks...`);
        // Use cached groupState if available, fetch otherwise
        const groupState = cachedGroupState ?? await getStorage(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, {});
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
                const currentGroupState = groupState[groupName];
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
            await browser.storage.local.set({ [LOCAL_STORAGE_KEYS.PROCESSED_TASKS]: localProcessedTasks });
        }
    } else {
        console.log("No new tasks require processing.");
    }
}


// --- Message Handling (Uses Caches for getState) ---

browser.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    console.log("Message received:", request.action, "Data:", request);

    // Ensure initialization is complete before handling UI messages
    if (!isInitialized && request.action !== 'getState') { // Allow getState even before full init? Maybe risky.
         console.warn(`Message ${request.action} received before initialization complete. Rejecting.`);
         return { success: false, message: "Extension is still initializing. Please try again shortly." };
    }

    switch (request.action) {
        case "getState":
            // Return cached data primarily
            // Fetch fresh only if cache is null (should only happen if init failed)
            const groups = cachedDefinedGroups ?? await getStorage(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS, []);
            const state = cachedGroupState ?? await getStorage(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, {});
            const registry = cachedDeviceRegistry ?? await getStorage(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {});

            // Update caches if they were null and we just fetched them
            if (cachedDefinedGroups === null) cachedDefinedGroups = groups;
            if (cachedGroupState === null) cachedGroupState = state;
            if (cachedDeviceRegistry === null) cachedDeviceRegistry = registry;

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
            await performHeartbeat(); // Updates registry and potentially cache
            return { success: true, newName: localInstanceName }; // Return new name for UI update

        case "createGroup":
            // ... (logic remains the same, storage listener updates cache) ...
             if (!request.groupName || typeof request.groupName !== 'string' || request.groupName.trim().length === 0) {
                return { success: false, message: "Invalid group name provided." };
            }
            const groupNameToCreate = request.groupName.trim();
            // Use cache for check, fetch for update
            const currentGroups = cachedDefinedGroups ?? await getStorage(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS, []);
            if (!currentGroups.includes(groupNameToCreate)) {
                const updatedGroups = [...currentGroups, groupNameToCreate].sort();
                await browser.storage.sync.set({ [SYNC_STORAGE_KEYS.DEFINED_GROUPS]: updatedGroups });
                await mergeSyncStorage(SYNC_STORAGE_KEYS.GROUP_STATE, { [groupNameToCreate]: { assignedMask: 0, assignedCount: 0 } });
                // Cache will be updated by storage listener
                return { success: true, newGroup: groupNameToCreate }; // Return new group for UI update
            }
            return { success: false, message: "Group already exists." };

        case "deleteGroup":
            // ... (logic remains the same, storage listener updates cache) ...
            const groupNameToDelete = request.groupName;
            if (!groupNameToDelete) return { success: false, message: "No group name provided." };
            console.log(`Attempting to delete group: ${groupNameToDelete}`);
            try {
                // Use cache for check, fetch for update
                const currentGroups = cachedDefinedGroups ?? await getStorage(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS, []);
                const updatedGroups = currentGroups.filter(g => g !== groupNameToDelete);
                if (updatedGroups.length !== currentGroups.length) {
                    await browser.storage.sync.set({ [SYNC_STORAGE_KEYS.DEFINED_GROUPS]: updatedGroups });
                }
                await mergeSyncStorage(SYNC_STORAGE_KEYS.GROUP_STATE, { [groupNameToDelete]: null });
                await mergeSyncStorage(SYNC_STORAGE_KEYS.GROUP_TASKS, { [groupNameToDelete]: null });

                const registry = cachedDeviceRegistry ?? await getStorage(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {});
                const registryUpdates = {};
                let needsRegistryUpdate = false;
                for (const deviceId in registry) {
                    if (registry[deviceId]?.groupBits?.[groupNameToDelete] !== undefined) {
                        if (!registryUpdates[deviceId]) registryUpdates[deviceId] = { groupBits: {} };
                        registryUpdates[deviceId].groupBits[groupNameToDelete] = null;
                        needsRegistryUpdate = true;
                    }
                }
                if (needsRegistryUpdate) {
                    await mergeSyncStorage(SYNC_STORAGE_KEYS.DEVICE_REGISTRY, registryUpdates);
                }

                let localStateChanged = false;
                if (localSubscriptions.includes(groupNameToDelete)) {
                    localSubscriptions = localSubscriptions.filter(g => g !== groupNameToDelete);
                    await browser.storage.local.set({ [LOCAL_STORAGE_KEYS.SUBSCRIPTIONS]: localSubscriptions });
                    localStateChanged = true;
                }
                if (localGroupBits[groupNameToDelete] !== undefined) {
                    delete localGroupBits[groupNameToDelete];
                    await browser.storage.local.set({ [LOCAL_STORAGE_KEYS.GROUP_BITS]: localGroupBits });
                     localStateChanged = true;
                }
                if(localStateChanged) console.log(`Cleaned up local state for ${groupNameToDelete}.`);

                // Cache will be updated by storage listener, but update context menu now
                await updateContextMenu();
                return { success: true, deletedGroup: groupNameToDelete }; // Return deleted group for UI update

            } catch (error) {
                console.error(`Error deleting group ${groupNameToDelete}:`, error);
                return { success: false, message: `Error deleting group: ${error.message}` };
            }

        case "subscribeToGroup":
            // ... (logic remains the same, performHeartbeat updates cache) ...
            const groupToSubscribe = request.groupName;
             if (!groupToSubscribe) return { success: false, message: "No group name provided." };
            if (!localSubscriptions.includes(groupToSubscribe)) {
                const assignedBit = await assignBitForGroup(groupToSubscribe); // This updates registry/state
                if (assignedBit !== null) {
                    localSubscriptions.push(groupToSubscribe);
                    localSubscriptions.sort();
                    localGroupBits[groupToSubscribe] = assignedBit;
                    await browser.storage.local.set({ [LOCAL_STORAGE_KEYS.SUBSCRIPTIONS]: localSubscriptions });
                    await browser.storage.local.set({ [LOCAL_STORAGE_KEYS.GROUP_BITS]: localGroupBits });
                    await performHeartbeat(); // Ensure full localGroupBits map is synced
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
                        const groupState = cachedGroupState ?? await getStorage(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, {});
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

        case "sendTabFromPopup":
            const { groupName, tabData } = request;
            const taskId = crypto.randomUUID();
            const newTask = {
                [taskId]: {
                    url: tabData.url,
                    title: tabData.title || tabData.url,
                    processedMask: 0,
                    creationTimestamp: Date.now()
                }
            };
            const update = { [groupName]: newTask };
            console.log(`Sending task ${taskId} from popup to group ${groupName}: ${tabData.url}`);
            const success = await mergeSyncStorage(SYNC_STORAGE_KEYS.GROUP_TASKS, update);
            if (success) {
                // Optional: Send notification as well?
                // browser.notifications.create(...)
                return { success: true };
            } else {
                return { success: false, message: "Failed to save task to sync storage." };
            }

        default:
            console.warn("Unknown action received:", request.action);
            return Promise.reject(new Error(`Unknown action: ${request.action}`));
    }
});


// --- Helper for Bit Assignment (Remains the same) ---
async function assignBitForGroup(groupName) {
    // ... (assignBitForGroup logic remains the same as the previous version) ...
    // It already uses mergeSyncStorage which handles sync updates.
    // It updates registry immediately after state update.
    const MAX_RETRIES = 5;
    const BASE_DELAY_MS = 100;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            // Use cache for read, fetch if needed
            const groupState = cachedGroupState ?? await getStorage(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, {});
            const currentGroupData = groupState[groupName];

            if (!currentGroupData) {
                 console.error(`Group ${groupName} does not exist in groupState. Cannot assign bit.`);
                 return null;
            }

            const currentAssignedMask = currentGroupData.assignedMask;
            const currentAssignedCount = currentGroupData.assignedCount;

            if (currentAssignedCount >= MAX_DEVICES_PER_GROUP) {
                console.error(`Group ${groupName} is full (${MAX_DEVICES_PER_GROUP} devices). Cannot assign bit.`);
                return null;
            }

            const bitPosition = currentAssignedCount;
            const myBit = 1 << bitPosition;

            // Optimistic Lock Check (fetch fresh state for check)
            const checkGroupState = await getStorage(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, {});
            const checkGroupData = checkGroupState[groupName];

            if (!checkGroupData || checkGroupData.assignedCount !== currentAssignedCount) {
                console.warn(`Race condition or group state change detected for ${groupName}. Retrying (${attempt + 1}/${MAX_RETRIES})...`);
                const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * BASE_DELAY_MS;
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }

            // Proceed with update
            const newAssignedMask = currentAssignedMask | myBit;
            const newAssignedCount = currentAssignedCount + 1;
            const update = { [groupName]: { assignedMask: newAssignedMask, assignedCount: newAssignedCount } };
            const success = await mergeSyncStorage(SYNC_STORAGE_KEYS.GROUP_STATE, update);

            if (success) {
                // Update registry immediately
                const registryUpdate = { [localInstanceId]: { groupBits: { [groupName]: myBit } } };
                await mergeSyncStorage(SYNC_STORAGE_KEYS.DEVICE_REGISTRY, registryUpdate);
                // Update caches immediately after successful sync operations
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

// --- Utility (needed if not imported from utils.js) ---
function isObject(item) {
    return (item && typeof item === 'object' && !Array.isArray(item));
}

function deepMerge(target, source) {
    const output = { ...target };
    if (isObject(target) && isObject(source)) {
        Object.keys(source).forEach(key => {
            if (source[key] === null) {
                 delete output[key];
            } else if (isObject(source[key])) {
                if (!(key in target) || !isObject(target[key])) {
                    output[key] = source[key];
                } else {
                     output[key] = deepMerge(target[key], source[key]);
                }
            } else {
                output[key] = source[key];
            }
        });
    }
    return output;
}
