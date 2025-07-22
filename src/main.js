import { Chart, registerables } from 'chart.js';
import jsPDF from 'jspdf';
import $ from 'jquery';
import DataTable from 'datatables.net-dt';
import {
    saveApiKey,
    loadApiKey,
    listTables,
    saveTableData,
    updateTableList,
    loadDataFromTable,
    deleteTable,
    getTableSchemas,
    saveDbSchema,
    loadDbSchema
} from './db.js';

Chart.register(...registerables);

// --- STATE MANAGEMENT ---
let apiKey = '';
let chartInstance = null;
let currentTable = null;
let currentData = [];
let dataTableInstance = null;

// --- DOM ELEMENTS ---
const apiKeyInput = document.getElementById('apiKey');
const csvFileInput = document.getElementById('csvFile');
const tableListContainer = document.getElementById('table-list-container');
const viewerTitle = document.getElementById('viewer-title');
const viewerActions = document.getElementById('viewer-actions');
const runAnalysisBtn = document.getElementById('runAnalysisBtn');
const exportPdfBtn = document.getElementById('exportPdfBtn');
const progressContainer = document.getElementById('progress-container');
const mainContentArea = document.getElementById('main-content-area');
const debugLogContainer = document.getElementById('debug-log-container');

// --- LOGGING ---
function log(message, data = null) {
    const p = document.createElement('p');
    const timestamp = new Date().toLocaleTimeString();
    p.innerHTML = `<span class="text-gray-500">${timestamp}:</span> ${message}`;
    
    if (data) {
        const pre = document.createElement('pre');
        pre.className = 'bg-gray-800 p-2 rounded mt-1 text-sm';
        pre.textContent = JSON.stringify(data, null, 2);
        p.appendChild(pre);
    }
    
    // Clear initial message if it exists
    const initialMessage = debugLogContainer.querySelector('.text-gray-400');
    if (initialMessage) {
        debugLogContainer.innerHTML = '';
    }

    debugLogContainer.appendChild(p);
    debugLogContainer.scrollTop = debugLogContainer.scrollHeight;
}


// --- SIMPLIFIED AI SDK ---
const { GoogleGenerativeAI } = {
    GoogleGenerativeAI: class {
        constructor(apiKey) { this.apiKey = apiKey; }
        getGenerativeModel({ model }) {
            return { startChat: () => new ChatSession(this.apiKey, model) };
        }
    }
};

class ChatSession {
    constructor(apiKey, model) {
        this.apiKey = apiKey;
        this.model = model;
        this.history = [];
        this.apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;
    }

    async sendMessage(prompt) {
        const fullHistory = [...this.history, { role: 'user', parts: [{ text: prompt }] }];
        const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: fullHistory }),
        });
        if (!response.ok) throw new Error(`API call failed: ${response.status}`);
        const data = await response.json();
        const text = data.candidates[0].content.parts[0].text;
        this.history.push({ role: 'user', parts: [{ text: prompt }] });
        this.history.push({ role: 'model', parts: [{ text: text }] });
        return { response: { text: () => text } };
    }
}

// --- INITIALIZATION ---
window.addEventListener('load', async () => {
    try {
        const savedKey = await loadApiKey();
        if (savedKey) {
            apiKeyInput.value = savedKey;
            apiKey = savedKey;
        }
    } catch (error) {
        console.error('Failed to load API key:', error);
    }
    await renderTableList();
});

// --- UI RENDERING ---

async function renderTableList() {
    const tables = await listTables();
    tableListContainer.innerHTML = '';
    if (tables.length === 0) {
        tableListContainer.innerHTML = '<p class="text-gray-500">No tables found.</p>';
        return;
    }

    const ul = document.createElement('ul');
    ul.className = 'space-y-1';
    tables.forEach(tableName => {
        const li = document.createElement('li');
        li.className = 'flex justify-between items-center p-2 rounded-md hover:bg-gray-100 cursor-pointer';
        li.textContent = tableName;
        li.dataset.tableName = tableName;

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '✖';
        deleteBtn.className = 'text-red-500 hover:text-red-700 font-bold';
        deleteBtn.onclick = async (e) => {
            e.stopPropagation();
            if (confirm(`Are you sure you want to delete the table "${tableName}"?`)) {
                await deleteTable(tableName);
                await renderTableList();
                if (currentTable === tableName) resetViewer();
            }
        };
        li.appendChild(deleteBtn);
        li.onclick = () => selectTable(tableName);
        ul.appendChild(li);
    });
    tableListContainer.appendChild(ul);
}

