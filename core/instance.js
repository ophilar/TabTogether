// core/instance.js

import { storage } from "./storage.js";
import { SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS } from "../common/constants.js";
import { getPlatformInfoCached } from "./platform.js"; // Import missing function

let instanceIdCache = null;
let instanceNameCache = null; // Add cache for instance name

/**
 * Gets the unique ID for this browser instance.
 * Generates and stores it if not already present.
 * @returns {Promise<string>} The instance ID.
 */
export async function getInstanceId() {
  if (instanceIdCache) {
    return instanceIdCache;
  }
  let id = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.INSTANCE_ID);
  if (!id) {
    // Ensure crypto.randomUUID is available, provide fallback if in a weird environment
    id = globalThis.crypto?.randomUUID?.() || `fallback-uuid-${Date.now()}-${Math.random()}`;
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.INSTANCE_ID, id);
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
export async function getInstanceName() {
  if (instanceNameCache) {
    return instanceNameCache;
  }

  let name;

  // 1. Check for a user-defined override
  const overrideName = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.INSTANCE_NAME_OVERRIDE);
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
 * @param {string} newName - The new name for the instance.
 * @returns {Promise<boolean>} True if successful.
 */
export async function setInstanceName(newName) {
    const trimmedName = newName.trim();
    if (!trimmedName) {
        console.error("Instance name cannot be empty.");
        return false;
    }
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.INSTANCE_NAME_OVERRIDE, trimmedName);
    instanceNameCache = trimmedName; // Update cache

    const instanceId = await getInstanceId();
    if (instanceId) {
        await storage.mergeItem(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {
            [instanceId]: { name: trimmedName, lastSeen: Date.now() } // Ensure lastSeen is also updated
        });
    }
    return true;
}

/**
 * Clears the in-memory instance ID cache. Used for testing.
 */
export function _clearInstanceIdCache() {
  instanceIdCache = null;
}

/**
 * Clears the in-memory instance name cache. Used for testing.
 */
export function _clearInstanceNameCache() {
  instanceNameCache = null;
}