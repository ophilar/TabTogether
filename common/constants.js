// Shared UI strings and constants for TabTogether

/**
 * Keys for browser.storage.local.
 * These are specific to the local browser instance.
 */
export const LOCAL_STORAGE_KEYS = {  
  SUBSCRIPTIONS: "tabtogether_subscriptions", // Stores array of subscribed group names (folder names)
  PROCESSED_BOOKMARK_IDS: "tabtogether_processed_bookmark_ids", // Stores { bookmarkId: timestamp }
  LAST_PROCESSED_BOOKMARK_TIMESTAMP: "tabtogether_last_processed_bookmark_timestamp", // Timestamp of the newest bookmark considered in the last processing run
  LAST_SYNC_TIME: "tabtogether_last_sync_time", // Timestamp of last manual/auto sync action
};

/**
 * Constants related to bookmark-based synchronized storage.
 */
export const SYNC_STORAGE_KEYS = {
  // These are no longer direct storage keys but conceptual names for bookmark structures
  // GROUP_TASKS will be individual bookmarks within group folders
  // DEFINED_GROUPS will be folder names under the root bookmark folder
  // TASK_EXPIRY_DAYS will be stored in a special config bookmark

  ROOT_BOOKMARK_FOLDER_TITLE: "TabTogetherData", // Title of the main folder in bookmarks
  CONFIG_BOOKMARK_TITLE: "TabTogetherConfig",    // Title of the bookmark holding config
  TASK_EXPIRY_DAYS: "taskExpiryDays", // Property name within the config bookmark's JSON
};

export const BACKGROUND_DEFAULT_TASK_EXPIRY_DAYS = 30;

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
    androidBanner: 'On Firefox for Android, background processing is not available. Perform "Sync Now" to process new changes.',
    SYNC_INFO_MESSAGE_POPUP: "TabTogether uses Firefox Sync for cross-device features. Ensure you're signed in & bookmarks sync is enabled.",
    SYNC_INFO_MESSAGE_OPTIONS: "TabTogether relies on Firefox Sync to share data across your devices. Please ensure you are signed into your Firefox Account and bookmarks synchronization is enabled in your Firefox settings for the best experience.",
    groupExists: (groupName) => `${groupName} already exists.`,
    syncComplete: "Sync complete.",
    backgroundSyncTriggered: "Background sync triggered.",
    manualSyncFailed: (errorMsg) => `Sync failed: ${errorMsg}`,
    errorUpdatingUIAfterSync: "Error updating UI after sync.",
    subscribedToGroup: (groupName) => `Subscribed to "${groupName}".`,
    failedToSubscribe: "Failed to subscribe.",
    errorSubscribing: (errorMsg) => `Error subscribing: ${errorMsg}`,
    unsubscribedFromGroup: (groupName) => `Unsubscribed from "${groupName}".`,
    failedToUnsubscribe: "Failed to unsubscribe.",
    errorUnsubscribing: (errorMsg) => `Error unsubscribing: ${errorMsg}`,
    popupRefreshFailed: (errorMsg) => `Refresh failed: ${errorMsg}`,
    sendingTab: "Sending...",
    noActiveTabFound: "No active tab found.",
    sentToGroup: (groupName) => `Sent to ${groupName}!`,
    contextMenuSendTabToGroup: "Send Tab to Group",
    notificationSendFailedTitle: "Send Failed",
    notificationCannotSendLink: "Cannot send this type of link/page.",
    notificationTabSentTitle: "Tab Sent",
    notificationTabSentMessage: (title, groupName) => `Sent "${title}" to group "${groupName}".`,
    notificationTabReceivedTitle: (groupName) => `TabTogether: ${groupName ? "Group " + groupName : "Tab Received"}`,
    notificationTestTitle: "TabTogether Test",
    notificationTestMessage: "This is a test notification.",
    actionUnknown: (actionName) => `Unknown action: ${actionName}`,
    invalidGroupName: "Invalid group name provided.",
    noGroupNameProvided: "No group name provided.", 
  };
