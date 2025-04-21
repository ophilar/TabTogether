// utils.js

import { STRINGS } from './constants.js';

const SYNC_STORAGE_KEYS = {
    DEFINED_GROUPS: 'definedGroups', // string[]
    GROUP_STATE: 'groupState',       // { [groupName: string]: { assignedMask: number, assignedCount: number } }
    GROUP_TASKS: 'groupTasks',       // { [groupName: string]: { [taskId: string]: { url: string, title: string, processedMask: number, creationTimestamp: number } } }
    DEVICE_REGISTRY: 'deviceRegistry' // { [deviceUUID: string]: { name: string, lastSeen: number, groupBits: { [groupName: string]: number } } }
};

const LOCAL_STORAGE_KEYS = {
    INSTANCE_ID: 'myInstanceId',         // string (UUID)
    INSTANCE_NAME: 'myInstanceName',     // string
    SUBSCRIPTIONS: 'mySubscriptions',    // string[]
    GROUP_BITS: 'myGroupBits',           // { [groupName: string]: number }
    PROCESSED_TASKS: 'processedTaskIds' // { [taskId: string]: boolean }
};

const MAX_DEVICES_PER_GROUP = 15; // Using 16-bit integers safely (bit 0 to 15)

export async function isAndroid() {
    try {
        const info = await browser.runtime.getPlatformInfo();
        return info.os === "android";
    } catch {
        return false;
    }
}

// --- Storage Access Helpers ---
export async function getStorage(area, key, defaultValue = null) {
    try {
        const result = await area.get(key);
        return result?.[key] ?? defaultValue;
    } catch (error) {
        console.error(`Error getting ${key} from ${area === browser.storage.sync ? 'sync' : 'local'} storage:`, error);
        return defaultValue;
    }
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
    return (item && typeof item === 'object' && !Array.isArray(item));
}


// --- Instance ID/Name ---
// Store device name and ID in both local and sync storage for persistence
export async function getInstanceId() {
    let id = await getStorage(browser.storage.local, LOCAL_STORAGE_KEYS.INSTANCE_ID);
    if (!id) {
        // Try to restore from sync
        id = await getStorage(browser.storage.sync, LOCAL_STORAGE_KEYS.INSTANCE_ID);
        if (!id) {
            id = crypto.randomUUID();
            await browser.storage.sync.set({ [LOCAL_STORAGE_KEYS.INSTANCE_ID]: id });
        }
        await browser.storage.local.set({ [LOCAL_STORAGE_KEYS.INSTANCE_ID]: id });
    }
    // Always keep sync up to date
    await browser.storage.sync.set({ [LOCAL_STORAGE_KEYS.INSTANCE_ID]: id });
    return id;
}

export async function getInstanceName() {
    let name = await getStorage(browser.storage.local, LOCAL_STORAGE_KEYS.INSTANCE_NAME);
    if (!name) {
        // Try to restore from sync
        name = await getStorage(browser.storage.sync, LOCAL_STORAGE_KEYS.INSTANCE_NAME);
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
            await browser.storage.sync.set({ [LOCAL_STORAGE_KEYS.INSTANCE_NAME]: name });
        }
        await browser.storage.local.set({ [LOCAL_STORAGE_KEYS.INSTANCE_NAME]: name });
    }
    // Always keep sync up to date
    await browser.storage.sync.set({ [LOCAL_STORAGE_KEYS.INSTANCE_NAME]: name });
    return name;
}

// --- Bitmask Helpers ---
function getNextAvailableBitPosition(mask) {
    for (let i = 0; i < MAX_DEVICES_PER_GROUP; i++) {
        if (!((mask >> i) & 1)) { // Check if bit i is 0
            return i;
        }
    }
    return -1; // No available bits
}

// utils.js - shared rendering and storage helpers for TabTogether

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
        const li = document.createElement('li');
        li.setAttribute('role', 'listitem');
        if (id === highlightId) li.classList.add('this-device');
        const nameSpan = document.createElement('span');
        nameSpan.textContent = device.name || 'Unnamed Device';
        li.appendChild(nameSpan);
        if (device.lastSeen) {
            const lastSeen = new Date(device.lastSeen);
            const lastSeenSpan = document.createElement('span');
            lastSeenSpan.className = 'small-text';
            lastSeenSpan.style.marginLeft = '10px';
            lastSeenSpan.style.fontSize = '0.95em';
            lastSeenSpan.textContent = `Last seen: ${lastSeen.toLocaleString()}`;
            li.appendChild(lastSeenSpan);
        }
        ul.appendChild(li);
    }
    container.innerHTML = '';
    container.appendChild(ul);
}

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
        const li = document.createElement('li');
        li.setAttribute('role', 'listitem');
        const isSubscribed = subscriptions && subscriptions.includes(groupName);
        const nameSpan = document.createElement('span');
        nameSpan.textContent = groupName;
        nameSpan.className = 'group-name-label';
        nameSpan.title = 'Click to rename';
        nameSpan.style.cursor = 'pointer';
        nameSpan.tabIndex = 0;
        nameSpan.setAttribute('role', 'button');
        nameSpan.setAttribute('aria-label', `Rename group ${groupName}`);
        if (onRename) {
            nameSpan.onclick = () => onRename(groupName, nameSpan);
            nameSpan.onkeydown = (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onRename(groupName, nameSpan);
                }
            };
        }
        li.appendChild(nameSpan);
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'group-actions';
        const subButton = document.createElement('button');
        subButton.textContent = isSubscribed ? 'Unsubscribe' : 'Subscribe';
        subButton.dataset.group = groupName;
        subButton.className = isSubscribed ? 'unsubscribe-btn' : 'subscribe-btn';
        subButton.setAttribute('aria-label', `${isSubscribed ? 'Unsubscribe from' : 'Subscribe to'} group ${groupName}`);
        subButton.addEventListener('click', isSubscribed ? onUnsubscribe : onSubscribe);
        actionsDiv.appendChild(subButton);
        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete';
        deleteButton.className = 'delete-btn';
        deleteButton.dataset.group = groupName;
        deleteButton.title = 'Delete group for all devices';
        deleteButton.setAttribute('aria-label', `Delete group ${groupName}`);
        deleteButton.addEventListener('click', onDelete);
        actionsDiv.appendChild(deleteButton);
        li.appendChild(actionsDiv);
        ul.appendChild(li);
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

export async function isAndroid() {
    const info = await getPlatformInfo();
    return info.os === "android";
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
        container.insertBefore(banner, container.firstChild.nextSibling);
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
    debugDiv.innerHTML =
        '<strong>Debug Info</strong><br>' +
        'Instance ID: ' + (state?.instanceId || '-') + '<br>' +
        'Instance Name: ' + (state?.instanceName || '-') + '<br>' +
        'Subscriptions: ' + (state?.subscriptions ? JSON.stringify(state.subscriptions) : '-') + '<br>' +
        'Group Bits: ' + (state?.groupBits ? JSON.stringify(state.groupBits) : '-') + '<br>' +
        'Defined Groups: ' + (state?.definedGroups ? JSON.stringify(state.definedGroups) : '-') + '<br>' +
        'Device Registry: ' + (state?.deviceRegistry ? JSON.stringify(state.deviceRegistry) : '-') + '<br>' +
        'Group State: ' + (state?.groupState ? JSON.stringify(state.groupState) : '-') + '<br>';
}

export { SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS, MAX_DEVICES_PER_GROUP };
