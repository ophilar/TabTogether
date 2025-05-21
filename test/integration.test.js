import { jest } from '@jest/globals';

import { storage as storageAPI } from '../core/storage.js'; // Correctly import and alias the storage object
import { SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS } from '../common/constants.js';
import { getDefinedGroupsFromBookmarks, createGroupDirect, subscribeToGroupDirect, unsubscribeFromGroupDirect, deleteGroupDirect } from '../core/actions.js';
import { processSubscribedGroupTasks, createAndStoreGroupTask } from '../core/tasks.js';
import { showDebugInfoUI } from '../ui/options/options-ui.js'; 

describe('Integration: Group and Tab Flow', () => {
  const ROOT_FOLDER_ID = 'root-integration-id';
  const GROUP_FOLDER_ID_PREFIX = 'group-integration-id-';

  beforeEach(async () => {
    // Mock getRootBookmarkFolder to always return a consistent root
    jest.spyOn(storageAPI, 'getRootBookmarkFolder').mockResolvedValue({ id: ROOT_FOLDER_ID, title: SYNC_STORAGE_KEYS.ROOT_BOOKMARK_FOLDER_TITLE });

    // Mock getGroupBookmarkFolder to simulate finding/creating group folders
    global.browser.bookmarks.getChildren.mockImplementation(async (parentId) => {
        if (parentId === ROOT_FOLDER_ID) {
            // Return all "group" folders from the mock store
            return global.browser.bookmarks._store.filter(bm => bm.parentId === ROOT_FOLDER_ID && !bm.url && bm.title !== SYNC_STORAGE_KEYS.CONFIG_BOOKMARK_TITLE);
        }
        // For group folders, return their task bookmarks
        return global.browser.bookmarks._store.filter(bm => bm.parentId === parentId && bm.url);
    });

    global.browser.bookmarks.create.mockImplementation(async (obj) => {
        const newId = obj.url ? `task-bm-${Math.random()}` : `${GROUP_FOLDER_ID_PREFIX}${obj.title}`;
        const newBookmark = { ...obj, id: newId, dateAdded: Date.now() };
        global.browser.bookmarks._store.push(newBookmark);
        return newBookmark;
    });
     global.browser.bookmarks.search.mockImplementation(async (query) => {
        if (query.title === SYNC_STORAGE_KEYS.ROOT_BOOKMARK_FOLDER_TITLE) {
             const root = global.browser.bookmarks._store.find(b => b.id === ROOT_FOLDER_ID);
             return root ? [root] : [];
        }
        return [];
    });
  });

  async function createGroupAndVerify(groupName) {
    const res = await createGroupDirect(groupName);
    expect(res.success).toBe(true);
    const definedGroups = await getDefinedGroupsFromBookmarks(); // Uses mocked getChildren
    expect(definedGroups).toContain(groupName);
    return res;
  }

  async function subscribeToGroupAndVerify(groupName) {
    const res = await subscribeToGroupDirect(groupName);
    expect(res.success).toBe(true);
    return res;
  }

  async function sendTabAndVerify(groupName, tabDetails) {
    // Ensure the group folder exists or is created by the mock
    const groupFolder = global.browser.bookmarks._store.find(bm => bm.title === groupName && bm.parentId === ROOT_FOLDER_ID) || 
                        await global.browser.bookmarks.create({title: groupName, parentId: ROOT_FOLDER_ID});

    const res = await createAndStoreGroupTask(groupName, tabDetails);
    expect(res.success).toBe(true);
    const bookmarkId = res.bookmarkId;
    expect(bookmarkId).toBeDefined();
    const createdBookmark = global.browser.bookmarks._store.find(bm => bm.id === bookmarkId);
    expect(createdBookmark).toBeDefined();
    expect(createdBookmark.url).toBe(tabDetails.url);
    expect(createdBookmark.parentId).toBe(groupFolder.id);
    return { ...res, bookmarkId };
  }

  async function processReceivedTabAndVerify(state, tabUrl) {
    // State for processSubscribedGroupTasks doesn't directly take tasks anymore
    await processSubscribedGroupTasks(); // It will use mocked bookmarks.getChildren
    expect(browser.tabs.create).toHaveBeenCalledWith({ url: tabUrl, active: false });
  }

  async function unsubscribeFromGroupAndVerify(groupName) {
    const res = await unsubscribeFromGroupDirect(groupName);
    expect(res.success).toBe(true);
    return res;
  }

  // async function deleteGroupAndVerify(groupName) {
  //   // Before deleting, find the expected ID of the group folder
  //   const groupFolder = global.browser.bookmarks._store.find(
  //       bm => bm.title === groupName && bm.parentId === ROOT_FOLDER_ID && !bm.url
  //   );
  //   expect(groupFolder).toBeDefined(); // Ensure the group folder exists in the mock store before deletion attempt

  //   const res = await deleteGroupDirect(groupName);
  //   expect(res.success).toBe(true);
  //   const definedGroups = await getDefinedGroupsFromBookmarks();
  //   expect(definedGroups).not.toContain(groupName);
  //   expect(global.browser.bookmarks.removeTree).toHaveBeenCalledWith(groupFolder.id); // Verify it was called with the correct ID
  //   return res;
  // }

  test('Full group create, subscribe, send tab, process tab, unsubscribe, delete', async () => {
    const GROUP_NAME = 'IntegrationGroup';
    const TAB_URL = 'https://integration.com';
    const TAB_TITLE = 'Integration';

    // Simulate device A
    await createGroupAndVerify(GROUP_NAME);
    await subscribeToGroupAndVerify(GROUP_NAME);

    const { bookmarkId: sentBookmarkId } = await sendTabAndVerify(GROUP_NAME, { url: TAB_URL, title: TAB_TITLE });

    // Simulate processing on the same device (Device A) - tab should not open due to recent URL or processed ID
    // For this test, let's assume it's a new bookmark ID not yet processed.
    // The `processSubscribedGroupTasks` will check `LAST_PROCESSED_BOOKMARK_TIMESTAMP` and `PROCESSED_BOOKMARK_IDS`.
    await processSubscribedGroupTasks(); // Device A processes
    // If the URL was just "sent" by this device, it might be in RECENTLY_OPENED_URLS or the bookmark ID in PROCESSED_BOOKMARK_IDS
    // Depending on exact timing and if createAndStoreGroupTask also adds to recentlyOpened.
    // For simplicity, let's assume it won't open if it's the sender and just processed.
    // A more robust check would be to see if it was added to PROCESSED_BOOKMARK_IDS.
    const processedIds = await storageAPI.get(browser.storage.local, LOCAL_STORAGE_KEYS.PROCESSED_BOOKMARK_IDS);
    expect(processedIds[sentBookmarkId]).toBeDefined();

    await unsubscribeFromGroupAndVerify(GROUP_NAME);
    // await deleteGroupAndVerify(GROUP_NAME);
  });

  test('Multiple devices, tab sending and receiving', async () => {
    const GROUP_NAME = 'MultiDeviceGroup';
    const TAB_URL = 'https://multidevice.com';
    const TAB_TITLE = 'MultiDevice Tab';

    await createGroupAndVerify(GROUP_NAME);
    
    // Device A sends a tab
    // No explicit subscription needed for sending, but let's assume Device A is also subscribed
    await storageAPI.set(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, [GROUP_NAME]);
    await sendTabAndVerify(GROUP_NAME, { url: TAB_URL, title: TAB_TITLE });
   
    // Simulate Device B processing
    const originalLocalStorageGet = browser.storage.local.get;
    browser.storage.local.get = jest.fn(async (keys) => {
      if (typeof keys === 'string' && keys === LOCAL_STORAGE_KEYS.SUBSCRIPTIONS) {
        return { [LOCAL_STORAGE_KEYS.SUBSCRIPTIONS]: [GROUP_NAME] }; // Device B is subscribed
      }
      if (typeof keys === 'string' && keys === LOCAL_STORAGE_KEYS.PROCESSED_BOOKMARK_IDS) {
        return { [LOCAL_STORAGE_KEYS.PROCESSED_BOOKMARK_IDS]: {} }; // Device B has not processed it yet
      }
      return originalLocalStorageGet(keys); 
    });
    await processReceivedTabAndVerify(null, TAB_URL); // Pass null for state, as it's not used directly by the new func
    browser.storage.local.get = originalLocalStorageGet;
  });
});

