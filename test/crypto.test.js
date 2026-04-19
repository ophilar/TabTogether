// test/crypto.test.js
import { deriveSyncKey, encryptPayload, decryptPayload } from "../core/crypto.js";

describe("Crypto Module", () => {
  const password = "test-password";
  const groupId = "test-group-id";

  test("deriveSyncKey produces a CryptoKey", async () => {
    const key = await deriveSyncKey(password, groupId);
    expect(key.type).toBe("secret");
    expect(key.algorithm.name).toBe("AES-GCM");
  });

  test("deriveSyncKey is deterministic", async () => {
    const key1 = await deriveSyncKey(password, groupId);
    const key2 = await deriveSyncKey(password, groupId);
    
    const raw1 = await crypto.subtle.exportKey("raw", key1);
    const raw2 = await crypto.subtle.exportKey("raw", key2);
    
    expect(new Uint8Array(raw1)).toEqual(new Uint8Array(raw2));
  });

  test("deriveSyncKey produces different keys for different groups", async () => {
    const key1 = await deriveSyncKey(password, "group-A");
    const key2 = await deriveSyncKey(password, "group-B");
    
    const raw1 = await crypto.subtle.exportKey("raw", key1);
    const raw2 = await crypto.subtle.exportKey("raw", key2);
    
    expect(new Uint8Array(raw1)).not.toEqual(new Uint8Array(raw2));
  });

  test("encrypt/decrypt cycle works", async () => {
    const key = await deriveSyncKey(password, groupId);
    const url = "https://example.com/sync-test";
    
    const { iv, data } = await encryptPayload(url, key);
    const decrypted = await decryptPayload(iv, data, key);
    
    expect(decrypted).toBe(url);
  });

  test("decrypt fails with wrong key", async () => {
    const key1 = await deriveSyncKey(password, groupId);
    const key2 = await deriveSyncKey("wrong-password", groupId);
    const url = "https://example.com";
    
    const { iv, data } = await encryptPayload(url, key1);
    
    await expect(decryptPayload(iv, data, key2)).rejects.toThrow();
  });
});
