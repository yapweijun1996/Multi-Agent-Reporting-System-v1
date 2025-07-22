const { jsPDF } = window.jspdf;

const workerCode = `
    self.importScripts('https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js');

    self.onmessage = function(event) {
        const { file, preview } = event.data;
        const isPreview = !!preview;
        let rowCount = 0;
        const PREVIEW_ROWS = 10;

        Papa.parse(file, {
            worker: false,
            header: true,
            dynamicTyping: true,
            step: function(results, parser) {
                rowCount++;
                self.postMessage({ type: 'data', payload: [results.data] });
                
                if (isPreview && rowCount >= PREVIEW_ROWS) {
                    parser.abort();
                    self.postMessage({ type: 'complete' });
                }
            },
            complete: function() {
                self.postMessage({ type: 'complete' });
            },
            error: function(error) {
                self.postMessage({ type: 'error', payload: error });
            }
        });
    };
`;
const blob = new Blob([workerCode], { type: 'application/javascript' });
const workerUrl = URL.createObjectURL(blob);

import {
    listTables,
    saveTableData,
    updateTableList,
    loadDataFromTable,
    deleteTable,
    getTableSchemas,
    saveDbSchema,
    loadDbSchema,
    saveConfiguration,
    getConfiguration
} from './db.js';
import { agentManager } from './agents/agent-manager.js';

// --- STATE MANAGEMENT ---
let chartInstance = null;
let currentTable = null;
let currentData = [];
let dataTableInstance = null;

// --- DOM ELEMENT VARIABLES ---
let csvFileInput, tableListContainer, viewerTitle, viewerActions, runAnalysisBtn,
    exportPdfBtn, progressContainer, aiSuggestionsContainer, debugLogContainer,
    settingsBtn, settingsPanel, settingsOverlay, apiKeyInput, saveSettingsBtn, closePanelBtn,
    toggleVisibilityBtn, kpiContainer, chartContainer, datatableContainer, reportContentContainer;

// --- CORE INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    // This is the single entry point for all DOM-related code.
    assignDOMElements();
    attachEventListeners();
    initializeApplication();
});

function assignDOMElements() {
    csvFileInput = document.getElementById('csvFile');
    tableListContainer = document.getElementById('table-list-container');
    viewerTitle = document.getElementById('viewer-title');
    viewerActions = document.getElementById('viewer-actions');
    runAnalysisBtn = document.getElementById('runAnalysisBtn');
    exportPdfBtn = document.getElementById('exportPdfBtn');
    progressContainer = document.getElementById('progress-container');
    aiSuggestionsContainer = document.getElementById('ai-suggestions-container');
    debugLogContainer = document.getElementById('debug-log');
    settingsBtn = document.getElementById('settings-btn');
    settingsPanel = document.getElementById('settings-panel');
    settingsOverlay = document.getElementById('settings-overlay');
    apiKeyInput = document.getElementById('api-key-input');
    saveSettingsBtn = document.getElementById('save-settings-btn');
    closePanelBtn = document.getElementById('close-panel-btn');
    toggleVisibilityBtn = document.getElementById('toggle-visibility-btn');
    kpiContainer = document.getElementById('kpi-container');
    chartContainer = document.getElementById('chart-container');
    datatableContainer = document.getElementById('datatable-container');
    reportContentContainer = document.getElementById('report-content-container');
}

function attachEventListeners() {
    settingsBtn.addEventListener('click', openSettingsPanel);
    closePanelBtn.addEventListener('click', closeSettingsPanel);
    settingsOverlay.addEventListener('click', closeSettingsPanel);
    saveSettingsBtn.addEventListener('click', handleSaveSettings);
    toggleVisibilityBtn.addEventListener('click', toggleApiKeyVisibility);
    csvFileInput.addEventListener('change', handleFileSelect);
    runAnalysisBtn.addEventListener('click', handleRunAnalysis);
    exportPdfBtn.addEventListener('click', handleExportPdf);
}

