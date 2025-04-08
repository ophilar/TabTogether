document.addEventListener('DOMContentLoaded', async () => {
    const deviceListDiv = document.getElementById('device-list');
    const newGroupNameInput = document.getElementById('new-group-name');
    const createGroupBtn = document.getElementById('create-group-btn');
    const existingGroupsDiv = document.getElementById('existing-groups');
    const noGroupsMessage = document.getElementById('no-groups-message');
    const loadingDiv = document.getElementById('loading');
    const groupCreatorDiv = document.getElementById('group-creator');
    const createErrorDiv = document.getElementById('create-error');
  
    let availableDevices = [];
    let currentGroups = {};
  
    // --- Fetch Initial Data ---
    async function loadInitialData() {
      try {
        loadingDiv.style.display = 'block';
        groupCreatorDiv.style.display = 'none';
        existingGroupsDiv.style.display = 'none';
  
        // Use browser.runtime.sendMessage to ask background script for data
        availableDevices = await browser.runtime.sendMessage({ action: 'getDevices' });
        currentGroups = await browser.runtime.sendMessage({ action: 'getGroups' });
  
        console.log("Popup received devices:", availableDevices);
        console.log("Popup received groups:", currentGroups);
  
        populateDeviceList();
        displayExistingGroups();
  
        loadingDiv.style.display = 'none';
        groupCreatorDiv.style.display = 'block';
        existingGroupsDiv.style.display = 'block';
  
      } catch (error) {
        console.error("Popup initialization error:", error);
        loadingDiv.textContent = `Error loading data: ${error.message || error}. Ensure you are logged into a Firefox Account.`;
        // Optionally disable UI elements
      }
    }
  
    // --- UI Population ---
    function populateDeviceList() {
      deviceListDiv.innerHTML = ''; // Clear previous list
      if (!availableDevices || availableDevices.length === 0) {
          deviceListDiv.innerHTML = '<p>No devices found. Make sure devices are synced to your Firefox Account.</p>';
          createGroupBtn.disabled = true; // Disable creation if no devices
          return;
      }
  
      createGroupBtn.disabled = false;
      availableDevices.forEach(device => {
        // Filter out the current device if desired (optional)
        // if (device.isCurrentDevice) return;
  
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = device.id; // Use the unique device ID
        checkbox.dataset.deviceName = device.name; // Store name for display later
  
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(` ${device.name} (${device.type})`)); // Show name and type
        deviceListDiv.appendChild(label);
      });
    }
  
    function displayExistingGroups() {
      existingGroupsDiv.innerHTML = ''; // Clear previous list
      const groupNames = Object.keys(currentGroups);
  
      if (groupNames.length === 0) {
        existingGroupsDiv.appendChild(noGroupsMessage);
        noGroupsMessage.style.display = 'block';
        return;
      }
  
      noGroupsMessage.style.display = 'none';
  
      groupNames.sort().forEach(groupName => {
        const groupDeviceIds = currentGroups[groupName];
        const groupItem = document.createElement('div');
        groupItem.className = 'group-item';
  
        const title = document.createElement('h3');
        title.textContent = groupName;
  
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete';
        deleteBtn.className = 'delete-group-btn';
        deleteBtn.dataset.groupName = groupName; // Store group name for deletion
        deleteBtn.addEventListener('click', handleDeleteGroup);
  
        title.appendChild(deleteBtn);
        groupItem.appendChild(title);
  
        const deviceListUl = document.createElement('ul');
        groupDeviceIds.forEach(deviceId => {
          const device = availableDevices.find(d => d.id === deviceId);
          const li = document.createElement('li');
          li.textContent = device ? `${device.name} (${device.type})` : `Unknown Device (ID: ${deviceId})`;
          deviceListUl.appendChild(li);
        });
         if (groupDeviceIds.length === 0) {
             const li = document.createElement('li');
             li.textContent = 'No devices in this group.';
             deviceListUl.appendChild(li);
         }
  
        groupItem.appendChild(deviceListUl);
        existingGroupsDiv.appendChild(groupItem);
      });
    }
  
    // --- Event Handlers ---
    async function handleCreateGroup() {
      createErrorDiv.textContent = ''; // Clear previous errors
      const groupName = newGroupNameInput.value.trim();
      const selectedCheckboxes = deviceListDiv.querySelectorAll('input[type="checkbox"]:checked');
      const selectedDeviceIds = Array.from(selectedCheckboxes).map(cb => cb.value);
  
      // Validation
      if (!groupName) {
        createErrorDiv.textContent = 'Group name cannot be empty.';
        return;
      }
      if (selectedDeviceIds.length === 0) {
        createErrorDiv.textContent = 'Select at least one device.';
        return;
      }
      if (currentGroups[groupName]) {
        // Optional: Allow overwriting or require unique name
        if (!confirm(`Group "${groupName}" already exists. Overwrite it?`)) {
            return;
        }
        // createErrorDiv.textContent = 'Group name already exists.';
        // return;
      }
  
      // Update the groups object
      currentGroups[groupName] = selectedDeviceIds;
  
      // Save using the background script
      try {
          await browser.runtime.sendMessage({ action: 'saveGroups', groups: currentGroups });
          console.log("Group saved via background script");
  
          // Clear inputs and update UI
          newGroupNameInput.value = '';
          selectedCheckboxes.forEach(cb => cb.checked = false);
          displayExistingGroups(); // Refresh the list of existing groups
  
      } catch (error) {
          console.error("Error saving group via background:", error);
          createErrorDiv.textContent = `Error saving group: ${error.message || error}`;
          // Revert local change if save failed? Depends on desired behavior.
          // delete currentGroups[groupName]; // Example revert
      }
    }
  
    async function handleDeleteGroup(event) {
      const groupName = event.target.dataset.groupName;
      if (!groupName) return;
  
      if (confirm(`Are you sure you want to delete the group "${groupName}"?`)) {
        delete currentGroups[groupName]; // Remove from local copy
  
        // Save the updated groups object via background script
        try {
            await browser.runtime.sendMessage({ action: 'saveGroups', groups: currentGroups });
            console.log("Group deleted via background script");
            displayExistingGroups(); // Refresh the list
        } catch (error) {
            console.error("Error deleting group via background:", error);
            alert(`Error deleting group: ${error.message || error}`);
            // Re-add group to local copy if save failed?
            // currentGroups[groupName] = ... // Need to store the old value temporarily
        }
      }
    }
  
    // --- Attach Event Listeners ---
    createGroupBtn.addEventListener('click', handleCreateGroup);
  
    // --- Initial Load ---
    loadInitialData();
  });