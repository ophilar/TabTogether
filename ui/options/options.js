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
import { getInstanceName } from "../../core/instance.js";
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
  loadingIndicator: null,
  messageArea: null, // Will be assigned in DOMContentLoaded
  manualSyncBtn: null, // Added
  syncIntervalInput: null, // Added
  syncStatus: null, // Added
};
let currentState = null;
let isAndroidPlatformGlobal = false;


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
    setupOnboarding(); // Onboarding setup
    dom.manualSyncBtn = document.getElementById("manualSyncBtn");
    dom.syncIntervalInput = document.getElementById("syncIntervalInput");
    dom.syncStatus = document.getElementById("syncStatus");
    dom.deviceRegistryListDiv = document.getElementById("deviceRegistryList");
    dom.definedGroupsListDiv = document.getElementById("definedGroupsList");
    dom.newGroupNameInput = document.getElementById("newGroupName");
    dom.createGroupBtn = document.getElementById("createGroupBtn");
    // Note: staleDeviceThresholdInput and taskExpiryInput are handled by options-advanced-timing.js
    // and assigned there.

    dom.loadingIndicator = document.getElementById("loadingIndicator");
    dom.messageArea = document.getElementById("messageArea");
    if (dom.manualSyncBtn) {
      dom.manualSyncBtn.addEventListener("click", async () => {
        const syncIcon = dom.manualSyncBtn.querySelector('.sync-icon-svg');
        const startTime = Date.now();
        dom.manualSyncBtn.disabled = true;
        if (syncIcon) syncIcon.classList.add('syncing-icon');
        clearMessage(dom.messageArea);
        try {
          if (isAndroidPlatformGlobal) {
            await loadState();
            showMessage(dom.messageArea, STRINGS.syncComplete, false);
          } else {
            await browser.runtime.sendMessage({ action: "heartbeat" });
            const now = new Date();
            if (dom.syncStatus) dom.syncStatus.textContent = "Last sync: " + now.toLocaleString();
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
          dom.manualSyncBtn.disabled = false;
        }
      });
    }

    if (dom.syncIntervalInput) {
      storage.get(browser.storage.local, "syncInterval", 5).then((val) => {
        dom.syncIntervalInput.value = val;
      });
      dom.syncIntervalInput.addEventListener("change", async (e) => {
        let val = parseInt(e.target.value, 10);
        if (isNaN(val) || val < 1) val = 1;
        if (val > 120) val = 120;
        dom.syncIntervalInput.value = val;
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
    if (dom.syncStatus) {
      storage.get(browser.storage.local, "lastSync", null).then((ts) => {
        if (ts)
          dom.syncStatus.textContent = "Last sync: " + new Date(ts).toLocaleString();
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
      if (message.action === "specificSyncDataChanged" && message.changedItems) {
        console.log(new Date().toISOString(), "Options page received specificSyncDataChanged:", message.changedItems);
        if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, true);
        clearMessage(dom.messageArea);
        try {
          let stateChanged = false;
          if (!currentState) { // If no state, do a full load
            await loadState();
            stateChanged = true;
          } else {
            if (message.changedItems.includes("deviceRegistryChanged")) {
              console.log(new Date().toISOString(), "Handling deviceRegistryChanged...");
              currentState.deviceRegistry = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEVICE_REGISTRY, {});
              // Also refresh instanceName as it might have changed due to another device's action
              currentState.instanceName = await getInstanceName();
              renderDeviceRegistry();
              stateChanged = true;
            }
            if (message.changedItems.includes("definedGroupsChanged")) {
              console.log(new Date().toISOString(), "Handling definedGroupsChanged...");
              currentState.definedGroups = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS, []);
              currentState.definedGroups.sort();
              renderDefinedGroups(); // Assumes subscriptions are still valid or will be updated if they also changed
              stateChanged = true;
            }
            if (message.changedItems.includes("subscriptionsChanged")) {
              console.log(new Date().toISOString(), "Handling subscriptionsChanged...");
              const allSyncSubscriptions = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, {});
              const deviceSubscriptions = [];
              for (const groupName in allSyncSubscriptions) {
                if (allSyncSubscriptions[groupName] && allSyncSubscriptions[groupName].includes(currentState.instanceId)) {
                  deviceSubscriptions.push(groupName);
                }
              }
              currentState.subscriptions = deviceSubscriptions.sort();
              renderDefinedGroups(); // Re-render groups to update subscribe/unsubscribe buttons
              stateChanged = true;
            }
          }
          const ts = await storage.get(browser.storage.local, "lastSync", null);
          if (ts && dom.syncStatus) {
            dom.syncStatus.textContent = "Last sync: " + new Date(ts).toLocaleString();
          }
        } catch (e) {
          console.error("Error processing specificSyncDataChanged message:", e);
          if (dom.messageArea) showMessage(dom.messageArea, STRINGS.errorUpdatingUIAfterSync, true);
        } finally {
          if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, false);
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
  const oldName = currentState.instanceName;  // Get oldName from currentState

  if (listItem.querySelector('.inline-edit-container')) {
    return;
  }
  const onSave = (newName) => {
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
async function finishRenameDevice(newName, listItem, nameSpan, inlineControlsContainer) {
  newName = newName.trim();
  const currentDeviceName = currentState?.instanceName;
  if (!newName || newName === currentDeviceName) {
    cancelInlineEditUI(nameSpan, inlineControlsContainer);
    if (newName === currentDeviceName && dom.messageArea) clearMessage(dom.messageArea);
    return;
  }

  if (!currentState || !currentState.instanceId) {
    console.error(new Date().toISOString(), "[finishRenameDevice] Current state (instanceId) not available for renaming.");
    showMessage(dom.messageArea, "Cannot save device name: current device ID is missing.", true);
    cancelInlineEditUI(nameSpan, inlineControlsContainer); // Ensure UI is reset
    return;
  }
  const deviceId = currentState.instanceId;
  if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, true);
  let success = false;
  console.log(new Date().toISOString(), `[finishRenameDevice] START. Current deviceId: ${deviceId}, oldName (from UI): ${nameSpan.textContent.replace(' (This Device)', '').trim()}, newName: ${newName}`);
  try {
    let response = await renameDeviceUnified(newName, isAndroidPlatformGlobal);

    if (response.success) {
      console.log(new Date().toISOString(), `[finishRenameDevice] renameDeviceUnified SUCCESS. response.newName: ${response.newName}`);
      success = true;
      if (currentState) {
        currentState.instanceName = newName;
        if (currentState.deviceRegistry && currentState.deviceRegistry[deviceId]) {
          currentState.deviceRegistry[deviceId].name = newName;
        }
      }
      console.log(new Date().toISOString(), `[finishRenameDevice] currentState updated. currentState.instanceName: ${currentState?.instanceName}, currentState.deviceRegistry['${deviceId}']?.name: ${currentState?.deviceRegistry?.[deviceId]?.name}`);
      showMessage(dom.messageArea, STRINGS.deviceRenameSuccess(newName), false);
      const deviceLi = listItem
      if (deviceLi) {
        const deviceNameSpan = deviceLi.querySelector('.device-name-label');
        console.log(new Date().toISOString(), `[finishRenameDevice] Performing targeted DOM update. Setting name to: ${deviceId === currentState?.instanceId ? currentState?.instanceName : newName}`);
        if (deviceNameSpan) {
          deviceNameSpan.textContent = '';
          const strong = document.createElement('strong');
          strong.textContent = currentState.instanceName;
          deviceNameSpan.appendChild(strong);
          deviceNameSpan.appendChild(document.createTextNode(' (This Device)'));
          // Re-attach click handler. startRenameCurrentDevice will get deviceId and oldName (which is current newName) from currentState.
          if (deviceNameSpan) deviceNameSpan.onclick = () => startRenameCurrentDevice(deviceLi, deviceNameSpan);
        }
      }
    } else {
      showMessage(dom.messageArea, response.message || STRINGS.deviceRenameFailed, true);
      console.warn(new Date().toISOString(), `[finishRenameDevice] renameDeviceUnified FAILED. Message: ${response.message}`);
    }
  } catch (e) {
    if (dom.messageArea) showMessage(dom.messageArea, `${STRINGS.deviceRenameFailed}: ${e.message}`, true);
  } finally {
    cancelInlineEditUI(nameSpan, inlineControlsContainer);
    if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, false);
    if (!success) { 
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
    // SYNC_STORAGE_KEYS.SUBSCRIPTIONS is { groupName: [deviceId] }
    const allSyncSubscriptions = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, {});
    // Check the length of the array for the specific group
    const currentSubscribersToGroup = allSyncSubscriptions[groupName] ? allSyncSubscriptions[groupName].length : 0;

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
