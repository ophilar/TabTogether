// options.js

import { STRINGS } from './constants.js';
import { renderDeviceName, renderGroupList, isAndroid, SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS, createGroupDirect, deleteGroupDirect, renameGroupDirect, renameDeviceDirect, deleteDeviceDirect, processIncomingTabs, getUnifiedState, subscribeToGroupUnified, unsubscribeFromGroupUnified } from './utils.js';
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

// Add a Sync Now button for Android users at the top of the options page
const syncNowBtn = document.createElement('button');
syncNowBtn.textContent = 'Sync Now';
syncNowBtn.className = 'send-group-btn';
syncNowBtn.style.marginBottom = '10px';
syncNowBtn.style.width = '100%';
syncNowBtn.addEventListener('click', async () => {
    await loadState();
});

// --- Initialization ---

document.addEventListener('DOMContentLoaded', async () => {
    injectSharedUI();
    applyThemeFromStorage();
    setupThemeDropdown('darkModeSelect');
    if (await isAndroid()) {
        // Insert Sync Now button at the top of the container
        const container = document.querySelector('.container');
        if (container && !container.querySelector('.send-group-btn')) {
            container.insertBefore(syncNowBtn, container.firstChild);
        }
        // Add Android limitation message
        const androidMsg = document.createElement('div');
        androidMsg.className = 'small-text';
        androidMsg.style.color = '#b71c1c';
        androidMsg.style.marginBottom = '10px';
        androidMsg.textContent = 'Note: On Firefox for Android, background processing is not available. Open this page and tap "Sync Now" to process new tabs or changes.';
        container.insertBefore(androidMsg, syncNowBtn.nextSibling);
        import('./utils.js').then(utils => {
            utils.showAndroidBanner(container, 'Note: On Firefox for Android, background processing is not available. Open this page and tap "Sync Now" to process new tabs or changes.');
            utils.setLastSyncTime(container, Date.now());
            utils.showDebugInfo(container, currentState);
        });
    }
    loadState();
});

// --- State Loading and Rendering ---

async function getStateDirectly() {
    const [instanceId, instanceName, subscriptions, groupBits, definedGroups, groupState, deviceRegistry] = await Promise.all([
        browser.storage.local.get(LOCAL_STORAGE_KEYS.INSTANCE_ID).then(r => r[LOCAL_STORAGE_KEYS.INSTANCE_ID]),
        browser.storage.local.get(LOCAL_STORAGE_KEYS.INSTANCE_NAME).then(r => r[LOCAL_STORAGE_KEYS.INSTANCE_NAME]),
        browser.storage.local.get(LOCAL_STORAGE_KEYS.SUBSCRIPTIONS).then(r => r[LOCAL_STORAGE_KEYS.SUBSCRIPTIONS] || []),
        browser.storage.local.get(LOCAL_STORAGE_KEYS.GROUP_BITS).then(r => r[LOCAL_STORAGE_KEYS.GROUP_BITS] || {}),
        browser.storage.sync.get(SYNC_STORAGE_KEYS.DEFINED_GROUPS).then(r => r[SYNC_STORAGE_KEYS.DEFINED_GROUPS] || []),
        browser.storage.sync.get(SYNC_STORAGE_KEYS.GROUP_STATE).then(r => r[SYNC_STORAGE_KEYS.GROUP_STATE] || {}),
        browser.storage.sync.get(SYNC_STORAGE_KEYS.DEVICE_REGISTRY).then(r => r[SYNC_STORAGE_KEYS.DEVICE_REGISTRY] || {})
    ]);
    return {
        instanceId,
        instanceName,
        subscriptions,
        groupBits,
        definedGroups,
        groupState,
        deviceRegistry
    };
}

