import { STRINGS } from './constants.js';
import { renderSubscriptions } from './utils.js';
import { renderDeviceName, renderDeviceList, isAndroid, SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS, sendTabToGroupDirect, processIncomingTabs, getUnifiedState, showAndroidBanner, setLastSyncTime, getFromStorage, setInStorage, showError, storage } from './utils.js';
import { injectSharedUI } from './shared-ui.js';
import { applyThemeFromStorage } from './theme.js';

// Cache DOM elements at the top for repeated use
const dom = {
    deviceNameSpan: document.getElementById('deviceName'),
    sendTabGroupsList: document.getElementById('sendTabGroupsList'),
    sendTabStatus: document.getElementById('sendTabStatus'),
    deviceRegistryList: document.getElementById('deviceRegistryList'),
    openOptionsLink: document.getElementById('openOptionsLink'),
    refreshLink: document.getElementById('refreshLink'),
    loadingIndicator: document.getElementById('loadingIndicator'),
    errorMessageDiv: document.getElementById('errorMessage'),
    subscriptionsUl: document.getElementById('subscriptionsUl')
};

let localInstanceId = null;

// Add a Sync Now button for Android users at the top of the popup
const syncNowBtn = document.createElement('button');
syncNowBtn.textContent = 'Sync Now';
syncNowBtn.className = 'send-group-btn';
syncNowBtn.style.marginBottom = '10px';
syncNowBtn.style.width = '100%';
syncNowBtn.setAttribute('aria-label', 'Sync extension data now');
syncNowBtn.tabIndex = 0;
syncNowBtn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        syncNowBtn.click();
    }
});
syncNowBtn.addEventListener('click', async () => {
    await loadStatus();
});

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    injectSharedUI();
    applyThemeFromStorage();
    if (await isAndroid()) {
        // Insert Sync Now button at the top of the container
        const container = document.querySelector('.container');
        if (container && !container.querySelector('.send-group-btn')) {
            container.insertBefore(syncNowBtn, container.firstChild);
        }
        // Show Android banner and last sync time
        showAndroidBanner(container, 'Note: On Firefox for Android, background processing is not available. Open this popup and tap "Sync Now" to process new tabs or changes.');
        setLastSyncTime(container, Date.now());
    }
    loadStatus();
});
dom.openOptionsLink.addEventListener('click', (e) => {
    e.preventDefault();
    browser.runtime.openOptionsPage();
});
dom.refreshLink.addEventListener('click', (e) => {
    e.preventDefault();
    loadStatus();
});

// Minimalist details toggle logic
const toggleDetailsBtn = document.getElementById('toggleDetailsBtn');
const popupDetails = document.getElementById('popupDetails');
if (toggleDetailsBtn && popupDetails) {
  toggleDetailsBtn.addEventListener('click', () => {
    popupDetails.classList.toggle('hidden');
    toggleDetailsBtn.setAttribute('aria-label', popupDetails.classList.contains('hidden') ? 'Show details' : 'Hide details');
    toggleDetailsBtn.setAttribute('title', popupDetails.classList.contains('hidden') ? 'Show device info' : 'Hide device info');
  });
}

// --- Load and Render Status ---
let syncing = false;
async function loadStatus() {
    if (await isAndroid()) {
        syncNowBtn.disabled = true;
        syncing = true;
    }
    showLoading(true);
    dom.errorMessageDiv.classList.add('hidden');
    try {
        const isAndroidPlatform = await isAndroid();
        let state = await getUnifiedState(isAndroidPlatform);
        if (isAndroidPlatform) {
            await processIncomingTabsAndroid(state);
            const container = document.querySelector('.container');
            setLastSyncTime(container, Date.now());
            if (typeof browser.notifications !== 'undefined') {
                await browser.notifications.create({
                    type: 'basic',
                    iconUrl: browser.runtime.getURL('icons/icon-48.png'),
                    title: 'TabTogether',
                    message: 'Sync complete.'
                });
            }
        }
        if (state && state.error) throw new Error(state.error);
        if (!state) throw new Error(STRINGS.error);
        localInstanceId = state.instanceId;
        renderDeviceNameUI(state.instanceName);
        renderSubscriptionsUI(state.subscriptions);
        renderSendTabGroups(state.definedGroups);
        showLoading(false);
    } catch (error) {
        if (await isAndroid()) {
            showError("This extension may have limited functionality on Firefox for Android. Try reopening the popup or restarting the browser if you see this error.", null);
        } else {
            showError(STRINGS.loadingSettingsError(error.message), dom.errorMessageDiv);
        }
        dom.deviceNameSpan.textContent = STRINGS.error;
        dom.sendTabGroupsList.textContent = error.message;
        showLoading(false);
    } finally {
        if (await isAndroid()) {
            syncNowBtn.disabled = false;
            syncing = false;
        }
    }
}

