import { getConfiguration } from '../db.js';
import { AIService } from './ai-service.js';
import { databaseArchitectAgent } from './database-architect.js';
import { biAnalystAgent } from './bi-analyst.js';
import { summarizerAgent } from './summarizer.js';

class AgentManager {
    constructor() {
        this.agents = new Map();
        this.aiService = null;
        this._registerAgents();
    }

    _registerAgents() {
        this.register(databaseArchitectAgent);
        this.register(biAnalystAgent);
        this.register(summarizerAgent);
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