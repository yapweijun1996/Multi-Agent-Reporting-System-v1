import { BaseAgent } from './base-agent.js';

class BIAnalystAgent extends BaseAgent {
    constructor() {
        super(
            'BI Analyst',
            'Proposes insightful business intelligence reports based on a database schema.'
        );
    }

    /**
     * @override
     */
    getPrompt(context) {
        const { dbSchema } = context;
        return `
You are a Business Intelligence Analyst AI. Your task is to propose a list of insightful reports based on the available database schema.

**Database Schema:**
${JSON.stringify(dbSchema, null, 2)}

**Your Task:**
1. Analyze the schema to understand the relationships between tables.
2. Brainstorm a list of 3 to 5 meaningful business reports that can be generated from this data.
3. For each report, provide a clear title and a concise description.
4. Crucially, for each report, specify the 'Chart.js' configuration and a 'query' object.
5. The 'query' object must detail the tables and columns for the initial data join.
6. **Aggregation**: If a report requires data aggregation (e.g., SUM, COUNT, AVG), you MUST include an 'aggregation' object within the 'query' object. This object must contain:
    - "groupBy": The column to group the data by (e.g., "Product").
    - "column": The column to be aggregated (e.g., "Quantity").
    - "method": The aggregation method (e.g., "SUM", "COUNT").
    - "newColumnName": The name for the new, calculated column (e.g., "Total Quantity Purchased").
7. The 'join' object within the query must specify the exact parent and child keys for joining tables.

**Output Format:**
You must respond with ONLY a single, minified JSON object containing a list of report suggestions.

**Example Response:**
[{"title":"Total Quantity Purchased per Product","description":"Calculates the sum of quantities for each product.","query":{"tables":["products","order_items"],"columns":{"products":["ProductName"],"order_items":["Quantity"]},"join":{"child_table":"order_items","child_key":"product_id","parent_table":"products","parent_key":"generated_id"},"aggregation":{"groupBy":"ProductName","column":"Quantity","method":"SUM","newColumnName":"Total Quantity Purchased"}},"chart_config":{"type":"bar","data":{"labels":[],"datasets":[{"label":"Total Quantity","data":[]}]}}}]
    `;
    }
}

export const biAnalystAgent = new BIAnalystAgent();