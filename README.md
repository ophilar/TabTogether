# TabTogether

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Send tabs between groups of devices seamlessly using Firefox Sync.

## Features

*   **Device Groups:** Organize your Firefox instances (desktop, mobile) into custom groups.
*   **Targeted Sending:** Send tabs to all devices in a specific group.
*   **Firefox Sync Integration:** Leverages your existing Firefox Sync account for secure and private device communication. No separate account needed.
*   **Context Menu:** Right-click on any page or link to quickly send it to your device groups.
*   **Toolbar Popup:** Send the current tab directly from the browser toolbar.
*   **Notifications:** Get notified when a tab is successfully sent (optional).

## How to Use

1.  **Install:** Get TabTogether from the [Firefox Add-ons site](https://addons.mozilla.org/) (Link will be added once published).
2.  **Create Groups:**
    *   Click the TabTogether icon in your browser toolbar to open the popup.
    *   Open the extension's Options page by clicking the gear icon and go to the "Manage Groups" section.
    *   Create one or more groups (e.g., "Work Devices", "Home").
    *   Each Firefox instance where you install TabTogether will automatically register itself. Subscribe registered devices to your desired groups (see caveat below).
3.  **Send Tabs:**
    *   **From Popup:** Navigate to the tab you want to send, click the TabTogether toolbar icon, select the target group, and click "Send Tab".
    *   **From Context Menu:** Right-click anywhere on the page you want to send (or right-click a link) and select "TabTogether: Send to [Group Name]".
4.  **Receive Tabs:** Tabs sent to a group will automatically open on all other devices within that group.

## Caveat

Firefox Sync might cause issues such as latency. Test how this works *for you* in terms of reliability, latency and performance.

**Important** Before subscribing devices to groups, wait until all devices and groups are synced. Then subscribe each device at a time and wait for subscription to sync before subscribing the next one.

## Installation

Install the latest version from the official [Mozilla Add-ons (AMO)](https://addons.mozilla.org/) page for Firefox. (Direct link pending final publication).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Privacy

TabTogether uses Firefox Sync for communication and stores group/device information locally and within Sync's private storage. It does not send your data to any external servers. See the [SECURITY.md](SECURITY.md) for more details.
For specific details on data handling, please refer to our [Privacy Policy](PRIVACY_POLICY.md).

## Contributing & Development Notes

This extension was created to fulfill a personal need using AI assistance (Copilot, Gemini). Due to perceived limitations and latency with Firefox Sync, active development by the original author has paused. Further development, particularly around synchronizing tab states or tab groups, seem challenging under these constraints.

Feedback, bug reports, and contributions are still welcome! Please see the [CONTRIBUTING.md](CONTRIBUTING.md) file for more details on how to get involved and for the full original development notes.

The source code is available at https://github.com/ophilar/TabTogether.
