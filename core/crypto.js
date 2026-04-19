/**
 * TabTogether Crypto Utilities
 * Implements PBKDF2 key derivation and AES-GCM encryption/decryption.
 */

/**
 * Derives a deterministic 256-bit AES-GCM key from a password and a salt (groupId).
 * @param {string} password The Master Sync Password.
 * @param {string} saltString The Group ID to use as a salt.
 * @returns {Promise<CryptoKey>} The derived key.
 */
export async function deriveSyncKey(password, saltString) {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  const saltBuffer = encoder.encode(saltString);

  // 1. Import the raw password as a "password" key type
  const baseKey = await crypto.subtle.importKey(
    "raw",
    passwordBuffer,
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );

  // 2. Derive the actual AES-GCM key using PBKDF2
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBuffer,
      iterations: 100000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    true, // extractable
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts a URL using the derived key.
 * @param {string} url 
 * @param {CryptoKey} derivedKey 
 * @returns {Promise<{iv: Uint8Array, data: Uint8Array}>}
 */
export async function encryptPayload(url, derivedKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(url);
  
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    derivedKey,
    encoded
  );

  return {
    iv,
    data: new Uint8Array(encryptedBuffer)
  };
}

/**
 * Decrypts a payload using the derived key.
 * @param {Uint8Array} iv 
 * @param {Uint8Array} data 
 * @param {CryptoKey} derivedKey 
 * @returns {Promise<string>}
 */
export async function decryptPayload(iv, data, derivedKey) {
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    derivedKey,
    data
  );

  return new TextDecoder().decode(decryptedBuffer);
}
