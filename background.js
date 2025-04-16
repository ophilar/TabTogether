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

let localInstanceId = null;
let localInstanceName = null;
let localSubscriptions = [];
let localGroupBits = {};
let localProcessedTasks = {};

// --- Initialization ---

async function initializeExtension() {
    console.log("Initializing Tab Group Sender (Advanced)...");
    localInstanceId = await getInstanceId();
    localInstanceName = await getInstanceName();
    localSubscriptions = await getStorage(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []);
    localGroupBits = await getStorage(browser.storage.local, LOCAL_STORAGE_KEYS.GROUP_BITS, {});
    localProcessedTasks = await getStorage(browser.storage.local, LOCAL_STORAGE_KEYS.PROCESSED_TASKS, {});

    await setupAlarms();
    await updateContextMenu();
    await performHeartbeat(); // Perform initial heartbeat/registry update
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
    await mergeSyncStorage(SYNC_STORAGE_KEYS.DEVICE_REGISTRY, update);
    console.log("Heartbeat complete."); // Added log for completion
}

async function performStaleDeviceCheck() {
    console.log("Performing stale device check...");
    const registry = await getStorage(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {});
    const groupState = await getStorage(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, {});
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
                        // Note: We don't decrement assignedCount here, as bits aren't reused easily with current strategy
                        needsGroupStateUpdate = true;
                        console.log(`Updated assignedMask for group ${groupName} (removed bit for stale device ${deviceId})`);
                    }
                }
            }
        }
    }

    if (needsRegistryUpdate) {
        await mergeSyncStorage(SYNC_STORAGE_KEYS.DEVICE_REGISTRY, registryUpdates);
    }
    if (needsGroupStateUpdate) {
        await mergeSyncStorage(SYNC_STORAGE_KEYS.GROUP_STATE, groupStateUpdates);
    }
    console.log("Stale device check complete.");
}

async function performTimeBasedTaskCleanup() {
    console.log("Performing time-based task cleanup...");
    const allGroupTasks = await getStorage(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_TASKS, {});
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
    const definedGroups = await getStorage(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS, []);

    if (definedGroups.length === 0) {
        browser.contextMenus.create({
            id: "no-groups", title: "No groups defined", contexts: ["page", "link", "image", "video", "audio", "selection"], enabled: false
        });
        return;
    }

    // Create the main parent item
    browser.contextMenus.create({
        id: "send-to-group-parent",
        title: "Send Tab to Group", // The main menu item text
        // Define where this menu item should appear
        contexts: ["page", "link", "image", "video", "audio", "selection"]
    });

    // Create a sub-menu item for each defined group
    definedGroups.sort().forEach(groupName => {
        browser.contextMenus.create({
            id: `send-to-${groupName}`, // Unique ID based on group name
            parentId: "send-to-group-parent", // Make it a child of the main item
            title: groupName, // Display the group name
            contexts: ["page", "link", "image", "video", "audio", "selection"] // Appear in the same contexts
        });
    });
}

browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!info.menuItemId.startsWith("send-to-") || info.menuItemId === "send-to-group-parent") return;

    const groupName = info.menuItemId.replace("send-to-", "");

    // Determine the URL to send based on the context
    const urlToSend = info.linkUrl || info.srcUrl || info.pageUrl || tab?.url; // Added optional chaining for tab

    // Determine a title (use link text, selected text, or fallback to tab title/URL)
    const titleToSend = info.selectionText || info.linkText || tab?.title || "Link"; // Added optional chaining for tab

    const taskId = crypto.randomUUID(); // Generate a unique ID for this task


    if (!urlToSend) {
        console.error("Could not determine URL to send from context:", info);
        browser.notifications.create({ type: "basic", iconUrl: browser.runtime.getURL("icons/icon-48.png"), title: "Send Failed", message: "Could not determine URL." });
        return;
    }

    const newTask = {
        [taskId]: {
            url: urlToSend,
            title: titleToSend,
            processedMask: 0,
            creationTimestamp: Date.now()
        }
    };

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

// --- Storage Change Listener ---

