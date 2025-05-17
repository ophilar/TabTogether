# TabTogether: Code Quality & Improvement Roadmap

This document outlines key areas for enhancing the TabTogether extension's codebase, focusing on quality, maintainability, performance, and user experience. Items are prioritized to guide development efforts.

## I. High Priority Enhancements

### 1. Refactor `background.js` Message Handling
*   **Current State:** The `onMessage` listener in `d:\OneDrive\Documents\GitHub\TabTogether\background\background.js` handles numerous actions.
*   **Action:** Continue the planned refactor (as hinted in `background.js` comments) to move message handling logic into separate modules (e.g., `background/message-handlers/groupActionHandlers.js`, `deviceActionHandlers.js`, `taskActionHandlers.js`, `generalHandlers.js`).
*   **Benefit:** Significantly improves readability, testability, and maintainability as the extension grows. This is crucial for managing complexity.

### 2. Data Model Consistency: `groupBits` and `bitmask.js`
*   **Observation:** The data model has shifted towards `SYNC_STORAGE_KEYS.SUBSCRIPTIONS` for device-group links, and `senderDeviceId`/`processedBy` for tasks, moving away from `processedMask` and the direct use of `groupBits` for task processing.
*   **Action:**
    *   **Remove `d:\OneDrive\Documents\GitHub\TabTogether\core\bitmask.js`** and any imports or references to it.
    *   **Remove `groupState` handling from `d:\OneDrive\Documents\GitHub\TabTogether\background\cleanup.js`:**
        *   In `performStaleDeviceCheck`, remove the `cachedGroupState` parameter and all logic related to fetching, updating, or merging `groupState`.
    *   **Update `ALARM_STALE_CHECK` handler in `d:\OneDrive\Documents\GitHub\TabTogether\background\background.js`:**
        *   Stop passing `cachedGroupState` to `performStaleDeviceCheck`.
*   **Benefit:** Simplifies the overall data model, reduces potential redundancy, clarifies data flow, and removes potentially unused or incomplete code.

### 3. Comprehensive Input Validation
*   **Current State:** Some input validation exists (e.g., for group names in `d:\OneDrive\Documents\GitHub\TabTogether\core\actions.js`).
*   **Action:** Systematically review and enhance input validation for:
    *   All user-provided data (e.g., new group names, device names from options page).
    *   Data received via `browser.runtime.onMessage` in `d:\OneDrive\Documents\GitHub\TabTogether\background\background.js` before it's passed to action handlers. Ensure robust handling of missing, empty, invalid type, or excessively long inputs.
*   **Benefit:** Improves security and stability by preventing errors, unexpected behavior, and potential misuse.

## II. Medium Priority Enhancements

### 1. Configuration Management & User Settings
*   **Current State:** Core constants are well-managed in `common/constants.js`. Values like `HEARTBEAT_INTERVAL_MIN`, `DEFAULT_STALE_DEVICE_THRESHOLD_DAYS` are hardcoded in `d:\OneDrive\Documents\GitHub\TabTogether\background\background.js`.
*   **Action:** Evaluate these configurable values.
    *   Move them to `common/constants.js` for better centralization.
    *   Consider which of these might benefit from becoming user-configurable settings, stored in `browser.storage.sync` and managed via the options UI.
*   **Benefit:** Increases flexibility, allows users to tailor the extension's behavior to their needs, and centralizes configuration.

### 2. Internationalization (i18n)
*   **Current State:** Uses a `STRINGS` object in `common/constants.js`.
*   **Action:** Transition to the standard WebExtension i18n mechanism for all user-facing strings:
    *   Replace direct `STRINGS.someString` usage with `browser.i18n.getMessage("messageName")`.
    *   Create `_locales/en/messages.json` for English strings.
    *   Add `_locales/{locale_code}/messages.json` files for other target languages.
*   **Benefit:** Makes the extension accessible to a wider global audience and is the standard practice for localizable extensions.