async function initializeApplication() {
    try {
        const savedKey = await getConfiguration('apiKey');
        if (savedKey && apiKeyInput) {
            apiKeyInput.value = savedKey;
        }
        await agentManager.initialize();
    } catch (error) {
        console.error('Failed to load API key or initialize agents:', error);
        log('Failed to initialize application', error);
    }
    await renderTableList();
}


// --- LOGGING ---
function log(message, data = null) {
    if (!debugLogContainer) return; // Guard against calls before DOM is ready
    const p = document.createElement('p');
    const timestamp = new Date().toLocaleTimeString();
    p.innerHTML = `<span>${timestamp}:</span> ${message}`;
    
    if (data) {
        const pre = document.createElement('pre');
        pre.textContent = JSON.stringify(data, null, 2);
        p.appendChild(pre);
    }
    
    const initialMessage = debugLogContainer.querySelector('.placeholder-text');
    if (initialMessage) {
        debugLogContainer.innerHTML = '';
    }

    debugLogContainer.appendChild(p);
    debugLogContainer.scrollTop = debugLogContainer.scrollHeight;
}

// --- UI RENDERING ---

async function renderTableList() {
    const tables = await listTables();
    tableListContainer.innerHTML = '';
    if (tables.length === 0) {
        tableListContainer.innerHTML = '<p class="placeholder-text">No tables found.</p>';
        return;
    }

    const ul = document.createElement('ul');
    tables.forEach(tableName => {
        const li = document.createElement('li');
        li.textContent = tableName;
        li.dataset.tableName = tableName;

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '✖';
        deleteBtn.className = 'delete-btn';
        deleteBtn.onclick = async (e) => {
            e.stopPropagation();
            if (confirm(`Are you sure you want to delete the table "${tableName}"?`)) {
                await deleteTable(tableName);
                await renderTableList();
                if (currentTable === tableName) resetViewer();
            }
        };
        li.appendChild(deleteBtn);
        li.onclick = () => {
            // Handle selection style
            document.querySelectorAll('#table-list-container li').forEach(item => item.classList.remove('selected'));
            li.classList.add('selected');
            selectTable(tableName);
        };
        ul.appendChild(li);
    });
    tableListContainer.appendChild(ul);
}

function renderKPIs(data) {
    if (!kpiContainer || !data || data.length === 0) {
        kpiContainer.innerHTML = '';
        return;
    }

    const totalRecords = data.length;
    let totalPurchaseAmount = 0;
    if (data[0] && data[0].hasOwnProperty('Total Purchase Amount (USD)')) {
        totalPurchaseAmount = data.reduce((sum, row) => sum + (row['Total Purchase Amount (USD)'] || 0), 0);
    }

    const kpis = [
        { title: 'Total Records', value: totalRecords },
        { title: 'Total Purchase Amount', value: `$${totalPurchaseAmount.toFixed(2)}` },
    ];

    kpiContainer.innerHTML = kpis.map(kpi => `
        <div class="kpi-card">
            <div class="kpi-card__title">${kpi.title}</div>
            <div class="kpi-card__value">${kpi.value}</div>
        </div>
    `).join('');
}

function renderMainChart(data) {
    if (chartInstance) {
        chartInstance.destroy();
    }
    chartContainer.innerHTML = '<canvas id="mainChart"></canvas>';
    const canvas = document.getElementById('mainChart');
    if (!canvas || !data || data.length === 0) return;

    // Example: Charting the first two numeric columns
    const headers = Object.keys(data[0]);
    const labelColumn = headers[0];
    let dataColumn = headers.find((h, i) => i > 0 && typeof data[0][h] === 'number');
    if (!dataColumn) dataColumn = headers[1];


    chartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: data.map(row => row[labelColumn]),
            datasets: [{
                label: dataColumn,
                data: data.map(row => row[dataColumn]),
                backgroundColor: 'rgba(74, 144, 226, 0.6)',
                borderColor: 'rgba(74, 144, 226, 1)',
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
    });
}

