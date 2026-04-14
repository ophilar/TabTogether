import { STRINGS, LOCAL_STORAGE_KEYS } from "../common/constants.js";
import { createAndStoreGroupTask } from "../core/tasks.js";
import { storage } from "../core/storage.js";

export async function updateContextMenu(cachedDefinedGroups) {
  if (!browser.contextMenus) {
    console.warn("Background:updateContextMenu - ContextMenus API is not available. Skipping update.");
    return;
  }
  console.log("Background:updateContextMenu - Updating context menus.");
  await browser.contextMenus.removeAll();
  const groups = cachedDefinedGroups ?? (await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []));
  const contexts = [
    "page",
    "link",
    "image",
    "video",
    "audio",
    "selection",
    "tab",
  ];

  try {
    if (groups.length === 0) {
      console.log("Background:updateContextMenu - No groups defined, creating disabled menu item.");
      browser.contextMenus.create({
        id: "no-groups",
        title: STRINGS.noGroups,
        contexts: contexts,
        enabled: false,
      });
      return;
    }

    console.log("Background:updateContextMenu - Creating parent 'Send Tab to Group' menu.");
    browser.contextMenus.create({
      id: "send-to-group-parent",
      title: STRINGS.contextMenuSendTabToGroup,
      contexts: contexts,
    });

    groups.sort().forEach((groupName) => {
      try {
        browser.contextMenus.create({
          id: `send-to-${groupName}`,
          parentId: "send-to-group-parent",
          title: groupName,
          contexts: contexts,
        });
      } catch (e) {
        console.error(
          `Background:updateContextMenu - Failed to create context menu item for group "${groupName}":`,
          e.message
        );
      }
    });
  } catch (e) {
    console.error(
      "Background:updateContextMenu - Error during top-level context menu creation:",
      e.message
    );
  }
}

export function initContextMenus() {
  if (browser.contextMenus) {
    browser.contextMenus.onClicked.addListener(async (info, tab) => {
      console.log(
        "Background:onContextMenuClicked - Triggered. Info:", info, "Tab:", tab
      );

      const menuItemId = info.menuItemId?.toString() || "";
      if (
        !menuItemId.startsWith("send-to-") ||
        menuItemId === "send-to-group-parent"
      ) {
        return;
      }

      const groupName = menuItemId.replace("send-to-", "");

      let urlToSend = info.pageUrl;
      let titleToSend = tab?.title || "Link";

      if (info.linkUrl) {
        urlToSend = info.linkUrl;
        titleToSend = info.linkText || urlToSend;
      } else if (info.mediaType && info.srcUrl) {
        urlToSend = info.srcUrl;
        titleToSend = tab?.title || urlToSend;
      } else if (info.selectionText) {
        urlToSend = info.pageUrl || tab?.url;
        titleToSend = `"${info.selectionText}" on ${tab?.title || urlToSend}`;
      } else if (tab?.url) {
        urlToSend = tab.url;
        titleToSend = tab?.title || urlToSend;
      }

      if (!urlToSend || urlToSend === "about:blank") {
        console.error(
          "Background:onContextMenuClicked - Could not determine a valid URL to send from context:", info, "Tab:", tab
        );
        browser.notifications.create({
          type: "basic",
          iconUrl: browser.runtime.getURL("icons/icon-48.png"),
          title: STRINGS.notificationSendFailedTitle,
          message: STRINGS.notificationCannotSendLink,
        });
        return;
      }

      const tabData = { url: urlToSend, title: titleToSend };

      console.log(
        `Background:onContextMenuClicked - Sending task to group ${groupName}.`
      );
      const { success, message: taskMessage } = await createAndStoreGroupTask(groupName, tabData);

      const notificationMessage = success
        ? STRINGS.notificationTabSentMessage(titleToSend, groupName)
        : taskMessage || STRINGS.sendTabFailed;

      browser.notifications.create({
        type: "basic",
        iconUrl: browser.runtime.getURL("icons/icon-48.png"),
        title: success ? STRINGS.notificationTabSentTitle : STRINGS.notificationSendFailedTitle,
        message: notificationMessage,
      });
    });
  } else {
    console.warn("Background: ContextMenus API is not available. Skipping context menu click listener setup.");
  }
}
