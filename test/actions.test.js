import { jest } from '@jest/globals';
import { storage } from "../core/storage.js";
import { LOCAL_STORAGE_KEYS } from "../common/constants.js";

// Mock Firebase dependency in actions.js
jest.unstable_mockModule("../background/firebase-transport.js", () => ({
  getGroupMembers: jest.fn().mockResolvedValue(["Member 1", "Member 2"]),
}));

const { 
  createGroupDirect, 
  deleteGroupDirect, 
  renameGroupDirect, 
  getUnifiedState, 
  subscribeToGroupDirect, 
  unsubscribeFromGroupDirect,
  createGroupUnified,
  deleteGroupUnified,
  renameGroupUnified,
  subscribeToGroupUnified,
  unsubscribeFromGroupUnified
} = await import("../core/actions.js");

describe("User Actions - Group Management", () => {
  beforeEach(async () => {
    await browser.storage.local.clear();
    jest.clearAllMocks();
  });

  test("getUnifiedState retrieves full app state", async () => {
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, ["Group A"]);
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.DEVICE_NICKNAME, "My Laptop");
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.TAB_HISTORY, [{ url: "https://test.com" }]);

    const state = await getUnifiedState(false);
    
    expect(state.subscriptions).toEqual(["Group A"]);
    expect(state.nickname).toBe("My Laptop");
    expect(state.history).toHaveLength(1);
    expect(state.groupMembers["Group A"]).toEqual(["Member 1", "Member 2"]);
  });

  test("createGroupDirect adds to subscriptions", async () => {
    await createGroupDirect("My Team");
    
    const subs = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS);
    expect(subs).toContain("My Team");
  });

  test("createGroupDirect handles invalid input", async () => {
    const res = await createGroupDirect("");
    expect(res.success).toBe(false);
  });

  test("deleteGroupDirect removes from subscriptions", async () => {
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, ["A", "B"]);
    
    await deleteGroupDirect("A");
    
    const subs = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS);
    expect(subs).toEqual(["B"]);
  });

  test("renameGroupDirect updates subscription name", async () => {
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, ["Old"]);
    
    await renameGroupDirect("Old", "New");
    
    const subs = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS);
    expect(subs).toEqual(["New"]);
  });

  test("renameGroupDirect does nothing if group doesn't exist", async () => {
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, ["Keep"]);
    
    await renameGroupDirect("Missing", "New");
    
    const subs = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS);
    expect(subs).toEqual(["Keep"]);
  });

  test("subscribeToGroupDirect adds new subscription", async () => {
    await subscribeToGroupDirect("New Group");
    const subs = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS);
    expect(subs).toContain("New Group");
  });

  test("unsubscribeFromGroupDirect removes subscription", async () => {
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, ["A"]);
    await unsubscribeFromGroupDirect("A");
    const subs = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS);
    expect(subs).not.toContain("A");
  });

  test("Unified actions call direct actions on Android", async () => {
    // This is a simple test for branches
    const res = await createGroupUnified("Android Group", true);
    expect(res.newGroup).toBe("Android Group");
    const subs = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS);
    expect(subs).toContain("Android Group");
  });

  test("Unified actions send messages on Desktop", async () => {
    await createGroupUnified("Desktop Group", false);
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ action: "createGroup" }));
    
    await deleteGroupUnified("Group", false);
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ action: "deleteGroup" }));

    await renameGroupUnified("Old", "New", false);
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ action: "renameGroup" }));

    await subscribeToGroupUnified("Sub", false);
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ action: "subscribeToGroup" }));

    await unsubscribeFromGroupUnified("Unsub", false);
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ action: "unsubscribeFromGroup" }));
  });
});
