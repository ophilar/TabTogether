// ui/options/options-ui.js

import { STRINGS } from "../../common/constants.js";

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
      const li = document.createElement('li');
      li.setAttribute('role', 'listitem');
      li.className = 'registry-list-item';

      const nameAndInfoDiv = document.createElement('div');
      nameAndInfoDiv.className = 'registry-item-info';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'device-name-label';
      let displayName = device.name || STRINGS.deviceNameNotSet;

      if (id === localId) {
        const strong = document.createElement('strong');
        strong.textContent = displayName;
        nameSpan.appendChild(strong);
        nameSpan.appendChild(document.createTextNode(' (This Device)'));
        li.classList.add('this-device');
        nameSpan.style.cursor = 'pointer';
        nameSpan.title = 'Click to rename this device';
        nameSpan.onclick = () => handlers.startRenameDevice(id, displayName, li, nameSpan);
      } else {
        nameSpan.textContent = displayName;
      }
      nameAndInfoDiv.appendChild(nameSpan);

      if (device.lastSeen) {
        const lastSeenSpan = document.createElement('span');
        lastSeenSpan.className = 'small-text registry-item-lastseen';
        lastSeenSpan.textContent = `Last seen: ${new Date(device.lastSeen).toLocaleString()}`;
        nameAndInfoDiv.appendChild(lastSeenSpan);
      }
      li.appendChild(nameAndInfoDiv);

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'registry-item-actions';

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'inline-btn danger';

      if (id === localId) {
        deleteBtn.textContent = 'Remove';
        deleteBtn.title = 'Remove this device from all groups and registry. This cannot be undone.';
        deleteBtn.setAttribute('aria-label', 'Remove this device from registry');
        deleteBtn.onclick = handlers.handleRemoveSelfDevice;
      } else {
        deleteBtn.textContent = 'Delete';
        deleteBtn.title = 'Delete this device from the registry';
        const currentDeviceNameForDelete = device.name || 'Unnamed';
        deleteBtn.setAttribute('aria-label', `Delete device ${currentDeviceNameForDelete} from registry`);
        deleteBtn.onclick = () => handlers.handleDeleteDevice(id, currentDeviceNameForDelete);
      }
      actionsDiv.appendChild(deleteBtn);
      li.appendChild(actionsDiv);
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
    // This is a placeholder. Implement actual DOM update for last sync time.
    // e.g., find a specific element within containerElement and update its textContent.
    console.log("UI: Set last sync time in container:", containerElement, new Date(timestamp).toLocaleString());
}

export function showDebugInfoUI(containerElement, state) {
    // This is a placeholder. Implement actual DOM update for debug info.
    console.log("UI: Show debug info in container:", containerElement, state);
}