// utils.js

import { STRINGS } from "./constants.js";

export const SYNC_STORAGE_KEYS = {
  DEFINED_GROUPS: "definedGroups", // string[]
  GROUP_STATE: "groupState", // { [groupName: string]: { assignedMask: number } }
  GROUP_TASKS: "groupTasks", // { [groupName: string]: { [taskId: string]: { url: string, title: string, processedMask: number, creationTimestamp: number } } }
  STALE_DEVICE_THRESHOLD_DAYS: "staleDeviceThresholdDays", // number (days) - Moved to sync
  TASK_EXPIRY_DAYS: "taskExpiryDays", // number (days) - Moved to sync
  DEVICE_REGISTRY: "deviceRegistry", // { [deviceUUID: string]: { name: string, lastSeen: number, groupBits: { [groupName: string]: number } } }
};

export const LOCAL_STORAGE_KEYS = {
  INSTANCE_ID: "myInstanceId", // string (UUID)
  INSTANCE_NAME: "myInstanceName", // string
  SUBSCRIPTIONS: "mySubscriptions", // string[]
  GROUP_BITS: "myGroupBits", // { [groupName: string]: number }
  PROCESSED_TASKS: "processedTaskIds", // { [taskId: string]: boolean }
};

export const MAX_DEVICES_PER_GROUP = 15; // Using 16-bit integers safely (bit 0 to 15)

export async function getPlatformInfoCached() {
  // Try to get from storage.local first
  const { platformInfo } = await browser.storage.local.get("platformInfo");
  if (platformInfo && platformInfo.os) {
    return platformInfo;
  }
  // Fallback: fetch and cache
  try {
    const info = await browser.runtime.getPlatformInfo();
    await browser.storage.local.set({ platformInfo: info });
    return info;
  } catch {
    return { os: "unknown" };
  }
}

export async function isAndroid() {
  try {
    const info = await getPlatformInfoCached();
    return info.os === "android";
  } catch {
    return false;
  }
}

// --- Type Safety and Validation Helpers ---
export const ensureObject = (val, fallback = {}) =>
  val && typeof val === "object" && !Array.isArray(val) ? val : fallback;
export const ensureArray = (val, fallback = []) =>
  Array.isArray(val) ? val : fallback;
export const ensureString = (val, fallback = "") =>
  typeof val === "string" ? val : fallback;

// Avoids race conditions where concurrent updates overwrite each other.
export async function mergeSyncStorage(key, updates) {
  try {
    const { success, mergedData } = await storage.merge(browser.storage.sync, key, updates);
    // Return only the success status boolean, as expected by callers
    return success;
    // if (success) {
    //   // Log the actual merged data if the operation was considered successful (even if no change occurred)
    //   // console.log(`Merge operation for key "${key}" complete. Result:`, mergedData);
    // } else {
    //   console.error(`Failed to set merged data for key "${key}"`);
    // }
    return true;
  } catch (error) {
    console.error(
      `Error merging ${key} in sync storage:`,
      error,
      "Updates:",
      updates
    );
    return false;
  }
}

// Simple deep merge utility (adjust if complex array merging is needed)
export const deepMerge = (target, source) => {
  const output = { ...ensureObject(target) }; // Ensure output starts as a copy of an object

  if (isObject(source)) {
    Object.keys(source).forEach((key) => {
      const sourceValue = source[key];
      const targetValue = output[key];

      if (sourceValue === null) {
        // Explicit deletion
        delete output[key];
      } else if (isObject(sourceValue)) {
        // Recurse only if target value is also an object
        if (isObject(targetValue)) {
          output[key] = deepMerge(targetValue, sourceValue);
        } else {
          // Overwrite if target is not an object or doesn't exist
          output[key] = sourceValue; // Assign source object directly
        }
      } else {
        // Assign non-object values directly (overwriting target)
        output[key] = sourceValue;
      }
    });
  }
  return output;
};

export const isObject = (item) =>
  !!item && typeof item === "object" && !Array.isArray(item);

// --- Instance ID/Name ---
// Store device name and ID in both local and sync storage for persistence
// Refactored: INSTANCE_ID is local only. INSTANCE_NAME's source of truth is deviceRegistry (sync).
export async function getInstanceId() {
  let id = await storage.get(
    browser.storage.local,
    LOCAL_STORAGE_KEYS.INSTANCE_ID
  );

  if (!id) {
    id = globalThis.crypto.randomUUID();
    console.log("Generated new instance ID:", id);
    await storage.set(
      browser.storage.local,
      LOCAL_STORAGE_KEYS.INSTANCE_ID,
      id
    );
  } else {
    console.log("Retrieved instance ID from local storage:", id);
  }
  return id;
}

