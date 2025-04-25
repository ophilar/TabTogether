// options.js

import { STRINGS, DEFAULT_DEVICE_ICON } from './constants.js';
import { renderDeviceName, renderGroupList, isAndroid, SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS, createGroupDirect, deleteGroupDirect, renameGroupDirect, deleteDeviceDirect, processIncomingTabs, getUnifiedState, subscribeToGroupUnified, unsubscribeFromGroupUnified, showAndroidBanner, setLastSyncTime, getFromStorage, setInStorage, debounce, showError, renameDeviceUnified } from './utils.js';
import { injectSharedUI } from './shared-ui.js';
import { applyThemeFromStorage, setupThemeDropdown } from './theme.js';

// Cache DOM elements at the top for repeated use
const dom = {
    deviceNameDisplay: document.getElementById('deviceNameDisplay'),
    deviceRegistryListDiv: document.getElementById('deviceRegistryList'),
    editNameBtn: document.getElementById('editNameBtn'),
    editNameInputDiv: document.getElementById('editNameInput'),
    newInstanceNameInput: document.getElementById('newInstanceName'),
    saveNameBtn: document.getElementById('saveNameBtn'),
    cancelNameBtn: document.getElementById('cancelNameBtn'),
    definedGroupsListDiv: document.getElementById('definedGroupsList'),
    newGroupNameInput: document.getElementById('newGroupName'),
    createGroupBtn: document.getElementById('createGroupBtn'),
    loadingIndicator: document.getElementById('loadingIndicator'),
    messageArea: document.getElementById('messageArea'),
    testNotificationBtn: document.getElementById('testNotificationBtn')
};

const deviceIconSelect = document.getElementById('deviceIconSelect');
const deviceIconPreview = document.getElementById('deviceIconPreview');

let currentState = null; // Cache for state fetched from background

// Add a Sync Now button for Android users at the top of the options page
const syncNowBtn = document.createElement('button');
syncNowBtn.textContent = 'Sync Now';
syncNowBtn.className = 'send-group-btn';
syncNowBtn.style.marginBottom = '10px';
syncNowBtn.style.width = '100%'; // Ensure unit is present
syncNowBtn.addEventListener('click', async () => {
    await loadState();
});

const manualSyncBtn = document.getElementById('manualSyncBtn');
const syncIntervalInput = document.getElementById('syncIntervalInput');
const syncStatus = document.getElementById('syncStatus');

// Manual sync handler
if (manualSyncBtn) {
    manualSyncBtn.addEventListener('click', async () => {
        showLoading(true);
        try {
            await browser.runtime.sendMessage({ action: 'heartbeat' });
            const now = new Date();
            syncStatus.textContent = 'Last sync: ' + now.toLocaleString();
            await setInStorage(browser.storage.local, 'lastSync', now.getTime());
        } finally {
            showLoading(false);
        }
    });
}
// Auto-sync interval setting
if (syncIntervalInput) {
    syncIntervalInput.addEventListener('change', async (e) => {
        let val = parseInt(e.target.value, 10);
        if (isNaN(val) || val < 1) val = 1;
        if (val > 120) val = 120;
        syncIntervalInput.value = val;
        await setInStorage(browser.storage.local, 'syncInterval', val);
        await browser.runtime.sendMessage({ action: 'setSyncInterval', minutes: val });
    });
    // Load saved value
    getFromStorage(browser.storage.local, 'syncInterval', 5).then(val => {
        syncIntervalInput.value = val;
    });
}
// Show last sync time
getFromStorage(browser.storage.local, 'lastSync', null).then(ts => {
    if (ts) syncStatus.textContent = 'Last sync: ' + new Date(ts).toLocaleString();
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
        showAndroidBanner(container, 'Note: On Firefox for Android, background processing is not available. Open this page and tap "Sync Now" to process new tabs or changes.');
        setLastSyncTime(container, Date.now());
        showDebugInfo(container, currentState);
    }
    loadState();
    if (deviceIconSelect && deviceIconPreview) {
        deviceIconSelect.addEventListener('change', async (e) => {
            const icon = e.target.value || DEFAULT_DEVICE_ICON;
            deviceIconPreview.textContent = icon;
            await setInStorage(browser.storage.local, 'myDeviceIcon', icon);
            // Optionally, sync to registry for other devices to see
            const instanceId = currentState?.instanceId;
            if (instanceId) {
                const deviceRegistry = await getFromStorage(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {});
                if (deviceRegistry[instanceId]) {
                    deviceRegistry[instanceId].icon = icon;
                    await setInStorage(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, deviceRegistry);
                }
            }
        });
        deviceIconSelect.value = DEFAULT_DEVICE_ICON;
        loadDeviceIcon();
    }
    // Notification settings logic
    const notifSoundSelect = document.getElementById('notifSoundSelect');
    const notifDurationInput = document.getElementById('notifDurationInput');

    async function loadNotificationSettings() {
        const sound = await getFromStorage(browser.storage.local, 'notifSound', 'default');
        const duration = await getFromStorage(browser.storage.local, 'notifDuration', 5);
        notifSoundSelect.value = sound;
        notifDurationInput.value = duration;
    }

    if (notifSoundSelect && notifDurationInput) {
        notifSoundSelect.addEventListener('change', async (e) => {
            await setInStorage(browser.storage.local, 'notifSound', e.target.value);
        });
        notifDurationInput.addEventListener('change', async (e) => {
            let val = parseInt(e.target.value, 10);
            if (isNaN(val) || val < 1) val = 1;
            if (val > 20) val = 20;
            notifDurationInput.value = val;
            await setInStorage(browser.storage.local, 'notifDuration', val);
        });
        loadNotificationSettings();
    }
});

