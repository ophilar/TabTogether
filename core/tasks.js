import { storage } from "./storage.js";
import { LOCAL_STORAGE_KEYS } from "../common/constants.js";
import { db } from "../background/firebase-transport.js";
import { ref, push } from "firebase/database";

async function getOrCreateSenderId() {
  let senderId = await storage.get(browser.storage.local, "senderId");
  if (!senderId) {
    senderId = crypto.randomUUID();
    await storage.set(browser.storage.local, "senderId", senderId);
  }
  return senderId;
}

// Placeholder for UI compatibility
export async function processSubscribedGroupTasks() {
  console.log("processSubscribedGroupTasks called. In the new Firebase architecture, syncing is real-time via listenForTabs.");
}

export async function createAndStoreGroupTask(groupName, tabData) {
  // In the new architecture, we only sync to one single group room based on groupId.
  // The groupName parameter is kept for backward compatibility with UI if needed,
  // but the transport will just use the globally synced groupId.

  try {
    const { groupId, encryptionKey } = await browser.storage.sync.get(["groupId", "encryptionKey"]);
    if (!groupId || !encryptionKey) {
      return { success: false, message: "Sync keys not initialized." };
    }

    // Re-import the key from storage
    const importedKey = await crypto.subtle.importKey(
      "raw",
      new Uint8Array(encryptionKey),
      "AES-GCM",
      false,
      ["encrypt"]
    );

    // Generate unique IV
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encodedUrl = new TextEncoder().encode(tabData.url);

    // Encrypt
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      importedKey,
      encodedUrl
    );

    const senderId = await getOrCreateSenderId();

    // Push to Firebase
    const groupRef = ref(db, `groups/${groupId}/tabs`);
    await push(groupRef, {
      iv: Array.from(iv),
      data: Array.from(new Uint8Array(ciphertext)),
      timestamp: Date.now(),
      senderId: senderId
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to send tab via Firebase:", error);
    return { success: false, message: error.message };
  }
}
