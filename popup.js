import { STRINGS } from "./constants.js";
import {
  renderDeviceName,
  isAndroid,
  LOCAL_STORAGE_KEYS,
  sendTabToGroupDirect,
  processIncomingTabs,
  getUnifiedState,
  showAndroidBanner,
  setLastSyncTime,
  storage,
  showLoadingIndicator,
  showMessage,
  clearMessage,
} from "./utils.js";
import { injectSharedUI } from "./shared-ui.js";
import { applyThemeFromStorage } from "./theme.js";

// Cache DOM elements at the top for repeated use
const dom = {
  deviceNameSpan: document.getElementById("deviceName"),
  sendTabGroupsList: document.getElementById("sendTabGroupsList"),
  sendTabStatus: document.getElementById("sendTabStatus"),
  openOptionsLink: document.getElementById("openOptionsLink"),
  refreshLink: document.getElementById("refreshLink"),
  messageArea: document.getElementById("messageArea"), // Added for consistency
  subscriptionsUl: document.getElementById("subscriptionsUl"),
  toggleDetailsBtn: document.getElementById("toggleDetailsBtn"),
  popupDetails: document.getElementById("popupDetails"),
};

const loadingIndicator = document.getElementById("loadingIndicator");
let localInstanceId = null; // Cache instance ID locally if needed

// --- Initialization ---
document.addEventListener("DOMContentLoaded", async () => {
  injectSharedUI(); // Ensure shared UI elements like loading/message areas are present
  applyThemeFromStorage(); // Apply theme early

  if (await isAndroid()) {
    const container = document.querySelector(".container");
    showAndroidBanner(
      container,
      'Note: On Firefox for Android, background processing is not available. Open this popup and tap "Sync Now" to process new tabs or changes.'
    );
    setLastSyncTime(container, Date.now()); // Show initial time
  }

  // Add event listeners for footer links
  if (dom.openOptionsLink) {
    dom.openOptionsLink.addEventListener("click", (e) => {
      e.preventDefault();
      browser.runtime.openOptionsPage();
    });
  }
  if (dom.refreshLink) {
    dom.refreshLink.addEventListener("click", (e) => {
      const syncIcon = dom.refreshLink.querySelector(".sync-icon-svg"); // Select the icon
      e.preventDefault();
      if (syncIcon) syncIcon.classList.add("syncing-icon"); // Start animation immediately for responsiveness
      loadStatus(); // Trigger a refresh/sync
    });
  }

  // Setup details toggle
  if (dom.toggleDetailsBtn && dom.popupDetails) {
    dom.toggleDetailsBtn.addEventListener("click", () => {
      const isHidden = dom.popupDetails.classList.toggle("hidden");
      dom.toggleDetailsBtn.textContent = isHidden ? "▼" : "▲"; // REMOVED: This overwrites the image
      dom.toggleDetailsBtn.setAttribute(
        "aria-label",
        isHidden ? "Show details" : "Hide details"
      );
      dom.toggleDetailsBtn.setAttribute(
        "title",
        isHidden ? "Show device info" : "Hide device info"
      );
      // --- Chevron Animation ---
      const chevronIcon = dom.toggleDetailsBtn.querySelector(
        ".details-toggle-icon"
      );
      if (chevronIcon) {
        chevronIcon.classList.toggle("details-open", !isHidden);
      }
    });
  }

  // Initial load of status
  loadStatus();
});

// --- Load and Render Status ---
let syncing = false; // Prevent multiple syncs at once, especially on Android

async function loadStatus() {
  if (syncing) return; // Prevent concurrent runs

  const syncIcon = dom.refreshLink?.querySelector(".sync-icon-svg"); // Select icon if refreshLink exists
  syncing = true;
  showLoadingIndicator(dom.loadingIndicator, true);
  clearMessage(dom.messageArea); // Clear previous messages

  try {
    const isAndroidPlatform = await isAndroid();
    let state = await getUnifiedState(isAndroidPlatform);

    // Process incoming tabs immediately on Android after getting state
    if (isAndroidPlatform) {
      await processIncomingTabsAndroid(state);
      const container = document.querySelector(".container");
      setLastSyncTime(container, Date.now()); // Update sync time after processing
    }

    // Validate state
    if (!state) throw new Error("Failed to retrieve extension state.");
    if (state.error) throw new Error(state.error); // Propagate error from background

    localInstanceId = state.instanceId; // Store instance ID if needed elsewhere

    // Render UI components
    renderDeviceNameUI(state.instanceName);
    renderSubscriptionsUI(state.subscriptions);
    renderSendTabGroups(state.definedGroups); // Uses the combined button approach
  } catch (error) {
    console.error("Error loading popup status:", error);
    // Use consistent message area
    showMessage(dom.messageArea, STRINGS.loadingSettingsError(error.message), true);

    // Provide fallback UI content on error
    if (dom.deviceNameSpan) dom.deviceNameSpan.textContent = STRINGS.error;
    if (dom.sendTabGroupsList)
      dom.sendTabGroupsList.textContent = "Error loading groups.";
    if (dom.subscriptionsUl)
      dom.subscriptionsUl.innerHTML = `<li>${STRINGS.error}</li>`;
  } finally {
    showLoadingIndicator(dom.loadingIndicator, false); // Hide loading indicator
    if (syncIcon) syncIcon.classList.remove("syncing-icon"); // Stop animation
    syncing = false; // Allow syncing again
  }
}

