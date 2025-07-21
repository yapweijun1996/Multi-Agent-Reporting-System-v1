# Multi-Agent Reporting System

---

# Project Background
This project is a sophisticated, browser-based intelligent reporting system that transforms raw CSV files into actionable insights. It features a **multi-table database environment** powered by IndexedDB, allowing users to upload, manage, and analyze multiple datasets within a single interface. A multi-agent AI pipeline provides automated analysis and report generation for any selected dataset.

---

# System Architecture
- **Development Environment**: **Vite** for a modern, fast development server and build process.
- **Styling**: **Tailwind CSS** for utility-first styling.
- **Dependencies**: Managed with **npm**.
- **Core Stack**: Vanilla HTML, CSS, and JavaScript (ES Modules).

- **Browser-Based Database Engine (`src/db.js`)**
- **Multi-Table Storage**: Each uploaded CSV is stored as a distinct "table" within IndexedDB.
- **Metadata Management**: A dedicated object store tracks the list of all created tables.
- **Indexed Data**: A single, indexed object store holds all row data, tagged by table name for efficient querying.

- **Frontend Application (`src/main.js`)**
- **Database Management UI**: A "phpMyAdmin-style" interface with a sidebar for listing, selecting, and deleting tables.
- **Data Viewer**: A dynamic table renderer displays the contents of any selected dataset.
- **AI Orchestration**: The main script directs the AI pipeline to run analysis on the user-selected table.

- **Multi-Agent AI System (Google Gemini 2.5 Flash)**
- **Table-Aware Analysis**: The AI's prompts now include the table name for better contextual understanding.
- **Conversational Workflow**: A continuous `ChatSession` ensures context is maintained across the three-agent analysis pipeline.

---

# How to Run
1.  Install dependencies: `npm install`
2.  Run the development server: `npm run dev`
3.  Open the provided local URL in your browser.

---

# Workflow
1.  **Set API Key**: Enter your Google Gemini API key. It will be saved in your browser's IndexedDB for future use.
2.  **Upload CSV**: Upload a CSV file. You will be prompted to give it a unique table name.
3.  **Manage Data**: The new table will appear in the "Database" panel. You can select it to view its data or delete it.
4.  **Run Analysis**: With a table selected, click "Run AI Analysis." The AI agents will process the data from that specific table.
5.  **View & Export**: The generated report (chart and summary) will appear. You can export it as a PDF, which will be named after the analyzed table (e.g., `MyOrders_report.pdf`).

---

# Multi-Agent Responsibilities
The analysis is performed by a pipeline of three agents working on the **selected table's data**.

## 1. Data Classification Agent
- **Input**: The table name and a sample of its data.
- **Task**: Classifies the data into a business category.

## 2. Analysis Planning Agent
- **Input**: The classification and column headers.
- **Task**: Generates a Chart.js configuration for a meaningful visualization.

## 3. Report Generation Agent
- **Input**: The classification and chart context.
- **Task**: Writes a brief, insightful summary of the analysis.

---

# Key Technologies
- **Vite**
- **Vanilla JavaScript (ES Modules)**
- **Tailwind CSS**
- **IndexedDB**: Used as a multi-table database engine.
- **PapaParse**: For streaming CSV parsing in a Web Worker.
- **Chart.js**: For interactive charts.
- **jsPDF**: For PDF report exporting.

---

# Summary
This system provides a powerful, self-contained data analysis environment within the browser. By combining a flexible, multi-table database with a potent AI agent pipeline, it empowers users to manage and derive insights from multiple datasets seamlessly and efficiently.
