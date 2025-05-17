import { storage } from "./storage.js";
import { SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS } from "../common/constants.js";
import { getPlatformInfoCached } from "./platform.js";

const SHORT_ID_LENGTH = 4; // Length of the new device IDs

export function generateShortId(length = SHORT_ID_LENGTH) {
  console.log(`Instance: Generating short ID of length ${length}`); // Can be verbose
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

let instanceIdCache = null;
export async function getInstanceId() {
  console.log("Instance:getInstanceId called.");
  if (instanceIdCache) {
    console.log("Instance: Returning cached instanceId:", instanceIdCache);
    return instanceIdCache;
  }
  let id = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.INSTANCE_ID);
  if (!id) {
    let attempts = 0;
    console.log("Instance: No instanceId found in local storage. Generating new one.");
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
    console.log(`Instance: Generated new instanceId: ${id} after ${attempts} attempts.`);
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.INSTANCE_ID, id); // Store the short ID
  }
  instanceIdCache = id;
  console.log("Instance: Final instanceId:", id);
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
  console.log("Instance:getInstanceName called.");
  if (instanceNameCache) {
    return instanceNameCache;
  }

  let name;

  // 1. Check for a user-defined override
  // Ensure a string default is passed if ensureString is to work correctly from storage.get
  const overrideName = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.INSTANCE_NAME_OVERRIDE, "");
  if (overrideName && overrideName.trim() !== "") {
    console.log("Instance: Using instance name from local override:", overrideName.trim());
    instanceNameCache = overrideName.trim();
    return instanceNameCache;
  }

  // 2. Check the synchronized device registry
  const id = await getInstanceId();
  const deviceRegistry = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {});
  if (deviceRegistry[id] && deviceRegistry[id].name && deviceRegistry[id].name.trim() !== "") {
    console.log("Instance: Using instance name from device registry:", deviceRegistry[id].name.trim());
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

  console.log("Instance: Using generated default instance name:", name);
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
    console.log(`Instance:setInstanceName called with name: "${name}", trimmed: "${trimmedName}"`);
    if (!trimmedName) {
        console.warn("Instance:setInstanceName - Attempted to set empty name.");
        return { success: false, message: "Device name cannot be empty." };
    }
    console.log(`Instance:setInstanceName - Setting local override to: "${trimmedName}"`);

    const localSetSuccess = await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.INSTANCE_NAME_OVERRIDE, trimmedName);
    if (!localSetSuccess) {
        console.error("Instance:setInstanceName - FAILED to set local instance name override.");
        return { success: false, message: "Failed to save device name locally." };
    }
    instanceNameCache = null; // Clear cache so next getInstanceName fetches fresh
    console.log("Instance:setInstanceName - Cleared instanceNameCache.");

    console.log("Instance:setInstanceName - Attempting to get instanceId to update sync registry.");
    const instanceId = await getInstanceId();
    if (!instanceId) {
        console.error("Instance:setInstanceName - FAILED to get instanceId for sync registry update.");
        return { success: false, message: "Could not retrieve instance ID to update registry." };
    }

        console.log(`Instance:setInstanceName - Got instanceId: ${instanceId}. Preparing sync update.`);
        const mergeResult = await storage.mergeItem(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {
            [instanceId]: { name: trimmedName, lastSeen: Date.now() } // Ensure lastSeen is also updated
        });

    if (!mergeResult.success) {
        console.error(`Instance:setInstanceName - FAILED to mergeItem into sync device registry for ${instanceId}. Message: ${mergeResult.message}`);
        // Propagate the message from mergeItem if available
        return { success: false, message: mergeResult.message || "Failed to update device name in synchronized registry." };
    }
    console.log(`Instance:setInstanceName - Successfully merged into sync device registry for ${instanceId}.`);
    return { success: true, newName: trimmedName };
}

// Clears the in-memory instance cache for testing.
 export function _clearInstanceIdCache() {
  console.log("Instance: Clearing instanceIdCache.");
  instanceIdCache = null;
}
// _clearInstanceNameCache is still useful for testing or specific reset scenarios
export function _clearInstanceNameCache() { 
  console.log("Instance: Clearing instanceNameCache.");
  instanceNameCache = null; 
}