export async function getInstanceName() {
  let name = await storage.get(
    browser.storage.local,
    LOCAL_STORAGE_KEYS.INSTANCE_NAME
  );

  if (!name) {
    // Generate a default name if none exists locally
    try {
      const platformInfo = await getPlatformInfoCached(); // Use cached version
      let osName =
        platformInfo.os.charAt(0).toUpperCase() + platformInfo.os.slice(1);
      // Simplify OS naming
      if (osName === "Mac") osName = "Mac";
      else if (osName === "Win") osName = "Windows";
      else if (osName === "Linux") osName = "Linux";
      else if (osName === "Android") osName = "Android";
      // Add more OS mappings if needed
      name = `${osName} Device`;
    } catch (e) {
      console.warn("Could not get platform info for default name:", e);
      name = "My Device"; // Fallback default
    }
    console.log("Generated default instance name:", name);
    await storage.set(
      browser.storage.local,
      LOCAL_STORAGE_KEYS.INSTANCE_NAME,
      name
    );
    // Also attempt to set it in the device registry immediately if possible
    // Note: This might race with initial heartbeat, but is generally safe.
    const instanceId = await getInstanceId(); // Ensure ID is available
    if (instanceId) {
      await mergeSyncStorage(SYNC_STORAGE_KEYS.DEVICE_REGISTRY, { [instanceId]: { name } });
    }
  } else {
    console.log("Retrieved instance name from local storage:", name);
    // Optional: Could add a check here against deviceRegistry and update local if needed,
    // but heartbeat/sync changes should handle this eventually.
  }
  return name;
}

// --- Bitmask Helpers ---
export const getNextAvailableBitPosition = (mask) => {
  for (let i = 0; i < MAX_DEVICES_PER_GROUP; i++) {
    if (!((mask >> i) & 1)) {
      // Check if bit i is 0
      return i;
    }
  }
  return -1; // No available bits
};

// utils.js - shared rendering and storage helpers for TabTogether

// Refactor renderDeviceList to use the html template utility
export function renderDeviceList(container, devices, highlightId = null) {
  if (!devices || Object.keys(devices).length === 0) {
    container.textContent = STRINGS.noDevices;
    return;
  }
  const ul = document.createElement("ul");
  ul.setAttribute("role", "list");
  const entries = Object.entries(devices).sort((a, b) =>
    (a[1]?.name || "").localeCompare(b[1]?.name || "")
  );
  for (const [id, device] of entries) {
    // Create elements programmatically for safety
    const li = document.createElement('li');
    li.setAttribute('role', 'listitem');
    if (id === highlightId) li.classList.add('this-device');

    const nameSpan = document.createElement('span');
    nameSpan.textContent = device.name || "Unnamed Device"; // Use textContent
    li.appendChild(nameSpan);

    if (device.lastSeen) {
      const lastSeenSpan = document.createElement('span');
      lastSeenSpan.className = 'small-text';
      lastSeenSpan.style.marginLeft = '10px';
      lastSeenSpan.style.fontSize = '0.95em';
      lastSeenSpan.textContent = `Last seen: ${new Date(device.lastSeen).toLocaleString()}`; // Use textContent
      li.appendChild(lastSeenSpan);
    }
    ul.appendChild(li); // Append the created li element directly
  }
  container.textContent = ""; // Clear safely
  container.appendChild(ul);
}


// --- Refactor renderGroupList to use the html template utility ---
export function renderGroupList(
  container,
  groups,
  subscriptions,
  onSubscribe,
  onUnsubscribe,
  onDelete,
  onRename
) {
  if (!groups || groups.length === 0) {
    const p = document.createElement("p");
    p.textContent = STRINGS.noGroups;
    container.textContent = ""; // Clear safely
    container.appendChild(p);
    return;
  }
  const ul = document.createElement("ul");
  ul.setAttribute("role", "list");
  groups.sort().forEach((groupName) => {
    const isSubscribed = subscriptions && subscriptions.includes(groupName);

    // Create elements programmatically for safety
    const liElem = document.createElement('li');
    liElem.setAttribute('role', 'listitem');

    const nameSpan = document.createElement('span');
    nameSpan.className = 'group-name-label';
    nameSpan.title = 'Click to rename';
    nameSpan.style.cursor = 'pointer';
    nameSpan.tabIndex = 0;
    nameSpan.setAttribute('role', 'button');
    nameSpan.setAttribute('aria-label', `Rename group ${groupName}`);
    nameSpan.textContent = groupName; // Use textContent
    liElem.appendChild(nameSpan);

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'group-actions';

    const subButton = document.createElement('button');
    subButton.className = isSubscribed ? 'unsubscribe-btn' : 'subscribe-btn';
    subButton.dataset.group = groupName;
    subButton.setAttribute('aria-label', `${isSubscribed ? 'Unsubscribe from' : 'Subscribe to'} group ${groupName}`);
    subButton.textContent = isSubscribed ? 'Unsubscribe' : 'Subscribe'; // Use textContent
    actionsDiv.appendChild(subButton);

    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete-btn';
    deleteButton.dataset.group = groupName;
    deleteButton.title = 'Delete group for all devices';
    deleteButton.setAttribute('aria-label', `Delete group ${groupName}`);
    deleteButton.textContent = 'Delete'; // Use textContent
    actionsDiv.appendChild(deleteButton);

    liElem.appendChild(actionsDiv);

    // Attach event listeners
    if (onRename) {
      nameSpan.onclick = () => onRename(groupName, nameSpan);
      nameSpan.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onRename(groupName, nameSpan);
        }
      };
    }
    subButton.addEventListener(
      "click",
      isSubscribed ? onUnsubscribe : onSubscribe
    );
    deleteButton.addEventListener("click", onDelete);
    ul.appendChild(liElem);
  });
  container.textContent = ""; // Clear safely
  container.appendChild(ul);
}