function renderDataTable(data) {
    if (dataTableInstance) {
        dataTableInstance.destroy();
    }
    mainContentArea.innerHTML = '<table id="dataTable" class="display" width="100%"></table>';

    if (!data || data.length === 0) return;

    const headers = Object.keys(data[0]).filter(h => h !== 'tableName');
    const columns = headers.map(header => ({
        title: header,
        data: header
    }));

    dataTableInstance = new DataTable('#dataTable', {
        data: data,
        columns: columns,
        responsive: true,
        paging: true,
        searching: true,
        info: true,
    });
}

function renderReport(title, summary, chartConfig, dataForTable) {
    if (dataTableInstance) {
        dataTableInstance.destroy();
        dataTableInstance = null;
    }
    mainContentArea.innerHTML = '';
    if (chartInstance) chartInstance.destroy();

    const titleEl = document.createElement('h3');
    titleEl.className = 'text-2xl font-bold mb-2';
    titleEl.id = 'reportTitle';
    titleEl.textContent = title;
    mainContentArea.appendChild(titleEl);

    const summaryEl = document.createElement('p');
    summaryEl.className = 'mb-4 text-gray-700';
    summaryEl.id = 'reportSummary';
    summaryEl.textContent = summary;
    mainContentArea.appendChild(summaryEl);

    const chartContainer = document.createElement('div');
    chartContainer.className = 'w-full h-96 mx-auto mb-8';
    const canvas = document.createElement('canvas');
    chartContainer.appendChild(canvas);
    mainContentArea.appendChild(chartContainer);

    chartInstance = new Chart(canvas, chartConfig);

    // Render the data table with the final (potentially aggregated) data
    const tableContainer = document.createElement('div');
    tableContainer.id = 'report-table-container';
    mainContentArea.appendChild(tableContainer);
    renderDataTable(dataForTable);


    updateProgress('Report generated successfully!');
}

function resetViewer() {
    currentTable = null;
    currentData = [];
    viewerTitle.textContent = 'Select a Table';
    viewerActions.classList.add('hidden');
    if (dataTableInstance) {
        dataTableInstance.destroy();
        dataTableInstance = null;
    }
    mainContentArea.innerHTML = '<p class="text-gray-500">Select a table from the list to view its data or run an analysis.</p>';
}

function updateProgress(message, isError = false) {
    const p = document.createElement('p');
    p.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    p.className = isError ? 'text-red-500 font-semibold' : 'text-gray-600';
    progressContainer.appendChild(p);
    progressContainer.scrollTop = progressContainer.scrollHeight;
}

// --- WORKFLOWS ---

apiKeyInput.addEventListener('change', () => saveApiKey(apiKeyInput.value));

csvFileInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    apiKey = apiKeyInput.value;
    if (!apiKey) {
        alert('Please enter your API key first.');
        csvFileInput.value = '';
        return;
    }

    progressContainer.innerHTML = '';
    debugLogContainer.innerHTML = '<p class="text-gray-400">Log will appear here...</p>'; // Reset log
    log('New file detected. Starting analysis...');

    const previewWorker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    let filePreview = [];
    previewWorker.postMessage({ file, preview: true });

    previewWorker.onmessage = async (e) => {
        const { type, payload } = e.data;
        if (type === 'data') {
            filePreview.push(...payload);
        } else if (type === 'complete') {
            previewWorker.terminate();
            try {
                updateProgress('AI analysis complete. Generating database schema...');
                const schemaPlan = await getAiDatabaseSchemaPlan(filePreview);
                log("Received schema plan from AI Architect:", schemaPlan);
                
                // The schema is nested inside the response
                const dbSchema = schemaPlan.schema;
                
                // Update user-facing progress
                let planSummary = "AI Database Architect Plan:\n";
                if (dbSchema) {
                    Object.entries(dbSchema).forEach(([tableName, tableDetails]) => {
                        planSummary += `- Table: '${tableName}' (PK: ${tableDetails.primary_key}, Natural Key: [${tableDetails.natural_key_for_uniqueness.join(', ')}])\n`;
                    });
                }
                updateProgress(planSummary);

                runDataProcessingPipeline(file, schemaPlan);

            } catch (error) {
                updateProgress(`AI Architect failed: ${error.message}`, true);
                log(`AI Architect failed: ${error.message}`, error);
                const tableName = prompt('AI Architect failed. Please enter a single table name for this file:', file.name.replace(/\.csv$/, ''));
                if (tableName) processFullFile(file, tableName);
            }
        } else if (type === 'error') {
            log(`Error parsing file preview: ${e.data.payload.message}`, e.data.payload);
            alert(`Error parsing file preview: ${e.data.payload.message}`);
            previewWorker.terminate();
        }
    };
});

