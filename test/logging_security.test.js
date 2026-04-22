import { jest } from '@jest/globals';
import { storage } from '../core/storage.js';
import { LOCAL_STORAGE_KEYS } from '../common/constants.js';

describe('Security: Logging and Sensitive Data', () => {
    let consoleLogSpy, consoleWarnSpy, consoleErrorSpy;

    beforeEach(async () => {
        jest.clearAllMocks();
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
        consoleWarnSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });

    test('should not log plaintext sync password when saving', async () => {
        const secret = "SuperSecret123!";
        await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.SYNC_PASSWORD, secret);
        
        // Ensure the secret is not in any console logs
        [consoleLogSpy, consoleWarnSpy, consoleErrorSpy].forEach(spy => {
            spy.mock.calls.forEach(call => {
                call.forEach(arg => {
                    if (typeof arg === 'string') {
                        expect(arg).not.toContain(secret);
                    }
                });
            });
        });
    });

    test('should not log sensitive URLs in firebase transport', async () => {
        // Mocking handleIncomingTab to check for log leakage
        const { handleIncomingTab } = await import('../background/firebase-transport.js');
        const url = "https://sensitive-bank-data.com";
        const derivedKey = await (await import('../core/crypto.js')).deriveSyncKey("pass", "group");
        const { iv, data } = await (await import('../core/crypto.js')).encryptPayload(url, derivedKey);

        const payload = {
            iv: Array.from(iv),
            data: Array.from(data),
            senderId: "remote",
            timestamp: Date.now()
        };

        await handleIncomingTab(payload, "tab1", "group", derivedKey);

        // Check logs for the URL
        [consoleLogSpy, consoleWarnSpy, consoleErrorSpy].forEach(spy => {
            spy.mock.calls.forEach(call => {
                call.forEach(arg => {
                    if (typeof arg === 'string') {
                        expect(arg).not.toContain(url);
                    }
                });
            });
        });
    });
});
