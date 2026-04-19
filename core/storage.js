import { ensureArray, ensureObject, deepMerge } from "../common/utils.js";
import { LOCAL_STORAGE_KEYS } from "../common/constants.js";

export const storage = {
  async get(area, key, defaultValue = null) {
    try {
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
      await area.set({ [key]: value });
      return true;
    } catch (error) {
      console.error(`Error setting ${key} in ${area === browser.storage.sync ? 'sync' : 'local'} storage:`, error);
      return false;
    }
  },

  async mergeItem(area, key, updates) {
    try {
      const currentItem = await this.get(area, key, {});
      const mergedItem = deepMerge(currentItem, updates);
      let dataChanged = JSON.stringify(currentItem) !== JSON.stringify(mergedItem);
      let setSuccess = true;

      if (dataChanged) {
        setSuccess = await this.set(area, key, mergedItem);
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
    } else if (key === LOCAL_STORAGE_KEYS.RECENTLY_OPENED_URLS) {
      return ensureObject(value, defaultValue ?? {});
    } else if (key === LOCAL_STORAGE_KEYS.LAST_SYNC_TIME) {
      return typeof value === 'number' ? value : (defaultValue ?? 0);
    } else if (key === LOCAL_STORAGE_KEYS.TAB_HISTORY) {
      return ensureArray(value, defaultValue ?? []);
    }
    return value;
  },
};

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