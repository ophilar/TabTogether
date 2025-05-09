import { storage } from "../core/storage.js"; // Import storage
import { SYNC_STORAGE_KEYS } from "../common/constants.js"; // Assuming constants are needed
export async function performHeartbeat(
  localInstanceId,
  localInstanceName,
  localGroupBits,
) {
  if (!localInstanceId) {
    console.warn("Heartbeat skipped: Instance ID not available yet.");
    return;
  }
  console.log(`Performing heartbeat for ${localInstanceId} (${localInstanceName})...`); // More specific log
  const update = {
    [SYNC_STORAGE_KEYS.DEVICE_REGISTRY]: { // Nest the update under DEVICE_REGISTRY
      [localInstanceId]: {
        name: localInstanceName,
        lastSeen: Date.now(),
        groupBits: localGroupBits,
      },
    },
  };
  console.log('[Heartbeat] Attempting to merge update:', JSON.stringify(update)); // Log the data being merged
  await storage.mergeSyncStorage(
    update
  );
  // Removed ineffective update to cachedDeviceRegistry argument
  console.log("Heartbeat complete.");
}