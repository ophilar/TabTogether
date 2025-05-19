import { STRINGS } from "../../common/constants.js";

/**
 * Creates a list item element for a device.
 * @param {string} deviceId - The ID of the device.
 * @param {object} deviceData - The data object for the device.
 * @param {{id: string, name: string}} localInstance - Object containing the ID and name of the current local instance.
 * @param {object} handlers - Object containing event handlers (startRenameCurrentDevice, handleRemoveSelfDevice, handleDeleteDevice).
 * @returns {HTMLLIElement} The created list item element.
 */
export function createDeviceListItemUI(deviceId, deviceData, localInstance, handlers) {
  console.log(`${new Date().toISOString()} OptionsUI:createDeviceListItemUI - START. deviceId: ${deviceId}, deviceData.name: ${deviceData?.name}, localInstance.id: ${localInstance?.id}, localInstance.name: ${localInstance?.name}`);
  const li = document.createElement('li');
  li.setAttribute('role', 'listitem');
  li.dataset.deviceId = deviceId;
  li.className = 'options-list-item'; // Use common class

  const nameAndInfoDiv = document.createElement('div');
  nameAndInfoDiv.className = 'registry-item-info';

  const nameSpan = document.createElement('span');
  nameSpan.className = 'device-name-label';

  // Determine the authoritative name for display and for the rename handler
  let nameForDisplay = deviceData.name || STRINGS.deviceNameNotSet;
  let nameForRenameHandlerStart = nameForDisplay;

  if (deviceId === localInstance.id) {
    // For "This Device", prioritize the name from local storage (passed via localInstance.name)
    nameForDisplay = localInstance.name || deviceData.name || STRINGS.deviceNameNotSet;
    nameForRenameHandlerStart = nameForDisplay; // Use this authoritative name for the rename handler too
    console.log(`${new Date().toISOString()} OptionsUI:createDeviceListItemUI - "This Device" (${deviceId}). Determined nameForDisplay: ${nameForDisplay} (from localInstance.name: ${localInstance.name}, fallback deviceData.name: ${deviceData.name})`);
  }

  if (deviceId === localInstance.id) {
    const strong = document.createElement('strong');
    strong.textContent = nameForDisplay; // Use the authoritative name
    nameSpan.appendChild(strong);
    nameSpan.appendChild(document.createTextNode(' (This Device)'));
    li.classList.add('this-device');

    // Only make the name span clickable for renaming for the CURRENT device
    nameSpan.style.cursor = 'pointer';
    nameSpan.title = `Click to rename this device: ${nameForDisplay}`;
    // Pass only the necessary DOM elements; deviceId and oldName will be sourced from currentState in options.js
    nameSpan.onclick = () => handlers.startRenameCurrentDevice(li, nameSpan);
  } else {
    nameSpan.textContent = nameForDisplay;
  }
  nameAndInfoDiv.appendChild(nameSpan);

  if (deviceData.lastSeen) {
    const lastSeenSpan = document.createElement('span');
    lastSeenSpan.className = 'small-text registry-item-lastseen';
    lastSeenSpan.textContent = `Last seen: ${new Date(deviceData.lastSeen).toLocaleString()}`;
    nameAndInfoDiv.appendChild(lastSeenSpan);
  }
  li.appendChild(nameAndInfoDiv);

  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'registry-item-actions';

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'inline-btn danger';

  if (deviceId === localInstance.id) {
    deleteBtn.textContent = 'Remove';
    deleteBtn.title = 'Remove this device from all groups and registry. This cannot be undone.';
    deleteBtn.setAttribute('aria-label', 'Remove this device from registry');
    deleteBtn.onclick = handlers.handleRemoveSelfDevice;
  } else {
    deleteBtn.textContent = 'Delete';
    deleteBtn.title = 'Delete this device from the registry';
    const currentDeviceNameForDelete = deviceData.name || 'Unnamed';
    deleteBtn.setAttribute('aria-label', `Delete device ${currentDeviceNameForDelete} from registry`);
    deleteBtn.onclick = () => handlers.handleDeleteDevice(deviceId, currentDeviceNameForDelete);
  }
  actionsDiv.appendChild(deleteBtn);
  li.appendChild(actionsDiv);
  return li;
}
export function renderDeviceRegistryUI(deviceRegistryListDiv, currentState, handlers) {
  console.log(`${new Date().toISOString()} OptionsUI:renderDeviceRegistryUI - START. currentState.instanceName: ${currentState?.instanceName}, deviceRegistry for instanceId ('${currentState?.instanceId}') name: ${currentState?.deviceRegistry?.[currentState?.instanceId]?.name}`);
  const devices = currentState.deviceRegistry;
  deviceRegistryListDiv.textContent = ''; // Clear previous content safely

  if (!devices || Object.keys(devices).length === 0) {
    deviceRegistryListDiv.textContent = STRINGS.noDevices;
    return;
  }

  const localInstance = { id: currentState.instanceId, name: currentState.instanceName };

  const ul = document.createElement('ul');
  ul.className = 'options-list'; // Use common class

  Object.entries(devices)
    .sort((a, b) => {
      const [idA] = a;
      const [idB] = b;
      if (idA === localInstance.id) return -1;
      if (idB === localInstance.id) return 1;
      return (a[1]?.name || '').localeCompare(b[1]?.name || '');
    })
    .forEach(([id, device]) => {
      // Use the new helper function to create each list item
      const li = createDeviceListItemUI(id, device, localInstance, handlers);
      ul.appendChild(li);
    });
  deviceRegistryListDiv.appendChild(ul);
}

