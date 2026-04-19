import { storage } from "../core/storage.js";
import { LOCAL_STORAGE_KEYS } from "../common/constants.js";
import { signInToFirebase, listenForTabs } from "./firebase-transport.js";
import { getOrCreateSenderId } from "../core/tasks.js";

/**
 * Main initialization entry point for the extension.
 */
export async function initializeExtension() {
  console.log("Background: Initializing TabTogether...");

  try {
    // 1. Ensure Persistent Device ID (for echo prevention)
    await getOrCreateSenderId();

    // 2. Sync Configuration (End-to-End Encryption Setup)
    const groupId = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.GROUP_ID);
    const syncPassword = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SYNC_PASSWORD);

    if (!groupId || !syncPassword) {
      console.log("Background: Setup incomplete. Waiting for Group ID and Master Sync Password...");
      // We don't generate them automatically anymore; the user must configure them in Options.
    } else {
      // 3. Connect to Transport Layer (Firebase)
      console.log("Background: Connecting to Firebase transport...");
      await signInToFirebase();

      // 4. Start Listening for Incoming Tabs
      await listenForTabs(groupId, syncPassword);
      console.log("Background: TabTogether initialization complete. Syncing enabled.");
    }

  } catch (error) {
    console.error("Background: Critical initialization failure:", error);
  }
}

/**
 * Wires the initialization logic to extension lifecycle events.
 */
export function initInitialization() {
  browser.runtime.onInstalled.addListener(initializeExtension);
  browser.runtime.onStartup.addListener(initializeExtension);
  
  // Also run immediately in case the extension was just reloaded/activated
  initializeExtension();
}
