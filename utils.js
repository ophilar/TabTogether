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

export async function isAndroid() {
    try {
        const info = await getPlatformInfo();
        return info.os === "android";
    } catch {
        return false;
    }
}

// --- Type Safety and Validation Helpers ---
function ensureObject(val, fallback = {}) {
    return (val && typeof val === 'object' && !Array.isArray(val)) ? val : fallback;
}
function ensureArray(val, fallback = []) {
    return Array.isArray(val) ? val : fallback;
}
function ensureString(val, fallback = '') {
    return typeof val === 'string' ? val : fallback;
}

// --- Storage Access Helpers ---
export async function getFromStorage(area, key, defaultValue = null) {
    try {
        const result = await area.get(key);
        let value = result?.[key] ?? defaultValue;
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
}

export async function setInStorage(area, key, value) {
    try {
        await area.set({ [key]: value });
        return true;
    } catch (e) {
        console.error(`Error setting ${key}:`, e);
        return false;
    }
}

// Update all usages below to use getFromStorage/setInStorage
export async function getStorage(area, key, defaultValue = null) {
    // Deprecated: use getFromStorage
    return getFromStorage(area, key, defaultValue);
}

// Safely merges updates into potentially large objects in storage.sync
// Avoids race conditions where concurrent updates overwrite each other.
export async function mergeSyncStorage(key, updates) {
    try {
        const currentData = await getStorage(browser.storage.sync, key, {});
        // Basic deep merge (can be improved for arrays if needed)
        const mergedData = deepMerge(currentData, updates);
        await browser.storage.sync.set({ [key]: mergedData });
        console.log(`Merged data for key "${key}"`, updates);
        return true;
    } catch (error) {
        console.error(`Error merging ${key} in sync storage:`, error, "Updates:", updates);
        return false;
    }
}

// Simple deep merge utility (adjust if complex array merging is needed)
export function deepMerge(target, source) {
    const output = { ...target };
    if (isObject(target) && isObject(source)) {
        Object.keys(source).forEach(key => {
            // Handle null explicitly: if source[key] is null, it means delete the key in the target
            if (source[key] === null) {
                 delete output[key];
            } else if (isObject(source[key])) {
                if (!(key in target)) {
                    // If key doesn't exist in target, assign source's object directly
                    Object.assign(output, { [key]: source[key] });
                } else {
                    // If key exists in target, only merge if target's value is also an object
                    if (isObject(target[key])) {
                         output[key] = deepMerge(target[key], source[key]);
                    } else {
                         // Overwrite if target key exists but isn't an object
                         output[key] = source[key];
                    }
                }
            } else {
                // Assign non-object values directly (overwriting target)
                Object.assign(output, { [key]: source[key] });
            }
        });
    }
    return output;
}

export function isObject(item) {
    return !!item && typeof item === 'object' && !Array.isArray(item);
}

// --- Instance ID/Name ---
// Store device name and ID in both local and sync storage for persistence
export async function getInstanceId(cryptoDep = crypto) {
    let id = await getFromStorage(browser.storage.local, LOCAL_STORAGE_KEYS.INSTANCE_ID);
    if (!id) {
        id = await getFromStorage(browser.storage.sync, LOCAL_STORAGE_KEYS.INSTANCE_ID);
        if (!id) {
            id = cryptoDep.randomUUID();
            await setInStorage(browser.storage.sync, LOCAL_STORAGE_KEYS.INSTANCE_ID, id);
        }
        await setInStorage(browser.storage.local, LOCAL_STORAGE_KEYS.INSTANCE_ID, id);
    }
    await setInStorage(browser.storage.sync, LOCAL_STORAGE_KEYS.INSTANCE_ID, id);
    return id;
}

export async function getInstanceName() {
    let name = await getFromStorage(browser.storage.local, LOCAL_STORAGE_KEYS.INSTANCE_NAME);
    if (!name) {
        name = await getFromStorage(browser.storage.sync, LOCAL_STORAGE_KEYS.INSTANCE_NAME);
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
            await setInStorage(browser.storage.sync, LOCAL_STORAGE_KEYS.INSTANCE_NAME, name);
        }
        await setInStorage(browser.storage.local, LOCAL_STORAGE_KEYS.INSTANCE_NAME, name);
    }
    await setInStorage(browser.storage.sync, LOCAL_STORAGE_KEYS.INSTANCE_NAME, name);
    return name;
}