async function loadState() {
    showLoading(true);
    clearMessage();
    try {
        const isAndroidPlatform = await isAndroid();
        let state = await getUnifiedState(isAndroidPlatform);
        if (isAndroidPlatform) {
            await processIncomingTabsAndroid(state);
            // Show last sync time and debug info
            const container = document.querySelector('.container');
            import('./utils.js').then(utils => {
                utils.setLastSyncTime(container, Date.now());
                utils.showDebugInfo(container, state);
            });
        }
        currentState = state;
        if (!currentState || currentState.error) {
            throw new Error(currentState?.error || 'Failed to load state from background script.');
        }
        renderAll();
    } catch (error) {
        showMessage(`Error loading settings: ${error.message}`, true);
        deviceNameDisplay.textContent = 'Error';
        definedGroupsListDiv.innerHTML = '<p>Error loading groups.</p>';
        deviceRegistryListDiv.innerHTML = '<p>Error loading registry.</p>';
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

async function processIncomingTabsAndroid(state) {
    await processIncomingTabs(
        state,
        async (url) => { await browser.tabs.create({ url, active: false }); },
        async (updated) => { await browser.storage.local.set({ [LOCAL_STORAGE_KEYS.PROCESSED_TASKS]: updated }); }
    );
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
    // Render device list with rename/delete buttons for each device
    const devices = currentState.deviceRegistry;
    if (!devices || Object.keys(devices).length === 0) {
        deviceRegistryListDiv.textContent = STRINGS.noDevices;
        return;
    }
    const localId = currentState.instanceId;
    const ul = document.createElement('ul');
    ul.setAttribute('role', 'list');
    Object.entries(devices).sort((a, b) => (a[1]?.name || '').localeCompare(b[1]?.name || '')).forEach(([id, device]) => {
        const li = document.createElement('li');
        li.setAttribute('role', 'listitem');
        if (id === localId) li.classList.add('this-device');
        const nameSpan = document.createElement('span');
        nameSpan.textContent = device.name || 'Unnamed Device';
        li.appendChild(nameSpan);
        if (device.lastSeen) {
            const lastSeen = new Date(device.lastSeen);
            const lastSeenSpan = document.createElement('span');
            lastSeenSpan.className = 'small-text';
            lastSeenSpan.style.marginLeft = '10px';
            lastSeenSpan.style.fontSize = '0.95em';
            lastSeenSpan.textContent = `Last seen: ${lastSeen.toLocaleString()}`;
            li.appendChild(lastSeenSpan);
        }
        // Rename button
        const renameBtn = document.createElement('button');
        renameBtn.textContent = 'Rename';
        renameBtn.className = 'inline-btn';
        renameBtn.style.marginLeft = '10px';
        renameBtn.onclick = () => startRenameDevice(id, device.name, li, nameSpan);
        li.appendChild(renameBtn);
        // Delete button (prevent deleting self)
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete';
        deleteBtn.className = 'inline-btn danger';
        deleteBtn.style.marginLeft = '7px';
        deleteBtn.disabled = (id === localId);
        deleteBtn.title = (id === localId) ? 'Cannot delete this device from itself' : 'Delete device';
        deleteBtn.onclick = () => handleDeleteDevice(id, device.name);
        li.appendChild(deleteBtn);
        ul.appendChild(li);
    });
    deviceRegistryListDiv.innerHTML = '';
    deviceRegistryListDiv.appendChild(ul);
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
        let response;
        if (await isAndroid()) {
            response = await renameGroupDirect(oldName, newName);
        } else {
            response = await browser.runtime.sendMessage({ action: 'renameGroup', oldName, newName });
        }
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

// Device rename UI
function startRenameDevice(deviceId, oldName, li, nameSpan) {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = oldName;
    input.className = 'rename-group-input';
    input.style.marginLeft = '10px';
    input.onkeydown = async (e) => {
        if (e.key === 'Enter') {
            await finishRenameDevice(deviceId, input.value, li, nameSpan);
        } else if (e.key === 'Escape') {
            nameSpan.style.display = '';
            input.remove();
        }
    };
    input.onblur = () => {
        nameSpan.style.display = '';
        input.remove();
    };
    nameSpan.style.display = 'none';
    li.insertBefore(input, nameSpan.nextSibling);
    input.focus();
    input.select();
}

async function finishRenameDevice(deviceId, newName, li, nameSpan) {
    newName = newName.trim();
    if (!newName) {
        nameSpan.style.display = '';
        li.querySelector('input.rename-group-input').remove();
        return;
    }
    if (!confirm(`Rename device to "${newName}"?`)) {
        nameSpan.style.display = '';
        li.querySelector('input.rename-group-input').remove();
        return;
    }
    showLoading(true);
    try {
        let response;
        if (await isAndroid()) {
            response = await renameDeviceDirect(deviceId, newName);
        } else {
            response = await browser.runtime.sendMessage({ action: 'renameDevice', deviceId, newName });
        }
        if (response.success) {
            showMessage(`Device renamed to "${newName}".`, false);
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

async function handleDeleteDevice(deviceId, deviceName) {
    if (!confirm(`Are you sure you want to delete device "${deviceName}"? This cannot be undone and will affect all groups.`)) {
        return;
    }
    showLoading(true);
    try {
        let response;
        if (await isAndroid()) {
            response = await deleteDeviceDirect(deviceId);
        } else {
            response = await browser.runtime.sendMessage({ action: 'deleteDevice', deviceId });
        }
        if (response.success) {
            showMessage(`Device "${deviceName}" deleted successfully.`, false);
            await loadState();
        } else {
            showMessage(response.message || 'Delete failed.', true);
        }
    } catch (e) {
        showMessage('Delete failed: ' + e.message, true);
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
    if (groupName === '') return;
    showLoading(true);
    clearMessage();
    try {
        let response;
        if (await isAndroid()) {
            response = await createGroupDirect(groupName);
        } else {
            response = await browser.runtime.sendMessage({ action: 'createGroup', groupName: groupName });
        }
        if (response.success) {
            if (!currentState.definedGroups.includes(response.newGroup)) {
                currentState.definedGroups.push(response.newGroup);
                currentState.definedGroups.sort();
            }
            renderDefinedGroups();
            showMessage(`Group "${response.newGroup}" created successfully.`, false);
            newGroupNameInput.value = '';
            createGroupBtn.disabled = true;
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
        const isAndroidPlatform = await isAndroid();
        let response = await subscribeToGroupUnified(groupName, isAndroidPlatform);
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
    showLoading(true);
    clearMessage();
    try {
        const isAndroidPlatform = await isAndroid();
        let response = await unsubscribeFromGroupUnified(groupName, isAndroidPlatform);
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
        let response;
        if (await isAndroid()) {
            response = await deleteGroupDirect(groupName);
        } else {
            response = await browser.runtime.sendMessage({ action: 'deleteGroup', groupName: groupName });
        }
        if (response.success) {
            currentState.definedGroups = currentState.definedGroups.filter(g => g !== response.deletedGroup);
            currentState.subscriptions = currentState.subscriptions.filter(g => g !== response.deletedGroup);
            renderDefinedGroups();
            showMessage(`Group "${response.deletedGroup}" deleted successfully.`, false);
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