function renderDataTable(data, container) {
    if (dataTableInstance) {
        dataTableInstance.destroy();
        dataTableInstance = null;
    }
    
    const targetContainer = container || reportContentContainer;
    targetContainer.innerHTML = '<table id="dataTable" class="display" width="100%"></table>';

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
    if (dataTableInstance) dataTableInstance.destroy();
    if (chartInstance) chartInstance.destroy();

    const reportContainer = document.getElementById('report-content-container');
    if (!reportContainer) {
        console.error('Critical Error: report-content-container not found in the DOM.');
        updateProgress('Error: Could not find the main report container.', true);
        return;
    }
    
    // Clear previous content and show the report container
    const placeholder = reportContainer.querySelector('.placeholder-text');
    if (placeholder) {
        placeholder.style.display = 'none';
    }
    reportContainer.innerHTML = '';
    reportContainer.style.display = 'grid'; // Use grid layout defined in CSS

    // 1. Summary Card
    const summaryCard = document.createElement('div');
    summaryCard.className = 'report-summary-card';
    summaryCard.innerHTML = `
        <h3>Executive Summary</h3>
        <p id="reportSummary">${summary}</p>
    `;
    reportContainer.appendChild(summaryCard);

    // 2. Chart Card
    const chartCard = document.createElement('div');
    chartCard.className = 'report-chart-card';
    chartCard.innerHTML = `
        <h3 id="reportTitle">${title}</h3>
        <div class="report-chart-container">
            <canvas id="reportChart"></canvas>
        </div>
    `;
    reportContainer.appendChild(chartCard);
    const canvas = chartCard.querySelector('#reportChart');
    chartInstance = new Chart(canvas, chartConfig);

    // 3. Table Card
    const tableCard = document.createElement('div');
    tableCard.className = 'report-table-card';
    tableCard.innerHTML = `
        <h3>Detailed Data</h3>
        <div id="report-table-container"></div>
    `;
    reportContainer.appendChild(tableCard);
    renderDataTable(dataForTable, tableCard.querySelector('#report-table-container'));

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
    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }
    kpiContainer.innerHTML = '';
    chartContainer.innerHTML = '';
    reportContentContainer.innerHTML = '<p class="placeholder-text">Select a table from the list to view its data or run an analysis.</p>';
    progressContainer.classList.add('hidden');
    aiSuggestionsContainer.classList.add('hidden');
}

function updateProgress(message, isError = false) {
    progressContainer.classList.remove('hidden');
    const p = document.createElement('p');
    p.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    if (isError) {
        p.classList.add('error');
    }
    progressContainer.appendChild(p);
    progressContainer.scrollTop = progressContainer.scrollHeight;
}

// --- EVENT HANDLERS ---

function openSettingsPanel() {
    console.log('Opening settings panel...');
    settingsOverlay.classList.remove('hidden');
    settingsPanel.classList.remove('translate-x-full');
}

function closeSettingsPanel() {
    console.log('Closing settings panel...');
    settingsOverlay.classList.add('hidden');
    settingsPanel.classList.add('translate-x-full');
}

async function handleSaveSettings() {
    const newApiKey = apiKeyInput.value.trim();
    if (newApiKey) {
        try {
            await saveConfiguration('apiKey', newApiKey);
            await agentManager.initialize(); // Re-initialize with the new key
            alert('API Key saved successfully!');
            closeSettingsPanel();
        } catch (error) {
            console.error('Failed to save API key:', error);
            alert('Error saving API key.');
        }
    } else {
        alert('Please enter an API key.');
    }
}

