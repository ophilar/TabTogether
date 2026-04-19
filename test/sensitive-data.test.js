// test/sensitive-data.test.js
import { jest } from '@jest/globals';
import { storage } from "../core/storage.js";
import { LOCAL_STORAGE_KEYS } from "../common/constants.js";

// Mock the transport to simulate failure
jest.unstable_mockModule("../background/firebase-transport.js", () => ({
  getFirebaseDb: jest.fn(() => { throw new Error("Mock Firebase Error"); })
}));

// Dynamic import
const { createAndStoreGroupTask } = await import("../core/tasks.js");

describe("Sensitive Data Sanitation", () => {
  let consoleSpy;

  beforeEach(async () => {
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.SYNC_PASSWORD, "secret-pass");
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.SENDER_ID, "sender-123");
    jest.clearAllMocks();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  test("createAndStoreGroupTask does not leak raw URL in error logs", async () => {
    const sensitiveUrl = "https://private-user-data.com/secret";
    await createAndStoreGroupTask("group-1", { url: sensitiveUrl });

    expect(consoleSpy).toHaveBeenCalled();
    const errorMessage = consoleSpy.mock.calls[0].join(" ");
    
    // Should NOT contain the URL or common secret fragments
    expect(errorMessage).not.toContain(sensitiveUrl);
    expect(errorMessage).not.toContain("private-user-data");
  });

  test("createAndStoreGroupTask error does not leak sync password", async () => {
    await createAndStoreGroupTask("group-1", { url: "https://example.com" });

    const errorMessage = consoleSpy.mock.calls[0].join(" ");
    
    // Password is "secret-pass"
    expect(errorMessage).not.toContain("secret-pass");
  });
});
