console.log("[OptionsPage] options.js script started parsing.");

import { STRINGS, MAX_DEVICES_PER_GROUP, SYNC_STORAGE_KEYS } from "../../common/constants.js";
import { isAndroid } from "../../core/platform.js";
import {
  createGroupDirect,
  deleteGroupDirect,
  renameGroupDirect,
  deleteDeviceDirect,
  getUnifiedState,
  subscribeToGroupUnified,
  unsubscribeFromGroupUnified,
  renameDeviceUnified,
} from "../../core/actions.js";
import { storage } from "../../core/storage.js";
import { processIncomingTabsAndroid } from "../../core/tasks.js";
import { debounce } from "../../common/utils.js";
import { injectSharedUI, showAndroidBanner,
  showLoadingIndicator,
  showMessage,
  clearMessage,
 } from "../shared/shared-ui.js";
import { applyThemeFromStorage, setupThemeDropdown } from "../shared/theme.js";
import {
  renderDeviceRegistryUI,
  renderGroupListUI,
  createInlineEditControlsUI,
  createGroupListItemUI,
  cancelInlineEditUI,
  setLastSyncTimeUI,
  showDebugInfoUI,
  displaySyncRequirementBanner, 
} from "./options-ui.js";
import { setupOnboarding } from "./options-onboarding.js";
import { setupAdvancedTiming } from "./options-advanced-timing.js";

// Cache DOM elements at the top for repeated use
// Initialize properties to null, they will be assigned in DOMContentLoaded
const dom = {
  deviceRegistryListDiv: null,
  definedGroupsListDiv: null,
  newGroupNameInput: null,
  createGroupBtn: null,
  loadingIndicator: null, // Added here for consistency
  messageArea: null,      // Added here for consistency
};

let currentState = null; 
let isAndroidPlatformGlobal = false; 