/**
 * Creates a list item element for a group.
 * @param {string} groupName - The name of the group.
 * @param {boolean} isSubscribed - Whether the current device is subscribed to this group.
 * @param {object} handlers - Object containing event handlers (handleSubscribe, handleUnsubscribe, handleDeleteGroup, startRenameGroup).
 * @returns {HTMLLIElement} The created list item element.
 */
export function createGroupListItemUI(groupName, isSubscribed, handlers) {
  // console.log(`${new Date().toISOString()} OptionsUI:createGroupListItemUI - Creating item for group: "${groupName}", isSubscribed: ${isSubscribed}`); // Can be verbose
  const li = document.createElement("li");
  li.setAttribute('role', 'listitem');
  li.className = 'options-list-item'; // Use common class
  li.dataset.groupName = groupName; // Add data attribute for easier selection

  const nameSpan = document.createElement("span");
  nameSpan.textContent = groupName;
  nameSpan.className = 'group-name-label options-list-item-label';
  nameSpan.style.cursor = 'pointer';
  nameSpan.title = 'Click to rename group';
  nameSpan.onclick = () => handlers.startRenameGroup(groupName, nameSpan);
  li.appendChild(nameSpan);

  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'group-actions';

  const subBtn = document.createElement("button");
  subBtn.textContent = isSubscribed ? "Unsubscribe" : "Subscribe";
  subBtn.dataset.group = groupName;
  subBtn.className = isSubscribed ? 'secondary' : 'primary';
  subBtn.onclick = isSubscribed ? handlers.handleUnsubscribe : handlers.handleSubscribe;
  actionsDiv.appendChild(subBtn);

  const deleteBtn = document.createElement("button");
  deleteBtn.textContent = "Delete";
  deleteBtn.dataset.group = groupName;
  deleteBtn.className = 'danger';
  deleteBtn.onclick = handlers.handleDeleteGroup;
  actionsDiv.appendChild(deleteBtn);

  li.appendChild(actionsDiv);
  return li;
}

