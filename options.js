// options.js

import { STRINGS } from './constants.js';
import { renderDeviceName, renderDeviceList, renderGroupList } from './utils.js';
import { injectSharedUI } from './shared-ui.js';
import { applyThemeFromStorage, setupThemeDropdown } from './theme.js';

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

document.addEventListener('DOMContentLoaded', () => {
    injectSharedUI();
    applyThemeFromStorage();
    setupThemeDropdown('darkModeSelect');
    loadState();
});

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
    renderDeviceNameUI();
    renderDeviceRegistry();
    renderDefinedGroups();
}

function renderDeviceNameUI() {
    renderDeviceName(deviceNameDisplay, currentState.instanceName);
    newInstanceNameInput.value = currentState.instanceName || ''; // Pre-fill edit input
}

function renderDeviceRegistry() {
    renderDeviceList(deviceRegistryListDiv, currentState.deviceRegistry);
}

function renderDefinedGroups() {
    renderGroupList(
        definedGroupsListDiv,
        currentState.definedGroups,
        currentState.subscriptions,
        handleSubscribe,
        handleUnsubscribe,
        handleDeleteGroup,
        startRenameGroup
    );
}

function renderSubscriptionsUI() {
    // If you want to show subscriptions in options, call this with the right container
    // renderSubscriptions(subscriptionsContainer, currentState.subscriptions);
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
            renderDeviceNameUI(); // Re-render device name section
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

// --- UI Helper Functions ---

function showLoading(isLoading) {
    if (isLoading) {
        loadingIndicator.classList.remove('hidden');
        loadingIndicator.innerHTML = '<span class="spinner"></span> Loading...';
    } else {
        loadingIndicator.classList.add('hidden');
        loadingIndicator.innerHTML = '';
    }
}

function showMessage(message, isError = false) {
    messageArea.textContent = message;
    messageArea.className = isError ? 'error' : 'success';
    messageArea.classList.remove('hidden');
    if (!isError) setTimeout(clearMessage, 4000);
}

function clearMessage() {
    messageArea.textContent = '';
    messageArea.className = 'hidden';
}
