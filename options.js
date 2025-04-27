// options.js

import { STRINGS, DEFAULT_DEVICE_ICON } from "./constants.js";
import {
  renderDeviceName,
  renderGroupList,
  isAndroid,
  SYNC_STORAGE_KEYS,
  LOCAL_STORAGE_KEYS,
  createGroupDirect,
  deleteGroupDirect,
  renameGroupDirect,
  deleteDeviceDirect,
  processIncomingTabs,
  getUnifiedState,
  subscribeToGroupUnified,
  unsubscribeFromGroupUnified,
  showAndroidBanner,
  setLastSyncTime,
  debounce,
  showError,
  renameDeviceUnified,
  storage,
} from "./utils.js";
import { injectSharedUI } from "./shared-ui.js";
import { applyThemeFromStorage, setupThemeDropdown } from "./theme.js";

// Cache DOM elements at the top for repeated use
const dom = {
  deviceNameDisplay: document.getElementById("deviceNameDisplay"),
  deviceRegistryListDiv: document.getElementById("deviceRegistryList"),
  definedGroupsListDiv: document.getElementById("definedGroupsList"),
  newGroupNameInput: document.getElementById("newGroupName"),
  createGroupBtn: document.getElementById("createGroupBtn"),
  loadingIndicator: document.getElementById("loadingIndicator"),
  messageArea: document.getElementById("messageArea"),
  testNotificationBtn: document.getElementById("testNotificationBtn"),
};

const deviceIconSelect = document.getElementById("deviceIconSelect");
const deviceIconPreview = document.getElementById("deviceIconPreview");

let currentState = null; // Cache for state fetched from background

// Add a Sync Now button for Android users at the top of the options page
const syncNowBtn = document.createElement("button");
syncNowBtn.textContent = "Sync Now";
syncNowBtn.className = "send-group-btn";
syncNowBtn.style.marginBottom = "10px";
syncNowBtn.style.width = "100%"; // Ensure unit is present
syncNowBtn.addEventListener("click", async () => {
  await loadState();
});

const manualSyncBtn = document.getElementById("manualSyncBtn");
const syncIntervalInput = document.getElementById("syncIntervalInput");
const syncStatus = document.getElementById("syncStatus");

// Manual sync handler
if (manualSyncBtn) {
  manualSyncBtn.addEventListener("click", async () => {
    showLoading(true);
    try {
      await browser.runtime.sendMessage({ action: "heartbeat" });
      const now = new Date();
      syncStatus.textContent = "Last sync: " + now.toLocaleString();
      await storage.set(browser.storage.local, "lastSync", now.getTime());
    } finally {
      showLoading(false);
    }
  });
}
// Auto-sync interval setting
if (syncIntervalInput) {
  syncIntervalInput.addEventListener("change", async (e) => {
    let val = parseInt(e.target.value, 10);
    if (isNaN(val) || val < 1) val = 1;
    if (val > 120) val = 120;
    syncIntervalInput.value = val;
    await storage.set(browser.storage.local, "syncInterval", val);
    await browser.runtime.sendMessage({
      action: "setSyncInterval",
      minutes: val,
    });
  });
  // Load saved value
  storage.get(browser.storage.local, "syncInterval", 5).then((val) => {
    syncIntervalInput.value = val;
  });
}
// Show last sync time
storage.get(browser.storage.local, "lastSync", null).then((ts) => {
  if (ts)
    syncStatus.textContent = "Last sync: " + new Date(ts).toLocaleString();
});

// --- Initialization ---

