// core/platform.js

let platformInfoCache = null;

/**
 * Gets platform information, caching the result.
 * @returns {Promise<browser.runtime.PlatformInfo>}
 */
async function getPlatformInfoCached() {
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