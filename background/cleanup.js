import { storage } from "../core/storage.js";
import { SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS } from "../common/constants.js";

/**
 * Performs time-based cleanup of old task bookmarks and their entries in local processed IDs.
 * @param {object} localProcessedBookmarkIds - Current map of { bookmarkId: timestamp }.
 * @param {number} thresholdMs - Tasks older than this (based on bookmark.dateAdded) will be removed.
 */
export async function performTimeBasedTaskCleanup(localProcessedBookmarkIds, thresholdMs) {
  console.log("Cleanup:performTimeBasedTaskCleanup - Performing time-based task cleanup...");
  const now = Date.now();
  let processedIdsChanged = false;
  let currentProcessedBookmarkIds = { ...localProcessedBookmarkIds };

  const rootFolder = await storage.getRootBookmarkFolder();
  if (!rootFolder) {
    console.log("Cleanup: No root bookmark folder found. Skipping cleanup.");
    return;
  }

  const groupFolders = await browser.bookmarks.getChildren(rootFolder.id);
  for (const groupFolder of groupFolders) {
    if (groupFolder.url || groupFolder.title === SYNC_STORAGE_KEYS.CONFIG_BOOKMARK_TITLE) continue; // Skip non-folders and config bookmark

    const taskBookmarks = await browser.bookmarks.getChildren(groupFolder.id);
    for (const taskBookmark of taskBookmarks) {
      if (taskBookmark.url) { // Is a task bookmark
        // taskBookmark.dateAdded is in milliseconds since epoch, same as Date.now()
        if (now - (taskBookmark.dateAdded || 0) > thresholdMs) {
          console.log(`Cleanup: Task bookmark "${taskBookmark.title}" (ID: ${taskBookmark.id}) in group "${groupFolder.title}" expired. Deleting.`);
          try {
            await browser.bookmarks.remove(taskBookmark.id);
            // If successfully removed, also clean from local processed list
            if (currentProcessedBookmarkIds[taskBookmark.id]) {
              delete currentProcessedBookmarkIds[taskBookmark.id];
              processedIdsChanged = true;
            }
          } catch (e) {
            console.error(`Cleanup: Failed to delete expired task bookmark ${taskBookmark.id}:`, e);
          }
        }
      }
    }
  }

  console.log(
    `Cleanup:performTimeBasedTaskCleanup - Before final local set: processedIdsChanged=${processedIdsChanged}, currentProcessedBookmarkIds=`,
    JSON.stringify(currentProcessedBookmarkIds)
  );

  if (processedIdsChanged) {
    console.log(`Cleanup:performTimeBasedTaskCleanup - Saving updated local processed tasks...`);
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.PROCESSED_BOOKMARK_IDS, currentProcessedBookmarkIds);
  }
  console.log("Cleanup:performTimeBasedTaskCleanup - Complete.");
}