// Onboarding steps content
const onboardingSteps = [
  {
    title: 'Welcome to TabTogether!',
    content: '<p>TabTogether lets you send tabs to groups of devices instantly. This onboarding will guide you through the main features.</p>'
  },
  {
    title: 'Device Settings',
    content: '<p>Set your device name and icon. This helps you identify your devices in groups and the registry.</p>'
  },
  {
    title: 'Groups',
    content: '<p>Create, rename, and delete groups. Subscribe your devices to groups to send tabs between them.</p>'
  },
  {
    title: 'Notifications & Sync',
    content: '<p>Customize notification sound and duration. Use manual or auto-sync to keep your devices up to date.</p>'
  },
  {
    title: 'Help & About',
    content: '<p>Find more help in the Help/About section or on the project page. You can always reopen this onboarding from the link at the bottom of the settings page.</p>'
  }
];

let onboardingStep = 0;
const onboardingModal = document.getElementById('onboardingModal');
const onboardingStepContent = document.getElementById('onboardingStepContent');
const onboardingPrevBtn = document.getElementById('onboardingPrevBtn');
const onboardingNextBtn = document.getElementById('onboardingNextBtn');
const onboardingCloseBtn = document.getElementById('onboardingCloseBtn');
const openOnboardingLink = document.getElementById('openOnboardingLink');

function showOnboardingStep(idx) {
  onboardingStep = idx;
  const step = onboardingSteps[onboardingStep];
  onboardingStepContent.innerHTML = `<h2 style='margin-top:0;'>${step.title}</h2>${step.content}`;
  onboardingPrevBtn.disabled = onboardingStep === 0;
  onboardingNextBtn.disabled = onboardingStep === onboardingSteps.length - 1;
}

if (openOnboardingLink) {
  openOnboardingLink.addEventListener('click', (e) => {
    e.preventDefault();
    onboardingModal.classList.remove('hidden');
    showOnboardingStep(0);
  });
}
if (onboardingPrevBtn) onboardingPrevBtn.onclick = () => showOnboardingStep(Math.max(0, onboardingStep - 1));
if (onboardingNextBtn) onboardingNextBtn.onclick = () => showOnboardingStep(Math.min(onboardingSteps.length - 1, onboardingStep + 1));
if (onboardingCloseBtn) onboardingCloseBtn.onclick = () => onboardingModal.classList.add('hidden');

// --- State Loading and Rendering ---

