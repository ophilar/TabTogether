# TabTogether: Debugging Guide

This guide provides instructions on how to debug the TabTogether browser extension on Windows 11 (Chrome & Firefox) and Android (Firefox for Android).

## General Prerequisites

1.  **Source Code:** The TabTogether extension source code from the repository.
2.  **Target Browser:** The browser you intend to debug on (Google Chrome, Mozilla Firefox).
3.  **Temporary Installation:** You will be loading the extension as a "temporary" or "unpacked" extension for debugging purposes.

## Debugging on Windows 11

### A. Google Chrome

1.  **Open Extensions Page:**
    *   Type `chrome://extensions` in the Chrome address bar and press Enter.
    *   Alternatively, click the three-dot menu (⋮) > Extensions > Manage Extensions.

2.  **Enable Developer Mode:**
    *   In the top-right corner of the Extensions page, toggle on the "Developer mode" switch.

3.  **Load Unpacked Extension:**
    *   Click the "Load unpacked" button that appears after enabling Developer mode.
    *   In the file dialog, navigate to and select the root directory of the TabTogether extension source code (this is the directory that contains the `manifest.json` file). Click "Select Folder".

4.  **Accessing Debug Tools:**
    *   **Background Script (Service Worker):**
        *   On the `chrome://extensions` page, find the TabTogether card.
        *   Click the link that says "Service worker". This will open the Chrome DevTools specifically for the extension's background script.
        *   In this DevTools window, you can use:
            *   **Console:** View `console.log()` statements, errors, and execute JavaScript in the background context.
            *   **Sources:** Set breakpoints in your background script files (e.g., `background.js`, `core/actions.js`), step through code, and inspect variables.
            *   **Application > Storage:** Inspect `chrome.storage.local` and `chrome.storage.sync` by executing commands like `chrome.storage.local.get(null, console.log)` in the console.
            *   **Network:** Monitor network requests made by the background script.
    *   **Popup UI:**
        *   Open the TabTogether popup by clicking its icon in the Chrome toolbar.
        *   Right-click anywhere inside the popup UI.
        *   Select "Inspect" from the context menu. This will open a dedicated DevTools window for the popup's HTML, CSS, and JavaScript (e.g., `popup.js`).
    *   **Options Page:**
        *   Open the extension's options page (e.g., by right-clicking the extension icon and selecting "Options", or via a link in the popup).
        *   Right-click anywhere on the options page.
        *   Select "Inspect". This will open a dedicated DevTools window for the options page.
    *   **Content Scripts (if any are added in the future):**
        *   Navigate to a webpage where the content script is designed to run.
        *   Open the regular Chrome DevTools for that webpage (right-click on the page > Inspect, or press F12).
        *   Go to the "Sources" tab. In the left-hand pane, look for a "Content scripts" section or find your scripts under the extension's ID. `console.log()` statements from content scripts will appear in the main console of the webpage.

