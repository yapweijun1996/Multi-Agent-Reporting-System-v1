# Multi-Agent Data Engineering & Reporting Platform

---

## 1. Project Overview

This project is a sophisticated, single-page web application that functions as an end-to-end data engineering and business intelligence platform. It leverages a suite of AI agents to intelligently analyze raw CSV data, design and populate a relational database within the browser, and generate dynamic, interactive reports. The system is architected to solve complex data challenges, including record de-duplication and maintaining relational integrity, providing a seamless workflow from raw data to actionable insights.

The user experience has been upgraded to a professional ERP-style dashboard. It features a header, a persistent sidebar for navigation, and a main content area with modular widgets for KPIs, charts, and detailed data tables.

---

## 2. Core Architectural Concepts

### 2.1. Formal Agent System

All AI-driven logic is encapsulated within a formal, modular agent system managed by the `AgentManager`. This design promotes separation of concerns and allows for the easy extension of AI capabilities. The primary agents include:

-   **Database Architect**: Analyzes raw data headers and content to design a normalized, dual-key database schema.
-   **BI Analyst**: Examines the database schema to suggest relevant, high-level business reports.
-   **Summarizer**: Generates concise, natural-language summaries for the generated reports.

### 2.2. Dual-Key Database Schema

To ensure data stability and prevent duplication, the "Database Architect" AI defines a schema with two distinct keys for each table:

-   **`primary_key`**: A technical, auto-generated surrogate key (e.g., `generated_id`). Its sole purpose is to provide a stable, unique identifier for establishing reliable foreign key relationships.
-   **`natural_key_for_uniqueness`**: A business-oriented key composed of one or more columns that uniquely identify a record in the real world. This key is used for de-duplicating data during the import process.

This dual-key strategy allows the system to maintain stable internal links while intelligently handling duplicate records based on business rules.

### 2.3. Multi-Agent ETL Pipeline

The data import process is managed by the `runDataProcessingPipeline` orchestrator, a multi-step ETL process that ensures data is processed in the correct order and all relationships are preserved.

1.  **Dependency Analysis (`determineExecutionOrder`)**: The pipeline begins by analyzing the AI-generated schema to identify dependencies. It creates an execution plan that processes parent tables (those with no foreign keys) before their corresponding child tables.
2.  **Parent Table Processing (`processParentTable`)**: This agent processes tables with no dependencies. It de-duplicates records using the `natural_key_for_uniqueness` and generates a `primary_key` for each new record. Its most critical output is a **lookup map** that links the natural key of each record to its new primary key (e.g., `{"Global Supplies": "supp_123"}`).
3.  **Child Table Processing (`processChildTable`)**: This agent handles dependent tables. It uses the lookup maps from parent processors to populate foreign key columns. The logic follows a "populate-then-deduplicate" strategy: it first populates the foreign keys using the lookup maps and *then* de-duplicates the child records based on their own natural key. This solved critical data integrity issues.

---

## 3. Key Features & UI/UX

-   **Modern ERP Dashboard**: The UI has been redesigned into a responsive, grid-based dashboard layout, providing a professional and intuitive user experience.
-   **Modular Widgets**: The dashboard consists of reusable components, including KPI cards for at-a-glance metrics, a main chart for data visualization, and a detailed, interactive data table.
-   **Client-Side Database**: All data is stored and managed locally in the user's browser using **IndexedDB**, providing a secure and private environment.
-   **Dynamic Reporting**: The "BI Analyst" agent suggests reports, which are then rendered with interactive charts (using Chart.js) and sortable data tables (using DataTables.js). Reports can be exported as PDFs.
-   **Robust Initialization**: The application's entry point (`src/main.js`) uses a strict `DOMContentLoaded` listener to prevent race condition errors, ensuring all DOM elements are available before any script attempts to access them.
-   **Slide-In Settings Panel**: A smoothly animated panel provides a polished user experience for managing the application's configuration, such as the AI API key.
-   **Modernized Sidebar UI**: The sidebar has been significantly updated with a custom-styled file upload button that provides user feedback, and a completely redesigned table list that features a modern selection style, skeleton loaders for better perceived performance, and a non-disruptive, inline confirmation flow for deleting tables.

---

## 4. Styling and Customization

The application's visual appearance is governed by a centralized stylesheet (`src/style.css`) that enforces a strict and consistent design language.

-   **Font Size**: All elements in the application are styled with a fixed font size of **12px**. The use of relative units like `rem` or `em` has been eliminated to ensure a uniform look.
-   **Line Height**: A global `line-height` of **12px** is applied to all elements to maintain consistent vertical spacing.
-   **Margin**: A universal `margin` of **3px** is applied to every element. This creates a tight, uniform spacing across the entire interface, overriding all other margin rules.

---

## 5. Running the Application

To run this application, you must serve it from a local web server to avoid browser CORS errors. A simple way to do this is with Python's built-in HTTP server.

1.  Navigate to the project's root directory in your terminal.
2.  Run the following command: `python3 -m http.server 8888`
3.  Open your web browser and go to `http://localhost:8888`.

---

## 6. Final Status

The application is stable and all recent development tasks have been completed. The latest updates include:
-   **UI/UX Overhaul**: Completed a significant redesign of the sidebar components. The file upload process is now more intuitive, and the table list has been modernized with improved visuals, better user feedback (including skeleton loaders and a more engaging empty state), and a seamless, non-disruptive confirmation flow for deleting tables.
