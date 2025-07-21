import { Chart, registerables } from 'chart.js';
import jsPDF from 'jspdf';
import {
    saveApiKey,
    loadApiKey,
    listTables,
    saveNewCsvAsTable,
    loadDataFromTable,
    deleteTable
} from './db.js';

Chart.register(...registerables);

// --- STATE MANAGEMENT ---
let apiKey = '';
let chartInstance = null;
let currentTable = null;
let currentData = [];

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

// --- SIMPLIFIED AI SDK (from previous implementation) ---
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
    // Load API Key
    try {
        const savedKey = await loadApiKey();
        if (savedKey) {
            apiKeyInput.value = savedKey;
            apiKey = savedKey;
        }
    } catch (error) {
        console.error('Failed to load API key:', error);
    }
    // Render initial table list
    await renderTableList();
});

// --- UI RENDERING FUNCTIONS ---

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
            e.stopPropagation(); // Prevent li click event
            if (confirm(`Are you sure you want to delete the table "${tableName}"?`)) {
                await deleteTable(tableName);
                await renderTableList();
                // If the deleted table was the current one, reset the view
                if (currentTable === tableName) {
                    resetViewer();
                }
            }
        };
        li.appendChild(deleteBtn);
        li.onclick = () => selectTable(tableName);
        ul.appendChild(li);
    });
    tableListContainer.appendChild(ul);
}

function renderDataTable(data) {
    mainContentArea.innerHTML = '';
    if (!data || data.length === 0) return;

    const container = document.createElement('div');
    container.className = 'overflow-x-auto';
    
    const table = document.createElement('table');
    table.className = 'min-w-full divide-y divide-gray-200';

    const thead = document.createElement('thead');
    thead.className = 'bg-gray-50';
    const headerRow = document.createElement('tr');
    const headers = Object.keys(data[0]).filter(h => h !== 'tableName');
    headers.forEach(headerText => {
        const th = document.createElement('th');
        th.className = 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider';
        th.textContent = headerText;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    tbody.className = 'bg-white divide-y divide-gray-200';
    data.forEach(rowData => {
        const row = document.createElement('tr');
        headers.forEach(header => {
            const td = document.createElement('td');
            td.className = 'px-6 py-4 whitespace-nowrap text-sm text-gray-900';
            td.textContent = rowData[header];
            row.appendChild(td);
        });
        tbody.appendChild(row);
    });
    table.appendChild(tbody);
    container.appendChild(table);
    mainContentArea.appendChild(container);
}

function renderReport(title, summary, chartConfig) {
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
    mainContentArea.innerHTML = '<p class="text-gray-500">Select a table from the list to view its data or run an analysis.</p>';
}

function updateProgress(message, isError = false) {
    const p = document.createElement('p');
    p.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    p.className = isError ? 'text-red-500 font-semibold' : 'text-gray-600';
    progressContainer.appendChild(p);
    progressContainer.scrollTop = progressContainer.scrollHeight;
}

// --- EVENT LISTENERS & WORKFLOW ---

apiKeyInput.addEventListener('change', () => saveApiKey(apiKeyInput.value));

csvFileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const tableName = prompt('Enter a name for this data table:', file.name.replace(/\.csv$/, ''));
    if (!tableName) {
        csvFileInput.value = '';
        return;
    }

    const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    let tempData = [];
    worker.postMessage(file);

    worker.onmessage = async (e) => {
        const { type, payload } = e.data;
        if (type === 'data') {
            tempData.push(...payload);
        } else if (type === 'complete') {
            await saveNewCsvAsTable(tableName, tempData);
            await renderTableList();
            selectTable(tableName); // Auto-select the new table
            csvFileInput.value = ''; // Reset file input
        } else if (type === 'error') {
            alert(`Error parsing file: ${payload.message}`);
        }
    };
});

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
    if (!currentData || currentData.length === 0) {
        alert('No data selected to analyze.');
        return;
    }
    apiKey = apiKeyInput.value;
    if (!apiKey) {
        alert('Please enter your API key.');
        return;
    }
    progressContainer.innerHTML = '';
    runAnalysisPipeline(currentData);
});

exportPdfBtn.addEventListener('click', () => {
    if (!chartInstance) return;

    updateProgress('Exporting to PDF...');
    const doc = new jsPDF();
    const title = document.getElementById('reportTitle').textContent;
    const summary = document.getElementById('reportSummary').textContent;
    
    doc.setFontSize(18);
    doc.text(title, 14, 22);
    doc.setFontSize(11);
    const splitSummary = doc.splitTextToSize(summary, 180);
    doc.text(splitSummary, 14, 32);

    const canvas = chartInstance.canvas;
    const imgData = canvas.toDataURL('image/jpeg', 0.8);
    const imgProps = doc.getImageProperties(imgData);
    const pdfWidth = doc.internal.pageSize.getWidth() - 28;
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    doc.addImage(imgData, 'JPEG', 14, 60, pdfWidth, pdfHeight);

    doc.save(`${currentTable}_report.pdf`);
    updateProgress('PDF exported successfully.');
});

// --- AI ANALYSIS PIPELINE ---

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