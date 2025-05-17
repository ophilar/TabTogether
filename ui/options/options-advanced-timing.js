import { SYNC_STORAGE_KEYS } from "../../common/constants.js";
import { storage } from "../../core/storage.js";

const DEFAULT_STALE_THRESHOLD_DAYS = 30;
const DEFAULT_TASK_EXPIRY_DAYS = 14;

let staleDeviceThresholdInputElem = null;
let taskExpiryInputElem = null;

async function loadAdvancedTimingSettings() {
  const staleDays = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.STALE_DEVICE_THRESHOLD_DAYS, DEFAULT_STALE_THRESHOLD_DAYS);
  const taskDays = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.TASK_EXPIRY_DAYS, DEFAULT_TASK_EXPIRY_DAYS);

  if (staleDeviceThresholdInputElem) staleDeviceThresholdInputElem.value = staleDays;
  if (taskExpiryInputElem) taskExpiryInputElem.value = taskDays;
}

function setupAdvancedTimingListeners() {
  if (staleDeviceThresholdInputElem) {
    staleDeviceThresholdInputElem.addEventListener('change', async (e) => {
      let val = parseInt(e.target.value, 10);
      if (isNaN(val) || val < 1) val = DEFAULT_STALE_THRESHOLD_DAYS;
      staleDeviceThresholdInputElem.value = val;
      await storage.set(browser.storage.sync, SYNC_STORAGE_KEYS.STALE_DEVICE_THRESHOLD_DAYS, val);
    });
  }
  if (taskExpiryInputElem) {
    taskExpiryInputElem.addEventListener('change', async (e) => {
      let val = parseInt(e.target.value, 10);
      if (isNaN(val) || val < 1) val = DEFAULT_TASK_EXPIRY_DAYS;
      taskExpiryInputElem.value = val;
      await storage.set(browser.storage.sync, SYNC_STORAGE_KEYS.TASK_EXPIRY_DAYS, val);
    });
  }
}

export function setupAdvancedTiming() {
  staleDeviceThresholdInputElem = document.getElementById("staleDeviceThresholdInput");
  taskExpiryInputElem = document.getElementById("taskExpiryInput");

  setupAdvancedTimingListeners();
  loadAdvancedTimingSettings();
}