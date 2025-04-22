import { STRINGS } from './constants.js';
import { renderDeviceName, renderDeviceList, isAndroid, SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS, sendTabToGroupDirect, processIncomingTabs, getUnifiedState } from './utils.js';
import { injectSharedUI } from './shared-ui.js';
import { applyThemeFromStorage } from './theme.js';

const deviceNameSpan = document.getElementById('deviceName');
const sendTabGroupsList = document.getElementById('sendTabGroupsList');
const sendTabStatus = document.getElementById('sendTabStatus');
// const mySubscriptionsList = document.getElementById('mySubscriptionsList');
const deviceRegistryList = document.getElementById('deviceRegistryList');
const openOptionsLink = document.getElementById('openOptionsLink');
const refreshLink = document.getElementById('refreshLink');
const loadingIndicator = document.getElementById('loadingIndicator');
const errorMessageDiv = document.getElementById('errorMessage');

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
        import('./utils.js').then(utils => {
            utils.showAndroidBanner(container, 'Note: On Firefox for Android, background processing is not available. Open this popup and tap "Sync Now" to process new tabs or changes.');
            utils.setLastSyncTime(container, Date.now());
        });
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

// --- Load and Render Status ---
let syncing = false;
async function loadStatus() {
    if (await isAndroid()) {
        syncNowBtn.disabled = true;
        syncing = true;
    }
    showLoading(true);
    errorMessageDiv.classList.add('hidden');
    try {
        const isAndroidPlatform = await isAndroid();
        let state = await getUnifiedState(isAndroidPlatform);
        if (isAndroidPlatform) {
            await processIncomingTabsAndroid(state);
            // Show last sync time
            const container = document.querySelector('.container');
            import('./utils.js').then(utils => utils.setLastSyncTime(container, Date.now()));
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
            errorMessageDiv.textContent = "This extension may have limited functionality on Firefox for Android. Try reopening the popup or restarting the browser if you see this error.";
        } else {
            errorMessageDiv.textContent = `Error: ${error.message}`;
        }
        errorMessageDiv.classList.remove('hidden');
        deviceNameSpan.textContent = STRINGS.error;
        sendTabGroupsList.textContent = error.message;
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
        async (url) => { await browser.tabs.create({ url, active: false }); },
        async (updated) => { await browser.storage.local.set({ [LOCAL_STORAGE_KEYS.PROCESSED_TASKS]: updated }); }
    );
}

function renderDeviceNameUI(name) {
    renderDeviceName(deviceNameSpan, name);
}

function renderSubscriptionsUI(subscriptions) {
    const ul = document.getElementById('subscriptionsUl');
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
    sendTabGroupsList.innerHTML = '';
    if (!groups || groups.length === 0) {
        const div = document.createElement('div');
        div.className = 'small-text';
        div.textContent = STRINGS.noGroups;
        sendTabGroupsList.appendChild(div);
        return;
    }
    groups.sort().forEach(groupName => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'send-group-row';
        const label = document.createElement('span');
        label.textContent = groupName;
        label.className = 'send-group-label';
        const btn = document.createElement('button');
        btn.textContent = 'Send Tab to Group';
        btn.className = 'send-group-btn';
        btn.title = `Send current tab to group '${groupName}'`;
        btn.setAttribute('aria-label', `Send current tab to group ${groupName}`);
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
        sendTabGroupsList.appendChild(groupDiv);
    });
}

function renderRegistry(deviceRegistry) {
    renderDeviceList(deviceRegistryList, deviceRegistry, localInstanceId);
}

async function sendTabToGroup(groupName) {
    showSendStatus('Sending...', false);
    try {
        let response;
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (!tabs || tabs.length === 0) throw new Error('No active tab found.');
        const currentTab = tabs[0];
        if (!currentTab.url || currentTab.url.startsWith('about:') || currentTab.url.startsWith('moz-extension:')) {
            showSendStatus('Cannot send this type of tab.', true);
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
            showSendStatus(response.message || 'Send failed.', true);
        }
    } catch (error) {
        showSendStatus('Error: ' + error.message, true);
    }
}

function showSendStatus(message, isError) {
    sendTabStatus.textContent = message;
    sendTabStatus.classList.remove('hidden');
    sendTabStatus.classList.toggle('error-message', isError);
    sendTabStatus.classList.toggle('success-message', !isError);
    setTimeout(() => { sendTabStatus.classList.add('hidden'); }, 3000);
}

function showLoading(isLoading) {
    if (isLoading) {
        loadingIndicator.classList.remove('hidden');
    } else {
        loadingIndicator.classList.add('hidden');
    }
}