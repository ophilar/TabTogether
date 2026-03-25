import { SYNC_STORAGE_KEYS, STRINGS } from "../common/constants.js";
import { storage } from "../core/storage.js";
import { processIncomingTaskBookmark } from "./task-processor.js";
import { updateContextMenu } from "./context-menus.js";
import { notifyOptionsPageGroupsChanged } from "./message-handlers.js";

let rootBookmarkFolderIdCache = null;

async function getRootId() {
  if (!rootBookmarkFolderIdCache) {
    const rootFolder = await storage.getRootBookmarkFolder();
    if (rootFolder) rootBookmarkFolderIdCache = rootFolder.id;
  }
  return rootBookmarkFolderIdCache;
}

export async function isConfigBookmark(bookmarkId) {
  try {
    const nodes = await browser.bookmarks.get(bookmarkId);
    if (!nodes || nodes.length === 0) return false;
    const bookmark = nodes[0];
    return bookmark.title === SYNC_STORAGE_KEYS.CONFIG_BOOKMARK_TITLE;
  } catch (e) {
    return false;
  }
}

export async function isTaskBookmark(bookmarkId) {
  try {
    const nodes = await browser.bookmarks.get(bookmarkId);
    if (!nodes || nodes.length === 0) return false;
    const bookmark = nodes[0];

    if (!bookmark || !bookmark.parentId || !bookmark.url || bookmark.url.startsWith("place:")) return false;
    if (bookmark.title === SYNC_STORAGE_KEYS.CONFIG_BOOKMARK_TITLE) return false;

    const parentNodes = await browser.bookmarks.get(bookmark.parentId);
    if (!parentNodes || parentNodes.length === 0) return false;
    const parent = parentNodes[0];

    if (!parent || !parent.parentId || parent.url || parent.title === SYNC_STORAGE_KEYS.CONFIG_BOOKMARK_TITLE) return false;

    const grandParentNodes = await browser.bookmarks.get(parent.parentId);
    if (!grandParentNodes || grandParentNodes.length === 0) return false;
    const grandParent = grandParentNodes[0];

    return grandParent && grandParent.title === SYNC_STORAGE_KEYS.ROOT_BOOKMARK_FOLDER_TITLE;
  } catch (e) {
    console.warn(`Background:isTaskBookmark - Error checking bookmark ${bookmarkId}:`, e.message);
    return false;
  }
}

export async function isGroupFolderNode(bookmarkNode, rootId) {
  if (!bookmarkNode || bookmarkNode.url || !bookmarkNode.parentId) return false; // Must be a folder and have a parent
  if (bookmarkNode.title === SYNC_STORAGE_KEYS.CONFIG_BOOKMARK_TITLE) return false;
  return bookmarkNode.parentId === rootId;
}

export async function showTabNotification({ title, url, groupName, faviconUrl }) {
  console.log(`Background:showTabNotification - Displaying notification for tab from group: "${groupName}"`);
  await browser.notifications.create({
    type: "basic",
    iconUrl: faviconUrl || browser.runtime.getURL("icons/icon-48.png"),
    title: STRINGS.notificationTabReceivedTitle(groupName),
    message: title || url || (STRINGS.tabReceivedMessage || "Tab received"),
    contextMessage: url || "",
  });
}

export function initBookmarkListeners() {
  browser.bookmarks.onCreated.addListener(async (id, bookmarkNode) => {
    if (await isConfigBookmark(id)) {
      console.log(`Background:bookmarks.onCreated - Config bookmark created. Notifying UI.`);
      await notifyOptionsPageGroupsChanged();
    } else if (await isTaskBookmark(id)) {
      console.log(`Background:bookmarks.onCreated - Task bookmark created: ${id} - ${bookmarkNode.title}`);
      const openedTabs = await processIncomingTaskBookmark(id, bookmarkNode);
      if (openedTabs && openedTabs.length > 0) {
        for (const tabDetail of openedTabs) {
          await showTabNotification(tabDetail);
        }
      }
    } else {
      const rootId = await getRootId();
      if (rootId && await isGroupFolderNode(bookmarkNode, rootId)) {
        console.log(`Background:bookmarks.onCreated - Group folder created: ${bookmarkNode.title}`);
        await updateContextMenu();
        await notifyOptionsPageGroupsChanged();
      }
    }
  });

  browser.bookmarks.onRemoved.addListener(async (id, removeInfo) => {
    if (removeInfo.node && !removeInfo.node.url && removeInfo.node.title !== SYNC_STORAGE_KEYS.CONFIG_BOOKMARK_TITLE) {
      const rootId = await getRootId();
      if (rootId && removeInfo.node.parentId === rootId) {
        console.log(`Background:bookmarks.onRemoved - Group folder removed: ${removeInfo.node.title}`);
        await updateContextMenu();
        await notifyOptionsPageGroupsChanged();
      }
    }
  });

  browser.bookmarks.onChanged.addListener(async (id, changeInfo) => {
    const nodes = await browser.bookmarks.get(id);
    if (!nodes || nodes.length === 0) return;
    const bookmarkNode = nodes[0];

    if (await isConfigBookmark(id)) {
      console.log(`Background:bookmarks.onChanged - Config bookmark changed. Notifying UI.`);
      await notifyOptionsPageGroupsChanged();
    } else if (await isTaskBookmark(id)) {
      if (changeInfo.url || changeInfo.title) {
        console.log(`Background:bookmarks.onChanged - Task bookmark changed: ${id}`);
        await processIncomingTaskBookmark(id, changeInfo);
      }
    } else {
      const rootId = await getRootId();
      if (rootId && await isGroupFolderNode(bookmarkNode, rootId)) {
        console.log(`Background:bookmarks.onChanged - Potential group folder change: ${bookmarkNode.title}`, changeInfo);
        await updateContextMenu();
        await notifyOptionsPageGroupsChanged();
      }
    }
  });
}
