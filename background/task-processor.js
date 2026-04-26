import { storage } from "../core/storage.js";
import { LOCAL_STORAGE_KEYS } from "../common/constants.js";

export async function processIncomingTaskBookmark(bookmarkNode) {
    const groupName = bookmarkNode.title.split(":")[0];

    const [localSubscriptions, localProcessedBookmarkIds] = await Promise.all([
      storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []),
      storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.PROCESSED_BOOKMARK_IDS, {})
    ]);

    // Check if subscribed to this group
    if (!localSubscriptions.includes(groupName)) {
        console.log(`TaskProcessor: Not subscribed to group "${groupName}" for task ${bookmarkNode.id}. Skipping.`);
        return [];
    }

    // Check if already processed
    if (localProcessedBookmarkIds[bookmarkNode.id]) return [];

    return [bookmarkNode];
}