export const renderDeviceName = (container, name) => {
  container.textContent = name || STRINGS.deviceNameNotSet;
};

export const renderSubscriptions = (container, subscriptions) => {
  if (!subscriptions || subscriptions.length === 0) {
    container.textContent = STRINGS.notSubscribed;
    return;
  }
  container.textContent = STRINGS.subscribedGroups + subscriptions.join(", ");
};

// Utility: Show Android banner
export const showAndroidBanner = (container, msg) => {
  let banner = container.querySelector(".android-banner");
  if (!banner) {
    banner = document.createElement("div");
    banner.className = "android-banner small-text";
    banner.style.color = "#b71c1c";
    banner.style.marginBottom = "10px";
    banner.style.background = "#fff3e0";
    banner.style.border = "1px solid #ffcdd2";
    banner.style.padding = "7px";
    banner.style.borderRadius = "4px";
    container.insertBefore(
      banner,
      container.firstChild ? container.firstChild.nextSibling : null
    );
  }
  banner.textContent = msg;
};

// Utility: Last sync time
export const setLastSyncTime = (container, date) => {
  let syncDiv = container.querySelector(".last-sync-time");
  if (!syncDiv) {
    syncDiv = document.createElement("div");
    syncDiv.className = "last-sync-time small-text";
    syncDiv.style.marginBottom = "7px";
    container.insertBefore(syncDiv, container.firstChild.nextSibling);
  }
  syncDiv.textContent =
    "Last sync: " + (date ? new Date(date).toLocaleString() : "Never");
};

// Debug/info section for troubleshooting
export function showDebugInfo(container, state) {
  let debugDiv = container.querySelector(".debug-info");
  if (!debugDiv) {
    debugDiv = document.createElement("div");
    debugDiv.className = "debug-info small-text";
    debugDiv.style.marginTop = "12px";
    debugDiv.style.background = "#f5f5f5";
    debugDiv.style.border = "1px solid #ccc";
    debugDiv.style.padding = "7px";
    debugDiv.style.borderRadius = "4px";
    container.appendChild(debugDiv);
  }
  debugDiv.textContent = ""; // Clear safely
  const title = document.createElement("strong");
  title.textContent = "Debug Info";
  debugDiv.appendChild(title);
  debugDiv.appendChild(document.createElement("br"));
  const addLine = (label, value) => {
    const line = document.createElement("div");
    line.textContent = `${label}: ${value ?? "-"}`;
    debugDiv.appendChild(line);
  };
  addLine("Instance ID", state?.instanceId ?? "-");
  addLine("Instance Name", state?.instanceName ?? "-");
  addLine(
    "Subscriptions",
    state?.subscriptions ? JSON.stringify(state.subscriptions) : "-"
  );
  addLine(
    "Group Bits",
    state?.groupBits ? JSON.stringify(state.groupBits) : "-"
  );
  addLine(
    "Defined Groups",
    state?.definedGroups ? JSON.stringify(state.definedGroups) : "-"
  );
  addLine(
    "Device Registry",
    state?.deviceRegistry ? JSON.stringify(state.deviceRegistry) : "-"
  );
  addLine(
    "Group State",
    state?.groupState ? JSON.stringify(state.groupState) : "-"
  );
}

// Export direct storage helpers for tests and Android logic
// Refactor createGroupDirect to use addToList
export async function createGroupDirect(groupName) {
  await addToList(browser.storage.sync, "definedGroups", groupName);
  const groupState = await storage.get(browser.storage.sync, "groupState", {});
  if (!groupState[groupName]) {
    groupState[groupName] = { assignedMask: 0 };
    await storage.set(browser.storage.sync, "groupState", groupState);
  }
  return { success: true, newGroup: groupName };
}

