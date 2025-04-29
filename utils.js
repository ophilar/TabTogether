// utils.js

import { STRINGS } from './constants.js';

export const SYNC_STORAGE_KEYS = {
    DEFINED_GROUPS: 'definedGroups', // string[]
    GROUP_STATE: 'groupState',       // { [groupName: string]: { assignedMask: number } }
    GROUP_TASKS: 'groupTasks',       // { [groupName: string]: { [taskId: string]: { url: string, title: string, processedMask: number, creationTimestamp: number } } }
    DEVICE_REGISTRY: 'deviceRegistry' // { [deviceUUID: string]: { name: string, lastSeen: number, groupBits: { [groupName: string]: number } } }
};

export const LOCAL_STORAGE_KEYS = {
    INSTANCE_ID: 'myInstanceId',         // string (UUID)
    INSTANCE_NAME: 'myInstanceName',     // string
    SUBSCRIPTIONS: 'mySubscriptions',    // string[]
    GROUP_BITS: 'myGroupBits',           // { [groupName: string]: number }
    PROCESSED_TASKS: 'processedTaskIds' // { [taskId: string]: boolean }
};

export const MAX_DEVICES_PER_GROUP = 15; // Using 16-bit integers safely (bit 0 to 15)

export async function getPlatformInfoCached() {
    // Try to get from storage.local first
    const { platformInfo } = await browser.storage.local.get('platformInfo');
    if (platformInfo && platformInfo.os) {
        return platformInfo;
    }
    // Fallback: fetch and cache
    try {
        const info = await browser.runtime.getPlatformInfo();
        await browser.storage.local.set({ platformInfo: info });
        return info;
    } catch {
        return { os: 'unknown' };
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

export async function isDesktop() {
    const info = await getPlatformInfoCached();
    return info.os === "win" || info.os === "mac" || info.os === "linux";
}

// --- Type Safety and Validation Helpers ---
export const ensureObject = (val, fallback = {}) => (val && typeof val === 'object' && !Array.isArray(val)) ? val : fallback;
export const ensureArray = (val, fallback = []) => Array.isArray(val) ? val : fallback;
export const ensureString = (val, fallback = '') => typeof val === 'string' ? val : fallback;

// Avoids race conditions where concurrent updates overwrite each other.
export async function mergeSyncStorage(key, updates) {
    try {
        const success = await storage.merge(browser.storage.sync, key, updates);

        if (success) {
            console.log(`Merged data for key "${key}"`, updates); // Log updates on success
        } else {
             console.error(`Failed to set merged data for key "${key}"`);
             return false; // Return false if set failed
        }
        return true;
    } catch (error) {
        console.error(`Error merging ${key} in sync storage:`, error, "Updates:", updates);
        return false;
    }
}

// Simple deep merge utility (adjust if complex array merging is needed)
export const deepMerge = (target, source) => {
    const output = { ...ensureObject(target) }; // Ensure output starts as a copy of an object

    if (isObject(source)) {
        Object.keys(source).forEach(key => {
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

export const isObject = item => !!item && typeof item === 'object' && !Array.isArray(item);

// --- Instance ID/Name ---
// Store device name and ID in both local and sync storage for persistence
export async function getInstanceId() {
    let id = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.INSTANCE_ID);
    let needsLocalSet = false;
    let needsSyncSet = false;

    if (!id) {
        id = await storage.get(browser.storage.sync, LOCAL_STORAGE_KEYS.INSTANCE_ID);
        if (!id) {
            id = globalThis.crypto.randomUUID();
            console.log("Generated new instance ID:", id);

            needsLocalSet = true;
            needsSyncSet = true;
        }
        else {
            console.log("Retrieved instance ID from sync, saving locally:", id);
            needsLocalSet = true;
        }
    } else {
        const syncId = await storage.get(browser.storage.sync, LOCAL_STORAGE_KEYS.INSTANCE_ID);
        if (syncId !== id) {
            console.log("Syncing local instance ID to sync storage:", id);
            needsSyncSet = true;
        }
    }
    
    if (needsLocalSet) {
        await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.INSTANCE_ID, id);
    }
    if (needsSyncSet) {
        await storage.set(browser.storage.sync, LOCAL_STORAGE_KEYS.INSTANCE_ID, id);
    }
    return id;
}

export async function getInstanceName() {
    let name = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.INSTANCE_NAME);
    let needsLocalSet = false;
    let needsSyncSet = false;

    if (!name) {
        name = await storage.get(browser.storage.sync, LOCAL_STORAGE_KEYS.INSTANCE_NAME);
        if (!name) {
            try {
                const platformInfo = await browser.runtime.getPlatformInfo();
                let osName = platformInfo.os.charAt(0).toUpperCase() + platformInfo.os.slice(1);
                if (osName === "Mac") osName = "Mac";
                if (osName === "Win") osName = "Windows";
                name = `${osName} Device`;
            } catch (e) {
                name = "My Device";
            }
            needsLocalSet = true;
            needsSyncSet = true;
        }
        else {
            console.log("Retrieved instance name from sync, saving locally:", name);
            needsLocalSet = true;
        }
    } else {
        const syncName = await storage.get(browser.storage.sync, LOCAL_STORAGE_KEYS.INSTANCE_NAME);
        if (syncName !== name) {
            console.log("Syncing local instance name to sync storage:", name);
            needsSyncSet = true;
        }
    }

    if (needsLocalSet) {
        await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.INSTANCE_NAME, name);
    }
    if (needsSyncSet) {
        await storage.set(browser.storage.sync, LOCAL_STORAGE_KEYS.INSTANCE_NAME, name);
    }
    return name;
}

// --- Bitmask Helpers ---
export const getNextAvailableBitPosition = mask => {
    for (let i = 0; i < MAX_DEVICES_PER_GROUP; i++) {
        if (!((mask >> i) & 1)) { // Check if bit i is 0
            return i;
        }
    }
    return -1; // No available bits
}

// utils.js - shared rendering and storage helpers for TabTogether

// Refactor renderDeviceList to use the html template utility
export function renderDeviceList(container, devices, highlightId = null) {
    if (!devices || Object.keys(devices).length === 0) {
        container.textContent = STRINGS.noDevices;
        return;
    }
    const ul = document.createElement('ul');
    ul.setAttribute('role', 'list');
    const entries = Object.entries(devices)
        .sort((a, b) => (a[1]?.name || '').localeCompare(b[1]?.name || ''));
    for (const [id, device] of entries) {
        const li = html`
            <li role="listitem" class="${id === highlightId ? 'this-device' : ''}">
                <span>${device.name || 'Unnamed Device'}</span>
                ${device.lastSeen ? `<span class="small-text" style="margin-left:10px;font-size:0.95em;">Last seen: ${new Date(device.lastSeen).toLocaleString()}</span>` : ''}
            </li>
        `;
        ul.appendChild(li.querySelector('li'));
    }
    container.innerHTML = '';
    container.appendChild(ul);
}

// --- Simple HTML template utility for rendering repeated DOM blocks ---
export const html = (strings, ...values) => {
    const template = document.createElement('template');
    template.innerHTML = strings.reduce((acc, str, i) => acc + str + (values[i] ?? ''), '');
    return template.content.cloneNode(true);
}

// --- Refactor renderGroupList to use the html template utility ---
export function renderGroupList(container, groups, subscriptions, onSubscribe, onUnsubscribe, onDelete, onRename) {
    if (!groups || groups.length === 0) {
        const p = document.createElement('p');
        p.textContent = STRINGS.noGroups;
        container.innerHTML = '';
        container.appendChild(p);
        return;
    }
    const ul = document.createElement('ul');
    ul.setAttribute('role', 'list');
    groups.sort().forEach(groupName => {
        const isSubscribed = subscriptions && subscriptions.includes(groupName);
        // Use html template for group item
        const li = html`
            <li role="listitem">
                <span class="group-name-label" title="Click to rename" style="cursor:pointer;" tabindex="0" role="button" aria-label="Rename group ${groupName}">${groupName}</span>
                <div class="group-actions">
                    <button class="${isSubscribed ? 'unsubscribe-btn' : 'subscribe-btn'}" data-group="${groupName}" aria-label="${isSubscribed ? 'Unsubscribe from' : 'Subscribe to'} group ${groupName}">${isSubscribed ? 'Unsubscribe' : 'Subscribe'}</button>
                    <button class="delete-btn" data-group="${groupName}" title="Delete group for all devices" aria-label="Delete group ${groupName}">Delete</button>
                </div>
            </li>
        `;
        // Attach event listeners
        const liElem = li.querySelector('li');
        const nameSpan = liElem.querySelector('.group-name-label');
        if (onRename) {
            nameSpan.onclick = () => onRename(groupName, nameSpan);
            nameSpan.onkeydown = (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onRename(groupName, nameSpan);
                }
            };
        }
        const subButton = liElem.querySelector('button[data-group][class$="subscribe-btn"], button[data-group][class$="unsubscribe-btn"]');
        subButton.addEventListener('click', isSubscribed ? onUnsubscribe : onSubscribe);
        const deleteButton = liElem.querySelector('.delete-btn');
        deleteButton.addEventListener('click', onDelete);
        ul.appendChild(liElem);
    });
    container.innerHTML = '';
    container.appendChild(ul);
}

export const renderDeviceName = (container, name) => {
    container.textContent = name || STRINGS.deviceNameNotSet;
}

export const renderSubscriptions = (container, subscriptions) => {
    if (!subscriptions || subscriptions.length === 0) {
        container.textContent = STRINGS.notSubscribed;
        return;
    }
    container.textContent = STRINGS.subscribedGroups + subscriptions.join(', ');
}


// Utility: Show Android banner
export const showAndroidBanner = (container, msg) => {
    let banner = container.querySelector('.android-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.className = 'android-banner small-text';
        banner.style.color = '#b71c1c';
        banner.style.marginBottom = '10px';
        banner.style.background = '#fff3e0';
        banner.style.border = '1px solid #ffcdd2';
        banner.style.padding = '7px';
        banner.style.borderRadius = '4px';
        container.insertBefore(banner, container.firstChild ? container.firstChild.nextSibling : null);
    }
    banner.textContent = msg;
}

// Utility: Last sync time
export const setLastSyncTime = (container, date) => {
    let syncDiv = container.querySelector('.last-sync-time');
    if (!syncDiv) {
        syncDiv = document.createElement('div');
        syncDiv.className = 'last-sync-time small-text';
        syncDiv.style.marginBottom = '7px';
        container.insertBefore(syncDiv, container.firstChild.nextSibling);
    }
    syncDiv.textContent = 'Last sync: ' + (date ? new Date(date).toLocaleString() : 'Never');
}

// Debug/info section for troubleshooting
export function showDebugInfo(container, state) {
    let debugDiv = container.querySelector('.debug-info');
    if (!debugDiv) {
        debugDiv = document.createElement('div');
        debugDiv.className = 'debug-info small-text';
        debugDiv.style.marginTop = '12px';
        debugDiv.style.background = '#f5f5f5';
        debugDiv.style.border = '1px solid #ccc';
        debugDiv.style.padding = '7px';
        debugDiv.style.borderRadius = '4px';
        container.appendChild(debugDiv);
    }
    debugDiv.innerHTML = '';
    const title = document.createElement('strong');
    title.textContent = 'Debug Info';
    debugDiv.appendChild(title);
    debugDiv.appendChild(document.createElement('br'));
    const addLine = (label, value) => {
        const line = document.createElement('div');
        line.textContent = `${label}: ${value ?? '-'}`;
        debugDiv.appendChild(line);
    };
    addLine('Instance ID', state?.instanceId ?? '-');
    addLine('Instance Name', state?.instanceName ?? '-');
    addLine('Subscriptions', state?.subscriptions ? JSON.stringify(state.subscriptions) : '-');
    addLine('Group Bits', state?.groupBits ? JSON.stringify(state.groupBits) : '-');
    addLine('Defined Groups', state?.definedGroups ? JSON.stringify(state.definedGroups) : '-');
    addLine('Device Registry', state?.deviceRegistry ? JSON.stringify(state.deviceRegistry) : '-');
    addLine('Group State', state?.groupState ? JSON.stringify(state.groupState) : '-');
}

// Export direct storage helpers for tests and Android logic
// Refactor createGroupDirect to use addToList
export async function createGroupDirect(groupName) {
    await addToList(browser.storage.sync, 'definedGroups', groupName);
    const groupState = await storage.get(browser.storage.sync, 'groupState', {});
    if (!groupState[groupName]) {
        groupState[groupName] = { assignedMask: 0 };
        await storage.set(browser.storage.sync, 'groupState', groupState);
    }
    return { success: true, newGroup: groupName };
}

export async function subscribeToGroupDirect(groupName) {
    let subscriptions = await storage.get(browser.storage.local, 'mySubscriptions', []);
    let groupBits = await storage.get(browser.storage.local, 'myGroupBits', {});
    if (subscriptions.includes(groupName)) return { success: false, message: 'Already subscribed.' };
    const groupState = await storage.get(browser.storage.sync, 'groupState', {});
    const state = groupState[groupName] || { assignedMask: 0, assignedCount: 0 };
    const bitPosition = getNextAvailableBitPosition(state.assignedMask);
    if (bitPosition === -1) {
        return { success: false, message: 'Group is full (15 devices max).' };
    }
    const myBit = 1 << bitPosition;
    state.assignedMask |= myBit;
    groupState[groupName] = state;
    await storage.set(browser.storage.sync, 'groupState', groupState);
    subscriptions.push(groupName);
    subscriptions.sort();
    groupBits[groupName] = myBit;
    await storage.set(browser.storage.local, 'mySubscriptions', subscriptions);
    await storage.set(browser.storage.local, 'myGroupBits', groupBits);
    const instanceId = await storage.get(browser.storage.local, 'myInstanceId');
    const deviceRegistry = await storage.get(browser.storage.sync, 'deviceRegistry', {});
    if (!deviceRegistry[instanceId]) deviceRegistry[instanceId] = { name: '', lastSeen: Date.now(), groupBits: {} };
    deviceRegistry[instanceId].groupBits[groupName] = myBit;
    deviceRegistry[instanceId].lastSeen = Date.now();
    await storage.set(browser.storage.sync, 'deviceRegistry', deviceRegistry);
    return { success: true, subscribedGroup: groupName, assignedBit: myBit };
}

export async function unsubscribeFromGroupDirect(groupName) {
    let subscriptions = await storage.get(browser.storage.local, 'mySubscriptions', []);
    let groupBits = await storage.get(browser.storage.local, 'myGroupBits', {});
    if (!subscriptions.includes(groupName)) return { success: false, message: 'Not subscribed.' };
    const removedBit = groupBits[groupName];
    subscriptions = subscriptions.filter(g => g !== groupName);
    delete groupBits[groupName];
    await storage.set(browser.storage.local, 'mySubscriptions', subscriptions);
    await storage.set(browser.storage.local, 'myGroupBits', groupBits);
    const groupState = await storage.get(browser.storage.sync, 'groupState', {});
    if (groupState[groupName]) {
        groupState[groupName].assignedMask &= ~removedBit;
        await storage.set(browser.storage.sync, 'groupState', groupState);
    }
    const instanceId = await storage.get(browser.storage.local, 'myInstanceId');
    const deviceRegistry = await storage.get(browser.storage.sync, 'deviceRegistry', {});
    if (deviceRegistry[instanceId] && deviceRegistry[instanceId].groupBits) {
        delete deviceRegistry[instanceId].groupBits[groupName];
        await storage.set(browser.storage.sync, 'deviceRegistry', deviceRegistry);
    }
    return { success: true, unsubscribedGroup: groupName };
}

export async function createAndStoreGroupTask(groupName, tabData, senderBit) {
    const taskId = (globalThis.crypto && globalThis.crypto.randomUUID) ? globalThis.crypto.randomUUID() : 'mock-task-id';
    const groupTasks = await storage.get(browser.storage.sync, 'groupTasks', {});
    if (!groupTasks[groupName]) groupTasks[groupName] = {};
    groupTasks[groupName][taskId] = {
        url: tabData.url,
        title: tabData.title || tabData.url,
        processedMask: senderBit,
        creationTimestamp: Date.now()
    };
    await storage.set(browser.storage.sync, 'groupTasks', groupTasks);
    return { success: true };
}

export async function sendTabToGroupDirect(groupName, tabData) {
    const groupBits = await storage.get(browser.storage.local, 'myGroupBits', {});
    const senderBit = groupBits[groupName] || 0;
    return await createAndStoreGroupTask(groupName, tabData, senderBit);
}

// Refactor deleteGroupDirect to use removeFromList and removeObjectKey
export async function deleteGroupDirect(groupName) {
    await removeFromList(browser.storage.sync, 'definedGroups', groupName);
    await removeObjectKey(browser.storage.sync, 'groupState', groupName);
    await removeObjectKey(browser.storage.sync, 'groupTasks', groupName);
    // Remove groupBits from all devices in registry
    const registry = await storage.get(browser.storage.sync, 'deviceRegistry', {});
    for (const deviceId in registry) {
        if (registry[deviceId]?.groupBits?.[groupName] !== undefined) {
            delete registry[deviceId].groupBits[groupName];
        }
    }
    await storage.set(browser.storage.sync, 'deviceRegistry', registry);
    await removeFromList(browser.storage.local, 'mySubscriptions', groupName);
    await removeObjectKey(browser.storage.local, 'myGroupBits', groupName);
    return { success: true, deletedGroup: groupName };
}

// Refactor renameGroupDirect to use renameInList and updateObjectKey
export async function renameGroupDirect(oldName, newName) {
    const definedGroups = await storage.get(browser.storage.sync, 'definedGroups', []);
    if (!definedGroups.includes(oldName)) return { success: false, message: 'Group does not exist.' };
    if (definedGroups.includes(newName)) return { success: false, message: 'A group with that name already exists.' };
    await renameInList(browser.storage.sync, 'definedGroups', oldName, newName);
    await updateObjectKey(browser.storage.sync, 'groupState', oldName, newName);
    await updateObjectKey(browser.storage.sync, 'groupTasks', oldName, newName);
    // Update groupBits in all devices in registry
    const registry = await storage.get(browser.storage.sync, 'deviceRegistry', {});
    for (const deviceId in registry) {
        if (registry[deviceId]?.groupBits?.[oldName] !== undefined) {
            const bit = registry[deviceId].groupBits[oldName];
            delete registry[deviceId].groupBits[oldName];
            registry[deviceId].groupBits[newName] = bit;
        }
    }
    await storage.set(browser.storage.sync, 'deviceRegistry', registry);
    await updateObjectKey(browser.storage.local, 'myGroupBits', oldName, newName);
    await renameInList(browser.storage.local, 'mySubscriptions', oldName, newName);
    return { success: true };
}

export async function renameDeviceDirect(deviceId, newName) {
    try {
    const deviceRegistry = await storage.get(browser.storage.sync, 'deviceRegistry', {});
    if (!deviceRegistry[deviceId]) return { success: false, message: 'Device not found.' };
    deviceRegistry[deviceId].name = newName.trim();
    await storage.set(browser.storage.sync, 'deviceRegistry', deviceRegistry);
    const instanceId = await storage.get(browser.storage.local, 'myInstanceId');
    if (deviceId === instanceId) {
        await storage.set(browser.storage.local, 'myInstanceName', newName.trim());
    }
    return { success: true, newName: newName.trim() };
} catch (error) {
    console.error("Error in renameDeviceDirect:", error);
    return { success: false, message: error.message || "Failed to rename device directly." };
}
}

export async function deleteDeviceDirect(deviceId) {
    const deviceRegistry = await storage.get(browser.storage.sync, 'deviceRegistry', {});
    if (!deviceRegistry[deviceId]) return { success: false, message: 'Device not found.' }; // Early exit if device not found
    const groupBits = deviceRegistry[deviceId].groupBits || {};
    delete deviceRegistry[deviceId];
    await storage.set(browser.storage.sync, 'deviceRegistry', deviceRegistry); // Update registry
    const groupState = await storage.get(browser.storage.sync, 'groupState', {});
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
        await storage.set(browser.storage.sync, 'groupState', groupState);
    }
    // Remove local data if this is the current device
    const localId = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.INSTANCE_ID);
    if (deviceId === localId) {
        await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []);
        await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.GROUP_BITS, {});
    }
    return { success: true };
}

