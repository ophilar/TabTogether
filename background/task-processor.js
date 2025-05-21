import { storage } from '../core/storage.js';
import { LOCAL_STORAGE_KEYS, SYNC_STORAGE_KEYS } from '../common/constants.js';
export async function processIncomingTaskBookmark(changedBookmarkId, changeInfoOrNode) {
    console.log(`TaskProcessor:processIncomingTaskBookmark - Processing bookmark ID: ${changedBookmarkId}`);

    // We need to get the full bookmark details to check its parent (group) and if it's a task
    let bookmarkNode;
    try {
        const nodes = await browser.bookmarks.get(changedBookmarkId);
        if (!nodes || nodes.length === 0) {
            console.log(`TaskProcessor: Bookmark ${changedBookmarkId} not found or was deleted.`);
            return [];
        }
        bookmarkNode = nodes[0];
    } catch (e) {
        console.log(`TaskProcessor: Error fetching bookmark ${changedBookmarkId}, likely deleted:`, e.message);
        return [];
    }

    // Ensure it's a task (has a URL) and not the config bookmark
    if (!bookmarkNode.url || bookmarkNode.title === SYNC_STORAGE_KEYS.CONFIG_BOOKMARK_TITLE) {
        console.log(`TaskProcessor: Bookmark ${changedBookmarkId} is not a processable task (no URL or is config).`);
        return [];
    }

    // Get parent folder to determine group name
    if (!bookmarkNode.parentId) return [];
    const parentNodes = await browser.bookmarks.get(bookmarkNode.parentId);
    if (!parentNodes || parentNodes.length === 0 || parentNodes[0].url) return []; // Parent is not a folder
    const groupName = parentNodes[0].title;

    // Check if subscribed to this group
    const localSubscriptions = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []);
    if (!localSubscriptions.includes(groupName)) {
        console.log(`TaskProcessor: Not subscribed to group "${groupName}" for task ${bookmarkNode.id}. Skipping.`);
        return [];
    }

    // Check if already processed
    let localProcessedBookmarkIds = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.PROCESSED_BOOKMARK_IDS, {});
    if (localProcessedBookmarkIds[bookmarkNode.id]) {
        console.log(`TaskProcessor: Task bookmark ${bookmarkNode.id} already processed. Skipping.`);
        return [];
    }

    let newTasksProcessedThisRun = false;
    const openedTabsDetails = [];

    try {
        console.log(`TaskProcessor: Opening tab for task ${bookmarkNode.id} from group ${groupName}: ${bookmarkNode.url}`);
        await browser.tabs.create({ url: bookmarkNode.url, active: false });

        localProcessedBookmarkIds[bookmarkNode.id] = Date.now();
        openedTabsDetails.push({ title: bookmarkNode.title, url: bookmarkNode.url, groupName: groupName });
        newTasksProcessedThisRun = true;
    } catch (error) {
        console.error(`TaskProcessor: Failed to open tab for task ${bookmarkNode.id} (${bookmarkNode.url}):`, error);
    }
    if (newTasksProcessedThisRun) {
        await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.PROCESSED_BOOKMARK_IDS, localProcessedBookmarkIds);
        console.log('TaskProcessor: Updated local processed bookmark IDs list.');
    }
    console.log('TaskProcessor: Finished processing bookmark. Opened tabs:', openedTabsDetails.length);
    return openedTabsDetails;
}