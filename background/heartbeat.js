import { storage } from "../core/storage.js";
import { SYNC_STORAGE_KEYS } from "../common/constants.js";
import { getInstanceId, getInstanceName } from "../core/instance.js";

export async function performHeartbeat() {
  const localInstanceId = await getInstanceId();
  const localInstanceName = await getInstanceName();

  if (!localInstanceId) {
    console.warn("Heartbeat skipped: Instance ID not available yet.");
    return;
  }
  console.log(`Performing heartbeat for ${localInstanceId} (${localInstanceName})...`);
  const updatePayload = { [localInstanceId]: { name: localInstanceName, lastSeen: Date.now() } };
  // Use mergeItem for a more targeted update to DEVICE_REGISTRY
  console.log('[Heartbeat] Attempting to merge update to DEVICE_REGISTRY:', JSON.stringify(updatePayload));
  await storage.mergeItem(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, updatePayload);
  console.log("Heartbeat complete.");
}