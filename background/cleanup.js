import { storage } from "../core/storage.js";
import { SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS } from "../common/constants.js";

export async function performTimeBasedTaskCleanup(localProcessedBookmarkIds, thresholdMs) {
  console.log("Cleanup:performTimeBasedTaskCleanup - Performing time-based task cleanup...");
  const now = Date.now();
  let processedIdsChanged = false;
  let currentProcessedBookmarkIds = { ...localProcessedBookmarkIds };
  let recentlyOpenedUrlsChanged = false;

  const rootFolder = await storage.getRootBookmarkFolder();
  if (!rootFolder) {
    console.log("Cleanup: No root bookmark folder found. Skipping cleanup.");
    return;
  }

  const groupFolders = await browser.bookmarks.getChildren(rootFolder.id);
  for (const groupFolder of groupFolders) {
    if (groupFolder.url || groupFolder.title === SYNC_STORAGE_KEYS.CONFIG_BOOKMARK_TITLE) continue; 

    const taskBookmarks = await browser.bookmarks.getChildren(groupFolder.id);
    for (const taskBookmark of taskBookmarks) {
      if (taskBookmark.url) { 
        if (now - (taskBookmark.dateAdded || 0) > thresholdMs) {
          console.log(`Cleanup: Task bookmark "${taskBookmark.title}" (ID: ${taskBookmark.id}) in group "${groupFolder.title}" expired. Deleting.`);
          try {
            await browser.bookmarks.remove(taskBookmark.id);
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

  // Cleanup processed IDs for bookmarks that no longer exist (e.g., deleted by another device)
  const allKnownProcessedIds = Object.keys(currentProcessedBookmarkIds);
  for (const bookmarkId of allKnownProcessedIds) {
    try {
      const found = await browser.bookmarks.get(bookmarkId);
      if (!found || found.length === 0) { // Should not happen if get throws, but as a safeguard
        console.log(`Cleanup: Processed bookmark ID ${bookmarkId} no longer exists. Removing from local list.`);
        delete currentProcessedBookmarkIds[bookmarkId];
        processedIdsChanged = true;
      }
    } catch (e) { // browser.bookmarks.get throws if ID not found
      console.log(`Cleanup: Processed bookmark ID ${bookmarkId} no longer exists (error on get). Removing from local list. Error: ${e.message}`);
      delete currentProcessedBookmarkIds[bookmarkId];
      processedIdsChanged = true;
    }
  }

  // Cleanup old entries from RECENTLY_OPENED_URLS
  let recentlyOpenedUrls = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.RECENTLY_OPENED_URLS, {});
  const urlsToKeep = {};
  for (const url in recentlyOpenedUrls) {
    if (now - recentlyOpenedUrls[url] < thresholdMs) {
      urlsToKeep[url] = recentlyOpenedUrls[url];
    } else {
      console.log(`Cleanup: URL ${url} expired from recently opened list.`);
      recentlyOpenedUrlsChanged = true;
    }
  }
  if (recentlyOpenedUrlsChanged) {
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.RECENTLY_OPENED_URLS, urlsToKeep);
    console.log("Cleanup: Saved updated recently opened URLs list.");
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