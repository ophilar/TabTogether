import { ensureArray, deepMerge } from "../common/utils.js";
import { SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS, TAB_TOGETHER_BOOKMARKS_ROOT_TITLE } from "../common/constants.js";


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
    if (key === LOCAL_STORAGE_KEYS.SUBSCRIPTIONS || key === SYNC_STORAGE_KEYS.DEFINED_GROUPS) {
      return ensureArray(value, defaultValue ?? []);
    } 
    return value;
  },

  async getRootBookmarkFolder() {
    try {
      const results = await browser.bookmarks.search({ title: TAB_TOGETHER_BOOKMARKS_ROOT_TITLE });
      const folder = results.find(bookmark => !bookmark.url && bookmark.title === TAB_TOGETHER_BOOKMARKS_ROOT_TITLE);
      if (folder) {
        return folder;
      }
      console.log(`Storage: Root bookmark folder "${TAB_TOGETHER_BOOKMARKS_ROOT_TITLE}" not found, creating...`);
      
      let parentId = undefined; 
      try {
        const otherBookmarks = await browser.bookmarks.getTree();
        if (otherBookmarks && otherBookmarks.length > 0) {
            const rootNode = otherBookmarks[0]; 
            const potentialParents = rootNode.children.filter(node => node.type === "folder" && node.id !== "toolbar_____" && node.id !== "menu________" && node.id !== "mobile______" && node.id !== "tags________");
            if (potentialParents.find(p => p.title === "Other Bookmarks" || p.id === "unfiled_____")) { // Firefox "Other Bookmarks"
                parentId = potentialParents.find(p => p.title === "Other Bookmarks" || p.id === "unfiled_____").id;
            } else if (potentialParents.length > 0) {
                 parentId = potentialParents[0].id; // Fallback to the first generic folder
            } else {
                 parentId = rootNode.children.find(c => c.type === "folder")?.id || rootNode.id; // last resort
            }
        }
      } catch (e) {
        console.warn("Storage: Could not determine a specific parent for root folder, will create at top level if possible.", e);
      }

      return await browser.bookmarks.create({
        title: TAB_TOGETHER_BOOKMARKS_ROOT_TITLE,
        parentId: parentId 
      });
    } catch (error) {
      console.error("Storage: Error getting/creating root bookmark folder:", error);
      return null;
    }
  },

  async getGroupBookmarkFolder(groupName, rootFolderId) {
    if (!rootFolderId) {
      console.error("Storage:getGroupBookmarkFolder - Root folder ID is required.");
      return null;
    }
    try {
      const children = await browser.bookmarks.getChildren(rootFolderId);
      const groupFolder = children.find(child => !child.url && child.title === groupName);
      if (groupFolder) {
        return groupFolder;
      }
      return await browser.bookmarks.create({
        parentId: rootFolderId,
        title: groupName,
      });
    } catch (error) {
      console.error(`Storage: Error getting/creating group bookmark folder "${groupName}":`, error);
      return null;
    }
  },

  async createTaskBookmark(groupName, taskData) {
    const rootFolder = await this.getRootBookmarkFolder();
    if (!rootFolder) return { success: false, bookmarkId: null, message: "Could not get or create root task folder." };
    const groupFolder = await this.getGroupBookmarkFolder(groupName, rootFolder.id);
    if (!groupFolder) return { success: false, bookmarkId: null, message: `Could not get or create group folder "${groupName}".` };

    try {
      const newBookmark = await browser.bookmarks.create({
        parentId: groupFolder.id,
        title: taskData.title,
        url: taskData.url,
      });
      return { success: true, bookmarkId: newBookmark.id, newBookmark };
    } catch (error) {
      console.error(`Storage: Error creating task bookmark for group ${groupName}:`, error);
      return { success: false, bookmarkId: null, message: error.message };
    }
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