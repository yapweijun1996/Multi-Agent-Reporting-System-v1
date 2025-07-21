const DB_NAME = 'MultiAgentReportDB';
const DB_VERSION = 3; // Incremented version for new schema
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
        // Create an index on `tableName` to allow for fast querying of data for a specific table.
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
  const transaction = dbInstance.transaction([CONFIG_STORE_NAME], 'readwrite');
  const store = transaction.objectStore(CONFIG_STORE_NAME);
  await store.put({ id: API_KEY_ID, value: key });
}

export async function loadApiKey() {
  const dbInstance = await openDB();
  const transaction = dbInstance.transaction([CONFIG_STORE_NAME], 'readonly');
  const store = transaction.objectStore(CONFIG_STORE_NAME);
  const request = await store.get(API_KEY_ID);
  return request ? request.value : null;
}

// --- Table (Dataset) Management ---

export async function listTables() {
    const dbInstance = await openDB();
    const transaction = dbInstance.transaction([METADATA_STORE_NAME], 'readonly');
    const store = transaction.objectStore(METADATA_STORE_NAME);
    const tableList = await store.get(TABLE_LIST_ID);
    // Ensure we always return an array, even if the record is null/undefined.
    return tableList ? tableList.names : [];
}

export async function saveNewCsvAsTable(tableName, data) {
    const dbInstance = await openDB();
    const transaction = dbInstance.transaction([DATA_STORE_NAME, METADATA_STORE_NAME], 'readwrite');
    const dataStore = transaction.objectStore(DATA_STORE_NAME);
    const metadataStore = transaction.objectStore(METADATA_STORE_NAME);

    // 1. Add the new data, tagged with the table name
    data.forEach(row => {
        dataStore.add({ ...row, tableName });
    });

    // 2. Update the list of tables in metadata
    const tableListRecord = await metadataStore.get(TABLE_LIST_ID);
    const existingTables = tableListRecord ? tableListRecord.names : [];
    if (!existingTables.includes(tableName)) {
        await metadataStore.put({ id: TABLE_LIST_ID, names: [...existingTables, tableName] });
    }
    
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = (event) => reject(event.target.error);
    });
}

export async function loadDataFromTable(tableName) {
    const dbInstance = await openDB();
    const transaction = dbInstance.transaction([DATA_STORE_NAME], 'readonly');
    const store = transaction.objectStore(DATA_STORE_NAME);
    const index = store.index('by_tableName');
    const request = index.getAll(tableName);
    
    return new Promise((resolve, reject) => {
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

export async function deleteTable(tableName) {
    const dbInstance = await openDB();
    const transaction = dbInstance.transaction([DATA_STORE_NAME, METADATA_STORE_NAME], 'readwrite');
    const dataStore = transaction.objectStore(DATA_STORE_NAME);
    const metadataStore = transaction.objectStore(METADATA_STORE_NAME);
    
    // 1. Delete all data associated with the table
    const index = dataStore.index('by_tableName');
    const request = index.openKeyCursor(IDBKeyRange.only(tableName));
    request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
            dataStore.delete(cursor.primaryKey);
            cursor.continue();
        }
    };
    
    // 2. Remove the table from the metadata list
    const tableListRecord = await metadataStore.get(TABLE_LIST_ID);
    if (tableListRecord) {
        const newTableList = tableListRecord.names.filter(name => name !== tableName);
        await metadataStore.put({ id: TABLE_LIST_ID, names: newTableList });
    }

    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = (event) => reject(event.target.error);
    });
}