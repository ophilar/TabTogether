// popup.js

const deviceNameSpan = document.getElementById('deviceName');
// const deviceIdSpan = document.getElementById('deviceId');
const mySubscriptionsList = document.getElementById('mySubscriptionsList');
const deviceRegistryList = document.getElementById('deviceRegistryList');
const openOptionsLink = document.getElementById('openOptionsLink');
const refreshLink = document.getElementById('refreshLink');
const loadingIndicator = document.getElementById('loadingIndicator');
const errorMessageDiv = document.getElementById('errorMessage');

let localInstanceId = null; // Store local ID for highlighting

// --- Initialization ---
document.addEventListener('DOMContentLoaded', loadStatus);
openOptionsLink.addEventListener('click', (e) => {
    e.preventDefault();
    browser.runtime.openOptionsPage();
});
refreshLink.addEventListener('click', (e) => {
    e.preventDefault();
    loadStatus();
});

const sendTabGroupSelect = document.getElementById('sendTabGroupSelect');
const sendTabBtn = document.getElementById('sendTabBtn');
const sendTabStatus = document.getElementById('sendTabStatus');

// --- Load and Render Status ---
async function loadStatus() {
    showLoading(true);
    errorMessageDiv.style.display = 'none'; // Hide previous errors
    try {
        const state = await browser.runtime.sendMessage({ action: 'getState' });

        if (state && state.error) {
            throw new Error(state.error);
        }
        if (!state) {
             throw new Error("Received no state from background script.");
        }

        console.log("Popup state loaded:", state);
        localInstanceId = state.instanceId; // Store for comparison

        renderDeviceName(state.instanceName);
        // renderDeviceId(state.instanceId);
        renderSubscriptions(state.subscriptions);
        renderRegistry(state.deviceRegistry);
        renderSendTabSection(state.definedGroups);

    } catch (error) {
        console.error("Error loading status:", error);
        errorMessageDiv.textContent = `Error: ${error.message}`;
        errorMessageDiv.style.display = 'block';
        // Clear potentially stale data
        deviceNameSpan.textContent = 'Error';
        // deviceIdSpan.textContent = 'Error';
        mySubscriptionsList.innerHTML = '<li>Error loading</li>';
        deviceRegistryList.innerHTML = '<li>Error loading</li>';
        renderSendTabSection([]); // Pass empty array to clear/disable
    } finally {
        showLoading(false);
    }
}

function renderDeviceName(name) {
    deviceNameSpan.textContent = name || 'N/A';
}
// function renderDeviceId(id) {
    // deviceIdSpan.textContent = id || 'N/A';
// }

function renderSubscriptions(subscriptions) {
    mySubscriptionsList.innerHTML = ''; // Clear previous
    if (!subscriptions || subscriptions.length === 0) {
        mySubscriptionsList.innerHTML = '<li>Not subscribed to any groups.</li>';
        return;
    }
    subscriptions.sort().forEach(groupName => {
        const li = document.createElement('li');
        li.textContent = groupName;
        mySubscriptionsList.appendChild(li);
    });
}

function renderRegistry(registry) {
    deviceRegistryList.innerHTML = ''; // Clear previous
    if (!registry || Object.keys(registry).length === 0) {
        deviceRegistryList.innerHTML = '<li>Registry is empty.</li>';
        return;
    }

    // Sort devices by name for consistent display
    const sortedDeviceIds = Object.keys(registry).sort((a, b) => {
        const nameA = registry[a]?.name?.toLowerCase() || '';
        const nameB = registry[b]?.name?.toLowerCase() || '';
        return nameA.localeCompare(nameB);
    });

    sortedDeviceIds.forEach(deviceId => {
        const device = registry[deviceId];
        const li = document.createElement('li');

        const nameStrong = document.createElement('strong');
        nameStrong.textContent = device.name || 'Unnamed Device';
        li.appendChild(nameStrong);

        if (deviceId === localInstanceId) {
            li.classList.add('this-device'); // Add class for styling
            const thisDeviceSpan = document.createElement('span');
            thisDeviceSpan.textContent = ' (This Device)';
            thisDeviceSpan.style.fontWeight = 'normal'; // Keep "(This Device)" normal weight
            li.appendChild(thisDeviceSpan);
        }

        const detailsDiv = document.createElement('div');
        detailsDiv.className = 'small-text';
        // Format lastSeen timestamp (basic example)
        const lastSeenDate = device.lastSeen ? new Date(device.lastSeen) : null;
        const lastSeenString = lastSeenDate
            ? `Last seen: ${lastSeenDate.toLocaleDateString()} ${lastSeenDate.toLocaleTimeString()}`
            : 'Last seen: Unknown';
        detailsDiv.textContent = `${lastSeenString}`;
        li.appendChild(detailsDiv);

        deviceRegistryList.appendChild(li);
    });
}