function determineExecutionOrder(schemaPlan) {
    const schema = schemaPlan.schema;
    if (!schema) {
        log("Could not determine execution order: 'schema' property is missing from the plan.", schemaPlan);
        return [];
    }

    const tableNames = Object.keys(schema);
    const parentTables = [];
    const childTables = [];

    for (const tableName of tableNames) {
        const table = schema[tableName];
        if (table && table.foreign_keys && Object.keys(table.foreign_keys).length === 0) {
            parentTables.push(tableName);
        } else {
            childTables.push(tableName);
        }
    }
    return [...parentTables, ...childTables];
}

async function runDataProcessingPipeline(file, schemaPlan) {
    log('Starting data processing pipeline...');
    const executionOrder = determineExecutionOrder(schemaPlan);
    log('Determined table processing order:', executionOrder);
    updateProgress('Data processing pipeline initiated. Schema has been designed.');

    const dbSchema = schemaPlan.schema;
    if (!dbSchema || executionOrder.length === 0) {
        log('Pipeline halting: No schema or execution order found.', { dbSchema, executionOrder });
        updateProgress('Pipeline failed: No schema or executable order found in the plan.', true);
        return;
    }

    // This object will hold all the lookup maps generated by the processors.
    const lookupMaps = {};

    // 1. Parse the full CSV file once using the worker.
    updateProgress('Parsing full data file...');
    log('Parsing full data file via worker...');
    const fullData = await new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
        let data = [];
        worker.postMessage({ file });
        worker.onmessage = (e) => {
            const { type, payload } = e.data;
            if (type === 'data') {
                data.push(...payload);
            } else if (type === 'complete') {
                log(`Successfully parsed ${data.length} rows from the file.`);
                updateProgress(`Successfully parsed ${data.length} rows.`);
                worker.terminate();
                resolve(data);
            } else if (type === 'error') {
                log('Error parsing full file in pipeline', payload);
                updateProgress(`Error parsing file: ${payload.message}`, true);
                worker.terminate();
                reject(new Error(payload.message));
            }
        };
    });

    if (!fullData || fullData.length === 0) {
        log('Pipeline halting: No data parsed from the file.');
        updateProgress('Pipeline failed: Could not parse any data from the file.', true);
        return;
    }

    // 2. Loop through the execution order and process each table.
    for (const tableName of executionOrder) {
        const tableDetails = dbSchema[tableName];
        if (!tableDetails) {
            log(`Skipping table '${tableName}' as its details were not found in the schema.`);
            continue;
        }

        updateProgress(`Processing table: ${tableName}...`);
        let returnedMap;

        try {
            // Conditionally call the correct processor.
            if (Object.keys(tableDetails.foreign_keys).length === 0) {
                // This is a parent table.
                returnedMap = await processParentTable(tableName, tableDetails, fullData);
            } else {
                // This is a child table; it needs the lookup maps from its parents.
                returnedMap = await processChildTable(tableName, tableDetails, fullData, lookupMaps, dbSchema);
            }
            // Store the returned map for subsequent child tables.
            lookupMaps[tableName] = returnedMap;
            updateProgress(`Successfully processed and saved data for ${tableName}.`);
        } catch (error) {
            log(`Error processing table '${tableName}':`, error);
            updateProgress(`Failed to process table '${tableName}': ${error.message}`, true);
            // Halt the pipeline on error
            return;
        }
    }

    // 3. Perform final actions after the loop completes.
    log('All tables processed. Finalizing pipeline.');
    await saveDbSchema(dbSchema);
    log('Full database schema saved.');

    await updateTableList(Object.keys(dbSchema));
    await renderTableList();
    log('UI table list updated.');

    // Auto-select the last processed table for user convenience.
    if (executionOrder.length > 0) {
        selectTable(executionOrder[executionOrder.length - 1]);
    }

    csvFileInput.value = '';
    updateProgress('Data processing pipeline completed successfully!');
}