let manualSyncBtn = null; // Declare, will be assigned in DOMContentLoaded
let syncIntervalInput = null; // Declare, will be assigned in DOMContentLoaded
let syncStatus = null; // Declare, will be assigned in DOMContentLoaded
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
      if (isAndroidPlatformGlobal) {

        // On Android, perform the direct foreground sync
        await loadState(); // This handles UI updates and messages internally for Android
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
      showMessage(dom.messageArea, `Sync failed: ${error.message || 'Unknown error'}`, true);
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
// --- Initialization ---

document.addEventListener("DOMContentLoaded", async () => {
  try {
  isAndroidPlatformGlobal = await isAndroid(); // Cache platform info
  
  const mainOptionsContainer = document.querySelector('.container'); // Target the main container
  if (mainOptionsContainer) {
      await displaySyncRequirementBanner(mainOptionsContainer, storage); // Pass storage and await
  }

  injectSharedUI();
  applyThemeFromStorage();
  setupThemeDropdown("darkModeSelect");
  setupOnboarding(); // Initialize onboarding UI and logic

  // Assign all DOM elements now that the DOM is ready
  // Moved these assignments into DOMContentLoaded
  manualSyncBtn = document.getElementById("manualSyncBtn");
  syncIntervalInput = document.getElementById("syncIntervalInput");
  syncStatus = document.getElementById("syncStatus");

  dom.deviceRegistryListDiv = document.getElementById("deviceRegistryList");
  dom.definedGroupsListDiv = document.getElementById("definedGroupsList");
  dom.newGroupNameInput = document.getElementById("newGroupName");
  dom.createGroupBtn = document.getElementById("createGroupBtn");
  // Note: staleDeviceThresholdInput and taskExpiryInput are handled by options-advanced-timing.js
  // and assigned there.
  
  // Assign DOM elements that might be created/checked by injectSharedUI or need full DOM readiness
  dom.loadingIndicator = document.getElementById("loadingIndicator");
  dom.messageArea = document.getElementById("messageArea");

  // Re-attach event listeners now that elements are confirmed to exist
  if (manualSyncBtn) {
    manualSyncBtn.addEventListener("click", async () => {
      const syncIcon = manualSyncBtn.querySelector('.sync-icon-svg');
      const startTime = Date.now(); 
      manualSyncBtn.disabled = true; 
      if (syncIcon) syncIcon.classList.add('syncing-icon'); 
      clearMessage(dom.messageArea);
      try {
        if (isAndroidPlatformGlobal) {
          await loadState(); 
          showMessage(dom.messageArea, 'Sync complete.', false); 
        } else {
          await browser.runtime.sendMessage({ action: "heartbeat" });
          const now = new Date();
          if (syncStatus) syncStatus.textContent = "Last sync: " + now.toLocaleString(); // Check syncStatus
          await storage.set(browser.storage.local, "lastSync", now.getTime());
          showMessage(dom.messageArea, 'Background sync triggered.', false); 
        }
      } catch (error) { 
        console.error("Manual sync failed:", error);
        showMessage(dom.messageArea, `Sync failed: ${error.message || 'Unknown error'}`, true);
      } finally {
        const duration = Date.now() - startTime;
        const minAnimationTime = 500; 

        if (syncIcon) {
          if (duration < minAnimationTime) {
            setTimeout(() => syncIcon.classList.remove('syncing-icon'), minAnimationTime - duration);
          } else {
            syncIcon.classList.remove('syncing-icon'); 
          }
        }
        manualSyncBtn.disabled = false; 
      }
    });
  }

  if (syncIntervalInput) {
    // Load saved value for syncIntervalInput
    storage.get(browser.storage.local, "syncInterval", 5).then((val) => {
      syncIntervalInput.value = val;
    });
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
  }

  // Show last sync time - Moved inside DOMContentLoaded
  if (syncStatus) { 
    storage.get(browser.storage.local, "lastSync", null).then((ts) => {
      if (ts)
        syncStatus.textContent = "Last sync: " + new Date(ts).toLocaleString();
    });
  }
  // --- Advanced Timing Settings ---
  // Logic moved to ui/options/options-advanced-timing.js

  if (isAndroidPlatformGlobal) {
    const container = document.querySelector(".container");
    showAndroidBanner(
      'Note: On Firefox for Android, background processing is not available. Open this page and tap "Sync Now" to process new tabs or changes.'
    ); // Corrected argument passing
    setLastSyncTimeUI(container, Date.now()); // Use UI function
    showDebugInfoUI(container, currentState);      // Use UI function

  }

  // Setup and load advanced timing settings
  setupAdvancedTiming();

  // Listen for messages from the background script indicating data changes
  browser.runtime.onMessage.addListener(async (message) => { // Make listener async
    if (message.action === "syncDataChanged") {
      console.log("Options page received syncDataChanged message, reloading state...");
      await loadState(); // Reload the state to update the UI

      // After state is loaded, explicitly update the sync status display
      // from the potentially updated 'lastSync' value in local storage.
      const ts = await storage.get(browser.storage.local, "lastSync", null);
      if (ts && syncStatus) { // Ensure syncStatus element exists
        syncStatus.textContent = "Last sync: " + new Date(ts).toLocaleString();
      }
    }
  });

  loadState(); // Load initial state after setting up listeners
  } catch (error) {
    console.error("CRITICAL ERROR during options DOMContentLoaded:", error);
    // Optionally, try to display a very basic error message if possible
  }
});

async function loadState() {
  if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, true);
  clearMessage(dom.messageArea);
  try {
    let state = await getUnifiedState(isAndroidPlatformGlobal);
    if (isAndroidPlatformGlobal) {
      await processIncomingTabsAndroid(state);
      const container = document.querySelector(".container");
      setLastSyncTimeUI(container, Date.now()); // Call UI function
      showDebugInfoUI(container, state);      // Call UI function
    }
    currentState = state;
    if (!currentState || currentState.error) {
      throw new Error(
        currentState?.error || "Failed to load state." // Simplified error
      );
    }
    renderAll();
  } catch (error) {
    console.error("!!! ERROR IN loadState:", error); // Log the error object itself
    if (error && error.stack) {
      console.error("!!! Stack Trace:", error.stack); // Log the stack trace if available
    }
    if (dom.messageArea) showMessage(dom.messageArea, STRINGS.loadingSettingsError(error.message), true);
    if (dom.definedGroupsListDiv) dom.definedGroupsListDiv.textContent = STRINGS.loadingGroups;
    if (dom.deviceRegistryListDiv) dom.deviceRegistryListDiv.textContent = STRINGS.loadingRegistry;
  } finally {
    if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, false);
  }
}

