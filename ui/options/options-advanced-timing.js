import { SYNC_STORAGE_KEYS } from "../../common/constants.js";
import { storage } from "../../core/storage.js";

const DEFAULT_TASK_EXPIRY_DAYS = 30;
let taskExpiryInputElem = null;

async function loadAdvancedTimingSettings() {
  const taskDays = await storage.getConfigValue(SYNC_STORAGE_KEYS.TASK_EXPIRY_DAYS, DEFAULT_TASK_EXPIRY_DAYS);
  if (taskExpiryInputElem) taskExpiryInputElem.value = taskDays;
}

function setupAdvancedTimingListeners() {
  if (taskExpiryInputElem) {
    taskExpiryInputElem.addEventListener('change', async (e) => {
      let val = parseInt(e.target.value, 10);
      if (isNaN(val) || val < 1) val = DEFAULT_TASK_EXPIRY_DAYS;
      taskExpiryInputElem.value = val;
      await storage.setConfigValue(SYNC_STORAGE_KEYS.TASK_EXPIRY_DAYS, val);
    });
  }
}

export function setupAdvancedTiming() {
  taskExpiryInputElem = document.getElementById("taskExpiryInput");

  setupAdvancedTimingListeners();
  loadAdvancedTimingSettings();
}