console.log(`${new Date().toISOString()} Options: [[[ OPTIONS.JS TOP LEVEL EXECUTION POINT ]]]`);
import { STRINGS, SYNC_STORAGE_KEYS, LOCAL_STORAGE_KEYS } from "../../common/constants.js";
import { isAndroid } from "../../core/platform.js";
import {
  createGroupUnified,
  deleteGroupUnified,
  renameGroupUnified,
  subscribeToGroupUnified,
  unsubscribeFromGroupUnified,
  getUnifiedState,
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
  renderGroupListUI,
  createInlineEditControlsUI,
  cancelInlineEditUI,
  setLastSyncTimeUI,
  showDebugInfoUI,
  displaySyncRequirementBanner,
} from "./options-ui.js";
import { setupOnboarding } from "./options-onboarding.js";
import { setupAdvancedTiming } from "./options-advanced-timing.js";

const dom = {
  definedGroupsListDiv: null,
  newGroupNameInput: null,
  createGroupBtn: null,
  loadingIndicator: null,
  messageArea: null,
  manualSyncBtn: null,
  syncIntervalInput: null,
  syncStatus: null,
};
let currentState = null;
let isAndroidPlatformGlobal = false;
let isLoadingState = false; // Flag to prevent re-entrant loadState calls


document.addEventListener("DOMContentLoaded", async () => {
  console.log(`${new Date().toISOString()} Options: [DOMContentLoaded] START`);
  try {
    isAndroidPlatformGlobal = await isAndroid();

    console.log(`${new Date().toISOString()} Options:DOMContentLoaded - Platform isAndroid: ${isAndroidPlatformGlobal}`);
    const mainOptionsContainer = document.querySelector('.container');
    if (mainOptionsContainer) {
      await displaySyncRequirementBanner(mainOptionsContainer, storage);
    }
    injectSharedUI();
    applyThemeFromStorage();
    setupThemeDropdown("darkModeSelect");
    setupOnboarding();
    dom.manualSyncBtn = document.getElementById("manualSyncBtn");
    dom.syncIntervalInput = document.getElementById("syncIntervalInput");
    dom.syncStatus = document.getElementById("syncStatus");
    dom.definedGroupsListDiv = document.getElementById("definedGroupsList");
    dom.newGroupNameInput = document.getElementById("newGroupName");
    dom.createGroupBtn = document.getElementById("createGroupBtn");
    dom.loadingIndicator = document.getElementById("loadingIndicator");
    dom.messageArea = document.getElementById("messageArea");
    if (dom.manualSyncBtn) {
      dom.manualSyncBtn.addEventListener("click", async () => {
        console.log(`${new Date().toISOString()} Options: Manual Sync button clicked.`);
        const syncIcon = dom.manualSyncBtn.querySelector('.sync-icon-svg');
        const startTime = Date.now();
        dom.manualSyncBtn.disabled = true;
        if (syncIcon) syncIcon.classList.add('syncing-icon');
        clearMessage(dom.messageArea);
        try {
          if (isAndroidPlatformGlobal) {
            console.log(`${new Date().toISOString()} Options: Manual Sync - Android platform, calling loadState.`);
            await loadState();
            // Explicitly update UI from the recorded time
            const ts = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.LAST_SYNC_TIME, null);
            if (ts && dom.syncStatus) dom.syncStatus.textContent = "Last sync: " + new Date(ts).toLocaleString();
            showMessage(dom.messageArea, STRINGS.syncComplete, false);
          } else {
            console.log(`${new Date().toISOString()} Options: Manual Sync - Desktop platform, sending heartbeat message.`);
            await browser.runtime.sendMessage({ action: "heartbeat" });
            // The background script's heartbeat handler will call recordSuccessfulSyncTime.
            // The specificSyncDataChanged listener (or a direct fetch here) will update the UI.
            const ts = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.LAST_SYNC_TIME, null);
            if (ts && dom.syncStatus) dom.syncStatus.textContent = "Last sync: " + new Date(ts).toLocaleString();
            showMessage(dom.messageArea, STRINGS.backgroundSyncTriggered, false);
          }
        } catch (error) {
          console.error(`${new Date().toISOString()} Options: Manual sync failed:`, error);
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
        console.log(`${new Date().toISOString()} Options: Initial syncInterval loaded: ${val}`);
        dom.syncIntervalInput.value = val;
      });
      dom.syncIntervalInput.addEventListener("change", async (e) => {
        let val = parseInt(e.target.value, 10);
        console.log(`${new Date().toISOString()} Options: syncIntervalInput changed. Raw value: ${e.target.value}, Parsed: ${val}`);
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
          console.log(`${new Date().toISOString()} Options: newGroupNameInput debounced input event.`);
          const value = e.target.value.trim();
          dom.createGroupBtn.disabled = value.length === 0;
        }, 250)
      );
      dom.createGroupBtn.addEventListener("click", async () => {
        console.log(`${new Date().toISOString()} Options: Create Group button clicked.`);
        const groupName = dom.newGroupNameInput.value.trim();
        if (groupName === "") return;
        if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, true);
        clearMessage(dom.messageArea);
        try {
          const response = await createGroupUnified(groupName, isAndroidPlatformGlobal);
          if (response.success) {
            console.log(`${new Date().toISOString()} Options: Group "${response.newGroup}" created successfully.`);
            if (currentState && !currentState.definedGroups.includes(response.newGroup)) {
              currentState.definedGroups.push(response.newGroup);
              renderDefinedGroups(); // Re-render from state
            }
            if (dom.messageArea) showMessage(dom.messageArea, STRINGS.groupCreateSuccess(response.newGroup), false);
            dom.newGroupNameInput.value = "";
            dom.createGroupBtn.disabled = true;
          } else {
            console.warn(`${new Date().toISOString()} Options: Failed to create group. Message: ${response.message}`);
            if (dom.messageArea) showMessage(dom.messageArea, response.message || STRINGS.groupCreateFailed, true);
          }
        } catch (error) {
          console.error(`${new Date().toISOString()} Options: Error creating group:`, error);
          if (dom.messageArea) showMessage(dom.messageArea, `${STRINGS.groupCreateFailed}: ${error.message || 'Unknown error'}`, true);
        } finally {
          if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, false);
        }
      });
    }
    if (dom.syncStatus) {
      storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.LAST_SYNC_TIME, null).then((ts) => {
        console.log(`${new Date().toISOString()} Options: Initial lastSyncTime loaded: ${ts ? new Date(ts).toLocaleString() : 'Never'}`);
        if (ts && dom.syncStatus) dom.syncStatus.textContent = "Last sync: " + new Date(ts).toLocaleString();
      });
    }

    if (isAndroidPlatformGlobal) {
      const container = document.querySelector(".container");
      if (container) {
        showAndroidBanner(container,
          STRINGS.androidBanner);
      }
      setLastSyncTimeUI(container, Date.now());
      showDebugInfoUI(container, currentState);
    }
    setupAdvancedTiming();
    browser.runtime.onMessage.addListener(async (message) => {
      if (message.action === "specificSyncDataChanged" && message.changedItems) {
        console.log(`${new Date().toISOString()} Options: Received specificSyncDataChanged message. Items:`, message.changedItems);
        if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, true);
        clearMessage(dom.messageArea);
        try {
          if (!currentState && !isLoadingState) { // If no state and not already loading, do a full load
            console.log(`${new Date().toISOString()} Options:specificSyncDataChanged - No current state and not loading, performing full loadState.`);
            await loadState();
          } else if (currentState) { // Only proceed with incremental if currentState is populated
            if (message.changedItems.includes("definedGroupsChanged")) {
              console.log(`${new Date().toISOString()} Options:specificSyncDataChanged - Handling definedGroupsChanged.`);
              currentState.definedGroups = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.DEFINED_GROUPS, []);
              currentState.definedGroups.sort();
              renderDefinedGroups();
            }
            if (message.changedItems.includes("subscriptionsChanged")) {
              console.log(`${new Date().toISOString()} Options:specificSyncDataChanged - Handling subscriptionsChanged.`);
              const deviceSubscriptions = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, {});
              console.log(`${new Date().toISOString()} Options:specificSyncDataChanged - Derived device subscriptions:`, deviceSubscriptions);
              currentState.subscriptions = deviceSubscriptions.sort();
              renderDefinedGroups();
            }
          } else {
            console.log(`${new Date().toISOString()} Options:specificSyncDataChanged - currentState is null and isLoadingState is true. Skipping incremental update.`);
          }
          const ts = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.LAST_SYNC_TIME, null);
          if (ts && dom.syncStatus) {
            dom.syncStatus.textContent = "Last sync: " + new Date(ts).toLocaleString();
          }
        } catch (e) {
          console.error(`${new Date().toISOString()} Options: Error processing specificSyncDataChanged message:`, e);
          if (dom.messageArea) showMessage(dom.messageArea, STRINGS.errorUpdatingUIAfterSync, true);
        } finally {
          if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, false);
        }
      }
    });
    loadState();
  } catch (error) {
    console.error(`${new Date().toISOString()} Options: CRITICAL ERROR during DOMContentLoaded:`, error);
    const msgArea = document.getElementById("messageArea");
    if (msgArea) msgArea.textContent = `Error initializing options: ${error.message}. Please reload.`;
  }
});

