import { ensureObject, ensureArray, ensureString, deepMerge } from "../common/utils.js";
import { SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS } from "../common/constants.js";


/**
 * Wrapper for browser.storage API to simplify get/set operations.
 */
export const storage = {
  /**
   * Retrieves an item from the specified storage area.
   * @param {browser.storage.StorageArea} area - browser.storage.sync or browser.storage.local
   * @param {string|object} keys - A single key string to retrieve, or an object where keys are storage keys and values are their default values.
   * @param {any} [defaultValue=null] - A default value to return if the key is not found.
   * @returns {Promise<any>} A promise that resolves with the storage item(s).
   */
  async get(area, key, defaultValue = null) {
    try {
      const result = await area.get(key); // area.get() with a string key returns {[key]: value}
      let value = result[key] ?? defaultValue;

      // Type validation for known keys
      value = this._validateTypeValue(key, value, defaultValue)
      return value;
    } catch (error) {
      console.error(`Error getting ${key} from ${area === browser.storage.sync ? 'sync' : 'local'} storage:`, error);
      return defaultValue;
    }
  },

  /**
   * Sets an item in the specified storage area.
   * @param {browser.storage.StorageArea} area - browser.storage.sync or browser.storage.local
   * @param {string} key - The key of the item to set.
   * @param {any} value - The value to store.
   * @returns {Promise<boolean>} A promise that resolves with true on success, false on failure.
   */
  async set(area, key, value) {
    try {
      await area.set({ [key]: value });
      return true;
    } catch (error) {
      console.error(`Error setting ${key} in ${area === browser.storage.sync ? 'sync' : 'local'} storage:`, error);
      return false;
    }
  },

  /**
   * Merges data into browser.storage.sync, ensuring deep merge for objects.
   * @param {object} newData - The new data to merge.
   * @returns {Promise<void>}
   * This method merges `newData` into the *root* of `browser.storage.sync`.
   * `newData` should be an object where keys are top-level storage keys.
   */
  async mergeSyncStorage(newData) {
    try {
      // browser.storage.sync.get(null) gets all items in sync storage.
      const currentData = await browser.storage.sync.get(null);
      const mergedData = deepMerge(currentData, newData);
      await browser.storage.sync.set(mergedData); // Sets the entire merged object back.
    } catch (error) {
      console.error("Error merging sync storage:", error, { newData });
    }
  },

  /**
   * Merges updates into a specific keyed item within a storage area.
   * @param {browser.storage.StorageArea} area - The storage area.
   * @param {string} key - The key of the item to merge.
   * @param {object} updates - The updates to merge into the item.
   * @returns {Promise<{success: boolean, mergedData: object|null, dataChanged: boolean, message?: string}>}
   */
  async mergeItem(area, key, updates) {
    try {
      const currentItem = await this.get(area, key, {}); // Get the specific item, defaulting to {}
      const mergedItem = deepMerge(currentItem, updates);
      let dataChanged = JSON.stringify(currentItem) !== JSON.stringify(mergedItem);
      let setSuccess = true; // Assume success unless set fails

      if (dataChanged) {
        setSuccess = await this.set(area, key, mergedItem); // Capture success of the set operation
        if (!setSuccess) {
          // If set failed, the merge operation is not truly successful.
          return { success: false, mergedData: currentItem, dataChanged: false, message: `Failed to save merged item for key '${key}'.` };
        }
      }
      return { success: true, mergedData: mergedItem, dataChanged, message: undefined };
    } catch (error) {
      console.error(`Error merging item ${key} in ${area === browser.storage.sync ? 'sync' : 'local'} storage:`, error, "Updates:", updates);
      return { success: false, mergedData: null, dataChanged: false, message: `Error during merge for key '${key}': ${error.message}` };
    }
  },

  /**
   * Internal helper to validate and ensure type of a retrieved storage value.
   * @param {string} key The storage key.
   * @param {any} value The retrieved value.
   * @param {any} defaultValue The default value for this key.
   * @returns {any} The validated (and potentially type-coerced) value.
   * @private
   */
  _validateTypeValue(key, value, defaultValue) {
    if (key === SYNC_STORAGE_KEYS.GROUP_TASKS ) {
      return ensureObject(value, defaultValue ?? {});
    } else if (key === LOCAL_STORAGE_KEYS.SUBSCRIPTIONS || key === SYNC_STORAGE_KEYS.DEFINED_GROUPS) {
      return ensureArray(value, defaultValue ?? []);
    } 
    return value; // No specific validation for other keys, return as is or default
  }
};

// --- Generic Storage List/Object Updaters ---

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
  const updatedList = list.filter((item) => item !== value);
  if (updatedList.length !== list.length) {
    await storage.set(area, key, updatedList);
  }
  return updatedList;
}

export async function renameInList(area, key, oldValue, newValue) {
  const list = await storage.get(area, key, []);
  const updated = list.map((item) => (item === oldValue ? newValue : item));
  // Note: This implementation does not sort the list after renaming.
  // If sorting is desired (like in addToList), add list.sort() here.
  await storage.set(area, key, updated);
  return updated;
}

export async function updateObjectKey(area, key, oldProp, newProp) {
  const obj = await storage.get(area, key, {});
  if (Object.prototype.hasOwnProperty.call(obj, oldProp)) {
    obj[newProp] = obj[oldProp];
    delete obj[oldProp];
    await storage.set(area, key, obj);
  }
  return obj;
}

export async function removeObjectKey(area, key, prop) {
  const obj = await storage.get(area, key, {});
  if (Object.prototype.hasOwnProperty.call(obj, prop)) {
    delete obj[prop];
    await storage.set(area, key, obj);
  }
  return obj;
}

/**
 * Records the current time as the last successful sync operation time in local storage.
 */
export async function recordSuccessfulSyncTime() {
  // Note: Does not return a value, fire-and-forget for setting local timestamp.
  await browser.storage.local.set({ [LOCAL_STORAGE_KEYS.LAST_SYNC_TIME]: Date.now() }).catch(e => console.error("Failed to record successful sync time:", e));
}