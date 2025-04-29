import { STRINGS } from './constants.js';
import { renderDeviceName, renderDeviceList, isAndroid, LOCAL_STORAGE_KEYS, sendTabToGroupDirect, processIncomingTabs, getUnifiedState, showAndroidBanner, setLastSyncTime, showError, storage } from './utils.js';
import { injectSharedUI } from './shared-ui.js';
import { applyThemeFromStorage } from './theme.js';

// Cache DOM elements at the top for repeated use
const dom = {
    deviceNameSpan: document.getElementById('deviceName'),
    sendTabGroupsList: document.getElementById('sendTabGroupsList'),
    sendTabStatus: document.getElementById('sendTabStatus'),
    // deviceRegistryList seems unused in the popup, consider removing if not needed
    // deviceRegistryList: document.getElementById('deviceRegistryList'),
    openOptionsLink: document.getElementById('openOptionsLink'),
    refreshLink: document.getElementById('refreshLink'),
    loadingIndicator: document.getElementById('loadingIndicator'),
    // errorMessageDiv: document.getElementById('errorMessage'), // This might be redundant if #messageArea is used consistently
    messageArea: document.getElementById('messageArea'), // Added for consistency
    subscriptionsUl: document.getElementById('subscriptionsUl'),
    toggleDetailsBtn: document.getElementById('toggleDetailsBtn'),
    popupDetails: document.getElementById('popupDetails')
};

let localInstanceId = null; // Cache instance ID locally if needed

// Add a Sync Now button for Android users at the top of the popup
const syncNowBtn = document.createElement('button');
syncNowBtn.textContent = 'Sync Now';
// Apply appropriate classes instead of inline styles
// Use 'popup-action-btn' for consistency or a specific class like 'sync-now-button-popup'
syncNowBtn.className = 'popup-action-btn sync-now-button-popup';
// Removed inline styles: syncNowBtn.style.marginBottom = '10px';
// Removed inline styles: syncNowBtn.style.width = '100%';
syncNowBtn.setAttribute('aria-label', 'Sync extension data now');
syncNowBtn.tabIndex = 0; // Ensure keyboard accessibility

syncNowBtn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        syncNowBtn.click();
    }
});
syncNowBtn.addEventListener('click', async () => {
    // Disable button during sync
    syncNowBtn.disabled = true;
    showLoading(true); // Show loading indicator immediately
    clearMessage();    // Clear previous messages

    try {
        await loadStatus();
        // Re-enable after loadStatus completes (handled in loadStatus finally block)
        showMessage('Sync complete.', false);
    } catch (error) { // Add catch block
        console.error("Manual sync failed:", error);
        // Use the standard message area for errors
        showMessage(`Sync failed: ${error.message || 'Unknown error'}`, true);
    } finally { // Add finally block
        // Re-enable button and hide loading regardless of success/failure
        // Ensure loading is hidden *after* potential error message is shown
        showLoading(false);
        // Check if button still exists before trying to enable it
        if (syncNowBtn.isConnected) {
            syncNowBtn.disabled = false;
        }
        syncing = false; // Ensure syncing flag is reset (if loadStatus didn't already)
    }
});

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    injectSharedUI(); // Ensure shared UI elements like loading/message areas are present
    applyThemeFromStorage(); // Apply theme early

    if (await isAndroid()) {
        const container = document.querySelector('.container');
        if (container && !container.querySelector('.sync-now-button-popup')) { // Check for the specific class
            container.insertBefore(syncNowBtn, container.firstChild);
        }
        // Use utils functions, assuming they use CSS classes now
        showAndroidBanner(container, 'Note: On Firefox for Android, background processing is not available. Open this popup and tap "Sync Now" to process new tabs or changes.');
        setLastSyncTime(container, Date.now()); // Show initial time
    }

    // Add event listeners for footer links
    if (dom.openOptionsLink) {
        dom.openOptionsLink.addEventListener('click', (e) => {
            e.preventDefault();
            browser.runtime.openOptionsPage();
        });
    }
    if (dom.refreshLink) {
        dom.refreshLink.addEventListener('click', (e) => {
            e.preventDefault();
            loadStatus(); // Trigger a refresh/sync
        });
    }

    // Setup details toggle
    if (dom.toggleDetailsBtn && dom.popupDetails) {
        dom.toggleDetailsBtn.addEventListener('click', () => {
            const isHidden = dom.popupDetails.classList.toggle('hidden');
            dom.toggleDetailsBtn.textContent = isHidden ? '▼' : '▲'; // Update icon
            dom.toggleDetailsBtn.setAttribute('aria-label', isHidden ? 'Show details' : 'Hide details');
            dom.toggleDetailsBtn.setAttribute('title', isHidden ? 'Show device info' : 'Hide device info');
        });
    }

    // Initial load of status
    loadStatus();
});


// --- Load and Render Status ---
let syncing = false; // Prevent multiple syncs at once, especially on Android

