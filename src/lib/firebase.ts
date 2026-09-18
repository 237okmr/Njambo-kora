import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);

// Use the designated Firestore Database ID if specified
const databaseId = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
  ? firebaseConfig.firestoreDatabaseId
  : undefined;

function getFirestoreLocalCache() {
  if (typeof window === 'undefined') {
    // Running in Node.js / server environment where localStorage and IndexedDB do not exist
    return memoryLocalCache();
  }
  try {
    const hasLocalStorage = typeof window.localStorage !== 'undefined';
    const hasIndexedDB = typeof window.indexedDB !== 'undefined';
    if (hasLocalStorage && hasIndexedDB) {
      return persistentLocalCache({ tabManager: persistentMultipleTabManager() });
    }
  } catch (err) {
    // Restricted sandbox iframe or security context without storage access
    console.warn('[Firebase] Local storage or IndexedDB access restricted, using memory cache:', err);
  }
  return memoryLocalCache();
}

export const db = initializeFirestore(app, {
  localCache: getFirestoreLocalCache(),
  experimentalForceLongPolling: true
}, databaseId);

// Gracefully handle iframe lifecycle and IndexedDB transient closures (e.g., tab backgrounding or iframe reload)
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = (reason?.message || String(reason || '')).toLowerCase();
    if (
      msg.includes('database is closing') ||
      msg.includes('database is hidden') ||
      msg.includes('connection is closing') ||
      msg.includes('the client is offline') ||
      msg.includes('indexeddb')
    ) {
      console.warn('[Firebase/IndexedDB] Handled transient database event:', reason);
      event.preventDefault();
    }
  });
}

export default app;
