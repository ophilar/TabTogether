import { SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS, BACKGROUND_DEFAULT_TASK_EXPIRY_DAYS } from "../common/constants.js";
import { storage, recordSuccessfulSyncTime } from "../core/storage.js";
import { processSubscribedGroupTasks } from "../core/tasks.js";
import { performTimeBasedTaskCleanup } from "./cleanup.js";

export const ALARM_TASK_CLEANUP = "taskCleanup";
export const ALARM_PERIODIC_SYNC = "periodicSync";
const TASK_CLEANUP_INTERVAL_MIN = 60 * 24 * 2;
const DEFAULT_SYNC_INTERVAL_MIN = 30; // 30 minutes for periodic sync

export async function setupAlarms() {
  await browser.alarms.clearAll();
  console.log("Background: Setting up alarms...");

  // Cleanup alarm
  browser.alarms.create(ALARM_TASK_CLEANUP, {
    periodInMinutes: TASK_CLEANUP_INTERVAL_MIN,
  });

  // Periodic sync alarm (crucial for Android)
  const syncInterval = await storage.get(browser.storage.local, "syncInterval", DEFAULT_SYNC_INTERVAL_MIN);
  browser.alarms.create(ALARM_PERIODIC_SYNC, {
    periodInMinutes: syncInterval,
  });
}

export function initAlarms() {
  browser.alarms.onAlarm.addListener(async (alarm) => {
    console.log(`Background: Alarm triggered: ${alarm.name}`);
    switch (alarm.name) {
      case ALARM_TASK_CLEANUP:
        {
          console.log("Background: ALARM_TASK_CLEANUP triggered.");
          const localProcessedTasks = await storage.get(
            browser.storage.local,
            LOCAL_STORAGE_KEYS.PROCESSED_BOOKMARK_IDS,
            {}
          );
          const taskExpiryDays = await storage.get(
            browser.storage.sync,
            SYNC_STORAGE_KEYS.TASK_EXPIRY_DAYS,
            BACKGROUND_DEFAULT_TASK_EXPIRY_DAYS
          );
          const currentTaskExpiryMs = taskExpiryDays * 24 * 60 * 60 * 1000;
          await performTimeBasedTaskCleanup(
            localProcessedTasks,
            currentTaskExpiryMs
          );
        }
        break;
      case ALARM_PERIODIC_SYNC:
        {
          console.log("Background: ALARM_PERIODIC_SYNC triggered.");
          await processSubscribedGroupTasks();
          await recordSuccessfulSyncTime();
        }
        break;
    }
  });
}