export async function processIncomingTabs(state, openTabFn, updateProcessedTasksFn) {
    if (!state || !state.definedGroups || !state.groupBits || !state.subscriptions) return;
    const groupTasks = await browser.storage.sync.get(SYNC_STORAGE_KEYS.GROUP_TASKS).then(r => r[SYNC_STORAGE_KEYS.GROUP_TASKS] || {});
    let localProcessedTasks = await browser.storage.local.get(LOCAL_STORAGE_KEYS.PROCESSED_TASKS).then(r => r[LOCAL_STORAGE_KEYS.PROCESSED_TASKS] || {});
    let processedTasksUpdateBatch = {};
    let groupTasksSyncUpdates = {}; // Batch sync updates
    let needsSyncUpdate = false;

    for (const groupName of state.subscriptions) {
        const myBit = state.groupBits[groupName];
        if (!myBit) continue;
        if (!groupTasks[groupName]) continue;
        for (const taskId in groupTasks[groupName]) {
            const task = groupTasks[groupName][taskId];
            if (!localProcessedTasks[taskId] && !((task.processedMask & myBit) === myBit)) {
                try {
                    await openTabFn(task.url, task.title);
                } catch (e) {
                    console.error(`Failed to open tab for task ${taskId} (URL: ${task.url}):`, e);
                }
                processedTasksUpdateBatch[taskId] = true;
                // Mark as processed in sync
                const newProcessedMask = task.processedMask | myBit;
                if (newProcessedMask !== task.processedMask) { // Only update if mask changed
                    if (!groupTasksSyncUpdates[groupName]) {
                        groupTasksSyncUpdates[groupName] = {};
                    }
                    // Store only the changed mask for merging
                    groupTasksSyncUpdates[groupName][taskId] = { processedMask: newProcessedMask };
                    needsSyncUpdate = true;
                }
            }
        }
    }
    if (Object.keys(processedTasksUpdateBatch).length > 0) {
        await updateProcessedTasksFn({ ...localProcessedTasks, ...processedTasksUpdateBatch });
    }
    if (needsSyncUpdate) {
        await mergeSyncStorage(SYNC_STORAGE_KEYS.GROUP_TASKS, groupTasksSyncUpdates);
    }
}

