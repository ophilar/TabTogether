# TabTogether: Production Setup & Testing Guide

This guide provides the official steps for configuring, building, and verifying TabTogether in a production environment with End-to-End Encryption (E2EE) and Firebase.

---

## 1. Firebase Backend Setup

TabTogether uses Firebase Realtime Database as its transport layer. Follow these steps to set up your own instance:

1.  **Create a Firebase Project:** Visit the [Firebase Console](https://console.firebase.google.com/) and create a new project.
2.  **Enable Anonymous Auth:** Go to **Build > Authentication > Sign-in method** and enable **Anonymous**.
3.  **Create Realtime Database:** Go to **Build > Realtime Database**, create a database, and choose your preferred region.
4.  **Configure Security Rules:** In the **Rules** tab of your database, paste the contents of `database.rules.json` from this repository.
5.  **Get Configuration:** In Project Settings, add a new **Web App** and copy the `firebaseConfig` object values.

---

## 2. Secure Build Process

The project uses a `.env` injection system to keep your Firebase keys out of the source code.

1.  **Prepare Environment Variables:**
    ```bash
    cp .env.template .env
    ```
2.  **Fill in Secrets:** Open `.env` and enter your values from the Firebase Console:
    *   `FIREBASE_API_KEY`
    *   `FIREBASE_SENDER_ID`
    *   `FIREBASE_MEASUREMENT_ID`
3.  **Run Production Build:**
    ```bash
    npm run build
    ```
    This generates a minified, secret-injected ZIP in `web-ext-artifacts/`.

---

## 3. Detailed Step-by-Step Testing Plan

Follow these steps to verify that the E2EE and synchronization are working correctly between two devices.

### Phase A: Installation
*   **On Desktop:** Open Firefox → `about:debugging` → **This Firefox** → **Load Temporary Add-on** → Select `manifest.json` from the `dist/` directory.
*   **On Mobile:** Use Firefox Nightly and install via a Custom Add-on Collection, or use `web-ext run --target=firefox-android`.

### Phase B: E2EE Handshake
Perform this on **both** devices:
1.  Open **TabTogether Options**.
2.  Set a **Nickname** (e.g., "Laptop" and "Phone").
3.  Enter the **same Group ID** (e.g., `test-group-2026`).
4.  Enter the **same Master Sync Password**. *Crucial: This password never leaves your device.*
5.  Click **Save Configuration**.

### Phase C: Synchronization Test
1.  **Verify Presence:** On the Laptop's Options page, check the "Group Members" section. You should see "Phone" appear with a **green glowing ring**, indicating it is "Live".
2.  **Send Tab:** On the Laptop, browse to `https://wikipedia.org`, right-click the page, and select **TabTogether > Send to test-group-2026**.
3.  **Result:** The tab should open on the Phone within ~1 second.

### Phase D: Security & Privacy Audit (The "Zero-Knowledge" Test)
1.  **Inspect Firebase:** Open your Firebase Realtime Database console.
2.  **Navigate to Data:** Go to `groups/test-group-2026/tabs`.
3.  **Verify Encryption:** You should see entries with `data` and `iv` fields (byte arrays).
    *   **PASS:** If the URL is unreadable and looks like random numbers.
    *   **FAIL:** If you can see "wikipedia.org" in the console.

### Phase E: Robustness Checks
1.  **Protocol Guard:** Attempt to send a `javascript:alert(1)` URL. Verify that the extension blocks the send and logs a warning in the background console.
2.  **Cold Start:** Close Firefox on the Phone. Send a tab from the Laptop. Open Firefox on the Phone. The tab should trigger immediately upon launch.
3.  **History Persistence:** Open the TabTogether popup and verify the "Recently Received" list correctly attributes the tab to the Laptop's nickname.
