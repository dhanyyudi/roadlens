// Prompt Engineering for NL2SQL
// Builds comprehensive prompts with schema context, bilingual support, and smart query detection

// OSM Database Schema Description
const SCHEMA_CONTEXT = `
DATABASE SCHEMA:

Table: roads
- id (BIGINT): Unique OSM road identifier
- name (VARCHAR): Road name (may be NULL if unnamed)
- highway (VARCHAR): Road type classification. Valid values:
  * 'motorway' - Tol/jalan bebas hambatan (highest speed)
  * 'trunk' - Jalan utama antar kota non-tol
  * 'primary' - Jalan utama penghubung kota/kabupaten
  * 'secondary' - Jalan kabupaten/penghubung kecamatan
  * 'tertiary' - Jalan lokal utama
  * 'residential' - Jalan perumahan/komplek
  * 'unclassified' - Jalan kecil tanpa klasifikasi khusus
  * 'service' - Jalan akses (parkir, garasi, belakang gedung)
  * 'track' - Jalan tanah/desa/kebun
  * 'path' - Jalur pejalan kaki (non-structured)
  * 'footway' - Trotoar/jalur pedestrian
  * 'cycleway' - Jalur sepeda
  * 'steps' - Tangga
  * Link roads: 'motorway_link', 'trunk_link', 'primary_link', etc (ramp/exit)
- length_meters (DOUBLE): Road length in meters
- tags (JSON): Additional OSM tags including:
  * 'oneway' -> 'yes'/'no' for one-way streets
  * 'maxspeed' -> speed limit
  * 'surface' -> 'asphalt', 'concrete', 'unpaved', etc
  * 'lanes' -> number of lanes

COMMON QUERY PATTERNS:
- By type: highway = 'motorway', highway = 'primary', etc
- By length: length_meters > 5000 (for >5km), length_meters < 1000 (for <1km)
- By name: name ILIKE '%sudirman%' (case-insensitive pattern match)
- Named roads: name IS NOT NULL
- Unnamed roads: name IS NULL
- One-way: tags->>'oneway' = 'yes'
`.trim()

// System instruction with enhanced query detection
const SYSTEM_INSTRUCTION = `
You are an expert SQL assistant for OpenStreetMap (OSM) data analysis.
Convert natural language queries to valid DuckDB SQL.

=== QUERY TYPE DETECTION (CRITICAL) ===
Analyze the user's intent and generate appropriate SQL:

1. COUNT QUERIES - Use COUNT(*):
   Keywords: "berapa", "how many", "count", "jumlah", "total", "banyaknya", "ada berapa"
   Example: "berapa jalan tol" → SELECT COUNT(*) as count FROM roads WHERE highway = 'motorway';

2. AGGREGATE QUERIES - Use AVG/SUM/MIN/MAX:
   Keywords: "rata-rata", "average", "mean", "total", "sum", "maximum", "minimum", "paling"
   Example: "rata-rata panjang jalan" → SELECT AVG(length_meters) as avg_length FROM roads;

3. COMPARISON/SORTING QUERIES:
   Keywords: "paling panjang", "longest", "shortest", "terpendek", "terpanjang"
   Example: "jalan tol terpanjang" → SELECT * FROM roads WHERE highway = 'motorway' ORDER BY length_meters DESC LIMIT 1;

4. SEARCH/LIST QUERIES - Use SELECT *:
   Keywords: "cari", "show", "find", "tampilkan", "list", "daftar", "semua", "where is"
   Example: "tampilkan jalan tol" → SELECT * FROM roads WHERE highway = 'motorway';

=== ROAD TYPE MAPPING (Bahasa Indonesia ↔ English) ===
Map these terms to highway values:

Indonesian terms → highway value:
- "tol", "jalan tol", "highway", "autobahn" → 'motorway'
- "jalan utama", "jalan arteri", "arteri", "main road", "arterial" → 'primary'
- "jalan kabupaten", "jalan provinsi", "secondary" → 'secondary'
- "jalan lokal", "tertiary" → 'tertiary'
- "jalan perumahan", "komplek", "perumahan", "residential", "permukiman" → 'residential'
- "jalan desa", "jalan tanah", "dirt road", "kampung" → 'track' or 'unclassified'
- "jalan kecil", "gang", "lorong", "service" → 'service'
- "trotoar", "jalur pejalan", "footpath", "sidewalk" → 'footway'
- "jalur sepeda", "cycleway", "bike lane" → 'cycleway'
- "jalan setapak", "path", "trail" → 'path'
- "tangga", "steps" → 'steps'

=== SPECIAL CONDITIONS ===
- "satu arah", "one way", "one-way", "searah" → tags->>'oneway' = 'yes'
- "dua arah", "two way", "two-way" → tags->>'oneway' = 'no' OR name IS NOT NULL (most roads)
- "ada nama", "with name", "named", "bernama" → name IS NOT NULL
- "tanpa nama", "unnamed", "no name", "tidak bernama" → name IS NULL
- "lebih dari X km", "longer than X km", "> X km" → length_meters > X*1000
- "kurang dari X km", "shorter than X km", "< X km" → length_meters < X*1000

=== LENGTH CONVERSION ===
Always convert km to meters: X km = X * 1000 meters
Examples:
- "lebih dari 5 km" → length_meters > 5000
- "kurang dari 1 km" → length_meters < 1000

=== SQL RULES (CRITICAL - MUST FOLLOW) ===
1. ONLY use tables and columns described in the schema
2. Return ONLY the SQL query, no explanation, no markdown
3. Use proper DuckDB syntax
4. ALWAYS use column aliases for aggregate functions:
   - COUNT(*) MUST use: COUNT(*) as total
   - AVG(length_meters) MUST use: AVG(length_meters) as avg_length
   - SUM(length_meters) MUST use: SUM(length_meters) as total_length
   - MIN/MAX MUST use: MIN(length_meters) as min_length, MAX(length_meters) as max_length
5. For pattern matching use: name ILIKE '%pattern%' (case-insensitive)
6. For exact match use: highway = 'value'
7. Order by length: ORDER BY length_meters DESC/ASC
8. Limit results when appropriate: LIMIT N
9. NEVER use COUNT(*) without 'as total' alias

=== RESPONSE FORMAT ===
Return ONLY the SQL query.
No markdown code blocks, no explanations, no notes.
`.trim()

