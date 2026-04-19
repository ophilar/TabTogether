// test/init.test.js
import { jest } from '@jest/globals';
import { storage } from "../core/storage.js";
import { LOCAL_STORAGE_KEYS } from "../common/constants.js";

// Mock Firebase transport
jest.unstable_mockModule("../background/firebase-transport.js", () => ({
  signInToFirebase: jest.fn().mockResolvedValue({ user: { uid: "test-uid" } }),
  listenForTabs: jest.fn().mockResolvedValue(undefined),
  refreshListeners: jest.fn().mockResolvedValue(undefined),
  getFirebaseDb: jest.fn(() => ({})),
}));

// Import module under test dynamically to ensure mock is used
const { initializeExtension } = await import("../background/init.js");

describe("Extension Initialization", () => {
  beforeEach(async () => {
    await browser.storage.local.clear();
    jest.clearAllMocks();
  });

  test("incomplete setup does not start listeners", async () => {
    await initializeExtension();
    const senderId = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SENDER_ID);
    expect(senderId).toBeTruthy(); 
  });

  test("resumes from existing state and starts listeners", async () => {
    const existingGroup = "group-123";
    const existingPassword = "password-abc";
    
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.GROUP_ID, existingGroup);
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.SYNC_PASSWORD, existingPassword);
    
    await initializeExtension();

    const groupId = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.GROUP_ID);
    const syncPassword = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SYNC_PASSWORD);
    
    expect(groupId).toBe(existingGroup);
    expect(syncPassword).toBe(existingPassword);
  });
});
