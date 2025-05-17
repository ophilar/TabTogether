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
  const update = { [SYNC_STORAGE_KEYS.DEVICE_REGISTRY]: { [localInstanceId]: { name: localInstanceName, lastSeen: Date.now() } } };
  console.log('[Heartbeat] Attempting to merge update:', JSON.stringify(update));
  await storage.mergeSyncStorage(update);
  console.log("Heartbeat complete.");
}