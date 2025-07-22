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
        return `
You are a world-class Database Architect AI. Your task is to design a complete and normalized relational database schema from a flat list of columns, defining both a technical primary key and a business/natural key for each table.

Input Columns:
${headers.join(', ')}

Your Task:
1.  **Analyze Entities & Columns**: Identify distinct logical entities and assign the provided columns to the appropriate table. Table names should be plural and snake_case.
2.  **Define Two Key Types For Each Table**: This is the most critical step.
    a. **'natural_key_for_uniqueness'**: Identify the column or a list of columns that uniquely define a *business record*. This is for de-duplication. For a 'users' table, it might be \`["email"]\`. For an 'order_items' table, it's often a composite key like \`["order_id", "product_id"]\`.
    b. **'primary_key'**: This is the table's main technical key. In most cases, you should generate a new surrogate key for this by default. Name this new column exactly 'generated_id' and set it as the 'primary_key'. This new 'generated_id' column must also be added to the table's "columns" list. The only exception is for pure 'junction' tables (like 'order_items'), where the combined foreign keys can serve as the primary key.
3.  **Define Foreign Keys (FK)**: Establish relationships between tables using their 'primary_key' (which will usually be a 'generated_id').
4.  **Strict Naming**: You MUST use the exact column names from the 'Input Columns' list.

Output Format:
You must respond with ONLY a single, minified JSON object with a single root key "schema".
For each table, provide an object with **four** keys:
- "columns": An array of strings for all column names (including 'generated_id' if created).
- "primary_key": A string indicating the primary technical key (usually 'generated_id').
- "natural_key_for_uniqueness": An array of strings representing the business key for de-duplication.
- "foreign_keys": An object defining relationships.

Example with Surrogate & Natural Keys:
{"schema":{"suppliers":{"columns":["Supplier","City","generated_id"],"primary_key":"generated_id","natural_key_for_uniqueness":["Supplier"],"foreign_keys":{}},"products":{"columns":["Product","Supplier","Price","generated_id"],"primary_key":"generated_id","natural_key_for_uniqueness":["Product"],"foreign_keys":{"Supplier":"suppliers.generated_id"}}}}
    `;
    }
}

export const databaseArchitectAgent = new DatabaseArchitectAgent();