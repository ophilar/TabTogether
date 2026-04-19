import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, connectAuthEmulator } from "firebase/auth";
import { getDatabase, ref, push, onChildAdded, remove, connectDatabaseEmulator, query, orderByChild, endAt, get, onValue, set, serverTimestamp } from "firebase/database";
import { storage, addToHistory } from "../core/storage.js";
import { LOCAL_STORAGE_KEYS } from "../common/constants.js";
import { deriveSyncKey, decryptPayload } from "../core/crypto.js";

// Firebase Config - DO NOT COMMIT SECRETS
const firebaseConfig = {
  apiKey: "PLACEHOLDER_API_KEY",
  authDomain: "tabtogether-d6291.firebaseapp.com",
  projectId: "tabtogether-d6291",
  storageBucket: "tabtogether-d6291.firebasestorage.app",
  messagingSenderId: "PLACEHOLDER_SENDER_ID",
  appId: "1:PLACEHOLDER_SENDER_ID:web:6bc443bc3966ca02819eda",
  measurementId: "PLACEHOLDER_MEASUREMENT_ID"
};

// --- Singleton Firebase Initialization ---
let _app, _auth, _db;

export function getFirebaseApp() {
  if (!_app) _app = initializeApp(firebaseConfig);
  return _app;
}

export function getFirebaseAuth() {
  if (!_auth) {
    _auth = getAuth(getFirebaseApp());
    if (globalThis.__FIREBASE_EMULATOR__) {
      connectAuthEmulator(_auth, "http://127.0.0.1:9099", { disableWarnings: true });
    }
  }
  return _auth;
}

export function getFirebaseDb() {
  if (!_db) {
    _db = getDatabase(getFirebaseApp());
    if (globalThis.__FIREBASE_EMULATOR__) {
      connectDatabaseEmulator(_db, "127.0.0.1", 9000);
    }
  }
  return _db;
}

export async function signInToFirebase() {
  return signInAnonymously(getFirebaseAuth());
}

// --- URL Safety ---
const SAFE_PROTOCOLS = ['http:', 'https:'];

function isUrlSafe(url) {
  try {
    const parsed = new URL(url);
    return SAFE_PROTOCOLS.includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Handler for a single tab payload from Firebase.
 */
export async function handleIncomingTab(payload, tabId, groupId, derivedKey, listenStartTime = 0) {
  try {
    if (payload.timestamp && payload.timestamp < listenStartTime) return;

    const processedIds = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.PROCESSED_TAB_IDS, []);
    if (processedIds.includes(tabId)) return;

    const localSenderId = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SENDER_ID);
    if (payload.senderId && payload.senderId === localSenderId) return;

    const url = await decryptPayload(new Uint8Array(payload.iv), new Uint8Array(payload.data), derivedKey);

    if (!isUrlSafe(url)) {
      console.warn("Rejected unsafe URL protocol.");
      return;
    }

    await browser.tabs.create({ url });
    await addToHistory({ url, title: url, fromDevice: payload.nickname || "Remote Device" });

    const updatedIds = [tabId, ...processedIds].slice(0, 100);
    await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.PROCESSED_TAB_IDS, updatedIds);

  } catch (error) {
    console.error("Failed to process incoming tab:", error.message);
  }
}

// --- Tab Listeners & Presence ---
let activeUnsubscribeFunctions = [];

export function stopAllListeners() {
  activeUnsubscribeFunctions.forEach(unsub => unsub());
  activeUnsubscribeFunctions = [];
}

/**
 * Updates the device's presence in a group.
 */
async function updatePresence(groupName) {
  const db = getFirebaseDb();
  const senderId = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SENDER_ID);
  const nickname = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.DEVICE_NICKNAME, "Unknown Device");
  
  if (!senderId) return;

  const presenceRef = ref(db, `groups/${groupName}/presence/${senderId}`);
  await set(presenceRef, {
    nickname,
    lastSeen: serverTimestamp()
  });
}

export async function refreshListeners() {
  stopAllListeners();

  const syncPassword = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SYNC_PASSWORD);
  const subscriptions = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []);

  if (!syncPassword || subscriptions.length === 0) return;

  for (const groupName of subscriptions) {
    try {
      const db = getFirebaseDb();
      const groupRef = ref(db, `groups/${groupName}/tabs`);
      const listenStartTime = Date.now();
      const derivedKey = await deriveSyncKey(syncPassword, groupName);

      const unsubTabs = onChildAdded(groupRef, (snapshot) => {
        handleIncomingTab(snapshot.val(), snapshot.key, groupName, derivedKey, listenStartTime);
      });

      activeUnsubscribeFunctions.push(unsubTabs);
      await updatePresence(groupName);
      console.log(`FirebaseTransport: Listening for tabs in "${groupName}"`);
    } catch (err) {
      console.error(`FirebaseTransport: Error in group "${groupName}":`, err);
    }
  }
}

export async function listenForTabs() {
    return refreshListeners();
}

/**
 * Gets members currently in a group.
 */
export async function getGroupMembers(groupName) {
  const db = getFirebaseDb();
  const presenceRef = ref(db, `groups/${groupName}/presence`);
  const snapshot = await get(presenceRef);
  if (!snapshot.exists()) return [];
  
  const data = snapshot.val();
  return Object.keys(data).map(id => ({
    id,
    nickname: data[id].nickname,
    lastSeen: data[id].lastSeen
  }));
}

/**
 * Periodic Cleanup.
 */
export async function cleanupStaleTabsInFirebase() {
  const subscriptions = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []);
  const db = getFirebaseDb();
  const staleTime = Date.now() - (48 * 60 * 60 * 1000); // 48h
  const presenceStaleTime = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days

  for (const groupName of subscriptions) {
    try {
      // 1. Cleanup Tabs
      const tabsRef = ref(db, `groups/${groupName}/tabs`);
      const staleTabsQuery = query(tabsRef, orderByChild('timestamp'), endAt(staleTime));
      const tabsSnap = await get(staleTabsQuery);
      if (tabsSnap.exists()) {
        const updates = {};
        Object.keys(tabsSnap.val()).forEach(id => updates[id] = null);
        await set(tabsRef, updates);
      }

      // 2. Cleanup Presence
      const presenceRef = ref(db, `groups/${groupName}/presence`);
      const stalePresenceQuery = query(presenceRef, orderByChild('lastSeen'), endAt(presenceStaleTime));
      const presenceSnap = await get(stalePresenceQuery);
      if (presenceSnap.exists()) {
        const updates = {};
        Object.keys(presenceSnap.val()).forEach(id => updates[id] = null);
        await set(presenceRef, updates);
      }
    } catch (e) {
      console.error(`Cleanup failed for "${groupName}":`, e);
    }
  }
}

export { isUrlSafe };
