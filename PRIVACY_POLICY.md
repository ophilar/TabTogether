# Privacy Policy for TabTogether

**Last Updated:** 2025-05-03

This Privacy Policy describes how TabTogether ("the Extension", "we", "us") handles your information. By using TabTogether, you agree to the collection and use of information in accordance with this policy.

## Information We Handle

TabTogether is designed to facilitate sending browser tabs between your own devices using Mozilla's Firefox Sync service. We do **not** collect or transmit your personal data or browsing history to any external servers controlled by the developer or third parties (other than Mozilla via Firefox Sync).

The extension stores two types of data:

1.  **Locally Stored Data (`storage.local`):** This data is stored only on the specific device where the extension is installed and is **not** synced or shared elsewhere. It includes:
    *   A unique identifier (`myInstanceId`) for your device within the extension.
    *   The name you assign to your device (`myInstanceName`).
    *   Your group subscription preferences (`mySubscriptions`, `myGroupBits`).
    *   A record of tasks already processed by this device (`processedTaskIds`) to prevent duplicates.
    *   Your extension settings preferences (e.g., theme, sync interval, notification settings).
    *   Cached platform information (`platformInfo`) for efficient operation.

2.  **Synced Data (`storage.sync`):** This data is stored using Mozilla's Firefox Sync infrastructure and is accessible only to you across your devices logged into the same Firefox Account where Sync is enabled. The developer **cannot** access this data. It includes:
    *   Definitions of the groups you create (`definedGroups`).
    *   The state of your groups, including which devices are subscribed (`groupState`).
    *   The registry of your devices known to the extension, including their names and subscription details (`deviceRegistry`).
    *   The tab data (URL and Title) you explicitly choose to send to a group (`groupTasks`). This data is temporary and automatically cleaned up based on your settings or default expiry times.
    *   Configurable thresholds for device and task cleanup (`staleDeviceThresholdDays`, `taskExpiryDays`).

## How We Use Information

*   **Local Data:** Used solely for the functioning of the extension on your device (e.g., identifying the device, applying settings, preventing duplicate tab openings).
*   **Synced Data:** Used solely to enable the core functionality of sharing group definitions, device information, and tab tasks between your own synced devices via Firefox Sync.

## Data Security

Synced data relies entirely on the security mechanisms provided by Mozilla's Firefox Sync. We recommend using a strong password for your Firefox Account and enabling relevant security features. Local data is protected by your browser's standard security measures.

## User Control

You can manage your synced data by deleting groups or removing devices within the extension's settings. You can clear all extension data (local and synced) by removing the extension or using your browser's "Clear Data" functionality for extensions.

## Changes to This Policy

We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy within the extension or on its official listing page.

## Contact Us

If you have any questions about this Privacy Policy, please open an issue on the GitHub project page.