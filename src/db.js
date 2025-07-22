const DB_NAME = 'MultiAgentReportDB';
const DB_VERSION = 4;
const CONFIG_STORE_NAME = 'config';
const METADATA_STORE_NAME = 'db_metadata';
const SCHEMA_STORE_NAME = 'db_schema';
const DATA_STORE_NAME = 'csv_data_store';

const API_KEY_ID = 'apiKey';
const TABLE_LIST_ID = 'table_list';
const DB_SCHEMA_ID = 'master_schema';

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
      if (!dbInstance.objectStoreNames.contains(SCHEMA_STORE_NAME)) {
          dbInstance.createObjectStore(SCHEMA_STORE_NAME, { keyPath: 'id' });
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

export async function saveTableData(tableName, data) {
    const dbInstance = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([DATA_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(DATA_STORE_NAME);
        data.forEach(row => {
            store.add({ ...row, tableName });
        });
        transaction.oncomplete = () => resolve();
        transaction.onerror = (event) => reject(event.target.error);
    });
}

export async function updateTableList(newTableNames) {
    if (!newTableNames || newTableNames.length === 0) return;
    const dbInstance = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([METADATA_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(METADATA_STORE_NAME);
        const request = store.get(TABLE_LIST_ID);
        request.onsuccess = (event) => {
            const tableListRecord = event.target.result;
            const existingTables = tableListRecord ? tableListRecord.names : [];
            const uniqueNewTables = newTableNames.filter(name => !existingTables.includes(name));
            if (uniqueNewTables.length > 0) {
                store.put({ id: TABLE_LIST_ID, names: [...existingTables, ...uniqueNewTables] });
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
    const fullSchema = await loadDbSchema();
    if (!fullSchema) return {};

    // This is a temporary adapter to maintain compatibility with the old reporting agent.
    // It returns the schema in the old format: { tableName: [column1, column2] }
    const simplifiedSchemas = {};
    for (const [tableName, tableDetails] of Object.entries(fullSchema)) {
        simplifiedSchemas[tableName] = tableDetails.columns;
    }
    return simplifiedSchemas;
}
// --- Schema Management ---
export async function saveDbSchema(schema) {
    const dbInstance = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([SCHEMA_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(SCHEMA_STORE_NAME);
        store.put({ id: DB_SCHEMA_ID, value: schema });
        transaction.oncomplete = () => resolve();
        transaction.onerror = (event) => reject(event.target.error);
    });
}

export async function loadDbSchema() {
    const dbInstance = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([SCHEMA_STORE_NAME], 'readonly');
        const store = transaction.objectStore(SCHEMA_STORE_NAME);
        const request = store.get(DB_SCHEMA_ID);
        request.onsuccess = (event) => {
            resolve(event.target.result ? event.target.result.value : null);
        };
        request.onerror = (event) => reject(event.target.error);
    });
}

// --- Generic Configuration Management ---
export async function saveConfiguration(key, value) {
  const dbInstance = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = dbInstance.transaction([CONFIG_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(CONFIG_STORE_NAME);
    store.put({ id: key, value: value });
    transaction.oncomplete = () => resolve();
    transaction.onerror = (event) => reject(event.target.error);
  });
}

export async function getConfiguration(key) {
  const dbInstance = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = dbInstance.transaction([CONFIG_STORE_NAME], 'readonly');
    const store = transaction.objectStore(CONFIG_STORE_NAME);
    const request = store.get(key);
    request.onsuccess = (event) => {
        resolve(event.target.result ? event.target.result.value : null);
    };
    request.onerror = (event) => reject(event.target.error);
  });
}