async function loadState() {
  if (isLoadingState) {
    console.log(`${new Date().toISOString()} Options:loadState - SKIPPED, already in progress.`);
    return;
  }
  isLoadingState = true;
  console.log(`${new Date().toISOString()} Options:loadState - START. isLoadingState set to true.`);
  if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, true);
  clearMessage(dom.messageArea);
  try {
    console.log(`${new Date().toISOString()} Options:loadState - Attempting to get unified state...`);
    let state = await getUnifiedState(isAndroidPlatformGlobal);
    if (isAndroidPlatformGlobal) {
      console.log(`${new Date().toISOString()} Options:loadState - Android platform, processing incoming tabs with state:`, JSON.stringify(state));
      await processIncomingTabsAndroid(state);
      const container = document.querySelector(".container");
      setLastSyncTimeUI(container, Date.now());
      showDebugInfoUI(container, state);
    }
    currentState = state;
    if (!currentState || currentState.error) {
      console.error(`${new Date().toISOString()} Options:loadState - Error in received state: ${currentState?.error}`);
      throw new Error(
        currentState?.error || "Failed to load state."
      );
    }
    renderAll();
    console.log(`${new Date().toISOString()} Options:loadState - renderAll completed.`);
  } catch (error) {
    console.error(`${new Date().toISOString()} Options:loadState - !!! ERROR:`, error);
    if (error && error.stack) {
      console.error(`${new Date().toISOString()} Options:loadState - !!! Stack Trace:`, error.stack);
    }
    if (dom.messageArea) showMessage(dom.messageArea, STRINGS.loadingSettingsError(error.message), true);
    if (dom.definedGroupsListDiv) dom.definedGroupsListDiv.textContent = STRINGS.loadingGroups;
  } finally {
    if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, false);
    isLoadingState = false;
    console.log(`${new Date().toISOString()} Options:loadState - END. isLoadingState set to false.`);
  }
}