browser.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName !== 'sync') return; // We only care about sync changes here

    // Update context menu if groups change
    if (changes[SYNC_STORAGE_KEYS.DEFINED_GROUPS]) {
        console.log("Detected change in defined groups, updating context menu...");
        await updateContextMenu();
    }

    // Process incoming tasks
    if (changes[SYNC_STORAGE_KEYS.GROUP_TASKS]) {
        console.log("Detected change in group tasks, processing...");
        // Pass both old and new values for potential optimization later
        await processIncomingTasks(changes[SYNC_STORAGE_KEYS.GROUP_TASKS].newValue, changes[SYNC_STORAGE_KEYS.GROUP_TASKS].oldValue);
    }

    // Update local cache if registry changes (e.g., another device updates its name)
    // This is less critical but keeps the popup potentially more up-to-date
    // if (changes[SYNC_STORAGE_KEYS.DEVICE_REGISTRY]) {
    //     console.log("Detected change in device registry.");
    // }

    // Update local cache if group state changes (e.g., mask updated by another device)
    // if (changes[SYNC_STORAGE_KEYS.GROUP_STATE]) {
    //     console.log("Detected change in group state.");
    // }
});

// Added oldValue parameter (optional, for potential future optimization)
async function processIncomingTasks(allGroupTasks, oldGroupTasks = null) {
    if (!allGroupTasks) {
        console.log("Group tasks cleared, skipping processing.");
        return;
    }

    // Use local caches for efficiency
    const currentSubscriptions = localSubscriptions;
    const currentGroupBits = localGroupBits;
    let currentProcessedTasks = { ...localProcessedTasks }; // Work with a mutable copy

    let tasksToProcess = [];
    let localProcessedTasksUpdated = false; // Flag to track if local storage needs update

    for (const groupName in allGroupTasks) {
        // Check if this device is subscribed to the group
        if (currentSubscriptions.includes(groupName)) {
            const myBit = currentGroupBits[groupName];
            if (myBit === undefined) {
                console.warn(`Device subscribed to ${groupName} but has no assigned bit.`);
                continue; // Should not happen if subscription logic is correct
            }

            const bitPosition = Math.log2(myBit); // Calculate bit position once

            for (const taskId in allGroupTasks[groupName]) {
                // Check if already processed locally
                if (!currentProcessedTasks[taskId]) {
                    const task = allGroupTasks[groupName][taskId];
                    // Check if *this device's bit* is already set in the sync mask
                    if (!((task.processedMask >> bitPosition) & 1)) {
                        // Not processed locally and bit not set in sync mask -> process it
                        tasksToProcess.push({ groupName, taskId, task, myBit });
                    } else {
                        // Bit is already set in sync, but not locally processed?
                        // This means another instance processed it and the change synced back before this instance could.
                        // Mark as processed locally to prevent re-processing.
                        console.log(`Task ${taskId} already processed by this device according to sync mask. Marking locally.`);
                        currentProcessedTasks[taskId] = true;
                        localProcessedTasksUpdated = true;
                    }
                }
            }
        }
    }

    // Update local processed tasks storage if any were marked implicitly
    if (localProcessedTasksUpdated) {
        localProcessedTasks = currentProcessedTasks; // Update in-memory cache
        await browser.storage.local.set({ [LOCAL_STORAGE_KEYS.PROCESSED_TASKS]: localProcessedTasks });
    }

    if (tasksToProcess.length > 0) {
        console.log(`Processing ${tasksToProcess.length} new tasks...`);
        const groupState = await getStorage(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, {}); // Get latest group state for cleanup check

        let processedTasksUpdateBatch = {}; // Batch updates to local storage

        for (const { groupName, taskId, task, myBit } of tasksToProcess) {
            console.log(`Processing task ${taskId} for group ${groupName}: ${task.url}`);

            // 1. Open the tab
            try {
                await browser.tabs.create({ url: task.url, active: false }); // Open in background
            } catch (error) {
                console.error(`Failed to open tab for task ${taskId}:`, error);
                // Skip marking as processed if tab opening fails, allows retry on next change
                continue;
            }

            // 2. Mark as processed locally (prepare batch update)
            processedTasksUpdateBatch[taskId] = true;

            // 3. Update processedMask in sync storage
            const newProcessedMask = task.processedMask | myBit;
            const taskUpdate = {
                [groupName]: {
                    [taskId]: {
                        processedMask: newProcessedMask
                    }
                }
            };
            const mergeSuccess = await mergeSyncStorage(SYNC_STORAGE_KEYS.GROUP_TASKS, taskUpdate);

            // 4. Check for cleanup (if merge succeeded)
            if (mergeSuccess) {
                const currentGroupState = groupState[groupName];
                // Check if the group still exists and if the new mask matches the assigned mask
                if (currentGroupState && newProcessedMask === currentGroupState.assignedMask) {
                    console.log(`Task ${taskId} fully processed by all assigned devices in group ${groupName}. Cleaning up.`);
                    const cleanupUpdate = {
                        [groupName]: {
                            [taskId]: null // Mark for deletion
                        }
                    };
                    await mergeSyncStorage(SYNC_STORAGE_KEYS.GROUP_TASKS, cleanupUpdate);
                    // Clean up local processed ID as well (prepare batch update)
                    delete processedTasksUpdateBatch[taskId]; // Remove from batch if deleted
                }
            } else {
                 console.error(`Failed to merge task update for ${taskId}. It might be processed again.`);
                 // If merge fails, don't mark locally? Or mark locally anyway?
                 // Current: Mark locally anyway, but log error.
            }
        }

        // Apply batched local storage updates
        if (Object.keys(processedTasksUpdateBatch).length > 0) {
            localProcessedTasks = { ...localProcessedTasks, ...processedTasksUpdateBatch }; // Update in-memory cache
            await browser.storage.local.set({ [LOCAL_STORAGE_KEYS.PROCESSED_TASKS]: localProcessedTasks });
        }
    } else {
        console.log("No new tasks require processing.");
    }
}


