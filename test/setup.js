// test/setup.js
import { jest } from '@jest/globals';
import { webcrypto } from 'node:crypto';
import { TextEncoder, TextDecoder } from 'node:util';
import { ReadableStream } from 'node:stream/web';
import { fetch, Request, Response, Headers } from 'undici';

/**
 * Global Mocks for Browser API
 */
class StatefullStorageArea {
  constructor() { this.data = {}; }
  async get(keys) {
    if (keys === null) return { ...this.data };
    if (typeof keys === 'string') return { [keys]: this.data[keys] };
    if (Array.isArray(keys)) {
      const res = {};
      keys.forEach(k => res[k] = this.data[k]);
      return res;
    }
    const res = { ...keys };
    for (const k in keys) if (this.data[k] !== undefined) res[k] = this.data[k];
    return res;
  }
  async set(items) { Object.assign(this.data, items); }
  async remove(keys) {
    if (typeof keys === 'string') delete this.data[keys];
    else if (Array.isArray(keys)) keys.forEach(k => delete this.data[k]);
  }
  async clear() { this.data = {}; }
}

const mockLocalStorage = new StatefullStorageArea();
const mockSyncStorage = new StatefullStorageArea();

globalThis.browser = {
  storage: {
    local: mockLocalStorage,
    sync: mockSyncStorage,
    onChanged: { addListener: jest.fn() },
  },
  runtime: {
    sendMessage: jest.fn().mockResolvedValue({}),
    onMessage: { addListener: jest.fn(), removeListener: jest.fn() },
    getURL: jest.fn(path => `moz-extension://mock-id/${path}`),
    openOptionsPage: jest.fn(),
  },
  tabs: {
    create: jest.fn().mockResolvedValue({ id: 123 }),
    query: jest.fn().mockResolvedValue([]),
    remove: jest.fn().mockResolvedValue(undefined),
  },
  notifications: {
    create: jest.fn().mockResolvedValue("mock-notification-id"),
  },
  alarms: {
    create: jest.fn(),
    clearAll: jest.fn().mockResolvedValue(true),
    onAlarm: { addListener: jest.fn() },
  },
};

/**
 * REAL Crypto API from Node.js
 */
globalThis.crypto = webcrypto;
globalThis.TextEncoder = TextEncoder;
globalThis.TextDecoder = TextDecoder;

/**
 * REAL Fetch API from Node.js (via undici bridge)
 * We must use globalThis to ensure JSDOM environment sees them.
 */
globalThis.fetch = fetch;
globalThis.Request = Request;
globalThis.Response = Response;
globalThis.Headers = Headers;
globalThis.ReadableStream = ReadableStream;

/**
 * FIREBASE EMULATOR CONFIG
 */
globalThis.__FIREBASE_EMULATOR__ = true;
globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = true;

// Reset state
beforeEach(() => {
  jest.clearAllMocks();
  mockLocalStorage.data = {};
  mockSyncStorage.data = {};
});