export async function subscribeToGroupDirect(groupName) {
  let subscriptions = await storage.get(
    browser.storage.local,
    "mySubscriptions",
    []
  );
  let groupBits = await storage.get(browser.storage.local, "myGroupBits", {});
  if (subscriptions.includes(groupName))
    return { success: false, message: "Already subscribed." };
  const groupState = await storage.get(browser.storage.sync, "groupState", {});
  const state = groupState[groupName] || { assignedMask: 0, assignedCount: 0 };
  const bitPosition = getNextAvailableBitPosition(state.assignedMask);
  if (bitPosition === -1) {
    return { success: false, message: "Group is full (15 devices max)." };
  }
  const myBit = 1 << bitPosition;
  state.assignedMask |= myBit;
  groupState[groupName] = state;
  await storage.set(browser.storage.sync, "groupState", groupState);
  subscriptions.push(groupName);
  subscriptions.sort();
  groupBits[groupName] = myBit;
  await storage.set(browser.storage.local, "mySubscriptions", subscriptions);
  await storage.set(browser.storage.local, "myGroupBits", groupBits);
  const instanceId = await storage.get(browser.storage.local, "myInstanceId");
  const deviceRegistry = await storage.get(
    browser.storage.sync,
    "deviceRegistry",
    {}
  );
  if (!deviceRegistry[instanceId])
    deviceRegistry[instanceId] = {
      name: "",
      lastSeen: Date.now(),
      groupBits: {},
    };
  deviceRegistry[instanceId].groupBits[groupName] = myBit;
  deviceRegistry[instanceId].lastSeen = Date.now();
  await storage.set(browser.storage.sync, "deviceRegistry", deviceRegistry);
  return { success: true, subscribedGroup: groupName, assignedBit: myBit };
}

export async function unsubscribeFromGroupDirect(groupName) {
  let subscriptions = await storage.get(
    browser.storage.local,
    "mySubscriptions",
    []
  );
  let groupBits = await storage.get(browser.storage.local, "myGroupBits", {});
  if (!subscriptions.includes(groupName))
    return { success: false, message: "Not subscribed." };
  const removedBit = groupBits[groupName];
  subscriptions = subscriptions.filter((g) => g !== groupName);
  delete groupBits[groupName];
  await storage.set(browser.storage.local, "mySubscriptions", subscriptions);
  await storage.set(browser.storage.local, "myGroupBits", groupBits);
  const groupState = await storage.get(browser.storage.sync, "groupState", {});
  if (groupState[groupName]) {
    groupState[groupName].assignedMask &= ~removedBit;
    await storage.set(browser.storage.sync, "groupState", groupState);
  }
  const instanceId = await storage.get(browser.storage.local, "myInstanceId");
  const deviceRegistry = await storage.get(
    browser.storage.sync,
    "deviceRegistry",
    {}
  );
  if (deviceRegistry[instanceId] && deviceRegistry[instanceId].groupBits) {
    delete deviceRegistry[instanceId].groupBits[groupName];
    await storage.set(browser.storage.sync, "deviceRegistry", deviceRegistry);
  }
  return { success: true, unsubscribedGroup: groupName };
}

export async function createAndStoreGroupTask(groupName, tabData, senderBit) {
  const taskId =
    globalThis.crypto && globalThis.crypto.randomUUID
      ? globalThis.crypto.randomUUID()
      : "mock-task-id";
  const groupTasks = await storage.get(browser.storage.sync, "groupTasks", {});
  if (!groupTasks[groupName]) groupTasks[groupName] = {};
  groupTasks[groupName][taskId] = {
    url: tabData.url,
    title: tabData.title || tabData.url,
    processedMask: senderBit,
    creationTimestamp: Date.now(),
  };
  await storage.set(browser.storage.sync, "groupTasks", groupTasks);
  return { success: true };
}

export async function sendTabToGroupDirect(groupName, tabData) {
  const groupBits = await storage.get(browser.storage.local, "myGroupBits", {});
  const senderBit = groupBits[groupName] || 0;
  return await createAndStoreGroupTask(groupName, tabData, senderBit);
}

// Refactor deleteGroupDirect to use removeFromList and removeObjectKey
export async function deleteGroupDirect(groupName) {
  await removeFromList(browser.storage.sync, "definedGroups", groupName);
  await removeObjectKey(browser.storage.sync, "groupState", groupName);
  await removeObjectKey(browser.storage.sync, "groupTasks", groupName);
  // Remove groupBits from all devices in registry
  const registry = await storage.get(
    browser.storage.sync,
    "deviceRegistry",
    {}
  );
  for (const deviceId in registry) {
    if (registry[deviceId]?.groupBits?.[groupName] !== undefined) {
      delete registry[deviceId].groupBits[groupName];
    }
  }
  await storage.set(browser.storage.sync, "deviceRegistry", registry);
  await removeFromList(browser.storage.local, "mySubscriptions", groupName);
  await removeObjectKey(browser.storage.local, "myGroupBits", groupName);
  return { success: true, deletedGroup: groupName };
}