async function processIncomingTabsAndroid(state) {
    await processIncomingTabs(
        state,
        async (url, title) => { await browser.tabs.create({ url, title, active: false }); },
        async (updated) => { await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.PROCESSED_TASKS, updated); }
    );
} 

function renderDeviceNameUI(name) {
    renderDeviceName(dom.deviceNameSpan, name);
}

function renderSubscriptionsUI(subscriptions) {
    const ul = dom.subscriptionsUl;
    ul.innerHTML = '';
    if (!subscriptions || subscriptions.length === 0) {
        const li = document.createElement('li');
        li.textContent = STRINGS.notSubscribed;
        ul.appendChild(li);
        return;
    }
    subscriptions.forEach(group => {
        const li = document.createElement('li');
        li.textContent = group;
        ul.appendChild(li);
    });
}

function renderSendTabGroups(groups) {
    dom.sendTabGroupsList.innerHTML = '';
    if (!groups || groups.length === 0) {
        const div = document.createElement('div');
        div.className = 'small-text';
        div.textContent = STRINGS.noGroups;
        dom.sendTabGroupsList.appendChild(div);
        return;
    }
    groups.sort().forEach(groupName => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'send-group-row';
        const label = document.createElement('span');
        label.textContent = groupName;
        label.className = 'send-group-label';
        const btn = document.createElement('button');
        btn.textContent = STRINGS.sendTabToGroupBtn;
        btn.className = 'send-group-btn';
        btn.title = STRINGS.sendTabToGroup(groupName);
        btn.setAttribute('aria-label', STRINGS.sendTabToGroupAria(groupName));
        btn.tabIndex = 0;
        btn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                btn.click();
            }
        });
        btn.addEventListener('click', () => sendTabToGroup(groupName));
        groupDiv.appendChild(label);
        groupDiv.appendChild(btn);
        dom.sendTabGroupsList.appendChild(groupDiv);
    });
}

function renderRegistry(deviceRegistry) {
    renderDeviceList(dom.deviceRegistryList, deviceRegistry, localInstanceId);
}

async function sendTabToGroup(groupName) {
    showSendStatus('Sending...', false);
    try {
        let response;
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (!tabs || tabs.length === 0) throw new Error('No active tab found.');
        const currentTab = tabs[0];
        if (!currentTab.url || currentTab.url.startsWith('about:') || currentTab.url.startsWith('moz-extension:')) {
            showSendStatus(STRINGS.sendTabCannot, true);
            return;
        }
        if (await isAndroid()) {
            response = await sendTabToGroupDirect(groupName, { url: currentTab.url, title: currentTab.title });
        } else {
            response = await browser.runtime.sendMessage({
                action: 'sendTabFromPopup',
                groupName,
                tabData: { url: currentTab.url, title: currentTab.title }
            });
        }
        if (response.success) {
            showSendStatus(`Sent to ${groupName}!`, false);
        } else {
            showSendStatus(response.message || STRINGS.sendTabFailed, true);
        }
    } catch (error) {
        showSendStatus(STRINGS.sendTabError(error.message), true);
    }
}

function showSendStatus(message, isError) {
    dom.sendTabStatus.textContent = message;
    dom.sendTabStatus.classList.remove('hidden');
    dom.sendTabStatus.classList.toggle('error-message', isError);
    dom.sendTabStatus.classList.toggle('success-message', !isError);
    setTimeout(() => { dom.sendTabStatus.classList.add('hidden'); }, 3000);
}

function showLoading(isLoading) {
    if (isLoading) {
        dom.loadingIndicator.classList.remove('hidden');
    } else {
        dom.loadingIndicator.classList.add('hidden');
    }
}