function renderAll() {
  if (!currentState) return;
  try {
    console.log(`${new Date().toISOString()} Options:renderAll - Rendering defined groups...`);
    renderDefinedGroups();
  } catch (error) {
    console.error(`${new Date().toISOString()} Options:renderAll - !!! ERROR:`, error);
    if (error && error.stack) {
      console.error(`${new Date().toISOString()} Options:renderAll - !!! Stack Trace:`, error.stack);
    }
    if (dom.messageArea) showMessage(dom.messageArea, STRINGS.errorUpdatingUIAfterSync, true);
  }
}

function renderDefinedGroups() {
  console.log(`${new Date().toISOString()} Options:renderDefinedGroups - START.`);
  if (!dom.definedGroupsListDiv) return;
  if (!currentState) {
    console.warn(`${new Date().toISOString()} Options:renderDefinedGroups - currentState is null, skipping render.`);
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
  console.log(`${new Date().toISOString()} Options:startRenameGroup - Called for group: "${oldName}"`);
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
  console.log(`${new Date().toISOString()} Options:finishRenameGroup - Renaming group "${oldName}" to "${newName}"`);
  newName = newName.trim();
  if (!newName || newName === oldName) {
    cancelInlineEditUI(nameSpan, inlineControlsContainer);
    return;
  }
  if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, true);
  let success = false;
  try {
    const response = await renameGroupUnified(oldName, newName, isAndroidPlatformGlobal);
    if (response.success) {
      console.log(`${new Date().toISOString()} Options:finishRenameGroup - Success. New name: "${response.renamedGroup}"`);
      showMessage(dom.messageArea, STRINGS.groupRenameSuccess(newName), false);
      success = true;
      if (currentState) {
        currentState.definedGroups = currentState.definedGroups.map(g => g === oldName ? newName : g);
        currentState.subscriptions = currentState.subscriptions.map(s => s === oldName ? newName : s);
        renderDefinedGroups(); // Re-render the entire group list using the updated currentState
      }
      // cancelInlineEditUI will be called in the finally block
    } else {
      console.warn(`${new Date().toISOString()} Options:finishRenameGroup - Failed. Message: ${response.message}`);
      showMessage(dom.messageArea, response.message || STRINGS.groupRenameFailed, true);
      cancelInlineEditUI(nameSpan, inlineControlsContainer);
    }
  } catch (e) {
    console.error(`${new Date().toISOString()} Options:finishRenameGroup - Error:`, e);
    if (dom.messageArea) showMessage(dom.messageArea, `${STRINGS.groupRenameFailed}: ${e.message || 'Unknown error'}`, true);
    cancelInlineEditUI(nameSpan, inlineControlsContainer);
  } finally {
    if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, false);
    if (!success && nameSpan && inlineControlsContainer) { // Ensure nameSpan is visible if save failed
      nameSpan.style.display = '';
    }
    cancelInlineEditUI(nameSpan, inlineControlsContainer); // Always clean up editor
  }
}