async function getStateDirectly() {
    const [instanceId, instanceName, subscriptions, groupBits, definedGroups, groupState, deviceRegistry] = await Promise.all([
        getFromStorage(browser.storage.local, LOCAL_STORAGE_KEYS.INSTANCE_ID),
        getFromStorage(browser.storage.local, LOCAL_STORAGE_KEYS.INSTANCE_NAME),
        getFromStorage(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS) || [],
        getFromStorage(browser.storage.local, LOCAL_STORAGE_KEYS.GROUP_BITS) || {},
        getFromStorage(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS) || [],
        getFromStorage(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE) || {},
        getFromStorage(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY) || {}
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
        showError(STRINGS.loadingSettingsError(error.message), dom.messageArea);
        dom.deviceNameDisplay.textContent = STRINGS.error;
        dom.definedGroupsListDiv.innerHTML = `<p>${STRINGS.loadingGroups}</p>`;
        dom.deviceRegistryListDiv.innerHTML = `<p>${STRINGS.loadingRegistry}</p>`;
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
        async (updated) => { await setInStorage(browser.storage.local, LOCAL_STORAGE_KEYS.PROCESSED_TASKS, updated); }
    );
}

function renderAll() {
    if (!currentState) return;
    renderDeviceNameUI();
    renderDeviceRegistry();
    renderDefinedGroups();
}

function renderDeviceNameUI() {
    renderDeviceName(dom.deviceNameDisplay, currentState.instanceName);
    dom.newInstanceNameInput.value = currentState.instanceName || ''; // Pre-fill edit input
}

function renderDeviceRegistry() {
    // Render device list with rename/delete buttons for each device
    const devices = currentState.deviceRegistry;
    if (!devices || Object.keys(devices).length === 0) {
        dom.deviceRegistryListDiv.textContent = STRINGS.noDevices;
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
    dom.deviceRegistryListDiv.innerHTML = '';
    dom.deviceRegistryListDiv.appendChild(ul);
}

function renderDefinedGroups() {
    renderGroupList(
        dom.definedGroupsListDiv,
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
    if (!confirm(STRINGS.confirmRenameGroup(oldName, newName))) {
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
            showMessage(STRINGS.groupRenameSuccess(newName), false);
            await loadState();
        } else {
            showError(response.message || STRINGS.groupRenameFailed, dom.messageArea);
        }
    } catch (e) {
        showError(STRINGS.groupRenameFailed + ': ' + e.message, dom.messageArea);
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
    if (!confirm(STRINGS.confirmRenameDevice(newName))) {
        nameSpan.style.display = '';
        li.querySelector('input.rename-group-input').remove();
        return;
    }
    showLoading(true);
    try {
        const isAndroidPlatform = await isAndroid();
        let response = await renameDeviceUnified(deviceId, newName, isAndroidPlatform);
        if (response.success) {
            showMessage(STRINGS.deviceRenameSuccess(newName), false);
            await loadState();
        } else {
            showError(response.message || STRINGS.deviceRenameFailed, dom.messageArea);
        }
    } catch (e) {
        showError(STRINGS.deviceRenameFailed + ': ' + e.message, dom.messageArea);
    } finally {
        showLoading(false);
    }
}

async function handleDeleteDevice(deviceId, deviceName) {
    if (!confirm(STRINGS.confirmDeleteDevice(deviceName))) {
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
            showMessage(STRINGS.deviceDeleteSuccess(deviceName), false);
            await loadState();
        } else {
            showError(response.message || STRINGS.deviceDeleteFailed, dom.messageArea);
        }
    } catch (e) {
        showError(STRINGS.deviceDeleteFailed + ': ' + e.message, dom.messageArea);
    } finally {
        showLoading(false);
    }
}

// --- UI Interaction Handlers ---

dom.editNameBtn.addEventListener('click', () => {
    dom.deviceNameDisplay.style.display = 'none';
    dom.editNameBtn.style.display = 'none';
    dom.editNameInputDiv.classList.remove('hidden'); // *** CHANGE: Remove 'hidden' class to show ***
    dom.editNameInputDiv.style.display = 'flex';
    // Ensure input has the current value when opened
    dom.newInstanceNameInput.value = currentState.instanceName || '';
    dom.newInstanceNameInput.focus();
    dom.newInstanceNameInput.select();
    dom.saveNameBtn.disabled = true;
});

dom.cancelNameBtn.addEventListener('click', () => {
    dom.deviceNameDisplay.style.display = 'inline';
    dom.editNameBtn.style.display = 'inline-block';
    dom.editNameInputDiv.classList.add('hidden');   // *** CHANGE: Add 'hidden' class back to hide ***
    dom.editNameInputDiv.style.display = 'none';
    // dom.newInstanceNameInput.value = currentState.instanceName || '';
    dom.saveNameBtn.disabled = true;
});

dom.newInstanceNameInput.addEventListener('input', () => {
    const newName = dom.newInstanceNameInput.value.trim();
    dom.saveNameBtn.disabled = (newName === currentState.instanceName || newName === '');
});

dom.saveNameBtn.addEventListener('click', async () => {
    const newName = dom.newInstanceNameInput.value.trim();
    if (newName === '' || newName === currentState.instanceName) return;

    showLoading(true);
    clearMessage();
    let success = false; // To track if save was successful

    try {
        const isAndroidPlatform = await isAndroid(); // Check platform
        const response = await renameDeviceUnified(currentState.instanceId, newName, isAndroidPlatform);

        // const response = await browser.runtime.sendMessage({ action: 'setInstanceName', name: newName });
        if (response.success) {
            showMessage(STRINGS.saveNameSuccess, false);
            success = true;
            // currentState.instanceName = response.newName;
            // renderDeviceNameUI();
            // showMessage(STRINGS.saveNameSuccess, false);
            // dom.cancelNameBtn.click(); // Always reset UI after save
            await loadState();

        } else {
            showError(response.message || STRINGS.saveNameFailed, dom.messageArea);
            // Reset UI even on error
            dom.cancelNameBtn.click();
        }
    } catch (error) {
        console.error("Error saving device name:", error);
        showError(STRINGS.saveNameFailed + ': ' + error.message, dom.messageArea);
        dom.cancelNameBtn.click();
    } finally {
        // Reset the UI visibility *after* potential loadState() or error display
        dom.deviceNameDisplay.style.display = 'inline';
        dom.editNameBtn.style.display = 'inline-block';
        dom.editNameInputDiv.classList.add('hidden'); // *** Use classList to hide ***
        dom.saveNameBtn.disabled = true; // Ensure save is disabled
        showLoading(false); // Hide loading indicator
    }
});

dom.newGroupNameInput.addEventListener('input', debounce(function (e) {
    const value = e.target.value.trim();
    dom.createGroupBtn.disabled = value.length === 0;
}, 250));

dom.createGroupBtn.addEventListener('click', async () => {
    const groupName = dom.newGroupNameInput.value.trim();
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
            await loadState(); // Always reload state after group creation
            showMessage(STRINGS.groupCreateSuccess(response.newGroup), false);
            dom.newGroupNameInput.value = '';
            dom.createGroupBtn.disabled = true;
        } else {
            showError(response.message || STRINGS.groupCreateFailed, dom.messageArea);
        }
    } catch (error) {
        showError(STRINGS.groupCreateFailed + ': ' + error.message, dom.messageArea);
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
            showError(response.message || "Failed to subscribe.", dom.messageArea);
        }
    } catch (error) {
        showError(`Error subscribing: ${error.message}`, dom.messageArea);
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
            showError(response.message || "Failed to unsubscribe.", dom.messageArea);
        }
    } catch (error) {
        showError(`Error unsubscribing: ${error.message}`, dom.messageArea);
    } finally {
        showLoading(false);
    }
}