async function loadStatus() {
    if (syncing) return; // Prevent concurrent runs

    syncing = true;
    showLoading(true);
    clearMessage(); // Clear previous messages

    // Disable sync button if it exists
    if (syncNowBtn.isConnected) { // Check if button is in the DOM
        syncNowBtn.disabled = true;
    }

    try {
        const isAndroidPlatform = await isAndroid();
        let state = await getUnifiedState(isAndroidPlatform);

        // Process incoming tabs immediately on Android after getting state
        if (isAndroidPlatform) {
            await processIncomingTabsAndroid(state);
            const container = document.querySelector('.container');
            setLastSyncTime(container, Date.now()); // Update sync time after processing

            // Optional: Show a brief success notification
            // Consider using showMessage instead of browser.notifications for consistency
            // showMessage('Sync complete.', false);
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
        showMessage(STRINGS.loadingSettingsError(error.message), true);

        // Provide fallback UI content on error
        if (dom.deviceNameSpan) dom.deviceNameSpan.textContent = STRINGS.error;
        if (dom.sendTabGroupsList) dom.sendTabGroupsList.textContent = 'Error loading groups.';
        if (dom.subscriptionsUl) dom.subscriptionsUl.innerHTML = `<li>${STRINGS.error}</li>`;

    } finally {
        showLoading(false); // Hide loading indicator
        syncing = false; // Allow syncing again

        // Re-enable sync button if it exists
        if (syncNowBtn.isConnected) {
            syncNowBtn.disabled = false;
        }
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
            await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.PROCESSED_TASKS, updated);
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

    ul.innerHTML = ''; // Clear previous list
    if (!subscriptions || subscriptions.length === 0) {
        const li = document.createElement('li');
        li.textContent = STRINGS.notSubscribed;
        ul.appendChild(li);
        return;
    }
    subscriptions.forEach(group => {
        const li = document.createElement('li');
        li.textContent = group;
        ul.appendChild(li);
    });
}

// Renders the "Send to [Group]" buttons
function renderSendTabGroups(groups) {
    const listContainer = dom.sendTabGroupsList;
    if (!listContainer) return; // Guard clause

    listContainer.innerHTML = ''; // Clear previous content

    if (!groups || groups.length === 0) {
        const div = document.createElement('div');
        div.className = 'small-text'; // Use existing class for styling
        div.textContent = STRINGS.noGroups;
        listContainer.appendChild(div);
        return;
    }

    // Sort groups alphabetically for consistent order
    groups.sort().forEach(groupName => {
        const btn = document.createElement('button');
        btn.textContent = `Send to ${groupName}`;
        // Apply consistent button classes
        btn.className = 'popup-action-btn send-to-group-button';
        btn.title = STRINGS.sendTabToGroup(groupName);
        btn.setAttribute('aria-label', STRINGS.sendTabToGroupAria(groupName));
        btn.tabIndex = 0; // Ensure keyboard accessibility

        // Add event listeners for click and keyboard activation
        btn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                btn.click(); // Trigger click handler
            }
        });
        btn.addEventListener('click', () => sendTabToGroup(groupName));

        listContainer.appendChild(btn);
    });
}

// Function to handle sending the current tab to a selected group
async function sendTabToGroup(groupName) {
    showSendStatus('Sending...', false); // Initial status message
    try {
        let response;
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (!tabs || tabs.length === 0) throw new Error('No active tab found.');

        const currentTab = tabs[0];
        // Validate tab URL - prevent sending internal/blank pages
        if (!currentTab.url || currentTab.url.startsWith('about:') || currentTab.url.startsWith('moz-extension:')) {
            showSendStatus(STRINGS.sendTabCannot, true); // Show error message
            return;
        }

        const tabData = { url: currentTab.url, title: currentTab.title || currentTab.url };

        // Send differently based on platform
        if (await isAndroid()) {
            response = await sendTabToGroupDirect(groupName, tabData);
        } else {
            // Send message to background script for desktop platforms
            response = await browser.runtime.sendMessage({
                action: 'sendTabFromPopup',
                groupName,
                tabData: tabData
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
    statusArea.classList.remove('hidden');
    // Use consistent CSS classes from styles.css
    statusArea.classList.toggle('error', !!isError); // Use !! to ensure boolean
    statusArea.classList.toggle('success', !isError);

    // Clear the message after a delay
    setTimeout(() => {
        statusArea.classList.add('hidden');
        // Optionally clear text and classes after hiding
        statusArea.textContent = '';
        statusArea.classList.remove('error', 'success');
    }, 3000); // 3-second display duration
}

// Shows general success/error messages in the main message area
function showMessage(message, isError = false) {
    const messageArea = dom.messageArea;
    if (!messageArea) return;

    messageArea.textContent = message;
    messageArea.className = 'message-area'; // Reset classes first
    messageArea.classList.add(isError ? 'error' : 'success');
    messageArea.classList.remove('hidden');

    // Auto-hide success messages after a delay
    if (!isError) {
        setTimeout(clearMessage, 4000); // 4-second display for success
    }
}

// Clears the main message area
function clearMessage() {
    const messageArea = dom.messageArea;
    if (messageArea) {
        messageArea.textContent = '';
        messageArea.className = 'message-area hidden'; // Add hidden class
    }
    // Also clear the specific error message div if it exists and is used
    // if (dom.errorMessageDiv) {
    //     dom.errorMessageDiv.classList.add('hidden');
    //     dom.errorMessageDiv.textContent = '';
    // }
}

// Toggles the visibility of the loading indicator
function showLoading(isLoading) {
    const loader = dom.loadingIndicator;
    if (!loader) return;

    loader.classList.toggle('hidden', !isLoading);

    // Ensure spinner is managed correctly (assuming spinner span is inside)
    if (isLoading && !loader.querySelector('.spinner')) {
        const spinnerSpan = document.createElement('span');
        spinnerSpan.className = 'spinner';
        loader.prepend(spinnerSpan); // Add spinner
        loader.append(' Loading...'); // Add text after spinner
    } else if (!isLoading && loader.querySelector('.spinner')) {
        loader.innerHTML = ''; // Clear content when not loading
    }
}
