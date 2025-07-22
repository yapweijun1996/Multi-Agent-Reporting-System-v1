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
        const { title, description, data } = context;
        return `You are a data summarization AI.
A report has been generated with the following details:
- **Title:** "${title}"
- **Description:** "${description}"

Here is a sample of the data from the report (up to 20 rows):
\`\`\`json
${JSON.stringify(data, null, 2)}
\`\`\`

Based on the title, description, AND the data provided, write a brief, insightful, one-paragraph summary of the key findings. Focus on the most important trends or points revealed by the data.`;
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