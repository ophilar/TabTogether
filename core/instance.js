// core/instance.js

import { storage } from "./storage.js";
import { SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS } from "../common/constants.js";

let instanceIdCache = null;

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
    id = crypto.randomUUID();
    await storage.set(browser.storage.local, { [LOCAL_STORAGE_KEYS.INSTANCE_ID]: id });
  }
  instanceIdCache = id;
  return id;
}

/**
 * Gets the name for this browser instance.
 * Defaults to "My Device" or a platform-specific name if not set.
 * @returns {Promise<string>} The instance name.
 */
export async function getInstanceName() {
  const id = await getInstanceId();
  const deviceRegistry = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {});
  if (deviceRegistry[id] && deviceRegistry[id].name) {
    return deviceRegistry[id].name;
  }
  // Fallback name if not in registry or name not set
  // You might want to use browser.runtime.getPlatformInfo() to generate a more descriptive default
  return "My Device"; // Or a more dynamic default
}