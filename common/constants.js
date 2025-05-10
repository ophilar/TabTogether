// constants.js
// Shared UI strings and constants for TabTogether

/**
 * Keys for browser.storage.local.
 * These are specific to the local browser instance.
 */
export const LOCAL_STORAGE_KEYS = {
  INSTANCE_ID: "tabtogether_instance_id",
  INSTANCE_NAME: "tabtogether_instance_name",
  SUBSCRIPTIONS: "tabtogether_subscriptions", // Stores an array of group names this specific device instance is subscribed to
  PROCESSED_TASKS: "tabtogether_processed_tasks", // Stores an object mapping taskId to true if processed locally
  // Add any other local storage keys here
};

/**
 * Keys for browser.storage.sync.
 * These are synced across all instances of the extension for the user.
 */
export const SYNC_STORAGE_KEYS = {
  DEFINED_GROUPS: "tabtogether_defined_groups",   // Array of all group names
  GROUP_STATE: "tabtogether_group_state",       // Object mapping groupName to { /* other group metadata if needed */ }
  GROUP_TASKS: "tabtogether_group_tasks",       // Object mapping groupName to { taskId: { url, title, senderDeviceId, recipientDeviceIds?, processedByDeviceIds?, creationTimestamp } }
  DEVICE_REGISTRY: "tabtogether_device_registry", // Object mapping instanceId to { name, lastSeen }
  STALE_DEVICE_THRESHOLD_DAYS: "tabtogether_stale_device_threshold_days", // Number of days
  TASK_EXPIRY_DAYS: "tabtogether_task_expiry_days", // Number of days
  SUBSCRIPTIONS: "tabtogether_subscriptions_sync", // SYNC version: Object mapping instanceId to [groupName1, groupName2,...]
  // Add any other sync storage keys here
};

/**
 * Maximum number of devices allowed per group.
 * This is tied to the bitmask implementation (e.g., a 16-bit mask allows 16 devices).
 * With bitmasks removed, this is enforced by counting subscribers.
 */
export const MAX_DEVICES_PER_GROUP = 16; // Adjust if your bitmask supports more/less

/**
 * User-facing strings for UI elements, notifications, and messages.
 */
export const STRINGS = {
    deviceNameNotSet: '(Not Set)',
    noDevices: 'No devices registered.',
    noGroups: 'No groups defined. Use Settings to create one.',
    notSubscribed: 'Not subscribed to any groups.',
    subscribedGroups: 'Subscribed groups: ',
    loadingGroups: 'Loading groups...',
    loadingRegistry: 'Loading registry...',
    error: 'Error',
    confirmDeleteGroup: groupName => `Are you sure you want to delete the group "${groupName}"? This cannot be undone and will affect all devices.`,
    confirmDeleteDevice: deviceName => `Are you sure you want to delete device "${deviceName}"? This cannot be undone and will affect all groups.`,
    sendTabToGroup: groupName => `Send current tab to group '${groupName}'`,
    sendTabToGroupAria: groupName => `Send current tab to group ${groupName}`,
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
    loadingSettingsError: error => `Error loading settings: ${error}`,
    testNotificationSent: 'Test notification sent!',
    testNotificationFailed: error => `Failed to send notification: ${error}`,
    androidBanner: 'Note: On Firefox for Android, background processing is not available. Open this page and tap "Sync Now" to process new tabs or changes.',
    SYNC_INFO_MESSAGE_POPUP: "TabTogether uses Firefox Sync for cross-device features. Ensure you're signed in & add-on sync is enabled.",
    SYNC_INFO_MESSAGE_OPTIONS: "TabTogether relies on Firefox Sync to share data across your devices. Please ensure you are signed into your Firefox Account and that add-on data synchronization is enabled in your Firefox settings for the best experience.",
};
