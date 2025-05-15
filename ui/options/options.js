console.log(new Date().toISOString(), "[[[ OPTIONS.JS TOP LEVEL EXECUTION POINT ]]]");
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
import {
  injectSharedUI, showAndroidBanner,
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
let manualSyncBtn = null;
let syncIntervalInput = null;
let syncStatus = null;

let lastSuccessfulRenameInfo = { deviceId: null, newName: null, timestamp: 0 };
const RENAME_PROTECTION_WINDOW_MS = 500; // Protect for 0.5 seconds

const debouncedLoadState = debounce(async () => {
    try {
        console.log(new Date().toISOString(), "Options page received syncDataChanged message (debounced), reloading state...");
        await loadState();
        const ts = await storage.get(browser.storage.local, "lastSync", null);
        if (ts && syncStatus) {
            syncStatus.textContent = "Last sync: " + new Date(ts).toLocaleString();
        }
    } catch (e) {
        console.error("Error processing debounced syncDataChanged message:", e);
    }
}, 300);

document.addEventListener("DOMContentLoaded", async () => {
  console.log(new Date().toISOString(), "[DOMContentLoaded] START");
  try {
    isAndroidPlatformGlobal = await isAndroid();

    const mainOptionsContainer = document.querySelector('.container');
    if (mainOptionsContainer) {
      await displaySyncRequirementBanner(mainOptionsContainer, storage);
    }
    injectSharedUI();
    applyThemeFromStorage();
    setupThemeDropdown("darkModeSelect");
    setupOnboarding();
    manualSyncBtn = document.getElementById("manualSyncBtn");
    syncIntervalInput = document.getElementById("syncIntervalInput");
    syncStatus = document.getElementById("syncStatus");
    dom.deviceRegistryListDiv = document.getElementById("deviceRegistryList");
    dom.definedGroupsListDiv = document.getElementById("definedGroupsList");
    dom.newGroupNameInput = document.getElementById("newGroupName");
    dom.createGroupBtn = document.getElementById("createGroupBtn");
    // Note: staleDeviceThresholdInput and taskExpiryInput are handled by options-advanced-timing.js
    // and assigned there.

    dom.loadingIndicator = document.getElementById("loadingIndicator");
    dom.messageArea = document.getElementById("messageArea");
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
            showMessage(dom.messageArea, STRINGS.syncComplete, false);
          } else {
            await browser.runtime.sendMessage({ action: "heartbeat" });
            const now = new Date();
            if (syncStatus) syncStatus.textContent = "Last sync: " + now.toLocaleString();
            await storage.set(browser.storage.local, "lastSync", now.getTime());
            showMessage(dom.messageArea, STRINGS.backgroundSyncTriggered, false);
          }
        } catch (error) {
          console.error("Manual sync failed:", error);
          showMessage(dom.messageArea, STRINGS.manualSyncFailed(error.message || 'Unknown error'), true);
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
    
    if (dom.newGroupNameInput && dom.createGroupBtn) {
      dom.newGroupNameInput.addEventListener(
        "input",
        debounce((e) => {
          const value = e.target.value.trim();
          dom.createGroupBtn.disabled = value.length === 0;
        }, 250)
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
            if (currentState && !currentState.definedGroups.includes(response.newGroup)) {
              currentState.definedGroups.push(response.newGroup);
              currentState.definedGroups.sort();
              const ul = ensureGroupsListUl();
              if (ul) {
                const isSubscribed = currentState.subscriptions.includes(response.newGroup);
                const newLi = createGroupListItemUI(response.newGroup, isSubscribed, { handleSubscribe, handleUnsubscribe, handleDeleteGroup, startRenameGroup });
                ul.appendChild(newLi);
              }
            }
            if (dom.messageArea) showMessage(dom.messageArea, STRINGS.groupCreateSuccess(response.newGroup), false);
            dom.newGroupNameInput.value = "";
            dom.createGroupBtn.disabled = true;
          } else {
            if (dom.messageArea) showMessage(dom.messageArea, response.message || STRINGS.groupCreateFailed, true);
          }
        } catch (error) {
          if (dom.messageArea) showMessage(dom.messageArea, `${STRINGS.groupCreateFailed}: ${error.message}`, true);
        } finally {
          if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, false);
        }
      });
    }
    if (syncStatus) {
      storage.get(browser.storage.local, "lastSync", null).then((ts) => {
        if (ts)
          syncStatus.textContent = "Last sync: " + new Date(ts).toLocaleString();
      });
    }

    if (isAndroidPlatformGlobal) {
      const container = document.querySelector(".container");
      if (container) {
        showAndroidBanner(container,
          STRINGS.androidBannerOptions);
      }
      setLastSyncTimeUI(container, Date.now());
      showDebugInfoUI(container, currentState);
    }
    setupAdvancedTiming();
    browser.runtime.onMessage.addListener(async (message) => {
      if (message.action === "syncDataChanged") {
        try {
          console.log(new Date().toISOString(), "Options page received syncDataChanged message, reloading state...");
          debouncedLoadState();
          const ts = await storage.get(browser.storage.local, "lastSync", null);
          if (ts && syncStatus) {
            syncStatus.textContent = "Last sync: " + new Date(ts).toLocaleString();
          }
        } catch (e) {
          console.error("Error processing syncDataChanged message:", e);
        }
      }
    });
    loadState();
  } catch (error) {
    console.error("CRITICAL ERROR during options DOMContentLoaded:", error);
    const msgArea = document.getElementById("messageArea");
    if (msgArea) msgArea.textContent = `Error initializing options: ${error.message}. Please reload.`;
  }
});