async function processParentTable(tableName, tableDetails, fullData) {
    log(`Processing parent table: ${tableName}...`);

    const uniqueRows = new Map();
    const naturalKeyCols = tableDetails.natural_key_for_uniqueness;

    for (const row of fullData) {
        const naturalKey = naturalKeyCols.map(keyCol => row[keyCol]).join('|');
        if (!uniqueRows.has(naturalKey)) {
            uniqueRows.set(naturalKey, row);
        }
    }

    log(`Found ${uniqueRows.size} unique rows for table '${tableName}'.`);

    const lookupMap = {};
    const finalRows = [];
    let idCounter = 1;

    for (const [naturalKey, uniqueRow] of uniqueRows.entries()) {
        const generatedId = `${tableName}_${idCounter++}`;
        
        // Add the generated ID to the row data
        const rowWithId = { ...uniqueRow, generated_id: generatedId };
        
        // Build the lookup map
        lookupMap[naturalKey] = generatedId;

        // Filter the row to only include columns defined in the schema
        const finalRow = {};
        for (const col of tableDetails.columns) {
            if (rowWithId.hasOwnProperty(col)) {
                finalRow[col] = rowWithId[col];
            }
        }
        finalRows.push(finalRow);
    }
    
    // Log a sample of the lookup map for debugging
    const lookupSample = Object.fromEntries(Object.entries(lookupMap).slice(0, 5));
    log(`Generated lookup map for '${tableName}'. Sample:`, lookupSample);
    
    // Save the processed data to the database
    await saveTableData(tableName, finalRows);
    log(`Saved ${finalRows.length} processed rows to table '${tableName}'.`);

    // The lookup map is returned for use by child-table processing agents
    return lookupMap;
}

async function processChildTable(tableName, tableDetails, fullData, lookupMaps, dbSchema) {
    log(`Processing child table: ${tableName}...`);

    // Step 1: Populate foreign keys on a copy of the full dataset first.
    // This is critical for de-duplication to work correctly on composite natural keys.
    const enrichedData = fullData.map(row => {
        const processedRow = { ...row };

        for (const [fkColumn, parentInfo] of Object.entries(tableDetails.foreign_keys)) {
            const [parentTableName] = parentInfo.split('.');
            const parentTableDetails = dbSchema[parentTableName];

            if (!parentTableDetails || !lookupMaps[parentTableName]) {
                log(`  WARNING: Prerequisite data for FK '${fkColumn}' -> '${parentTableName}' is missing. Skipping.`);
                continue;
            }

            const parentNaturalKeyCols = parentTableDetails.natural_key_for_uniqueness;
            const parentLookupKey = parentNaturalKeyCols.map(keyCol => processedRow[keyCol]).join('|');
            const parentLookupMap = lookupMaps[parentTableName];

            if (parentLookupMap.hasOwnProperty(parentLookupKey)) {
                processedRow[fkColumn] = parentLookupMap[parentLookupKey];
            }
        }
        return processedRow;
    });
    log(`Step 1 Complete: Populated foreign keys for ${enrichedData.length} rows.`);


    // Step 2: Perform de-duplication on the now-enriched data.
    const uniqueRows = new Map();
    const naturalKeyCols = tableDetails.natural_key_for_uniqueness;

    for (const row of enrichedData) {
        const naturalKey = naturalKeyCols.map(keyCol => row[keyCol]).join('|');
        if (!uniqueRows.has(naturalKey)) {
            uniqueRows.set(naturalKey, row);
        }
    }
    log(`Step 2 Complete: Found ${uniqueRows.size} unique rows for '${tableName}'.`);


    // Step 3: Process the unique rows to generate IDs, create a lookup map, and save.
    const lookupMap = {};
    const finalRows = [];
    let idCounter = 1;

    for (const [naturalKey, uniqueRow] of uniqueRows.entries()) {
        const processedRow = { ...uniqueRow };

        // Generate ID for this table's record
        const generatedId = `${tableName}_${idCounter++}`;
        processedRow.generated_id = generatedId;

        // Create a lookup map for this table, to be used by its own children (if any)
        lookupMap[naturalKey] = generatedId;

        // Filter down to only the columns specified in the schema
        const finalRow = {};
        for (const col of tableDetails.columns) {
            if (processedRow.hasOwnProperty(col)) {
                finalRow[col] = processedRow[col];
            }
        }
        finalRows.push(finalRow);
    }

    // Save the final, processed data
    await saveTableData(tableName, finalRows);
    log(`Step 3 Complete: Saved ${finalRows.length} processed rows to table '${tableName}'.`);

    // Return this table's lookup map for any subsequent children
    return lookupMap;
}

