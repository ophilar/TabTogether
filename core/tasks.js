import { storage } from "../core/storage.js";
import { LOCAL_STORAGE_KEYS } from "../common/constants.js";
import { getFirebaseDb } from "../background/firebase-transport.js";
import { ref, push, serverTimestamp } from "firebase/database";
import { deriveSyncKey, encryptPayload } from "./crypto.js";

/**
 * Creates and stores a new task (tab sync) in Firebase.
 */
export async function createAndStoreGroupTask(groupId, tabData) {
  try {
    const syncPassword = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SYNC_PASSWORD);
    const senderId = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SENDER_ID);
    const nickname = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.DEVICE_NICKNAME, "Unknown Device");

    if (!groupId || !syncPassword || !senderId) {
      console.error("Sync configuration incomplete.");
      return { success: false, message: "Sync configuration incomplete." };
    }

    const url = tabData.url;
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { success: false, message: "Unsafe URL protocol." };
      }
    } catch {
      return { success: false, message: "Invalid URL." };
    }

    const derivedKey = await deriveSyncKey(syncPassword, groupId);
    const { iv, data } = await encryptPayload(url, derivedKey);

    const db = getFirebaseDb();
    const groupRef = ref(db, `groups/${groupId}/tabs`);
    
    await push(groupRef, {
      iv: Array.from(iv),
      data: Array.from(data),
      timestamp: serverTimestamp(),
      senderId: senderId,
      nickname: nickname
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to store task in Firebase: [REDACTED]");
    return { success: false, message: "Encryption or Transport error." };
  }
}

/**
 * Ensures a persistent senderId exists in local storage.
 */
export async function getOrCreateSenderId() {
  let senderId = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SENDER_ID);
  if (!senderId) {
    senderId = crypto.randomUUID();
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.SENDER_ID, senderId);
  }
  return senderId;
}