async function handleSubscribe(event) {
  const groupName = event.target.dataset.group;
  if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, true);
  console.log(`${new Date().toISOString()} Options:handleSubscribe - Subscribing to group: "${groupName}"`);
  clearMessage(dom.messageArea);
  try {
    // SYNC_STORAGE_KEYS.SUBSCRIPTIONS is { groupName: [deviceId] }
    const allSyncSubscriptions = await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.SUBSCRIPTIONS, {});
    // Check the length of the array for the specific group
    const currentSubscribersToGroup = allSyncSubscriptions[groupName] ? allSyncSubscriptions[groupName].length : 0;

    if (currentSubscribersToGroup >= MAX_DEVICES_PER_GROUP && !isAndroidPlatformGlobal) {
      if (dom.messageArea) showMessage(dom.messageArea, STRINGS.groupFullCannotSubscribe(groupName), true);
      console.warn(`${new Date().toISOString()} Options:handleSubscribe - Group "${groupName}" is full.`);
      if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, false);
      return;
    }
    let response = await subscribeToGroupUnified(groupName, isAndroidPlatformGlobal);
    if (response.success) {
      if (currentState && !currentState.subscriptions.includes(response.subscribedGroup)) {
        console.log(`${new Date().toISOString()} Options:handleSubscribe - Success. Subscribed to: "${response.subscribedGroup}"`);
        currentState.subscriptions.push(response.subscribedGroup);
        if (dom.messageArea) showMessage(dom.messageArea, STRINGS.subscribedToGroup(response.subscribedGroup), false);
        renderDefinedGroups(); // Re-render from state
      }
    } else {
      if (dom.messageArea) showMessage(dom.messageArea, response.message || STRINGS.failedToSubscribe, true);
    }
  } catch (error) {
    console.error(`${new Date().toISOString()} Options:handleSubscribe - Error:`, error);
    if (dom.messageArea) showMessage(dom.messageArea, STRINGS.errorSubscribing(error.message || 'Unknown error'), true);
  } finally {
    if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, false);
  }
}

