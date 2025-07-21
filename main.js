console.log("Main script loaded.");

// This is a simplified stand-in for the Google AI SDK
// In a real app, you would import this from a module.
const { GoogleGenerativeAI } = {
    GoogleGenerativeAI: class {
        constructor(apiKey) {
            this.apiKey = apiKey;
        }
        getGenerativeModel({ model, systemInstruction }) {
            return {
                startChat: ({ history }) => {
                    return new ChatSession(this.apiKey, model, systemInstruction, history);
                }
            };
        }
    }
};

class ChatSession {
    constructor(apiKey, model, systemInstruction, history) {
        this.apiKey = apiKey;
        this.model = model;
        this.systemInstruction = systemInstruction;
        this.history = history || [];
        this.apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;
    }

    async sendMessage(prompt) {
        const fullHistory = [
            ...this.history,
            { role: 'user', parts: [{ text: prompt }] }
        ];

        const requestBody = {
            contents: fullHistory,
            systemInstruction: this.systemInstruction ? { parts: [{ text: this.systemInstruction }] } : undefined,
        };

        const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            throw new Error(`API call failed with status: ${response.status}`);
        }

        const data = await response.json();
        const text = data.candidates[0].content.parts[0].text;
        
        // Add both user prompt and model response to history for context
        this.history.push({ role: 'user', parts: [{ text: prompt }] });
        this.history.push({ role: 'model', parts: [{ text: text }] });

        return {
            response: {
                text: () => text,
            }
        };
    }
}


const apiKeyInput = document.getElementById('apiKey');
const csvFileInput = document.getElementById('csvFile');
const progressContainer = document.getElementById('progress-container');
const reportOutput = document.getElementById('report-output');
const exportPdfButton = document.getElementById('exportPdf');

let csvData = [];
let apiKey = '';
let chartInstance = null;


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
        const classificationPrompt = `Based on the following CSV data sample, classify the data into a business category (e.g., "Purchase Orders", "Invoices"). Respond with only the category name.\n\nData:\n${sampleData}`;
        
        let result = await chat.sendMessage(classificationPrompt);
        let classification = result.response.text();
        updateProgress(`Data classified as: ${classification}`);

        // Agent 2: Analysis Planning
        updateProgress('Agent 2: Planning analysis & chart...');
        const headers = Object.keys(data[0]).join(', ');
        const planningPrompt = `
            Given that the data is "${classification}" with columns [${headers}], generate a single Chart.js configuration object for a meaningful chart.
            - Analyze a key metric, like counts by category or sums over time.
            - Respond ONLY with the complete JSON object for the Chart.js configuration, enclosed in \`\`\`json ... \`\`\`.
        `;
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

function renderReport(title, summary, chartConfig) {
    updateProgress('Rendering report...');
    
    reportOutput.innerHTML = '';
    if (chartInstance) {
        chartInstance.destroy();
    }

    const titleEl = document.createElement('h3');
    titleEl.className = 'text-2xl font-bold mb-2';
    titleEl.id = 'reportTitle';
    titleEl.textContent = `Analysis of: ${title}`;
    reportOutput.appendChild(titleEl);

    const summaryEl = document.createElement('p');
    summaryEl.className = 'mb-4 text-gray-700';
    summaryEl.id = 'reportSummary';
    summaryEl.textContent = summary;
    reportOutput.appendChild(summaryEl);

    const chartContainer = document.createElement('div');
    chartContainer.className = 'w-full h-96 mx-auto';
    const canvas = document.createElement('canvas');
    chartContainer.appendChild(canvas);
    reportOutput.appendChild(chartContainer);

    chartInstance = new Chart(canvas, chartConfig);

    exportPdfButton.classList.remove('hidden');
    updateProgress('Report generated successfully!');
}


// =================================
// EVENT LISTENERS & WORKER
// =================================

const worker = new Worker('worker.js');

worker.onmessage = function(event) {
  const { type, payload } = event.data;

  if (type === 'data') {
    if (csvData.length === 0) {
        updateProgress('Parsing data chunks...');
    }
    csvData.push(...payload);
  } else if (type === 'complete') {
    updateProgress('CSV parsing complete!');
    runAnalysisPipeline(csvData);
  } else if (type === 'error') {
    updateProgress(`Error parsing file: ${payload.message}`, true);
  }
};

csvFileInput.addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file) return;

  apiKey = apiKeyInput.value;
  if (!apiKey) {
    alert('Please enter your API key first.');
    csvFileInput.value = '';
    return;
  }

  csvData = [];
  progressContainer.innerHTML = '';
  reportOutput.innerHTML = '<p class="text-gray-500">Report content will appear here once processing is complete.</p>';
  exportPdfButton.classList.add('hidden');
  updateProgress(`Starting to process "${file.name}"...`);

  worker.postMessage(file);
});

exportPdfButton.addEventListener('click', () => {
    if (!chartInstance) return;

    updateProgress('Exporting to PDF...');
    const { jsPDF } = window.jspdf;
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
    const yPos = doc.lastAutoTable ? doc.lastAutoTable.finalY + 10 : 60;

    doc.addImage(imgData, 'JPEG', 14, yPos, pdfWidth, pdfHeight);

    doc.save('report.pdf');
    updateProgress('PDF exported successfully.');
});


function updateProgress(message, isError = false) {
  const p = document.createElement('p');
  p.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  p.className = isError ? 'text-red-500 font-semibold' : 'text-gray-600';
  progressContainer.appendChild(p);
  progressContainer.scrollTop = progressContainer.scrollHeight;
}