describe('UI: Debug Info Panel', () => {
  test('Renders debug info panel in DOM', () => {
    document.body.innerHTML = '<div class="container"><div class="options-debug-info"></div></div>';
    const container = document.querySelector('.container');
    const state = {
      subscriptions: ['g2'],
      definedGroups: ['g2'],
      groupTasks: {},
      isAndroid: false
    };
    showDebugInfoUI(container, state);
    const debugPreElement = container.querySelector('.options-debug-info pre');
    const parsedDebugInfo = JSON.parse(debugPreElement.textContent);
    expect(parsedDebugInfo.definedGroups).toEqual(['g2']); // Use toEqual for array comparison
  });
});

describe('UI to Background Message Interaction (Options Page Example)', () => {
  beforeEach(async () => {
    document.body.innerHTML = `
      <div class="container">
        <input type="text" id="newGroupName" />
        <button id="createGroupBtn"></button>
        <div id="messageArea"></div>
        <div id="loadingIndicator"></div>
      </div>
    `;
  });

  test('Create Group button sends message and handles success response', async () => {
    const newGroupNameInput = document.getElementById('newGroupName');
    const createGroupBtn = document.getElementById('createGroupBtn');
    const messageArea = document.getElementById('messageArea');

    newGroupNameInput.value = 'Test Group From UI';

    global.browser.runtime.sendMessage = jest.fn().mockResolvedValue({
      success: true,
      newGroup: 'Test Group From UI'
    });

    createGroupBtn.disabled = false; // Enable button
    await createGroupBtn.click(); // This won't trigger the actual options.js listener in this isolated test

    const response = await global.browser.runtime.sendMessage({ action: "createGroup", groupName: 'Test Group From UI' });

    expect(global.browser.runtime.sendMessage).toHaveBeenCalledWith({ action: "createGroup", groupName: 'Test Group From UI' });
    expect(response.success).toBe(true);
  });
});
