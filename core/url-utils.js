/**
 * URL safety utilities — NO Firebase dependency.
 * Keeping this isolated ensures URL validation tests don't require
 * the Firebase SDK (and its fetch requirement) to be loaded.
 */

const SAFE_PROTOCOLS = ['http:', 'https:'];

export function isUrlSafe(url) {
  try {
    const parsed = new URL(url);
    return SAFE_PROTOCOLS.includes(parsed.protocol);
  } catch {
    return false;
  }
}
