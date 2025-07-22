import { BaseAgent } from './base-agent.js';

class SummarizerAgent extends BaseAgent {
    constructor() {
        super(
            'Summarizer',
            'Summarizes the key insights from a report.'
        );
    }

    /**
     * @override
     */
    getPrompt(context) {
        const { title, description } = context;
        return `The user generated a report titled "${title}". Based on this title and the report's description ("${description}"), write a brief, one-paragraph summary of the likely key insight. This is a placeholder for a more complex data analysis step.`;
    }

    /**
     * @override
     */
    _parseResponse(responseText) {
        // This agent's response is plain text, not JSON
        return responseText;
    }
}

export const summarizerAgent = new SummarizerAgent();