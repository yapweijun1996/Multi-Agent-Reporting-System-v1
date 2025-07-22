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