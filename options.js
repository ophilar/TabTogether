// options.js

import { STRINGS } from "./constants.js";
import {
  renderGroupList,
  isAndroid,
  SYNC_STORAGE_KEYS, // Use SYNC keys for shared settings
  createGroupDirect,
  deleteGroupDirect,
  renameGroupDirect,
  deleteDeviceDirect,
  processIncomingTabsAndroid, // Import the shared function
  getUnifiedState,
  subscribeToGroupUnified,
  unsubscribeFromGroupUnified,
  showAndroidBanner,
  setLastSyncTime,
  debounce,
  showError,
  renameDeviceUnified,
  storage,
  showLoadingIndicator,
  showMessage,
  clearMessage,
} from "./utils.js";
import { injectSharedUI } from "./shared-ui.js";
import { applyThemeFromStorage, setupThemeDropdown } from "./theme.js";

// Cache DOM elements at the top for repeated use
const dom = {
  deviceRegistryListDiv: document.getElementById("deviceRegistryList"),
  definedGroupsListDiv: document.getElementById("definedGroupsList"),
  newGroupNameInput: document.getElementById("newGroupName"),
  createGroupBtn: document.getElementById("createGroupBtn"),
  loadingIndicator: document.getElementById("loadingIndicator"),
  messageArea: document.getElementById("messageArea"),
  staleDeviceThresholdInput: document.getElementById("staleDeviceThresholdInput"),
  taskExpiryInput: document.getElementById("taskExpiryInput"),
  // testNotificationBtn: document.getElementById("testNotificationBtn"),
};

let currentState = null; // Cache for state fetched from background
const manualSyncBtn = document.getElementById("manualSyncBtn"); // Or rename ID to syncNowBtn if you change HTML
const syncIntervalInput = document.getElementById("syncIntervalInput");
const syncStatus = document.getElementById("syncStatus");

