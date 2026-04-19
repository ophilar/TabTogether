import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getDatabase, ref, push, onChildAdded, remove } from "firebase/database";

// Use an environment variable or placeholder for Firebase Config
const firebaseConfig = {
  // TODO: Add actual firebase config
  databaseURL: "https://tabtogether-placeholder.firebaseio.com",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);

import { storage } from "../core/storage.js";

export function listenForTabs(groupId, encryptionKeyArray) {
  const groupRef = ref(db, `groups/${groupId}/tabs`);

  onChildAdded(groupRef, async (snapshot) => {
    const payload = snapshot.val();
    const tabId = snapshot.key;

    try {
      const localSenderId = await storage.get(browser.storage.local, "senderId");
      if (payload.senderId && payload.senderId === localSenderId) {
        // Ignore tabs sent by this device to prevent local echo
        return;
      }

      // 1. Re-import key
      const importedKey = await crypto.subtle.importKey(
        "raw",
        new Uint8Array(encryptionKeyArray),
        "AES-GCM",
        false,
        ["decrypt"]
      );

      // 2. Decrypt
      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(payload.iv) },
        importedKey,
        new Uint8Array(payload.data)
      );

      const url = new TextDecoder().decode(decryptedBuffer);

      // 3. Open the tab
      await browser.tabs.create({ url: url });

      // 4. Clean up (Delete from Firebase so it's a one-time delivery)
      const specificTabRef = ref(db, `groups/${groupId}/tabs/${tabId}`);
      await remove(specificTabRef);

    } catch (error) {
      console.error("Failed to decrypt or open tab:", error);
    }
  });
}
