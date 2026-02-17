import { jest } from '@jest/globals';
import { SYNC_STORAGE_KEYS } from '../common/constants.js';
import { storage } from '../core/storage.js';

// Mock console.warn to suppress logs during tests
const originalWarn = console.warn;
console.warn = jest.fn();

describe('Performance: Root Folder Caching', () => {

    beforeEach(async () => {
        jest.clearAllMocks();
        await global.browser.bookmarks._resetStore();
    });

    afterAll(() => {
        console.warn = originalWarn;
    });

    test('should reduce expensive getTree calls by caching root folder ID', async () => {
        // 1. Setup: Create the root folder manually so it exists
        const root = await global.browser.bookmarks.create({
            title: SYNC_STORAGE_KEYS.ROOT_BOOKMARK_FOLDER_TITLE,
            parentId: 'root________'
        });

        // 2. First call: Should perform a full tree search (getTree)
        const folder1 = await storage.getRootBookmarkFolder();
        expect(folder1).toBeDefined();
        expect(folder1.id).toBe(root.id);

        // Count how many times getTree was called. Should be 1.
        const getTreeCallsBefore = global.browser.bookmarks.getTree.mock.calls.length;
        expect(getTreeCallsBefore).toBeGreaterThanOrEqual(1);

        // 3. Second call: Should use the cache and verify it via get(id), NOT getTree
        const folder2 = await storage.getRootBookmarkFolder();
        expect(folder2).toBeDefined();
        expect(folder2.id).toBe(root.id);

        // Count getTree calls again. Should be SAME as before (no new calls)
        const getTreeCallsAfter = global.browser.bookmarks.getTree.mock.calls.length;
        expect(getTreeCallsAfter).toBe(getTreeCallsBefore);

        // Verify that bookmarks.get(id) was called to validate cache
        expect(global.browser.bookmarks.get).toHaveBeenCalledWith(root.id);
    });

    test('should recover gracefully if cached folder is deleted externally', async () => {
        // 1. Setup & Prime Cache
        const root = await global.browser.bookmarks.create({
            title: SYNC_STORAGE_KEYS.ROOT_BOOKMARK_FOLDER_TITLE,
            parentId: 'root________'
        });
        await storage.getRootBookmarkFolder(); // Prime the cache

        // 2. Delete the folder externally (simulate user action)
        await global.browser.bookmarks.removeTree(root.id);

        // 3. Call again. Cache validation (get(id)) should fail, forcing a re-search (getTree)
        const getTreeCallsBefore = global.browser.bookmarks.getTree.mock.calls.length;

        const folder2 = await storage.getRootBookmarkFolder();

        // Should have found/created a NEW folder
        expect(folder2).toBeDefined();
        expect(folder2.id).not.toBe(root.id);

        // Should have called getTree again to search
        expect(global.browser.bookmarks.getTree.mock.calls.length).toBeGreaterThan(getTreeCallsBefore);
    });
});
