// options.js

const deviceNameDisplay = document.getElementById('deviceNameDisplay');
const deviceRegistryListDiv = document.getElementById('deviceRegistryList');
const editNameBtn = document.getElementById('editNameBtn');
const editNameInputDiv = document.getElementById('editNameInput');
const newInstanceNameInput = document.getElementById('newInstanceName');
const saveNameBtn = document.getElementById('saveNameBtn');
const cancelNameBtn = document.getElementById('cancelNameBtn');

const definedGroupsListDiv = document.getElementById('definedGroupsList');
const newGroupNameInput = document.getElementById('newGroupName');
const createGroupBtn = document.getElementById('createGroupBtn');

const loadingIndicator = document.getElementById('loadingIndicator');
const messageArea = document.getElementById('messageArea'); // Combined message area

let currentState = null; // Cache for state fetched from background

// --- Initialization ---

document.addEventListener('DOMContentLoaded', loadState);

// --- State Loading and Rendering ---

async function loadState() {
    showLoading(true);
    clearMessage();
    try {
        // Always call getState, do not cache or skip
        currentState = await browser.runtime.sendMessage({ action: 'getState' });
        if (!currentState || currentState.error) {
            throw new Error(currentState?.error || 'Failed to load state from background script.');
        }
        renderAll();
    } catch (error) {
        showMessage(`Error loading settings: ${error.message}`, true);
        deviceNameDisplay.textContent = 'Error';
        definedGroupsListDiv.innerHTML = '<p>Error loading groups.</p>';
        deviceRegistryListDiv.innerHTML = '<p>Error loading registry.</p>';
        // Extra error logging for debugging
        if (typeof console !== 'undefined') {
            console.error('TabTogether options.js loadState error:', error);
            if (error && error.stack) {
                console.error('Stack trace:', error.stack);
            }
        }
    } finally {
        showLoading(false);
    }
}

function renderAll() {
    if (!currentState) return;
    renderDeviceName();
    renderDeviceRegistry();
    renderDefinedGroups();
}

function renderDeviceName() {
    deviceNameDisplay.textContent = currentState.instanceName || '(Not Set)';
    newInstanceNameInput.value = currentState.instanceName || ''; // Pre-fill edit input
}

function renderDeviceRegistry() {
    const registry = currentState.deviceRegistry || {};
    if (!registry || Object.keys(registry).length === 0) {
        deviceRegistryListDiv.innerHTML = '<div class="small-text">Registry is empty.</div>';
        return;
    }
    const sortedDeviceIds = Object.keys(registry).sort((a, b) => {
        const nameA = registry[a]?.name?.toLowerCase() || '';
        const nameB = registry[b]?.name?.toLowerCase() || '';
        return nameA.localeCompare(nameB);
    });
    const ul = document.createElement('ul');
    sortedDeviceIds.forEach(deviceId => {
        const device = registry[deviceId];
        const li = document.createElement('li');
        const nameStrong = document.createElement('strong');
        nameStrong.textContent = device.name || 'Unnamed Device';
        li.appendChild(nameStrong);
        const idSpan = document.createElement('span');
        idSpan.textContent = ` (${deviceId})`;
        idSpan.className = 'small-text';
        li.appendChild(idSpan);
        const lastSeenDiv = document.createElement('div');
        lastSeenDiv.className = 'small-text';
        const lastSeenDate = device.lastSeen ? new Date(device.lastSeen) : null;
        const lastSeenString = lastSeenDate
            ? `Last seen: ${lastSeenDate.toLocaleDateString()} ${lastSeenDate.toLocaleTimeString()}`
            : 'Last seen: Unknown';
        lastSeenDiv.textContent = lastSeenString;
        li.appendChild(lastSeenDiv);
        ul.appendChild(li);
    });
    deviceRegistryListDiv.innerHTML = '';
    deviceRegistryListDiv.appendChild(ul);
}

function renderDefinedGroups() {
    if (!currentState || !currentState.definedGroups) {
        definedGroupsListDiv.innerHTML = '<p>Loading groups ...</p>';
        return;
    }

    const groups = currentState.definedGroups;
    const subscriptions = currentState.subscriptions || [];

    if (groups.length === 0) {
        definedGroupsListDiv.innerHTML = '<p>No groups defined yet. Create one below.</p>';
        return;
    }

    const ul = document.createElement('ul');
    groups.sort().forEach(groupName => {
        const li = document.createElement('li');
        const isSubscribed = subscriptions.includes(groupName);

        // Group name (editable)
        const nameSpan = document.createElement('span');
        nameSpan.textContent = groupName;
        nameSpan.className = 'group-name-label';
        nameSpan.title = 'Click to rename';
        nameSpan.style.cursor = 'pointer';
        nameSpan.onclick = () => startRenameGroup(groupName, nameSpan);
        li.appendChild(nameSpan);

        // Actions
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'group-actions';

        const subButton = document.createElement('button');
        subButton.textContent = isSubscribed ? 'Unsubscribe' : 'Subscribe';
        subButton.dataset.group = groupName;
        subButton.className = isSubscribed ? 'unsubscribe-btn' : 'subscribe-btn'; // Add classes for styling
        subButton.addEventListener('click', isSubscribed ? handleUnsubscribe : handleSubscribe);
        actionsDiv.appendChild(subButton);

        // Removed leave button

        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete';
        deleteButton.className = 'delete-btn';
        deleteButton.dataset.group = groupName;
        deleteButton.title = 'Delete group for all devices';
        deleteButton.addEventListener('click', handleDeleteGroup);
        actionsDiv.appendChild(deleteButton);

        li.appendChild(actionsDiv);
        ul.appendChild(li);
    });

    definedGroupsListDiv.innerHTML = ''; // Clear previous list
    definedGroupsListDiv.appendChild(ul);
}