export function renderGroupListUI(
  definedGroupsListDiv,
  definedGroups,
  subscriptions,
  handlers // Changed to accept an object of handlers
) {
  console.log(`${new Date().toISOString()} OptionsUI:renderGroupListUI - Rendering groups. Count: ${definedGroups?.length || 0}`);
  definedGroupsListDiv.textContent = ""; // Clear previous content

  if (!definedGroups || definedGroups.length === 0) {
    definedGroupsListDiv.textContent = STRINGS.noGroups;
    return;
  }

  const ul = document.createElement("ul");
  ul.setAttribute('role', 'list');
  ul.className = 'options-list'; // Use common class

  definedGroups.forEach((groupName) => {
    const isSubscribed = subscriptions.includes(groupName);
    // Use the new helper function to create each list item
    const li = createGroupListItemUI(groupName, isSubscribed, handlers);
    ul.appendChild(li);
  });
  definedGroupsListDiv.appendChild(ul);
}

export function cancelInlineEditUI(originalSpan, inlineControlsContainer) {
  console.log(`${new Date().toISOString()} OptionsUI:cancelInlineEditUI - Cancelling inline edit.`);
  if (inlineControlsContainer && inlineControlsContainer.parentNode) {
    inlineControlsContainer.remove();
  }
  if (originalSpan) {
    originalSpan.style.display = '';
  }
}

export function createInlineEditControlsUI(currentValue, onSaveCallback, onCancelCallback) {
  console.log(`${new Date().toISOString()} OptionsUI:createInlineEditControlsUI - Creating for value: "${currentValue}"`);
  const container = document.createElement('div');
  container.className = 'inline-edit-container';

  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentValue;
  input.className = 'inline-edit-input';

  const saveBtn = document.createElement('button');
  saveBtn.textContent = '✓';
  saveBtn.className = 'inline-edit-save';
  saveBtn.title = 'Save';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = '✕';
  cancelBtn.className = 'inline-edit-cancel secondary';
  cancelBtn.title = 'Cancel';

  const handleSave = () => {
    const newValue = input.value.trim();
    if (newValue && newValue !== currentValue) {
      onSaveCallback(newValue);
    } else {
      onCancelCallback();
    }
  };

  input.onkeydown = (e) => {
    if (e.key === 'Enter') e.preventDefault(), handleSave();
    else if (e.key === 'Escape') e.preventDefault(), onCancelCallback();
  };
  saveBtn.onclick = handleSave;
  cancelBtn.onclick = onCancelCallback;

  input.onblur = (e) => {
    setTimeout(() => {
      const focusMovedToButton = e.relatedTarget === saveBtn || e.relatedTarget === cancelBtn;
      if (container.parentNode && !focusMovedToButton) {
        onCancelCallback();
      }
    }, 150);
  };

  container.appendChild(input);
  container.appendChild(saveBtn);
  container.appendChild(cancelBtn);

  return { element: container, focusInput: () => input.focus() };
}

export function setLastSyncTimeUI(containerElement, timestamp) {
  if (!containerElement) return;
  console.log(`${new Date().toISOString()} OptionsUI:setLastSyncTimeUI - Setting time to: ${timestamp ? new Date(timestamp).toLocaleString() : "Never"}`);

  let syncTimeDiv = containerElement.querySelector(".last-sync-time"); // Corrected selector
  if (!syncTimeDiv) { // Styles moved to styles.css
    syncTimeDiv = document.createElement("div");
    syncTimeDiv.className = "last-sync-time"; // Class for styling from CSS
    // Prepend to a specific section if available, or just the container
    const androidInfoSection = containerElement.querySelector('#androidSpecificInfo'); // Assuming such an ID exists in options.html
    if (androidInfoSection) {
        androidInfoSection.insertBefore(syncTimeDiv, androidInfoSection.firstChild);
    } else {
        // Fallback: if no androidSpecificInfo, maybe prepend to a general settings area or log an error
        // console.warn("TabTogether: #androidSpecificInfo container not found for last sync time. Appending to main container.");
        // As a robust fallback, append to containerElement.firstChild.
        containerElement.insertBefore(syncTimeDiv, containerElement.firstChild);
    }
  }
  syncTimeDiv.textContent = "Last sync (this view): " + (timestamp ? new Date(timestamp).toLocaleString() : "Never");
}