document.addEventListener("DOMContentLoaded", async () => {
  injectSharedUI();
  applyThemeFromStorage();
  setupThemeDropdown("darkModeSelect");
  if (await isAndroid()) {
    // Insert Sync Now button at the top of the container
    const container = document.querySelector(".container");
    if (container && !container.querySelector(".send-group-btn")) {
      container.insertBefore(syncNowBtn, container.firstChild);
    }
    // Add Android limitation message
    const androidMsg = document.createElement("div");
    androidMsg.className = "small-text";
    androidMsg.style.color = "#b71c1c";
    androidMsg.style.marginBottom = "10px";
    androidMsg.textContent =
      'Note: On Firefox for Android, background processing is not available. Open this page and tap "Sync Now" to process new tabs or changes.';
    container.insertBefore(androidMsg, syncNowBtn.nextSibling);
    showAndroidBanner(
      container,
      'Note: On Firefox for Android, background processing is not available. Open this page and tap "Sync Now" to process new tabs or changes.'
    );
    setLastSyncTime(container, Date.now());
    showDebugInfo(container, currentState);
  }
  loadState();
  if (deviceIconSelect && deviceIconPreview) {
    deviceIconSelect.addEventListener("change", async (e) => {
      const icon = e.target.value || DEFAULT_DEVICE_ICON;
      deviceIconPreview.textContent = icon;
      await storage.set(browser.storage.local, "myDeviceIcon", icon);
      // Optionally, sync to registry for other devices to see
      const instanceId = currentState?.instanceId;
      if (instanceId) {
        const deviceRegistry = await storage.get(
          browser.storage.sync,
          SYNC_STORAGE_KEYS.DEVICE_REGISTRY,
          {}
        );
        if (deviceRegistry[instanceId]) {
          deviceRegistry[instanceId].icon = icon;
          await storage.set(
            browser.storage.sync,
            SYNC_STORAGE_KEYS.DEVICE_REGISTRY,
            deviceRegistry
          );
        }
      }
    });
    deviceIconSelect.value = DEFAULT_DEVICE_ICON;
    loadDeviceIcon();
  }
  // Notification settings logic
  const notifSoundSelect = document.getElementById("notifSoundSelect");
  const notifDurationInput = document.getElementById("notifDurationInput");

  async function loadNotificationSettings() {
    const sound = await storage.get(
      browser.storage.local,
      "notifSound",
      "default"
    );
    const duration = await storage.get(
      browser.storage.local,
      "notifDuration",
      5
    );
    notifSoundSelect.value = sound;
    notifDurationInput.value = duration;
  }

  if (notifSoundSelect && notifDurationInput) {
    notifSoundSelect.addEventListener("change", async (e) => {
      await storage.set(browser.storage.local, "notifSound", e.target.value);
    });
    notifDurationInput.addEventListener("change", async (e) => {
      let val = parseInt(e.target.value, 10);
      if (isNaN(val) || val < 1) val = 1;
      if (val > 20) val = 20;
      notifDurationInput.value = val;
      await storage.set(browser.storage.local, "notifDuration", val);
    });
    loadNotificationSettings();
  }
});

// Onboarding steps content
const onboardingSteps = [
  {
    title: "Welcome to TabTogether!",
    content:
      "<p>TabTogether lets you send tabs to groups of devices instantly. This onboarding will guide you through the main features.</p>",
  },
  {
    title: "Device Settings",
    content:
      "<p>Set your device name and icon. This helps you identify your devices in groups and the registry.</p>",
  },
  {
    title: "Groups",
    content:
      "<p>Create, rename, and delete groups. Subscribe your devices to groups to send tabs between them.</p>",
  },
  {
    title: "Notifications & Sync",
    content:
      "<p>Customize notification sound and duration. Use manual or auto-sync to keep your devices up to date.</p>",
  },
  {
    title: "Help & About",
    content:
      "<p>Find more help in the Help/About section or on the project page. You can always reopen this onboarding from the link at the bottom of the settings page.</p>",
  },
];

let onboardingStep = 0;
const onboardingModal = document.getElementById("onboardingModal");
const onboardingStepContent = document.getElementById("onboardingStepContent");
const onboardingPrevBtn = document.getElementById("onboardingPrevBtn");
const onboardingNextBtn = document.getElementById("onboardingNextBtn");
const onboardingCloseBtn = document.getElementById("onboardingCloseBtn");
const openOnboardingLink = document.getElementById("openOnboardingLink");

