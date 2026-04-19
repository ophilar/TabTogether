# TabTogether

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Sub-second, End-to-End Encrypted (E2EE) tab synchronization for Firefox.**

TabTogether allows you to send tabs between your devices (Desktop and Android) instantly. Unlike standard synchronization tools, TabTogether uses a decentralized approach with **End-to-End Encryption**, ensuring your browsing history remains private even from the transport provider.

## Core Features

*   🚀 **Sub-second Sync:** Uses Firebase Realtime Database for instant delivery. No more waiting for Firefox Sync cycles.
*   🔐 **End-to-End Encryption (E2EE):** All tab data (URLs, titles) is encrypted locally using AES-256-GCM. Your **Master Sync Password** never leaves your device.
*   👥 **Device Groups:** Organize your devices into custom sync groups (e.g., "Home", "Work").
*   📡 **Presence Tracking:** See which of your other devices are currently "Live" directly from the settings page.
*   📱 **Android Support:** Fully compatible with Firefox for Android.
*   📜 **Tab History:** Keep track of recently received tabs in a local history log.
*   🛡️ **Security Guards:** Automatic filtering of unsafe URL protocols (rejects `javascript:`, `file:`, etc.).

## How It Works

1.  **Set a Master Sync Password:** Choose a strong password in the extension settings. This password is used to derive encryption keys locally via PBKDF2.
2.  **Create/Join Groups:** Create a group name (which acts as a shared sync channel). All devices in the group must use the **same Group Name** and the **same Master Sync Password**.
3.  **Send Tabs:**
    *   **Toolbar Popup:** Click the TabTogether icon to send your current tab to a specific group.
    *   **Context Menu:** Right-click any link or page to send it instantly.
4.  **Instant Receipt:** The tab will automatically open on all other active devices in that group.

## Why Firebase?

While TabTogether originally used Firefox Sync's bookmarking system, we migrated to Firebase to solve the high latency (often several minutes) and reliability issues inherent in mobile bookmark synchronization. By using Firebase as a "broadcast pipe" combined with E2EE, we achieve the speed of a centralized service with the privacy of a local tool.

## Installation

Install the latest version from the [Mozilla Add-ons (AMO) site](https://addons.mozilla.org/). (Link pending v0.13.0 publication).

## Privacy & Security

*   **Zero-Knowledge:** We use PBKDF2 with 100,000 iterations to derive keys. Your Master Sync Password is never transmitted.
*   **Encrypted Payloads:** URLs are encrypted before being pushed to Firebase.
*   **Local Storage:** All sensitive configurations (keys, passwords, history) are stored in `browser.storage.local`.

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