export async function subscribeToGroupUnified(groupName, isAndroidPlatform) {
    if (isAndroidPlatform) {
        return await subscribeToGroupDirect(groupName);
    } else {
        return await browser.runtime.sendMessage({ action: 'subscribeToGroup', groupName });
    }
}

export async function unsubscribeFromGroupUnified(groupName, isAndroidPlatform) {
    if (isAndroidPlatform) {
        return await unsubscribeFromGroupDirect(groupName);
    } else {
        return await browser.runtime.sendMessage({ action: 'unsubscribeFromGroup', groupName });
    }
}

// --- Modernize Async Patterns: Use Promise.all for parallel async operations ---
// getUnifiedState: already uses Promise.all for Android, but not for non-Android
export async function getUnifiedState(isAndroidPlatform) {
    if (isAndroidPlatform) {
        const [instanceId, instanceName, subscriptions, groupBits, definedGroups, groupState, deviceRegistry] = await Promise.all([
            browser.storage.local.get(LOCAL_STORAGE_KEYS.INSTANCE_ID).then(r => r[LOCAL_STORAGE_KEYS.INSTANCE_ID]),
            browser.storage.local.get(LOCAL_STORAGE_KEYS.INSTANCE_NAME).then(r => r[LOCAL_STORAGE_KEYS.INSTANCE_NAME]),
            browser.storage.local.get(LOCAL_STORAGE_KEYS.SUBSCRIPTIONS).then(r => r[LOCAL_STORAGE_KEYS.SUBSCRIPTIONS] || []),
            browser.storage.local.get(LOCAL_STORAGE_KEYS.GROUP_BITS).then(r => r[LOCAL_STORAGE_KEYS.GROUP_BITS] || {}),
            browser.storage.sync.get(SYNC_STORAGE_KEYS.DEFINED_GROUPS).then(r => r[SYNC_STORAGE_KEYS.DEFINED_GROUPS] || []),
            browser.storage.sync.get(SYNC_STORAGE_KEYS.GROUP_STATE).then(r => r[SYNC_STORAGE_KEYS.GROUP_STATE] || {}),
            browser.storage.sync.get(SYNC_STORAGE_KEYS.DEVICE_REGISTRY).then(r => r[SYNC_STORAGE_KEYS.DEVICE_REGISTRY] || {})
        ]);
        return {
            instanceId,
            instanceName,
            subscriptions,
            groupBits,
            definedGroups,
            groupState,
            deviceRegistry
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
            deviceRegistry
        ] = await Promise.all([
            storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.INSTANCE_ID),
            storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.INSTANCE_NAME),
            storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []),
            storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.GROUP_BITS, {}),
            storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS, []),
            storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, {}),
            storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {})
        ]);
        return {
            instanceId,
            instanceName,
            subscriptions,
            groupBits,
            definedGroups,
            groupState,
            deviceRegistry
        };
    }
}

