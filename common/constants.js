// Shared UI strings and constants for TabTogether

/**
 * Keys for browser.storage.local.
 * These are specific to the local browser instance.
 */
export const LOCAL_STORAGE_KEYS = {  
  SUBSCRIPTIONS: "tabtogether_subscriptions", // Stores an array of group names this specific device instance is subscribed to
  PROCESSED_TASKS: "tabtogether_processed_tasks", // Stores an object mapping taskId to true if processed locally
  LAST_SYNC_TIME: "last_successful_sync_time", // deviceId
};

/**
 * Keys for browser.storage.sync.
 * These are synced across all instances of the extension for the user.
 */
export const SYNC_STORAGE_KEYS = {
  DEFINED_GROUPS: "tabtogether_defined_groups",   // Array of all group names
  GROUP_TASKS: "tabtogether_group_tasks",       // Object mapping groupName to { taskId: { url, title, processedByDeviceIds: [deviceId], creationTimestamp } }
  
  
  TASK_EXPIRY_DAYS: "tabtogether_task_expiry_days", // Number of days
  
};

/**
 * Maximum number of devices allowed per group.
 * This is enforced by counting subscribers in the group.
 */
export const MAX_DEVICES_PER_GROUP = 64; // Adjust if your bitmask supports more/less

/**
 * User-facing strings for UI elements, notifications, and messages.
 */
export const STRINGS = {
    noGroups: 'No groups defined. Use Settings to create one.',
    notSubscribed: 'Not subscribed to any groups.',
    subscribedGroups: 'Subscribed groups: ',
    loadingGroups: 'Loading groups...',
    error: 'Error',
    confirmDeleteGroup: groupName => `Are you sure you want to delete the group "${groupName}"? This cannot be undone and will affect all devices.`,
    confirmDeleteDevice: deviceName => `Are you sure you want to delete device "${deviceName}"? This cannot be undone and will affect all groups.`,
    sendTabToGroup: groupName => `Send current tab to group '${groupName}'`,
    sendTabToGroupAria: groupName => `Send current tab to group ${groupName}`,
    sendTabFailed: 'Send failed.',
    sendTabError: error => `Error: ${error}`,
    sendTabCannot: 'Cannot send this type of tab.',
    groupRenameSuccess: newName => `Group renamed to "${newName}".`,
    groupDeleteSuccess: groupName => `Group "${groupName}" deleted successfully.`,
    groupCreateSuccess: groupName => `Group "${groupName}" created successfully.`,
    groupCreateFailed: 'Failed to create group.',
    groupRenameFailed: 'Rename failed.',
    groupDeleteFailed: 'Failed to delete group.',
    loadingSettingsError: error => `Error loading settings: ${error}`,
    testNotificationSent: 'Test notification sent!',
    testNotificationFailed: error => `Failed to send notification: ${error}`,
    androidBanner: 'Note: On Firefox for Android, background processing is not available. Open this page and tap "Sync Now" to process new tabs or changes.',
    SYNC_INFO_MESSAGE_POPUP: "TabTogether uses Firefox Sync for cross-device features. Ensure you're signed in & add-on sync is enabled.",
    SYNC_INFO_MESSAGE_OPTIONS: "TabTogether relies on Firefox Sync to share data across your devices. Please ensure you are signed into your Firefox Account and that add-on data synchronization is enabled in your Firefox settings for the best experience.",
    groupExists: (groupName) => `${groupName} already exists.`,
    // Options.js strings
    syncComplete: "Sync complete.",
    backgroundSyncTriggered: "Background sync triggered.",
    manualSyncFailed: (errorMsg) => `Sync failed: ${errorMsg}`,
    androidBannerOptions: 'Note: On Firefox for Android, background processing is not available. Open this page and tap "Sync Now" to process new tabs or changes.',
    errorUpdatingUIAfterSync: "Error updating UI after sync.",
    subscribedToGroup: (groupName) => `Subscribed to "${groupName}".`,
    failedToSubscribe: "Failed to subscribe.",
    errorSubscribing: (errorMsg) => `Error subscribing: ${errorMsg}`,
    unsubscribedFromGroup: (groupName) => `Unsubscribed from "${groupName}".`,
    failedToUnsubscribe: "Failed to unsubscribe.",
    errorUnsubscribing: (errorMsg) => `Error unsubscribing: ${errorMsg}`,
    // Popup.js strings
    androidBannerPopup: 'Note: On Firefox for Android, background processing is not available. Open this popup and tap "Sync Now" to process new tabs or changes.',
    popupRefreshFailed: (errorMsg) => `Refresh failed: ${errorMsg}`,
    sendingTab: "Sending...",
    noActiveTabFound: "No active tab found.",
    sentToGroup: (groupName) => `Sent to ${groupName}!`,
    // Background.js strings
    contextMenuNoGroups: "No groups defined",
    contextMenuSendTabToGroup: "Send Tab to Group",
    notificationSendFailedTitle: "Send Failed",
    notificationCannotSendLink: "Cannot send this type of link/page.",
    notificationTabSentTitle: "Tab Sent",
    notificationTabSentMessage: (title, groupName) => `Sent "${title}" to group "${groupName}".`,
    notificationTabReceivedTitle: (groupName) => `TabTogether: ${groupName ? "Group " + groupName : "Tab Received"}`,
    notificationTestTitle: "TabTogether Test",
    notificationTestMessage: "This is a test notification.",
    actionUnknown: (actionName) => `Unknown action: ${actionName}`,
    invalidGroupName: "Invalid group name provided.", // Used in actions.js & background.js
    noGroupNameProvided: "No group name provided.", // Used in background.js
    alreadySubscribed: "Already subscribed.", // Used in background.js
    notSubscribedToGroup: "Not subscribed.", // Used in background.js (for unsubscribe)
    // actions.js strings (some might overlap with background.js if messages are identical)
    failedToSaveNewGroup: "Failed to save new group.",
    failedToDeleteGroupAndUpdateSubs: "Failed to fully delete group and update subscriptions.",
    failedToRenameGroupAndUpdateSubs: "Failed to fully rename group and update subscriptions.",
    failedToSaveSubscription: "Failed to save subscription.",
    failedToSaveUnsubscription: "Failed to save unsubscription.",
};