function renderAll() {
  if (!currentState) return;
  renderDeviceRegistry();
  renderDefinedGroups();
}

function renderDeviceRegistry() {
  if (!dom.deviceRegistryListDiv) return;
  // Call the UI rendering function from options-ui.js
  renderDeviceRegistryUI(
    dom.deviceRegistryListDiv,
    currentState,
    { // Pass handlers
      startRenameDevice,
      handleRemoveSelfDevice,
      handleDeleteDevice,
    }
  );
}

function renderDefinedGroups() {
  if (!dom.definedGroupsListDiv) return;
  // Call the UI rendering function from options-ui.js
  renderGroupListUI(
    dom.definedGroupsListDiv,
    currentState.definedGroups,
    currentState.subscriptions,
    { // Pass handlers as an object
      handleSubscribe,
      handleUnsubscribe,
      handleDeleteGroup,
      startRenameGroup,
    }
  );
}

function ensureDeviceRegistryUl() {
  if (!dom.deviceRegistryListDiv) return null; // Guard clause
  let ul = dom.deviceRegistryListDiv.querySelector('#device-registry-list-ul');
  if (!ul) {
    ul = document.createElement('ul');
    ul.id = 'device-registry-list-ul';
    ul.setAttribute('role', 'list');
    dom.deviceRegistryListDiv.appendChild(ul);
  }
  // Clear "no devices" message if it exists
  if (dom.deviceRegistryListDiv.textContent === STRINGS.noDevices) {
    dom.deviceRegistryListDiv.textContent = '';
    dom.deviceRegistryListDiv.appendChild(ul);
  }
  return ul;
}
function ensureGroupsListUl() {
  if (!dom.definedGroupsListDiv) return null; // Guard clause
  let ul = dom.definedGroupsListDiv.querySelector('#defined-groups-list-ul');
  if (!ul) {
    ul = document.createElement('ul');
    ul.id = 'defined-groups-list-ul';
    ul.setAttribute('role', 'list');
    dom.definedGroupsListDiv.appendChild(ul);
  }
  // Clear "no groups" message if it exists
  if (dom.definedGroupsListDiv.textContent === STRINGS.noGroups) {
    dom.definedGroupsListDiv.textContent = '';
    dom.definedGroupsListDiv.appendChild(ul);
  }
  return ul;
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
    cancelInlineEditUI(nameSpan, inlineControls.element);
  };

  // Create the inline controls using the UI function
  const inlineControls = createInlineEditControlsUI(oldName, onSave, onCancel);

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
    cancelInlineEditUI(nameSpan, inlineControlsContainer);
    return;
  }

  if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, true);
  let success = false;
  try {
    let response;
    if (isAndroidPlatformGlobal) {
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
        // Targeted DOM update for rename
        const groupLi = dom.definedGroupsListDiv.querySelector(`li[data-group-name="${oldName}"]`);
        if (groupLi) {
          groupLi.dataset.groupName = newName;
          const groupNameSpan = groupLi.querySelector('.group-name-label');
          if (groupNameSpan) groupNameSpan.textContent = newName;
          // Re-attach rename handler to the updated span
          if (groupNameSpan) groupNameSpan.onclick = () => startRenameGroup(newName, groupNameSpan);
        }
      }
      cancelInlineEditUI(nameSpan, inlineControlsContainer); // Ensure edit controls are removed
    } else {
      showMessage(dom.messageArea, response.message || STRINGS.groupRenameFailed, true);
      // Explicitly cancel edit UI on failure
      cancelInlineEditUI(nameSpan, inlineControlsContainer);
    }
  } catch (e) {
    if (dom.messageArea) showMessage(dom.messageArea, STRINGS.groupRenameFailed + ": " + e.message, true);
    // Explicitly cancel edit UI on error
    cancelInlineEditUI(nameSpan, inlineControlsContainer);
  } finally {
    if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, false);
    if (!success) { // If not successful, ensure original span is visible
      nameSpan.style.display = '';
    }
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
    cancelInlineEditUI(nameSpan, inlineControls.element);
  };

  // Create the inline controls using the UI function
  const inlineControls = createInlineEditControlsUI(oldName, onSave, onCancel);

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
    cancelInlineEditUI(nameSpan, inlineControlsContainer);
    return;
  }

  // Optional: Remove confirmation
  // if (!confirm(STRINGS.confirmRenameDevice(newName))) {
  //     cancelInlineEditUI(nameSpan, inlineControlsContainer);
  //     return;
  // }

  if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, true);
  let success = false;
  try {
    let response = await renameDeviceUnified(deviceId, newName, isAndroidPlatformGlobal);

    if (response.success) {
      showMessage(dom.messageArea, STRINGS.deviceRenameSuccess(newName), false);
      success = true;
      // Update local state and re-render
      if (currentState && currentState.deviceRegistry[deviceId]) {
        currentState.deviceRegistry[deviceId].name = newName;
        if (deviceId === currentState.instanceId) {
          currentState.instanceName = newName; // Update local name cache if it's this device
        }
        // Targeted DOM update for device rename
        const deviceLi = dom.deviceRegistryListDiv.querySelector(`li[data-device-id="${deviceId}"]`);
        if (deviceLi) {
          const deviceNameSpan = deviceLi.querySelector('.device-name-label');
          if (deviceNameSpan) {
            // Clear existing content (e.g., <strong> and text node)
            deviceNameSpan.textContent = '';
            if (deviceId === currentState.instanceId) {
              const strong = document.createElement('strong');
              strong.textContent = newName;
              deviceNameSpan.appendChild(strong);
              deviceNameSpan.appendChild(document.createTextNode(' (This Device)'));
            } else {
              deviceNameSpan.textContent = newName;
            }
            // Re-attach rename handler to the updated span
            deviceNameSpan.onclick = () => startRenameDevice(deviceId, newName, deviceLi, deviceNameSpan);
          }
        }
      }
      cancelInlineEditUI(nameSpan, inlineControlsContainer); // Ensure edit controls are removed
    } else {
      showMessage(dom.messageArea, response.message || STRINGS.deviceRenameFailed, true);
      if (dom.messageArea) cancelInlineEditUI(nameSpan, inlineControlsContainer); // Clean up on failure
    }
  } catch (e) {
    if (dom.messageArea) showMessage(dom.messageArea, STRINGS.deviceRenameFailed + ": " + e.message, true);
    cancelInlineEditUI(nameSpan, inlineControlsContainer); // Clean up on error
  } finally {
    if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, false);
    if (!success) { // If not successful, ensure original span is visible
      nameSpan.style.display = '';
    }
  }
}

