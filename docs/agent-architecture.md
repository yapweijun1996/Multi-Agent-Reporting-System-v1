# AI Agent System Architecture

This document outlines a formal, modular, and extensible architecture for the AI agent system. The design decouples agent logic from the main application, centralizes agent management, and provides a clear structure for adding new agents.

## 1. Overall Design

The new architecture introduces two primary components: the `Agent` and the `AgentManager`.

*   **Agent**: A standardized structure (class-based) that encapsulates the identity and core logic of a single AI agent. Each agent is self-contained, holding its name, role description, and a method to generate its specific prompt.
*   **AgentManager**: A singleton responsible for initializing, storing, and providing access to all registered agents. It will also handle the crucial task of fetching the API key from IndexedDB and injecting it into the AI service at runtime, ensuring that agents themselves do not need to be aware of API key management.

This design moves all agent-specific code out of `src/main.js` and into a new `src/agents/` directory, promoting a clean separation of concerns.

## 2. Proposed File Structure

```
src/
|-- agents/
|   |-- agent-manager.js      # Central manager for all agents
|   |-- base-agent.js         # Base class with shared agent logic
|   |-- database-architect.js # Definition for the Database Architect agent
|   |-- bi-analyst.js           # Definition for the BI Analyst agent
|   |-- ai-service.js         # A dedicated service for interacting with the AI API
|-- db.js
|-- main.js
|-- worker.js
|-- style.css
docs/
|-- agent-architecture.md
...
```

## 3. Agent Structure

We will define a `BaseAgent` class that all specific agents will extend. This ensures a consistent interface and reduces code duplication.

### `src/agents/base-agent.js` (Pseudo-code)

```javascript
/**
 * @typedef {Object} AgentResponse
 * @property {boolean} success - Indicates if the operation was successful.
 * @property {Object|string} data - The parsed data or response text.
 * @property {string} [error] - An error message if the operation failed.
 */

/**
 * Base class for all AI agents.
 */
export class BaseAgent {
    /**
     * @param {string} name - The user-facing name of the agent.
     * @param {string} description - A brief description of the agent's role.
     */
    constructor(name, description) {
        if (this.constructor === BaseAgent) {
            throw new Error("Abstract classes can't be instantiated.");
        }
        this.name = name;
        this.description = description;
    }

    /**
     * Generates the prompt for the AI model based on the provided context.
     * This method MUST be implemented by subclasses.
     * @param {Object} context - The data needed to generate the prompt (e.g., table schemas, data previews).
     * @returns {string} The fully formed prompt.
     */
    getPrompt(context) {
        throw new Error("Method 'getPrompt()' must be implemented.");
    }

    /**
     * Executes the agent's task by generating a prompt and calling the AI service.
     * @param {Object} context - The necessary data for the agent's task.
     * @param {import('./ai-service.js').AIService} aiService - The service to use for the API call.
     * @returns {Promise<AgentResponse>} The result from the AI.
     */
    async execute(context, aiService) {
        try {
            const prompt = this.getPrompt(context);
            const responseText = await aiService.sendMessage(prompt);
            const parsedData = this._parseResponse(responseText);
            return { success: true, data: parsedData };
        } catch (error) {
            console.error(`Error executing ${this.name}:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Parses the raw text response from the AI. Subclasses can override this
     * if they expect a specific format other than JSON.
     * @param {string} responseText - The raw text from the AI API.
     * @returns {Object} The parsed JSON object.
     * @private
     */
    _parseResponse(responseText) {
        const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
        const cleanedText = jsonMatch ? jsonMatch[1] : responseText;
        return JSON.parse(cleanedText);
    }
}
```

### `src/agents/database-architect.js` (Example Implementation)

```javascript
import { BaseAgent } from './base-agent.js';

class DatabaseArchitectAgent extends BaseAgent {
    constructor() {
        super(
            'Database Architect',
            'Designs a normalized relational database schema from flat data.'
        );
    }

    /**
     * @override
     */
    getPrompt(context) {
        const { headers } = context;
        // The detailed prompt string from the original main.js would go here.
        return `
You are a world-class Database Architect AI...
Input Columns:
${headers.join(', ')}
...
`;
    }
}

export const databaseArchitectAgent = new DatabaseArchitectAgent();
```

## 4. AI Service

To further decouple the logic, we'll create a dedicated `AIService` that handles the direct communication with the Google Generative AI API.

### `src/agents/ai-service.js` (Pseudo-code)

```javascript
const API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';

/**
 * A service for making calls to the configured Generative AI model.
 */
export class AIService {
    /**
     * @param {string} apiKey - The API key for authentication.
     * @param {string} [model="gemini-1.5-flash"] - The model to use.
     */
    constructor(apiKey, model = 'gemini-1.5-flash') {
        if (!apiKey) {
            throw new Error('API key is required to initialize AIService.');
        }
        this.apiKey = apiKey;
        this.model = model;
        this.apiUrl = `${API_BASE_URL}${this.model}:generateContent?key=${this.apiKey}`;
        this.history = [];
    }