function toggleApiKeyVisibility() {
    if (apiKeyInput.type === 'password') {
        apiKeyInput.type = 'text';
        toggleVisibilityBtn.textContent = 'Hide';
    } else {
        apiKeyInput.type = 'password';
        toggleVisibilityBtn.textContent = 'Show';
    }
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    progressContainer.innerHTML = '';
    progressContainer.classList.remove('hidden');
    debugLogContainer.innerHTML = '<p class="placeholder-text">Log will appear here...</p>';
    log('New file detected. Starting analysis...');

    const previewWorker = new Worker(workerUrl);

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
                const context = { headers: Object.keys(filePreview[0]) };
                const response = await agentManager.run('Database Architect', context);

                if (response.success) {
                    const schemaPlan = response.data;
                    log("Received schema plan from AI Architect:", schemaPlan);
                    const dbSchema = schemaPlan.schema;
                    let planSummary = "AI Database Architect Plan:\n";
                    if (dbSchema) {
                        Object.entries(dbSchema).forEach(([tableName, tableDetails]) => {
                            planSummary += `- Table: '${tableName}' (PK: ${tableDetails.primary_key}, Natural Key: [${tableDetails.natural_key_for_uniqueness.join(', ')}])\n`;
                        });
                    }
                    updateProgress(planSummary);
                    runDataProcessingPipeline(file, schemaPlan);
                } else {
                    updateProgress(`AI Architect failed: ${response.error}`, true);
                    log(`AI Architect failed: ${response.error}`);
                    const tableName = prompt('AI Architect failed. Please enter a single table name for this file:', file.name.replace(/\.csv$/, ''));
                    if (tableName) processFullFile(file, tableName);
                }
            } catch (error) {
                updateProgress(`Error during AI analysis: ${error.message}`, true);
                log(`Error during AI analysis: ${error.message}`, error);
            }
        } else if (type === 'error') {
            log(`Error parsing file preview: ${e.data.payload.message}`, e.data.payload);
            alert(`Error parsing file preview: ${e.data.payload.message}`);
            previewWorker.terminate();
        }
    };
}

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

    const lookupMaps = {};

    updateProgress('Parsing full data file...');
    log('Parsing full data file via worker...');
    const fullData = await new Promise((resolve, reject) => {
        const worker = new Worker(workerUrl);
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

    for (const tableName of executionOrder) {
        const tableDetails = dbSchema[tableName];
        if (!tableDetails) {
            log(`Skipping table '${tableName}' as its details were not found in the schema.`);
            continue;
        }

        updateProgress(`Processing table: ${tableName}...`);
        let returnedMap;

        try {
            if (Object.keys(tableDetails.foreign_keys).length === 0) {
                returnedMap = await processParentTable(tableName, tableDetails, fullData);
            } else {
                returnedMap = await processChildTable(tableName, tableDetails, fullData, lookupMaps, dbSchema);
            }
            lookupMaps[tableName] = returnedMap;
            updateProgress(`Successfully processed and saved data for ${tableName}.`);
        } catch (error) {
            log(`Error processing table '${tableName}':`, error);
            updateProgress(`Failed to process table '${tableName}': ${error.message}`, true);
            return;
        }
    }

    log('All tables processed. Finalizing pipeline.');
    await saveDbSchema(dbSchema);
    log('Full database schema saved.');

    await updateTableList(Object.keys(dbSchema));
    await renderTableList();
    log('UI table list updated.');

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
        const rowWithId = { ...uniqueRow, generated_id: generatedId };
        lookupMap[naturalKey] = generatedId;
        const finalRow = {};
        for (const col of tableDetails.columns) {
            if (rowWithId.hasOwnProperty(col)) {
                finalRow[col] = rowWithId[col];
            }
        }
        finalRows.push(finalRow);
    }
    
    const lookupSample = Object.fromEntries(Object.entries(lookupMap).slice(0, 5));
    log(`Generated lookup map for '${tableName}'. Sample:`, lookupSample);
    
    await saveTableData(tableName, finalRows);
    log(`Saved ${finalRows.length} processed rows to table '${tableName}'.`);

    return lookupMap;
}

