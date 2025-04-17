// options.js

const deviceNameDisplay = document.getElementById('deviceNameDisplay');
// const deviceIdDisplay = document.getElementById('deviceIdDisplay');
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
        // Retry mechanism in case background script isn't ready immediately
        let retries = 3;
        while (retries > 0) {
            try {
                currentState = await browser.runtime.sendMessage({ action: 'getState' });
                if (currentState && !currentState.error) {
                    break; // Success
                } else if (currentState && currentState.error) {
                     throw new Error(currentState.error);
                }
            } catch (error) {
                console.warn(`Attempt to get state failed: ${error.message}. Retrying...`);
                retries--;
                if (retries === 0) throw error; // Rethrow after last retry
                await new Promise(resolve => setTimeout(resolve, 500)); // Wait before retry
            }
        }

        if (!currentState) {
            throw new Error("Failed to load state from background script after retries.");
        }

        console.log("State loaded:", currentState);
        renderAll(); // Render UI based on the loaded state

    } catch (error) {
        console.error("Error loading state:", error);
        showMessage(`Error loading settings: ${error.message}`, true);
        // Clear potentially stale UI elements
        deviceNameDisplay.textContent = 'Error';
        // deviceIdDisplay.textContent = 'Error';
        definedGroupsListDiv.innerHTML = '<p>Error loading groups.</p>';
    } finally {
        showLoading(false);
    }
}

function renderAll() {
    if (!currentState) return;
    renderDeviceName();
    renderDefinedGroups();
}

function renderDeviceName() {
    deviceNameDisplay.textContent = currentState.instanceName || '(Not Set)';
    // deviceIdDisplay.textContent = currentState.instanceId || 'N/A';
    newInstanceNameInput.value = currentState.instanceName || ''; // Pre-fill edit input
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

        const nameSpan = document.createElement('span');
        nameSpan.textContent = groupName;
        li.appendChild(nameSpan);

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'group-actions';

        const subButton = document.createElement('button');
        subButton.textContent = isSubscribed ? 'Unsubscribe' : 'Subscribe';
        subButton.dataset.group = groupName;
        subButton.className = isSubscribed ? 'unsubscribe-btn' : 'subscribe-btn'; // Add classes for styling
        subButton.addEventListener('click', isSubscribed ? handleUnsubscribe : handleSubscribe);
        actionsDiv.appendChild(subButton);

        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete';
        deleteButton.className = 'delete-btn';
        deleteButton.dataset.group = groupName;
        deleteButton.addEventListener('click', handleDeleteGroup);
        actionsDiv.appendChild(deleteButton);

        li.appendChild(actionsDiv);
        ul.appendChild(li);
    });

    definedGroupsListDiv.innerHTML = ''; // Clear previous list
    definedGroupsListDiv.appendChild(ul);
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
    showLoading(true);
    clearMessage();
    try {
        const response = await browser.runtime.sendMessage({ action: 'subscribeToGroup', groupName: groupName });
        if (response.success) {
            // --- Optimization: Update local cache and re-render ---
            if (!currentState.subscriptions.includes(response.subscribedGroup)) {
                currentState.subscriptions.push(response.subscribedGroup);
                currentState.subscriptions.sort();
            }
            // Optional: Update groupBits cache if needed elsewhere in UI
            // if (!currentState.groupBits) currentState.groupBits = {};
            // currentState.groupBits[response.subscribedGroup] = response.assignedBit;
            renderDefinedGroups(); // Re-render group list
            showMessage(`Subscribed to "${response.subscribedGroup}".`, false);
            // --- End Optimization ---
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
    showLoading(true);
    clearMessage();
    try {
        const response = await browser.runtime.sendMessage({ action: 'unsubscribeFromGroup', groupName: groupName });
        if (response.success) {
             // --- Optimization: Update local cache and re-render ---
             currentState.subscriptions = currentState.subscriptions.filter(g => g !== response.unsubscribedGroup);
             // Optional: Update groupBits cache
             // if (currentState.groupBits) delete currentState.groupBits[response.unsubscribedGroup];
             renderDefinedGroups(); // Re-render group list
             showMessage(`Unsubscribed from "${response.unsubscribedGroup}".`, false);
             // --- End Optimization ---
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
    if (!confirm(`Are you sure you want to delete the group "${groupName}"? This cannot be undone.`)) {
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


// --- UI Helper Functions ---

function showLoading(isLoading) {
    loadingIndicator.style.display = isLoading ? 'block' : 'none';
}

function showMessage(message, isError = false) {
    messageArea.textContent = message;
    messageArea.className = isError ? 'error' : 'success'; // Use classes for styling
    messageArea.style.display = 'block';
    // Optionally hide message after a delay
    // setTimeout(clearMessage, 5000);
}

function clearMessage() {
    messageArea.textContent = '';
    messageArea.style.display = 'none';
    messageArea.className = ''; // Clear classes
}
