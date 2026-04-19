import { LOCAL_STORAGE_KEYS, BACKGROUND_DEFAULT_TASK_EXPIRY_DAYS } from "../common/constants.js";
import { storage } from "../core/storage.js";
import { setupAlarms } from "./alarms.js";
import { updateContextMenu } from "./context-menus.js";
import { auth, listenForTabs } from "./firebase-transport.js";
import { signInAnonymously } from "firebase/auth";

export async function initializeExtension() {
  console.log("Background: Initializing TabTogether (Advanced)...");
  try {
    console.log("Background: Initializing storage...");

    let { groupId, encryptionKey } = await browser.storage.sync.get(["groupId", "encryptionKey"]);

    // If missing, this is the first device. Generate keys.
    if (!groupId || !encryptionKey) {
      groupId = crypto.randomUUID();

      const key = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
      );

      const exportedKey = await crypto.subtle.exportKey("raw", key);
      encryptionKey = Array.from(new Uint8Array(exportedKey)); // Convert to standard array for storage.sync

      await browser.storage.sync.set({ groupId, encryptionKey });
    }

    // Authenticate with Firebase Anonymously
    await signInAnonymously(auth);

    // Start listening for incoming tabs
    listenForTabs(groupId, encryptionKey);

    const recentlyOpenedUrls = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.RECENTLY_OPENED_URLS, null);
    if (recentlyOpenedUrls === null) {
      console.log("Background: Initializing RECENTLY_OPENED_URLS to {}.");
      await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.RECENTLY_OPENED_URLS, {});
    }
    await setupAlarms();
    if (browser.contextMenus) {
      await updateContextMenu();
    } else {
      console.warn("Background:initializeExtension - ContextMenus API is not available. Context menu features will be disabled.");
    }
    console.log(`Background: Initialization complete.`);
  } catch (error) {
    console.error("Background: CRITICAL ERROR during initializeExtension:", error);
  }
}

export function initInitialization() {
  browser.runtime.onInstalled.addListener(initializeExtension);
  browser.runtime.onStartup.addListener(initializeExtension);
}