// --- Group Rename ---
function startRenameGroup(oldName, nameSpan) {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = oldName;
    input.className = 'rename-group-input';
    input.style.marginRight = '8px';
    input.onkeydown = async (e) => {
        if (e.key === 'Enter') {
            await finishRenameGroup(oldName, input.value, nameSpan);
        } else if (e.key === 'Escape') {
            nameSpan.style.display = '';
            input.replaceWith(nameSpan);
        }
    };
    input.onblur = () => {
        nameSpan.style.display = '';
        input.replaceWith(nameSpan);
    };
    nameSpan.style.display = 'none';
    nameSpan.parentNode.insertBefore(input, nameSpan);
    input.focus();
    input.select();
}

async function finishRenameGroup(oldName, newName, nameSpan) {
    newName = newName.trim();
    if (!newName || newName === oldName) {
        nameSpan.style.display = '';
        nameSpan.parentNode.querySelector('input.rename-group-input').replaceWith(nameSpan);
        return;
    }
    if (!confirm(`Rename group "${oldName}" to "${newName}"?`)) {
        nameSpan.style.display = '';
        nameSpan.parentNode.querySelector('input.rename-group-input').replaceWith(nameSpan);
        return;
    }
    showLoading(true);
    try {
        const response = await browser.runtime.sendMessage({ action: 'renameGroup', oldName, newName });
        if (response.success) {
            showMessage(`Group renamed to "${newName}".`, false);
            await loadState();
        } else {
            showMessage(response.message || 'Rename failed.', true);
        }
    } catch (e) {
        showMessage('Rename failed: ' + e.message, true);
    } finally {
        showLoading(false);
    }
}

// --- UI Interaction Handlers ---

editNameBtn.addEventListener('click', () => {
    deviceNameDisplay.style.display = 'none';
    editNameBtn.style.display = 'none';
    editNameInputDiv.style.display = 'flex';
    newInstanceNameInput.focus();
    newInstanceNameInput.select();
    // Enable save button only if name changes
    saveNameBtn.disabled = true;
});

cancelNameBtn.addEventListener('click', () => {
    deviceNameDisplay.style.display = 'inline';
    editNameBtn.style.display = 'inline-block'; // Or 'inline'
    editNameInputDiv.style.display = 'none';
    newInstanceNameInput.value = currentState.instanceName || ''; // Reset input
    saveNameBtn.disabled = true; // Reset save button state
});

newInstanceNameInput.addEventListener('input', () => {
    // Enable save button only if the name is different from the current one and not empty
    const newName = newInstanceNameInput.value.trim();
    saveNameBtn.disabled = (newName === currentState.instanceName || newName === '');
});

saveNameBtn.addEventListener('click', async () => {
    const newName = newInstanceNameInput.value.trim();
    if (newName === '' || newName === currentState.instanceName) return; // Should be disabled, but double-check

    showLoading(true);
    clearMessage();
    try {
        const response = await browser.runtime.sendMessage({ action: 'setInstanceName', name: newName });
        if (response.success) {
            // --- Optimization: Update local cache and re-render ---
            currentState.instanceName = response.newName; // Update cache
            renderDeviceName(); // Re-render device name section
            showMessage("Device name saved successfully.", false);
            // --- End Optimization ---
            // Hide edit UI
            cancelNameBtn.click(); // Simulate cancel click to hide input
        } else {
            showMessage(response.message || "Failed to save name.", true);
        }
    } catch (error) {
        showMessage(`Error saving name: ${error.message}`, true);
    } finally {
        showLoading(false);
    }
});

newGroupNameInput.addEventListener('input', () => {
    createGroupBtn.disabled = (newGroupNameInput.value.trim() === '');
});

createGroupBtn.addEventListener('click', async () => {
    const groupName = newGroupNameInput.value.trim();
    if (groupName === '') return; // Should be disabled, but double-check

    showLoading(true);
    clearMessage();
    try {
        const response = await browser.runtime.sendMessage({ action: 'createGroup', groupName: groupName });
        if (response.success) {
             // --- Optimization: Update local cache and re-render ---
             if (!currentState.definedGroups.includes(response.newGroup)) {
                 currentState.definedGroups.push(response.newGroup);
                 currentState.definedGroups.sort();
             }
             renderDefinedGroups(); // Re-render group list
             showMessage(`Group "${response.newGroup}" created successfully.`, false);
             // --- End Optimization ---
             newGroupNameInput.value = ''; // Clear input
             createGroupBtn.disabled = true; // Disable button again
        } else {
            showMessage(response.message || "Failed to create group.", true);
        }
    } catch (error) {
        showMessage(`Error creating group: ${error.message}`, true);
    } finally {
        showLoading(false);
    }
});