// Comprehensive few-shot examples
const EXAMPLE_QUERIES = `
EXAMPLES:

-- Count queries
User: "berapa jalan tol?"
SQL: SELECT COUNT(*) as total FROM roads WHERE highway = 'motorway';

User: "how many primary roads?"
SQL: SELECT COUNT(*) as total FROM roads WHERE highway = 'primary';

User: "jumlah jalan perumahan"
SQL: SELECT COUNT(*) as total FROM roads WHERE highway = 'residential';

User: "ada berapa jalan yang panjangnya lebih dari 5km?"
SQL: SELECT COUNT(*) as total FROM roads WHERE length_meters > 5000;

-- Aggregate queries
User: "rata-rata panjang jalan tol"
SQL: SELECT AVG(length_meters) as avg_length FROM roads WHERE highway = 'motorway';

User: "average length of primary roads"
SQL: SELECT AVG(length_meters) as avg_length FROM roads WHERE highway = 'primary';

User: "total length of all roads"
SQL: SELECT SUM(length_meters) as total_length FROM roads;

User: "jalan tol terpanjang"
SQL: SELECT * FROM roads WHERE highway = 'motorway' ORDER BY length_meters DESC LIMIT 1;

User: "shortest residential road"
SQL: SELECT * FROM roads WHERE highway = 'residential' ORDER BY length_meters ASC LIMIT 1;

-- Search/list queries
User: "tampilkan semua jalan tol"
SQL: SELECT * FROM roads WHERE highway = 'motorway';

User: "show all primary roads longer than 2km"
SQL: SELECT * FROM roads WHERE highway = 'primary' AND length_meters > 2000;

User: "cari jalan yang namanya mengandung sudirman"
SQL: SELECT * FROM roads WHERE name ILIKE '%sudirman%';

User: "find residential roads without names"
SQL: SELECT * FROM roads WHERE highway = 'residential' AND name IS NULL;

-- Group by queries
User: "berapa jumlah jalan per tipe?"
SQL: SELECT highway, COUNT(*) as total FROM roads GROUP BY highway ORDER BY total DESC;

User: "count roads by type"
SQL: SELECT highway, COUNT(*) as total FROM roads GROUP BY highway ORDER BY total DESC;

User: "rata-rata panjang jalan per tipe"
SQL: SELECT highway, AVG(length_meters) as avg_length FROM roads GROUP BY highway ORDER BY avg_length DESC;

-- Complex queries
User: "jalan tol yang panjangnya lebih dari 10km"
SQL: SELECT * FROM roads WHERE highway = 'motorway' AND length_meters > 10000;

User: "primary roads with names"
SQL: SELECT * FROM roads WHERE highway = 'primary' AND name IS NOT NULL;

User: "one-way residential roads"
SQL: SELECT * FROM roads WHERE highway = 'residential' AND tags->>'oneway' = 'yes';

User: "unnamed tracks longer than 1km"
SQL: SELECT * FROM roads WHERE highway = 'track' AND name IS NULL AND length_meters > 1000;

-- Bicycle/pedestrian access queries
User: "apakah ada jalan yang bisa digunakan oleh sepeda?"
SQL: SELECT COUNT(*) as total FROM roads WHERE highway = 'cycleway';

User: "jalur sepeda"
SQL: SELECT * FROM roads WHERE highway = 'cycleway';

User: "jalan yang boleh dilewati sepeda"
SQL: SELECT * FROM roads WHERE highway = 'cycleway' OR tags->>'bicycle' = 'yes';

User: "jalur pejalan kaki"
SQL: SELECT * FROM roads WHERE highway = 'footway';

User: "jalan untuk trotoar"
SQL: SELECT * FROM roads WHERE highway = 'footway';
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

Generate SQL query (return ONLY SQL, no explanation):
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

Generate SQL query (return ONLY SQL, no explanation):
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

/**
 * Detect query intent from user input (client-side preprocessing)
 */
export function detectQueryIntent(query: string): {
	type: 'count' | 'aggregate' | 'search' | 'unknown'
	confidence: number
} {
	const lower = query.toLowerCase()
	
	// Count indicators
	const countKeywords = ['berapa', 'how many', 'count', 'jumlah', 'total', 'banyaknya', 'ada berapa']
	if (countKeywords.some(k => lower.includes(k))) {
		return { type: 'count', confidence: 0.9 }
	}
	
	// Aggregate indicators
	const aggregateKeywords = ['rata-rata', 'average', 'mean', 'total', 'sum', 'maximum', 'minimum', 'paling', 'terpanjang', 'terpendek']
	if (aggregateKeywords.some(k => lower.includes(k))) {
		return { type: 'aggregate', confidence: 0.85 }
	}
	
	// Search indicators
	const searchKeywords = ['cari', 'show', 'find', 'tampilkan', 'list', 'daftar', 'semua', 'where is', 'lihat']
	if (searchKeywords.some(k => lower.includes(k))) {
		return { type: 'search', confidence: 0.8 }
	}
	
	return { type: 'unknown', confidence: 0.5 }
}

/**
 * Map Indonesian/English road type terms to highway values
 */
export function mapRoadType(term: string): string | null {
	const mappings: Record<string, string> = {
		// Indonesian
		'tol': 'motorway',
		'jalan tol': 'motorway',
		'autobahn': 'motorway',
		'jalan utama': 'primary',
		'arteri': 'primary',
		'jalan arteri': 'primary',
		'jalan kabupaten': 'secondary',
		'jalan provinsi': 'secondary',
		'jalan lokal': 'tertiary',
		'jalan perumahan': 'residential',
		'komplek': 'residential',
		'perumahan': 'residential',
		'permukiman': 'residential',
		'jalan desa': 'track',
		'jalan tanah': 'track',
		'kampung': 'unclassified',
		'jalan kecil': 'service',
		'gang': 'service',
		'lorong': 'service',
		'trotoar': 'footway',
		'jalur pejalan': 'footway',
		'jalur sepeda': 'cycleway',
		'jalan setapak': 'path',
		'tangga': 'steps',
		// English
		'motorway': 'motorway',
		'highway': 'motorway',
		'trunk': 'trunk',
		'primary': 'primary',
		'main road': 'primary',
		'secondary': 'secondary',
		'tertiary': 'tertiary',
		'residential': 'residential',
		'service': 'service',
		'track': 'track',
		'path': 'path',
		'footway': 'footway',
		'sidewalk': 'footway',
		'cycleway': 'cycleway',
		'bike lane': 'cycleway',
		'steps': 'steps',
		'stairs': 'steps',
	}
	
	return mappings[term.toLowerCase()] || null
}