// Refactor renameGroupDirect to use renameInList and updateObjectKey
export async function renameGroupDirect(oldName, newName) {
  const definedGroups = await storage.get(
    browser.storage.sync,
    "definedGroups",
    []
  );
  if (!definedGroups.includes(oldName))
    return { success: false, message: "Group does not exist." };
  if (definedGroups.includes(newName))
    return {
      success: false,
      message: "A group with that name already exists.",
    };
  await renameInList(browser.storage.sync, "definedGroups", oldName, newName);
  await updateObjectKey(browser.storage.sync, "groupState", oldName, newName);
  await updateObjectKey(browser.storage.sync, "groupTasks", oldName, newName);
  // Update groupBits in all devices in registry
  const registry = await storage.get(
    browser.storage.sync,
    "deviceRegistry",
    {}
  );
  for (const deviceId in registry) {
    if (registry[deviceId]?.groupBits?.[oldName] !== undefined) {
      const bit = registry[deviceId].groupBits[oldName];
      delete registry[deviceId].groupBits[oldName];
      registry[deviceId].groupBits[newName] = bit;
    }
  }
  await storage.set(browser.storage.sync, "deviceRegistry", registry);
  await updateObjectKey(browser.storage.local, "myGroupBits", oldName, newName);
  await renameInList(
    browser.storage.local,
    "mySubscriptions",
    oldName,
    newName
  );
  return { success: true };
}

export async function renameDeviceDirect(deviceId, newName) {
  try {
    const deviceRegistry = await storage.get(
      browser.storage.sync,
      "deviceRegistry",
      {}
    );
    if (!deviceRegistry[deviceId])
      return { success: false, message: "Device not found." };
    deviceRegistry[deviceId].name = newName.trim();
    await storage.set(browser.storage.sync, "deviceRegistry", deviceRegistry);
    const instanceId = await storage.get(browser.storage.local, "myInstanceId");
    if (deviceId === instanceId) {
      await storage.set(
        browser.storage.local,
        "myInstanceName",
        newName.trim()
      );
    }
    return { success: true, newName: newName.trim() };
  } catch (error) {
    console.error("Error in renameDeviceDirect:", error);
    return {
      success: false,
      message: error.message || "Failed to rename device directly.",
    };
  }
}

export async function deleteDeviceDirect(deviceId) {
  const deviceRegistry = await storage.get(
    browser.storage.sync,
    "deviceRegistry",
    {}
  );
  if (!deviceRegistry[deviceId])
    return { success: false, message: "Device not found." }; // Early exit if device not found
  const groupBits = deviceRegistry[deviceId].groupBits || {};
  delete deviceRegistry[deviceId];
  await storage.set(browser.storage.sync, "deviceRegistry", deviceRegistry); // Update registry
  const groupState = await storage.get(browser.storage.sync, "groupState", {});
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
    await storage.set(browser.storage.sync, "groupState", groupState);
  }
  // Remove local data if this is the current device
  const localId = await storage.get(
    browser.storage.local,
    LOCAL_STORAGE_KEYS.INSTANCE_ID
  );
  if (deviceId === localId) {
    await storage.set(
      browser.storage.local,
      LOCAL_STORAGE_KEYS.SUBSCRIPTIONS,
      []
    );
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.GROUP_BITS, {});
  }
  return { success: true };
}

