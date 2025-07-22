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

function renderReport(title, summary, chartConfig) {
    if (dataTableInstance) {
        dataTableInstance.destroy();
        dataTableInstance = null;
    }
    mainContentArea.innerHTML = '';
    if (chartInstance) chartInstance.destroy();

    const titleEl = document.createElement('h3');
    titleEl.className = 'text-2xl font-bold mb-2';
    titleEl.id = 'reportTitle';
    titleEl.textContent = `Analysis of: ${title}`;
    mainContentArea.appendChild(titleEl);

    const summaryEl = document.createElement('p');
    summaryEl.className = 'mb-4 text-gray-700';
    summaryEl.id = 'reportSummary';
    summaryEl.textContent = summary;
    mainContentArea.appendChild(summaryEl);

    const chartContainer = document.createElement('div');
    chartContainer.className = 'w-full h-96 mx-auto';
    const canvas = document.createElement('canvas');
    chartContainer.appendChild(canvas);
    mainContentArea.appendChild(chartContainer);

    chartInstance = new Chart(canvas, chartConfig);
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
    updateProgress('AI is analyzing the new file...');

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
                const schemaPlan = await getAiDatabaseSchemaPlan(filePreview);
                const dbSchema = schemaPlan.schema;
                let planSummary = "AI Database Architect Plan:\n";
                Object.entries(dbSchema).forEach(([tableName, tableDetails]) => {
                    planSummary += `- Table: '${tableName}' (PK: ${tableDetails.primary_key})\n`;
                    planSummary += `  Columns: ${tableDetails.columns.join(', ')}\n`;
                    if (Object.keys(tableDetails.foreign_keys).length > 0) {
                        planSummary += `  Relationships: ${JSON.stringify(tableDetails.foreign_keys)}\n`;
                    }
                });

                updateProgress(planSummary);
                processFileWithSchemaPlan(file, dbSchema);

            } catch (error) {
                updateProgress(`AI Architect failed: ${error.message}`, true);
                console.error(error);
                const tableName = prompt('AI Architect failed. Please enter a single table name for this file:', file.name.replace(/\.csv$/, ''));
                if (tableName) processFullFile(file, tableName);
            }
        } else if (type === 'error') {
            alert(`Error parsing file preview: ${e.data.payload.message}`);
            previewWorker.terminate();
        }
    };
});

