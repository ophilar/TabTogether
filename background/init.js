import { SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS, BACKGROUND_DEFAULT_TASK_EXPIRY_DAYS } from "../common/constants.js";
import { storage } from "../core/storage.js";
import { processSubscribedGroupTasks } from "../core/tasks.js";
import { setupAlarms } from "./alarms.js";
import { updateContextMenu } from "./context-menus.js";

export async function initializeExtension() {
  console.log("Background: Initializing TabTogether (Advanced)...");
  try {
    console.log("Background: Initializing storage...");
    const syncKeysToInitialize = [SYNC_STORAGE_KEYS.TASK_EXPIRY_DAYS];
    const updates = {};

    for (const key of syncKeysToInitialize) {
      const value = await storage.get(browser.storage.sync, key, null);
      if (value === null) {
        updates[key] = BACKGROUND_DEFAULT_TASK_EXPIRY_DAYS;
      }
    }

    if (Object.keys(updates).length > 0) {
      for (const [key, val] of Object.entries(updates)) {
        await storage.set(browser.storage.sync, key, val);
      }
      console.log("Background: Storage initialized with defaults via bridging:", updates);
    }
    const lastProcessedTs = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.LAST_PROCESSED_BOOKMARK_TIMESTAMP, null);
    if (lastProcessedTs === null) {
      console.log("Background: Initializing LAST_PROCESSED_BOOKMARK_TIMESTAMP to 0.");
      await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.LAST_PROCESSED_BOOKMARK_TIMESTAMP, 0);
    }
    const recentlyOpenedUrls = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.RECENTLY_OPENED_URLS, null);
    if (recentlyOpenedUrls === null) {
      console.log("Background: Initializing RECENTLY_OPENED_URLS to {}.");
      await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.RECENTLY_OPENED_URLS, {});
    }
    await storage.getRootBookmarkFolder();
    await setupAlarms();
    if (browser.contextMenus) {
      await updateContextMenu();
    } else {
      console.warn("Background:initializeExtension - ContextMenus API is not available. Context menu features will be disabled.");
    }
    await processSubscribedGroupTasks();
    console.log(`Background: Initialization complete.`);
  } catch (error) {
    console.error("Background: CRITICAL ERROR during initializeExtension:", error);
  }
}

export function initInitialization() {
  browser.runtime.onInstalled.addListener(initializeExtension);
  browser.runtime.onStartup.addListener(initializeExtension);
}
