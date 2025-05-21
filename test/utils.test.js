const mockedStringsObject = {
    deviceNameNotSet: '(Not Set)',
    noDevices: 'No devices registered.',
    groupExists: (groupName) => `${groupName} already exists.`,
};

jest.mock('../common/constants.js', () => {
    const actualConstants = jest.requireActual('../common/constants.js');
    return {
        __esModule: true,
        ...actualConstants,
        STRINGS: {
            ...(actualConstants.STRINGS || {}),
            ...mockedStringsObject,
        },
    };
});


import { jest } from '@jest/globals';
import { STRINGS, SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS } from '../common/constants.js';
import { deepMerge, ensureObject } from '../common/utils.js'; 
import { storage } from '../core/storage.js';
import { isAndroid, _clearPlatformInfoCache } from '../core/platform.js';

describe('utils', () => {
    let mockStorage;
    let mockSyncStorage;
    let consoleErrorSpy, consoleWarnSpy, consoleLogSpy;
    let getUnifiedState, createGroupDirect, renameGroupDirect, deleteGroupDirect, subscribeToGroupDirect, unsubscribeFromGroupDirect;
    let createAndStoreGroupTask;
    let performTimeBasedTaskCleanup;


    beforeEach(async () => {
        jest.resetModules();

        const actionsModule = await import('../core/actions.js');
        getUnifiedState = actionsModule.getUnifiedState;
        createGroupDirect = actionsModule.createGroupDirect;
        renameGroupDirect = actionsModule.renameGroupDirect;
        deleteGroupDirect = actionsModule.deleteGroupDirect;
        subscribeToGroupDirect = actionsModule.subscribeToGroupDirect;
        unsubscribeFromGroupDirect = actionsModule.unsubscribeFromGroupDirect;

        const tasksModule = await import('../core/tasks.js');
        createAndStoreGroupTask = tasksModule.createAndStoreGroupTask;

        const cleanupModule = await import('../background/cleanup.js');
        performTimeBasedTaskCleanup = cleanupModule.performTimeBasedTaskCleanup;
        
        if (typeof _clearPlatformInfoCache === 'function') _clearPlatformInfoCache();

        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => { });

        mockStorage = global.browser.storage.local;
        mockSyncStorage = global.browser.storage.sync;
        
        jest.spyOn(global.Math, 'random').mockReturnValue(0.123456789);
        
        await mockStorage.clear();
        await mockSyncStorage.clear();
        await global.browser.bookmarks._resetStore(); // Clear bookmarks
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
        consoleWarnSpy.mockRestore();
        consoleLogSpy.mockRestore();

        jest.spyOn(global.Math, 'random').mockRestore();
    });

    // --- TESTS ---
    describe('Core Utilities', () => {
        test('deepMerge merges deeply and deletes keys', () => {
            const a = { foo: { bar: 1 }, baz: 2 };
            const b = { foo: { bar: 2 }, baz: null };
            expect(deepMerge(a, b)).toEqual({ foo: { bar: 2 } });
        });
    });

    describe('Type Safety Helpers', () => {
        test('ensureObject returns object or fallback', () => {
            expect(ensureObject({ a: 1 })).toEqual({ a: 1 });
            expect(ensureObject(null)).toEqual({});
        });
    });

    describe('Storage Access Helpers', () => {
        test('storage.get retrieves value', async () => {
            await mockStorage.set({ testKey: 'testValue' });
            expect(await storage.get(mockStorage, 'testKey')).toBe('testValue');
        });
    });

    describe('Platform Info', () => {
        test('isAndroid platform detection', async () => {
            _clearPlatformInfoCache();
            global.browser.runtime.getPlatformInfo.mockResolvedValue({ os: 'android' });
            expect(await isAndroid()).toBe(true);
        });
    });

    describe('Direct Storage Logic (Groups and Tasks)', () => {
        test('create, rename, and delete group (bookmark folders)', async () => {
            const groupName = 'UtilsGroup';
            const rootFolderId = SYNC_STORAGE_KEYS.ROOT_BOOKMARK_FOLDER_TITLE; // Assuming getRootBookmarkFolder creates/finds this
            global.browser.bookmarks.search.mockImplementation(async (query) => {
                if (query.title === SYNC_STORAGE_KEYS.ROOT_BOOKMARK_FOLDER_TITLE) {
                    // Simulate root folder exists or is created
                    const existing = global.browser.bookmarks._store.find(b => b.title === SYNC_STORAGE_KEYS.ROOT_BOOKMARK_FOLDER_TITLE && !b.url);
                    if (existing) return [existing];
                    return [{ id: 'root-folder-id', title: SYNC_STORAGE_KEYS.ROOT_BOOKMARK_FOLDER_TITLE }];
                }
                return [];
            });
            global.browser.bookmarks.getChildren.mockImplementation(async (parentId) => {
                 if (parentId === 'root-folder-id') { // Mock children of root
                    return global.browser.bookmarks._store.filter(bm => bm.parentId === 'root-folder-id' && !bm.url && bm.title !== SYNC_STORAGE_KEYS.CONFIG_BOOKMARK_TITLE);
                 }
                 return [];
            });

            const createRes = await createGroupDirect(groupName);
            expect(createRes.success).toBe(true);
            expect(global.browser.bookmarks.create).toHaveBeenCalledWith(expect.objectContaining({ title: groupName, parentId: 'root-folder-id' }));

            const renameRes = await renameGroupDirect(groupName, 'UtilsGroupRenamed');
            expect(renameRes.success).toBe(true);
            // Assuming getGroupBookmarkFolder was called and then update
            expect(global.browser.bookmarks.update).toHaveBeenCalledWith(expect.any(String), { title: 'UtilsGroupRenamed' });

            const deleteRes = await deleteGroupDirect('UtilsGroupRenamed');
            expect(deleteRes.success).toBe(true);
            expect(global.browser.bookmarks.removeTree).toHaveBeenCalled();
        });

        test('createAndStoreGroupTask creates task', async () => {
            const tabData = { url: 'https://example.com/utils', title: 'Utils Example' };
            const groupName = 'UtilsTaskGroup';

            // Mock getRootBookmarkFolder and getGroupBookmarkFolder to return mock IDs
            // These are called by storage.createTaskBookmark
            jest.spyOn(storage, 'getRootBookmarkFolder').mockResolvedValue({ id: 'mock-root-id', title: SYNC_STORAGE_KEYS.ROOT_BOOKMARK_FOLDER_TITLE });
            jest.spyOn(storage, 'getGroupBookmarkFolder').mockResolvedValue({ id: 'mock-group-folder-id', title: groupName, parentId: 'mock-root-id' });

            const res = await createAndStoreGroupTask(groupName, tabData);
            expect(res.success).toBe(true);
            // The ID will be generated by the mock in setup.js, e.g., 'mock-bookmark-1'
            expect(res.bookmarkId).toMatch(/^mock-bookmark-\d+$/);

            // Verify the actual call to browser.bookmarks.create for the task bookmark itself
            // It should be called once with the correct parentId from the mocked getGroupBookmarkFolder
            expect(global.browser.bookmarks.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    url: tabData.url,
                    title: tabData.title,
                    parentId: 'mock-group-folder-id' // This is the ID of the group folder
                })
            );
        });
    });

    describe('Background Logic Helpers', () => {
        test('performTimeBasedTaskCleanup removes expired tasks and updates local processed IDs', async () => {
            const now = Date.now();
            const expiredTime = now - (1000 * 60 * 60 * 24 * 15);
            const recentTime = now - (1000 * 60 * 60);
            const rootFolder = { id: 'root-cleanup-id', title: SYNC_STORAGE_KEYS.ROOT_BOOKMARK_FOLDER_TITLE, url: null };
            const groupFolder = { id: 'group-cleanup-id', title: 'G1', parentId: rootFolder.id, url: null };
            const expiredBookmark = { id: 'expired-task-bm-id', url: 'http://expired.com', title: 'Expired', parentId: groupFolder.id, dateAdded: expiredTime, };
            const recentBookmark = { id: 'recent-task-bm-id', url: 'http://recent.com', title: 'Recent', parentId: groupFolder.id, dateAdded: recentTime, };

            jest.spyOn(storage, 'getRootBookmarkFolder').mockResolvedValue(rootFolder);
            global.browser.bookmarks.getChildren.mockImplementation(async (parentId) => {
                if (parentId === rootFolder.id) return [groupFolder];
                if (parentId === groupFolder.id) return [expiredBookmark, recentBookmark];
                return [];
            });

            const initialLocalProcessed = { 
                [expiredBookmark.id]: true, 
                [recentBookmark.id]: true 
            };
            // Store initial processed IDs in mock local storage
            await storage.set(mockStorage, LOCAL_STORAGE_KEYS.PROCESSED_BOOKMARK_IDS, initialLocalProcessed);

            // Call the cleanup function
            await performTimeBasedTaskCleanup(initialLocalProcessed, 1000 * 60 * 60 * 24 * 14);

            // Verify browser.bookmarks.remove was called for the expired task
            expect(global.browser.bookmarks.remove).toHaveBeenCalledWith(expiredBookmark.id);
            expect(global.browser.bookmarks.remove).not.toHaveBeenCalledWith(recentBookmark.id);

            // Verify local processed IDs were updated
            const finalLocalProcessed = await storage.get(mockStorage, LOCAL_STORAGE_KEYS.PROCESSED_BOOKMARK_IDS);
            expect(finalLocalProcessed[expiredBookmark.id]).toBeUndefined();
            expect(finalLocalProcessed[recentBookmark.id]).toBe(true);
        });
    });
});