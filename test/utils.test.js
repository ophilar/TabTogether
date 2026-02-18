const mockedStringsObject = {
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
import { SYNC_STORAGE_KEYS } from '../common/constants.js';
import { deepMerge, ensureObject, ensureArray, ensureString, isObject } from '../common/utils.js';
import { storage } from '../core/storage.js';
import { isAndroid, _clearPlatformInfoCache } from '../core/platform.js';

describe('utils', () => {
    let mockStorage;
    let mockSyncStorage;
    let consoleErrorSpy, consoleWarnSpy, consoleLogSpy;
    let createGroupDirect, renameGroupDirect, deleteGroupDirect, subscribeToGroupDirect, unsubscribeFromGroupDirect;
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
        describe('ensureObject', () => {
            test('returns object when valid', () => {
                expect(ensureObject({ a: 1 })).toEqual({ a: 1 });
            });
            test('returns default fallback for null or undefined', () => {
                expect(ensureObject(null)).toEqual({});
                expect(ensureObject(undefined)).toEqual({});
            });
            test('returns default fallback for non-objects', () => {
                expect(ensureObject('string')).toEqual({});
                expect(ensureObject(123)).toEqual({});
                expect(ensureObject(true)).toEqual({});
                expect(ensureObject(() => {})).toEqual({});
            });
            test('returns default fallback for arrays', () => {
                expect(ensureObject([1, 2])).toEqual({});
            });
            test('returns custom fallback when provided', () => {
                const fallback = { default: true };
                expect(ensureObject(null, fallback)).toEqual(fallback);
                expect(ensureObject([], fallback)).toEqual(fallback);
            });
        });

        describe('ensureArray', () => {
            test('returns array when valid', () => {
                expect(ensureArray([1, 2])).toEqual([1, 2]);
            });
            test('returns default fallback for non-arrays', () => {
                expect(ensureArray(null)).toEqual([]);
                expect(ensureArray(undefined)).toEqual([]);
                expect(ensureArray({})).toEqual([]);
                expect(ensureArray('string')).toEqual([]);
                expect(ensureArray(123)).toEqual([]);
            });
            test('returns custom fallback when provided', () => {
                const fallback = [9];
                expect(ensureArray(null, fallback)).toEqual(fallback);
                expect(ensureArray({}, fallback)).toEqual(fallback);
            });
        });

        describe('ensureString', () => {
            test('returns string when valid', () => {
                expect(ensureString('test')).toBe('test');
                expect(ensureString('')).toBe('');
            });
            test('returns default fallback for non-strings', () => {
                expect(ensureString(null)).toBe('');
                expect(ensureString(undefined)).toBe('');
                expect(ensureString(123)).toBe('');
                expect(ensureString({})).toBe('');
                expect(ensureString([])).toBe('');
            });
            test('returns custom fallback when provided', () => {
                expect(ensureString(null, 'fallback')).toBe('fallback');
            });
        });

        describe('isObject', () => {
            test('returns true for plain objects', () => {
                expect(isObject({ a: 1 })).toBe(true);
                expect(isObject({})).toBe(true);
            });
            test('returns false for null', () => {
                expect(isObject(null)).toBe(false);
            });
            test('returns false for arrays', () => {
                expect(isObject([])).toBe(false);
                expect(isObject([1, 2])).toBe(false);
            });
            test('returns false for other types', () => {
                expect(isObject('string')).toBe(false);
                expect(isObject(123)).toBe(false);
                expect(isObject(undefined)).toBe(false);
                expect(isObject(() => {})).toBe(false);
            });
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

        // test('createAndStoreGroupTask creates task', async () => {
        //     const tabData = { url: 'https://example.com/utils', title: 'Utils Example' };
        //     const groupName = 'UtilsTaskGroup';

        //     // Mock getRootBookmarkFolder and getGroupBookmarkFolder to return mock IDs
        //     // These are called by storage.createTaskBookmark
        //     const mockRootFolderId = 'mock-root-id-for-task-test';
        //     const mockGroupFolderId = 'mock-group-folder-id-for-task-test';

        //     jest.spyOn(storage, 'getRootBookmarkFolder').mockResolvedValue({ id: mockRootFolderId, title: SYNC_STORAGE_KEYS.ROOT_BOOKMARK_FOLDER_TITLE });

        //     // Let getGroupBookmarkFolder run, but control what browser.bookmarks.create does for the group folder
        //     global.browser.bookmarks.create.mockImplementation(async (obj) => {
        //         if (obj.title === groupName && obj.parentId === mockRootFolderId && !obj.url) { // This is the group folder creation
        //             return { ...obj, id: mockGroupFolderId, dateAdded: Date.now() };
        //         }
        //         // For task bookmarks or other creations, use the default mock behavior
        //         return { ...obj, id: `mock-bookmark-${global.browser.bookmarks._store.length + 1}`, dateAdded: Date.now() };
        //     });

        //     const res = await createAndStoreGroupTask(groupName, tabData);
        //     expect(res.success).toBe(true);
        //     // The ID will be generated by the mock in setup.js, e.g., 'mock-bookmark-1'
        //     expect(res.bookmarkId).toMatch(/^mock-bookmark-\d+$/);

        //     // Verify the actual call to browser.bookmarks.create for the task bookmark itself
        //     // It should be called once with the correct parentId from the mocked getGroupBookmarkFolder
        //     // We need to find the specific call that matches the task creation.
        //     const createCalls = global.browser.bookmarks.create.mock.calls;
        //     const taskCreationCall = createCalls.find(call => call[0].url === tabData.url && call[0].title === tabData.title);
        //     expect(taskCreationCall).toBeDefined();
        //     expect(taskCreationCall[0]).toEqual(
        //         expect.objectContaining({
        //             url: tabData.url,
        //             title: tabData.title,
        //             parentId: mockGroupFolderId // This is the ID of the group folder
        //         })
        //     );
        // });
    });
});