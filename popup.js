// popup.js

const deviceNameSpan = document.getElementById('deviceName');
const deviceIdSpan = document.getElementById('deviceId');
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
        renderDeviceId(state.instanceId);
        renderSubscriptions(state.subscriptions);
        renderRegistry(state.deviceRegistry);

    } catch (error) {
        console.error("Error loading status:", error);
        errorMessageDiv.textContent = `Error: ${error.message}`;
        errorMessageDiv.style.display = 'block';
        // Clear potentially stale data
        deviceNameSpan.textContent = 'Error';
        deviceIdSpan.textContent = 'Error';
        mySubscriptionsList.innerHTML = '<li>Error loading</li>';
        deviceRegistryList.innerHTML = '<li>Error loading</li>';
    } finally {
        showLoading(false);
    }
}

function renderDeviceName(name) {
    deviceNameSpan.textContent = name || 'N/A';
}
function renderDeviceId(id) {
    deviceIdSpan.textContent = id || 'N/A';
}

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
        detailsDiv.textContent = `ID: ${deviceId} | ${lastSeenString}`;
        li.appendChild(detailsDiv);

        deviceRegistryList.appendChild(li);
    });
}

function showLoading(isLoading) {
    loadingIndicator.style.display = isLoading ? 'block' : 'none';
}