// Helper to process tabs specifically on Android
async function processIncomingTabsAndroid(state) {
  await processIncomingTabs(
    state,
    // Function to open tab
    async (url, title) => {
      // Consider adding error handling for tab creation
      try {
        await browser.tabs.create({ url, title, active: false });
      } catch (e) {
        console.error(`Failed to create tab for ${url}:`, e);
        // Optionally notify user
      }
    },
    // Function to update processed tasks in local storage
    async (updated) => {
      await storage.set(
        browser.storage.local,
        LOCAL_STORAGE_KEYS.PROCESSED_TASKS,
        updated
      );
    }
  );
}

// Renders the device name
function renderDeviceNameUI(name) {
  if (dom.deviceNameSpan) {
    renderDeviceName(dom.deviceNameSpan, name); // Uses util function
  }
}

// Renders the list of subscribed groups in the details section
function renderSubscriptionsUI(subscriptions) {
  const ul = dom.subscriptionsUl;
  if (!ul) return; // Guard clause

  ul.innerHTML = ""; // Clear previous list
  if (!subscriptions || subscriptions.length === 0) {
    const li = document.createElement("li");
    li.textContent = STRINGS.notSubscribed;
    ul.appendChild(li);
    return;
  }
  subscriptions.forEach((group) => {
    const li = document.createElement("li");
    li.textContent = group;
    ul.appendChild(li);
  });
}

// Renders the "Send to [Group]" buttons
function renderSendTabGroups(groups) {
  const listContainer = dom.sendTabGroupsList;
  if (!listContainer) return; // Guard clause

  listContainer.innerHTML = ""; // Clear previous content

  if (!groups || groups.length === 0) {
    const div = document.createElement("div");
    div.className = "small-text"; // Use existing class for styling
    div.textContent = STRINGS.noGroups;
    listContainer.appendChild(div);
    return;
  }

  // Sort groups alphabetically for consistent order
  groups.sort().forEach((groupName) => {
    const btn = document.createElement("button");
    btn.textContent = `Send to ${groupName}`;
    // Apply consistent button classes
    btn.className = "popup-action-btn send-to-group-button";
    btn.title = STRINGS.sendTabToGroup(groupName);
    btn.setAttribute("aria-label", STRINGS.sendTabToGroupAria(groupName));
    btn.tabIndex = 0; // Ensure keyboard accessibility

    // Add event listeners for click and keyboard activation
    btn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        btn.click(); // Trigger click handler
      }
    });
    btn.addEventListener("click", () => sendTabToGroup(groupName));

    listContainer.appendChild(btn);
  });
}

// Function to handle sending the current tab to a selected group
async function sendTabToGroup(groupName) {
  showSendStatus("Sending...", false); // Initial status message
  try {
    let response;
    const tabs = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tabs || tabs.length === 0) throw new Error("No active tab found.");

    const currentTab = tabs[0];
    // Validate tab URL - prevent sending internal/blank pages
    if (
      !currentTab.url ||
      currentTab.url.startsWith("about:") ||
      currentTab.url.startsWith("moz-extension:")
    ) {
      showSendStatus(STRINGS.sendTabCannot, true); // Show error message
      return;
    }

    const tabData = {
      url: currentTab.url,
      title: currentTab.title || currentTab.url,
    };

    // Send differently based on platform
    if (await isAndroid()) {
      response = await sendTabToGroupDirect(groupName, tabData);
    } else {
      // Send message to background script for desktop platforms
      response = await browser.runtime.sendMessage({
        action: "sendTabFromPopup",
        groupName,
        tabData: tabData,
      });
    }

    // Handle the response from the send action
    if (response && response.success) {
      showSendStatus(`Sent to ${groupName}!`, false); // Success feedback
    } else {
      // Show specific error message from response, or generic failure
      showSendStatus(response?.message || STRINGS.sendTabFailed, true);
    }
  } catch (error) {
    console.error(`Error sending tab to group ${groupName}:`, error);
    showSendStatus(STRINGS.sendTabError(error.message), true); // Show error feedback
  }
}

// --- UI Helper Functions ---

// Shows status messages (like "Sending...", "Sent!", "Error...")
function showSendStatus(message, isError) {
  const statusArea = dom.sendTabStatus;
  if (!statusArea) return;

  statusArea.textContent = message;
  statusArea.classList.remove("hidden");
  // Use consistent CSS classes from styles.css
  statusArea.classList.toggle("error", !!isError); // Use !! to ensure boolean
  statusArea.classList.toggle("success", !isError);

  // Clear the message after a delay
  const timeoutId = setTimeout(() => {
    statusArea.classList.add("hidden");
    // Optionally clear text and classes after hiding
    statusArea.textContent = "";
    statusArea.classList.remove("error", "success");
  }, 3000); // 3-second display duration
}
