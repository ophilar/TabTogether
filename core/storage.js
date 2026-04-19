import { ensureArray, ensureObject, deepMerge } from "../common/utils.js";
import { SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS } from "../common/constants.js";


let _cachedRootFolderId = null;

export const storage = {
  async get(area, key, defaultValue = null) {
    try {
      // Bridging: If we're accessing sync storage, check if it's a bridged key
      if (area === browser.storage.sync && this._isBridgedSyncKey(key)) {
        const configFromBookmark = await this.getSyncConfigFromBookmarks();
        if (configFromBookmark && configFromBookmark[key] !== undefined) {
          return configFromBookmark[key];
        }
      }

      if (key === null || typeof key === 'object') {
        const result = await area.get(key);
        if (key === null) return result;

        const validatedResult = {};
        for (const k in key) {
          validatedResult[k] = this._validateTypeValue(k, result[k] ?? key[k], key[k]);
        }
        return validatedResult;
      }
      const result = await area.get(key);
      let value = result[key] ?? defaultValue;

      // Type validation for known keys
      value = this._validateTypeValue(key, value, defaultValue)
      return value;
    } catch (error) {
      console.error(`Error getting ${key} from ${area === browser.storage.sync ? 'sync' : 'local'} storage:`, error);
      return defaultValue;
    }
  },

  async set(area, key, value) {
    try {
      // Bridging: If we're setting sync storage, check if it's a bridged key
      if (area === browser.storage.sync && this._isBridgedSyncKey(key)) {
        await this.saveSyncConfigToBookmarks({ [key]: value });
        // Fallthrough to also set in browser.storage.sync for secondary backup
      }
      await area.set({ [key]: value });
      return true;
    } catch (error) {
      console.error(`Error setting ${key} in ${area === browser.storage.sync ? 'sync' : 'local'} storage:`, error);
      return false;
    }
  },

  async mergeSyncStorage(newData) {
    try {
      const currentData = await browser.storage.sync.get(null);
      const mergedData = deepMerge(currentData, newData);
      await browser.storage.sync.set(mergedData);
    } catch (error) {
      console.error("Error merging sync storage:", error, { newData });
    }
  },

  async mergeItem(area, key, updates) {
    try {
      const currentItem = await this.get(area, key, {});
      const mergedItem = deepMerge(currentItem, updates);
      let dataChanged = JSON.stringify(currentItem) !== JSON.stringify(mergedItem);
      let setSuccess = true; // Assume success unless set fails

      if (dataChanged) {
        setSuccess = await this.set(area, key, mergedItem); // Capture success of the set operation
        if (!setSuccess) {
          return { success: false, mergedData: currentItem, dataChanged: false, message: `Failed to save merged item for key '${key}'.` };
        }
      }
      return { success: true, mergedData: mergedItem, dataChanged, message: undefined };
    } catch (error) {
      console.error(`Error merging item ${key} in ${area === browser.storage.sync ? 'sync' : 'local'} storage:`, error, "Updates:", updates);
      return { success: false, mergedData: null, dataChanged: false, message: `Error during merge for key '${key}': ${error.message}` };
    }
  },

  _validateTypeValue(key, value, defaultValue) {
    if (key === LOCAL_STORAGE_KEYS.SUBSCRIPTIONS) {
      return ensureArray(value, defaultValue ?? []);
    } else if (key === LOCAL_STORAGE_KEYS.PROCESSED_BOOKMARK_IDS || key === LOCAL_STORAGE_KEYS.RECENTLY_OPENED_URLS) {
      return ensureObject(value, defaultValue ?? {});
    } else if (key === LOCAL_STORAGE_KEYS.LAST_PROCESSED_BOOKMARK_TIMESTAMP || key === LOCAL_STORAGE_KEYS.LAST_SYNC_TIME || key === SYNC_STORAGE_KEYS.TASK_EXPIRY_DAYS) {
      return typeof value === 'number' ? value : (defaultValue ?? 0);
    } else if (key === LOCAL_STORAGE_KEYS.TAB_HISTORY) {
      return ensureArray(value, defaultValue ?? []);
    }
    return value;
  },

  _isBridgedSyncKey(key) {
    const bridgedKeys = [
      SYNC_STORAGE_KEYS.TASK_EXPIRY_DAYS,
      "staleDeviceThreshold", // Not in SYNC_STORAGE_KEYS yet but used in UI
    ];
    return bridgedKeys.includes(key);
  },

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

export async function recordSuccessfulSyncTime() {
  await browser.storage.local.set({ [LOCAL_STORAGE_KEYS.LAST_SYNC_TIME]: Date.now() }).catch(e => console.error("Failed to record successful sync time:", e));
}

export async function addToHistory(tabInfo) {
  try {
    const history = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.TAB_HISTORY, []);
    const newEntry = {
      ...tabInfo,
      receivedAt: Date.now()
    };

    const updatedHistory = [newEntry, ...history].slice(0, 50); // Cap at 50
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.TAB_HISTORY, updatedHistory);
  } catch (e) {
    console.error("Storage: Failed to add to history:", e);
  }
}

export async function getDeviceNickname() {
  return await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.DEVICE_NICKNAME, "Unknown Device");
}