function processFullFile(file, tableName) {
    updateProgress(`Processing full file for table "${tableName}"...`);
    const mainWorker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    let fullData = [];
    mainWorker.postMessage({ file });

    mainWorker.onmessage = async (e) => {
        const { type, payload } = e.data;
        if (type === 'data') {
            fullData.push(...payload);
        } else if (type === 'complete') {
            await saveTableData(tableName, fullData);
            await updateTableList([tableName]);
            await renderTableList();
            selectTable(tableName);
            csvFileInput.value = '';
            mainWorker.terminate();
            updateProgress(`Table "${tableName}" updated/created successfully.`);
        } else if (type === 'error') {
            alert(`Error parsing full file: ${e.data.payload.message}`);
            mainWorker.terminate();
        }
    };
}

async function selectTable(tableName) {
    currentTable = tableName;
    viewerTitle.textContent = `Viewing: ${tableName}`;
    viewerActions.classList.remove('hidden');
    progressContainer.innerHTML = '';
    updateProgress(`Loading data for "${tableName}"...`);
    try {
        currentData = await loadDataFromTable(tableName);
        renderDataTable(currentData);
        updateProgress('Data loaded successfully.');
    } catch (error) {
        updateProgress(`Failed to load data: ${error.message}`, true);
    }
}

runAnalysisBtn.addEventListener('click', async () => {
    apiKey = apiKeyInput.value;
    if (!apiKey) return alert('Please enter your API key.');
    progressContainer.innerHTML = '';
    updateProgress('AI is analyzing the database to suggest reports...');
    
    try {
        const reportSuggestions = await getAiReportSuggestions();
        renderReportSuggestions(reportSuggestions);
    } catch (error) {
        updateProgress(`Failed to get report suggestions: ${error.message}`, true);
        console.error(error);
    }
});

exportPdfBtn.addEventListener('click', () => {
    if (!chartInstance) return;
    updateProgress('Exporting to PDF...');
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(document.getElementById('reportTitle').textContent, 14, 22);
    doc.setFontSize(11);
    doc.text(doc.splitTextToSize(document.getElementById('reportSummary').textContent, 180), 14, 32);
    const canvas = chartInstance.canvas;
    const imgData = canvas.toDataURL('image/jpeg', 0.8);
    const imgProps = doc.getImageProperties(imgData);
    const pdfWidth = doc.internal.pageSize.getWidth() - 28;
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    doc.addImage(imgData, 'JPEG', 14, 60, pdfWidth, pdfHeight);
    doc.save(`${currentTable}_report.pdf`);
    updateProgress('PDF exported successfully.');
});

// --- AI AGENTS ---

async function getAiDatabaseSchemaPlan(data) {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const sampleData = JSON.stringify(data.slice(0, 5), null, 2);
    const headers = Object.keys(data[0]);

    const prompt = `
You are a world-class Database Architect AI. Your task is to design a complete and normalized relational database schema from a flat list of columns, defining both a technical primary key and a business/natural key for each table.

Input Columns:
${headers.join(', ')}

Your Task:
1.  **Analyze Entities & Columns**: Identify distinct logical entities and assign the provided columns to the appropriate table. Table names should be plural and snake_case.
2.  **Define Two Key Types For Each Table**: This is the most critical step.
    a. **'natural_key_for_uniqueness'**: Identify the column or a list of columns that uniquely define a *business record*. This is for de-duplication. For a 'users' table, it might be \`["email"]\`. For an 'order_items' table, it's often a composite key like \`["order_id", "product_id"]\`.
    b. **'primary_key'**: This is the table's main technical key. In most cases, you should generate a new surrogate key for this by default. Name this new column exactly 'generated_id' and set it as the 'primary_key'. This new 'generated_id' column must also be added to the table's "columns" list. The only exception is for pure 'junction' tables (like 'order_items'), where the combined foreign keys can serve as the primary key.
3.  **Define Foreign Keys (FK)**: Establish relationships between tables using their 'primary_key' (which will usually be a 'generated_id').
4.  **Strict Naming**: You MUST use the exact column names from the 'Input Columns' list.

Output Format:
You must respond with ONLY a single, minified JSON object with a single root key "schema".
For each table, provide an object with **four** keys:
- "columns": An array of strings for all column names (including 'generated_id' if created).
- "primary_key": A string indicating the primary technical key (usually 'generated_id').
- "natural_key_for_uniqueness": An array of strings representing the business key for de-duplication.
- "foreign_keys": An object defining relationships.

Example with Surrogate & Natural Keys:
{"schema":{"suppliers":{"columns":["Supplier","City","generated_id"],"primary_key":"generated_id","natural_key_for_uniqueness":["Supplier"],"foreign_keys":{}},"products":{"columns":["Product","Supplier","Price","generated_id"],"primary_key":"generated_id","natural_key_for_uniqueness":["Product"],"foreign_keys":{"Supplier":"suppliers.generated_id"}}}}
    `;

    const chat = model.startChat();
    const result = await chat.sendMessage(prompt);
    const responseText = result.response.text();
    const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
    const cleanedText = jsonMatch ? jsonMatch[1] : responseText;
    return JSON.parse(cleanedText);
}

