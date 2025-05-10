let platformInfoCache = null;

/**
 * Gets platform information, caching the result.
 * @returns {Promise<browser.runtime.PlatformInfo>}
 */
export async function getPlatformInfoCached() {
  if (!platformInfoCache) {
    platformInfoCache = await browser.runtime.getPlatformInfo();
  }
  return platformInfoCache;
}

/**
 * Checks if the current platform is Android.
 * @returns {Promise<boolean>} True if Android, false otherwise.
 */
export async function isAndroid() {
  const platformInfo = await getPlatformInfoCached();
  return platformInfo.os === "android";
}

/**
 * Clears the in-memory platform info cache. Used for testing.
 */
export function _clearPlatformInfoCache() {
  platformInfoCache = null;
}