async function handleUnsubscribe(event) {
  const groupName = event.target.dataset.group;
  if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, true);
  console.log(`${new Date().toISOString()} Options:handleUnsubscribe - Unsubscribing from group: "${groupName}"`);
  clearMessage(dom.messageArea);
  try {
    let response = await unsubscribeFromGroupUnified(groupName, isAndroidPlatformGlobal);
    if (response.success) {
      if (currentState) {
        console.log(`${new Date().toISOString()} Options:handleUnsubscribe - Success. Unsubscribed from: "${response.unsubscribedGroup}"`);
        currentState.subscriptions = currentState.subscriptions.filter(g => g !== response.unsubscribedGroup);
        if (dom.messageArea) showMessage(dom.messageArea, STRINGS.unsubscribedFromGroup(response.unsubscribedGroup), false);
        renderDefinedGroups(); // Re-render from state
      }
    } else {
      console.warn(`${new Date().toISOString()} Options:handleUnsubscribe - Failed. Message: ${response.message}`);
      if (dom.messageArea) showMessage(dom.messageArea, response.message || STRINGS.failedToUnsubscribe, true);
    }
  } catch (error) {
    console.error(`${new Date().toISOString()} Options:handleUnsubscribe - Error:`, error);
    if (dom.messageArea) showMessage(dom.messageArea, STRINGS.errorUnsubscribing(error.message || 'Unknown error'), true);
  } finally {
    if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, false);
  }
}

async function handleDeleteGroup(event) {
  const groupName = event.target.dataset.group;
  console.log(`${new Date().toISOString()} Options:handleDeleteGroup - Deleting group: "${groupName}"`);
  if (!confirm(STRINGS.confirmDeleteGroup(groupName))) {
    return;
  }
  if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, true);
  clearMessage(dom.messageArea);
  try {
    const response = await deleteGroupUnified(groupName, isAndroidPlatformGlobal);
    if (response.success) {
      if (currentState) {
        console.log(`${new Date().toISOString()} Options:handleDeleteGroup - Success. Deleted: "${response.deletedGroup}"`);
        currentState.definedGroups = currentState.definedGroups.filter(g => g !== response.deletedGroup);
        currentState.subscriptions = currentState.subscriptions.filter(g => g !== response.deletedGroup);
        renderDefinedGroups(); // Re-render from state
      }
      if (dom.messageArea) showMessage(dom.messageArea, STRINGS.groupDeleteSuccess(response.deletedGroup), false);
    } else {
      console.warn(`${new Date().toISOString()} Options:handleDeleteGroup - Failed. Message: ${response.message}`);
      if (dom.messageArea) showMessage(dom.messageArea, response.message || STRINGS.groupDeleteFailed, true);
    }
  } catch (error) {
    console.error(`${new Date().toISOString()} Options:handleDeleteGroup - Error:`, error);
    if (dom.messageArea) showMessage(dom.messageArea, `${STRINGS.groupDeleteFailed}: ${error.message || 'Unknown error'}`, true);
  } finally {
    if (dom.loadingIndicator) showLoadingIndicator(dom.loadingIndicator, false);
  }
}
