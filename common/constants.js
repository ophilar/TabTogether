export const LOCAL_STORAGE_KEYS = {
  SUBSCRIPTIONS: "subscriptions",
  DEVICE_NICKNAME: "deviceNickname",
  RECENTLY_OPENED_URLS: "recentlyOpenedUrls",
  LAST_SYNC_TIME: "lastSyncTime",
  TAB_HISTORY: "tabHistory",
  SENDER_ID: "senderId", // Unique ID for this device to prevent echo
  GROUP_ID: "groupId",   // Primary sync group ID
  SYNC_PASSWORD: "syncPassword", // Master Sync Password for E2EE
  PROCESSED_TAB_IDS: "processedTabIds", // For idempotency in multi-device broadcast
};

export const STRINGS = {
  notificationTestTitle: "TabTogether Test",
  notificationTestMessage: "Notifications are working correctly!",
  invalidGroupName: "Please enter a valid group name.",
  noGroupNameProvided: "No group name provided.",
  actionUnknown: (action) => `Action '${action}' is not supported.`,
  SYNC_INFO_MESSAGE_POPUP: "Tabs are synced securely using end-to-end encryption via Firebase.",
  SYNC_INFO_MESSAGE_OPTIONS: "Configure your Master Sync Password and Group ID below. All data is encrypted before leaving your device.",
  groupCreateSuccess: (name) => `Group '${name}' created locally.`,
  groupDeleteSuccess: (name) => `Group '${name}' deleted locally.`,
  groupRenameSuccess: (name) => `Group renamed to '${name}'.`,
  subscribedToGroup: (name) => `Subscribed to group '${name}'.`,
};
