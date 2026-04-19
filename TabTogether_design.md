# TabTogether Design Document

## Overview
TabTogether is a Firefox browser extension that allows users to send tabs between their devices instantly. It uses Firebase as the real-time transport layer and implements End-to-End Encryption (E2EE) with a user-provided Master Sync Password.

## Architecture
- **Transport Layer**: Uses Firebase Realtime Database for instant delivery of tab payloads across devices.
- **Security (E2EE)**: All tab data (URLs, titles) is encrypted using AES-256-GCM before leaving the device. 
    - **Key Derivation**: A unique 256-bit key is derived for each sync group using PBKDF2 (100,000 iterations, SHA-256) with the user's Master Sync Password and the Group ID (used as salt).
    - **Deterministic**: This allows multiple devices to arrive at the same encryption key without ever sharing the raw key or the password over the network.
- **Storage Layer**: Uses `browser.storage.local` for all device-specific state, including the Master Sync Password and Group ID.
- **Communication**: Leverages Firebase `onChildAdded` listeners for near-instant synchronization when the browser is active.
- **Core Components**:
    - `background/firebase-transport.js`: Manages Firebase connections, authentication (anonymous), and listeners.
    - `core/crypto.js`: Implements the PBKDF2 derivation and AES-GCM encryption/decryption logic.
    - `core/tasks.js`: Handles the creation and consumption of sync tasks (encrypted tab payloads).
    - `ui`: Popup and Options pages for configuring the Master Sync Password and managing groups.

## Design Principles
- **Instant Sync**: Replaces the legacy bookmark-based sync with Firebase for sub-second tab delivery.
- **Privacy First**: End-to-End Encryption ensures that even Firebase/Google cannot read the URLs being synced. No third-party servers see unencrypted data.
- **User Ownership**: The user controls their own "Sync Group ID" and "Master Sync Password", providing a private sync channel.

## Technical Constraints & Solutions
- **Mobile Background Throttling**: Firebase listeners on Android may be suspended when the browser is in the background. 
    - **Solution**: The extension refreshes listeners when the browser is opened and provides a "Recently Received" history log in the popup.
- **Echo Prevention**: A persistent `senderId` (UUID) is generated per installation and included in every payload to prevent a device from opening tabs it sent itself.
- **URL Safety**: Both the sender and receiver validate URL protocols (rejecting `javascript:`, `file:`, `data:`) to prevent cross-device scripting or local file exposure.

## User Identification & Tracking
- **Device Nicknames**: Each installation has a local nickname for attribution in the history log and visibility to other members of the group.
- **Presence Tracking**: A real-time presence system is implemented using the `groups/[groupId]/presence/` path in Firebase.
    - **Mechanism**: Each active device periodically updates its `lastSeen` timestamp and `nickname`.
    - **UI Visibility**: The Options UI displays other members of a group as "Live" if seen in the last 5 minutes.
    - **Persistence**: Records are automatically pruned by background tasks if a device remains inactive for more than 7 days.
- **Persistent History**: A local-only history log (`TAB_HISTORY`) in `storage.local` provides a "Recently Received" queue for user review.

## URL Translation (Roadmap)
- **Strategy**: For the planned "Mobile URL Translation" feature, the extension will utilize a core utility for active `tabs.create` translation.
- **Patterns**:
    - **Mobile → Desktop**: Strip `m.` subdomains (e.g., `m.wikipedia.org` → `wikipedia.org`).
    - **Desktop → Mobile**: Convert standard subdomains to their `m.` equivalents when the destination is an Android device.