export async function processIncomingTabs(
  state,
  openTabFn,
  updateProcessedTasksFn
) {
  if (
    !state ||
    !state.definedGroups ||
    !state.groupBits ||
    !state.subscriptions
  )
    return;
  const groupTasks = await browser.storage.sync
    .get(SYNC_STORAGE_KEYS.GROUP_TASKS)
    .then((r) => r[SYNC_STORAGE_KEYS.GROUP_TASKS] || {});
  let localProcessedTasks = await browser.storage.local
    .get(LOCAL_STORAGE_KEYS.PROCESSED_TASKS)
    .then((r) => r[LOCAL_STORAGE_KEYS.PROCESSED_TASKS] || {});
  let processedTasksUpdateBatch = {};
  let groupTasksSyncUpdates = {}; // Batch sync updates
  let needsSyncUpdate = false;

  for (const groupName of state.subscriptions) {
    const myBit = state.groupBits[groupName];
    if (!myBit) continue;
    if (!groupTasks[groupName]) continue;
    for (const taskId in groupTasks[groupName]) {
      const task = groupTasks[groupName][taskId];
      if (
        !localProcessedTasks[taskId] &&
        !((task.processedMask & myBit) === myBit)
      ) {
        try {
          await openTabFn(task.url, task.title);
        } catch (e) {
          console.error(
            `Failed to open tab for task ${taskId} (URL: ${task.url}):`,
            e
          );
        }
        processedTasksUpdateBatch[taskId] = true;
        // Mark as processed in sync
        const newProcessedMask = task.processedMask | myBit;
        if (newProcessedMask !== task.processedMask) {
          // Only update if mask changed
          if (!groupTasksSyncUpdates[groupName]) {
            groupTasksSyncUpdates[groupName] = {};
          }
          // Store only the changed mask for merging
          groupTasksSyncUpdates[groupName][taskId] = {
            processedMask: newProcessedMask,
          };
          needsSyncUpdate = true;
        }
      }
    }
  }
  if (Object.keys(processedTasksUpdateBatch).length > 0) {
    await updateProcessedTasksFn({
      ...localProcessedTasks,
      ...processedTasksUpdateBatch,
    });
  }
  if (needsSyncUpdate) {
    await mergeSyncStorage(
      SYNC_STORAGE_KEYS.GROUP_TASKS,
      groupTasksSyncUpdates
    );
  }
}

// Helper to process tabs specifically on Android (used by popup and options)
export async function processIncomingTabsAndroid(state) {
  await processIncomingTabs(
    state,
    // Function to open tab
    async (url, title) => {
      // Consider adding error handling for tab creation
      try {
        await browser.tabs.create({ url, title, active: false });
      } catch (e) {
        console.error(`Failed to create tab for ${url}:`, e);
        // Optionally notify user
      }
    },
    // Function to update processed tasks in local storage
    async (updated) => {
      await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.PROCESSED_TASKS, updated);
    }
  );
}


export async function subscribeToGroupUnified(groupName, isAndroidPlatform) {
  if (isAndroidPlatform) {
    return await subscribeToGroupDirect(groupName);
  } else {
    return await browser.runtime.sendMessage({
      action: "subscribeToGroup",
      groupName,
    });
  }
}

export async function unsubscribeFromGroupUnified(
  groupName,
  isAndroidPlatform
) {
  if (isAndroidPlatform) {
    return await unsubscribeFromGroupDirect(groupName);
  } else {
    return await browser.runtime.sendMessage({
      action: "unsubscribeFromGroup",
      groupName,
    });
  }
}

// --- Modernize Async Patterns: Use Promise.all for parallel async operations ---
// getUnifiedState: already uses Promise.all for Android, but not for non-Android
export async function getUnifiedState(isAndroidPlatform) {
  if (isAndroidPlatform) {
    // Use storage wrapper for consistency and type safety
    const [
      instanceId,
      instanceName,
      subscriptions,
      groupBits,
      definedGroups,
      groupState,
      deviceRegistry,
    ] = await Promise.all([ // Use storage.get for sync keys too
      storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.INSTANCE_ID),
      storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.INSTANCE_NAME),
      storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []),
      storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.GROUP_BITS, {}),
      storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS, []),
      storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, {}),
      storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {}),
    ]);
    return {
      instanceId,
      instanceName,
      subscriptions,
      groupBits,
      definedGroups,
      groupState,
      deviceRegistry,
    };
  } else {
    // Parallelize state fetch for non-Android
    const [
      instanceId,
      instanceName,
      subscriptions,
      groupBits,
      definedGroups,
      groupState,
      deviceRegistry,
    ] = await Promise.all([
      storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.INSTANCE_ID),
      storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.INSTANCE_NAME),
      storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []),
      storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.GROUP_BITS, {}),
      storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS, []),
      storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, {}),
      storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {}),
    ]);
    return {
      instanceId,
      instanceName,
      subscriptions,
      groupBits,
      definedGroups,
      groupState,
      deviceRegistry,
    };
  }
}

export async function renameDeviceUnified(
  deviceId,
  newName,
  isAndroidPlatform
) {
  if (isAndroidPlatform) {
    return await renameDeviceDirect(deviceId, newName);
  } else {
    return await browser.runtime.sendMessage({
      action: "renameDevice",
      deviceId,
      newName,
    });
  }
}

// --- Generic Storage List/Object Updaters ---
export async function updateListInStorage(
  area,
  key,
  updater,
  defaultValue = []
) {
  const list = await storage.get(area, key, defaultValue);
  const updated = updater(Array.isArray(list) ? list : defaultValue);
  await storage.set(area, key, updated);
  return updated;
}

