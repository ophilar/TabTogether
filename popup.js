// popup.js

document.addEventListener('DOMContentLoaded', loadState);

// --- Elements ---
const deviceNameEl = document.getElementById('deviceName');
const deviceIdEl = document.getElementById('deviceId');
const editNameBtn = document.getElementById('editNameBtn');
const editNameInputDiv = document.getElementById('editNameInput');
const newInstanceNameInput = document.getElementById('newInstanceName');
const saveNameBtn = document.getElementById('saveNameBtn');
const cancelNameBtn = document.getElementById('cancelNameBtn');

const definedGroupsListEl = document.getElementById('definedGroupsList');
const newGroupNameInput = document.getElementById('newGroupName');
const createGroupBtn = document.getElementById('createGroupBtn');

const mySubscriptionsListEl = document.getElementById('mySubscriptionsList');
const deviceRegistryListEl = document.getElementById('deviceRegistryList');

const loadingIndicator = document.getElementById('loadingIndicator');
const errorMessage = document.getElementById('errorMessage');

// --- State ---
let currentState = {};

// --- Load Initial State ---
async function loadState() {
    showLoading(true);
    try {
        currentState = await browser.runtime.sendMessage({ action: 'getState' });
        console.log("Received state:", currentState);
        render();
    } catch (error) {
        showError(`Error loading state: ${error.message}`);
        console.error("Error loading state:", error);
    } finally {
        showLoading(false);
    }
}

// --- Rendering ---
function render() {
    // Device Info
    deviceNameEl.textContent = currentState.instanceName || 'N/A';
    deviceIdEl.textContent = currentState.instanceId || 'N/A';
    newInstanceNameInput.value = currentState.instanceName || '';

    // Defined Groups & Subscriptions
    renderDefinedGroups();
    renderMySubscriptions();
    renderDeviceRegistry();
}

function renderDefinedGroups() {
    const groups = currentState.definedGroups || [];
    const subscriptions = currentState.subscriptions || [];
    if (groups.length === 0) {
        definedGroupsListEl.innerHTML = '<p><small>No groups defined yet.</small></p>';
        return;
    }
    const ul = document.createElement('ul');
    groups.sort().forEach(groupName => {
        const li = document.createElement('li');
        li.textContent = groupName;

        const actions = document.createElement('div');
        actions.className = 'group-actions';

        if (subscriptions.includes(groupName)) {
            const unsubBtn = document.createElement('button');
            unsubBtn.textContent = 'Unsubscribe';
            unsubBtn.className = 'unsubscribe-btn';
            unsubBtn.dataset.group = groupName;
            unsubBtn.onclick = handleUnsubscribe;
            actions.appendChild(unsubBtn);
        } else {
            const subBtn = document.createElement('button');
            subBtn.textContent = 'Subscribe';
            subBtn.className = 'subscribe-btn';
            subBtn.dataset.group = groupName;
            subBtn.onclick = handleSubscribe;
            actions.appendChild(subBtn);
        }

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete';
        deleteBtn.className = 'delete-btn';
        deleteBtn.dataset.group = groupName;
        deleteBtn.onclick = handleDeleteGroup;
        actions.appendChild(deleteBtn);

        li.appendChild(actions);
        ul.appendChild(li);
    });
    definedGroupsListEl.innerHTML = '';
    definedGroupsListEl.appendChild(ul);
}

function renderMySubscriptions() {
    const subscriptions = currentState.subscriptions || [];
    if (subscriptions.length === 0) {
        mySubscriptionsListEl.innerHTML = '<p><small>Not subscribed to any groups.</small></p>';
        return;
    }
    const ul = document.createElement('ul');
    subscriptions.sort().forEach(groupName => {
        const li = document.createElement('li');
        li.textContent = groupName;
        // Optionally show assigned bit
        const bit = currentState.groupBits?.[groupName];
        if (bit !== undefined) {
            const bitSpan = document.createElement('small');
            bitSpan.textContent = ` (Bit: ${bit})`;
            li.appendChild(bitSpan);
        }
        ul.appendChild(li);
    });
    mySubscriptionsListEl.innerHTML = '';
    mySubscriptionsListEl.appendChild(ul);
}

