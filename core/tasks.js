import { storage } from "./storage.js";
import { LOCAL_STORAGE_KEYS } from "../common/constants.js";

/**
 * Processes incoming tabs for the current device, typically on Android or manual sync.
 * Opens tabs from tasks and then clears those tasks.
 * @param {object} currentState - The current application state, including groupTasks and subscriptions.
 * @returns {Promise<void>}
 */
export async function processIncomingTabsAndroid(currentState) {
  const mySubscriptions = currentState.subscriptions || []; // Array of group names
  const allGroupTasksFromState = currentState.groupTasks || {}; // This is { groupName: { bookmarkId: taskData } }

  let localProcessedBookmarkIds = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.PROCESSED_BOOKMARK_IDS, {});
  let tasksProcessedLocallyThisRun = false; // Renamed for clarity

  console.log(`Tasks:processIncomingTabsAndroid - START. Subscriptions: [${mySubscriptions.join(', ')}]. Received groupTasks:`, JSON.stringify(allGroupTasksFromState));

  for (const groupName in allGroupTasksFromState) {
    if (mySubscriptions.includes(groupName)) {
      const tasksInGroupObject = allGroupTasksFromState[groupName]; // This is an object { bookmarkId1: data1, ...}

      for (const bookmarkId in tasksInGroupObject) {
        const task = tasksInGroupObject[bookmarkId]; // task now contains { id, url, title, creationTimestamp }

        // Determine if the task should be skipped
        const alreadyProcessed = localProcessedBookmarkIds[bookmarkId];

        if (alreadyProcessed) {
          console.log(`Tasks:processIncomingTabsAndroid - Task (bookmarkId: "${bookmarkId}") in group "${groupName}" already processed locally.`);
          continue;
        }

        // Open the tab
        try {
          console.log(`Tasks:processIncomingTabsAndroid - Opening tab: ${task.url} for group ${groupName}, bookmark ID: ${bookmarkId}`);
          await browser.tabs.create({ url: task.url, active: false });

          localProcessedBookmarkIds[bookmarkId] = Date.now(); // Mark as processed with timestamp
          tasksProcessedLocallyThisRun = true;

        } catch (e) {
          console.error(`Tasks:processIncomingTabsAndroid - Failed to open tab ${task.url} (bookmark ID: ${bookmarkId}):`, e);
          // Do not mark as processed if opening failed
        }
      }
    }
  }
  if (tasksProcessedLocallyThisRun) {
    // Save the updated localProcessedTasks
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.PROCESSED_BOOKMARK_IDS, localProcessedBookmarkIds);
    console.log("Tasks:processIncomingTabsAndroid - Finished processing, updated local processed task list.");
  } else {
    console.log("Tasks:processIncomingTabsAndroid - No new tabs to process for this device in this run.");
  }
}

/**
 * Creates a new task and stores it in sync storage.
 * @param {string} groupName - The name of the group.
 * @param {object} tabData - Object containing tab URL and title.
 * @returns {Promise<{success: boolean, bookmarkId: string|null, message?: string}>}
 */
export async function createAndStoreGroupTask(groupName, tabData) {
  const newTaskData = {
    url: tabData.url,
    title: tabData.title || tabData.url,
    // creationTimestamp is implicitly set by bookmark.dateAdded
  };

  // storage.createTaskBookmark will create the bookmark and return its ID
  const opResult = await storage.createTaskBookmark(groupName, newTaskData);

  if (!opResult.success) {
    console.error(`Failed to store task for group ${groupName}. Message: ${opResult.message}`);
    return { success: false, bookmarkId: null, message: opResult.message || "Failed to save task as bookmark." };
  }
  // opResult.newBookmark contains the created bookmark object
  console.log(`Task (bookmarkId: ${opResult.bookmarkId}) created for group ${groupName}:`, newTaskData);
  return { success: true, bookmarkId: opResult.bookmarkId };
}