export async function updateObjectInStorage(
  area,
  key,
  updater,
  defaultValue = {}
) {
  const obj = await storage.get(area, key, defaultValue);
  const updated = updater(obj && typeof obj === "object" ? obj : defaultValue);
  await storage.set(area, key, updated);
  return updated;
}

// --- Standardized Error Handling and User Feedback ---
export const showError = (message, area = null) => {
  if (area) {
    area.textContent = message;
    area.className = "error";
    area.classList.remove("hidden");
  } else if (typeof browser !== "undefined" && browser.notifications) {
    browser.notifications.create({
      type: "basic",
      iconUrl: browser.runtime.getURL("icons/icon-48.png"),
      title: STRINGS.error,
      message: message,
    });
  }
};

// --- Background logic shared for background.js and tests ---
export async function performHeartbeat(
  localInstanceId,
  localInstanceName,
  localGroupBits,
  cachedDeviceRegistry
) {
  if (!localInstanceId) {
    console.warn("Heartbeat skipped: Instance ID not available yet.");
    return;
  }
  console.log(`Performing heartbeat for ${localInstanceId} (${localInstanceName})...`); // More specific log
  const update = {
    [localInstanceId]: {
      name: localInstanceName,
      lastSeen: Date.now(),
      groupBits: localGroupBits,
    },
  };
  console.log('[Heartbeat] Attempting to merge update:', JSON.stringify(update)); // Log the data being merged
  const success = await mergeSyncStorage(
    SYNC_STORAGE_KEYS.DEVICE_REGISTRY,
    update
  );
  // Removed ineffective update to cachedDeviceRegistry argument
  console.log("Heartbeat complete.");
}


export async function performStaleDeviceCheck(
  cachedDeviceRegistry,
  cachedGroupState,
  thresholdMs // Add threshold parameter
) {
  console.log("Performing stale device check...");
  let registry =
    cachedDeviceRegistry ??
    (await storage.get(
      browser.storage.sync,
      SYNC_STORAGE_KEYS.DEVICE_REGISTRY,
      {}
    ));
  let groupState =
    cachedGroupState ??
    (await storage.get(
      browser.storage.sync,
      SYNC_STORAGE_KEYS.GROUP_STATE,
      {}
    ));
  const now = Date.now();
  let registryUpdates = {};
  let groupStateUpdates = {};
  let needsRegistryUpdate = false;
  let needsGroupStateUpdate = false;
  for (const deviceId in registry) {
    if (now - (registry[deviceId]?.lastSeen || 0) > thresholdMs) { // Use parameter
      console.log(
        `Device ${deviceId} (${registry[deviceId].name}) is stale. Pruning...`
      );
      needsRegistryUpdate = true;
      registryUpdates[deviceId] = null;
      const staleDeviceBits = registry[deviceId].groupBits || {};
      for (const groupName in staleDeviceBits) {
        const staleBit = staleDeviceBits[groupName];
        if (groupState[groupName] && staleBit !== undefined) {
          const currentAssignedMask = groupState[groupName].assignedMask;
          const newAssignedMask = currentAssignedMask & ~staleBit;
          if (newAssignedMask !== currentAssignedMask) {
            if (!groupStateUpdates[groupName])
              groupStateUpdates[groupName] = {};
            groupStateUpdates[groupName].assignedMask = newAssignedMask;
            needsGroupStateUpdate = true;
            console.log(
              `Updated assignedMask for group ${groupName} (removed bit for stale device ${deviceId})`
            );
          }
        }
      }
    }
  }
  let registryMergeSuccess = true;
  let groupStateMergeSuccess = true;
  if (needsRegistryUpdate) {
    registryMergeSuccess = await mergeSyncStorage(
      SYNC_STORAGE_KEYS.DEVICE_REGISTRY,
      registryUpdates
    );
    // Removed ineffective update to cachedDeviceRegistry argument
  }
  if (needsGroupStateUpdate) {
    groupStateMergeSuccess = await mergeSyncStorage(
      SYNC_STORAGE_KEYS.GROUP_STATE,
      groupStateUpdates
    );
    // Removed ineffective update to cachedGroupState argument
  }
  console.log("Stale device check complete.");
}