function renderDeviceRegistry() {
    const registry = currentState.deviceRegistry || {};
    const deviceIds = Object.keys(registry);
     if (deviceIds.length === 0) {
        deviceRegistryListEl.innerHTML = '<p><small>No devices registered in sync yet.</small></p>';
        return;
    }
    const ul = document.createElement('ul');
    deviceIds.forEach(id => {
        const device = registry[id];
        const li = document.createElement('li');
        const isSelf = id === currentState.instanceId;
        li.innerHTML = `
            <span>
                ${device.name || 'Unknown Name'} ${isSelf ? '<strong>(This Device)</strong>' : ''}
                <br><small>ID: ${id.substring(0, 8)}... | Last Seen: ${new Date(device.lastSeen).toLocaleString()}</small>
            </span>
        `;
        // Optionally display group bits: JSON.stringify(device.groupBits)
        ul.appendChild(li);
    });
     deviceRegistryListEl.innerHTML = '';
     deviceRegistryListEl.appendChild(ul);
}


// --- Event Handlers ---
editNameBtn.onclick = () => {
    editNameInputDiv.style.display = 'block';
    editNameBtn.style.display = 'none';
};
cancelNameBtn.onclick = () => {
    editNameInputDiv.style.display = 'none';
    editNameBtn.style.display = 'inline-block';
    newInstanceNameInput.value = currentState.instanceName || ''; // Reset
};
saveNameBtn.onclick = async () => {
    const newName = newInstanceNameInput.value.trim();
    if (newName && newName !== currentState.instanceName) {
        showLoading(true);
        try {
            await browser.runtime.sendMessage({ action: 'setInstanceName', name: newName });
            currentState.instanceName = newName; // Update local state immediately
            render(); // Re-render relevant parts
            editNameInputDiv.style.display = 'none';
            editNameBtn.style.display = 'inline-block';
        } catch (error) {
            showError(`Error saving name: ${error.message}`);
        } finally {
            showLoading(false);
        }
    } else {
         editNameInputDiv.style.display = 'none';
         editNameBtn.style.display = 'inline-block';
    }
};

createGroupBtn.onclick = async () => {
    const groupName = newGroupNameInput.value.trim();
    if (!groupName) return;
    showLoading(true);
    try {
        const response = await browser.runtime.sendMessage({ action: 'createGroup', groupName: groupName });
        if (response.success) {
            newGroupNameInput.value = '';
            await loadState(); // Reload everything
        } else {
            showError(response.message || "Failed to create group.");
        }
    } catch (error) {
        showError(`Error creating group: ${error.message}`);
    } finally {
        showLoading(false);
    }
};

async function handleDeleteGroup(event) {
    const groupName = event.target.dataset.group;
    if (!confirm(`Are you sure you want to delete the group "${groupName}"? This may require complex cleanup.`)) return;
     showLoading(true);
    try {
        await browser.runtime.sendMessage({ action: 'deleteGroup', groupName: groupName });
        await loadState(); // Reload everything
    } catch (error) {
        showError(`Error deleting group: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

async function handleSubscribe(event) {
    const groupName = event.target.dataset.group;
     showLoading(true);
    try {
        const response = await browser.runtime.sendMessage({ action: 'subscribeToGroup', groupName: groupName });
         if (response.success) {
            await loadState(); // Reload everything
        } else {
            showError(response.message || "Failed to subscribe.");
        }
    } catch (error) {
        showError(`Error subscribing: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

async function handleUnsubscribe(event) {
    const groupName = event.target.dataset.group;
     showLoading(true);
    try {
        const response = await browser.runtime.sendMessage({ action: 'unsubscribeFromGroup', groupName: groupName });
         if (response.success) {
            await loadState(); // Reload everything
        } else {
            showError(response.message || "Failed to unsubscribe.");
        }
    } catch (error) {
        showError(`Error unsubscribing: ${error.message}`);
    } finally {
        showLoading(false);
    }
}


// --- UI Helpers ---
function showLoading(isLoading) {
    loadingIndicator.style.display = isLoading ? 'block' : 'none';
    // Disable buttons while loading?
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    // Auto-hide error after a few seconds
    setTimeout(() => { errorMessage.style.display = 'none'; }, 5000);
}