function processFileWithSchemaPlan(file, schemaPlan) {
    updateProgress(`Executing AI's database plan...`);
    const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    let fullData = [];
    worker.postMessage({ file });

    worker.onmessage = async (e) => {
        const { type, payload } = e.data;
        if (type === 'data') {
            fullData.push(...payload);
        } else if (type === 'complete') {
            worker.terminate();
            const newTableNames = Object.keys(schemaPlan);
            for (const tableName of newTableNames) {
                const tableDetails = schemaPlan[tableName];
                const { columns, primary_key } = tableDetails;
                const columnsToProcess = new Set(columns);
                columnsToProcess.add(primary_key); // Ensure PK is always included
                const uniqueRows = new Map();

                fullData.forEach(fullRow => {
                    if (fullRow.hasOwnProperty(primary_key) && fullRow[primary_key]) {
                        const newRow = {};
                        columnsToProcess.forEach(col => {
                            newRow[col] = fullRow.hasOwnProperty(col) ? fullRow[col] : null;
                        });

                        const pkValue = newRow[primary_key];
                        if (!uniqueRows.has(pkValue)) {
                            uniqueRows.set(pkValue, newRow);
                        }
                    }
                });

                const tableData = Array.from(uniqueRows.values());
                if (tableData.length > 0) {
                    await saveTableData(tableName, tableData);
                    updateProgress(`Successfully created and populated table: "${tableName}"`);
                } else {
                    updateProgress(`Table "${tableName}" was defined but no unique data was found to populate it.`);
                }
            }
            
            await updateTableList(newTableNames);
            await saveDbSchema(schemaPlan);
            await renderTableList();
            const firstTable = Object.keys(schemaPlan)[0];
            if (firstTable) {
                selectTable(firstTable);
            }
            csvFileInput.value = '';
        } else if (type === 'error') {
            alert(`Error parsing file: ${e.data.payload.message}`);
            worker.terminate();
        }
    };
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
You are a world-class Database Architect AI. Your task is to design a complete and normalized relational database schema from a flat list of columns.

Input Columns:
${headers.join(', ')}

Your Task:
1. Identify Entities: Analyze the columns to identify distinct logical entities (e.g., customers, orders, products).
2. Define Tables: Create a table for each entity. Table names should be plural and in snake_case (e.g., 'order_items').
3. Assign Columns: Assign each relevant input column to its corresponding table.
4. Define Primary Keys: Identify the most suitable primary key for each table from its columns.
5. Define Foreign Keys: Establish relationships between tables by identifying foreign keys. A foreign key in one table must be the primary key of another.
6. **Crucially, you MUST use the exact column names provided in the 'Input Columns' list for all 'columns', 'primary_key', and 'foreign_keys' in your output. Do not change casing or formatting.**

Output Format:
You must respond with ONLY a single, minified JSON object. The object should have a single root key "schema". The value of "schema" is an object where each key is a table name.

For each table, provide an object with three keys:
"columns": An array of strings representing the column names for that table.
"primary_key": A string indicating the name of the primary key column.
"foreign_keys": An object where each key is a foreign key column in the current table, and the value is the referenced table and column in the format "referenced_table.referenced_column".

Example Response (using exact headers from a hypothetical input):
{"schema":{"Customers":{"columns":["CustomerID","CustomerName","Email"],"primary_key":"CustomerID","foreign_keys":{}},"Orders":{"columns":["OrderID","OrderDate","CustomerID","TotalAmount"],"primary_key":"OrderID","foreign_keys":{"CustomerID":"Customers.CustomerID"}}}}
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
        5. The 'query' object should detail which tables to use and which columns to select. This will be used to fetch and join data client-side.

        **Output Format:**
        You must respond with ONLY a single, minified JSON object containing a list of report suggestions.

        **Example Response:**
        [{"title":"Total Sales per Customer","description":"Displays the total purchase amount for each customer.","query":{"tables":["customers","orders"],"columns":{"customers":["customer_name"],"orders":["total_amount"]},"join_on":"customer_id"},"chart_config":{"type":"bar","data":{"labels":[],"datasets":[{"label":"Total Sales (USD)","data":[]}]},"options":{}}},{"title":"Orders per Month","description":"Shows the number of orders placed each month.","query":{"tables":["orders"],"columns":{"orders":["order_date"]}},"chart_config":{"type":"line","data":{"labels":[],"datasets":[{"label":"Number of Orders","data":[]}]},"options":{}}}]
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
        const { tables, columns, join_on } = suggestion.query;
        let joinedData = [];

        // Load data for all required tables
        const tableData = {};
        for (const tableName of tables) {
            tableData[tableName] = await loadDataFromTable(tableName);
        }

        if (tables.length === 1) {
            joinedData = tableData[tables[0]];
        } else if (tables.length > 1 && join_on) {
            // Simple two-table join based on the first two tables and join_on key
            const tableA = tableData[tables[0]];
            const tableB = tableData[tables[1]];
            const mapB = new Map(tableB.map(item => [item[join_on], item]));

            joinedData = tableA.map(itemA => {
                const itemB = mapB.get(itemA[join_on]);
                return { ...itemA, ...itemB };
            });
        }
        
        // This is a placeholder for a more sophisticated data aggregation step
        // For now, we assume the AI gives a chart config that can handle the raw joined data.
        // A real implementation would need an AI agent here to process 'joinedData'
        // into the final labels and data points for the chart.
        
        updateProgress('Data joined. Generating final summary and chart...');
        
        // For now, we pass the raw joined data to a simplified summary agent
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const chat = model.startChat();
        
        const summaryPrompt = `The user generated a report titled "${suggestion.title}". Based on this title and the report's description ("${suggestion.description}"), write a brief, one-paragraph summary of the likely key insight. This is a placeholder for a more complex data analysis step.`;
        const result = await chat.sendMessage(summaryPrompt);
        const summary = result.response.text();

        // NOTE: The chart config from the suggestion is used directly.
        // This is a major simplification. In a real scenario, the data would need to be
        // aggregated and mapped to the chart's labels and datasets.
        renderReport(suggestion.title, summary, suggestion.chart_config);

    } catch (error) {
        updateProgress(`Report generation failed: ${error.message}`, true);
        console.error(error);
    }
}