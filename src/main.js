import { Chart, registerables } from 'chart.js';
import jsPDF from 'jspdf';
import $ from 'jquery';
import DataTable from 'datatables.net-dt';
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

Chart.register(...registerables);

// --- STATE MANAGEMENT ---
let chartInstance = null;
let currentTable = null;
let currentData = [];
let dataTableInstance = null;

// --- DOM ELEMENT VARIABLES ---
let csvFileInput, tableListContainer, viewerTitle, viewerActions, runAnalysisBtn,
    exportPdfBtn, progressContainer, aiSuggestionsContainer, mainContentArea, debugLogContainer,
    settingsBtn, settingsPanel, settingsOverlay, apiKeyInput, saveSettingsBtn, closePanelBtn;

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
    mainContentArea = document.getElementById('main-content-area');
    debugLogContainer = document.getElementById('debug-log-container');
    settingsBtn = document.getElementById('settings-btn');
    settingsPanel = document.getElementById('settings-panel');
    settingsOverlay = document.getElementById('settings-overlay');
    apiKeyInput = document.getElementById('api-key-input');
    saveSettingsBtn = document.getElementById('save-settings-btn');
    closePanelBtn = document.getElementById('close-panel-btn');
}

function attachEventListeners() {
    settingsBtn.addEventListener('click', openSettingsPanel);
    closePanelBtn.addEventListener('click', closeSettingsPanel);
    settingsOverlay.addEventListener('click', closeSettingsPanel);
    saveSettingsBtn.addEventListener('click', handleSaveSettings);
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
    p.innerHTML = `<span class="text-gray-500">${timestamp}:</span> ${message}`;
    
    if (data) {
        const pre = document.createElement('pre');
        pre.className = 'bg-gray-800 p-2 rounded mt-1 text-sm';
        pre.textContent = JSON.stringify(data, null, 2);
        p.appendChild(pre);
    }
    
    const initialMessage = debugLogContainer.querySelector('.text-gray-400');
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

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    progressContainer.innerHTML = '';
    debugLogContainer.innerHTML = '<p class="text-gray-400">Log will appear here...</p>';
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

async function handleRunAnalysis() {
    progressContainer.innerHTML = '';
    updateProgress('AI is analyzing the database to suggest reports...');
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
    mainContentArea.innerHTML = ''; // Clear main content area
    aiSuggestionsContainer.innerHTML = ''; // Clear previous suggestions

    const titleEl = document.createElement('h3');
    titleEl.className = 'text-xl font-semibold mb-3'; // Adjusted class for better hierarchy
    titleEl.textContent = 'AI Report Suggestions:';
    aiSuggestionsContainer.appendChild(titleEl);

    const suggestionsGrid = document.createElement('div');
    suggestionsGrid.className = 'flex flex-wrap gap-3'; // Use flex-wrap for a grid-like layout

    suggestions.forEach(suggestion => {
        const button = document.createElement('button');
        button.className = 'ai-suggestion-card'; // Use the new class
        button.textContent = suggestion.title;
        button.onclick = () => runReportExecution(suggestion);
        suggestionsGrid.appendChild(button);
    });

    aiSuggestionsContainer.appendChild(suggestionsGrid);
    updateProgress('Please select a report to generate.');
}

async function runReportExecution(suggestion) {
    updateProgress(`Generating report: "${suggestion.title}"...`);
    log('Executing report suggestion:', suggestion);
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
                        ...((method.toUpperCase() === 'AVG') && { _sum: 0, _count: 0 })
                    };
                }
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

            aggregatedData = Object.values(groups);

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
        }
        
        updateProgress('Data processed. Generating final summary and chart...');
        
        const context = { title: suggestion.title, description: suggestion.description };
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
