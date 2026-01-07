import { jest } from '@jest/globals';
import { SYNC_STORAGE_KEYS } from '../common/constants.js';
import { storage } from '../core/storage.js';

describe('Bookmark Discovery (Android Compatibility)', () => {
    let consoleLogSpy, consoleWarnSpy;

    beforeEach(async () => {
        jest.resetModules();
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => { });
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });

        await global.browser.bookmarks._resetStore();
        await global.browser.storage.local.clear();
        await global.browser.storage.sync.clear();
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
        consoleWarnSpy.mockRestore();
    });

    test('finds folder via recursive tree search when search API is missing', async () => {
        // 1. Setup a nested structure
        const menu = await global.browser.bookmarks.create({ title: 'Menu', parentId: 'root________' });
        const subFolder = await global.browser.bookmarks.create({ title: 'Games', parentId: menu.id });
        const target = await global.browser.bookmarks.create({ title: SYNC_STORAGE_KEYS.ROOT_BOOKMARK_FOLDER_TITLE, parentId: subFolder.id });

        // 2. Disable search API to simulate Android
        const originalSearch = global.browser.bookmarks.search;
        delete global.browser.bookmarks.search;

        try {
            const found = await storage.getRootBookmarkFolder();
            expect(found).toBeDefined();
            expect(found.id).toBe(target.id);
            expect(found.title).toBe(SYNC_STORAGE_KEYS.ROOT_BOOKMARK_FOLDER_TITLE);
            expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('not found, identifying parent'));
        } finally {
            global.browser.bookmarks.search = originalSearch;
        }
    });

    test('creates root folder in preferred parent if not found', async () => {
        // Setup empty tree with known roots
        const unfiled = await global.browser.bookmarks.create({ id: 'unfiled_____', title: 'Other Bookmarks', parentId: 'root________' });

        // Disable search API
        const originalSearch = global.browser.bookmarks.search;
        delete global.browser.bookmarks.search;

        try {
            const found = await storage.getRootBookmarkFolder();
            expect(found).toBeDefined();
            expect(found.parentId).toBe('unfiled_____');
            expect(found.title).toBe(SYNC_STORAGE_KEYS.ROOT_BOOKMARK_FOLDER_TITLE);
        } finally {
            global.browser.bookmarks.search = originalSearch;
        }
    });

    test('discovers folder across devices (Desktop root vs Mobile root)', async () => {
        // Simulate folder created on Desktop (under unfiled)
        const unfiled = await global.browser.bookmarks.create({ id: 'unfiled_____', title: 'Other Bookmarks', parentId: 'root________' });
        const desktopFolder = await global.browser.bookmarks.create({
            title: SYNC_STORAGE_KEYS.ROOT_BOOKMARK_FOLDER_TITLE,
            parentId: unfiled.id
        });

        // Now "Device 2" (Android) tries to find it. It has a 'mobile' root but should still see the desktop one in the tree.
        const found = await storage.getRootBookmarkFolder();
        expect(found.id).toBe(desktopFolder.id);
    });
});
