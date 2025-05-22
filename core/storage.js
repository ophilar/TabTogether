import { ensureArray, ensureObject, deepMerge } from "../common/utils.js";
import { SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS } from "../common/constants.js";


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
    if (key === LOCAL_STORAGE_KEYS.SUBSCRIPTIONS) {
      return ensureArray(value, defaultValue ?? []);
    } else if (key === LOCAL_STORAGE_KEYS.PROCESSED_BOOKMARK_IDS || key === LOCAL_STORAGE_KEYS.RECENTLY_OPENED_URLS) {
      return ensureObject(value, defaultValue ?? {});
    } else if (key === LOCAL_STORAGE_KEYS.LAST_PROCESSED_BOOKMARK_TIMESTAMP || key === LOCAL_STORAGE_KEYS.LAST_SYNC_TIME || key === SYNC_STORAGE_KEYS.TASK_EXPIRY_DAYS) { 
      return typeof value === 'number' ? value : (defaultValue ?? 0);
    }
    return value;
  },

  async getRootBookmarkFolder() {
    try {
      const results = await browser.bookmarks.search({ title: SYNC_STORAGE_KEYS.ROOT_BOOKMARK_FOLDER_TITLE });
      // Ensure it's a folder and not just a bookmark with the same title
      const folder = results.find(bookmark => !bookmark.url && bookmark.title === SYNC_STORAGE_KEYS.ROOT_BOOKMARK_FOLDER_TITLE);
      if (folder) {
        return folder;
      }
      console.log(`Storage: Root bookmark folder "${SYNC_STORAGE_KEYS.ROOT_BOOKMARK_FOLDER_TITLE}" not found, creating...`);
      
      let parentIdToUse = undefined; // Explicitly undefined
      try {
        const tree = await browser.bookmarks.getTree();
        // tree[0] is the root of the bookmark tree (e.g., id "root________")
        // tree[0].children are the top-level folders like "Bookmarks Menu", "Mobile Bookmarks", etc.
        if (tree && tree.length > 0 && tree[0] && tree[0].children) {
            const rootChildren = tree[0].children;

            // Preferred parent folders by ID or Title. Order matters.
            const preferredParentCandidates = [
                { id: "mobile______", title: "Mobile Bookmarks" }, // Firefox Android: Mobile Bookmarks
                { id: "unfiled_____", title: "Other Bookmarks" }, // Firefox Desktop/Sync: Other Bookmarks
                { id: "menu________", title: "Bookmarks Menu" }    // Firefox Desktop: Bookmarks Menu
            ];

            for (const candidate of preferredParentCandidates) {
                const foundParent = rootChildren.find(node =>
                    node.type === "folder" && (node.id === candidate.id || (candidate.title && node.title === candidate.title))
                );
                if (foundParent) {
                    parentIdToUse = foundParent.id;
                    console.log(`Storage: Identified preferred parent folder "${foundParent.title || foundParent.id}" (ID: ${parentIdToUse}) for the root TabTogether folder.`);
                    break; 
                }
            }
        }
        // If no preferred parent is found, parentIdToUse remains undefined.
        // In this case, browser.bookmarks.create will use the browser's default location.
      } catch (e) {
        console.warn(`Storage: Error while trying to determine a specific parent for the root TabTogether folder. Will use browser's default location. Error: ${e.message}`, e);
        // parentIdToUse remains undefined, which is the desired fallback.
      }

      const createOptions = { title: SYNC_STORAGE_KEYS.ROOT_BOOKMARK_FOLDER_TITLE };
      if (parentIdToUse) {
        createOptions.parentId = parentIdToUse;
        console.log(`Storage: Attempting to create root folder "${SYNC_STORAGE_KEYS.ROOT_BOOKMARK_FOLDER_TITLE}" under parentId: ${parentIdToUse}.`);
      } else {
        console.log(`Storage: Attempting to create root folder "${SYNC_STORAGE_KEYS.ROOT_BOOKMARK_FOLDER_TITLE}" in browser's default location (no specific parentId).`);
      }

      return await browser.bookmarks.create(createOptions);
    } catch (error) {
      console.error(`Storage: CRITICAL - Error getting/creating root bookmark folder "${SYNC_STORAGE_KEYS.ROOT_BOOKMARK_FOLDER_TITLE}":`, error);
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
      }); // Creates if not exists
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