async function handleDeleteGroup(event) {
    const groupName = event.target.dataset.group;
    if (!confirm(STRINGS.confirmDeleteGroup(groupName))) {
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
            showMessage(STRINGS.groupDeleteSuccess(response.deletedGroup), false);
        } else {
            showError(response.message || STRINGS.groupDeleteFailed, dom.messageArea);
        }
    } catch (error) {
        showError(STRINGS.groupDeleteFailed + ': ' + error.message, dom.messageArea);
    } finally {
        showLoading(false);
    }
}

// --- Test Notification ---
dom.testNotificationBtn.addEventListener('click', async () => {
    showLoading(true);
    try {
        await browser.runtime.sendMessage({ action: 'testNotification' });
        showMessage(STRINGS.testNotificationSent, false);
    } catch (e) {
        showError(STRINGS.testNotificationFailed(e.message), dom.messageArea);
    } finally {
        showLoading(false);
    }
});

// --- UI Helper Functions ---

function showLoading(isLoading) {
    if (isLoading) {
        dom.loadingIndicator.classList.remove('hidden');
        dom.loadingIndicator.innerHTML = '<span class="spinner"></span> Loading...';
    } else {
        dom.loadingIndicator.classList.add('hidden');
        dom.loadingIndicator.innerHTML = '';
    }
}

function showMessage(message, isError = false) {
    dom.messageArea.textContent = message;
    dom.messageArea.className = isError ? 'error' : 'success';
    dom.messageArea.classList.remove('hidden');
    if (!isError) setTimeout(clearMessage, 4000);
}

function clearMessage() {
    dom.messageArea.textContent = '';
    dom.messageArea.className = 'hidden';
}

const removeDeviceBtn = document.getElementById('removeDeviceBtn');
if (removeDeviceBtn) {
    removeDeviceBtn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to remove this device from all groups and the registry? This cannot be undone.')) return;
        showLoading(true);
        clearMessage();
        try {
            const instanceId = currentState?.instanceId;
            if (!instanceId) throw new Error('Device ID not found.');
            // Remove from registry and all groups
            const res = await browser.runtime.sendMessage({ action: 'deleteDevice', deviceId: instanceId });
            if (res.success) {
                showMessage('Device removed from all groups and registry.', false);
                await loadState();
            } else {
                showError(res.message || 'Failed to remove device.', dom.messageArea);
            }
        } catch (e) {
            showError('Error removing device: ' + e.message, dom.messageArea);
        } finally {
            showLoading(false);
        }
    });
}

async function loadDeviceIcon() {
    const icon = await getFromStorage(browser.storage.local, 'myDeviceIcon', DEFAULT_DEVICE_ICON);
    deviceIconSelect.value = icon;
    deviceIconPreview.textContent = icon;
}