// --- Message Handling (from UI Scripts) ---

browser.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    console.log("Message received:", request.action, "Data:", request); // Log action and data separately
    switch (request.action) {
        case "getState":
            // Fetch fresh sync data for UI, return local caches + sync data
            try {
                const [definedGroups, groupState, deviceRegistry] = await Promise.all([
                    getStorage(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS, []),
                    getStorage(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, {}),
                    getStorage(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {})
                ]);
                return {
                    instanceId: localInstanceId,
                    instanceName: localInstanceName,
                    subscriptions: localSubscriptions,
                    groupBits: localGroupBits,
                    definedGroups: definedGroups,
                    groupState: groupState,
                    deviceRegistry: deviceRegistry
                };
            } catch (error) {
                 console.error("Error fetching state for UI:", error);
                 // Return cached values as fallback? Or signal error?
                 return { error: `Failed to fetch sync state: ${error.message}` };
            }


        case "setInstanceName":
            if (!request.name || typeof request.name !== 'string' || request.name.trim().length === 0) {
                return { success: false, message: "Invalid name provided." };
            }
            localInstanceName = request.name.trim();
            await browser.storage.local.set({ [LOCAL_STORAGE_KEYS.INSTANCE_NAME]: localInstanceName });
            await performHeartbeat(); // Update registry with new name immediately
            return { success: true };

        case "createGroup":
             if (!request.groupName || typeof request.groupName !== 'string' || request.groupName.trim().length === 0) {
                return { success: false, message: "Invalid group name provided." };
            }
            const groupNameToCreate = request.groupName.trim();
            const groups = await getStorage(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS, []);
            if (!groups.includes(groupNameToCreate)) {
                groups.push(groupNameToCreate);
                groups.sort(); // Keep the list sorted
                await browser.storage.sync.set({ [SYNC_STORAGE_KEYS.DEFINED_GROUPS]: groups });
                // Initialize group state
                await mergeSyncStorage(SYNC_STORAGE_KEYS.GROUP_STATE, { [groupNameToCreate]: { assignedMask: 0, assignedCount: 0 } });
                // No need to call updateContextMenu here, storage listener will handle it
                return { success: true };
            }
            return { success: false, message: "Group already exists." };

        case "deleteGroup":
            const groupNameToDelete = request.groupName;
            if (!groupNameToDelete) return { success: false, message: "No group name provided." };

            console.log(`Attempting to delete group: ${groupNameToDelete}`);

            try {
                // 1. Remove from definedGroups (Sync)
                const currentGroups = await getStorage(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS, []);
                const updatedGroups = currentGroups.filter(g => g !== groupNameToDelete);
                // Only set if changed to avoid unnecessary storage events
                if (updatedGroups.length !== currentGroups.length) {
                    await browser.storage.sync.set({ [SYNC_STORAGE_KEYS.DEFINED_GROUPS]: updatedGroups });
                    console.log(`Removed ${groupNameToDelete} from definedGroups.`);
                }


                // 2. Remove from groupState (Sync)
                await mergeSyncStorage(SYNC_STORAGE_KEYS.GROUP_STATE, { [groupNameToDelete]: null });
                console.log(`Removed state for ${groupNameToDelete} from groupState.`);

                // 3. Remove from groupTasks (Sync)
                await mergeSyncStorage(SYNC_STORAGE_KEYS.GROUP_TASKS, { [groupNameToDelete]: null });
                console.log(`Removed tasks for ${groupNameToDelete} from groupTasks.`);

                // 4. Remove group bit from all devices in registry (Sync)
                const registry = await getStorage(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {});
                const registryUpdates = {};
                let needsRegistryUpdate = false;
                for (const deviceId in registry) {
                    if (registry[deviceId]?.groupBits?.[groupNameToDelete] !== undefined) {
                        if (!registryUpdates[deviceId]) {
                            registryUpdates[deviceId] = { groupBits: {} };
                        }
                        registryUpdates[deviceId].groupBits[groupNameToDelete] = null; // Mark for deletion via merge
                        needsRegistryUpdate = true;
                        console.log(`Marked group bit for ${groupNameToDelete} for deletion in registry for device ${deviceId}.`);
                    }
                }
                if (needsRegistryUpdate) {
                    await mergeSyncStorage(SYNC_STORAGE_KEYS.DEVICE_REGISTRY, registryUpdates);
                    console.log(`Applied registry updates to remove bits for deleted group ${groupNameToDelete}.`);
                } else {
                    console.log(`No devices found in registry with bits for group ${groupNameToDelete}.`);
                }


                // 5. Clean up local state for *this* device (Local)
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
                if(localStateChanged) {
                    console.log(`Cleaned up local subscription and bit for ${groupNameToDelete}.`);
                }

                // 6. Update context menu (storage listener might catch definedGroups change, but call explicitly for safety)
                await updateContextMenu();

                return { success: true };

            } catch (error) {
                console.error(`Error deleting group ${groupNameToDelete}:`, error);
                return { success: false, message: `Error deleting group: ${error.message}` };
            }

        case "subscribeToGroup":
            const groupToSubscribe = request.groupName;
             if (!groupToSubscribe) return { success: false, message: "No group name provided." };

            if (!localSubscriptions.includes(groupToSubscribe)) {
                // Assign bit before subscribing locally
                const assignedBit = await assignBitForGroup(groupToSubscribe);
                if (assignedBit !== null) {
                    localSubscriptions.push(groupToSubscribe);
                    localSubscriptions.sort(); // Keep sorted
                    localGroupBits[groupToSubscribe] = assignedBit;
                    await browser.storage.local.set({ [LOCAL_STORAGE_KEYS.SUBSCRIPTIONS]: localSubscriptions });
                    await browser.storage.local.set({ [LOCAL_STORAGE_KEYS.GROUP_BITS]: localGroupBits });
                    // Update registry immediately (heartbeat also does this, but be explicit)
                    await performHeartbeat();
                    return { success: true, assignedBit: assignedBit };
                } else {
                    return { success: false, message: "Group is full or error assigning bit." };
                }
            }
            return { success: false, message: "Already subscribed." };


        case "unsubscribeFromGroup":
            const groupToUnsubscribe = request.groupName;
             if (!groupToUnsubscribe) return { success: false, message: "No group name provided." };

            if (localSubscriptions.includes(groupToUnsubscribe)) {
                try {
                    // 1. Get the bit before modifying local state
                    const removedBit = localGroupBits[groupToUnsubscribe];

                    // 2. Update local state
                    localSubscriptions = localSubscriptions.filter(g => g !== groupToUnsubscribe);
                    delete localGroupBits[groupToUnsubscribe];

                    // 3. Save updated local state
                    await browser.storage.local.set({ [LOCAL_STORAGE_KEYS.SUBSCRIPTIONS]: localSubscriptions });
                    await browser.storage.local.set({ [LOCAL_STORAGE_KEYS.GROUP_BITS]: localGroupBits });
                    console.log(`Locally unsubscribed from ${groupToUnsubscribe}.`);

                    if (removedBit !== undefined) { // Ensure we had a bit to remove
                        // 4. Update device registry (Sync) - Remove this device's bit for the group
                        const registryUpdate = {
                            [localInstanceId]: {
                                groupBits: {
                                    [groupToUnsubscribe]: null // Mark for deletion via merge
                                }
                            }
                        };
                        await mergeSyncStorage(SYNC_STORAGE_KEYS.DEVICE_REGISTRY, registryUpdate);
                        console.log(`Removed bit for group ${groupToUnsubscribe} from device registry for ${localInstanceId}.`);

                        // 5. Update group state mask (Sync) - Remove this device's bit from the active mask
                        const groupState = await getStorage(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, {});
                        if (groupState[groupToUnsubscribe]) { // Check if group still exists in state
                            const currentMask = groupState[groupToUnsubscribe].assignedMask;
                            const newMask = currentMask & ~removedBit; // Bitwise AND with NOT removedBit
                            if (newMask !== currentMask) { // Only update if the mask actually changes
                                await mergeSyncStorage(SYNC_STORAGE_KEYS.GROUP_STATE, { [groupToUnsubscribe]: { assignedMask: newMask } });
                                console.log(`Updated assignedMask for group ${groupToUnsubscribe} to remove bit ${removedBit}.`);
                            }
                        } else {
                                console.warn(`Group state for ${groupToUnsubscribe} not found while trying to update mask during unsubscribe.`);
                        }
                    } else {
                        console.warn(`Could not find bit for group ${groupToUnsubscribe} during unsubscribe cleanup.`);
                    }

                    return { success: true };

                } catch (error) {
                    console.error(`Error unsubscribing from group ${groupToUnsubscribe}:`, error);
                    // Consider rolling back local changes if sync fails? Might be complex.
                    return { success: false, message: `Error unsubscribing: ${error.message}` };
                }
            } else {
                return { success: false, message: "Not subscribed." };
            }


        default:
            console.warn("Unknown action received:", request.action);
            // Explicitly return a promise rejection for unknown actions
            return Promise.reject(new Error(`Unknown action: ${request.action}`));
    }
});


