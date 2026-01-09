# TabTogether Design Document

## Overview
TabTogether is a Firefox browser extension that allows users to send tabs between their devices using Firefox Sync as the communication backbone. It focuses on a simple, "frictionless" user experience.

## Architecture
- **Storage Layer**: Uses `browser.storage.sync` for cross-device data (now bridged to bookmarks for reliability on Android) and `browser.storage.local` for device-specific state.
- **Bridged Sync (Android Optimization)**: A specialized mechanism in `core/storage.js` that transparently mirrors sync storage keys into a JSON-encoded bookmark titled `TabTogetherConfig`. This bypasses the unreliable `storage.sync` implementation on Firefox for Android, ensuring settings like "Task Expiry" sync consistently across all platforms.
- **Communication**: Leverages Firefox Sync's `bookmarks.onCreated` and `bookmarks.onChanged` listeners to handle incoming tab "tasks".
- **Core Components**:
    - `background`: Manages the lifecycle, listens for sync changes, and processes incoming tabs. Now includes a `periodicSync` alarm to ensure consistency on mobile devices where background listeners might be throttled.
    - `storage`: Abstraction layer for interacting with both browser storage areas and the bookmark-based communication channel.
    - `actions`: Higher-level functions for managing groups and subscriptions, unified across platforms.
    - `ui`: A simple popup and options page for user interaction.

## Design Principles
- **KISS (Keep It Simple, Stupid)**: Avoid complex server setups by using existing Firefox Sync infrastructure.
- **Zero Configuration**: Ideally, the user just signs into Firefox Sync and it "just works."
- **Privacy First**: No third-party servers are involved; data remains within the user's Firefox Sync account.

## Technical Constraints
- **Sync Latency**: Firefox Sync is not real-time. Propagation can take anywhere from a few seconds to several minutes.
- **Android Limitations**:
    - `storage.sync` is unreliable and separate from desktop.
    - Background scripts are effectively "event pages" and can be suspended.
    - `onCreated` listeners for bookmarks may not fire if the app is not in the foreground.

## Solutions for Constraints
- **Bookmark-Centric Sync**: Both group management and configuration settings are now stored in bookmarks to ensure cross-platform compatibility.
- **Periodic Polling**: A periodic alarm (`periodicSync`) ensures that甚至 if listeners miss an event, the extension will catch up when it wakes up.
- **Manual Sync Heartbeat**: Both the popup and options page trigger a manual sync check upon opening to provide immediate responsiveness.

## User Identification & Tracking
- **Device Nicknames**: Each installation has a local nickname. When sending a tab, the identity is "burned" into the bookmark title (`[Nickname] Tab Title`). This avoids the complexity of a global registry while providing clear attribution.
- **Persistent History**: A local-only history log (`TAB_HISTORY`) in `storage.local` provides a "Recently Received" queue, solving the issue of missing notifications on mobile.
