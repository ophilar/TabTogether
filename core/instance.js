import { storage } from "./storage.js";
import { SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS } from "../common/constants.js";
import { getPlatformInfoCached } from "./platform.js";
import { generateShortId } from './id-utils.js'; 

let instanceIdCache = null;


export async function getInstanceId() {
  if (instanceIdCache) {
    return instanceIdCache;
  }
  let id = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.INSTANCE_ID);
  if (!id) {
    let attempts = 0;
    const maxAttempts = 10; // Prevent infinite loop in extreme (unlikely) collision scenarios
    let newId;
    let isUnique = false;
    const deviceRegistry = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {});

    while (!isUnique && attempts < maxAttempts) {
      newId = generateShortId();
      if (!deviceRegistry[newId]) {
        isUnique = true;
      }
      attempts++;
    }
    id = newId; // Use the generated short ID
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.INSTANCE_ID, id); // Store the short ID
  }
  instanceIdCache = id;
  return id;
}

/**
 * Gets the name for this browser instance.
 * Priority:
 * 1. User-defined override from local storage.
 * 2. Name from sync device registry.
 * 3. Generated platform-specific default.
 * @returns {Promise<string>} The instance name.
 */
let instanceNameCache = null; // Keep instanceNameCache for performance
export async function getInstanceName() {
  if (instanceNameCache) {
    return instanceNameCache;
  }

  let name;

  // 1. Check for a user-defined override
  // Ensure a string default is passed if ensureString is to work correctly from storage.get
  const overrideName = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.INSTANCE_NAME_OVERRIDE, "");
  if (overrideName && overrideName.trim() !== "") {
    instanceNameCache = overrideName.trim();
    return instanceNameCache;
  }

  // 2. Check the synchronized device registry
  const id = await getInstanceId();
  const deviceRegistry = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {});
  if (deviceRegistry[id] && deviceRegistry[id].name && deviceRegistry[id].name.trim() !== "") {
    instanceNameCache = deviceRegistry[id].name.trim();
    return instanceNameCache;
  }

  // 3. Generate a platform-specific default name if no override or registry name is found
  try {
    const platformInfo = await getPlatformInfoCached();
    let osName = platformInfo.os.charAt(0).toUpperCase() + platformInfo.os.slice(1);
    if (osName === "Mac") osName = "Mac"; // Keep "Mac" as is
    else if (osName === "Win") osName = "Windows";
    else if (osName === "Linux") osName = "Linux";
    else if (osName === "Android") osName = "Android";
    // Add more OS mappings if needed
    name = `${osName} Device`;
  } catch (e) {
    console.warn("Could not get platform info for default name, using generic default:", e);
    name = "My Device"; // Generic fallback default
  }

  console.log("Using generated default instance name:", name);
  // This generated default name is not stored locally as an override,
  // nor is it proactively written to the sync registry here.
  // The sync registry is updated by the heartbeat mechanism or explicit rename actions.
  instanceNameCache = name;
  return instanceNameCache;
}

/**
 * Sets a user-defined name for this browser instance.
 * This will override any generated default or name from the sync registry (until next sync from another device).
 * @param {string} name - The new name for the instance.
 * @returns {Promise<{success: boolean, message?: string, newName?: string}>} Result object.
 */
export async function setInstanceName(name) {
    const trimmedName = name.trim();
    if (!trimmedName) {
        console.warn(new Date().toISOString(), "[setInstanceName] Attempted to set empty name.");
        return { success: false, message: "Device name cannot be empty." };
    }
    console.log(new Date().toISOString(), `[setInstanceName] Setting local override to: "${trimmedName}"`);

    const localSetSuccess = await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.INSTANCE_NAME_OVERRIDE, trimmedName);
    if (!localSetSuccess) {
        console.error(new Date().toISOString(), "[setInstanceName] FAILED to set local instance name override.");
        return { success: false, message: "Failed to save device name locally." };
    }
    instanceNameCache = null; // Clear cache so next getInstanceName fetches fresh

    console.log(new Date().toISOString(), "[setInstanceName] Attempting to get instanceId to update sync registry.");
    const instanceId = await getInstanceId();
    if (!instanceId) {
        console.error(new Date().toISOString(), "[setInstanceName] FAILED to get instanceId for sync registry update.");
        return { success: false, message: "Could not retrieve instance ID to update registry." };
    }

        console.log(new Date().toISOString(), `[setInstanceName] Got instanceId: ${instanceId}. Preparing sync update.`);
        const mergeResult = await storage.mergeItem(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {
            [instanceId]: { name: trimmedName, lastSeen: Date.now() } // Ensure lastSeen is also updated
        });

    if (!mergeResult.success) {
        console.error(new Date().toISOString(), `[setInstanceName] FAILED to mergeItem into sync device registry for ${instanceId}. Message: ${mergeResult.message}`);
        // Propagate the message from mergeItem if available
        return { success: false, message: mergeResult.message || "Failed to update device name in synchronized registry." };
    }
    console.log(new Date().toISOString(), `[setInstanceName] Successfully merged into sync device registry for ${instanceId}.`);
    return { success: true, newName: trimmedName };
}

// Clears the in-memory instance cache for testing.
 export function _clearInstanceIdCache() {
  instanceIdCache = null;
}
// _clearInstanceNameCache is still useful for testing or specific reset scenarios
export function _clearInstanceNameCache() { 
  instanceNameCache = null; 
}