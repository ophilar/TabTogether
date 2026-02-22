import { jest } from '@jest/globals';
import { processSubscribedGroupTasks, createAndStoreGroupTask } from '../core/tasks.js';
import { LOCAL_STORAGE_KEYS } from '../common/constants.js';

describe('Security Logging Tests', () => {
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.clearAllMocks();

    // Setup default mock responses for common storage calls
    browser.storage.local.get.mockImplementation(async (keyOrKeys) => {
      const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
      const result = {};
      if (keys.includes(LOCAL_STORAGE_KEYS.SUBSCRIPTIONS)) result[LOCAL_STORAGE_KEYS.SUBSCRIPTIONS] = ['TestGroup'];
      if (keys.includes(LOCAL_STORAGE_KEYS.LAST_PROCESSED_BOOKMARK_TIMESTAMP)) result[LOCAL_STORAGE_KEYS.LAST_PROCESSED_BOOKMARK_TIMESTAMP] = 0;
      if (keys.includes(LOCAL_STORAGE_KEYS.PROCESSED_BOOKMARK_IDS)) result[LOCAL_STORAGE_KEYS.PROCESSED_BOOKMARK_IDS] = {};
      if (keys.includes(LOCAL_STORAGE_KEYS.RECENTLY_OPENED_URLS)) result[LOCAL_STORAGE_KEYS.RECENTLY_OPENED_URLS] = {};
      if (keys.includes(LOCAL_STORAGE_KEYS.DEVICE_NICKNAME)) result[LOCAL_STORAGE_KEYS.DEVICE_NICKNAME] = 'TestDevice';

      if (typeof keyOrKeys === 'string') return { [keyOrKeys]: result[keyOrKeys] };
      return result;
    });

    // Setup bookmarks tree for finding root and group
    const rootId = 'root_folder_id';
    const groupId = 'group_folder_id';

    browser.bookmarks.getTree.mockResolvedValue([{
        id: 'root',
        children: [{
            id: 'menu',
            children: [{
                id: rootId,
                title: 'TabTogetherData',
                children: [{
                    id: groupId,
                    title: 'TestGroup'
                }]
            }]
        }]
    }]);

    browser.bookmarks.getChildren.mockImplementation(async (id) => {
        if (id === rootId) return [{ id: groupId, title: 'TestGroup' }];
        if (id === groupId) return []; // Default empty group
        return [];
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  test('processSubscribedGroupTasks should not log sensitive URLs', async () => {
    const sensitiveUrl = 'https://example.com/sensitive-token=123';

    // Override getChildren to return a sensitive task
    const groupId = 'group_folder_id';
    browser.bookmarks.getChildren.mockImplementation(async (id) => {
        if (id === 'root_folder_id') return [{ id: groupId, title: 'TestGroup' }];
        if (id === groupId) {
            return [{
                id: 'task1',
                url: sensitiveUrl,
                title: 'Sensitive Task',
                dateAdded: Date.now()
            }];
        }
        return [];
    });

    await processSubscribedGroupTasks();

    const allArgs = consoleLogSpy.mock.calls.flat().join(' ');
    const allErrors = consoleErrorSpy.mock.calls.flat().join(' ');

    // It should try to open the tab (logged) but NOT include the URL
    // Note: Since we haven't fixed it yet, this test is expected to FAIL if run now (asserting it doesn't contain).
    // Or pass if we assert it DOES contain (repro).
    // The plan is to fix it then run it. But running it now helps confirm the issue.

    // For now, I'm writing the test that enforces the secure behavior.
    expect(allArgs).not.toContain(sensitiveUrl);
    expect(allErrors).not.toContain(sensitiveUrl);
  });

  test('processSubscribedGroupTasks should not log sensitive URLs during deduplication', async () => {
    const sensitiveUrl = 'https://example.com/sensitive-token=456';

    // Override storage to simulate recently opened
    browser.storage.local.get.mockImplementation(async (keyOrKeys) => {
        if (keyOrKeys === LOCAL_STORAGE_KEYS.RECENTLY_OPENED_URLS) {
            return { [LOCAL_STORAGE_KEYS.RECENTLY_OPENED_URLS]: { [sensitiveUrl]: Date.now() } };
        }
        // Fallback to default mock (but need to copy logic or call it? simpler to just repeat essential parts)
        if (keyOrKeys === LOCAL_STORAGE_KEYS.SUBSCRIPTIONS) return { [LOCAL_STORAGE_KEYS.SUBSCRIPTIONS]: ['TestGroup'] };
        return {};
    });

    const groupId = 'group_folder_id';
    browser.bookmarks.getChildren.mockImplementation(async (id) => {
        if (id === 'root_folder_id') return [{ id: groupId, title: 'TestGroup' }];
        if (id === groupId) {
            return [{
                id: 'task1',
                url: sensitiveUrl,
                title: 'Sensitive Task',
                dateAdded: Date.now()
            }];
        }
        return [];
    });

    await processSubscribedGroupTasks();

    const allArgs = consoleLogSpy.mock.calls.flat().join(' ');
    expect(allArgs).not.toContain(sensitiveUrl);
  });

  test('createAndStoreGroupTask should not log sensitive URLs', async () => {
    const sensitiveUrl = 'https://example.com/sensitive-token=789';
    const groupName = 'TestGroup';
    const tabData = { url: sensitiveUrl, title: 'Sensitive Tab' };

    browser.bookmarks.create.mockResolvedValue({ id: 'newBookmark1', url: sensitiveUrl, title: 'Sensitive Tab' });

    await createAndStoreGroupTask(groupName, tabData);

    const allArgs = consoleLogSpy.mock.calls.flat().join(' ');
    const allErrors = consoleErrorSpy.mock.calls.flat().join(' ');

    expect(allArgs).not.toContain(sensitiveUrl);
    expect(allErrors).not.toContain(sensitiveUrl);
  });
});
