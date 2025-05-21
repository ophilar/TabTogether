import { storage, recordSuccessfulSyncTime } from "./storage.js";
import { LOCAL_STORAGE_KEYS, SYNC_STORAGE_KEYS, BACKGROUND_DEFAULT_TASK_EXPIRY_DAYS } from "../common/constants.js"; // Assuming BACKGROUND_DEFAULT_TASK_EXPIRY_DAYS

export async function processSubscribedGroupTasks() {
  const mySubscriptions = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []);
  if (!mySubscriptions || mySubscriptions.length === 0) {
    console.log("Tasks:processSubscribedGroupTasks - No subscriptions. Nothing to process.");
    return;
  }

  const lastProcessedTimestampFromStorage = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.LAST_PROCESSED_BOOKMARK_TIMESTAMP, 0);
  let localProcessedBookmarkIds = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.PROCESSED_BOOKMARK_IDS, {});
  let tasksProcessedLocallyThisRun = false;
  let openedUrlsThisRun = new Set();
  let recentlyOpenedUrls = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.RECENTLY_OPENED_URLS, {});
  let recentlyOpenedUrlsChanged = false;
  let newLatestTimestampConsidered = lastProcessedTimestampFromStorage;
  const now = Date.now();

  // Fetch task expiry for URL deduplication recency
  const taskExpiryDays = await storage.get(
    browser.storage.sync,
    SYNC_STORAGE_KEYS.TASK_EXPIRY_DAYS,
    BACKGROUND_DEFAULT_TASK_EXPIRY_DAYS // Fallback default
  );
  const recencyThresholdMs = taskExpiryDays * 24 * 60 * 60 * 1000;
  
  console.log(`Tasks:processSubscribedGroupTasks - START. Subscriptions: [${mySubscriptions.join(', ')}]. Last processed timestamp: ${new Date(lastProcessedTimestampFromStorage).toISOString()}`);

  const rootTaskFolder = await storage.getRootBookmarkFolder();
  if (!rootTaskFolder) {
    console.log("Tasks:processSubscribedGroupTasks - No root task folder found. Cannot process tasks.");
    return;
  }

  for (const groupName of mySubscriptions) {
    const groupFolder = await storage.getGroupBookmarkFolder(groupName, rootTaskFolder.id);
    if (!groupFolder) {
      console.log(`Tasks:processSubscribedGroupTasks - Group folder "${groupName}" not found. Skipping.`);
      continue;
    }

    const tasksInGroup = await browser.bookmarks.getChildren(groupFolder.id);
    for (const taskBookmark of tasksInGroup) {
      if (taskBookmark.url) {
        const bookmarkId = taskBookmark.id;

        if (taskBookmark.dateAdded) {
          newLatestTimestampConsidered = Math.max(newLatestTimestampConsidered, taskBookmark.dateAdded);
        }

        if (taskBookmark.dateAdded && taskBookmark.dateAdded <= lastProcessedTimestampFromStorage) {
          // console.log(`Tasks:processSubscribedGroupTasks - Task (bookmarkId: "${bookmarkId}") created at ${new Date(taskBookmark.dateAdded).toISOString()}, before last processed time. Skipping.`);
          continue;
        }

        const alreadyProcessed = localProcessedBookmarkIds[bookmarkId];
        if (alreadyProcessed) {
          console.log(`Tasks:processSubscribedGroupTasks - Task (bookmarkId: "${bookmarkId}") in group "${groupName}" already processed locally.`);
          continue;
        }

        const urlLastOpenedTimestamp = recentlyOpenedUrls[taskBookmark.url];
        if (openedUrlsThisRun.has(taskBookmark.url)) {
          console.log(`Tasks:processSubscribedGroupTasks - URL ${taskBookmark.url} (bookmarkId: "${bookmarkId}") already opened in this run for another group. Deduplicated (intra-run).`);
        } else if (urlLastOpenedTimestamp && (now - urlLastOpenedTimestamp < recencyThresholdMs)) {
          console.log(`Tasks:processSubscribedGroupTasks - URL ${taskBookmark.url} (bookmarkId: "${bookmarkId}") was recently opened. Deduplicated (inter-run).`);
        }
        else {
            try {
              console.log(`Tasks:processSubscribedGroupTasks - Opening tab: ${taskBookmark.url} for group ${groupName}, bookmark ID: ${bookmarkId}`);
              await browser.tabs.create({ url: taskBookmark.url, active: false });
              openedUrlsThisRun.add(taskBookmark.url); // For intra-run deduplication
              
              recentlyOpenedUrls[taskBookmark.url] = now; // For inter-run deduplication
              recentlyOpenedUrlsChanged = true;
            } catch (e) {
              console.error(`Tasks:processSubscribedGroupTasks - Failed to open tab ${taskBookmark.url} (bookmark ID: ${bookmarkId}):`, e);
              // If tab creation fails, we might not want to mark it as processed, or handle it differently.
              // For now, we continue to mark it as processed to avoid retrying a failing URL.
            }
          }
        // Mark the bookmark ID as processed regardless of URL deduplication, as the task intent is handled.
        localProcessedBookmarkIds[bookmarkId] = now; 
        tasksProcessedLocallyThisRun = true;
      }
    }
  }

  if (tasksProcessedLocallyThisRun) {
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.PROCESSED_BOOKMARK_IDS, localProcessedBookmarkIds);
    console.log("Tasks:processSubscribedGroupTasks - Finished processing, updated local processed task list.");
  } else {
    console.log("Tasks:processSubscribedGroupTasks - No new tasks to process for this device in this run.");
  }

  if (recentlyOpenedUrlsChanged) {
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.RECENTLY_OPENED_URLS, recentlyOpenedUrls);
    console.log('Tasks:processSubscribedGroupTasks - Updated recently opened URLs list.');
  }

  if (newLatestTimestampConsidered > lastProcessedTimestampFromStorage) {
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.LAST_PROCESSED_BOOKMARK_TIMESTAMP, newLatestTimestampConsidered);
    console.log(`Tasks:processSubscribedGroupTasks - Updated last processed bookmark timestamp to: ${new Date(newLatestTimestampConsidered).toISOString()}`);
  }

  // Record that a sync attempt was made
  await recordSuccessfulSyncTime();
}
export async function createAndStoreGroupTask(groupName, tabData) {
  const newTaskData = {
    url: tabData.url,
    title: tabData.title || tabData.url,
  };

  const opResult = await storage.createTaskBookmark(groupName, newTaskData);

  if (!opResult.success) {
    console.error(`Failed to store task for group ${groupName}. Message: ${opResult.message}`);
    return { success: false, bookmarkId: null, message: opResult.message || "Failed to save task as bookmark." };
  }
  console.log(`Task (bookmarkId: ${opResult.bookmarkId}) created for group ${groupName}:`, newTaskData);
  return { success: true, bookmarkId: opResult.bookmarkId };
}