async function loadState() {
  if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, true);
  clearMessage(dom.messageArea);
  try {
    console.log(new Date().toISOString(), `[loadState] START. Current currentState.instanceName before getUnifiedState: ${currentState?.instanceName}`);
    console.log(new Date().toISOString(), "[loadState] Attempting to get unified state...");
    let state = await getUnifiedState(isAndroidPlatformGlobal);
    if (isAndroidPlatformGlobal) {
      await processIncomingTabsAndroid(state);
      const container = document.querySelector(".container");
      setLastSyncTimeUI(container, Date.now());
      showDebugInfoUI(container, state);
    }
    console.log(new Date().toISOString(), `[loadState] Unified state received. state.instanceName: ${state?.instanceName}, state.deviceRegistry['${state?.instanceId}']?.name: ${state?.deviceRegistry?.[state?.instanceId]?.name}`);
    if (state && state.instanceId === lastSuccessfulRenameInfo.deviceId &&
      Date.now() - lastSuccessfulRenameInfo.timestamp < RENAME_PROTECTION_WINDOW_MS &&
      state.instanceName !== lastSuccessfulRenameInfo.newName) {
      console.warn(new Date().toISOString(), `[loadState] Detected recent rename. Overriding fetched instanceName ('${state.instanceName}') with last known successful rename ('${lastSuccessfulRenameInfo.newName}').`);
      state.instanceName = lastSuccessfulRenameInfo.newName;
      if (state.deviceRegistry && state.deviceRegistry[state.instanceId]) {
        state.deviceRegistry[state.instanceId].name = lastSuccessfulRenameInfo.newName;
      }
    }
    currentState = state;
    if (!currentState || currentState.error) {
      throw new Error(
        currentState?.error || "Failed to load state."
      );
    }
    console.log(new Date().toISOString(), `[loadState] currentState updated. currentState.instanceName: ${currentState?.instanceName}`);
    renderAll();
    console.log(new Date().toISOString(), "[loadState] renderAll completed.");
  } catch (error) {
    console.error("!!! ERROR IN loadState:", error);
    if (error && error.stack) {
      console.error("!!! Stack Trace:", error.stack);
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
  try {
    console.log(new Date().toISOString(), `[renderAll] START. currentState.instanceName: ${currentState?.instanceName}`);
    console.log(new Date().toISOString(), "[renderAll] Rendering device registry...");
    renderDeviceRegistry();
    console.log(new Date().toISOString(), `[renderAll] AFTER renderDeviceRegistry. currentState.instanceName: ${currentState?.instanceName}`);
    console.log(new Date().toISOString(), "[renderAll] Rendering defined groups...");
    renderDefinedGroups();
  } catch (error) {
    console.error("!!! ERROR IN renderAll:", error);
    if (error && error.stack) {
      console.error("!!! renderAll Stack Trace:", error.stack);
    }
    if (dom.messageArea) showMessage(dom.messageArea, STRINGS.errorUpdatingUIAfterSync, true);
  }
}

function renderDeviceRegistry() {
  if (!dom.deviceRegistryListDiv) return;
  if (!currentState) {
    console.warn("[renderDeviceRegistry] currentState is null, skipping render.");
    return;
  }
  renderDeviceRegistryUI(dom.deviceRegistryListDiv, currentState, { startRenameCurrentDevice: startRenameCurrentDevice, handleRemoveSelfDevice, handleDeleteDevice });
}

function renderDefinedGroups() {
  if (!dom.definedGroupsListDiv) return;
  if (!currentState) {
    console.warn("[renderDefinedGroups] currentState is null, skipping render.");
    return;
  }
  renderGroupListUI(
    dom.definedGroupsListDiv,
    currentState.definedGroups,
    currentState.subscriptions,
    {
      handleSubscribe,
      handleUnsubscribe,
      handleDeleteGroup,
      startRenameGroup,
    }
  );
}
function ensureListElement(containerDiv, ulId, noItemsString, ulClass = 'options-list') {
  if (!containerDiv) return null;
  let ul = containerDiv.querySelector(`#${ulId}`);
  if (!ul) {
    if (containerDiv.textContent.trim() === noItemsString) {
      containerDiv.textContent = '';
    }
    ul = document.createElement('ul');
    ul.id = ulId;
    ul.className = ulClass;
    ul.setAttribute('role', 'list');
    containerDiv.appendChild(ul);
  }
  return ul;
}
function startRenameGroup(oldName, nameSpan) {
  const listItem = nameSpan.closest('li');
  if (!listItem || listItem.querySelector('.inline-edit-container')) {
    return;
  }
  const onSave = (newName) => {
    finishRenameGroup(oldName, newName, nameSpan, inlineControls.element);
  };
  const onCancel = () => {
    cancelInlineEditUI(nameSpan, inlineControls.element);
  };
  const inlineControls = createInlineEditControlsUI(oldName, onSave, onCancel);
  nameSpan.style.display = 'none';
  nameSpan.parentNode.insertBefore(inlineControls.element, nameSpan.nextSibling);
  inlineControls.focusInput();
}
async function finishRenameGroup(oldName, newName, nameSpan, inlineControlsContainer) {
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
        const groupLi = dom.definedGroupsListDiv.querySelector(`li[data-group-name="${oldName}"]`);
        if (groupLi) {
          groupLi.dataset.groupName = newName;
          const groupNameSpan = groupLi.querySelector('.group-name-label');
          if (groupNameSpan) groupNameSpan.textContent = newName;
          if (groupNameSpan) groupNameSpan.onclick = () => startRenameGroup(newName, groupNameSpan);
        }
      }
      cancelInlineEditUI(nameSpan, inlineControlsContainer);
    } else {
      showMessage(dom.messageArea, response.message || STRINGS.groupRenameFailed, true);
      cancelInlineEditUI(nameSpan, inlineControlsContainer);
    }
  } catch (e) {
    if (dom.messageArea) showMessage(dom.messageArea, `${STRINGS.groupRenameFailed}: ${e.message}`, true);
    cancelInlineEditUI(nameSpan, inlineControlsContainer);
  } finally {
    if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, false);
    if (!success) {
      nameSpan.style.display = '';
    }
  }
}
function startRenameCurrentDevice(listItem, nameSpan) {
  if (!currentState || !currentState.instanceId || typeof currentState.instanceName === 'undefined') {
    console.error(new Date().toISOString(), "[startRenameCurrentDevice] Current state (instanceId/instanceName) not available for renaming.");
    showMessage(dom.messageArea, "Cannot rename device: current device information is missing.", true);
    return;
  }
  const deviceId = currentState.instanceId; // Get deviceId from currentState
  const oldName = currentState.instanceName;  // Get oldName from currentState

  if (listItem.querySelector('.inline-edit-container')) {
    return;
  }
  const onSave = (newName) => {
    // deviceId will be sourced from currentState in finishRenameDevice
    finishRenameDevice(newName, listItem, nameSpan, inlineControls.element);
  };

  const onCancel = () => {
    cancelInlineEditUI(nameSpan, inlineControls.element);
  };

  const inlineControls = createInlineEditControlsUI(oldName, onSave, onCancel);
  nameSpan.style.display = 'none';
  const nameContainer = nameSpan.parentNode;
  nameContainer.insertBefore(inlineControls.element, nameSpan.nextSibling);
  inlineControls.focusInput();
}
async function finishRenameDevice(newName, nameSpan, inlineControlsContainer) {
  newName = newName.trim();
  if (!newName) {
    cancelInlineEditUI(nameSpan, inlineControlsContainer);
    return;
  }

  if (!currentState || !currentState.instanceId) {
    console.error(new Date().toISOString(), "[finishRenameDevice] Current state (instanceId) not available for renaming.");
    showMessage(dom.messageArea, "Cannot save device name: current device ID is missing.", true);
    cancelInlineEditUI(nameSpan, inlineControlsContainer); // Ensure UI is reset
    return;
  }
  const deviceId = currentState.instanceId; // Get deviceId from currentState
  if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, true);
  let success = false;
  console.log(new Date().toISOString(), `[finishRenameDevice] START. Current deviceId: ${deviceId}, oldName (from UI): ${nameSpan.textContent.replace(' (This Device)', '').trim()}, newName: ${newName}`);
  try {
    let response = await renameDeviceUnified(newName, isAndroidPlatformGlobal); // deviceId param removed

    if (response.success) {
      console.log(new Date().toISOString(), `[finishRenameDevice] renameDeviceUnified SUCCESS. response.newName: ${response.newName}`);
      success = true;
      if (currentState) {
        if (deviceId === currentState.instanceId) {
          currentState.instanceName = newName;
        }
        if (currentState.deviceRegistry && currentState.deviceRegistry[deviceId]) {
          currentState.deviceRegistry[deviceId].name = newName;
        }
        
        lastSuccessfulRenameInfo = { deviceId, newName, timestamp: Date.now() };
        
      }
      console.log(new Date().toISOString(), `[finishRenameDevice] currentState updated. currentState.instanceName: ${currentState?.instanceName}, currentState.deviceRegistry['${deviceId}']?.name: ${currentState?.deviceRegistry?.[deviceId]?.name}`);
      showMessage(dom.messageArea, STRINGS.deviceRenameSuccess(newName), false);
      const deviceLi = dom.deviceRegistryListDiv.querySelector(`li[data-device-id="${deviceId}"]`);
      if (deviceLi) {
        const deviceNameSpan = deviceLi.querySelector('.device-name-label');
        console.log(new Date().toISOString(), `[finishRenameDevice] Performing targeted DOM update. Setting name to: ${deviceId === currentState?.instanceId ? currentState?.instanceName : newName}`);
        if (deviceNameSpan) {
          // Clear existing content (e.g., <strong> and text node)
          deviceNameSpan.textContent = '';
          const strong = document.createElement('strong');
          strong.textContent = currentState.instanceName;
          deviceNameSpan.appendChild(strong);
          deviceNameSpan.appendChild(document.createTextNode(' (This Device)'));
          // Re-attach click handler. startRenameCurrentDevice will get deviceId and oldName (which is current newName)
          // from currentState.
          if (deviceNameSpan) deviceNameSpan.onclick = () => startRenameCurrentDevice(deviceLi, deviceNameSpan);
        }
      }
    } else {
      showMessage(dom.messageArea, response.message || STRINGS.deviceRenameFailed, true);
      console.warn(new Date().toISOString(), `[finishRenameDevice] renameDeviceUnified FAILED. Message: ${response.message}`);
      if (dom.messageArea) cancelInlineEditUI(nameSpan, inlineControlsContainer);
    }
  } catch (e) {
    if (dom.messageArea) showMessage(dom.messageArea, `${STRINGS.deviceRenameFailed}: ${e.message}`, true);
    cancelInlineEditUI(nameSpan, inlineControlsContainer);
  } finally {
    cancelInlineEditUI(nameSpan, inlineControlsContainer);
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
      if (currentState && currentState.deviceRegistry[deviceId]) {
        delete currentState.deviceRegistry[deviceId];
        const deviceLi = dom.deviceRegistryListDiv.querySelector(`li[data-device-id="${deviceId}"]`);
        if (deviceLi) {
          deviceLi.remove();
        }
        if (dom.deviceRegistryListDiv && Object.keys(currentState.deviceRegistry).length === 0) {
          const ul = dom.deviceRegistryListDiv.querySelector('#device-registry-list-ul');
          if (ul) ul.remove();
          dom.deviceRegistryListDiv.textContent = STRINGS.noDevices;
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
    if (dom.messageArea) showMessage(dom.messageArea, `${STRINGS.deviceDeleteFailed}: ${e.message}`, true);
  } finally {
    if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, false);
  }
}

