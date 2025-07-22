import { Chart, registerables } from 'chart.js';
import jsPDF from 'jspdf';
import $ from 'jquery';
import DataTable from 'datatables.net-dt';
import {
    saveApiKey,
    loadApiKey,
    listTables,
    saveNewCsvAsTable,
    loadDataFromTable,
    deleteTable,
    getTableSchemas
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
                let planSummary = "AI Database Architect Plan:\n";
                Object.entries(schemaPlan).forEach(([tableName, columns]) => {
                    planSummary += `- Create table '${tableName}' with columns: ${columns.join(', ')}\n`;
                });

                updateProgress(planSummary);
                processFileWithSchemaPlan(file, schemaPlan);

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
            for (const [tableName, columns] of Object.entries(schemaPlan)) {
                const uniqueRows = new Map();
                const primaryKey = columns[0];

                fullData.forEach(fullRow => {
                    // Only proceed if the row from the source CSV contains the primary key for the new table.
                    if (fullRow.hasOwnProperty(primaryKey) && fullRow[primaryKey]) {
                        const newRow = {};
                        columns.forEach(col => {
                            newRow[col] = fullRow.hasOwnProperty(col) ? fullRow[col] : null;
                        });

                        const pkValue = newRow[primaryKey];
                        if (!uniqueRows.has(pkValue)) {
                            uniqueRows.set(pkValue, newRow);
                        }
                    }
                });

                const tableData = Array.from(uniqueRows.values());
                if (tableData.length > 0) {
                    await saveNewCsvAsTable(tableName, tableData);
                }
                updateProgress(`Successfully created and populated table: "${tableName}"`);
            }
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
            await saveNewCsvAsTable(tableName, fullData);
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

runAnalysisBtn.addEventListener('click', () => {
    if (!currentData || currentData.length === 0) return alert('No data selected to analyze.');
    apiKey = apiKeyInput.value;
    if (!apiKey) return alert('Please enter your API key.');
    progressContainer.innerHTML = '';
    runAnalysisPipeline(currentData);
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
        You are a Database Architect AI. Your task is to analyze the columns of a new dataset and design a relational database schema by splitting the columns into logical tables.

        Here are the columns from the new dataset:
        ${headers.join(', ')}

        Analyze these columns and group them into distinct logical entities. For example, columns like 'customer_id', 'customer_name', 'email' belong in a 'customers' table, while 'order_id', 'product_id', 'quantity' belong in an 'orders' table.

        Propose a schema by responding with ONLY a JSON object in the following format. Each key is the proposed new table name, and the value is an array of column names from the original dataset that should belong to that table.

        Example Response:
        {
            "customers": ["customer_id", "customer_name", "email"],
            "orders": ["order_id", "order_date", "customer_id", "total_amount"],
            "products": ["product_id", "product_name", "price"]
        }
    `;

    const chat = model.startChat();
    const result = await chat.sendMessage(prompt);
    const responseText = result.response.text();
    const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
    const cleanedText = jsonMatch ? jsonMatch[1] : responseText;
    return JSON.parse(cleanedText);
}

async function runAnalysisPipeline(data) {
    updateProgress('Starting AI analysis...');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const chat = model.startChat();

    function cleanJson(text) {
        const match = text.match(/```json\n([\s\S]*?)\n```/);
        return match ? match[1] : text;
    }

    try {
        // Agent 1: Data Classification
        updateProgress('Agent 1: Classifying data...');
        const sampleData = JSON.stringify(data.slice(0, 3), null, 2);
        const classificationPrompt = `Based on the following CSV data sample from a table named "${currentTable}", classify the data into a business category (e.g., "Purchase Orders", "Invoices"). Respond with only the category name.\n\nData:\n${sampleData}`;
        let result = await chat.sendMessage(classificationPrompt);
        let classification = result.response.text();
        updateProgress(`Data classified as: ${classification}`);

        // Agent 2: Analysis Planning
        updateProgress('Agent 2: Planning analysis & chart...');
        const headers = Object.keys(data[0]).filter(h => h !== 'tableName').join(', ');
        const planningPrompt = `Given that the data is "${classification}" with columns [${headers}], generate a single Chart.js configuration object for a meaningful chart. Respond ONLY with the complete JSON object for the Chart.js configuration, enclosed in \`\`\`json ... \`\`\`.`;
        result = await chat.sendMessage(planningPrompt);
        const chartConfigStr = result.response.text();
        updateProgress('Chart configuration received.');
        
        const chartConfig = JSON.parse(cleanJson(chartConfigStr));

        // Agent 3: Report Generation
        updateProgress('Agent 3: Generating report summary...');
        const summaryPrompt = `Based on the classification "${classification}" and the generated chart, write a brief, one-paragraph summary of the key insight.`;
        result = await chat.sendMessage(summaryPrompt);
        const summary = result.response.text();

        renderReport(classification, summary, chartConfig);

    } catch (error) {
        updateProgress(`AI analysis failed: ${error.message}`, true);
        console.error(error);
    }
}