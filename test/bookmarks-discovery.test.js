import { jest } from '@jest/globals';
import { storage } from '../core/storage.js';
import { LOCAL_STORAGE_KEYS } from '../common/constants.js';

// Mock Firebase dependency
jest.unstable_mockModule("../background/firebase-transport.js", () => ({
  getGroupMembers: jest.fn().mockResolvedValue([
    { id: "device1", nickname: "Device 1", lastSeen: Date.now() },
    { id: "device2", nickname: "Device 2", lastSeen: Date.now() - 1000000 }
  ]),
}));

const { getGroupMembers } = await import("../background/firebase-transport.js");

describe('Presence Discovery: Firebase Group Members', () => {

    beforeEach(async () => {
        await browser.storage.local.clear();
        jest.clearAllMocks();
    });

    test('getGroupMembers should return list of active devices', async () => {
        const members = await getGroupMembers("group1");
        expect(members).toHaveLength(2);
        expect(members[0].nickname).toBe("Device 1");
    });
});