async function handleSubscribe(event) {
  const groupName = event.target.dataset.group;
  if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, true);
  clearMessage(dom.messageArea);
  try {
    const allSubscriptionsSync = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, {});
    let currentSubscribersToGroup = 0;
    for (const deviceId in allSubscriptionsSync) {
      if (allSubscriptionsSync[deviceId] && allSubscriptionsSync[deviceId].includes(groupName)) {
        currentSubscribersToGroup++;
      }
    }

    if (currentSubscribersToGroup >= MAX_DEVICES_PER_GROUP && !isAndroidPlatformGlobal) {
      if (dom.messageArea) showMessage(dom.messageArea, STRINGS.groupFullCannotSubscribe(groupName), true);
      if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, false);
      return;
    }
    let response = await subscribeToGroupUnified(groupName, isAndroidPlatformGlobal);
    if (response.success) {
      if (currentState && !currentState.subscriptions.includes(response.subscribedGroup)) {
        currentState.subscriptions.push(response.subscribedGroup);
        currentState.subscriptions.sort();
        if (dom.messageArea) showMessage(dom.messageArea, STRINGS.subscribedToGroup(response.subscribedGroup), false);
        const groupLi = dom.definedGroupsListDiv.querySelector(`li[data-group-name="${response.subscribedGroup}"]`);
        if (groupLi) {
          const subBtn = groupLi.querySelector('button:not(.danger)');
          if (subBtn) {
            subBtn.textContent = "Unsubscribe";
            subBtn.className = 'secondary';
            subBtn.onclick = handleUnsubscribe; // Change listener
          }
        }
      }
    } else {
      if (dom.messageArea) showMessage(dom.messageArea, response.message || STRINGS.failedToSubscribe, true);
    }
  } catch (error) {
    if (dom.messageArea) showMessage(dom.messageArea, STRINGS.errorSubscribing(error.message), true);
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
      if (currentState) {
        currentState.subscriptions = currentState.subscriptions.filter(g => g !== response.unsubscribedGroup);
        if (dom.messageArea) showMessage(dom.messageArea, STRINGS.unsubscribedFromGroup(response.unsubscribedGroup), false);
        const groupLi = dom.definedGroupsListDiv.querySelector(`li[data-group-name="${response.unsubscribedGroup}"]`);
        if (groupLi) {
          const subBtn = groupLi.querySelector('button:not(.danger)');
          if (subBtn) {
            subBtn.textContent = "Subscribe";
            subBtn.className = 'primary';
            subBtn.onclick = handleSubscribe; // Change listener
          }
        }
      }
    } else {
      if (dom.messageArea) showMessage(dom.messageArea, response.message || STRINGS.failedToUnsubscribe, true);
    }
  } catch (error) {
    if (dom.messageArea) showMessage(dom.messageArea, STRINGS.errorUnsubscribing(error.message), true);
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
      if (currentState) {
        currentState.definedGroups = currentState.definedGroups.filter(g => g !== response.deletedGroup);
        currentState.subscriptions = currentState.subscriptions.filter(g => g !== response.deletedGroup);
        const groupLi = dom.definedGroupsListDiv.querySelector(`li[data-group-name="${response.deletedGroup}"]`);
        if (groupLi) {
          groupLi.remove();
        }
        if (dom.definedGroupsListDiv && currentState.definedGroups.length === 0) {
          const ul = dom.definedGroupsListDiv.querySelector('#defined-groups-list-ul');
          if (ul) ul.remove();
          dom.definedGroupsListDiv.textContent = STRINGS.noGroups;
        }
      }
      if (dom.messageArea) showMessage(dom.messageArea, STRINGS.groupDeleteSuccess(response.deletedGroup), false);
    } else {
      if (dom.messageArea) showMessage(dom.messageArea, response.message || STRINGS.groupDeleteFailed, true);
    }
  } catch (error) {
    if (dom.messageArea) showMessage(dom.messageArea, `${STRINGS.groupDeleteFailed}: ${error.message}`, true);
  } finally {
    if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, false);
  }
}
async function handleRemoveSelfDevice() {
  if (
    !confirm(
      STRINGS.confirmRemoveSelfDevice
    )
  )
    return;
  if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, true);
  clearMessage(dom.messageArea);
  try {
    const instanceId = currentState?.instanceId;
    if (!instanceId) throw new Error(STRINGS.currentDeviceIdNotFound);
    const res = await browser.runtime.sendMessage({
      action: "deleteDevice",
      deviceId: instanceId,
    });
    if (res.success) {
      if (dom.messageArea) showMessage(dom.messageArea, STRINGS.selfDeviceRemoved, false);
      if (currentState && currentState.deviceRegistry[instanceId]) {
        delete currentState.deviceRegistry[instanceId];
        const deviceLi = dom.deviceRegistryListDiv.querySelector(`li[data-device-id="${instanceId}"]`);
        if (deviceLi) {
          deviceLi.remove();
        }
        if (dom.deviceRegistryListDiv && Object.keys(currentState.deviceRegistry).length === 0) {
          const ul = dom.deviceRegistryListDiv.querySelector('#device-registry-list-ul');
          if (ul) ul.remove();
          dom.deviceRegistryListDiv.textContent = STRINGS.noDevices;
        }
      }
    } else {
      if (dom.messageArea) showMessage(dom.messageArea, res.message || STRINGS.failedToRemoveSelfDevice, true);
    }
  } catch (e) {
    if (dom.messageArea) showMessage(dom.messageArea, STRINGS.errorRemovingSelfDevice(e.message), true);
  } finally {
    if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, false);
  }
}