// --- Bitmask Helpers ---
export function getNextAvailableBitPosition(mask) {
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
function html(strings, ...values) {
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

export function renderDeviceName(container, name) {
    container.textContent = name || STRINGS.deviceNameNotSet;
}

export function renderSubscriptions(container, subscriptions) {
    if (!subscriptions || subscriptions.length === 0) {
        container.textContent = STRINGS.notSubscribed;
        return;
    }
    container.textContent = STRINGS.subscribedGroups + subscriptions.join(', ');
}

// Utility: Platform info and feature support
export async function getPlatformInfo() {
    try {
        return await browser.runtime.getPlatformInfo();
    } catch {
        return { os: 'unknown' };
    }
}

export async function isDesktop() {
    const info = await getPlatformInfo();
    return info.os === "win" || info.os === "mac" || info.os === "linux";
}

// Utility: Show Android banner
export function showAndroidBanner(container, msg) {
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
export function setLastSyncTime(container, date) {
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
    function addLine(label, value) {
        const line = document.createElement('div');
        line.textContent = `${label}: ${value}`;
        debugDiv.appendChild(line);
    }
    addLine('Instance ID', state?.instanceId || '-');
    addLine('Instance Name', state?.instanceName || '-');
    addLine('Subscriptions', state?.subscriptions ? JSON.stringify(state.subscriptions) : '-');
    addLine('Group Bits', state?.groupBits ? JSON.stringify(state.groupBits) : '-');
    addLine('Defined Groups', state?.definedGroups ? JSON.stringify(state.definedGroups) : '-');
    addLine('Device Registry', state?.deviceRegistry ? JSON.stringify(state.deviceRegistry) : '-');
    addLine('Group State', state?.groupState ? JSON.stringify(state.groupState) : '-');
}

// Export direct storage helpers for tests and Android logic
export async function createGroupDirect(groupName) {
    const updatedGroups = await updateListInStorage(
        browser.storage.sync,
        'definedGroups',
        (groups) => {
            if (groups.includes(groupName)) return groups;
            return [...groups, groupName].sort();
        }
    );
    const groupState = await getFromStorage(browser.storage.sync, 'groupState', {});
    if (!groupState[groupName]) {
        groupState[groupName] = { assignedMask: 0 };
        await setInStorage(browser.storage.sync, 'groupState', groupState);
    }
    return { success: true, newGroup: groupName };
}

export async function subscribeToGroupDirect(groupName) {
    let subscriptions = await getFromStorage(browser.storage.local, 'mySubscriptions', []);
    let groupBits = await getFromStorage(browser.storage.local, 'myGroupBits', {});
    if (subscriptions.includes(groupName)) return { success: false, message: 'Already subscribed.' };
    const groupState = await getFromStorage(browser.storage.sync, 'groupState', {});
    const state = groupState[groupName] || { assignedMask: 0, assignedCount: 0 };
    const bitPosition = getNextAvailableBitPosition(state.assignedMask);
    if (bitPosition === -1) {
        return { success: false, message: 'Group is full (15 devices max).' };
    }
    const myBit = 1 << bitPosition;
    state.assignedMask |= myBit;
    groupState[groupName] = state;
    await setInStorage(browser.storage.sync, 'groupState', groupState);
    subscriptions.push(groupName);
    subscriptions.sort();
    groupBits[groupName] = myBit;
    await setInStorage(browser.storage.local, 'mySubscriptions', subscriptions);
    await setInStorage(browser.storage.local, 'myGroupBits', groupBits);
    const instanceId = await getFromStorage(browser.storage.local, 'myInstanceId');
    const deviceRegistry = await getFromStorage(browser.storage.sync, 'deviceRegistry', {});
    if (!deviceRegistry[instanceId]) deviceRegistry[instanceId] = { name: '', lastSeen: Date.now(), groupBits: {} };
    deviceRegistry[instanceId].groupBits[groupName] = myBit;
    deviceRegistry[instanceId].lastSeen = Date.now();
    await setInStorage(browser.storage.sync, 'deviceRegistry', deviceRegistry);
    return { success: true, subscribedGroup: groupName, assignedBit: myBit };
}

export async function unsubscribeFromGroupDirect(groupName) {
    let subscriptions = await getFromStorage(browser.storage.local, 'mySubscriptions', []);
    let groupBits = await getFromStorage(browser.storage.local, 'myGroupBits', {});
    if (!subscriptions.includes(groupName)) return { success: false, message: 'Not subscribed.' };
    const removedBit = groupBits[groupName];
    subscriptions = subscriptions.filter(g => g !== groupName);
    delete groupBits[groupName];
    await setInStorage(browser.storage.local, 'mySubscriptions', subscriptions);
    await setInStorage(browser.storage.local, 'myGroupBits', groupBits);
    const groupState = await getFromStorage(browser.storage.sync, 'groupState', {});
    if (groupState[groupName]) {
        groupState[groupName].assignedMask &= ~removedBit;
        await setInStorage(browser.storage.sync, 'groupState', groupState);
    }
    const instanceId = await getFromStorage(browser.storage.local, 'myInstanceId');
    const deviceRegistry = await getFromStorage(browser.storage.sync, 'deviceRegistry', {});
    if (deviceRegistry[instanceId] && deviceRegistry[instanceId].groupBits) {
        delete deviceRegistry[instanceId].groupBits[groupName];
        await setInStorage(browser.storage.sync, 'deviceRegistry', deviceRegistry);
    }
    return { success: true, unsubscribedGroup: groupName };
}

export async function createAndStoreGroupTask(groupName, tabData, senderBit) {
    const taskId = (globalThis.crypto && globalThis.crypto.randomUUID) ? globalThis.crypto.randomUUID() : 'mock-task-id';
    const groupTasks = await getFromStorage(browser.storage.sync, 'groupTasks', {});
    if (!groupTasks[groupName]) groupTasks[groupName] = {};
    groupTasks[groupName][taskId] = {
        url: tabData.url,
        title: tabData.title || tabData.url,
        processedMask: senderBit,
        creationTimestamp: Date.now()
    };
    await setInStorage(browser.storage.sync, 'groupTasks', groupTasks);
    return { success: true };
}

export async function sendTabToGroupDirect(groupName, tabData) {
    const groupBits = await getFromStorage(browser.storage.local, 'myGroupBits', {});
    const senderBit = groupBits[groupName] || 0;
    return await createAndStoreGroupTask(groupName, tabData, senderBit);
}

export async function deleteGroupDirect(groupName) {
    await updateListInStorage(
        browser.storage.sync,
        'definedGroups',
        (groups) => groups.filter(g => g !== groupName)
    );
    await updateObjectInStorage(
        browser.storage.sync,
        'groupState',
        (state) => { delete state[groupName]; return state; }
    );
    await updateObjectInStorage(
        browser.storage.sync,
        'groupTasks',
        (tasks) => { delete tasks[groupName]; return tasks; }
    );
    await updateObjectInStorage(
        browser.storage.sync,
        'deviceRegistry',
        (registry) => {
            for (const deviceId in registry) {
                if (registry[deviceId]?.groupBits?.[groupName] !== undefined) {
                    delete registry[deviceId].groupBits[groupName];
                }
            }
            return registry;
        }
    );
    await updateListInStorage(
        browser.storage.local,
        'mySubscriptions',
        (subs) => subs.filter(g => g !== groupName)
    );
    await updateObjectInStorage(
        browser.storage.local,
        'myGroupBits',
        (bits) => { delete bits[groupName]; return bits; }
    );
    return { success: true, deletedGroup: groupName };
}

export async function renameGroupDirect(oldName, newName) {
    const definedGroups = await getFromStorage(browser.storage.sync, 'definedGroups', []);
    if (!definedGroups.includes(oldName)) return { success: false, message: 'Group does not exist.' };
    if (definedGroups.includes(newName)) return { success: false, message: 'A group with that name already exists.' };
    await updateListInStorage(
        browser.storage.sync,
        'definedGroups',
        (groups) => groups.map(g => g === oldName ? newName : g)
    );
    await updateObjectInStorage(
        browser.storage.sync,
        'groupState',
        (state) => {
            if (state[oldName]) {
                state[newName] = state[oldName];
                delete state[oldName];
            }
            return state;
        }
    );
    await updateObjectInStorage(
        browser.storage.sync,
        'groupTasks',
        (tasks) => {
            if (tasks[oldName]) {
                tasks[newName] = tasks[oldName];
                delete tasks[oldName];
            }
            return tasks;
        }
    );
    await updateObjectInStorage(
        browser.storage.sync,
        'deviceRegistry',
        (registry) => {
            for (const deviceId in registry) {
                if (registry[deviceId]?.groupBits?.[oldName] !== undefined) {
                    const bit = registry[deviceId].groupBits[oldName];
                    delete registry[deviceId].groupBits[oldName];
                    registry[deviceId].groupBits[newName] = bit;
                }
            }
            return registry;
        }
    );
    await updateObjectInStorage(
        browser.storage.local,
        'myGroupBits',
        (bits) => {
            if (bits[oldName] !== undefined) {
                bits[newName] = bits[oldName];
                delete bits[oldName];
            }
            return bits;
        }
    );
    await updateListInStorage(
        browser.storage.local,
        'mySubscriptions',
        (subs) => subs.map(g => g === oldName ? newName : g)
    );
    return { success: true };
}

export async function renameDeviceDirect(deviceId, newName) {
    const deviceRegistry = await getFromStorage(browser.storage.sync, 'deviceRegistry', {});
    if (!deviceRegistry[deviceId]) return { success: false, message: 'Device not found.' };
    deviceRegistry[deviceId].name = newName.trim();
    await setInStorage(browser.storage.sync, 'deviceRegistry', deviceRegistry);
    const instanceId = await getFromStorage(browser.storage.local, 'myInstanceId');
    if (deviceId === instanceId) {
        await setInStorage(browser.storage.local, 'myInstanceName', newName.trim());
    }
    return { success: true };
}

export async function deleteDeviceDirect(deviceId) {
    const deviceRegistry = await getFromStorage(browser.storage.sync, 'deviceRegistry', {});
    if (!deviceRegistry[deviceId]) return { success: false, message: 'Device not found.' };
    const groupBits = deviceRegistry[deviceId].groupBits || {};
    delete deviceRegistry[deviceId];
    await setInStorage(browser.storage.sync, 'deviceRegistry', deviceRegistry);
    const groupState = await getFromStorage(browser.storage.sync, 'groupState', {});
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
        await setInStorage(browser.storage.sync, 'groupState', groupState);
    }
    return { success: true };
}

export async function processIncomingTabs(state, openTabFn, updateProcessedTasksFn) {
    if (!state || !state.definedGroups || !state.groupBits || !state.subscriptions) return;
    const groupTasks = await browser.storage.sync.get(SYNC_STORAGE_KEYS.GROUP_TASKS).then(r => r[SYNC_STORAGE_KEYS.GROUP_TASKS] || {});
    let localProcessedTasks = await browser.storage.local.get(LOCAL_STORAGE_KEYS.PROCESSED_TASKS).then(r => r[LOCAL_STORAGE_KEYS.PROCESSED_TASKS] || {});
    let processedTasksUpdateBatch = {};
    for (const groupName of state.subscriptions) {
        const myBit = state.groupBits[groupName];
        if (!myBit) continue;
        if (!groupTasks[groupName]) continue;
        for (const taskId in groupTasks[groupName]) {
            const task = groupTasks[groupName][taskId];
            if (!localProcessedTasks[taskId] && !((task.processedMask & myBit) === myBit)) {
                try {
                    await openTabFn(task.url, task.title);
                } catch (e) {}
                processedTasksUpdateBatch[taskId] = true;
                // Mark as processed in sync
                const newProcessedMask = task.processedMask | myBit;
                const taskUpdate = { [groupName]: { [taskId]: { processedMask: newProcessedMask } } };
                await browser.storage.sync.set({ [SYNC_STORAGE_KEYS.GROUP_TASKS]: {
                    ...groupTasks,
                    [groupName]: {
                        ...groupTasks[groupName],
                        [taskId]: { ...task, processedMask: newProcessedMask }
                    }
                }});
            }
        }
    }
    if (Object.keys(processedTasksUpdateBatch).length > 0) {
        await updateProcessedTasksFn({ ...localProcessedTasks, ...processedTasksUpdateBatch });
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
            getFromStorage(browser.storage.local, LOCAL_STORAGE_KEYS.INSTANCE_ID),
            getFromStorage(browser.storage.local, LOCAL_STORAGE_KEYS.INSTANCE_NAME),
            getFromStorage(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []),
            getFromStorage(browser.storage.local, LOCAL_STORAGE_KEYS.GROUP_BITS, {}),
            getFromStorage(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS, []),
            getFromStorage(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, {}),
            getFromStorage(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {})
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
    const list = await getFromStorage(area, key, defaultValue);
    const updated = updater(Array.isArray(list) ? list : defaultValue);
    await setInStorage(area, key, updated);
    return updated;
}

export async function updateObjectInStorage(area, key, updater, defaultValue = {}) {
    const obj = await getFromStorage(area, key, defaultValue);
    const updated = updater(obj && typeof obj === 'object' ? obj : defaultValue);
    await setInStorage(area, key, updated);
    return updated;
}

// Apply batched sync updates for processed tasks
// if (Object.keys(groupTasksUpdates).length > 0) {
//     await mergeSyncStorage(SYNC_STORAGE_KEYS.GROUP_TASKS, groupTasksUpdates);
// }