// test/actions.test.js
import { storage } from "../core/storage.js";
import { LOCAL_STORAGE_KEYS } from "../common/constants.js";
import { createGroupDirect, deleteGroupDirect, renameGroupDirect } from "../core/actions.js";

describe("User Actions - Group Management", () => {
  beforeEach(async () => {
    await browser.storage.local.clear();
  });

  test("createGroupDirect adds to subscriptions", async () => {
    await createGroupDirect("My Team");
    
    const subs = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS);
    expect(subs).toContain("My Team");
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
});
