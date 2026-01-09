import { ensureArray, ensureObject, deepMerge } from "../common/utils.js";
import { SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS } from "../common/constants.js";


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

  async getSyncConfigFromBookmarks() {
    try {
      const rootFolder = await this.getRootBookmarkFolder();
      if (!rootFolder) return null;

      const children = await browser.bookmarks.getChildren(rootFolder.id);
      const configBookmark = children.find(child => child.url && child.title === SYNC_STORAGE_KEYS.CONFIG_BOOKMARK_TITLE);

      if (configBookmark && configBookmark.url.startsWith("data:application/json,")) {
        const jsonStr = decodeURIComponent(configBookmark.url.replace("data:application/json,", ""));
        return JSON.parse(jsonStr);
      }
    } catch (e) {
      console.warn("Storage: Failed to read config from bookmark:", e.message);
    }
    return null;
  },

  async saveSyncConfigToBookmarks(updates) {
    try {
      const rootFolder = await this.getRootBookmarkFolder();
      if (!rootFolder) return false;

      const currentConfig = (await this.getSyncConfigFromBookmarks()) || {};
      const newConfig = { ...currentConfig, ...updates, _lastUpdated: Date.now() };
      const jsonStr = JSON.stringify(newConfig);
      const dataUri = `data:application/json,${encodeURIComponent(jsonStr)}`;

      const children = await browser.bookmarks.getChildren(rootFolder.id);
      const configBookmark = children.find(child => child.url && child.title === SYNC_STORAGE_KEYS.CONFIG_BOOKMARK_TITLE);

      if (configBookmark) {
        await browser.bookmarks.update(configBookmark.id, { url: dataUri });
      } else {
        await browser.bookmarks.create({
          parentId: rootFolder.id,
          title: SYNC_STORAGE_KEYS.CONFIG_BOOKMARK_TITLE,
          url: dataUri
        });
      }
      return true;
    } catch (e) {
      console.error("Storage: Failed to save config to bookmark:", e);
      return false;
    }
  },

  async getRootBookmarkFolder() {
    try {
      // 1. Manually search the tree (Dramatically more reliable on Android than bookmarks.search)
      let folder = null;
      try {
        const tree = await browser.bookmarks.getTree();
        folder = this._findFirstFolderByTitle(tree, SYNC_STORAGE_KEYS.ROOT_BOOKMARK_FOLDER_TITLE);
      } catch (e) {
        console.warn("Storage: Failed to search tree manually:", e);
      }

      // 2. Fallback to search API if not found in tree
      if (!folder) {
        try {
          if (browser.bookmarks.search) {
            const results = await browser.bookmarks.search({ title: SYNC_STORAGE_KEYS.ROOT_BOOKMARK_FOLDER_TITLE });
            folder = results.find(bookmark => !bookmark.url && bookmark.title === SYNC_STORAGE_KEYS.ROOT_BOOKMARK_FOLDER_TITLE);
          }
        } catch (e2) {
          console.error("Storage: Search API failed:", e2);
        }
      }

      if (folder) {
        return folder;
      }

      console.log(`Storage: Root bookmark folder "${SYNC_STORAGE_KEYS.ROOT_BOOKMARK_FOLDER_TITLE}" not found, identifying parent for creation...`);

      let parentIdToUse = "unfiled_____"; // Default to Other Bookmarks (highly synced)
      try {
        const tree = await browser.bookmarks.getTree();
        // tree[0] is the root of the bookmark tree (e.g., id "root________")
        // tree[0].children are the top-level folders like "Bookmarks Menu", "Mobile Bookmarks", etc.
        if (tree && tree.length > 0 && tree[0] && tree[0].children) {
          const rootChildren = tree[0].children;

          // Preferred parent folders by ID or Title. Order matters.
          const preferredParentCandidates = [
            { id: "unfiled_____", title: "Other Bookmarks" }, // Highest priority: Syncs well as "Desktop Bookmarks" on mobile
            { id: "mobile______", title: "Mobile Bookmarks" },
            { id: "menu________", title: "Bookmarks Menu" }
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

  /**
   * Recursive helper to find the first folder with a specific title in a bookmark tree.
   * Useful on Android where browser.bookmarks.search is missing or limited.
   */
  _findFirstFolderByTitle(nodes, title) {
    if (!nodes) return null;
    for (const node of nodes) {
      if (!node.url && node.title === title) {
        return node;
      }
      if (node.children) {
        const found = this._findFirstFolderByTitle(node.children, title);
        if (found) return found;
      }
    }
    return null;
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