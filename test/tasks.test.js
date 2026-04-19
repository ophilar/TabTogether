// test/tasks.test.js
import { jest } from '@jest/globals';
import { storage } from "../core/storage.js";
import { LOCAL_STORAGE_KEYS } from "../common/constants.js";

// Increase timeout for PBKDF2
jest.setTimeout(15000);

// Mock the transport dependencies
jest.unstable_mockModule("../background/firebase-transport.js", () => ({
  getFirebaseDb: jest.fn(() => ({})), // Minimal mock
}));

// We must also mock firebase/database functions if they are called directly
jest.unstable_mockModule("firebase/database", () => ({
  ref: jest.fn(),
  push: jest.fn().mockResolvedValue({ key: "task-1" }),
  serverTimestamp: jest.fn(() => Date.now())
}));

// Dynamic import after mocks
const { createAndStoreGroupTask, getOrCreateSenderId } = await import("../core/tasks.js");

describe("Tasks Module", () => {
  const groupId = "test-group-id";
  const syncPassword = "test-sync-password";
  const senderId = "test-sender-id";

  beforeEach(async () => {
    await browser.storage.local.clear();
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.SYNC_PASSWORD, syncPassword);
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.SENDER_ID, senderId);
    jest.clearAllMocks();
  });

  test("createAndStoreGroupTask happy path", async () => {
    const tabData = { url: "https://example.com", title: "Example" };
    const result = await createAndStoreGroupTask(groupId, tabData);

    expect(result.success).toBe(true);
  });

  test("createAndStoreGroupTask rejects invalid URLs", async () => {
    const maliciousUrl = "javascript:alert(1)";
    const result = await createAndStoreGroupTask(groupId, { url: maliciousUrl });

    expect(result.success).toBe(false);
    expect(result.message).toBe("Unsafe URL protocol.");
  });

  test("getOrCreateSenderId reuse existing", async () => {
    const id = await getOrCreateSenderId();
    expect(id).toBe(senderId);
  });

  test("getOrCreateSenderId generates new if missing", async () => {
    await browser.storage.local.clear();
    const id = await getOrCreateSenderId();
    expect(id).toMatch(/[a-f0-9-]{36}/);
  });
});