function showOnboardingStep(idx) {
  onboardingStep = idx;
  const step = onboardingSteps[onboardingStep];
  onboardingStepContent.innerHTML = `<h2 style='margin-top:0;'>${step.title}</h2>${step.content}`;
  onboardingPrevBtn.disabled = onboardingStep === 0;
  onboardingNextBtn.disabled = onboardingStep === onboardingSteps.length - 1;
}

if (openOnboardingLink) {
  openOnboardingLink.addEventListener("click", (e) => {
    e.preventDefault();
    onboardingModal.classList.remove("hidden");
    showOnboardingStep(0);
  });
}
if (onboardingPrevBtn)
  onboardingPrevBtn.onclick = () =>
    showOnboardingStep(Math.max(0, onboardingStep - 1));
if (onboardingNextBtn)
  onboardingNextBtn.onclick = () =>
    showOnboardingStep(
      Math.min(onboardingSteps.length - 1, onboardingStep + 1)
    );
if (onboardingCloseBtn)
  onboardingCloseBtn.onclick = () => onboardingModal.classList.add("hidden");

// --- State Loading and Rendering ---

async function getStateDirectly() {
  const [
    instanceId,
    instanceName,
    subscriptions,
    groupBits,
    definedGroups,
    groupState,
    deviceRegistry,
  ] = await Promise.all([
    storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.INSTANCE_ID),
    storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.INSTANCE_NAME),
    storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS) || [],
    storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.GROUP_BITS) || {},
    storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS) || [],
    storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE) || {},
    storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY) || {},
  ]);
  return {
    instanceId,
    instanceName,
    subscriptions,
    groupBits,
    definedGroups,
    groupState,
    deviceRegistry,
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
      const container = document.querySelector(".container");
      import("./utils.js").then((utils) => {
        utils.setLastSyncTime(container, Date.now());
        utils.showDebugInfo(container, state);
      });
    }
    currentState = state;
    if (!currentState || currentState.error) {
      throw new Error(
        currentState?.error || "Failed to load state from background script."
      );
    }
    renderAll();
  } catch (error) {
    showError(STRINGS.loadingSettingsError(error.message), dom.messageArea);
    dom.deviceNameDisplay.textContent = STRINGS.error;
    dom.definedGroupsListDiv.innerHTML = `<p>${STRINGS.loadingGroups}</p>`;
    dom.deviceRegistryListDiv.innerHTML = `<p>${STRINGS.loadingRegistry}</p>`;
    if (typeof console !== "undefined") {
      console.error("TabTogether options.js loadState error:", error);
      if (error && error.stack) {
        console.error("Stack trace:", error.stack);
      }
    }
  } finally {
    showLoading(false);
  }
}