async function handleDeleteDevice(deviceId, deviceName) {
  if (!confirm(STRINGS.confirmDeleteDevice(deviceName))) {
    return;
  }
  if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, true);
  try {
    let response;
    if (isAndroidPlatformGlobal) {
      response = await deleteDeviceDirect(deviceId);
    } else {
      response = await browser.runtime.sendMessage({
        action: "deleteDevice",
        deviceId,
      });
    }
    if (response.success) {
      if (dom.messageArea) showMessage(dom.messageArea, STRINGS.deviceDeleteSuccess(deviceName), false);
      // Update local state and re-render
      if (currentState && currentState.deviceRegistry[deviceId]) {
        delete currentState.deviceRegistry[deviceId];
        // Targeted DOM update for deleting a device
        const deviceLi = dom.deviceRegistryListDiv.querySelector(`li[data-device-id="${deviceId}"]`);
        if (deviceLi) {
          deviceLi.remove();
        }
        if (dom.deviceRegistryListDiv && Object.keys(currentState.deviceRegistry).length === 0) {
          ensureDeviceRegistryUl().parentElement.textContent = STRINGS.noDevices;
        }
      }
    } else {
      if (dom.messageArea) {
        showMessage(dom.messageArea,
          response.message || STRINGS.deviceDeleteFailed,
          true
        );
      }
    }
  } catch (e) {
    if (dom.messageArea) showMessage(dom.messageArea, STRINGS.deviceDeleteFailed + ": " + e.message, true);
  } finally {
    if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, false);
  }
}

