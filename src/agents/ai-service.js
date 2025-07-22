const API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';

/**
 * A service for making calls to the configured Generative AI model.
 */
export class AIService {
    /**
     * @param {string} apiKey - The API key for authentication.
     * @param {string} [model="gemini-2.5-flash"] - The model to use.
     */
    constructor(apiKey, model = 'gemini-2.5-flash') {
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