function renderSendTabSection(definedGroups) {
    const groups = definedGroups || [];
    // Clear previous options except the placeholder
    while (sendTabGroupSelect.options.length > 1) {
        sendTabGroupSelect.remove(1);
    }
    sendTabBtn.disabled = true; // Disable initially
    sendTabGroupSelect.disabled = false; // Ensure select is enabled by default

    if (groups.length > 0) {
        groups.sort().forEach(groupName => {
            const option = document.createElement('option');
            option.value = groupName;
            option.textContent = groupName;
            sendTabGroupSelect.appendChild(option);
        });
        // Enable button only if a group is selected
        sendTabGroupSelect.onchange = () => {
            sendTabBtn.disabled = sendTabGroupSelect.value === "";
        };
    } else {
          // If no groups, disable the select and button, update placeholder maybe
          sendTabGroupSelect.options[0].textContent = "No groups available"; // Update placeholder text
          sendTabGroupSelect.disabled = true; // Disable select if no groups
          sendTabBtn.disabled = true; // Disable button if no groups
    }
}

// --- Event Handlers (Additions) ---
sendTabBtn.onclick = async () => {
    const selectedGroup = sendTabGroupSelect.value;
    if (!selectedGroup) return;

    showSendStatus("Sending...", false);
    sendTabBtn.disabled = true; // Prevent double-clicks

    try {
        // Get the current active tab
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (tabs && tabs.length > 0) {
            const currentTab = tabs[0];
            if (!currentTab.url || currentTab.url.startsWith("about:") || currentTab.url.startsWith("moz-extension:")) {
                 showSendStatus("Cannot send this type of tab.", true);
                 return;
            }
            // Send message to background script to handle the sending
            const response = await browser.runtime.sendMessage({
                action: 'sendTabFromPopup',
                groupName: selectedGroup,
                tabData: { url: currentTab.url, title: currentTab.title }
            });
            if (response.success) {
                showSendStatus(`Sent to ${selectedGroup}!`, false);
            } else {
                showSendStatus(response.message || "Send failed.", true);
            }
        } else {
            showSendStatus("Could not find active tab.", true);
        }
    } catch (error) {
        console.error("Error sending tab from popup:", error);
        showSendStatus(`Error: ${error.message}`, true);
    } finally {
         // Re-enable button after a short delay unless still on placeholder
         setTimeout(() => {
             sendTabBtn.disabled = sendTabGroupSelect.value === "";
         }, 1500);
    }
};

function showLoading(isLoading) {
    loadingIndicator.style.display = isLoading ? 'block' : 'none';
    // Disable all buttons and inputs while loading
    document.querySelectorAll('button, input, select').forEach(el => {
        el.disabled = isLoading || el.disabled;
    });
}

function showSendStatus(message, isError) {
    sendTabStatus.textContent = message;
    sendTabStatus.style.color = isError ? 'red' : 'green';
    sendTabStatus.style.display = 'block';
    // Optional: Hide status message after a delay
    setTimeout(() => { sendTabStatus.style.display = 'none'; }, 3000);
}

// --- UI Helpers (Modify showError) ---
function showError(message) { // Make error display more persistent
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    // Remove auto-hide or increase delay
    // setTimeout(() => { errorMessage.style.display = 'none'; }, 7000);
}