export async function renameDeviceUnified(deviceId, newName, isAndroidPlatform) {
    if (isAndroidPlatform) {
        return await renameDeviceDirect(deviceId, newName);
    } else {
        return await browser.runtime.sendMessage({ action: 'renameDevice', deviceId, newName });
    }
}

// --- Generic Storage List/Object Updaters ---
export async function updateListInStorage(area, key, updater, defaultValue = []) {
    const list = await storage.get(area, key, defaultValue);
    const updated = updater(Array.isArray(list) ? list : defaultValue);
    await storage.set(area, key, updated);
    return updated;
}

export async function updateObjectInStorage(area, key, updater, defaultValue = {}) {
    const obj = await storage.get(area, key, defaultValue);
    const updated = updater(obj && typeof obj === 'object' ? obj : defaultValue);
    await storage.set(area, key, updated);
    return updated;
}

// --- Standardized Error Handling and User Feedback ---
export const showError = (message, area = null) => {
    if (area) {
        area.textContent = message;
        area.className = 'error';
        area.classList.remove('hidden');
    } else if (typeof browser !== 'undefined' && browser.notifications) {
        browser.notifications.create({
            type: 'basic',
            iconUrl: browser.runtime.getURL('icons/icon-48.png'),
            title: STRINGS.error,
            message: message
        });
    } else {
        alert(message);
    }
}


