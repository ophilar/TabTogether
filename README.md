# TabTogether

TabTogether is a Firefox browser extension that lets you effortlessly send tabs between pre-defined groups of your devices, leveraging the power and security of Firefox Sync.

## Features
- Send the current tab to a pre-defined group of devices
- Create, rename, and delete device groups
- Subscribe/unsubscribe devices to groups
- Registry of devices and their last-seen info
- Dark mode
- Context menu integration for quick tab sending
- Notification support

## Installation

### From Source (Temporary Add-on)
1. Download or clone this repository.
2. Open Firefox and go to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on** and select the `manifest.json` file in this folder.
4. The extension will be loaded for your current session.

### From Mozilla Add-ons (Recommended)
1. Visit [TabTogether on AMO](https://addons.mozilla.org/) (when published).
2. Click **Add to Firefox** and follow the prompts.

### Android Installation
1.  **From Mozilla Add-ons (Recommended):** The easiest way is to install from the [Mozilla Add-ons (AMO)](https://addons.mozilla.org/) store directly within Firefox for Android (when published).
2.  **From Source (Developer/Temporary):**
    *   Requires setting up [Android Debug Bridge (adb)](https://developer.android.com/studio/command-line/adb) and enabling USB debugging on your device.
    *   Connect your device to your computer.
    *   Run the command: `web-ext run --target=firefox-android`
    *   **Note:** This method is primarily for development and testing.

**Important Note for Android:** Firefox for Android has limitations on background script execution. TabTogether relies on background processing for automatic syncing and receiving tabs. On Android, you will need to open the extension's popup or options page and use the "Sync Now" button to manually process incoming tabs and sync changes.

## Building and Packaging

### Prerequisites
- [Node.js and npm](https://nodejs.org/) (npm works on Windows, macOS, and Linux)

### Minify JavaScript (Optional, Recommended for Release)
1. Install dependencies:
   ```
   npm install
   ```
2. Minify all JS files:
   ```
   npm run build
   ```
   This will create `*.min.js` files for each JS source file.

### Package for Release
To create a ZIP file for publishing:
```
npm run package
```
This will create `TabTogether.zip` containing your extension files.

Alternatively, you can manually zip all files (except dev files like `.gitignore`, `node_modules`, etc.) into a ZIP archive.

## Testing
- Load the extension as a temporary add-on in Firefox via `about:debugging#/runtime/this-firefox`.
- Test all features, including tab sending, group management, and device registry.
- Use two Firefox profiles or devices with the same Firefox account and Sync enabled for best results.

## Publishing
1. Go to [addons.mozilla.org](https://addons.mozilla.org/developers/).
2. Submit your ZIP file and follow the instructions.
3. Fill out all required metadata, upload screenshots, and respond to reviewer feedback.

## Development
- All source code is in this repository.
- Main files:
  - `background.js` — background logic, sync, alarms
  - `utils.js` — storage and rendering helpers
  - `popup.js` — popup UI logic
  - `options.js` — options/settings page logic
  - `theme.js` — dark mode and theming
  - `shared-ui.js` — shared UI helpers
  - `manifest.json` — extension manifest
- CSS and HTML files for UI
- Icons in the `icons/` folder

## License
MIT License. See [LICENSE](LICENSE) for details.

## Troubleshooting
- Make sure you are logged into the same Firefox account on all devices.
- Enable Sync for Add-ons and Extension Storage in Firefox settings.
- If tabs or groups do not sync, check the browser console for errors and ensure Sync is working.
- **Subscription Issues:** Due to Firefox Sync delays, devices might occasionally get out of sync during group subscription. If you experience issues like tabs not being received or duplicate tabs opening, try unsubscribing and then re-subscribing the affected devices to the group via the Options page.

## Contributing
Pull requests and issues are welcome! See the [GitHub project page](https://github.com/ophilar/TabTogether) for more info.
