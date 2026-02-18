import { SYNC_STORAGE_KEYS, BACKGROUND_DEFAULT_TASK_EXPIRY_DAYS } from "../../common/constants.js";
import { storage } from "../../core/storage.js";

const DEFAULT_STALE_DEVICE_DAYS = 30;
let taskExpiryInputElem = null;
let staleDeviceThresholdInputElem = null;

async function loadAdvancedTimingSettings() {
  const [taskDays, staleDays] = await Promise.all([
    storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.TASK_EXPIRY_DAYS, BACKGROUND_DEFAULT_TASK_EXPIRY_DAYS),
    storage.get(browser.storage.sync, "staleDeviceThreshold", DEFAULT_STALE_DEVICE_DAYS)
  ]);

  if (taskExpiryInputElem) taskExpiryInputElem.value = taskDays;
  if (staleDeviceThresholdInputElem) staleDeviceThresholdInputElem.value = staleDays;
}

function setupAdvancedTimingListeners() {
  if (taskExpiryInputElem) {
    taskExpiryInputElem.addEventListener('change', async (e) => {
      let val = parseInt(e.target.value, 10);
      if (isNaN(val) || val < 1) val = BACKGROUND_DEFAULT_TASK_EXPIRY_DAYS;
      taskExpiryInputElem.value = val;
      await storage.set(browser.storage.sync, SYNC_STORAGE_KEYS.TASK_EXPIRY_DAYS, val);
    });
  }

  if (staleDeviceThresholdInputElem) {
    staleDeviceThresholdInputElem.addEventListener('change', async (e) => {
      let val = parseInt(e.target.value, 10);
      if (isNaN(val) || val < 1) val = DEFAULT_STALE_DEVICE_DAYS;
      staleDeviceThresholdInputElem.value = val;
      await storage.set(browser.storage.sync, "staleDeviceThreshold", val);
    });
  }
}

export function setupAdvancedTiming() {
  taskExpiryInputElem = document.getElementById("taskExpiryInput");
  staleDeviceThresholdInputElem = document.getElementById("staleDeviceThresholdInput");

  setupAdvancedTimingListeners();
  loadAdvancedTimingSettings();
}