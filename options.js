// options.js

document.addEventListener('DOMContentLoaded', loadState);

// --- Elements ---
const deviceNameEl = document.getElementById('deviceName');
const editNameBtn = document.getElementById('editNameBtn');
const editNameInputDiv = document.getElementById('editNameInput');
const newInstanceNameInput = document.getElementById('newInstanceName');
const saveNameBtn = document.getElementById('saveNameBtn');
const cancelNameBtn = document.getElementById('cancelNameBtn');

const definedGroupsListEl = document.getElementById('definedGroupsList');
const newGroupNameInput = document.getElementById('newGroupName');
const createGroupBtn = document.getElementById('createGroupBtn');

const loadingIndicator = document.getElementById('loadingIndicator');
const errorMessage = document.getElementById('errorMessage');

// --- State ---
let currentState = {}; // Holds state received from background

// --- Load Initial State ---
async function loadState() {
    showLoading(true);
    errorMessage.style.display = 'none';
    try {
        // Fetch all necessary state from the background script
        currentState = await browser.runtime.sendMessage({ action: 'getState' });
        console.log("Options page received state:", currentState);
        if (!currentState || !currentState.instanceName) {
             // Might happen if background script hasn't fully initialized? Add retry?
             console.warn("State received from background might be incomplete. Retrying in 1s...");
             await new Promise(resolve => setTimeout(resolve, 1000));
             currentState = await browser.runtime.sendMessage({ action: 'getState' });
             console.log("Options page received state (retry):", currentState);
        }
        render(); // Render the UI with the fetched state
    } catch (error) {
        showError(`Error loading settings: ${error.message || error}. Try reloading the page.`);
        console.error("Error loading settings:", error);
    } finally {
        showLoading(false);
    }
}

// --- Rendering ---
function render() {
    if (!currentState) {
        showError("Failed to load current state from the extension.");
        return;
    }
    // Device Info
    deviceNameEl.textContent = currentState.instanceName || '(Not Set)';
    newInstanceNameInput.value = currentState.instanceName || '';

    // Defined Groups & Subscription Buttons
    renderDefinedGroups();
}

function renderDefinedGroups() {
    const groups = currentState.definedGroups || [];
    const subscriptions = currentState.subscriptions || []; // Get current device's subscriptions

    if (groups.length === 0) {
        definedGroupsListEl.innerHTML = '<p><small>No groups defined yet. Create one below.</small></p>';
        return;
    }

    const ul = document.createElement('ul');
    groups.sort().forEach(groupName => {
        const li = document.createElement('li');
        const nameSpan = document.createElement('span');
        nameSpan.textContent = groupName;
        li.appendChild(nameSpan);

        const actions = document.createElement('div');
        actions.className = 'group-actions';

        // Add Subscribe/Unsubscribe button based on current state
        if (subscriptions.includes(groupName)) {
            const unsubBtn = document.createElement('button');
            unsubBtn.textContent = 'Unsubscribe';
            unsubBtn.className = 'unsubscribe-btn';
            unsubBtn.dataset.group = groupName;
            unsubBtn.onclick = handleUnsubscribe; // Attach event handler
            actions.appendChild(unsubBtn);
        } else {
            const subBtn = document.createElement('button');
            subBtn.textContent = 'Subscribe';
            subBtn.className = 'subscribe-btn';
            subBtn.dataset.group = groupName;
            subBtn.onclick = handleSubscribe; // Attach event handler
            actions.appendChild(subBtn);
        }

        // Add Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete Group';
        deleteBtn.className = 'delete-btn';
        deleteBtn.dataset.group = groupName;
        deleteBtn.onclick = handleDeleteGroup; // Attach event handler
        actions.appendChild(deleteBtn);

        li.appendChild(actions);
        ul.appendChild(li);
    });

    definedGroupsListEl.innerHTML = ''; // Clear previous list
    definedGroupsListEl.appendChild(ul);
}

// --- Event Handlers ---
editNameBtn.onclick = () => {
    editNameInputDiv.style.display = 'flex'; // Use flex for inline layout
    editNameBtn.style.display = 'none';
    newInstanceNameInput.focus();
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
            currentState.instanceName = newName; // Update local state cache
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
            await loadState(); // Reload state to show the new group
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
    if (!confirm(`Are you sure you want to delete the group "${groupName}"? This will remove it for all devices and requires complex cleanup.`)) return;
     showLoading(true);
    try {
        await browser.runtime.sendMessage({ action: 'deleteGroup', groupName: groupName });
        await loadState(); // Reload state to reflect deletion
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
            await loadState(); // Reload state to show updated subscription
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
            await loadState(); // Reload state to show updated subscription
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
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    // Auto-hide error after a few seconds
    setTimeout(() => { errorMessage.style.display = 'none'; }, 7000);
}