// --- Helper for Bit Assignment (Handles Race Condition Check) ---
async function assignBitForGroup(groupName) {
    const MAX_RETRIES = 5;
    const BASE_DELAY_MS = 100; // Base delay for backoff

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const groupState = await getStorage(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, {});
            const currentGroupData = groupState[groupName]; // Don't default here, group must exist

            if (!currentGroupData) {
                 console.error(`Group ${groupName} does not exist in groupState. Cannot assign bit.`);
                 return null;
            }

            const currentAssignedMask = currentGroupData.assignedMask;
            const currentAssignedCount = currentGroupData.assignedCount;

            if (currentAssignedCount >= MAX_DEVICES_PER_GROUP) {
                console.error(`Group ${groupName} is full (${MAX_DEVICES_PER_GROUP} devices). Cannot assign bit.`);
                return null; // Group is full
            }

            // Find the actual next available position based on count (current strategy)
            const bitPosition = currentAssignedCount;
            const myBit = 1 << bitPosition;

            // --- Optimistic Lock Check ---
            // Read state again right before writing to check if count changed
            const checkGroupState = await getStorage(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, {});
            const checkGroupData = checkGroupState[groupName];

            // Check if group still exists and if count is unchanged
            if (!checkGroupData || checkGroupData.assignedCount !== currentAssignedCount) {
                console.warn(`Race condition or group state change detected for ${groupName}. Retrying (${attempt + 1}/${MAX_RETRIES})...`);
                // Exponential backoff with jitter
                const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * BASE_DELAY_MS;
                await new Promise(resolve => setTimeout(resolve, delay));
                continue; // Retry the loop
            }
            // --- End Optimistic Lock Check ---


            // No race detected, proceed with update
            const newAssignedMask = currentAssignedMask | myBit;
            const newAssignedCount = currentAssignedCount + 1;

            const update = {
                [groupName]: {
                    assignedMask: newAssignedMask,
                    assignedCount: newAssignedCount
                }
            };
            const success = await mergeSyncStorage(SYNC_STORAGE_KEYS.GROUP_STATE, update);

            if (success) {
                // Update registry with the assigned bit *immediately* after successful state update
                const registryUpdate = {
                    [localInstanceId]: {
                        groupBits: { [groupName]: myBit } // Merge only this bit
                    }
                };
                await mergeSyncStorage(SYNC_STORAGE_KEYS.DEVICE_REGISTRY, registryUpdate);
                console.log(`Assigned bit ${myBit} (pos ${bitPosition}) to device ${localInstanceId} for group ${groupName}`);
                return myBit; // Return the assigned bit value
            } else {
                console.error(`Failed to merge group state for ${groupName} during bit assignment. Retrying...`);
                 // Optional: Add delay before retrying after merge failure
                 await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
                 continue; // Retry loop on merge failure
            }

        } catch (error) {
            console.error(`Error during bit assignment attempt ${attempt + 1} for ${groupName}:`, error);
            // Optional: Add delay before retrying after general error
            if (attempt < MAX_RETRIES - 1) {
                 const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * BASE_DELAY_MS;
                 await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    console.error(`Failed to assign bit for ${groupName} after ${MAX_RETRIES} retries.`);
    return null; // Failed after all retries
}
