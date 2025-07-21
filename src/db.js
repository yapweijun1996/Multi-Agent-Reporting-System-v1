const DB_NAME = 'MultiAgentReportDB';
const CONFIG_STORE_NAME = 'config';
const CSV_DATA_STORE_NAME = 'csvData';
const API_KEY_ID = 'apiKey';

let db;

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) {
      return resolve(db);
    }

    const request = indexedDB.open(DB_NAME, 2); // Version 2 for the new store

    request.onupgradeneeded = (event) => {
      const dbInstance = event.target.result;
      if (!dbInstance.objectStoreNames.contains(CONFIG_STORE_NAME)) {
        dbInstance.createObjectStore(CONFIG_STORE_NAME, { keyPath: 'id' });
      }
      if (!dbInstance.objectStoreNames.contains(CSV_DATA_STORE_NAME)) {
        // Use auto-incrementing key for the CSV data rows
        dbInstance.createObjectStore(CSV_DATA_STORE_NAME, { autoIncrement: true });
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
    const transaction = dbInstance.transaction([CONFIG_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(CONFIG_STORE_NAME);
    const request = store.put({ id: API_KEY_ID, value: key });

    request.onsuccess = () => resolve();
    request.onerror = (event) => {
      console.error('Failed to save API key:', event.target.error);
      reject(event.target.error);
    };
  });
}

export async function saveCsvData(data) {
    const dbInstance = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([CSV_DATA_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(CSV_DATA_STORE_NAME);

        // Clear old data first
        const clearRequest = store.clear();
        clearRequest.onerror = (event) => reject(event.target.error);
        
        clearRequest.onsuccess = () => {
            // Bulk add new data
            data.forEach(row => {
                store.add(row);
            });
        };
        
        transaction.oncomplete = () => resolve();
        transaction.onerror = (event) => reject(event.target.error);
    });
}

export async function loadCsvData() {
    const dbInstance = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([CSV_DATA_STORE_NAME], 'readonly');
        const store = transaction.objectStore(CSV_DATA_STORE_NAME);
        const request = store.getAll();

        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

export async function loadApiKey() {
  const dbInstance = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = dbInstance.transaction([CONFIG_STORE_NAME], 'readonly');
    const store = transaction.objectStore(CONFIG_STORE_NAME);
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