// --- UI Interaction Handlers ---

if (dom.newGroupNameInput && dom.createGroupBtn) {
  dom.newGroupNameInput.addEventListener(
    "input",
    debounce((e) => {
      const value = e.target.value.trim();
      dom.createGroupBtn.disabled = value.length === 0;
    }, 250) // Standard debounce delay
  );
  dom.createGroupBtn.addEventListener("click", async () => {
    const groupName = dom.newGroupNameInput.value.trim();
    if (groupName === "") return;
    if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, true);
    clearMessage(dom.messageArea);
    try {
      let response;
      if (isAndroidPlatformGlobal) {
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

          // Targeted DOM update for adding a group
          const ul = ensureGroupsListUl();
          if (ul) { // Check if ul was successfully created/found
            const isSubscribed = currentState.subscriptions.includes(response.newGroup);
            const newLi = createGroupListItemUI(response.newGroup, isSubscribed, {
              handleSubscribe,
              handleUnsubscribe,
              handleDeleteGroup,
              startRenameGroup,
            });
            ul.appendChild(newLi);
            if (dom.definedGroupsListDiv && ul.children.length === 1 && dom.definedGroupsListDiv.textContent === STRINGS.noGroups) {
              dom.definedGroupsListDiv.textContent = '';
              dom.definedGroupsListDiv.appendChild(ul);
            }
          }
        }
        if (dom.messageArea) showMessage(dom.messageArea, STRINGS.groupCreateSuccess(response.newGroup), false);
        dom.newGroupNameInput.value = "";
        dom.createGroupBtn.disabled = true;
      } else {
        if (dom.messageArea) showMessage(dom.messageArea, response.message || STRINGS.groupCreateFailed, true);
      }
    } catch (error) {
      if (dom.messageArea) showMessage(dom.messageArea, STRINGS.groupCreateFailed + ": " + error.message, true);
    } finally {
      if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, false);
    }
  });
}

async function handleSubscribe(event) {
  const groupName = event.target.dataset.group;
  if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, true);
  clearMessage(dom.messageArea);
  try {
    // Check MAX_DEVICES_PER_GROUP before attempting to subscribe
    const allSubscriptionsSync = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, {});
    let currentSubscribersToGroup = 0;
    for (const deviceId in allSubscriptionsSync) {
        if (allSubscriptionsSync[deviceId] && allSubscriptionsSync[deviceId].includes(groupName)) {
            currentSubscribersToGroup++;
        }
    }

    if (currentSubscribersToGroup >= MAX_DEVICES_PER_GROUP && !isAndroidPlatformGlobal) { // Check only for non-Android, Android direct call handles it
        if (dom.messageArea) showMessage(dom.messageArea, `Group "${groupName}" is full. Cannot subscribe.`, true);
        if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, false);
        return;
    }
    let response = await subscribeToGroupUnified(groupName, isAndroidPlatformGlobal);
    if (response.success) {
      // Update local state and re-render
      if (currentState && !currentState.subscriptions.includes(response.subscribedGroup)) {
        currentState.subscriptions.push(response.subscribedGroup);
        currentState.subscriptions.sort();
        if (dom.messageArea) showMessage(dom.messageArea, `Subscribed to "${response.subscribedGroup}".`, false);

        // Targeted DOM update for subscription button
        const groupLi = dom.definedGroupsListDiv.querySelector(`li[data-group-name="${response.subscribedGroup}"]`);
        if (groupLi) {
          const subBtn = groupLi.querySelector('button:not(.danger)'); // Get the subscribe/unsubscribe button
          if (subBtn) {
            subBtn.textContent = "Unsubscribe";
            subBtn.className = 'secondary';
            subBtn.onclick = handleUnsubscribe; // Change listener
          }
        }
      }
    } else {
      if (dom.messageArea) showMessage(dom.messageArea, response.message || "Failed to subscribe.", true);
    }
  } catch (error) {
    if (dom.messageArea) showMessage(dom.messageArea, `Error subscribing: ${error.message}`, true);
  } finally {
    if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, false);
  }
}

