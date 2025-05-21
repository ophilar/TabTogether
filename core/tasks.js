import { storage } from "./storage.js";
import { LOCAL_STORAGE_KEYS } from "../common/constants.js";

export async function processSubscribedGroupTasks() {
  const mySubscriptions = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []);
  if (!mySubscriptions || mySubscriptions.length === 0) {
    console.log("Tasks:processSubscribedGroupTasks - No subscriptions. Nothing to process.");
    return;
  }

  let localProcessedBookmarkIds = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.PROCESSED_BOOKMARK_IDS, {});
  let tasksProcessedLocallyThisRun = false;

  console.log(`Tasks:processSubscribedGroupTasks - START. Subscriptions: [${mySubscriptions.join(', ')}].`);

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
      if (taskBookmark.url) { // It's a bookmark, not a sub-folder
        const bookmarkId = taskBookmark.id;
        const alreadyProcessed = localProcessedBookmarkIds[bookmarkId];

        if (alreadyProcessed) {
          console.log(`Tasks:processSubscribedGroupTasks - Task (bookmarkId: "${bookmarkId}") in group "${groupName}" already processed locally.`);
          continue;
        }

        try {
          console.log(`Tasks:processSubscribedGroupTasks - Opening tab: ${taskBookmark.url} for group ${groupName}, bookmark ID: ${bookmarkId}`);
          await browser.tabs.create({ url: taskBookmark.url, active: false });

          localProcessedBookmarkIds[bookmarkId] = Date.now();
          tasksProcessedLocallyThisRun = true;
        } catch (e) {
          console.error(`Tasks:processSubscribedGroupTasks - Failed to open tab ${taskBookmark.url} (bookmark ID: ${bookmarkId}):`, e);
        }
      }
    }
  }
  if (tasksProcessedLocallyThisRun) {
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.PROCESSED_BOOKMARK_IDS, localProcessedBookmarkIds);
    console.log("Tasks:processSubscribedGroupTasks - Finished processing, updated local processed task list.");
  } else {
    console.log("Tasks:processSubscribedGroupTasks - No new tasks to process for this device in this run.");
  }
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