// popup.js

const deviceNameSpan = document.getElementById('deviceName');
const sendTabGroupsList = document.getElementById('sendTabGroupsList');
const sendTabStatus = document.getElementById('sendTabStatus');
const mySubscriptionsList = document.getElementById('mySubscriptionsList');
const deviceRegistryList = document.getElementById('deviceRegistryList');
const openOptionsLink = document.getElementById('openOptionsLink');
const refreshLink = document.getElementById('refreshLink');
const loadingIndicator = document.getElementById('loadingIndicator');
const errorMessageDiv = document.getElementById('errorMessage');

let localInstanceId = null; // Store local ID for highlighting

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // Apply dark mode setting from localStorage
    const saved = localStorage.getItem('tt_dark_mode');
    if (saved === 'enabled') {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else if (saved === 'disabled') {
        document.documentElement.setAttribute('data-theme', 'light');
    } else {
        // auto or not set
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    }
    loadStatus();
});
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

// --- Load and Render Status ---
async function loadStatus() {
    showLoading(true);
    errorMessageDiv.style.display = 'none'; // Hide previous errors
    try {
        await browser.runtime.sendMessage({ action: 'heartbeat' }); // Heartbeat on popup open
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
        renderSubscriptions(state.subscriptions);
        renderRegistry(state.deviceRegistry);
        renderSendTabGroups(state.definedGroups);
        showLoading(false); // Ensure loading indicator is hidden on success

    } catch (error) {
        console.error("Error loading status:", error);
        errorMessageDiv.textContent = `Error: ${error.message}`;
        errorMessageDiv.style.display = 'block';
        // Clear potentially stale data
        deviceNameSpan.textContent = 'Error';
        sendTabGroupsList.innerHTML = '<div class="error">' + error.message + '</div>';
        showLoading(false); // Ensure loading indicator is hidden on error
    }
}

function renderDeviceName(name) {
    deviceNameSpan.textContent = name || '(Not Set)';
}

function renderSendTabGroups(groups) {
    sendTabGroupsList.innerHTML = '';
    if (!groups || groups.length === 0) {
        sendTabGroupsList.innerHTML = '<div class="small-text">No groups defined. Use Settings to create one.</div>';
        return;
    }
    groups.sort().forEach(groupName => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'send-group-row';
        const label = document.createElement('span');
        label.textContent = groupName;
        label.className = 'send-group-label';
        const btn = document.createElement('button');
        btn.textContent = 'Send Current Tab';
        btn.className = 'send-group-btn';
        btn.title = `Send current tab to group '${groupName}'`;
        btn.onclick = () => sendTabToGroup(groupName);
        groupDiv.appendChild(label);
        groupDiv.appendChild(btn);
        sendTabGroupsList.appendChild(groupDiv);
    });
}

function renderSubscriptions(subscriptions) {
    if (!subscriptions || subscriptions.length === 0) {
        mySubscriptionsList.textContent = 'Not subscribed to any groups.';
        return;
    }
    mySubscriptionsList.textContent = 'Subscribed groups: ' + subscriptions.join(', ');
}

function renderRegistry(deviceRegistry) {
    if (!deviceRegistry || Object.keys(deviceRegistry).length === 0) {
        deviceRegistryList.textContent = 'No devices registered.';
        return;
    }
    const entries = Object.entries(deviceRegistry)
        .sort((a, b) => (a[1]?.name || '').localeCompare(b[1]?.name || ''));
    let html = '<ul>';
    for (const [id, device] of entries) {
        // html += `<li${id === localInstanceId ? ' class="this-device"' : ''}>`;
        html += `<span>${device.name || 'Unnamed Device'}</span>`;
        html += '</li>';
    }
    html += '</ul>';
    deviceRegistryList.innerHTML = html;
}

async function sendTabToGroup(groupName) {
    showSendStatus('Sending...', false);
    try {
        await browser.runtime.sendMessage({ action: 'heartbeat' }); // Heartbeat on send
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (!tabs || tabs.length === 0) throw new Error('No active tab found.');
        const currentTab = tabs[0];
        if (!currentTab.url || currentTab.url.startsWith('about:') || currentTab.url.startsWith('moz-extension:')) {
            showSendStatus('Cannot send this type of tab.', true);
            return;
        }
        const response = await browser.runtime.sendMessage({
            action: 'sendTabFromPopup',
            groupName,
            tabData: { url: currentTab.url, title: currentTab.title }
        });
        if (response.success) {
            showSendStatus(`Sent to ${groupName}!`, false);
        } else {
            showSendStatus(response.message || 'Send failed.', true);
        }
    } catch (error) {
        showSendStatus('Error: ' + error.message, true);
    }
}

function showSendStatus(message, isError) {
    sendTabStatus.textContent = message;
    sendTabStatus.style.color = isError ? 'red' : 'var(--ffx-orange-dark)';
    sendTabStatus.style.display = 'block';
    setTimeout(() => { sendTabStatus.style.display = 'none'; }, 3000);
}

function showLoading(isLoading) {
    loadingIndicator.style.display = isLoading ? 'block' : 'none';
    // Do NOT disable any buttons/inputs while loading
}