async function handleUnsubscribe(event) {
  const groupName = event.target.dataset.group;
  if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, true);
  clearMessage(dom.messageArea);
  try {
    let response = await unsubscribeFromGroupUnified(groupName, isAndroidPlatformGlobal);
    if (response.success) {
      // Update local state and re-render
      if (currentState) {
        currentState.subscriptions = currentState.subscriptions.filter(g => g !== response.unsubscribedGroup);
        if (dom.messageArea) showMessage(dom.messageArea, `Unsubscribed from "${response.unsubscribedGroup}".`, false);

        // Targeted DOM update for subscription button
        const groupLi = dom.definedGroupsListDiv.querySelector(`li[data-group-name="${response.unsubscribedGroup}"]`);
        if (groupLi) {
          const subBtn = groupLi.querySelector('button:not(.danger)'); // Get the subscribe/unsubscribe button
          if (subBtn) {
            subBtn.textContent = "Subscribe";
            subBtn.className = 'primary';
            subBtn.onclick = handleSubscribe; // Change listener
          }
        }
      }
    } else {
      if (dom.messageArea) showMessage(dom.messageArea, response.message || "Failed to unsubscribe.", true);
    }
  } catch (error) {
    if (dom.messageArea) showMessage(dom.messageArea, `Error unsubscribing: ${error.message}`, true);
  } finally {
    if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, false);
  }
}

async function handleDeleteGroup(event) {
  const groupName = event.target.dataset.group;
  if (!confirm(STRINGS.confirmDeleteGroup(groupName))) {
    return;
  }
  if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, true);
  clearMessage(dom.messageArea);
  try {
    let response;
    if (isAndroidPlatformGlobal) {
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
        // Targeted DOM update for deleting a group
        const groupLi = dom.definedGroupsListDiv.querySelector(`li[data-group-name="${response.deletedGroup}"]`);
        if (groupLi) {
          groupLi.remove();
        }
        if (dom.definedGroupsListDiv && currentState.definedGroups.length === 0) {
          dom.definedGroupsListDiv.textContent = STRINGS.noGroups;
        }
      }
      if (dom.messageArea) showMessage(dom.messageArea, STRINGS.groupDeleteSuccess(response.deletedGroup), false);
    } else {
      if (dom.messageArea) showMessage(dom.messageArea, response.message || STRINGS.groupDeleteFailed, true);
    }
  } catch (error) {
    if (dom.messageArea) showMessage(dom.messageArea, STRINGS.groupDeleteFailed + ": " + error.message, true);
  } finally {
    if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, false);
  }
}

// Handler specifically for the "Remove" button next to the current device
async function handleRemoveSelfDevice() {
  if (
    !confirm(
      "Are you sure you want to remove THIS device from all groups and the registry? This cannot be undone."
    )
  )
    return;

  if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, true);
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
      if (dom.messageArea) showMessage(dom.messageArea, "This device removed from all groups and registry.", false);
      // Update local state and re-render
      if (currentState && currentState.deviceRegistry[instanceId]) {
        delete currentState.deviceRegistry[instanceId];
        // Targeted DOM update for removing self
        const deviceLi = dom.deviceRegistryListDiv.querySelector(`li[data-device-id="${instanceId}"]`);
        if (deviceLi) {
          deviceLi.remove();
        }
        if (dom.deviceRegistryListDiv && Object.keys(currentState.deviceRegistry).length === 0) {
         ensureDeviceRegistryUl().parentElement.textContent = STRINGS.noDevices;
        }
      }
    } else {
      if (dom.messageArea) showMessage(dom.messageArea, res.message || "Failed to remove this device.", true);
    }
  } catch (e) {
    if (dom.messageArea) showMessage(dom.messageArea, "Error removing this device: " + e.message, true);
  } finally {
    if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, false);
  }
}