async function processIncomingTabsAndroid(state) {
  await processIncomingTabs(
    state,
    async (url) => {
      await browser.tabs.create({ url, active: false });
    },
    async (updated) => {
      await storage.set(
        browser.storage.local,
        LOCAL_STORAGE_KEYS.PROCESSED_TASKS,
        updated
      );
    }
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
//   dom.newInstanceNameInput.value = currentState.instanceName || ""; // Pre-fill edit input
}

function renderDeviceRegistry() {
    const devices = currentState.deviceRegistry;
    dom.deviceRegistryListDiv.innerHTML = ''; // Clear previous content

    if (!devices || Object.keys(devices).length === 0) {
        dom.deviceRegistryListDiv.textContent = STRINGS.noDevices;
        return;
    }

    const localId = currentState.instanceId;
    const ul = document.createElement('ul');
    ul.setAttribute('role', 'list');
    // Apply styling similar to #definedGroupsList ul from styles.css
    ul.style.listStyle = 'none';
    ul.style.padding = '0';
    ul.style.margin = '0';

    Object.entries(devices)
        .sort((a, b) => (a[1]?.name || '').localeCompare(b[1]?.name || ''))
        .forEach(([id, device]) => {
            const li = document.createElement('li');
            li.setAttribute('role', 'listitem');
            // Apply styling similar to #definedGroupsList li
            li.style.display = 'flex';
            li.style.justifyContent = 'space-between';
            li.style.alignItems = 'center';
            li.style.padding = '10px 0';
            li.style.borderBottom = '1px solid var(--main-border)';

            if (id === localId) li.classList.add('this-device');

            // Container for name and last seen (allows inline edit controls to fit)
            const nameAndInfoDiv = document.createElement('div');
            nameAndInfoDiv.style.flexGrow = '1'; // Take up available space
            nameAndInfoDiv.style.marginRight = '10px'; // Space before action buttons
            nameAndInfoDiv.style.display = 'flex';
            nameAndInfoDiv.style.flexDirection = 'column'; // Stack name and last seen

            const nameSpan = document.createElement('span');
            nameSpan.textContent = device.name || STRINGS.deviceNameNotSet; // Use constant
            nameSpan.style.cursor = 'pointer'; // Indicate clickable
            nameSpan.title = 'Click to rename';
            // Attach the inline edit starter function
            nameSpan.onclick = () => startRenameDevice(id, device.name || '', li, nameSpan);
            nameAndInfoDiv.appendChild(nameSpan);

            if (device.lastSeen) {
                const lastSeenSpan = document.createElement('span');
                lastSeenSpan.className = 'small-text';
                lastSeenSpan.style.fontSize = '0.9em';
                lastSeenSpan.style.opacity = '0.8';
                lastSeenSpan.textContent = `Last seen: ${new Date(device.lastSeen).toLocaleString()}`;
                nameAndInfoDiv.appendChild(lastSeenSpan);
            }

            li.appendChild(nameAndInfoDiv);

            // Action buttons container
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'device-actions'; // For potential styling

            // --- Rename button REMOVED ---

            // Delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'Delete';
            deleteBtn.className = 'inline-btn danger'; // Use existing style
            deleteBtn.disabled = id === localId;
            deleteBtn.title = id === localId ? 'Cannot delete this device from itself' : 'Delete device';
            deleteBtn.onclick = () => handleDeleteDevice(id, device.name);
            actionsDiv.appendChild(deleteBtn);

            li.appendChild(actionsDiv);
            ul.appendChild(li);
        });

    // Remove border from last item
    if (ul.lastChild) {
        ul.lastChild.style.borderBottom = 'none';
    }

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
    // Prevent starting another edit if one is already active in this list item
    const listItem = nameSpan.closest('li');
    if (!listItem || listItem.querySelector('.inline-edit-container')) {
        return;
    }

    const onSave = (newName) => {
        // Pass the controls container to finishRenameGroup for cleanup
        finishRenameGroup(oldName, newName, nameSpan, inlineControls.element);
    };

    const onCancel = () => {
        cancelInlineEdit(nameSpan, inlineControls.element);
    };

    // Create the inline controls
    const inlineControls = createInlineEditControls(oldName, onSave, onCancel);

    nameSpan.style.display = 'none'; // Hide original span
    // Insert controls *after* the hidden span, within the list item
    nameSpan.parentNode.insertBefore(inlineControls.element, nameSpan.nextSibling);
    inlineControls.focusInput(); // Focus the input field
}

// Modify finishRenameGroup to accept the controls container for cleanup
async function finishRenameGroup(oldName, newName, nameSpan, inlineControlsContainer) {
    // Basic validation (already handled in save handler, but good practice)
    newName = newName.trim();
    if (!newName || newName === oldName) {
        cancelInlineEdit(nameSpan, inlineControlsContainer);
        return;
    }

    // Confirmation is optional for inline editing, remove if desired
    // if (!confirm(STRINGS.confirmRenameGroup(oldName, newName))) {
    //     cancelInlineEdit(nameSpan, inlineControlsContainer);
    //     return;
    // }

    showLoading(true);
    let success = false;
    try {
        let response;
        if (await isAndroid()) {
            response = await renameGroupDirect(oldName, newName);
        } else {
            response = await browser.runtime.sendMessage({ action: 'renameGroup', oldName, newName });
        }

        if (response.success) {
            showMessage(STRINGS.groupRenameSuccess(newName), false);
            success = true;
            // Reload state which will re-render the list, removing the inline controls
            await loadState();
        } else {
            showError(response.message || STRINGS.groupRenameFailed, dom.messageArea);
            // Explicitly cancel edit UI on failure if loadState doesn't happen
            cancelInlineEdit(nameSpan, inlineControlsContainer);
        }
    } catch (e) {
        showError(STRINGS.groupRenameFailed + ": " + e.message, dom.messageArea);
        // Explicitly cancel edit UI on error
        cancelInlineEdit(nameSpan, inlineControlsContainer);
    } finally {
        showLoading(false);
        // If loadState was successful, controls are gone. If not, cancelInlineEdit was called above.
    }
}

// Device rename UI
function startRenameDevice(deviceId, oldName, listItem, nameSpan) {
    // Prevent starting another edit if one is already active in this row
    if (listItem.querySelector('.inline-edit-container')) {
        return;
    }

    const onSave = (newName) => {
        finishRenameDevice(deviceId, newName, listItem, nameSpan, inlineControls.element);
    };

    const onCancel = () => {
        cancelInlineEdit(nameSpan, inlineControls.element);
    };

    // Create the inline controls
    const inlineControls = createInlineEditControls(oldName, onSave, onCancel);

    nameSpan.style.display = 'none'; // Hide original span
    // Insert controls *after* the hidden span, before other action buttons
    // Find the container holding the name span to insert relative to it
    const nameContainer = nameSpan.parentNode;
    nameContainer.insertBefore(inlineControls.element, nameSpan.nextSibling);
    inlineControls.focusInput();
}

// Modify finishRenameDevice to accept the controls container
async function finishRenameDevice(deviceId, newName, listItem, nameSpan, inlineControlsContainer) {
    newName = newName.trim();
    // Allow renaming back to original, just check for empty
    if (!newName) {
        cancelInlineEdit(nameSpan, inlineControlsContainer);
        return;
    }

    // Optional: Remove confirmation
    // if (!confirm(STRINGS.confirmRenameDevice(newName))) {
    //     cancelInlineEdit(nameSpan, inlineControlsContainer);
    //     return;
    // }

    showLoading(true);
    let success = false;
    try {
        const isAndroidPlatform = await isAndroid();
        let response = await renameDeviceUnified(deviceId, newName, isAndroidPlatform);

        if (response.success) {
            showMessage(STRINGS.deviceRenameSuccess(newName), false);
            success = true;
            await loadState(); // Reload state to re-render
        } else {
            showError(response.message || STRINGS.deviceRenameFailed, dom.messageArea);
            cancelInlineEdit(nameSpan, inlineControlsContainer); // Clean up on failure
        }
    } catch (e) {
        showError(STRINGS.deviceRenameFailed + ": " + e.message, dom.messageArea);
        cancelInlineEdit(nameSpan, inlineControlsContainer); // Clean up on error
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
      response = await browser.runtime.sendMessage({
        action: "deleteDevice",
        deviceId,
      });
    }
    if (response.success) {
      showMessage(STRINGS.deviceDeleteSuccess(deviceName), false);
      await loadState();
    } else {
      showError(
        response.message || STRINGS.deviceDeleteFailed,
        dom.messageArea
      );
    }
  } catch (e) {
    showError(STRINGS.deviceDeleteFailed + ": " + e.message, dom.messageArea);
  } finally {
    showLoading(false);
  }
}