function renderReportSuggestions(suggestions) {
    if (dataTableInstance) {
        dataTableInstance.destroy();
        dataTableInstance = null;
    }
    mainContentArea.innerHTML = '';
    
    const titleEl = document.createElement('h3');
    titleEl.className = 'text-2xl font-bold mb-4';
    titleEl.textContent = 'AI Report Suggestions';
    mainContentArea.appendChild(titleEl);

    const suggestionsContainer = document.createElement('div');
    suggestionsContainer.className = 'flex flex-col space-y-2';
    
    suggestions.forEach(suggestion => {
        const button = document.createElement('button');
        button.className = 'bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded text-left';
        button.textContent = suggestion.title;
        button.onclick = () => runReportExecution(suggestion);
        suggestionsContainer.appendChild(button);
    });

    mainContentArea.appendChild(suggestionsContainer);
    updateProgress('Please select a report to generate.');
}

async function getAiReportSuggestions() {
    const dbSchema = await loadDbSchema();
    if (!dbSchema) throw new Error("Database schema not found. Please upload a file first.");

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `
        You are a Business Intelligence Analyst AI. Your task is to propose a list of insightful reports based on the available database schema.

        **Database Schema:**
        ${JSON.stringify(dbSchema, null, 2)}

        **Your Task:**
        1. Analyze the schema to understand the relationships between tables.
        2. Brainstorm a list of 3 to 5 meaningful business reports that can be generated from this data.
        3. For each report, provide a clear title and a concise description.
        4. Crucially, for each report, specify the 'Chart.js' configuration and a 'query' object.
        5. The 'query' object must detail the tables and columns for the initial data join.
        6. **Aggregation**: If a report requires data aggregation (e.g., SUM, COUNT, AVG), you MUST include an 'aggregation' object within the 'query' object. This object must contain:
            - "groupBy": The column to group the data by (e.g., "Product").
            - "column": The column to be aggregated (e.g., "Quantity").
            - "method": The aggregation method (e.g., "SUM", "COUNT").
            - "newColumnName": The name for the new, calculated column (e.g., "Total Quantity Purchased").
        7. The 'join' object within the query must specify the exact parent and child keys for joining tables.

        **Output Format:**
        You must respond with ONLY a single, minified JSON object containing a list of report suggestions.

        **Example Response:**
        [{"title":"Total Quantity Purchased per Product","description":"Calculates the sum of quantities for each product.","query":{"tables":["products","order_items"],"columns":{"products":["ProductName"],"order_items":["Quantity"]},"join":{"child_table":"order_items","child_key":"product_id","parent_table":"products","parent_key":"generated_id"},"aggregation":{"groupBy":"ProductName","column":"Quantity","method":"SUM","newColumnName":"Total Quantity Purchased"}},"chart_config":{"type":"bar","data":{"labels":[],"datasets":[{"label":"Total Quantity","data":[]}]}}}]
    `;

    const chat = model.startChat();
    const result = await chat.sendMessage(prompt);
    const responseText = result.response.text();
    const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
    const cleanedText = jsonMatch ? jsonMatch[1] : responseText;
    return JSON.parse(cleanedText);
}

