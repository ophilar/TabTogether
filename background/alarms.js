import { LOCAL_STORAGE_KEYS, BACKGROUND_DEFAULT_TASK_EXPIRY_DAYS } from "../common/constants.js";
import { storage, recordSuccessfulSyncTime } from "../core/storage.js";

export const ALARM_PERIODIC_SYNC = "periodicSync";
const DEFAULT_SYNC_INTERVAL_MIN = 30; // 30 minutes for periodic sync

export async function setupAlarms() {
  await browser.alarms.clearAll();
  console.log("Background: Setting up alarms...");

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
      case ALARM_PERIODIC_SYNC:
        {
          console.log("Background: ALARM_PERIODIC_SYNC triggered.");
          await recordSuccessfulSyncTime();
        }
        break;
    }
  });
}