// --- UI Interaction Handlers ---


dom.newGroupNameInput.addEventListener(
  "input",
  debounce(function (e) {
    const value = e.target.value.trim();
    dom.createGroupBtn.disabled = value.length === 0;
  }, 250)
);

dom.createGroupBtn.addEventListener("click", async () => {
  const groupName = dom.newGroupNameInput.value.trim();
  if (groupName === "") return;
  showLoading(true);
  clearMessage();
  try {
    let response;
    if (await isAndroid()) {
      response = await createGroupDirect(groupName);
    } else {
      response = await browser.runtime.sendMessage({
        action: "createGroup",
        groupName: groupName,
      });
    }
    if (response.success) {
      await loadState(); // Always reload state after group creation
      showMessage(STRINGS.groupCreateSuccess(response.newGroup), false);
      dom.newGroupNameInput.value = "";
      dom.createGroupBtn.disabled = true;
    } else {
      showError(response.message || STRINGS.groupCreateFailed, dom.messageArea);
    }
  } catch (error) {
    showError(
      STRINGS.groupCreateFailed + ": " + error.message,
      dom.messageArea
    );
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
    let response = await unsubscribeFromGroupUnified(
      groupName,
      isAndroidPlatform
    );
    if (response.success) {
      currentState.subscriptions = currentState.subscriptions.filter(
        (g) => g !== response.unsubscribedGroup
      );
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
      response = await browser.runtime.sendMessage({
        action: "deleteGroup",
        groupName: groupName,
      });
    }
    if (response.success) {
      currentState.definedGroups = currentState.definedGroups.filter(
        (g) => g !== response.deletedGroup
      );
      currentState.subscriptions = currentState.subscriptions.filter(
        (g) => g !== response.deletedGroup
      );
      renderDefinedGroups();
      showMessage(STRINGS.groupDeleteSuccess(response.deletedGroup), false);
    } else {
      showError(response.message || STRINGS.groupDeleteFailed, dom.messageArea);
    }
  } catch (error) {
    showError(
      STRINGS.groupDeleteFailed + ": " + error.message,
      dom.messageArea
    );
  } finally {
    showLoading(false);
  }
}

// --- Test Notification ---
dom.testNotificationBtn.addEventListener("click", async () => {
  showLoading(true);
  try {
    await browser.runtime.sendMessage({ action: "testNotification" });
    showMessage(STRINGS.testNotificationSent, false);
  } catch (e) {
    showError(STRINGS.testNotificationFailed(e.message), dom.messageArea);
  } finally {
    showLoading(false);
  }
});

// --- UI Helper Functions ---

// Function to remove inline edit elements and restore the original span
function cancelInlineEdit(originalSpan, inlineControlsContainer) {
    if (inlineControlsContainer && inlineControlsContainer.parentNode) {
        inlineControlsContainer.remove();
    }
    if (originalSpan) {
        originalSpan.style.display = ''; // Make original span visible again
        // Optionally refocus the original element or the list item for accessibility
        // originalSpan.focus();
    }
}

// Function to create the inline input and buttons
function createInlineEditControls(currentValue, onSaveCallback, onCancelCallback) {
    const container = document.createElement('div');
    container.className = 'inline-edit-container'; // Add class for styling
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.flexGrow = '1'; // Take up space
    container.style.marginRight = '10px'; // Space before other buttons (like Delete)

    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentValue;
    input.className = 'inline-edit-input'; // Add class for styling
    input.style.flexGrow = '1';
    input.style.marginRight = '5px';
    // Apply some basic input styling inline or use CSS class
    input.style.padding = '4px 6px';
    input.style.fontSize = '0.95em';
    input.style.border = '1px solid var(--main-accent)'; // Highlight active edit

    const saveBtn = document.createElement('button');
    saveBtn.textContent = '✓'; // Save icon/text
    saveBtn.className = 'inline-edit-save'; // Add class for styling
    saveBtn.title = 'Save';
    // Minimal button styling
    saveBtn.style.padding = '2px 6px';
    saveBtn.style.fontSize = '1em';
    saveBtn.style.lineHeight = '1';
    saveBtn.style.minWidth = 'auto';
    saveBtn.style.boxShadow = 'none';
    // Consider using a success color
    // saveBtn.style.backgroundColor = 'var(--main-success-bg)';
    // saveBtn.style.color = 'var(--main-success-text)';


    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '✕'; // Cancel icon/text
    cancelBtn.className = 'inline-edit-cancel secondary'; // Use secondary style
    cancelBtn.title = 'Cancel';
    // Minimal button styling
    cancelBtn.style.padding = '2px 6px';
    cancelBtn.style.fontSize = '1em';
    cancelBtn.style.lineHeight = '1';
    cancelBtn.style.minWidth = 'auto';
    cancelBtn.style.marginLeft = '3px';
    cancelBtn.style.boxShadow = 'none';


    // --- Event Handlers ---
    const handleSave = () => {
        const newValue = input.value.trim();
        // Only save if non-empty and different from original
        if (newValue && newValue !== currentValue) {
            onSaveCallback(newValue);
        } else {
            onCancelCallback(); // Treat empty or unchanged as cancel
        }
    };

    const handleCancel = () => {
        onCancelCallback();
    };

    input.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSave();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            handleCancel();
        }
    };

    saveBtn.onclick = handleSave;
    cancelBtn.onclick = handleCancel;

    // Handle blur: Treat blur as cancel to prevent accidental saves
    input.onblur = (e) => {
        // Use setTimeout to allow clicks on save/cancel buttons to register first
        setTimeout(() => {
            // Check if focus moved to one of the inline buttons
            const focusMovedToButton = e.relatedTarget === saveBtn || e.relatedTarget === cancelBtn;
            // If the container is still part of the DOM and focus didn't move to save/cancel, then cancel.
            if (container.parentNode && !focusMovedToButton) {
                handleCancel();
            }
        }, 150); // Delay might need adjustment
    };

    container.appendChild(input);
    container.appendChild(saveBtn);
    container.appendChild(cancelBtn);

    // Return container and a function to focus the input
    return {
        element: container,
        focusInput: () => input.focus()
    };
}

