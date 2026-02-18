import { storage, addToHistory } from '../core/storage.js';
import { LOCAL_STORAGE_KEYS, SYNC_STORAGE_KEYS, BACKGROUND_DEFAULT_TASK_EXPIRY_DAYS } from '../common/constants.js';
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

    // Ensure it's a task (has a URL) and not the config bookmark (which is also a SYNC_STORAGE_KEYS property)
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

    // Fetch task expiry for URL deduplication recency
    const taskExpiryDays = await storage.get(
        browser.storage.sync,
        SYNC_STORAGE_KEYS.TASK_EXPIRY_DAYS,
        BACKGROUND_DEFAULT_TASK_EXPIRY_DAYS // Fallback default
    );
    const recencyThresholdMs = taskExpiryDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    let newTasksProcessedThisRun = false;
    const openedTabsDetails = [];
    let recentlyOpenedUrls = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.RECENTLY_OPENED_URLS, {});
    let recentlyOpenedUrlsChanged = false;

    const urlLastOpenedTimestamp = recentlyOpenedUrls[bookmarkNode.url];
    if (urlLastOpenedTimestamp && (now - urlLastOpenedTimestamp < recencyThresholdMs)) {
        console.log(`TaskProcessor: URL ${bookmarkNode.url} (task ${bookmarkNode.id}) was recently opened. Deduplicating (inter-run).`);
        // Tab is not opened, but task is still marked processed below.
    } else {
        try {
            console.log(`TaskProcessor: Opening tab for task ${bookmarkNode.id} from group ${groupName}: ${bookmarkNode.url}`);
            await browser.tabs.create({ url: bookmarkNode.url, active: false });
            openedTabsDetails.push({ title: bookmarkNode.title, url: bookmarkNode.url, groupName: groupName });

            // Record in history
            let displayTitle = bookmarkNode.title;
            let fromDevice = "Remote Device";
            const match = bookmarkNode.title.match(/^\[(.*?)\] (.*)$/);
            if (match) {
                fromDevice = match[1];
                displayTitle = match[2];
            }

            await addToHistory({
                url: bookmarkNode.url,
                title: displayTitle,
                fromDevice: fromDevice
            });

            recentlyOpenedUrls[bookmarkNode.url] = now;
            recentlyOpenedUrlsChanged = true;
        } catch (error) {
            console.error(`TaskProcessor: Failed to open tab for task ${bookmarkNode.id} (${bookmarkNode.url}):`, error);
        }
    }

    // Mark the bookmark ID as processed regardless of URL deduplication
    localProcessedBookmarkIds[bookmarkNode.id] = now;
    newTasksProcessedThisRun = true; // Indicates PROCESSED_BOOKMARK_IDS needs saving

    if (newTasksProcessedThisRun) {
        await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.PROCESSED_BOOKMARK_IDS, localProcessedBookmarkIds);
        console.log('TaskProcessor: Updated local processed bookmark IDs list.');

        const lastProcessedTimestampFromStorage = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.LAST_PROCESSED_BOOKMARK_TIMESTAMP, 0);
        if (bookmarkNode.dateAdded && bookmarkNode.dateAdded > lastProcessedTimestampFromStorage) {
            await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.LAST_PROCESSED_BOOKMARK_TIMESTAMP, bookmarkNode.dateAdded);
            console.log(`TaskProcessor: Updated last processed bookmark timestamp to: ${new Date(bookmarkNode.dateAdded).toISOString()}`);
        }
    }

    if (recentlyOpenedUrlsChanged) {
        await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.RECENTLY_OPENED_URLS, recentlyOpenedUrls);
        console.log('TaskProcessor: Updated recently opened URLs list.');
    }
    console.log('TaskProcessor: Finished processing bookmark. Opened tabs:', openedTabsDetails.length);
    return openedTabsDetails;
}