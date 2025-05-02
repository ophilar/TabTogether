// constants.js
// Shared UI strings and constants for TabTogether
export const STRINGS = {
    deviceNameNotSet: '(Not Set)',
    noDevices: 'No devices registered.',
    noGroups: 'No groups defined. Use Settings to create one.',
    notSubscribed: 'Not subscribed to any groups.',
    subscribedGroups: 'Subscribed groups: ',
    loadingGroups: 'Loading groups...',
    loadingRegistry: 'Loading registry...',
    error: 'Error',
    // Centralized UI/confirmation strings
    // confirmRenameGroup: (oldName, newName) => `Rename group "${oldName}" to "${newName}"?`, // Removed - Inline edit doesn't use confirm
    confirmDeleteGroup: groupName => `Are you sure you want to delete the group "${groupName}"? This cannot be undone and will affect all devices.`,
    // confirmRenameDevice: newName => `Rename device to "${newName}"?`, // Removed - Inline edit doesn't use confirm
    // confirmDeleteDevice: deviceName => `Are you sure you want to delete device "${deviceName}"? This cannot be undone and will affect all groups.`, // Removed - Using custom confirm string
    sendTabToGroup: groupName => `Send current tab to group '${groupName}'`,
    sendTabToGroupAria: groupName => `Send current tab to group ${groupName}`,
    // sendTabToGroupBtn: 'Send Tab to Group', // Removed - Button text generated dynamically
    sendTabFailed: 'Send failed.',
    sendTabError: error => `Error: ${error}`,
    sendTabCannot: 'Cannot send this type of tab.',
    deviceRenameSuccess: newName => `Device renamed to "${newName}".`,
    deviceDeleteSuccess: deviceName => `Device "${deviceName}" deleted successfully.`,
    groupRenameSuccess: newName => `Group renamed to "${newName}".`,
    groupDeleteSuccess: groupName => `Group "${groupName}" deleted successfully.`,
    groupCreateSuccess: groupName => `Group "${groupName}" created successfully.`,
    groupCreateFailed: 'Failed to create group.',
    groupRenameFailed: 'Rename failed.',
    groupDeleteFailed: 'Failed to delete group.',
    deviceRenameFailed: 'Rename failed.',
    deviceDeleteFailed: 'Delete failed.',
    // saveNameFailed: 'Failed to save name.', // Removed - Covered by deviceRenameFailed
    // saveNameSuccess: 'Device name saved successfully.', // Removed - Covered by deviceRenameSuccess
    loadingSettingsError: error => `Error loading settings: ${error}`,
    testNotificationSent: 'Test notification sent!',
    testNotificationFailed: error => `Failed to send notification: ${error}`,
    androidBanner: 'Note: On Firefox for Android, background processing is not available. Open this page and tap "Sync Now" to process new tabs or changes.'
};