// Manual sync handler
if (manualSyncBtn) {
  manualSyncBtn.addEventListener("click", async () => {
    const syncIcon = manualSyncBtn.querySelector('.sync-icon-svg');
    // showLoadingIndicator(dom.loadingIndicator, true);
    const startTime = Date.now(); // Record start time
    manualSyncBtn.disabled = true; // Disable button during operation
    if (syncIcon) syncIcon.classList.add('syncing-icon'); // Start animation
    clearMessage(dom.messageArea);
    try {
      if (await isAndroid()) {

        // On Android, perform the direct foreground sync
        await loadState(); // This handles UI updates and messages internally
        showMessage(dom.messageArea, 'Sync complete.', false); // Show success message after loadState finishes
      } else {
        // On Desktop, trigger background sync via heartbeat
        await browser.runtime.sendMessage({ action: "heartbeat" });
        const now = new Date();
        syncStatus.textContent = "Last sync: " + now.toLocaleString();
        await storage.set(browser.storage.local, "lastSync", now.getTime());
        showMessage(dom.messageArea, 'Background sync triggered.', false); // Inform user
      }
    } catch (error) { // Catch errors from loadState or sendMessage
      console.error("Manual sync failed:", error);
      showError(`Sync failed: ${error.message || 'Unknown error'}`, dom.messageArea);
    } finally {
      // showLoadingIndicator(dom.loadingIndicator, false); // Don't show/hide the separate indicator
      const duration = Date.now() - startTime;
      const minAnimationTime = 500; // Minimum animation time in milliseconds (0.5 seconds)

      if (syncIcon) {
        if (duration < minAnimationTime) {
          setTimeout(() => syncIcon.classList.remove('syncing-icon'), minAnimationTime - duration);
        } else {
          syncIcon.classList.remove('syncing-icon'); // Stop animation immediately
        }
      }
      manualSyncBtn.disabled = false; // Re-enable button
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

// --- Advanced Timing Settings ---

const DEFAULT_STALE_THRESHOLD_DAYS = 30;
const DEFAULT_TASK_EXPIRY_DAYS = 14;

async function loadAdvancedTimingSettings() {
  const staleDays = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.STALE_DEVICE_THRESHOLD_DAYS, DEFAULT_STALE_THRESHOLD_DAYS);
  const taskDays = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.TASK_EXPIRY_DAYS, DEFAULT_TASK_EXPIRY_DAYS);
  if (dom.staleDeviceThresholdInput) dom.staleDeviceThresholdInput.value = staleDays;
  if (dom.taskExpiryInput) dom.taskExpiryInput.value = taskDays;
}

function setupAdvancedTimingListeners() {
  if (dom.staleDeviceThresholdInput) {
    dom.staleDeviceThresholdInput.addEventListener('change', async (e) => {
      let val = parseInt(e.target.value, 10);
      if (isNaN(val) || val < 1) val = DEFAULT_STALE_THRESHOLD_DAYS; // Reset to default if invalid
      dom.staleDeviceThresholdInput.value = val; // Update input field in case it was corrected
      await storage.set(browser.storage.sync, SYNC_STORAGE_KEYS.STALE_DEVICE_THRESHOLD_DAYS, val);
    });
  }
  if (dom.taskExpiryInput) {
    dom.taskExpiryInput.addEventListener('change', async (e) => {
      let val = parseInt(e.target.value, 10);
      if (isNaN(val) || val < 1) val = DEFAULT_TASK_EXPIRY_DAYS; // Reset to default if invalid
      dom.taskExpiryInput.value = val; // Update input field
      await storage.set(browser.storage.sync, SYNC_STORAGE_KEYS.TASK_EXPIRY_DAYS, val);
    });
  }
}

// --- Initialization ---

document.addEventListener("DOMContentLoaded", async () => {
  injectSharedUI();
  applyThemeFromStorage();
  setupThemeDropdown("darkModeSelect");

  if (await isAndroid()) {
    const container = document.querySelector(".container");
    showAndroidBanner(
      'Note: On Firefox for Android, background processing is not available. Open this page and tap "Sync Now" to process new tabs or changes.'
    );
    setLastSyncTime(container, Date.now());
    showDebugInfo(container, currentState);

  }

  // Setup and load advanced timing settings
  setupAdvancedTimingListeners();
  loadAdvancedTimingSettings();

  // Listen for messages from the background script indicating data changes
  browser.runtime.onMessage.addListener((message) => {
    if (message.action === "syncDataChanged") {
      console.log("Options page received syncDataChanged message, reloading state...");
      loadState(); // Reload the state to update the UI
    }
  });

  loadState(); // Load initial state after setting up listeners
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

async function loadState() {
  showLoadingIndicator(dom.loadingIndicator, true);
  clearMessage(dom.messageArea);
  try {
    const isAndroidPlatform = await isAndroid();
    let state = await getUnifiedState(isAndroidPlatform);
    if (isAndroidPlatform) {
      await processIncomingTabsAndroid(state);
      const container = document.querySelector(".container");
      setLastSyncTime(container, Date.now()); // Call directly
      showDebugInfo(container, state);      // Call directly
    }
    currentState = state;
    if (!currentState || currentState.error) {
      throw new Error(
        currentState?.error || "Failed to load state from background script."
      );
    }
    renderAll();
  } catch (error) {
    console.error("!!! ERROR IN loadState:", error); // Log the error object itself
    if (error && error.stack) {
      console.error("!!! Stack Trace:", error.stack); // Log the stack trace if available
    }

    showError(STRINGS.loadingSettingsError(error.message), dom.messageArea);
    if (dom.deviceNameDisplay) dom.deviceNameDisplay.textContent = STRINGS.error; // Check if exists
    // Replace innerHTML with textContent for simple messages
    dom.definedGroupsListDiv.textContent = STRINGS.loadingGroups;
    dom.deviceRegistryListDiv.textContent = STRINGS.loadingRegistry;
    if (typeof console !== "undefined") {
      console.error("TabTogether options.js loadState error:", error);
      if (error && error.stack) {
        console.error("Stack trace:", error.stack);
      }
    }
  } finally {
    showLoadingIndicator(dom.loadingIndicator, false);
  }
}

function renderAll() {
  if (!currentState) return;
  renderDeviceRegistry();
  renderDefinedGroups();
}

function renderDeviceRegistry() {
  const devices = currentState.deviceRegistry;
  dom.deviceRegistryListDiv.textContent = ''; // Clear previous content safely

  if (!devices || Object.keys(devices).length === 0) {
    dom.deviceRegistryListDiv.textContent = STRINGS.noDevices;
    return;
  }

  const localId = currentState.instanceId;
  const ul = document.createElement('ul');
  ul.setAttribute('role', 'list');
  // Apply styling similar to #definedGroupsList ul from styles.css
  ul.className = 'registry-list'; // Add class for styling

  Object.entries(devices)
    .sort((a, b) => {
      const [idA] = a;
      const [idB] = b;
      // Prioritize the current device
      if (idA === localId) return -1; // a comes first
      if (idB === localId) return 1;  // b comes first
      // Otherwise, sort alphabetically by name
      return (a[1]?.name || '').localeCompare(b[1]?.name || '');
    })
    .forEach(([id, device]) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'listitem');
      // Apply styling similar to #definedGroupsList li
      li.className = 'registry-list-item'; // Add class for styling

      if (id === localId) {
      }

      // Container for name and last seen (allows inline edit controls to fit)
      const nameAndInfoDiv = document.createElement('div');
      nameAndInfoDiv.className = 'registry-item-info'; // Add class for styling

      const nameSpan = document.createElement('span');
      nameSpan.className = 'device-name-label'; // Add class for potential styling/selection
      // Make current device name bold
      if (id === localId) {
        // Create elements programmatically for safety
        const strong = document.createElement('strong');
        strong.textContent = device.name || STRINGS.deviceNameNotSet;
        nameSpan.appendChild(strong);
        nameSpan.appendChild(document.createTextNode(' (This Device)'));
        li.classList.add('this-device'); // Keep highlighting the row
      }
      // Only allow renaming for the current device within this list
      if (id === localId) {
        nameSpan.style.cursor = 'pointer'; // Indicate clickable
        nameSpan.title = 'Click to rename this device';
        nameSpan.onclick = () => startRenameDevice(id, device.name || '', li, nameSpan);
      }
      nameAndInfoDiv.appendChild(nameSpan);

      if (device.lastSeen) {
        const lastSeenSpan = document.createElement('span');
        lastSeenSpan.className = 'small-text registry-item-lastseen'; // Add classes for styling
        lastSeenSpan.textContent = `Last seen: ${new Date(device.lastSeen).toLocaleString()}`;
        nameAndInfoDiv.appendChild(lastSeenSpan);
      }

      li.appendChild(nameAndInfoDiv);

      // Action buttons container
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'registry-item-actions'; // Add class for styling

      // Delete/Remove button
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'inline-btn danger'; // Use existing style

      if (id === localId) {
        deleteBtn.textContent = 'Remove';
        deleteBtn.title = 'Remove this device from all groups and registry. This cannot be undone.';
        deleteBtn.setAttribute('aria-label', 'Remove this device from registry');
        // Attach the specific handler for removing self
        deleteBtn.onclick = handleRemoveSelfDevice; // Use a dedicated handler
      } else {
        deleteBtn.textContent = 'Delete';
        deleteBtn.title = 'Delete this device from the registry';
        deleteBtn.setAttribute('aria-label', `Delete device ${device.name || 'Unnamed'} from registry`);
      }
      deleteBtn.onclick = () => handleDeleteDevice(id, device.name);
      actionsDiv.appendChild(deleteBtn);

      li.appendChild(actionsDiv);
      ul.appendChild(li);
    });

  // Remove border from last item
  // if (ul.lastChild) { // Let CSS handle this with :last-child selector
  //   ul.lastChild.style.borderBottom = 'none';
  // }

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

  showLoadingIndicator(dom.loadingIndicator, true);
  let success = false;
  try {
    let response;
    if (await isAndroid()) {
      response = await renameGroupDirect(oldName, newName);
    } else {
      response = await browser.runtime.sendMessage({ action: 'renameGroup', oldName, newName });
    }

    if (response.success) {
      showMessage(dom.messageArea, STRINGS.groupRenameSuccess(newName), false);
      success = true;
      // Update local state and re-render instead of full reload
      if (currentState) {
        currentState.definedGroups = currentState.definedGroups.map(g => g === oldName ? newName : g);
        currentState.subscriptions = currentState.subscriptions.map(s => s === oldName ? newName : s);
        renderDefinedGroups(); // Re-render the groups list
      }
      // Controls are removed implicitly by re-rendering
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
    showLoadingIndicator(dom.loadingIndicator, false);
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

  showLoadingIndicator(dom.loadingIndicator, true);
  let success = false;
  try {
    const isAndroidPlatform = await isAndroid();
    let response = await renameDeviceUnified(deviceId, newName, isAndroidPlatform);

    if (response.success) {
      showMessage(dom.messageArea, STRINGS.deviceRenameSuccess(newName), false);
      success = true;
      // Update local state and re-render
      if (currentState && currentState.deviceRegistry[deviceId]) {
        currentState.deviceRegistry[deviceId].name = newName;
        if (deviceId === currentState.instanceId) {
          currentState.instanceName = newName; // Update local name cache if it's this device
        }
        renderDeviceRegistry(); // Re-render the device list
      }
    } else {
      showError(response.message || STRINGS.deviceRenameFailed, dom.messageArea);
      cancelInlineEdit(nameSpan, inlineControlsContainer); // Clean up on failure
    }
  } catch (e) {
    showError(STRINGS.deviceRenameFailed + ": " + e.message, dom.messageArea);
    cancelInlineEdit(nameSpan, inlineControlsContainer); // Clean up on error
  } finally {
    showLoadingIndicator(dom.loadingIndicator, false);
  }
}

async function handleDeleteDevice(deviceId, deviceName) {
  if (!confirm(STRINGS.confirmDeleteDevice(deviceName))) {
    return;
  }
  showLoadingIndicator(dom.loadingIndicator, true);
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
      showMessage(dom.messageArea, STRINGS.deviceDeleteSuccess(deviceName), false);
      // Update local state and re-render
      if (currentState && currentState.deviceRegistry[deviceId]) {
        delete currentState.deviceRegistry[deviceId];
        renderDeviceRegistry(); // Re-render the device list
      }
    } else {
      showError(
        response.message || STRINGS.deviceDeleteFailed,
        dom.messageArea
      );
    }
  } catch (e) {
    showError(STRINGS.deviceDeleteFailed + ": " + e.message, dom.messageArea);
  } finally {
    showLoadingIndicator(dom.loadingIndicator, false);
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
  showLoadingIndicator(dom.loadingIndicator, true);
  clearMessage(dom.messageArea);
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
      // Update local state and re-render
      if (currentState && !currentState.definedGroups.includes(response.newGroup)) {
        currentState.definedGroups.push(response.newGroup);
        currentState.definedGroups.sort();
        renderDefinedGroups(); // Re-render the groups list
      }
      showMessage(dom.messageArea, STRINGS.groupCreateSuccess(response.newGroup), false);
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
    showLoadingIndicator(dom.loadingIndicator, false);
  }
});

async function handleSubscribe(event) {
  const groupName = event.target.dataset.group;
  showLoadingIndicator(dom.loadingIndicator, true);
  clearMessage(dom.messageArea);
  try {
    const isAndroidPlatform = await isAndroid();
    let response = await subscribeToGroupUnified(groupName, isAndroidPlatform);
    if (response.success) {
      // Update local state and re-render
      if (currentState && !currentState.subscriptions.includes(response.subscribedGroup)) {
        currentState.subscriptions.push(response.subscribedGroup);
        currentState.subscriptions.sort();
        renderDefinedGroups(); // Re-render the groups list
        showMessage(dom.messageArea, `Subscribed to "${response.subscribedGroup}".`, false);
      }
    } else {
      showError(response.message || "Failed to subscribe.", dom.messageArea);
    }
  } catch (error) {
    showError(`Error subscribing: ${error.message}`, dom.messageArea);
  } finally {
    showLoadingIndicator(dom.loadingIndicator, false);
  }
}

async function handleUnsubscribe(event) {
  const groupName = event.target.dataset.group;
  showLoadingIndicator(dom.loadingIndicator, true);
  clearMessage(dom.messageArea);
  try {
    const isAndroidPlatform = await isAndroid();
    let response = await unsubscribeFromGroupUnified(
      groupName,
      isAndroidPlatform
    );
    if (response.success) {
      // Update local state and re-render
      if (currentState) {
        currentState.subscriptions = currentState.subscriptions.filter(g => g !== response.unsubscribedGroup);
        renderDefinedGroups(); // Re-render the groups list
        showMessage(dom.messageArea, `Unsubscribed from "${response.unsubscribedGroup}".`, false);
      }
    } else {
      showError(response.message || "Failed to unsubscribe.", dom.messageArea);
    }
  } catch (error) {
    showError(`Error unsubscribing: ${error.message}`, dom.messageArea);
  } finally {
    showLoadingIndicator(dom.loadingIndicator, false);
  }
}

async function handleDeleteGroup(event) {
  const groupName = event.target.dataset.group;
  if (!confirm(STRINGS.confirmDeleteGroup(groupName))) {
    return;
  }
  showLoadingIndicator(dom.loadingIndicator, true);
  clearMessage(dom.messageArea);
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
      // Update local state and re-render
      if (currentState) {
        currentState.definedGroups = currentState.definedGroups.filter(g => g !== response.deletedGroup);
        currentState.subscriptions = currentState.subscriptions.filter(g => g !== response.deletedGroup);
        renderDefinedGroups(); // Re-render the groups list
      }
      showMessage(dom.messageArea, STRINGS.groupDeleteSuccess(response.deletedGroup), false);
    } else {
      showError(response.message || STRINGS.groupDeleteFailed, dom.messageArea);
    }
  } catch (error) {
    showError(
      STRINGS.groupDeleteFailed + ": " + error.message,
      dom.messageArea
    );
  } finally {
    showLoadingIndicator(dom.loadingIndicator, false);
  }
}