async function processChildTable(tableName, tableDetails, fullData, lookupMaps, dbSchema) {
    log(`Processing child table: ${tableName}...`);

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

    const uniqueRows = new Map();
    const naturalKeyCols = tableDetails.natural_key_for_uniqueness;

    for (const row of enrichedData) {
        const naturalKey = naturalKeyCols.map(keyCol => row[keyCol]).join('|');
        if (!uniqueRows.has(naturalKey)) {
            uniqueRows.set(naturalKey, row);
        }
    }
    log(`Step 2 Complete: Found ${uniqueRows.size} unique rows for '${tableName}'.`);

    const lookupMap = {};
    const finalRows = [];
    let idCounter = 1;

    for (const [naturalKey, uniqueRow] of uniqueRows.entries()) {
        const processedRow = { ...uniqueRow };
        const generatedId = `${tableName}_${idCounter++}`;
        processedRow.generated_id = generatedId;
        lookupMap[naturalKey] = generatedId;
        const finalRow = {};
        for (const col of tableDetails.columns) {
            if (processedRow.hasOwnProperty(col)) {
                finalRow[col] = processedRow[col];
            }
        }
        finalRows.push(finalRow);
    }

    await saveTableData(tableName, finalRows);
    log(`Step 3 Complete: Saved ${finalRows.length} processed rows to table '${tableName}'.`);

    return lookupMap;
}

function processFullFile(file, tableName) {
    updateProgress(`Processing full file for table "${tableName}"...`);
    const mainWorker = new Worker(workerUrl);
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

    // Show main dashboard view
    kpiContainer.style.display = 'grid';
    chartContainer.style.display = 'block';
    datatableContainer.style.display = 'block';
    
    // Guard clauses to prevent crash if elements are missing
    if (viewerTitle) {
        viewerTitle.textContent = `Viewing: ${tableName}`;
    } else {
        console.error('Could not find viewerTitle element.');
    }

    if (viewerActions) {
        viewerActions.classList.remove('hidden');
    } else {
        console.error('Could not find viewerActions element.');
    }

    if (progressContainer) {
        progressContainer.innerHTML = '';
        progressContainer.classList.remove('hidden');
    } else {
        console.error('Could not find progressContainer element.');
    }
    
    updateProgress(`Loading data for "${tableName}"...`);
    try {
        currentData = await loadDataFromTable(tableName);
        renderKPIs(currentData);
        renderMainChart(currentData);
        renderDataTable(currentData, reportContentContainer);
        updateProgress('Data loaded successfully.');
    } catch (error) {
        updateProgress(`Failed to load data: ${error.message}`, true);
    }
}

async function handleRunAnalysis() {
    progressContainer.innerHTML = '';
    progressContainer.classList.remove('hidden');
    updateProgress('AI is analyzing the database to suggest reports...');

    // Hide the main dashboard view to show suggestions
    kpiContainer.style.display = 'none';
    chartContainer.style.display = 'none';
    datatableContainer.style.display = 'block'; // Keep this visible for suggestions

    try {
        const dbSchema = await loadDbSchema();
        if (!dbSchema) {
            throw new Error("Database schema not found. Please upload a file first.");
        }
        const context = { dbSchema };
        const response = await agentManager.run('BI Analyst', context);
        if (response.success) {
            renderReportSuggestions(response.data);
        } else {
            throw new Error(response.error);
        }
    } catch (error) {
        updateProgress(`Failed to get report suggestions: ${error.message}`, true);
        console.error(error);
    }
}

function handleExportPdf() {
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
}

function renderReportSuggestions(suggestions) {
    if (dataTableInstance) {
        dataTableInstance.destroy();
        dataTableInstance = null;
    }

    // Use the report content container to show suggestions
    const reportContainer = document.getElementById('report-content-container');
    if (!reportContainer) {
        console.error('Cannot render suggestions: report-content-container not found.');
        return;
    }
    reportContainer.innerHTML = '';
    reportContainer.style.display = 'block'; // Ensure it's visible

    const titleEl = document.createElement('h3');
    titleEl.textContent = 'AI Report Suggestions:';
    reportContainer.appendChild(titleEl);

    const suggestionsGrid = document.createElement('div');
    suggestionsGrid.className = 'ai-suggestions-grid';
    suggestions.forEach(suggestion => {
        const button = document.createElement('button');
        button.className = 'ai-suggestion-card';
        button.textContent = suggestion.title;
        button.onclick = () => runReportExecution(suggestion);
        suggestionsGrid.appendChild(button);
    });

    reportContainer.appendChild(suggestionsGrid);
    updateProgress('Please select a report to generate.');
}

