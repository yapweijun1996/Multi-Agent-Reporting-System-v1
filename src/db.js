const DB_NAME = 'MultiAgentReportDB';
const STORE_NAME = 'config';
const API_KEY_ID = 'apiKey';

let db;

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) {
      return resolve(db);
    }

    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = (event) => {
      const dbInstance = event.target.result;
      if (!dbInstance.objectStoreNames.contains(STORE_NAME)) {
        dbInstance.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      resolve(db);
    };

    request.onerror = (event) => {
      console.error('IndexedDB error:', event.target.error);
      reject('IndexedDB error: ' + event.target.error);
    };
  });
}

export async function saveApiKey(key) {
  const dbInstance = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = dbInstance.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put({ id: API_KEY_ID, value: key });

    request.onsuccess = () => resolve();
    request.onerror = (event) => {
      console.error('Failed to save API key:', event.target.error);
      reject(event.target.error);
    };
  });
}

export async function loadApiKey() {
  const dbInstance = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = dbInstance.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(API_KEY_ID);

    request.onsuccess = (event) => {
      if (event.target.result) {
        resolve(event.target.result.value);
      } else {
        resolve(null);
      }
    };

    request.onerror = (event) => {
      console.error('Failed to load API key:', event.target.error);
      reject(event.target.error);
    };
  });
}