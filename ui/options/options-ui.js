// ui/options/options-ui.js

import { STRINGS } from "../../common/constants.js";

/**
 * Creates a list item element for a device.
 * @param {string} deviceId - The ID of the device.
 * @param {object} deviceData - The data object for the device.
 * @param {string} localInstanceId - The ID of the current local instance.
 * @param {object} handlers - Object containing event handlers (startRenameDevice, handleRemoveSelfDevice, handleDeleteDevice).
 * @returns {HTMLLIElement} The created list item element.
 */
export function createDeviceListItemUI(deviceId, deviceData, localInstanceId, handlers) {
  const li = document.createElement('li');
  li.setAttribute('role', 'listitem');
  li.dataset.deviceId = deviceId;
  li.className = 'registry-list-item';

  const nameAndInfoDiv = document.createElement('div');
  nameAndInfoDiv.className = 'registry-item-info';

  const nameSpan = document.createElement('span');
  nameSpan.className = 'device-name-label';
  let displayName = deviceData.name || STRINGS.deviceNameNotSet;

  if (deviceId === localInstanceId) {
    const strong = document.createElement('strong');
    strong.textContent = displayName;
    nameSpan.appendChild(strong);
    nameSpan.appendChild(document.createTextNode(' (This Device)'));
    li.classList.add('this-device');
    nameSpan.style.cursor = 'pointer';
    nameSpan.title = 'Click to rename this device';
    nameSpan.onclick = () => handlers.startRenameDevice(deviceId, displayName, li, nameSpan);
  } else {
    nameSpan.textContent = displayName;
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

  if (deviceId === localInstanceId) {
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
  const devices = currentState.deviceRegistry;
  deviceRegistryListDiv.textContent = ''; // Clear previous content safely

  if (!devices || Object.keys(devices).length === 0) {
    deviceRegistryListDiv.textContent = STRINGS.noDevices;
    return;
  }

  const localId = currentState.instanceId;
  const ul = document.createElement('ul');
  ul.setAttribute('role', 'list');
  ul.className = 'registry-list'; // Add class for styling

  Object.entries(devices)
    .sort((a, b) => {
      const [idA] = a;
      const [idB] = b;
      if (idA === localId) return -1;
      if (idB === localId) return 1;
      return (a[1]?.name || '').localeCompare(b[1]?.name || '');
    })
    .forEach(([id, device]) => {
      // Use the new helper function to create each list item
      const li = createDeviceListItemUI(id, device, localId, handlers);
      ul.appendChild(li);
    });
  deviceRegistryListDiv.appendChild(ul);
}

export function renderGroupListUI(
  definedGroupsListDiv,
  definedGroups,
  subscriptions,
  handleSubscribe,
  handleUnsubscribe,
  handleDeleteGroup,
  startRenameGroup
) {
  definedGroupsListDiv.textContent = ""; // Clear previous content

  if (!definedGroups || definedGroups.length === 0) {
    definedGroupsListDiv.textContent = STRINGS.noGroups;
    return;
  }

  const ul = document.createElement("ul");
  ul.setAttribute('role', 'list');

  definedGroups.forEach((groupName) => {
    const li = document.createElement("li");
    li.setAttribute('role', 'listitem');

    const nameSpan = document.createElement("span");
    nameSpan.textContent = groupName;
    nameSpan.className = 'group-name-label'; // For styling and selection
    nameSpan.style.cursor = 'pointer'; // Indicate clickable for rename
    nameSpan.title = 'Click to rename group';
    nameSpan.onclick = () => startRenameGroup(groupName, nameSpan); // Pass nameSpan for context
    li.appendChild(nameSpan);

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'group-actions'; // For styling action buttons

    const isSubscribed = subscriptions.includes(groupName);
    const subBtn = document.createElement("button");
    subBtn.textContent = isSubscribed ? "Unsubscribe" : "Subscribe";
    subBtn.dataset.group = groupName;
    subBtn.className = isSubscribed ? 'secondary' : 'primary'; // Style based on state
    subBtn.onclick = isSubscribed ? handleUnsubscribe : handleSubscribe;
    actionsDiv.appendChild(subBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete";
    deleteBtn.dataset.group = groupName;
    deleteBtn.className = 'danger'; // Style for destructive action
    deleteBtn.onclick = handleDeleteGroup;
    actionsDiv.appendChild(deleteBtn);

    li.appendChild(actionsDiv);
    ul.appendChild(li);
  });
  definedGroupsListDiv.appendChild(ul);
}

export function cancelInlineEditUI(originalSpan, inlineControlsContainer) {
  if (inlineControlsContainer && inlineControlsContainer.parentNode) {
    inlineControlsContainer.remove();
  }
  if (originalSpan) {
    originalSpan.style.display = '';
  }
}

export function createInlineEditControlsUI(currentValue, onSaveCallback, onCancelCallback) {
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

  let syncTimeDiv = containerElement.querySelector(".options-last-sync-time");
  if (!syncTimeDiv) {
    syncTimeDiv = document.createElement("div");
    syncTimeDiv.className = "options-last-sync-time small-text"; // Use a specific class
    syncTimeDiv.style.marginBottom = "7px"; // Example style
    // Prepend to a specific section if available, or just the container
    const androidInfoSection = containerElement.querySelector('#androidSpecificInfo'); // Assuming such an ID exists in options.html
    if (androidInfoSection) {
        androidInfoSection.insertBefore(syncTimeDiv, androidInfoSection.firstChild);
    } else {
        containerElement.insertBefore(syncTimeDiv, containerElement.firstChild); // Fallback
    }
  }
  syncTimeDiv.textContent = "Last sync (this view): " + (timestamp ? new Date(timestamp).toLocaleString() : "Never");
}

export function showDebugInfoUI(containerElement, state) {
  if (!containerElement || !state) return;

  let debugDiv = containerElement.querySelector(".options-debug-info");
  if (!debugDiv) {
    debugDiv = document.createElement("div");
    debugDiv.className = "options-debug-info small-text"; // Use a specific class
    debugDiv.style.marginTop = "12px";
    debugDiv.style.background = "#f5f5f5";
    debugDiv.style.border = "1px solid #ccc";
    debugDiv.style.padding = "7px";
    debugDiv.style.borderRadius = "4px";

    const androidInfoSection = containerElement.querySelector('#androidSpecificInfo');
    if (androidInfoSection) {
        androidInfoSection.appendChild(debugDiv);
    } else {
        containerElement.appendChild(debugDiv); // Fallback
    }
  }

  debugDiv.textContent = ""; // Clear previous content
  const title = document.createElement("strong");
  title.textContent = "Debug Info (Current View)";
  debugDiv.appendChild(title);

  const pre = document.createElement("pre");
  pre.style.whiteSpace = "pre-wrap"; // Allow wrapping
  pre.style.wordBreak = "break-all"; // Break long strings

  const { instanceId, instanceName, subscriptions, definedGroups, deviceRegistry, groupTasks, isAndroid } = state;
  const debugState = { instanceId, instanceName, subscriptions, definedGroups, deviceRegistryCount: Object.keys(deviceRegistry || {}).length, groupTasksCount: Object.keys(groupTasks || {}).length, isAndroid };

  pre.textContent = JSON.stringify(debugState, null, 2);
  debugDiv.appendChild(pre);
}

/**
 * Renders the device name in a given container element.
 * @param {HTMLElement} container - The container element to render the name into.
 * @param {string} name - The device name.
 */
export function renderDeviceName(container, name) {
  if (container) {
    container.textContent = name || STRINGS.deviceNameNotSet;
  }
}

/**
 * Renders subscription information into a container.
 * @param {HTMLElement} container - The container element.
 * @param {string[]} subscriptions - Array of subscribed group names.
 */
export function renderSubscriptions(container, subscriptions) {
  if (!container) return;
  if (!subscriptions || subscriptions.length === 0) {
    container.textContent = STRINGS.notSubscribed;
  } else {
    container.textContent = STRINGS.subscribedGroups + subscriptions.sort().join(', ');
  }
}