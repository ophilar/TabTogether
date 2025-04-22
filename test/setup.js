if (!globalThis.crypto) {
  globalThis.crypto = { randomUUID: () => 'mock-uuid-1234' };
}
