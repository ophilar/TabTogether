// popup.js - Simplified

document.addEventListener('DOMContentLoaded', loadState);

// --- Elements ---
const deviceNameEl = document.getElementById('deviceName');
const mySubscriptionsListEl = document.getElementById('mySubscriptionsList');
const deviceRegistryListEl = document.getElementById('deviceRegistryList');
const openOptionsLink = document.getElementById('openOptionsLink');
const loadingIndicator = document.getElementById('loadingIndicator');
const errorMessage = document.getElementById('errorMessage');

// --- State ---
let currentState = {};

// --- Load Initial State ---
async function loadState() {
    showLoading(true);
    errorMessage.style.display = 'none';
    try {
        currentState = await browser.runtime.sendMessage({ action: 'getState' });
        console.log("Popup received state:", currentState);
         if (!currentState || !currentState.instanceName) {
             console.warn("Popup state received from background might be incomplete.");
             // Don't retry here, just display what we have or loading state
         }
        render();
    } catch (error) {
        showError(`Error loading status: ${error.message || error}`);
        console.error("Error loading status:", error);
    } finally {
        showLoading(false);
    }
}

// --- Rendering ---
function render() {
     if (!currentState) {
        deviceNameEl.textContent = 'Error';
        mySubscriptionsListEl.innerHTML = '<p><small>Could not load state.</small></p>';
        deviceRegistryListEl.innerHTML = '<p><small>Could not load state.</small></p>';
        return;
    }
    deviceNameEl.textContent = currentState.instanceName || '(Not Set)';
    renderMySubscriptions();
    renderDeviceRegistry();
}

function renderMySubscriptions() {
    const subscriptions = currentState.subscriptions || [];
    if (subscriptions.length === 0) {
        mySubscriptionsListEl.innerHTML = '<p><small>No subscriptions.</small></p>';
        return;
    }
    const ul = document.createElement('ul');
    subscriptions.sort().forEach(groupName => {
        const li = document.createElement('li');
        li.textContent = groupName;
        ul.appendChild(li);
    });
    mySubscriptionsListEl.innerHTML = '';
    mySubscriptionsListEl.appendChild(ul);
}

function renderDeviceRegistry() {
    const registry = currentState.deviceRegistry || {};
    const deviceIds = Object.keys(registry);
     if (deviceIds.length === 0) {
        deviceRegistryListEl.innerHTML = '<p><small>No devices registered.</small></p>';
        return;
    }
    const ul = document.createElement('ul');
    deviceIds.forEach(id => {
        const device = registry[id];
        const li = document.createElement('li');
        const isSelf = id === currentState.instanceId;
        li.textContent = `${device.name || 'Unknown'} ${isSelf ? '(This)' : ''}`;
        li.title = `Last Seen: ${new Date(device.lastSeen).toLocaleString()}`; // Tooltip for details
        ul.appendChild(li);
    });
     deviceRegistryListEl.innerHTML = '';
     deviceRegistryListEl.appendChild(ul);
}

// --- Event Handlers ---
openOptionsLink.onclick = (e) => {
    e.preventDefault();
    browser.runtime.openOptionsPage();
    window.close(); // Close the popup after opening options
};

// --- UI Helpers ---
function showLoading(isLoading) {
    loadingIndicator.style.display = isLoading ? 'block' : 'none';
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    setTimeout(() => { errorMessage.style.display = 'none'; }, 5000);
}