async function handleSubscribe(event) {
    const groupName = event.target.dataset.group;
    // Removed confirmation popup
    showLoading(true);
    clearMessage();
    try {
        const response = await browser.runtime.sendMessage({ action: 'subscribeToGroup', groupName: groupName });
        if (response.success) {
            if (!currentState.subscriptions.includes(response.subscribedGroup)) {
                currentState.subscriptions.push(response.subscribedGroup);
                currentState.subscriptions.sort();
            }
            renderDefinedGroups();
            showMessage(`Subscribed to "${response.subscribedGroup}".`, false);
        } else {
            showMessage(response.message || "Failed to subscribe.", true);
        }
    } catch (error) {
        showMessage(`Error subscribing: ${error.message}`, true);
    } finally {
        showLoading(false);
    }
}

async function handleUnsubscribe(event) {
    const groupName = event.target.dataset.group;
    // Removed confirmation popup
    showLoading(true);
    clearMessage();
    try {
        const response = await browser.runtime.sendMessage({ action: 'unsubscribeFromGroup', groupName: groupName });
        if (response.success) {
            currentState.subscriptions = currentState.subscriptions.filter(g => g !== response.unsubscribedGroup);
            renderDefinedGroups();
            showMessage(`Unsubscribed from "${response.unsubscribedGroup}".`, false);
        } else {
            showMessage(response.message || "Failed to unsubscribe.", true);
        }
    } catch (error) {
        showMessage(`Error unsubscribing: ${error.message}`, true);
    } finally {
        showLoading(false);
    }
}

async function handleDeleteGroup(event) {
    const groupName = event.target.dataset.group;
    if (!confirm(`Are you sure you want to delete the group "${groupName}"? This cannot be undone and will affect all devices.`)) {
        return;
    }

    showLoading(true);
    clearMessage();
    try {
        const response = await browser.runtime.sendMessage({ action: 'deleteGroup', groupName: groupName });
        if (response.success) {
            // --- Optimization: Update local cache and re-render ---
            currentState.definedGroups = currentState.definedGroups.filter(g => g !== response.deletedGroup);
            currentState.subscriptions = currentState.subscriptions.filter(g => g !== response.deletedGroup); // Also remove from subs if present
            // Optional: Update groupBits cache
            // if (currentState.groupBits) delete currentState.groupBits[response.deletedGroup];
            renderDefinedGroups(); // Re-render group list
            showMessage(`Group "${response.deletedGroup}" deleted successfully.`, false);
            // --- End Optimization ---
        } else {
            showMessage(response.message || "Failed to delete group.", true);
        }
    } catch (error) {
        showMessage(`Error deleting group: ${error.message}`, true);
    } finally {
        showLoading(false);
    }
}

// --- Test Notification ---
document.getElementById('testNotificationBtn').addEventListener('click', async () => {
    showLoading(true);
    try {
        await browser.runtime.sendMessage({ action: 'testNotification' });
        showMessage('Test notification sent!', false);
    } catch (e) {
        showMessage('Failed to send notification: ' + e.message, true);
    } finally {
        showLoading(false);
    }
});

// --- Dark Mode Toggle ---
const darkModeSelect = document.getElementById('darkModeSelect');
darkModeSelect.addEventListener('change', (e) => {
    const value = e.target.value;
    if (value === 'enabled') {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('tt_dark_mode', 'enabled');
    } else if (value === 'disabled') {
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('tt_dark_mode', 'disabled');
    } else {
        // auto
        localStorage.setItem('tt_dark_mode', 'auto');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    }
});

window.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem('tt_dark_mode');
    if (saved === 'enabled') {
        document.documentElement.setAttribute('data-theme', 'dark');
        darkModeSelect.value = 'enabled';
    } else if (saved === 'disabled') {
        document.documentElement.setAttribute('data-theme', 'light');
        darkModeSelect.value = 'disabled';
    } else {
        // auto or not set
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
        darkModeSelect.value = 'auto';
    }
});

// --- UI Helper Functions ---

function showLoading(isLoading) {
    loadingIndicator.style.display = isLoading ? 'block' : 'none';
    loadingIndicator.innerHTML = isLoading ? '<span class="spinner"></span> Loading...' : '';
    // Do NOT disable any buttons/inputs while loading
}

function showMessage(message, isError = false) {
    messageArea.textContent = message;
    messageArea.className = isError ? 'error' : 'success';
    messageArea.style.display = 'block';
    // Optionally hide message after a delay
    if (!isError) setTimeout(clearMessage, 4000);
}

function clearMessage() {
    messageArea.textContent = '';
    messageArea.style.display = 'none';
    messageArea.className = ''; // Clear classes
}
