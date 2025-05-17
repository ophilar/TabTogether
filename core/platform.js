let platformInfoCache = null;

/**
 * Gets platform information, caching the result.
 * @returns {Promise<browser.runtime.PlatformInfo>}
 */
export async function getPlatformInfoCached() {
  if (!platformInfoCache) {
    console.log("Platform: Fetching platform info for the first time.");
    platformInfoCache = await browser.runtime.getPlatformInfo();
  }
  // console.log("Platform: Returning platform info:", platformInfoCache); // Can be verbose
  return platformInfoCache;
}

/**
 * Checks if the current platform is Android.
 * @returns {Promise<boolean>} True if Android, false otherwise.
 */
export async function isAndroid() {
  const platformInfo = await getPlatformInfoCached();
  const androidCheck = platformInfo.os === "android";
  console.log(`Platform: isAndroid check result: ${androidCheck}`);
  return androidCheck;
}

/**
 * Clears the in-memory platform info cache. Used for testing.
 */
export function _clearPlatformInfoCache() {
  console.log("Platform: Clearing platform info cache.");
  platformInfoCache = null;
}