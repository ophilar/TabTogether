import { jest } from '@jest/globals';
import { LOCAL_STORAGE_KEYS, SYNC_STORAGE_KEYS } from '../common/constants.js';
import { processSubscribedGroupTasks } from '../core/tasks.js';
import { storage } from '../core/storage.js';

describe.skip('Sync Refinement (Android Compatibility)', () => {
    let consoleLogSpy;

    beforeEach(async () => {
        jest.resetModules();
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => { });
        await global.browser.bookmarks._resetStore();
        await global.browser.storage.local.clear();
        await global.browser.storage.sync.clear();
        
        // Setup initial state: subscribed to 'Group A'
        await global.browser.storage.local.set({
            [LOCAL_STORAGE_KEYS.SUBSCRIPTIONS]: ['Group A'],
            [LOCAL_STORAGE_KEYS.LAST_PROCESSED_BOOKMARK_TIMESTAMP]: 1000 // Last processed at T=1000
        });

        // Setup root folder and group folder
        const root = await global.browser.bookmarks.create({ title: SYNC_STORAGE_KEYS.ROOT_BOOKMARK_FOLDER_TITLE });
        await global.browser.bookmarks.create({ title: 'Group A', parentId: root.id });
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
    });

    test('BUG REPRODUCTION: skipped bookmark with dateAdded <= lastProcessedTimestamp if not processed (PRE-FIX BEHAVIOR)', async () => {
        // This test now verifies that the "skip" NO LONGER happens because we removed the dateAdded check.
        const root = await storage.getRootBookmarkFolder();
        const groupA = (await global.browser.bookmarks.getChildren(root.id)).find(c => c.title === 'Group A');

        const bookmark = await global.browser.bookmarks.create({
            title: 'Late Task',
            url: 'https://example.com/late',
            parentId: groupA.id
        });
        
        const node = global.browser.bookmarks._getStore().find(n => n.id === bookmark.id);
        node.dateAdded = 500; 

        await processSubscribedGroupTasks();

        // The tab SHOULD be opened now because we removed the dateAdded <= lastProcessed check
        expect(global.browser.tabs.create).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://example.com/late' }));
        
        // It SHOULD be marked as processed
        const res = await global.browser.storage.local.get(LOCAL_STORAGE_KEYS.PROCESSED_BOOKMARK_IDS);
        expect(res[LOCAL_STORAGE_KEYS.PROCESSED_BOOKMARK_IDS][bookmark.id]).toBeDefined();
    });

    test('FIX VERIFICATION: should process bookmark if NOT in processed list, regardless of dateAdded (if within cleanup threshold)', async () => {
        const root = await storage.getRootBookmarkFolder();
        const groupA = (await global.browser.bookmarks.getChildren(root.id)).find(c => c.title === 'Group A');

        const bookmark = await global.browser.bookmarks.create({
            title: 'Late Task 2',
            url: 'https://example.com/late2',
            parentId: groupA.id
        });
        const node = global.browser.bookmarks._getStore().find(n => n.id === bookmark.id);
        node.dateAdded = 500; 

        await processSubscribedGroupTasks();

        // We WANT it to open the tab even if dateAdded is old, as long as we haven't seen it in processedIds.
        expect(global.browser.tabs.create).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://example.com/late2' }));
    });
});