// --- Test Notification ---
const testNotificationBtn = document.getElementById("testNotificationBtn");
if (testNotificationBtn) {
  testNotificationBtn.addEventListener("click", async () => {
    showLoadingIndicator(dom.loadingIndicator, true);
    try {
      await browser.runtime.sendMessage({ action: "testNotification" });
      showMessage(dom.messageArea, STRINGS.testNotificationSent, false);
    } catch (e) {
      showMessage(dom.messageArea, STRINGS.testNotificationFailed(e.message), true); // Use showMessage
    } finally {
      showLoadingIndicator(dom.loadingIndicator, false);
    }
  });
}

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

  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentValue;
  input.className = 'inline-edit-input'; // Add class for styling

  const saveBtn = document.createElement('button');
  saveBtn.textContent = '✓'; // Save icon/text
  saveBtn.className = 'inline-edit-save'; // Add class for styling
  saveBtn.title = 'Save';
  // Minimal button styling
  // Apply base button styles via CSS if needed, or inherit
  // Consider using a success color
  // saveBtn.style.backgroundColor = 'var(--main-success-bg)';
  // saveBtn.style.color = 'var(--main-success-text)';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = '✕'; // Cancel icon/text
  cancelBtn.className = 'inline-edit-cancel secondary'; // Use secondary style from base CSS
  cancelBtn.title = 'Cancel';
  // Minimal button styling

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

// Handler specifically for the "Remove" button next to the current device
async function handleRemoveSelfDevice() {
  if (
    !confirm(
      "Are you sure you want to remove THIS device from all groups and the registry? This cannot be undone."
    )
  )
    return;

  showLoadingIndicator(dom.loadingIndicator, true);
  clearMessage(dom.messageArea);
  try {
    const instanceId = currentState?.instanceId;
    if (!instanceId) throw new Error("Current Device ID not found.");

    // Call the background script action to delete the device
    const res = await browser.runtime.sendMessage({
      action: "deleteDevice",
      deviceId: instanceId,
    });

    if (res.success) {
      showMessage(dom.messageArea, "This device removed from all groups and registry.", false);
      // Update local state and re-render
      if (currentState && currentState.deviceRegistry[instanceId]) {
        delete currentState.deviceRegistry[instanceId]; // Remove self from registry cache
        renderDeviceRegistry(); // Re-render
      }
    } else {
      showError(res.message || "Failed to remove this device.", dom.messageArea);
    }
  } catch (e) {
    showError("Error removing this device: " + e.message, dom.messageArea);
  } finally {
    showLoadingIndicator(dom.loadingIndicator, false);
  }
}
