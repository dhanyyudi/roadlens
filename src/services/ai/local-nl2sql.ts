/**
 * Local Natural Language to SQL converter
 * Fallback when API is not available (e.g., localhost dev, API errors)
 * Supports Indonesian and English queries
 */

export interface NL2SQLResult {
	sql: string
	error?: string
}

/**
 * Parse natural language query to SQL using local rules
 * No API call needed - works offline
 */
export function naturalLanguageToSQLLocal(query: string): NL2SQLResult {
	const lower = query.toLowerCase().trim()

	// Count queries
	if (lower.includes('berapa') || lower.includes('count') || lower.includes('jumlah') || lower.includes('how many')) {
		return parseCountQuery(lower)
	}

	// Find/Select queries
	if (lower.includes('cari') || lower.includes('find') || lower.includes('show') || lower.includes('tampilkan') || lower.includes('where')) {
		return parseSelectQuery(lower)
	}

	// Group/Stats queries
	if (lower.includes('group') || lower.includes('by type') || lower.includes('statistik') || lower.includes('per tipe')) {
		return parseGroupQuery(lower)
	}

	// Aggregate queries (sum, avg, etc)
	if (lower.includes('total') || lower.includes('sum') || lower.includes('average') || lower.includes('avg') || lower.includes('rata-rata')) {
		return parseAggregateQuery(lower)
	}

	// Default: simple select
	return {
		sql: "SELECT * FROM roads LIMIT 100;",
	}
}

function parseCountQuery(query: string): NL2SQLResult {
	const highway = extractHighwayType(query)
	
	if (highway) {
		return {
			sql: `SELECT COUNT(*) as total FROM roads WHERE highway = '${highway}';`,
		}
	}

	// Count all roads
	return {
		sql: "SELECT COUNT(*) as total FROM roads;",
	}
}

function parseSelectQuery(query: string): NL2SQLResult {
	const highway = extractHighwayType(query)
	const minLength = extractMinLength(query)
	const maxLength = extractMaxLength(query)
	const name = extractName(query)

	const conditions: string[] = []

	if (highway) {
		conditions.push(`highway = '${highway}'`)
	}
	if (minLength !== null) {
		conditions.push(`length_meters >= ${minLength}`)
	}
	if (maxLength !== null) {
		conditions.push(`length_meters <= ${maxLength}`)
	}
	if (name) {
		conditions.push(`name ILIKE '%${name}%'`)
	}

	const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

	return {
		sql: `SELECT * FROM roads ${whereClause} LIMIT 100;`,
	}
}

function parseGroupQuery(query: string): NL2SQLResult {
	return {
		sql: "SELECT highway, COUNT(*) as count FROM roads GROUP BY highway ORDER BY count DESC;",
	}
}

function parseAggregateQuery(query: string): NL2SQLResult {
	const highway = extractHighwayType(query)
	const whereClause = highway ? `WHERE highway = '${highway}'` : ''

	if (query.includes('average') || query.includes('avg') || query.includes('rata-rata')) {
		return {
			sql: `SELECT AVG(length_meters) as avg_length FROM roads ${whereClause};`,
		}
	}

	// Default to SUM
	return {
		sql: `SELECT SUM(length_meters) as total_length FROM roads ${whereClause};`,
	}
}

function extractHighwayType(query: string): string | null {
	const highwayMap: Record<string, string> = {
		'motorway': 'motorway',
		'tol': 'motorway',
		'trunk': 'trunk',
		'primary': 'primary',
		'utama': 'primary',
		'sekunder': 'secondary',
		'secondary': 'secondary',
		'tersier': 'tertiary',
		'tertiary': 'tertiary',
		'residential': 'residential',
		'perumahan': 'residential',
		'service': 'service',
		'track': 'track',
		'path': 'path',
		'footway': 'footway',
		'trotoar': 'footway',
		'pejalan kaki': 'footway',
		'cycleway': 'cycleway',
		'sepeda': 'cycleway',
		'bicycle': 'cycleway',
	}

	for (const [keyword, type] of Object.entries(highwayMap)) {
		if (query.includes(keyword)) {
			return type
		}
	}

	return null
}

function extractMinLength(query: string): number | null {
	// Match: "longer than X km", "more than X km", "lebih dari X km"
	const kmMatch = query.match(/(?:longer than|more than|lebih dari)\s+(\d+)\s*(?:km|kilometer)/)
	if (kmMatch) {
		return parseInt(kmMatch[1]) * 1000
	}

	// Match: "X km" (assuming minimum)
	const simpleKmMatch = query.match(/(\d+)\s*(?:km|kilometer)(?:\s+ke atas)?/)
	if (simpleKmMatch && !query.includes('shorter') && !query.includes('less than')) {
		return parseInt(simpleKmMatch[1]) * 1000
	}

	return null
}

function extractMaxLength(query: string): number | null {
	// Match: "shorter than X km", "less than X km", "kurang dari X km"
	const kmMatch = query.match(/(?:shorter than|less than|kurang dari)\s+(\d+)\s*(?:km|kilometer)/)
	if (kmMatch) {
		return parseInt(kmMatch[1]) * 1000
	}

	return null
}

function extractName(query: string): string | null {
	// Match: "named 'X'" or "nama 'X'"
	const nameMatch = query.match(/(?:named|nama|bernama)\s+['"]([^'"]+)['"]/)
	if (nameMatch) {
		return nameMatch[1]
	}

	return null
}

/**
 * Check if API is available (for local dev, return false)
 */
export function isApiAvailable(): boolean {
	// For now, always use local mode for simplicity
	// Can be changed to check environment, etc.
	return false
}