function showLoading(isLoading) {
  if (isLoading) {
    dom.loadingIndicator.classList.remove("hidden");
    dom.loadingIndicator.innerHTML = '<span class="spinner"></span> Loading...';
  } else {
    dom.loadingIndicator.classList.add("hidden");
    dom.loadingIndicator.innerHTML = "";
  }
}

function showMessage(message, isError = false) {
  dom.messageArea.textContent = message;
  dom.messageArea.className = isError ? "error" : "success";
  dom.messageArea.classList.remove("hidden");
  if (!isError) setTimeout(clearMessage, 4000);
}

function clearMessage() {
  dom.messageArea.textContent = "";
  dom.messageArea.className = "hidden";
}

const removeDeviceBtn = document.getElementById("removeDeviceBtn");
if (removeDeviceBtn) {
  removeDeviceBtn.addEventListener("click", async () => {
    if (
      !confirm(
        "Are you sure you want to remove this device from all groups and the registry? This cannot be undone."
      )
    )
      return;
    showLoading(true);
    clearMessage();
    try {
      const instanceId = currentState?.instanceId;
      if (!instanceId) throw new Error("Device ID not found.");
      // Remove from registry and all groups
      const res = await browser.runtime.sendMessage({
        action: "deleteDevice",
        deviceId: instanceId,
      });
      if (res.success) {
        showMessage("Device removed from all groups and registry.", false);
        await loadState();
      } else {
        showError(res.message || "Failed to remove device.", dom.messageArea);
      }
    } catch (e) {
      showError("Error removing device: " + e.message, dom.messageArea);
    } finally {
      showLoading(false);
    }
  });
}

async function loadDeviceIcon() {
  const icon = await storage.get(
    browser.storage.local,
    "myDeviceIcon",
    DEFAULT_DEVICE_ICON
  );
  deviceIconSelect.value = icon;
  deviceIconPreview.textContent = icon;
}
