import { STRINGS } from "../../common/constants.js";

/**
 * Creates a list item element for a group.
 */
export function createGroupListItemUI(groupName, isSubscribed, handlers, members = []) {
  const li = document.createElement("li");
  li.className = 'options-list-item group-card';
  li.dataset.groupName = groupName;

  const headerDiv = document.createElement("div");
  headerDiv.className = "group-item-header";

  const nameBtn = document.createElement("button");
  nameBtn.textContent = groupName;
  nameBtn.className = 'group-name-label';
  nameBtn.type = 'button';
  nameBtn.setAttribute('aria-label', `Rename group ${groupName}`);
  nameBtn.title = `Click to rename ${groupName}`;
  nameBtn.onclick = () => handlers.startRenameGroup(groupName, nameBtn);
  headerDiv.appendChild(nameBtn);

  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'group-actions';

  const subBtn = document.createElement("button");
  subBtn.textContent = isSubscribed ? "Leave" : "Join";
  subBtn.className = isSubscribed ? 'secondary' : 'primary';
  subBtn.onclick = isSubscribed ? handlers.handleUnsubscribe : handlers.handleSubscribe;
  subBtn.dataset.group = groupName;
  actionsDiv.appendChild(subBtn);

  const deleteBtn = document.createElement("button");
  deleteBtn.textContent = "Delete";
  deleteBtn.className = 'danger';
  deleteBtn.onclick = handlers.handleDeleteGroup;
  deleteBtn.dataset.group = groupName;
  actionsDiv.appendChild(deleteBtn);

  headerDiv.appendChild(actionsDiv);
  li.appendChild(headerDiv);

  if (isSubscribed && members.length > 0) {
    const membersDiv = document.createElement("div");
    membersDiv.className = "group-members-list";
    
    const label = document.createElement("strong");
    label.textContent = "Members: ";
    membersDiv.appendChild(label);

    members.forEach(m => {
        const timeAgo = Math.floor((Date.now() - m.lastSeen) / 60000);
        const statusClass = timeAgo < 5 ? "status-online" : "status-offline";
        const chip = document.createElement("span");
        chip.className = `member-chip ${statusClass}`;
        chip.title = `Last seen ${timeAgo}m ago`;
        chip.textContent = m.nickname;
        membersDiv.appendChild(chip);
    });
    
    li.appendChild(membersDiv);
  }

  return li;
}

export function renderGroupListUI(
  definedGroupsListDiv,
  definedGroups,
  subscriptions,
  handlers,
  groupMembers = {}
) {
  definedGroupsListDiv.textContent = "";

  if (!definedGroups || definedGroups.length === 0) {
    definedGroupsListDiv.textContent = STRINGS.noGroups;
    return;
  }

  const ul = document.createElement("ul");
  ul.className = 'options-list';

  definedGroups.forEach((groupName) => {
    const isSubscribed = subscriptions.includes(groupName);
    const members = groupMembers[groupName] || [];
    const li = createGroupListItemUI(groupName, isSubscribed, handlers, members);
    ul.appendChild(li);
  });
  definedGroupsListDiv.appendChild(ul);
}

export function cancelInlineEditUI(originalSpan, inlineControlsContainer) {
  if (inlineControlsContainer && inlineControlsContainer.parentNode) inlineControlsContainer.remove();
  if (originalSpan) originalSpan.style.display = '';
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

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = '✕';
  cancelBtn.className = 'inline-edit-cancel secondary';

  const handleSave = () => {
    const newValue = input.value.trim();
    if (newValue && newValue !== currentValue) onSaveCallback(newValue);
    else onCancelCallback();
  };

  input.onkeydown = (e) => {
    if (e.key === 'Enter') handleSave();
    else if (e.key === 'Escape') onCancelCallback();
  };
  saveBtn.onclick = handleSave;
  cancelBtn.onclick = onCancelCallback;

  // Append elements to the container
  container.appendChild(input);
  container.appendChild(saveBtn);
  container.appendChild(cancelBtn);

  return { element: container, focusInput: () => input.focus() };
}

export function setLastSyncTimeUI(containerElement, timestamp) {
  if (!containerElement) return;
  let syncTimeDiv = containerElement.querySelector(".last-sync-time");
  if (!syncTimeDiv) {
    syncTimeDiv = document.createElement("div");
    syncTimeDiv.className = "last-sync-time";
    containerElement.insertBefore(syncTimeDiv, containerElement.firstChild);
  }
  syncTimeDiv.textContent = "Live Feed Connected: " + (timestamp ? new Date(timestamp).toLocaleTimeString() : "Pending");
}

export function showDebugInfoUI(containerElement, state) {
  if (!containerElement || !state) return;
  let debugDiv = containerElement.querySelector(".options-debug-info");
  if (!debugDiv) {
    debugDiv = document.createElement("div");
    debugDiv.className = "options-debug-info";
    containerElement.appendChild(debugDiv);
  }
  
  debugDiv.textContent = ""; // Clear existing
  const label = document.createElement("strong");
  label.textContent = "System State:";
  debugDiv.appendChild(label);
  
  const pre = document.createElement("pre");
  pre.textContent = JSON.stringify(state, null, 2);
  debugDiv.appendChild(pre);
}

export async function displaySyncRequirementBanner(containerElement, storageAPI) {
  const syncPassword = await storageAPI.get(browser.storage.local, "syncPassword", "");
  if (!syncPassword) {
    const banner = document.createElement("div");
    banner.className = "warning-banner sync-requirement-banner";
    banner.innerHTML = `
      <div class="banner-content">
        <strong>⚠️ Setup Required:</strong> Please set a <strong>Master Sync Password</strong> in the settings below to enable encrypted tab sharing.
      </div>
    `;
    containerElement.insertBefore(banner, containerElement.firstChild);
  }
}
