import { STRINGS } from './constants.js';
import { renderDeviceName, renderDeviceList } from './utils.js';
import { injectSharedUI } from './shared-ui.js';
import { applyThemeFromStorage } from './theme.js';

const deviceNameSpan = document.getElementById('deviceName');
const sendTabGroupsList = document.getElementById('sendTabGroupsList');
const sendTabStatus = document.getElementById('sendTabStatus');
const mySubscriptionsList = document.getElementById('mySubscriptionsList');
const deviceRegistryList = document.getElementById('deviceRegistryList');
const openOptionsLink = document.getElementById('openOptionsLink');
const refreshLink = document.getElementById('refreshLink');
const loadingIndicator = document.getElementById('loadingIndicator');
const errorMessageDiv = document.getElementById('errorMessage');

let localInstanceId = null;

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    injectSharedUI();
    applyThemeFromStorage();
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
async function loadStatus() {
    showLoading(true);
    errorMessageDiv.classList.add('hidden');
    try {
        await browser.runtime.sendMessage({ action: 'heartbeat' });
        const state = await browser.runtime.sendMessage({ action: 'getState' });
        if (state && state.error) throw new Error(state.error);
        if (!state) throw new Error(STRINGS.error);
        localInstanceId = state.instanceId;
        renderDeviceNameUI(state.instanceName);
        renderSubscriptionsUI(state.subscriptions);
        renderSendTabGroups(state.definedGroups);
        showLoading(false);
    } catch (error) {
        errorMessageDiv.textContent = `Error: ${error.message}`;
        errorMessageDiv.classList.remove('hidden');
        deviceNameSpan.textContent = STRINGS.error;
        sendTabGroupsList.textContent = error.message;
        showLoading(false);
    }
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
        await browser.runtime.sendMessage({ action: 'heartbeat' });
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