// --- Background logic shared for background.js and tests ---
export async function performHeartbeat(localInstanceId, localInstanceName, localGroupBits, cachedDeviceRegistry) {
    if (!localInstanceId) {
        console.warn("Heartbeat skipped: Instance ID not available yet.");
        return;
    }
    console.log("Performing heartbeat...");
    const update = {
        [localInstanceId]: {
            name: localInstanceName,
            lastSeen: Date.now(),
            groupBits: localGroupBits
        }
    };
    const success = await mergeSyncStorage(SYNC_STORAGE_KEYS.DEVICE_REGISTRY, update);
    if (success && cachedDeviceRegistry) {
        cachedDeviceRegistry = deepMerge(cachedDeviceRegistry, update);
    }
    console.log("Heartbeat complete.");
}

export async function performStaleDeviceCheck(cachedDeviceRegistry, cachedGroupState) {
    console.log("Performing stale device check...");
    let registry = cachedDeviceRegistry ?? await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {});
    let groupState = cachedGroupState ?? await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, {});
    const now = Date.now();
    let registryUpdates = {};
    let groupStateUpdates = {};
    let needsRegistryUpdate = false;
    let needsGroupStateUpdate = false;
    for (const deviceId in registry) {
        if (now - registry[deviceId].lastSeen > 1000 * 60 * 60 * 24 * 30) { // 30 days
            console.log(`Device ${deviceId} (${registry[deviceId].name}) is stale. Pruning...`);
            needsRegistryUpdate = true;
            registryUpdates[deviceId] = null;
            const staleDeviceBits = registry[deviceId].groupBits || {};
            for (const groupName in staleDeviceBits) {
                const staleBit = staleDeviceBits[groupName];
                if (groupState[groupName] && staleBit !== undefined) {
                    const currentAssignedMask = groupState[groupName].assignedMask;
                    const newAssignedMask = currentAssignedMask & ~staleBit;
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
            cachedDeviceRegistry = deepMerge(cachedDeviceRegistry, registryUpdates);
        }
    }
    if (needsGroupStateUpdate) {
        groupStateMergeSuccess = await mergeSyncStorage(SYNC_STORAGE_KEYS.GROUP_STATE, groupStateUpdates);
        if (groupStateMergeSuccess && cachedGroupState) {
            cachedGroupState = deepMerge(cachedGroupState, groupStateUpdates);
        }
    }
    console.log("Stale device check complete.");
}

export async function performTimeBasedTaskCleanup(localProcessedTasks) {
    console.log("Performing time-based task cleanup...");
    const allGroupTasks = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_TASKS, {});
    let groupTasksUpdates = {};
    let needsUpdate = false;
    const now = Date.now();
    let processedTasksChanged = false; // Track if local processed tasks need saving
    let currentProcessedTasks = { ...localProcessedTasks }; // Work on a copy

    for (const groupName in allGroupTasks) {
        for (const taskId in allGroupTasks[groupName]) {
            const task = allGroupTasks[groupName][taskId];
            if (now - task.creationTimestamp > 1000 * 60 * 60 * 24 * 14) { // 14 days
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

    console.log(`[Cleanup] Before final local set: processedTasksChanged=${processedTasksChanged}, currentProcessedTasks=`, JSON.stringify(currentProcessedTasks));

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
        await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.PROCESSED_TASKS, currentProcessedTasks);
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
            if (key === LOCAL_STORAGE_KEYS.GROUP_BITS || key === SYNC_STORAGE_KEYS.GROUP_STATE || key === SYNC_STORAGE_KEYS.DEVICE_REGISTRY) {
                value = ensureObject(value, defaultValue ?? {});
            } else if (key === LOCAL_STORAGE_KEYS.SUBSCRIPTIONS || key === SYNC_STORAGE_KEYS.DEFINED_GROUPS) {
                value = ensureArray(value, defaultValue ?? []);
            } else if (key === LOCAL_STORAGE_KEYS.INSTANCE_ID || key === LOCAL_STORAGE_KEYS.INSTANCE_NAME) {
                value = ensureString(value, defaultValue ?? '');
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
            const currentDataObj = await this.get(area, key, {}); // Fetch fresh data
            const mergedData = deepMerge(currentDataObj, updates);

            // Only set if data actually changed
            if (JSON.stringify(currentDataObj) !== JSON.stringify(mergedData)) {
                console.log(`[storage.merge] Data changed for key "${key}", setting...`, mergedData);
                await area.set({ [key]: mergedData }); // Ensure await here
            } else {
                console.log(`[storage.merge] Skipped setting ${key} as merge resulted in no change.`);
            }
            return true;
        } catch (error) {
            console.error(`Error merging ${key}:`, error, 'Updates:', updates);
            return false;
        }
    }
};

// --- Generic Group/Device Logic Helpers ---
export async function addToList(area, key, value) {
    const list = await storage.get(area, key, []);
    if (!list.includes(value)) {
        list.push(value);
        list.sort();
        await storage.set(area, key, list);
    }
    return list;
}

export async function removeFromList(area, key, value) {
    const list = await storage.get(area, key, []);
    const updated = list.filter(item => item !== value);
    await storage.set(area, key, updated);
    return updated;
}

export async function renameInList(area, key, oldValue, newValue) {
    const list = await storage.get(area, key, []);
    const updated = list.map(item => item === oldValue ? newValue : item);
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

// --- Minimal State Management ---
export const globalState = {
    state: {},
    listeners: [],
    setState(partial) {
        this.state = { ...this.state, ...partial };
        this.listeners.forEach(fn => fn(this.state));
    },
    subscribe(fn) {
        this.listeners.push(fn);
        return () => {
            this.listeners = this.listeners.filter(l => l !== fn);
        };
    }
};

// --- Debounce Utility ---
export function debounce(fn, delay) {
    let timer = null;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}
