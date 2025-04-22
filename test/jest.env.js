import NodeEnvironment from 'jest-environment-jsdom';

class CustomCryptoEnvironment extends NodeEnvironment {
  async setup() {
    await super.setup();
    if (!this.global.crypto) {
      this.global.crypto = { randomUUID: () => 'mock-uuid-1234' };
    }
  }
}

export default CustomCryptoEnvironment;
