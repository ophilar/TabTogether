import { STRINGS } from "../../common/constants.js";
import { storage } from "../../core/storage.js";
import { isAndroid } from "../../core/platform.js";
import { getUnifiedState } from "../../core/actions.js";
import { processIncomingTabsAndroid, createAndStoreGroupTask } from "../../core/tasks.js";
import { getInstanceId } from "../../core/instance.js";
import {
  showAndroidBanner,
  setLastSyncTime, // Import the correct function name
  showLoadingIndicator,
  showMessage,
  injectSharedUI
} from "../shared/shared-ui.js";
import { applyThemeFromStorage } from "../shared/theme.js";

// Cache DOM elements at the top for repeated use
const dom = {
  deviceNameSpan: null,
  sendTabGroupsList: null,
  sendTabStatus: null,
  openOptionsLink: null,
  refreshLink: null,
  messageArea: null,
  subscriptionsUl: null,
  toggleDetailsBtn: null,
  popupDetails: null, // Details section container
  loadingIndicator: null,
};

// --- Initialization ---
document.addEventListener("DOMContentLoaded", async () => {
  try {
    injectSharedUI();
    await applyThemeFromStorage();

    // Assign all DOM elements now that the DOM is ready
    // Explicitly assign critical elements first
    dom.loadingIndicator = document.getElementById("loadingIndicator");
    dom.messageArea = document.getElementById("messageArea");
    // Assign other elements
    dom.deviceNameSpan = document.getElementById("deviceName");
    dom.sendTabGroupsList = document.getElementById("sendTabGroupsList");
    dom.sendTabStatus = document.getElementById("sendTabStatus");
    dom.openOptionsLink = document.getElementById("openOptionsLink");
    dom.refreshLink = document.getElementById("refreshLink");
    dom.subscriptionsUl = document.getElementById("subscriptionsUl");
    dom.toggleDetailsBtn = document.getElementById("toggleDetailsBtn");
    dom.popupDetails = document.getElementById("popupDetails");

    if (!dom.loadingIndicator) {
      // Log to the main console if the popup's console isn't visible or working
      console.error("POPUP CRITICAL: dom.loadingIndicator is null after DOMContentLoaded assignment.");
    }

    console.log("Popup: Checking platform...");
    const isAndroidPlatform = await isAndroid();
    if (isAndroidPlatform) {
      const container = document.querySelector(".container");
      if (container) { // Check if container exists before using it
        showAndroidBanner(
          container, STRINGS.androidBannerPopup
        );
      }
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
        if (syncing || !dom.refreshLink) return; // Add null check for dom.refreshLink

        syncing = true;
        console.log("Popup: Starting sync...");
        dom.refreshLink.style.pointerEvents = 'none';

        if (syncIcon) syncIcon.classList.add("syncing-icon");
        const startTime = Date.now(); // Record start time

        try {
          await loadStatus(); // Refresh popup view & process tabs (Android)

          // After successful load/process, trigger heartbeat for non-Android.
          if (!isAndroidPlatform) {
            await browser.runtime.sendMessage({ action: "heartbeat" });
          } else { // On Android, heartbeat is part of loadState/getUnifiedState implicitly
            console.log("Android refresh: Heartbeat implicitly handled by getUnifiedState.");
          }
          const now = new Date();
          await storage.set(browser.storage.local, "lastSync", now.getTime());
          if (dom.messageArea) showMessage(dom.messageArea, STRINGS.syncComplete, false); // Check dom.messageArea
          // Update last sync time display on Android after manual sync
          const popupContainer = document.querySelector(".container");
          if (isAndroidPlatform && popupContainer) setLastSyncTime(popupContainer, now.getTime());
        } catch (error) {
          // Log errors that might occur during loadStatus or subsequent actions
          console.error("Error during refresh action:", error);
          if (dom.messageArea) showMessage(dom.messageArea, STRINGS.popupRefreshFailed(error.message || 'Unknown error'), true);
        } finally {
          const duration = Date.now() - startTime;
          const minAnimationTime = 500; // Minimum animation time
          if (syncIcon) {
            // Use Math.max directly for conciseness
            const delay = Math.max(0, minAnimationTime - duration);
            setTimeout(() => {
              if (syncIcon) syncIcon.classList.remove('syncing-icon');
            }, delay);
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
    await loadStatus(); // Ensure this is awaited

  } catch (e) {
    console.error("CRITICAL ERROR during popup DOMContentLoaded:", e);
    // Try to display an error message directly, in case dom.messageArea wasn't assigned
    const msgArea = document.getElementById("messageArea") || dom.messageArea;
    if (msgArea) {
      msgArea.textContent = STRINGS.errorInitializingPopup || "Error initializing popup. Check console."; // Add to STRINGS if needed
      msgArea.className = "message-area error";
      msgArea.classList.remove("hidden");
    }
    const loadingEl = document.getElementById("loadingIndicator") || dom.loadingIndicator;
    if (loadingEl) loadingEl.classList.add("hidden"); // Attempt to hide loading
  }
});

// --- Load and Render Status ---
let syncing = false; // Prevent multiple syncs at once, especially on Android

async function loadStatus() {
  // Removed redundant syncing check here, as it's handled by the refreshLink click listener

  const syncIcon = dom.refreshLink?.querySelector(".sync-icon-svg"); // Select icon if refreshLink exists

  if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, true);
  try {
    const isAndroidPlatform = await isAndroid();
    console.log(`Popup: Getting unified state. isAndroid: ${isAndroidPlatform}`);
    let state = await getUnifiedState(isAndroidPlatform); // Pass platform info

    // Process incoming tabs immediately on Android after getting state
    if (isAndroidPlatform) {
      await processIncomingTabsAndroid(state);
      const popupContainer = document.querySelector(".container");
      if (popupContainer) setLastSyncTime(popupContainer, Date.now());
    }


    // Validate state
    if (!state) throw new Error("Failed to retrieve extension state.");
    if (state.error) throw new Error(state.error); // Propagate error from background
    console.log("Popup received state:", state); // Log received state for debugging
    // Render UI components
    renderDeviceName(dom.deviceNameSpan, state.instanceName); // Use imported function
    renderSubscriptionsUI(state.subscriptions);
    renderSendTabGroups(state.definedGroups); // Uses the combined button approach
  } catch (error) {
    console.error("Error loading popup status:", error);
    if (dom.messageArea) showMessage(dom.messageArea, STRINGS.loadingSettingsError(error.message || "Unknown error"), true); // STRINGS.loadingSettingsError is good

    if (dom.deviceNameSpan) dom.deviceNameSpan.textContent = STRINGS.error;
    if (dom.sendTabGroupsList) dom.sendTabGroupsList.textContent = "Error loading groups.";
    if (dom.subscriptionsUl) {
      dom.subscriptionsUl.textContent = ''; // Clear safely first
      const li = document.createElement('li');
      li.textContent = STRINGS.errorLoadingSubscriptions || STRINGS.error; // Use a more specific string if available
      dom.subscriptionsUl.appendChild(li); // Append the error item
    }
  } finally {
    if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, false); // Hide loading indicator
  }
}

/**
 * Renders the device name in a given container element. (Moved from options-ui.js)
 * @param {HTMLElement} container - The container element to render the name into.
 * @param {string} name - The device name.
 */
function renderDeviceName(container, name) {
  if (container) { // Guard clause
    container.textContent = name || STRINGS.deviceNameNotSet;
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
    // Visual styling comes from base button styles (styles.css) and layout from send-to-group-button (popup.css)
    btn.className = "send-to-group-button";
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
  showSendStatus(STRINGS.sendingTab, false); // Initial status message
  try {
    let response;
    const tabs = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tabs || tabs.length === 0) throw new Error(STRINGS.noActiveTabFound);

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
    console.log(`Popup: Sending tab to group "${groupName}" (Platform: ${await isAndroid() ? 'Android' : 'Desktop'})`);
    if (await isAndroid()) {
      const instanceId = await getInstanceId();
      response = await createAndStoreGroupTask(groupName, tabData);
      console.log(`Popup:sendTabToGroup (Android) - Response from createAndStoreGroupTask for group "${groupName}":`, response);
    } else {
      // Send message to background script for desktop platforms
      response = await browser.runtime.sendMessage({ action: "sendTabFromPopup", groupName, tabData: tabData });
    }

    // Handle the response from the send action
    if (response?.success) {
      showSendStatus(STRINGS.sentToGroup(groupName), false); // Success feedback
    } else {
      // Show specific error message from response, or generic failure
      showSendStatus(response?.message || STRINGS.sendTabFailed, true);
    }
  } catch (error) {
    console.error(`Error sending tab to group ${groupName}:`, error);
    showSendStatus(STRINGS.sendTabError(error.message || "Unknown error"), true); // Show error feedback
  }
}

// --- UI Helper Functions ---

// Shows status messages (like "Sending...", "Sent!", "Error...")
function showSendStatus(message, isError) {
  const statusArea = dom.sendTabStatus;
  if (!statusArea) return; // Guard clause

  statusArea.textContent = message;
  statusArea.classList.remove("hidden");
  // Use consistent CSS classes from styles.css
  statusArea.classList.toggle("error", isError); // isError is already boolean
  statusArea.classList.toggle("success", !isError);

  // Clear the message after a delay
  const timeoutId = setTimeout(() => {
    statusArea.classList.add("hidden");
    // Optionally clear text and classes after hiding
    statusArea.textContent = "";
    statusArea.classList.remove("error", "success");
  }, 3000); // 3-second display duration
}
