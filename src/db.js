const DB_NAME = 'MultiAgentReportDB';
const DB_VERSION = 3;
const CONFIG_STORE_NAME = 'config';
const METADATA_STORE_NAME = 'db_metadata';
const DATA_STORE_NAME = 'csv_data_store';

const API_KEY_ID = 'apiKey';
const TABLE_LIST_ID = 'table_list';

let db;

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) {
      return resolve(db);
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const dbInstance = event.target.result;
      if (!dbInstance.objectStoreNames.contains(CONFIG_STORE_NAME)) {
        dbInstance.createObjectStore(CONFIG_STORE_NAME, { keyPath: 'id' });
      }
      if (!dbInstance.objectStoreNames.contains(METADATA_STORE_NAME)) {
          dbInstance.createObjectStore(METADATA_STORE_NAME, { keyPath: 'id' });
      }
      if (!dbInstance.objectStoreNames.contains(DATA_STORE_NAME)) {
        const dataStore = dbInstance.createObjectStore(DATA_STORE_NAME, { autoIncrement: true });
        dataStore.createIndex('by_tableName', 'tableName', { unique: false });
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

// --- API Key Management ---
export async function saveApiKey(key) {
  const dbInstance = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = dbInstance.transaction([CONFIG_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(CONFIG_STORE_NAME);
    store.put({ id: API_KEY_ID, value: key });
    transaction.oncomplete = () => resolve();
    transaction.onerror = (event) => reject(event.target.error);
  });
}

export async function loadApiKey() {
  const dbInstance = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = dbInstance.transaction([CONFIG_STORE_NAME], 'readonly');
    const store = transaction.objectStore(CONFIG_STORE_NAME);
    const request = store.get(API_KEY_ID);
    request.onsuccess = (event) => {
        resolve(event.target.result ? event.target.result.value : null);
    };
    request.onerror = (event) => reject(event.target.error);
  });
}

// --- Table (Dataset) Management ---

export async function listTables() {
    const dbInstance = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([METADATA_STORE_NAME], 'readonly');
        const store = transaction.objectStore(METADATA_STORE_NAME);
        const request = store.get(TABLE_LIST_ID);
        request.onsuccess = (event) => {
            resolve(event.target.result ? event.target.result.names : []);
        };
        request.onerror = (event) => reject(event.target.error);
    });
}

export async function saveNewCsvAsTable(tableName, data) {
    const dbInstance = await openDB();
    return new Promise(async (resolve, reject) => {
        const transaction = dbInstance.transaction([DATA_STORE_NAME, METADATA_STORE_NAME], 'readwrite');
        const dataStore = transaction.objectStore(DATA_STORE_NAME);
        const metadataStore = transaction.objectStore(METADATA_STORE_NAME);

        data.forEach(row => {
            dataStore.add({ ...row, tableName });
        });

        const tableListRequest = metadataStore.get(TABLE_LIST_ID);
        tableListRequest.onsuccess = (event) => {
            const tableListRecord = event.target.result;
            const existingTables = tableListRecord ? tableListRecord.names : [];
            if (!existingTables.includes(tableName)) {
                metadataStore.put({ id: TABLE_LIST_ID, names: [...existingTables, tableName] });
            }
        };
        
        transaction.oncomplete = () => resolve();
        transaction.onerror = (event) => reject(event.target.error);
    });
}

export async function loadDataFromTable(tableName) {
    const dbInstance = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([DATA_STORE_NAME], 'readonly');
        const store = transaction.objectStore(DATA_STORE_NAME);
        const index = store.index('by_tableName');
        const request = index.getAll(tableName);
        
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

export async function deleteTable(tableName) {
    const dbInstance = await openDB();
    return new Promise(async (resolve, reject) => {
        const transaction = dbInstance.transaction([DATA_STORE_NAME, METADATA_STORE_NAME], 'readwrite');
        const dataStore = transaction.objectStore(DATA_STORE_NAME);
        const metadataStore = transaction.objectStore(METADATA_STORE_NAME);
        
        const index = dataStore.index('by_tableName');
        const request = index.openKeyCursor(IDBKeyRange.only(tableName));
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                dataStore.delete(cursor.primaryKey);
                cursor.continue();
            }
        };
        
        const tableListRequest = metadataStore.get(TABLE_LIST_ID);
        tableListRequest.onsuccess = (event) => {
            const tableListRecord = event.target.result;
            if (tableListRecord) {
                const newTableList = tableListRecord.names.filter(name => name !== tableName);
                metadataStore.put({ id: TABLE_LIST_ID, names: newTableList });
            }
        };

        transaction.oncomplete = () => resolve();
        transaction.onerror = (event) => reject(event.target.error);
    });
}

export async function getTableSchemas() {
    const dbInstance = await openDB();
    const tableNames = await listTables();
    const schemas = {};

    for (const tableName of tableNames) {
        const dataSample = await loadDataFromTable(tableName); // Assuming this returns an array
        if (dataSample.length > 0) {
            schemas[tableName] = Object.keys(dataSample[0]).filter(k => k !== 'tableName');
        }
    }
    return schemas;
}