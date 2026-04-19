/**
 * Pre-environment polyfills loaded BEFORE any module is imported.
 * Must be CommonJS (.cjs) because setupFiles runs in Node context.
 */
const { webcrypto } = require('node:crypto');
const { TextEncoder, TextDecoder } = require('node:util');
const { ReadableStream } = require('node:stream/web');

// Node 18+ has these on globalThis
const forceGlobal = (name, value) => {
  if (typeof value !== 'undefined') {
    global[name] = value;
    globalThis[name] = value;
  }
};

forceGlobal('fetch', globalThis.fetch);
forceGlobal('Request', globalThis.Request);
forceGlobal('Response', globalThis.Response);
forceGlobal('Headers', globalThis.Headers);
forceGlobal('ReadableStream', ReadableStream);
forceGlobal('crypto', webcrypto);
forceGlobal('TextEncoder', TextEncoder);
forceGlobal('TextDecoder', TextDecoder);

// MessagePort is needed by some web-idl implementations in undici/jsdom
if (typeof MessageChannel !== 'undefined') {
    forceGlobal('MessagePort', globalThis.MessagePort);
    forceGlobal('MessageChannel', globalThis.MessageChannel);
} else {
    // Dummy MessagePort for environments that lack it
    class MockMessagePort {}
    forceGlobal('MessagePort', MockMessagePort);
}