### 3. Enhanced Error Handling and Consistent User Feedback
*   **Current State:** Error logging exists in `core/storage.js`. UI feedback is present in `d:\OneDrive\Documents\GitHub\TabTogether\ui\popup\popup.js` via `showMessage` and `showSendStatus`.
*   **Action:**
    *   Ensure all user-initiated actions provide clear, user-friendly feedback for both success and failure scenarios across all UIs (popup, options).
    *   Utilize the (to-be-internationalized) strings for these messages.
    *   Standardize how errors are reported to the user.
*   **Benefit:** Improves user experience, helps users understand the extension's state, and aids in troubleshooting.

### 4. Code Clarity, Comments, and Formatting
*   **Current State:** Generally good use of `async/await`, clear function names, and some comments.
*   **Action:**
    *   Review complex logic sections (e.g., in `background.js`, `core/actions.js`, `background/cleanup.js`) and add/improve comments to explain the *intent* and *reasoning* (the "why"), not just *what* the code does.
    *   Adopt and enforce a consistent code style using a linter (e.g., ESLint) and a code formatter (e.g., Prettier). Configure these tools in your project.
*   **Benefit:** Enhances long-term maintainability, improves collaboration, and makes the codebase easier to understand.

### 5. Background Script State Management/Caching
*   **Observation:** State like `instanceId`, `instanceName` is fetched multiple times in `d:\OneDrive\Documents\GitHub\TabTogether\background\background.js` event listeners (e.g., `onAlarm`, `onMessage`).
*   **Action:**
    *   `getInstanceId` in `d:\OneDrive\Documents\GitHub\TabTogether\core\instance.js` already has an effective in-memory cache (`instanceIdCache`).
    *   For other frequently accessed but relatively stable data within the background script's active lifecycle (e.g., `instanceName` if not changing often, or perhaps even `localGroupBits` if only updated by explicit user actions), evaluate if a short-lived local cache within `background.js` itself could be beneficial. This cache would be populated on initialization and updated/cleared on significant events (like `syncDataChanged` or specific messages that modify this state).
    *   Alternatively, ensure that if state is fetched by a calling function, it's passed down as parameters to avoid redundant fetches in deeper functions.
*   **Benefit:** Potentially reduces redundant storage reads, especially for `browser.storage.local`, improving responsiveness for frequent background operations.

## III. General Advice & Future Considerations

### 1. Testing
*   **Action:** Maintain and expand the comprehensive test suite in `test/`. As new features are added or existing ones modified, ensure corresponding unit and/or integration tests are written or updated. Pay special attention to testing edge cases and error conditions.

### 2. Performance of `storage.mergeSyncStorage`
*   **Observation:** `storage.mergeSyncStorage` in `d:\OneDrive\Documents\GitHub\TabTogether\core\storage.js` fetches all sync data via `browser.storage.sync.get(null)`.
*   **Action:** The current implementation is robust and likely sufficient, especially since updates in `background/cleanup.js` and `background/heartbeat.js` are now structured to provide `newData` containing only the top-level keys intended for change. Monitor performance if sync storage grows very large or if `mergeSyncStorage` is called with very high frequency for disparate keys. If performance becomes an issue, a more granular fetch/merge/set for only modified top-level keys could be considered as a future optimization.

### 3. Security
*   **Permissions:** Regularly review `manifest.json` to ensure only the minimum necessary permissions are requested. Avoid overly broad permissions.
*   **Content Scripts:** If content scripts are introduced in the future, strictly validate any messages exchanged with the background script and limit their capabilities to minimize security risks.

### 4. Options Page User Experience
*   **Action:** Ensure all settings and features on the options page (`d:\OneDrive\Documents\GitHub\TabTogether\ui\options\options-ui.js` and its HTML) are clearly explained to the user. Provide sensible default values for any settings and consider adding a "reset to defaults" option if applicable.

This roadmap provides a structured approach to further refining TabTogether. Prioritize based on the most significant impact on stability, maintainability, and user experience, balanced with available development time.