5.  **Reloading the Extension:**
    *   After making changes to the extension's code:
        *   Go back to the `chrome://extensions` page.
        *   Find the TabTogether card and click the reload icon (a circular arrow).
    *   You may need to close and reopen any DevTools windows associated with the extension (especially the background script's DevTools). Popups will automatically use the new code when reopened.

### B. Mozilla Firefox

1.  **Open Add-ons Debugging Page:**
    *   Type `about:debugging` in the Firefox address bar and press Enter.
    *   In the left sidebar, click "This Firefox".

2.  **Load Temporary Add-on:**
    *   Click the "Load Temporary Add-on..." button.
    *   Navigate to the root directory of the TabTogether extension and select the `manifest.json` file. Click "Open".

3.  **Accessing Debug Tools:**
    *   **Background Script:**
        *   On the `about:debugging#/runtime/this-firefox` page, find the TabTogether entry.
        *   Click the "Inspect" button next to its name. This will open the Add-on Debugger, focused on the background script.
        *   Use the **Console** and **Debugger** tabs (for breakpoints in `background.js`, `core/` files, etc.).
        *   **Storage:** The "Storage" tab in this debugger allows you to inspect "Extension Storage" (`local` and `sync`).
    *   **Popup UI:**
        *   Open the extension popup by clicking its icon.
        *   **Method 1 (Disable Auto-Hide):** In `about:debugging`, find TabTogether. Click the three-dot menu (⋮) next to it and select "Disable Popup Auto-Hide". Now, when you open the popup, it will stay open. You can then right-click inside it and select "Inspect".
        *   **Method 2 (Browser Toolbox - More Advanced):**
            1.  Type `about:config` in Firefox, search for `devtools.chrome.enabled` and set it to `true`. Also, set `devtools.debugger.remote-enabled` to `true`.
            2.  Open Firefox Menu (☰) > More tools > Browser Toolbox. Accept any security prompts.
            3.  In the Browser Toolbox, use the frame selector (often an icon of a rectangle with an arrow) to select the popup's document (it might be listed by its URL, e.g., `moz-extension://.../popup.html`).
    *   **Options Page:**
        *   Open the extension's options page.
        *   Right-click anywhere on the options page and select "Inspect" (or "Inspect Element").
    *   **Content Scripts (if any are added in the future):**
        *   Navigate to a webpage where the content script is active.
        *   Open the regular Firefox DevTools for that webpage (F12 or right-click > Inspect).
        *   In the "Debugger" tab, your content scripts will be listed under "Sources", usually grouped by the extension's name or internal UUID.

4.  **Reloading the Extension:**
    *   On the `about:debugging#/runtime/this-firefox` page, find the TabTogether entry.
    *   Click the "Reload" button.
    *   DevTools windows (especially the Add-on Debugger for the background script) might need to be closed and reopened, or they might automatically reconnect.

## Debugging on Android (Firefox for Android)

Debugging extensions on Firefox for Android involves connecting your Android device to your desktop computer via USB.

1.  **Prerequisites:**
    *   **Desktop:**
        *   Mozilla Firefox browser installed.
        *   Android Debug Bridge (`adb`) installed and in your system's PATH. `adb` is part of the Android SDK Platform Tools, which can be downloaded separately from Google.
    *   **Android Device:**
        *   Firefox for Android (Firefox Nightly or Firefox Beta are recommended as they often have better debugging support for extensions).
        *   **Enable USB Debugging:**
            1.  Go to Android Settings > About phone.
            2.  Tap "Build number" repeatedly (usually 7 times) until you see a message "You are now a developer!".
            3.  Go back to Settings > System > Developer options.
            4.  Enable "USB debugging".

2.  **Connect Device and Desktop:**
    *   Connect your Android device to your desktop computer using a USB cable.
    *   On your Android device, a prompt "Allow USB debugging?" should appear. Check "Always allow from this computer" (optional, for convenience) and tap "Allow".
    *   Open a terminal or command prompt on your desktop and run `adb devices`. You should see your device listed with "device" next to its ID. If it says "unauthorized", recheck the prompt on your Android device.

3.  **Enable Remote Debugging in Firefox for Android:**
    *   Open Firefox on your Android device.
    *   Tap the three-dot menu (⋮) > Settings.
    *   Scroll down to the "Advanced" section and tap "Remote debugging via USB". Toggle it on.

4.  **Connect from Desktop Firefox:**
    *   On your desktop Firefox, type `about:debugging` in the address bar and press Enter.
    *   In the left sidebar, under "USB Devices" (or a similar heading), your connected Android device should appear.
    *   Click "Connect" next to your device name if it's not already connected. You might need to approve an incoming connection prompt on your Android device.

5.  **Load and Debug Temporary Add-on on Android:**
    *   Once connected, under your device's entry on the `about:debugging` page (on your desktop), you will see a section for "Temporary Extensions".
    *   Click "Load Temporary Add-on".
    *   In the file dialog, navigate to your TabTogether extension's source code directory on your desktop and select the `manifest.json` file.
    *   The extension will be transferred and installed temporarily on your Android device.
    *   **Accessing Debug Tools:**
        *   After the extension is loaded, an "Inspect" button will appear next to its name under your device's entry on `about:debugging` (on your desktop).
        *   Clicking this "Inspect" button will open the Add-on Debugger on your desktop, which is remotely connected to the instance of the extension running on your Android device.
        *   You can use the **Console** to see `console.log` output from the background script and any UI pages (popup, options) opened on the Android device.
        *   Use the **Debugger** to set breakpoints in the background script.
        *   Use the **Storage** tab to inspect "Extension Storage" (`local` and `sync`) on the Android device.
        *   **Debugging UI on Android:** Direct visual inspection of popup/options UI elements (like an element inspector) is more limited. Rely heavily on `console.log` statements from your UI scripts (`popup.js`, `options.js`) which will appear in the remote debugger's console. Test UI interactions directly on the Android device.

6.  **Reloading the Extension on Android:**
    *   After making code changes on your desktop:
        *   Go back to `about:debugging` on your desktop Firefox.
        *   Find the TabTogether temporary extension listed under your Android device.
        *   Click its "Reload" button.
    *   The remote Add-on Debugger should reconnect, or you might need to close and reopen it.

## General Debugging Tips for TabTogether

*   **`console.log()` is Essential:** Use it extensively in `background.js`, `core` modules, `popup.js`, `options.js`, etc., to trace execution flow and inspect the state of variables and storage.
*   **Debugger & Breakpoints:** Utilize the debugger to step through complex logic, especially in `core/actions.js`, `background/cleanup.js`, `background/heartbeat.js`, and message handlers.
*   **Storage Inspection:** Regularly check the contents of `browser.storage.local` and `browser.storage.sync` using the browser's developer tools (as described above) to verify data is being stored and updated correctly. This is crucial for TabTogether.
*   **Test Specific Actions:**
    *   To test `onMessage` handlers in `background.js`, you can send messages from the console of the popup or options page:
        ```javascript
        browser.runtime.sendMessage({ action: "createGroup", groupName: "Test From Console" })
          .then(response => console.log("Response:", response))
          .catch(error => console.error("Error:", error));
        ```
    *   To test alarms, you can temporarily reduce their intervals in `background.js` or trigger them manually from the background script's console (though this is more advanced).
*   **Clear Storage:** When testing flows that depend on initial states (like first-time ID generation), remember to clear the extension's storage using the "Clear" button in the mock storage setup (`test/setup.js` for unit tests) or by manually clearing storage in the browser's DevTools for manual testing.
*   **Check for Errors:** Always monitor all relevant consoles (background, popup, options) for error messages. They often provide direct clues to the problem.