    /**
     * Sends a prompt to the AI model.
     * @param {string} prompt - The prompt to send.
     * @returns {Promise<string>} The text response from the model.
     */
    async sendMessage(prompt) {
        const fullHistory = [...this.history, { role: 'user', parts: [{ text: prompt }] }];
        const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: fullHistory }),
        });

        if (!response.ok) {
            throw new Error(`AI API call failed: ${response.status}`);
        }

        const data = await response.json();
        const text = data.candidates[0].content.parts[0].text;
        
        // Update history
        this.history.push({ role: 'user', parts: [{ text: prompt }] });
        this.history.push({ role: 'model', parts: [{ text: text }] });
        
        return text;
    }
}
```

## 5. Agent Manager

The `AgentManager` will be the single point of contact for the main application. It will load the API key and provide a simple interface to execute agents by name.

### `src/agents/agent-manager.js` (Pseudo-code)

```javascript
import { getConfiguration } from '../db.js';
import { AIService } from './ai-service.js';
import { databaseArchitectAgent } from './database-architect.js';
import { biAnalystAgent } from './bi-analyst.js';

class AgentManager {
    constructor() {
        this.agents = new Map();
        this.aiService = null;
        this._registerAgents();
    }

    _registerAgents() {
        this.register(databaseArchitectAgent);
        this.register(biAnalystAgent);
        // New agents can be registered here
    }
    
    /**
     * Adds an agent to the manager's registry.
     * @param {import('./base-agent.js').BaseAgent} agent - An instance of an agent.
     */
    register(agent) {
        this.agents.set(agent.name, agent);
    }
    
    /**
     * Initializes the AIService by loading the API key from the database.
     * This must be called before executing any agents.
     * @returns {Promise<boolean>} - True if initialization was successful.
     */
    async initialize() {
        try {
            const apiKey = await getConfiguration('apiKey');
            if (!apiKey) {
                console.warn('API key not found. AI services will be unavailable.');
                this.aiService = null;
                return false;
            }
            this.aiService = new AIService(apiKey);
            return true;
        } catch (error) {
            console.error('Failed to initialize AgentManager:', error);
            this.aiService = null;
            return false;
        }
    }

    /**
     * Executes a registered agent by name.
     * @param {string} agentName - The name of the agent to execute.
     * @param {Object} context - The data context for the agent's task.
     * @returns {Promise<import('./base-agent.js').AgentResponse>} The result from the agent.
     */
    async run(agentName, context) {
        if (!this.aiService) {
            // Attempt to re-initialize if the key was added after page load
            const initialized = await this.initialize();
            if (!initialized) {
                 return { success: false, error: 'AI Service is not initialized. Please configure your API key in settings.' };
            }
        }
        
        const agent = this.agents.get(agentName);
        if (!agent) {
            return { success: false, error: `Agent "${agentName}" not found.` };
        }

        return agent.execute(context, this.aiService);
    }
}

// Export a singleton instance
export const agentManager = new AgentManager();
```

## 6. Main Application Interaction

The `src/main.js` file will be significantly simplified. Instead of containing agent prompts and API logic, it will interact with the `AgentManager`.

### `src/main.js` (Interaction Example)

```javascript
// At the top of main.js
import { agentManager } from './agents/agent-manager.js';

// ... inside an event handler, like the CSV file input 'change' event
async function handleFileUpload(file) {
    // ... existing logic to get file preview ...
    
    const context = { headers: Object.keys(filePreview[0]) };
    
    log('Requesting database schema from AI Architect...');
    
    // Call the agent manager instead of the local function
    const response = await agentManager.run('Database Architect', context);

    if (response.success) {
        const schemaPlan = response.data;
        log("Received schema plan:", schemaPlan);
        runDataProcessingPipeline(file, schemaPlan);
    } else {
        updateProgress(`AI Architect failed: ${response.error}`, true);
        log(`AI Architect failed: ${response.error}`);
    }
}

// On page load, we should initialize the manager
window.addEventListener('load', async () => {
    // ... other loading logic ...
    await agentManager.initialize();
});

// When the API key is saved, re-initialize the manager
saveSettingsBtn.addEventListener('click', async () => {
    // ... existing logic to save key ...
    if (success) {
        await agentManager.initialize(); // Re-initialize with the new key
    }
});
```

## 7. System Interaction Diagram

This diagram illustrates the flow of control from the UI to the AI service.

```mermaid
graph TD
    subgraph "UI Layer [src/main.js]"
        A[User Action e.g., File Upload] --> B{Call agentManager.run};
    end

    subgraph "Agent System [src/agents/]"
        B --> C[AgentManager];
        C -- Reads key --> D[IndexedDB via db.js];
        C -- Instantiates --> E[AIService];
        C -- Finds & Calls 'execute' --> F[DatabaseArchitectAgent];
        F -- Gets Prompt --> G[getPrompt context];
        F -- Uses --> E;
        E -- Sends API Request --> H[Google Generative AI API];
    end

    H -- Returns Response --> E;
    E -- Returns Text --> F;
    F -- Parses & Returns Data --> C;
    C -- Returns Result --> B;
    B --> I[Update UI with Result];