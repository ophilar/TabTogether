import { jest } from '@jest/globals';
import { storage } from '../core/storage.js';
import { LOCAL_STORAGE_KEYS } from '../common/constants.js';

describe('Performance: Storage Merging', () => {

    beforeEach(async () => {
        await browser.storage.local.clear();
        jest.clearAllMocks();
    });

    test('mergeItem should efficiently update objects', async () => {
        const key = "testKey";
        await storage.set(browser.storage.local, key, { a: 1, b: 2 });
        
        const startTime = performance.now();
        await storage.mergeItem(browser.storage.local, key, { b: 3, c: 4 });
        const endTime = performance.now();

        const result = await storage.get(browser.storage.local, key);
        expect(result).toEqual({ a: 1, b: 3, c: 4 });
        expect(endTime - startTime).toBeLessThan(100); // Should be fast
    });
});