async function runReportExecution(suggestion) {
    updateProgress(`Generating report: "${suggestion.title}"...`);
    log('Executing report suggestion:', suggestion);

    // Ensure the report container is visible
    if (reportContentContainer) {
        reportContentContainer.style.display = 'grid';
    }
    if (datatableContainer) {
        datatableContainer.style.display = 'none';
    }
    if (kpiContainer) {
        kpiContainer.style.display = 'none';
    }
    if (chartContainer) {
        chartContainer.style.display = 'none';
    }

    try {
        const { tables, join } = suggestion.query;
        let joinedData = [];

        const tableData = {};
        for (const tableName of tables) {
            tableData[tableName] = await loadDataFromTable(tableName);
        }

        if (tables.length === 1) {
            joinedData = tableData[tables[0]];
        } else if (tables.length > 1 && join) {
            const parentTable = tableData[join.parent_table];
            const childTable = tableData[join.child_table];
            const parentMap = new Map(parentTable.map(item => [item[join.parent_key], item]));
            joinedData = childTable.map(childItem => {
                const parentItem = parentMap.get(childItem[join.child_key]);
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

            joinedData.forEach(row => {
                const groupValue = row[groupBy];
                if (!groups[groupValue]) {
                    groups[groupValue] = {
                        [groupBy]: groupValue,
                        [newColumnName]: 0,
                        ...((method && method.toUpperCase() === 'AVG') && { _sum: 0, _count: 0 })
                    };
                }
                const value = parseFloat(row[column]);
                if (!method) return;
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

            aggregatedData = Object.values(groups);

            if (method && method.toUpperCase() === 'AVG') {
                aggregatedData.forEach(group => {
                    group[newColumnName] = group._count > 0 ? group._sum / group._count : 0;
                    delete group._sum;
                    delete group._count;
                });
            }
            finalData = aggregatedData;
            log('Aggregation complete. Initial aggregated data:', finalData);
        }

        const { columns } = suggestion.query;
        let expectedHeaders = [];
        if (aggregation) {
            expectedHeaders = [aggregation.groupBy, aggregation.newColumnName];
        } else {
            expectedHeaders = Object.values(columns).flat();
        }
 
        const finalUniformData = finalData.map(row => {
            const uniformRow = {};
            for (const header of expectedHeaders) {
                uniformRow[header] = row.hasOwnProperty(header) ? row[header] : null;
            }
            return uniformRow;
        });
        log('Sanitization complete. Final uniform data:', finalUniformData);

        const chartConfig = {
            type: suggestion.chart_config.type || 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: '',
                    data: [],
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
        } else if (finalUniformData.length > 0) {
            // Fallback for non-aggregated data: use the first two columns
            const headers = Object.keys(finalUniformData[0]);
            if (headers.length >= 2) {
                const labelCol = headers[0];
                const dataCol = headers[1];
                chartConfig.data.labels = finalUniformData.map(row => row[labelCol]);
                chartConfig.data.datasets[0].data = finalUniformData.map(row => row[dataCol]);
                chartConfig.data.datasets[0].label = dataCol;
            }
        }
        
        updateProgress('Data processed. Generating final summary and chart...');
        
        const context = { 
            title: suggestion.title, 
            description: suggestion.description,
            data: finalUniformData.slice(0, 20) // Pass a sample of the data for context
        };
        const response = await agentManager.run('Summarizer', context);
        
        let summary = "Could not generate summary.";
        if (response.success) {
            summary = response.data;
        } else {
            log('Failed to get summary from AI.', response.error);
        }
 
        log('Final data structure being sent to renderReport:', finalUniformData);
        renderReport(suggestion.title, summary, chartConfig, finalUniformData);
 
    } catch (error) {
        updateProgress(`Report generation failed: ${error.message}`, true);
        console.error(error);
    }
}
