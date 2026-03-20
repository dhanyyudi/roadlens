// Prompt Engineering for NL2SQL
// Builds comprehensive prompts with schema context

// Prompt builder for NL2SQL

// OSM Database Schema Description
const SCHEMA_CONTEXT = `
DATABASE SCHEMA:

Table: roads
- id (INTEGER): Unique road identifier
- name (TEXT): Road name (may be NULL)
- highway (TEXT): Road type classification:
  * 'motorway' - High-speed highways
  * 'trunk' - Major roads
  * 'primary' - Main roads connecting towns
  * 'secondary' - District roads
  * 'tertiary' - Local roads
  * 'residential' - Neighborhood roads
  * 'service' - Access roads
  * 'unclassified' - Minor roads
  * 'track' - Rural tracks
  * 'path' - Walking paths
  * 'footway' - Pedestrian paths
  * 'cycleway' - Bicycle paths
- geometry (BLOB): Line geometry (spatial data)
- length_meters (DOUBLE): Road length in meters
- tags (JSON): Additional OSM tags as key-value pairs

Table: nodes
- id (INTEGER): Unique node identifier
- lat (DOUBLE): Latitude coordinate
- lon (DOUBLE): Longitude coordinate
- tags (JSON): OSM tags (may contain 'highway' for intersections)

Table: intersections
- node_id (INTEGER): Reference to nodes.id
- road_ids (JSON): Array of connected road IDs

COMMON QUERIES:
- Primary roads: highway = 'primary'
- Roads > 5km: length_meters > 5000
- One-way roads: tags->>'oneway' = 'yes'
- Roads with names: name IS NOT NULL
- Traffic signals: nodes.tags->>'highway' = 'traffic_signals'
`.trim()

// System instruction for the AI
const SYSTEM_INSTRUCTION = `
You are an expert SQL assistant for OpenStreetMap (OSM) data analysis.
Your task: Convert natural language queries to valid DuckDB SQL.

QUERY TYPE DETECTION:
- If user asks "berapa" / "how many" / "count" / "jumlah" → Use COUNT(*) or COUNT(column)
- If user asks "show" / "find" / "cari" / "tampilkan" → Use SELECT *
- If user asks "average" / "mean" / "rata-rata" → Use AVG()
- If user asks "sum" / "total" → Use SUM()
- If user asks "longest" / "shortest" → Use ORDER BY with LIMIT 1

RULES:
1. ONLY use tables and columns described in the schema
2. Return ONLY the SQL query, no explanation
3. Use proper DuckDB syntax
4. Always use length_meters for length comparisons
5. For road types, use exact values from the highway enum
6. Use JSON extraction operators (->>) for tags column
7. Include appropriate WHERE clauses to filter data
8. Use meaningful aliases for readability
9. For count queries, always name the count column as 'count' or 'total'
10. For aggregation queries (COUNT, AVG, SUM), do NOT use SELECT *

RESPONSE FORMAT:
Return ONLY the SQL query on a single line or properly formatted.
Do not include markdown code blocks, explanations, or notes.
`.trim()

// Example queries for few-shot learning
const EXAMPLE_QUERIES = `
EXAMPLES:

User: "Find primary roads longer than 5km"
SQL: SELECT * FROM roads WHERE highway = 'primary' AND length_meters > 5000;

User: "Show all roads with traffic signals"
SQL: SELECT r.* FROM roads r JOIN intersections i ON r.id = ANY(i.road_ids) JOIN nodes n ON i.node_id = n.id WHERE n.tags->>'highway' = 'traffic_signals';

User: "Average length of motorways"
SQL: SELECT AVG(length_meters) as avg_length FROM roads WHERE highway = 'motorway';

User: "Count roads by type"
SQL: SELECT highway, COUNT(*) as count FROM roads GROUP BY highway ORDER BY count DESC;

User: "Find residential roads without names"
SQL: SELECT * FROM roads WHERE highway = 'residential' AND name IS NULL;

User: "Roads with speed limit over 60"
SQL: SELECT * FROM roads WHERE tags->>'maxspeed' > '60';
`.trim()

/**
 * Build the complete prompt for Vertex AI
 */
export function buildPrompt(userQuery: string): string {
	return `${SYSTEM_INSTRUCTION}

${SCHEMA_CONTEXT}

${EXAMPLE_QUERIES}

USER QUERY:
"${userQuery}"

Generate SQL query:
`.trim()
}

/**
 * Build prompt with conversation history (for context-aware queries)
 */
export function buildPromptWithHistory(
	userQuery: string,
	history: Array<{ role: 'user' | 'assistant'; content: string }>
): string {
	const historyContext = history
		.map((h) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`)
		.join('\n\n')

	return `${SYSTEM_INSTRUCTION}

${SCHEMA_CONTEXT}

CONVERSATION HISTORY:
${historyContext}

USER QUERY:
"${userQuery}"

Generate SQL query:
`.trim()
}

/**
 * Get explanation for a SQL query (separate prompt)
 */
export function buildExplanationPrompt(sql: string): string {
	return `Explain this SQL query in simple terms (1-2 sentences):

${sql}

Explanation:
`.trim()
}

/**
 * Build prompt for query correction (when SQL fails)
 */
export function buildCorrectionPrompt(
	originalQuery: string,
	failedSQL: string,
	errorMessage: string
): string {
	return `The following SQL query failed:

Original request: "${originalQuery}"
Generated SQL: ${failedSQL}
Error: ${errorMessage}

Fix the SQL query. Return ONLY the corrected SQL:
`.trim()
}
