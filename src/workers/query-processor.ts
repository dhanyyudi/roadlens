/**
 * Query processor untuk large OSM datasets
 * Streaming batch processing untuk menghindari memory issues
 */

export interface QueryFilter {
	highway?: string[]
	name?: string
	minLength?: number
	maxLength?: number
	bbox?: [number, number, number, number] // [minLon, minLat, maxLon, maxLat]
}

export interface QueryOptions {
	limit?: number
	offset?: number
	batchSize?: number // Default: 10000
}

export interface RoadRecord {
	id: number
	name: string | null
	highway: string | null
	length_meters: number
	tags: Record<string, string>
}

export interface QueryResult {
	rows: RoadRecord[]
	totalCount: number
	filteredCount: number
	batchNumber: number
	totalBatches: number
	hasMore: boolean
}

export type QueryProgressCallback = (progress: {
	batchNumber: number
	totalBatches: number
	processedCount: number
	filteredCount: number
}) => void

/**
 * Process query dalam batches untuk menghindari memory issues
 */
export async function executeStreamingQuery(
	roads: RoadRecord[],
	filter: QueryFilter,
	options: QueryOptions = {},
	onProgress?: QueryProgressCallback,
): Promise<QueryResult> {
	const batchSize = options.batchSize || 10000
	const limit = options.limit || roads.length
	const offset = options.offset || 0

	const totalBatches = Math.ceil(roads.length / batchSize)
	let filteredCount = 0
	let resultRows: RoadRecord[] = []
	let batchNumber = 0

	// Process dalam batches
	for (let i = 0; i < roads.length; i += batchSize) {
		batchNumber++
		const batch = roads.slice(i, i + batchSize)

		// Filter batch ini
		const filteredBatch = batch.filter((road) => {
			return matchesFilter(road, filter)
		})

		filteredCount += filteredBatch.length

		// Add ke results jika dalam offset/limit range
		if (resultRows.length < limit) {
			const remaining = limit - resultRows.length
			const toAdd = filteredBatch.slice(0, remaining)
			resultRows.push(...toAdd)
		}

		// Report progress
		if (onProgress) {
			onProgress({
				batchNumber,
				totalBatches,
				processedCount: Math.min(i + batchSize, roads.length),
				filteredCount,
			})
		}

		// Yield control untuk UI update
		if (batchNumber % 10 === 0) {
			await new Promise((resolve) => setTimeout(resolve, 0))
		}
	}

	return {
		rows: resultRows,
		totalCount: roads.length,
		filteredCount,
		batchNumber,
		totalBatches,
		hasMore: false,
	}
}

/**
 * Count query - hanya hitung, tidak return rows
 * Lebih cepat untuk large datasets
 */
export async function executeCountQuery(
	roads: RoadRecord[],
	filter: QueryFilter,
	onProgress?: QueryProgressCallback,
): Promise<number> {
	const batchSize = 10000
	const totalBatches = Math.ceil(roads.length / batchSize)
	let count = 0
	let batchNumber = 0

	for (let i = 0; i < roads.length; i += batchSize) {
		batchNumber++
		const batch = roads.slice(i, i + batchSize)

		count += batch.filter((road) => matchesFilter(road, filter)).length

		if (onProgress) {
			onProgress({
				batchNumber,
				totalBatches,
				processedCount: Math.min(i + batchSize, roads.length),
				filteredCount: count,
			})
		}

		if (batchNumber % 10 === 0) {
			await new Promise((resolve) => setTimeout(resolve, 0))
		}
	}

	return count
}

/**
 * Aggregate query (SUM, AVG, etc)
 */
export async function executeAggregateQuery(
	roads: RoadRecord[],
	filter: QueryFilter,
	aggregate: 'sum' | 'avg' | 'min' | 'max',
	field: 'length_meters',
	onProgress?: QueryProgressCallback,
): Promise<number> {
	const batchSize = 10000
	const totalBatches = Math.ceil(roads.length / batchSize)
	let batchNumber = 0
	let sum = 0
	let count = 0
	let min = Infinity
	let max = 0

	for (let i = 0; i < roads.length; i += batchSize) {
		batchNumber++
		const batch = roads.slice(i, i + batchSize)
		const filtered = batch.filter((road) => matchesFilter(road, filter))

		for (const road of filtered) {
			const value = road[field]
			sum += value
			count++
			min = Math.min(min, value)
			max = Math.max(max, value)
		}

		if (onProgress) {
			onProgress({
				batchNumber,
				totalBatches,
				processedCount: Math.min(i + batchSize, roads.length),
				filteredCount: count,
			})
		}

		if (batchNumber % 10 === 0) {
			await new Promise((resolve) => setTimeout(resolve, 0))
		}
	}

	switch (aggregate) {
		case 'sum':
			return sum
		case 'avg':
			return count > 0 ? sum / count : 0
		case 'min':
			return min === Infinity ? 0 : min
		case 'max':
			return max
	}
}

/**
 * Check if road matches filter
 */
function matchesFilter(road: RoadRecord, filter: QueryFilter): boolean {
	// Highway filter
	if (filter.highway && filter.highway.length > 0) {
		if (!road.highway || !filter.highway.includes(road.highway)) {
			return false
		}
	}

	// Name filter (partial match)
	if (filter.name && filter.name.trim()) {
		if (
			!road.name ||
			!road.name.toLowerCase().includes(filter.name.toLowerCase())
		) {
			return false
		}
	}

	// Length filters
	if (filter.minLength !== undefined && road.length_meters < filter.minLength) {
		return false
	}
	if (filter.maxLength !== undefined && road.length_meters > filter.maxLength) {
		return false
	}

	// BBOX filter (simplified - assume road is in bbox if not filtered)
	// For proper spatial filter, need road geometry
	// This is a placeholder for future spatial indexing

	return true
}

/**
 * Parse natural language query to filter
 * Simple keyword matching
 */
export function parseNaturalLanguageQuery(query: string): QueryFilter {
	const filter: QueryFilter = {}
	const lower = query.toLowerCase()

	// Extract highway types
	const highwayTypes = [
		'motorway',
		'trunk',
		'primary',
		'secondary',
		'tertiary',
		'residential',
		'service',
		'track',
		'path',
		'footway',
		'cycleway',
	]

	const matchedTypes = highwayTypes.filter((type) => lower.includes(type))
	if (matchedTypes.length > 0) {
		filter.highway = matchedTypes
	}

	// Extract length constraints
	const longerThanMatch = lower.match(/longer than (\d+)/)
	const kmMatch = lower.match(/(\d+)\s*km/)
	const meterMatch = lower.match(/(\d+)\s*m/)

	if (longerThanMatch) {
		filter.minLength = parseInt(longerThanMatch[1]) * 1000
	} else if (kmMatch && !lower.includes('shorter')) {
		filter.minLength = parseInt(kmMatch[1]) * 1000
	} else if (meterMatch && !lower.includes('shorter')) {
		filter.minLength = parseInt(meterMatch[1])
	}

	// Extract name search
	const namedMatch = lower.match(/named ['"]([^'"]+)['"]/)
	if (namedMatch) {
		filter.name = namedMatch[1]
	}

	return filter
}