export function showDebugInfoUI(containerElement, state) {
  if (!containerElement || !state) return;
  console.log(`${new Date().toISOString()} OptionsUI:showDebugInfoUI - Displaying debug info.`);

  let debugDiv = containerElement.querySelector(".options-debug-info"); // Styles moved to styles.css
  if (!debugDiv) {
    debugDiv = document.createElement("div");
    debugDiv.className = "options-debug-info"; // Class for styling from CSS

    const androidInfoSection = containerElement.querySelector('#androidSpecificInfo');
    if (androidInfoSection) {
        androidInfoSection.appendChild(debugDiv);
    } else {
        // console.warn("TabTogether: #androidSpecificInfo container not found for debug info. Appending to main container.");
        containerElement.appendChild(debugDiv); // Fallback
    }
  }

  debugDiv.textContent = ""; // Clear previous content
  const title = document.createElement("strong");
  title.textContent = "Debug Info (Current View)";
  debugDiv.appendChild(title);

  const pre = document.createElement("pre");
  // pre styles (white-space, word-break) moved to styles.css under .options-debug-info pre

  const { instanceId, instanceName, subscriptions, definedGroups, deviceRegistry, groupTasks, isAndroid } = state;
  const debugState = { instanceId, instanceName, subscriptions, definedGroups, deviceRegistryCount: Object.keys(deviceRegistry || {}).length, groupTasksCount: Object.keys(groupTasks || {}).length, isAndroid };

  pre.textContent = JSON.stringify(debugState, null, 2);
  debugDiv.appendChild(pre);
}

/**
 * Displays a banner message about the requirement of Firefox Sync for cross-device functionality.
 * @param {HTMLElement} containerElement - The parent element to prepend the banner to.
 * @param {object} storageAPI - The storage utility object.
 */
export async function displaySyncRequirementBanner(containerElement, storageAPI) {
  console.log(`${new Date().toISOString()} OptionsUI:displaySyncRequirementBanner - Checking if banner should be displayed.`);
  if (!containerElement) return;

  const bannerDismissedKey = 'optionsSyncBannerDismissed';
  const isDismissed = await storageAPI.get(browser.storage.local, bannerDismissedKey, false);

  if (isDismissed) {
    console.log(`${new Date().toISOString()} OptionsUI:displaySyncRequirementBanner - Banner already dismissed.`);
    return; // Don't show if already dismissed
  }

  // Prevent adding multiple banners
  if (containerElement.querySelector('.sync-requirement-banner')) { // Simpler check for existing banner
    console.log(`${new Date().toISOString()} OptionsUI:displaySyncRequirementBanner - Banner already exists.`);
    return;
  }

  const banner = document.createElement('div');
  banner.className = 'sync-requirement-banner notice-banner'; // Styles moved to styles.css
  
  const icon = document.createElement('span');
  icon.textContent = 'ℹ️'; // Info icon
  icon.style.marginRight = '8px';
  banner.appendChild(icon);

  banner.appendChild(document.createTextNode(STRINGS.SYNC_INFO_MESSAGE_OPTIONS || "TabTogether relies on Firefox Sync for cross-device features. Ensure you're signed in and add-on data sync is enabled."));

  // Add a dismiss button
  const dismissButton = document.createElement('button');
  dismissButton.textContent = '✕'; // 'x' character for close
  dismissButton.className = 'banner-dismiss-button'; // For styling
  dismissButton.title = 'Dismiss this message';
  dismissButton.setAttribute('aria-label', 'Dismiss this message');
  dismissButton.onclick = async () => {
    console.log(`${new Date().toISOString()} OptionsUI:displaySyncRequirementBanner - Dismiss button clicked.`);
    await storageAPI.set(browser.storage.local, bannerDismissedKey, true);
    banner.remove(); // Remove the banner from the DOM
  };
  banner.appendChild(dismissButton);

  console.log(`${new Date().toISOString()} OptionsUI:displaySyncRequirementBanner - Prepending banner.`);
  containerElement.insertBefore(banner, containerElement.firstChild); // Prepend to make it prominent
}