async function runReportExecution(suggestion) {
    updateProgress(`Generating report: "${suggestion.title}"...`);
    try {
        // This is a simplified client-side join. A real-world app would do this server-side.
        // This is a simplified client-side join. A real-world app would do this server-side.
        const { tables, join } = suggestion.query;
        let joinedData = [];

        // Load data for all required tables
        const tableData = {};
        for (const tableName of tables) {
            tableData[tableName] = await loadDataFromTable(tableName);
        }

        if (tables.length === 1) {
            joinedData = tableData[tables[0]];
        } else if (tables.length > 1 && join) {
            // Refactored join logic to use the new structured join object
            const parentTable = tableData[join.parent_table];
            const childTable = tableData[join.child_table];
            
            // Create a lookup map from the parent table using its primary key
            const parentMap = new Map(parentTable.map(item => [item[join.parent_key], item]));

            // Join child to parent
            joinedData = childTable.map(childItem => {
                const parentItem = parentMap.get(childItem[join.child_key]);
                // Combine the child item with the found parent item
                return { ...childItem, ...parentItem };
            });
        }
        
        let finalData = joinedData;
        const { aggregation } = suggestion.query;
        let aggregatedData;

        if (aggregation) {
            updateProgress('Performing data aggregation...');
            const { groupBy, column, method, newColumnName } = aggregation;
            const groups = {};

            // This new logic initializes the aggregated value when the group is first seen,
            // preventing non-uniform objects by ensuring every group object has the same structure.
            joinedData.forEach(row => {
                const groupValue = row[groupBy];

                if (!groups[groupValue]) {
                    // Initialize the group object with a default value for the new column.
                    groups[groupValue] = {
                        [groupBy]: groupValue,
                        [newColumnName]: 0,
                        // Add temporary properties for AVG calculation.
                        ...((method.toUpperCase() === 'AVG') && { _sum: 0, _count: 0 })
                    };
                }

                // Incrementally update the aggregation.
                const value = parseFloat(row[column]);
                switch (method.toUpperCase()) {
                    case 'SUM':
                        groups[groupValue][newColumnName] += (value || 0);
                        break;
                    case 'COUNT':
                        groups[groupValue][newColumnName]++;
                        break;
                    case 'AVG':
                        if (!isNaN(value)) {
                            groups[groupValue]._sum += value;
                            groups[groupValue]._count++;
                        }
                        break;
                }
            });

            // Convert the groups object into an array of results.
            aggregatedData = Object.values(groups);

            // Finalize AVG calculation.
            if (method.toUpperCase() === 'AVG') {
                aggregatedData.forEach(group => {
                    group[newColumnName] = group._count > 0 ? group._sum / group._count : 0;
                    delete group._sum;
                    delete group._count;
                });
            }
            finalData = aggregatedData;
            log('Aggregation complete. Initial aggregated data:', finalData);
        }

        // Definitive sanitization step to ensure uniform object structures.
        let finalUniformData = finalData;
        if (aggregation) {
            const { groupBy, newColumnName } = aggregation;
            const expectedHeaders = [groupBy, newColumnName];

            finalUniformData = finalData.map(row => {
                const uniformRow = {};
                for (const header of expectedHeaders) {
                    uniformRow[header] = row[header] ?? 0;
                }
                return uniformRow;
            });
            log('Sanitization complete. Final uniform data:', finalUniformData);
        }


        // Always prepare a dynamic chart configuration
        const chartConfig = {
            type: suggestion.chart_config.type || 'bar', // Default to bar chart
            data: {
                labels: [],
                datasets: [{
                    label: '',
                    data: [],
                    // You can add more styling here if needed from the suggestion
                    backgroundColor: 'rgba(54, 162, 235, 0.6)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        };

        if (aggregation) {
            const { groupBy, newColumnName } = aggregation;
            chartConfig.data.labels = finalUniformData.map(row => row[groupBy]);
            chartConfig.data.datasets[0].data = finalUniformData.map(row => row[newColumnName]);
            chartConfig.data.datasets[0].label = newColumnName;
        }
        
        updateProgress('Data processed. Generating final summary and chart...');
        
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const chat = model.startChat();
        
        const summaryPrompt = `The user generated a report titled "${suggestion.title}". Based on this title and the report's description ("${suggestion.description}"), write a brief, one-paragraph summary of the likely key insight. This is a placeholder for a more complex data analysis step.`;
        const result = await chat.sendMessage(summaryPrompt);
        const summary = result.response.text();

        renderReport(suggestion.title, summary, chartConfig, finalUniformData);

    } catch (error) {
        updateProgress(`Report generation failed: ${error.message}`, true);
        console.error(error);
    }
}