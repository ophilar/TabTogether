// test/firebase-transport.test.js
import { jest } from '@jest/globals';
import { storage } from "../core/storage.js";
import { deriveSyncKey, encryptPayload } from "../core/crypto.js";
import { LOCAL_STORAGE_KEYS } from "../common/constants.js";

// Mock firebase before importing transport
jest.unstable_mockModule("firebase/app", () => ({
  initializeApp: jest.fn(),
}));
jest.unstable_mockModule("firebase/auth", () => ({
  getAuth: jest.fn(),
  signInAnonymously: jest.fn(),
  connectAuthEmulator: jest.fn(),
}));
jest.unstable_mockModule("firebase/database", () => ({
  getDatabase: jest.fn(),
  ref: jest.fn(),
  push: jest.fn(),
  onChildAdded: jest.fn(),
  remove: jest.fn().mockResolvedValue(undefined),
  connectDatabaseEmulator: jest.fn(),
  query: jest.fn(),
  orderByChild: jest.fn(),
  endAt: jest.fn(),
  get: jest.fn(),
  onValue: jest.fn(),
  set: jest.fn(),
  serverTimestamp: jest.fn(() => Date.now())
}));

const { handleIncomingTab } = await import("../background/firebase-transport.js");

jest.setTimeout(20000);

describe("Firebase Transport Integration", () => {
  const syncPassword = "test-password";
  const groupId = "group-123";
  let derivedKey;

  beforeEach(async () => {
    await browser.storage.local.clear();
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.SENDER_ID, "local-id");
    derivedKey = await deriveSyncKey(syncPassword, groupId);
    jest.clearAllMocks();
  });

  test("handleIncomingTab successfully decrypts and opens valid URL", async () => {
    const url = "https://verified.com";
    const { iv, data } = await encryptPayload(url, derivedKey);

    const payload = {
      iv: Array.from(iv),
      data: Array.from(data),
      senderId: "remote-id",
      timestamp: Date.now()
    };

    // Call the REAL handler
    await handleIncomingTab(payload, "tab-1", groupId, derivedKey);

    // Verify side effects
    expect(browser.tabs.create).toHaveBeenCalledWith({ url });
    
    // Verify history update
    const history = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.TAB_HISTORY);
    expect(history[0].url).toBe(url);
  });

  test("handleIncomingTab rejects echo", async () => {
    const payload = { senderId: "local-id" }; // Matches senderId in storage
    await handleIncomingTab(payload, "tab-1", groupId, derivedKey);
    expect(browser.tabs.create).not.toHaveBeenCalled();
  });

  test("handleIncomingTab rejects stale data", async () => {
    const payload = { timestamp: Date.now() - 5000 };
    const startTime = Date.now(); // Listener started after the payload was created
    
    await handleIncomingTab(payload, "tab-1", groupId, derivedKey, startTime);
    expect(browser.tabs.create).not.toHaveBeenCalled();
  });

  test("handleIncomingTab rejects malformed/unsafe decrypted URL", async () => {
    const unsafeUrl = "javascript:alert(1)";
    const { iv, data } = await encryptPayload(unsafeUrl, derivedKey);

    const payload = {
      iv: Array.from(iv),
      data: Array.from(data),
      senderId: "remote-id",
      timestamp: Date.now()
    };

    await handleIncomingTab(payload, "tab-1", groupId, derivedKey);
    expect(browser.tabs.create).not.toHaveBeenCalled();
  });
});