export async function performTimeBasedTaskCleanup(
  localProcessedTasks,
  thresholdMs // Add threshold parameter
) {
  console.log("Performing time-based task cleanup...");
  const allGroupTasks = await storage.get(
    browser.storage.sync,
    SYNC_STORAGE_KEYS.GROUP_TASKS,
    {}
  );
  let groupTasksUpdates = {};
  let needsUpdate = false;
  const now = Date.now();
  let processedTasksChanged = false; // Track if local processed tasks need saving
  let currentProcessedTasks = { ...localProcessedTasks }; // Work on a copy

  for (const groupName in allGroupTasks) {
    for (const taskId in allGroupTasks[groupName]) {
      const task = allGroupTasks[groupName][taskId];
      if (now - (task?.creationTimestamp || 0) > thresholdMs) { // Use parameter
        console.log(`Task ${taskId} in group ${groupName} expired. Deleting.`);
        if (!groupTasksUpdates[groupName]) groupTasksUpdates[groupName] = {};
        groupTasksUpdates[groupName][taskId] = null;
        needsUpdate = true;
        // Delete from the working copy if it exists
        if (currentProcessedTasks[taskId]) {
          delete currentProcessedTasks[taskId];
          processedTasksChanged = true; // Mark that we need to save the local changes
        }
      }
    }
  }

  console.log(
    `[Cleanup] Before final local set: processedTasksChanged=${processedTasksChanged}, currentProcessedTasks=`,
    JSON.stringify(currentProcessedTasks)
  );

  if (needsUpdate) {
    await mergeSyncStorage(SYNC_STORAGE_KEYS.GROUP_TASKS, groupTasksUpdates);
    // if (Object.keys(processedTasksUpdates).length !== Object.keys(localProcessedTasks).length) {
    // localProcessedTasks = processedTasksUpdates;
    // await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.PROCESSED_TASKS, localProcessedTasks);
    // }
  }
  // Save the updated local processed tasks if changes were made
  if (processedTasksChanged) {
    console.log(`[Cleanup] Saving updated local processed tasks...`);
    await storage.set(
      browser.storage.local,
      LOCAL_STORAGE_KEYS.PROCESSED_TASKS,
      currentProcessedTasks
    );
  }
  console.log("Time-based task cleanup complete.");
}

// --- Unified Storage Utility ---
export const storage = {
  async get(area, key, defaultValue = null) {
    try {
      const { [key]: valueRaw } = await area.get(key);
      let value = valueRaw ?? defaultValue;
      // Type validation for known keys
      if (
        key === LOCAL_STORAGE_KEYS.GROUP_BITS ||
        key === SYNC_STORAGE_KEYS.GROUP_STATE ||
        key === SYNC_STORAGE_KEYS.DEVICE_REGISTRY
      ) {
        value = ensureObject(value, defaultValue ?? {});
      } else if (
        key === LOCAL_STORAGE_KEYS.SUBSCRIPTIONS ||
        key === SYNC_STORAGE_KEYS.DEFINED_GROUPS
      ) {
        value = ensureArray(value, defaultValue ?? []);
      } else if (
        key === LOCAL_STORAGE_KEYS.INSTANCE_ID ||
        key === LOCAL_STORAGE_KEYS.INSTANCE_NAME
      ) {
        value = ensureString(value, defaultValue ?? "");
      }
      return value;
    } catch (e) {
      console.error(`Error getting ${key}:`, e);
      return defaultValue;
    }
  },
  async set(area, key, value) {
    try {
      await area.set({ [key]: value });
      return true;
    } catch (e) {
      console.error(`Error setting ${key}:`, e);
      return false;
    }
  },
  async merge(area, key, updates) {
    try {
      // Ensure currentData is treated as an object for deepMerge
      const currentDataObj = await this.get(area, key, {});
      const mergedData = deepMerge(currentDataObj, updates);
      let dataChanged = JSON.stringify(currentDataObj) !== JSON.stringify(mergedData);

      if (dataChanged) {
        // console.log(
        //   `[storage.merge] Data changed for key "${key}", setting...`,
        //   mergedData
        // );
        await area.set({ [key]: mergedData });
      } else {
        // console.log(
        //   `[storage.merge] Skipped setting ${key} as merge resulted in no change.`
        // );
      }
      // Return success status and the final merged data
      return { success: true, mergedData: mergedData };
    } catch (error) {
      console.error(`Error merging ${key}:`, error, "Updates:", updates);
      // Return failure status. Avoid using currentDataObj as it might be undefined.
      return { success: false, mergedData: null }; // Or return updates? null seems safer.
    }
  },
};

export async function renameInList(area, key, oldValue, newValue) {
  const list = await storage.get(area, key, []);
  const updated = list.map((item) => (item === oldValue ? newValue : item));
  await storage.set(area, key, updated);
  return updated;
}

export async function updateObjectKey(area, key, oldProp, newProp) {
  const obj = await storage.get(area, key, {});
  if (obj[oldProp]) {
    obj[newProp] = obj[oldProp];
    delete obj[oldProp];
    await storage.set(area, key, obj);
  }
  return obj;
}

export async function removeObjectKey(area, key, prop) {
  const obj = await storage.get(area, key, {});
  if (obj[prop]) {
    delete obj[prop];
    await storage.set(area, key, obj);
  }
  return obj;
}
