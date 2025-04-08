// --- Constants ---
const STORAGE_KEY = "deviceGroups";
const MENU_ID_PARENT = "send-to-group-parent";

// --- Initialization ---
browser.runtime.onInstalled.addListener(initializeExtension);
browser.runtime.onStartup.addListener(initializeExtension); // Re-create menu on browser start

function initializeExtension() {
  console.log("Initializing Tab Group Sender");
  updateContextMenu(); // Create/update context menus based on stored groups
}

// --- Storage Handling ---
async function getGroups() {
  try {
    const result = await browser.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] || {}; // Return groups object or empty object
  } catch (error) {
    console.error("Error getting groups:", error);
    return {};
  }
}

async function saveGroups(groups) {
  try {
    await browser.storage.local.set({ [STORAGE_KEY]: groups });
    updateContextMenu(); // Update menus whenever groups change
    console.log("Groups saved:", groups);
  } catch (error) {
    console.error("Error saving groups:", error);
  }
}

// --- Context Menu ---
async function updateContextMenu() {
  await browser.contextMenus.removeAll(); // Clear existing menus first

  const groups = await getGroups();
  const groupNames = Object.keys(groups);

  if (groupNames.length === 0) {
    // Optional: Create a disabled placeholder if no groups exist
    browser.contextMenus.create({
      id: "no-groups",
      title: "No device groups configured",
      contexts: ["page", "link", "image", "video", "audio"],
      enabled: false,
    });
    return;
  }

  // Create the parent menu item
  browser.contextMenus.create({
    id: MENU_ID_PARENT,
    title: "Send Tab to Group",
    contexts: ["page", "link", "image", "video", "audio"], // Contexts where the menu appears
  });

  // Create sub-menu items for each group
  for (const groupName of groupNames) {
    browser.contextMenus.create({
      id: `send-to-${groupName}`, // Unique ID for each group item
      parentId: MENU_ID_PARENT,
      title: groupName,
      contexts: ["page", "link", "image", "video", "audio"],
    });
  }
}

// Listener for context menu clicks
browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info.menuItemId.startsWith("send-to-") || info.menuItemId === MENU_ID_PARENT) {
    return; // Ignore clicks on the parent or non-group items
  }

  const groupName = info.menuItemId.replace("send-to-", "");
  console.log(`Context menu clicked for group: ${groupName}`);

  const groups = await getGroups();
  const groupDeviceIds = groups[groupName];

  if (!groupDeviceIds || groupDeviceIds.length === 0) {
    console.error(`Group "${groupName}" not found or is empty.`);
    // Optional: Notify user via notifications API
    return;
  }

  // Determine the URL to send
  // If clicked on a link, send the link URL, otherwise send the current tab's URL
  const urlToSend = info.linkUrl || tab.url;
  const titleToSend = info.linkText || tab.title || "Link"; // Use link text or tab title

  if (!urlToSend) {
      console.error("Could not determine URL to send.");
      return;
  }

  console.log(`Sending URL "${urlToSend}" to group "${groupName}" (Devices: ${groupDeviceIds.join(', ')})`);

  // Send the tab to each device in the group
  let successCount = 0;
  let errorCount = 0;
  for (const deviceId of groupDeviceIds) {
    try {
      await browser.tabs.sendToDevice(deviceId, [{ url: urlToSend, title: titleToSend }]);
      console.log(`Sent to device ${deviceId}`);
      successCount++;
    } catch (error) {
      console.error(`Error sending to device ${deviceId}:`, error);
      errorCount++;
      // Handle specific errors, e.g., device offline
    }
  }

  console.log(`Send complete for group "${groupName}". Success: ${successCount}, Errors: ${errorCount}`);
  // Optional: Notify user of success/failure count
  // browser.notifications.create(...)
});


// --- Message Listener (for communication with popup) ---
browser.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  console.log("Message received in background:", request);
  switch (request.action) {
    case "getDevices":
      try {
        const devices = await browser.sessions.getDevices({ maxResults: 50 }); // Max 50 devices
        console.log("Fetched devices:", devices);
        return Promise.resolve(devices); // Send devices back to popup
      } catch (error) {
        console.error("Error getting devices:", error);
        return Promise.reject(error);
      }
    case "getGroups":
      const groups = await getGroups();
      console.log("Sending groups to popup:", groups);
      return Promise.resolve(groups);
    case "saveGroups":
      await saveGroups(request.groups);
      return Promise.resolve({ success: true }); // Acknowledge save
    default:
      console.warn("Unknown action received:", request.action);
      return Promise.reject("Unknown action");
  }
});