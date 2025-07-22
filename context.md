# Multi-Agent Reporting System

---

# Project Background
This project is a highly advanced, browser-based intelligent reporting system that transforms complex, raw CSV files into a **fully relational database**, designed and managed by a sophisticated AI. It features a multi-table environment powered by IndexedDB and a multi-agent AI pipeline that handles everything from database architecture to final report generation, creating a powerful and fully automated analysis partner.

---

# System Architecture
- **Development Environment**: **Vite**, **npm**, and **Tailwind CSS**.
- **Core Stack**: Vanilla HTML, CSS, and JavaScript (ES Modules).

- **Browser-Based Relational Database (`src/db.js`)**
- **Multi-Table Storage**: Stores data in multiple, distinct "tables" as designed by the AI.
- **Metadata Management**: Tracks the list and schema of all created tables.
- **Indexed Data**: Ensures efficient querying of data across the relational structure.

- **AI-Driven Database Architecture (`src/main.js`)**
- **AI Database Architect**: A new, specialized agent that analyzes the columns of a new CSV file.
- **Relational Schema Proposal**: The AI designs a logical relational database schema, proposing how to split the columns into multiple, normalized tables (e.g., `customers`, `products`, `orders`).
- **User-Confirmed Execution**: The AI's database plan is presented to the user for confirmation before the system automatically creates and populates the new relational tables.

- **Multi-Agent Analysis System (Google Gemini 2.5 Flash)**
- **Targeted Analysis**: The analysis pipeline runs on a specific, user-selected table from the AI-designed database.

---

# How to Run
1.  Install dependencies: `npm install`
2.  Run the development server: `npm run dev`
3.  Open the provided local URL in your browser.

---

# Intelligent Workflow
1.  **Set API Key**: Enter your Google Gemini API key.
2.  **Upload a Complex CSV**: Upload a file containing multiple types of data (e.g., customer, product, and order information).
3.  **AI Architect Designs a Database**: The "Database Architect" AI analyzes the file and proposes a plan to split it into multiple tables.
4.  **Confirm the Plan**: A prompt will show the AI's plan (e.g., "Create a `customers` table (3 columns) and an `orders` table (5 columns)?").
5.  **Automated Database Creation**: Upon confirmation, the system executes the plan, creating and populating the new tables.
6.  **Manage & Analyze**: The new tables appear in the sidebar. Select any table to view its data or run an AI-powered analysis on it.

---

# Multi-Agent Responsibilities

## 1. Database Architect Agent (New)
- **Input**: The column headers from a new CSV file.
- **Task**: Designs a relational database schema by grouping columns into logical tables.
- **Output**: A JSON object defining the new tables and their respective columns.

## 2. Data Classification Agent
- **Input**: A data sample from a **selected table**.
- **Task**: Classifies the table's business category.

## 3. Analysis Planning Agent
- **Input**: The classification and column headers.
- **Task**: Generates a Chart.js configuration for a visualization.

## 4. Report Generation Agent
- **Input**: The classification and chart context.
- **Task**: Writes a summary of the analysis.

---

# Key Technologies
- **Vite, npm, Tailwind CSS**
- **Vanilla JavaScript (ES Modules)**
- **IndexedDB**: The core of the relational database engine.
- **AI-Powered Database Design**: For automated schema creation.
- **DataTables.js**: For interactive, feature-rich data tables.
- **PapaParse, Chart.js, jsPDF**

---

# Summary
This system pushes the boundaries of browser-based applications by integrating a powerful AI that acts as a full-fledged database architect. It can intelligently deconstruct a single, complex file into a well-structured relational database, providing a robust foundation for automated, multi-faceted data analysis.
