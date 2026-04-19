import { storage } from "../core/storage.js";
import { LOCAL_STORAGE_KEYS } from "../common/constants.js";
import { cleanupStaleTabsInFirebase } from "./firebase-transport.js";

/**
 * Initialize all alarms for periodic tasks.
 */
export function initAlarms() {
  // 1. Periodic cleanup of stale tabs in Firebase (Every 6 hours)
  browser.alarms.create("cleanupStaleTabs", { periodInMinutes: 360 });

  // 2. Refresh device info / heartbeat (Legacy, but useful for stats/presence)
  browser.alarms.create("refreshPresence", { periodInMinutes: 60 });

  browser.alarms.onAlarm.addListener(async (alarm) => {
    console.log(`Background: Alarm triggered: '${alarm.name}'`);
    
    if (alarm.name === "cleanupStaleTabs") {
      await cleanupStaleTabsInFirebase();
    }
  });
}
