// utils.js

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

// --- Storage Access Helpers ---

async function getStorage(area, key, defaultValue = null) {
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
async function mergeSyncStorage(key, updates) {
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
function deepMerge(target, source) {
    const output = { ...target };
    if (isObject(target) && isObject(source)) {
        Object.keys(source).forEach(key => {
            if (isObject(source[key])) {
                if (!(key in target)) {
                    Object.assign(output, { [key]: source[key] });
                } else {
                    // Ensure we don't merge into null or non-objects
                    if (isObject(target[key])) {
                         output[key] = deepMerge(target[key], source[key]);
                    } else {
                         // Overwrite if target key exists but isn't an object
                         output[key] = source[key];
                    }
                }
            } else {
                Object.assign(output, { [key]: source[key] });
            }
        });
    }
    return output;
}

function isObject(item) {
    return (item && typeof item === 'object' && !Array.isArray(item));
}


// --- Instance ID/Name ---
async function getInstanceId() {
    let id = await getStorage(browser.storage.local, LOCAL_STORAGE_KEYS.INSTANCE_ID);
    if (!id) {
        id = crypto.randomUUID();
        await browser.storage.local.set({ [LOCAL_STORAGE_KEYS.INSTANCE_ID]: id });
        console.log("Generated new instance ID:", id);
    }
    return id;
}

async function getInstanceName() {
    let name = await getStorage(browser.storage.local, LOCAL_STORAGE_KEYS.INSTANCE_NAME);
    if (!name) {
        // Try to get platform info for a default name
        try {
            const platformInfo = await browser.runtime.getPlatformInfo();
            name = `${platformInfo.os.charAt(0).toUpperCase() + platformInfo.os.slice(1)} Device`;
        } catch (e) {
            name = "My Device"; // Fallback
        }
        await browser.storage.local.set({ [LOCAL_STORAGE_KEYS.INSTANCE_NAME]: name });
    }
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