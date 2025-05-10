import { STRINGS, LOCAL_STORAGE_KEYS } from "../../common/constants.js"; // Added LOCAL_STORAGE_KEYS
import { storage } from "../../core/storage.js";
import { isAndroid } from "../../core/platform.js";
import { getUnifiedState } from "../../core/actions.js";
import { processIncomingTabsAndroid, createAndStoreGroupTask } from "../../core/tasks.js";
import { getInstanceId } from "../../core/instance.js";
import {
  showAndroidBanner,
  setLastSyncTimeUI as setLastSyncTime, // Alias to match existing usage
  showLoadingIndicator,
  showMessage,
} from "../shared/ui-helpers.js";
import { injectSharedUI } from "../shared/shared-ui.js";
import { applyThemeFromStorage } from "../shared/theme.js"; // Corrected path

function renderDeviceNameUI(container, name) { // Keep as local helper or move to popup-ui.js if it grows
  if (container) {
    container.textContent = name || STRINGS.deviceNameNotSet;
  }
}

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

let loadingIndicator; // Declare, assign after UI injection

// --- Initialization ---
document.addEventListener("DOMContentLoaded", async () => {
  injectSharedUI(); // Ensure shared UI elements like loading/message areas are present
  applyThemeFromStorage(); // Apply theme early

  loadingIndicator = document.getElementById("loadingIndicator");
  dom.messageArea = document.getElementById("messageArea"); // Also re-assign if injectSharedUI creates it

  // Add Firefox Sync information message
  const syncInfoContainer = document.getElementById('syncInfoContainer'); // Assuming you add this to popup.html
  if (syncInfoContainer) {
    syncInfoContainer.textContent = STRINGS.SYNC_INFO_MESSAGE_POPUP || "For cross-device sync, enable Firefox Sync for add-ons."; // Fallback text
    syncInfoContainer.className = 'sync-info-message small-text popup-sync-info'; // Added popup-sync-info for specific styles
  } else {
    // Fallback if the dedicated container isn't there, prepend to the main container
    const mainPopupContainer = document.querySelector('.container');
    // Styles for this fallback are now in popup.css under .popup-sync-info-fallback
    if (mainPopupContainer) mainPopupContainer.insertAdjacentHTML('afterbegin', `<p class="sync-info-message small-text popup-sync-info-fallback">${STRINGS.SYNC_INFO_MESSAGE_POPUP || "For cross-device sync, enable Firefox Sync for add-ons."}</p>`);
  }

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
    dom.refreshLink.addEventListener("click", async (e) => { // Make handler async
      const syncIcon = dom.refreshLink.querySelector(".sync-icon-svg"); // Select the icon
      e.preventDefault();

      // Prevent multiple clicks while syncing
      if (syncing) return;
      syncing = true; // Set flag immediately
      dom.refreshLink.style.pointerEvents = 'none'; // Disable clicks visually

      if (syncIcon) syncIcon.classList.add("syncing-icon"); // Start animation immediately for responsiveness
      const startTime = Date.now(); // Record start time

      try {
        await loadStatus(); // Refresh popup view & process tabs (Android)

        // After successful load/process, update local sync time and trigger heartbeat.
        if (!isAndroidPlatform) {
          await browser.runtime.sendMessage({ action: "heartbeat" });
        } else { // On Android, heartbeat is part of loadState/getUnifiedState implicitly
            console.log("Android refresh: Heartbeat implicitly handled by getUnifiedState.");
        }
        const now = new Date();
        await storage.set(browser.storage.local, "lastSync", now.getTime());
        showMessage(dom.messageArea, 'Sync complete.', false); // Show success in popup
      } catch (error) {
        // Log errors that might occur during loadStatus or subsequent actions
        console.error("Error during refresh action:", error);
      } finally {
        const duration = Date.now() - startTime;
        const minAnimationTime = 500; // Minimum animation time
        if (syncIcon) {
          // Use Math.max directly for conciseness
          const delay = Math.max(0, minAnimationTime - duration);
          setTimeout(() => syncIcon.classList.remove('syncing-icon'), delay);
        }
        dom.refreshLink.style.pointerEvents = ''; // Re-enable clicks
        syncing = false; // Reset syncing flag *only* in finally
      }
    });
  }

  // Setup details toggle
  if (dom.toggleDetailsBtn && dom.popupDetails) {
    dom.toggleDetailsBtn.addEventListener("click", () => {
      const isHidden = dom.popupDetails.classList.toggle("hidden");
      dom.toggleDetailsBtn.textContent = isHidden ? "▼" : "▲"; // Update button text based on state
      dom.toggleDetailsBtn.setAttribute(
        "aria-label",
        isHidden ? "Show details" : "Hide details"
      );
      dom.toggleDetailsBtn.setAttribute(
        "title",
        isHidden ? "Show device info" : "Hide device info"
      );
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
  // syncing = true; // Moved to click handler
  showLoadingIndicator(dom.loadingIndicator, true);
  try {
    const isAndroidPlatform = await isAndroid();
    let state = await getUnifiedState(isAndroidPlatform); // Pass platform info

    // Process incoming tabs immediately on Android after getting state
    if (isAndroidPlatform) {
      await processIncomingTabsAndroid(state);
      const container = document.querySelector(".container");
      setLastSyncTime(container, Date.now()); // Update sync time after processing
    }

    // Validate state
    if (!state) throw new Error("Failed to retrieve extension state.");
    if (state.error) throw new Error(state.error); // Propagate error from background
    console.log("Popup received state:", state); // Log received state for debugging
    // Render UI components
    renderDeviceNameUI(dom.deviceNameSpan, state.instanceName);
    renderSubscriptionsUI(state.subscriptions);
    renderSendTabGroups(state.definedGroups); // Uses the combined button approach
  } catch (error) {
    console.error("Error loading popup status:", error);
    // Use consistent message area
    showMessage(dom.messageArea, STRINGS.loadingSettingsError(error.message), true);

    if (dom.deviceNameSpan) dom.deviceNameSpan.textContent = STRINGS.error;
    if (dom.sendTabGroupsList) dom.sendTabGroupsList.textContent = "Error loading groups.";
    if (dom.subscriptionsUl) {
      dom.subscriptionsUl.textContent = ''; // Clear safely first
      const li = document.createElement('li');
      li.textContent = STRINGS.error; // Set error text
      dom.subscriptionsUl.appendChild(li); // Append the error item
    }
  } finally {
    showLoadingIndicator(dom.loadingIndicator, false); // Hide loading indicator
  }
}

// Renders the list of subscribed groups in the details section
function renderSubscriptionsUI(subscriptions) {
  const ul = dom.subscriptionsUl;
  if (!ul) return; // Guard clause

  ul.textContent = ""; // Clear previous list safely
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

  listContainer.textContent = ""; // Clear previous content safely

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
      const instanceId = await getInstanceId();
      response = await createAndStoreGroupTask(groupName, tabData, instanceId);
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
