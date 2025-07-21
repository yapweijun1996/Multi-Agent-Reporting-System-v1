# Multi-Agent Reporting System

---

# Project Background
This project aims to build a **hybrid online/offline**, browser-based intelligent reporting system. Leveraging a multi-agent AI architecture, the system automates processing of user-uploaded business CSV files. The core AI processing requires an internet connection, while the generated reports are fully accessible offline. It strives to transform cumbersome data tasks into efficient intelligent decision support.

---

# System Architecture
- **Development Environment**: The project is built using **Vite** for a modern, fast development experience.
- **Development Stack**: **Vanilla HTML, CSS, and JavaScript (ES Modules)**.
- **Styling**: **Tailwind CSS** is used for utility-first styling.
- **Dependencies**: Managed with `npm`.

- **Frontend Browser Environment**
- **Efficient Streaming Parsing**: Uses PapaParse with Web Workers to perform non-blocking streaming CSV parsing.
- **Offline Data Storage**: Utilizes IndexedDB for high-performance bulk data writing and indexed querying.
- **Dynamic Chart Rendering**: Employs **Chart.js** to render dynamic, interactive charts.
- **High-Quality PDF Export**: Uses **jsPDF** to generate clear, professionally sized PDF reports.

- **Multi-Agent AI System (Based on Google Gemini 2.5 Flash)**
- **Conversational Workflow**: A single, continuous `ChatSession` is used. Each "agent" contributes to the conversation, building on the context from the previous steps to ensure a coherent and intelligent analysis.
- **Core Intelligence Engine**: API calls to Google Gemini are managed through a simplified SDK-like structure in `src/main.js`.

---

# How to Run
1.  Install dependencies: `npm install`
2.  Run the development server: `npm run dev`
3.  Open the provided local URL in your browser.

---

# API Key Security Notice
**Important**: This application runs entirely in the browser. It requires a Google Gemini API key, which must be provided by the user. The key is stored locally and used for all API requests. **The key will not be stored remotely.**

---

# Multi-Agent Responsibilities
The analysis is performed by a pipeline of three agents working within a single conversational context.

## 1. Data Classification Agent
- **Input**: A sample of the parsed CSV data.
- **Task**: Analyzes the data sample to determine its business category (e.g., "Purchase Orders," "Invoices").
- **Output**: The identified category name, which is passed as context to the next agent.

## 2. Analysis Planning Agent
- **Input**: The data classification and column headers.
- **Task**: Plans a meaningful analysis and generates a Chart.js configuration object to visualize it.
- **Output**: A valid JSON object for Chart.js.

## 3. Report Generation Agent
- **Input**: The classification and the generated chart context.
- **Task**: Writes a brief, insightful summary of the key findings from the analysis.
- **Output**: A one-paragraph text summary.

---

# Key Technologies and Optimizations
- **Vite** for a modern development server and build process.
- **Vanilla JavaScript (ES Modules)** for a lightweight, framework-free architecture.
- **Tailwind CSS** for utility-first styling.
- **Conversational AI (`startChat`)**: Ensures context is maintained throughout the multi-step analysis pipeline.
- PapaParse with Web Worker for streaming CSV parsing.
- Chart.js for interactive charts.
- jsPDF with compressed JPEG chart images to reduce PDF file size.

---

# User Experience Highlights
- Detailed progress feedback showing each agent's status.
- Interactive reports combining a chart and an AI-generated summary.
- **User-provided API Key**: Ensures security and control over API usage.
- **Offline Report Access**: View, interact with, and export reports without an internet connection.
- One-click export of rich, lightweight PDF reports.

---

# Future Directions
- Hybrid cloud+local AI with lightweight WebAssembly/WebGPU models.
- Multi-user collaboration and report version control.
- Intelligent anomaly detection and alerting.
- Open APIs for integration with enterprise systems.

---

# Summary
This system seamlessly integrates modern frontend tech with a powerful, conversational AI agent pipeline to deliver a fully automated, intelligent reporting solution. By separating online AI processing from offline report access, it offers a powerful, secure, and user-centric experience.
