// AI Query Hook - Main logic for AI-powered queries
import { useState, useCallback } from 'react'
import { useAIQueryStore, type QueryResults } from '@/stores/ai-query-store'
import { naturalLanguageToSQL } from '@/services/ai/vertex-ai'
import { useDuckDB } from './use-duckdb'
import { useOsmDuckDBSync } from './use-osm-duckdb-sync'
import { detectQueryIntent, mapRoadType } from '@/services/ai/prompt-builder'

export interface UseAIQueryReturn {
	// State
	isOpen: boolean
	isLoading: boolean
	status: 'idle' | 'generating' | 'executing' | 'completed' | 'error'
	currentSQL: string | null
	messages: import('@/stores/ai-query-store').QueryMessage[]

	// Data availability
	isDataReady: boolean
	isSyncing: boolean
	syncProgress: number

	// Actions
	toggleOpen: () => void
	sendQuery: (prompt: string) => Promise<void>
	clearChat: () => void

	// Status
	isAIConfigured: boolean
}

// Detect query type from SQL
function detectQueryType(sql: string): 'count' | 'aggregate' | 'select' | 'group' {
	const upperSQL = sql.toUpperCase()
	if (upperSQL.includes('GROUP BY')) {
		return 'group'
	}
	if (upperSQL.includes('COUNT(*)') || upperSQL.includes('COUNT(')) {
		return 'count'
	}
	if (upperSQL.includes('AVG(') || upperSQL.includes('SUM(') || upperSQL.includes('MIN(') || upperSQL.includes('MAX(')) {
		return 'aggregate'
	}
	return 'select'
}

// Extract highway type from SQL for user-friendly messages
function extractRoadType(sql: string): string | null {
	const match = sql.match(/highway\s*=\s*['"]([^'"]+)['"]/i)
	return match ? match[1] : null
}

// Format road type for display
function formatRoadType(type: string | null): string {
	if (!type) return 'jalan'
	
	const typeNames: Record<string, string> = {
		'motorway': 'jalan tol',
		'trunk': 'jalan trunk',
		'primary': 'jalan utama',
		'secondary': 'jalan sekunder',
		'tertiary': 'jalan tersier',
		'residential': 'jalan perumahan',
		'service': 'jalan service',
		'unclassified': 'jalan tak terklasifikasi',
		'track': 'jalan tanah',
		'path': 'jalur setapak',
		'footway': 'trotoar',
		'cycleway': 'jalur sepeda',
		'steps': 'tangga',
	}
	
	return typeNames[type] || type
}

// Format result message based on query type with bilingual support
function formatResultMessage(queryType: 'count' | 'aggregate' | 'select' | 'group', results: QueryResults, sql: string): string {
	if (results.error) {
		return `Query failed: ${results.error}`
	}

	const roadType = formatRoadType(extractRoadType(sql))

	if (queryType === 'count') {
		const count = results.sampleData?.[0]?.count || results.sampleData?.[0]?.total || 0
		if (count === 0) {
			return `Tidak ditemukan ${roadType} yang sesuai.`
		}
		return `Ditemukan **${count}** ${roadType}.`
	}

	if (queryType === 'group') {
		const count = results.rowCount
		if (count === 0) {
			return `Tidak ada data yang ditemukan.`
		}
		return `Menampilkan statistik untuk **${count}** kategori jalan.`
	}

	if (queryType === 'aggregate') {
		if (results.sampleData && results.sampleData.length > 0) {
			const row = results.sampleData[0] as Record<string, number | string>
			const entries = Object.entries(row)
				.filter(([key]) => key !== 'id' && key !== 'name' && key !== 'highway')
				.map(([key, value]) => {
					const numVal = Number(value)
					if (!isNaN(numVal)) {
						// Format meters to km if large
						if (numVal > 1000) {
							return `${key}: ${(numVal / 1000).toFixed(2)} km`
						}
						return `${key}: ${numVal.toFixed(2)}`
					}
					return `${key}: ${value}`
				})
				.join(', ')
			return `Hasil: ${entries}`
		}
		return `Query selesai dengan ${results.rowCount} hasil.`
	}

	// For SELECT queries
	if (results.rowCount === 0) {
		return `Tidak ditemukan ${roadType} yang sesuai.`
	}
	if (results.rowCount === 1) {
		return `Ditemukan 1 ${roadType}.`
	}
	return `Ditemukan ${results.rowCount} ${roadType}.`
}

export function useAIQuery(): UseAIQueryReturn {
	const store = useAIQueryStore()
	const duckDBState = useDuckDB()
	const { isSynced: isDataReady, isSyncing, progress: syncProgress } = useOsmDuckDBSync()
	const [isAIConfigured] = useState(true)

	// Execute SQL on DuckDB
	const executeSQL = useCallback(
		async (sql: string): Promise<QueryResults> => {
			if (!duckDBState.duckdb) {
				return {
					rowCount: 0,
					executionTime: 0,
					error: 'Database not initialized',
				}
			}

			const startTime = performance.now()

			try {
				const result = await duckDBState.duckdb.executeQuery(sql)
				
				if (result.error) {
					return {
						rowCount: 0,
						executionTime: performance.now() - startTime,
						error: result.error,
					}
				}

				return {
					rowCount: result.rows.length,
					executionTime: performance.now() - startTime,
					sampleData: result.rows.slice(0, 10),
					allData: result.rows,
				}
			} catch (error: any) {
				return {
					rowCount: 0,
					executionTime: performance.now() - startTime,
					error: error.message || 'Query execution failed',
				}
			}
		},
		[duckDBState]
	)

	// Send natural language query - AUTO EXECUTE without confirmation
	const sendQuery = useCallback(
		async (prompt: string) => {
			if (!prompt.trim()) return
			if (!isDataReady) {
				store.addErrorMessage('Silakan load data OSM terlebih dahulu sebelum menggunakan AI Query.')
				return
			}

			// Pre-detect intent for logging/debugging
			const intent = detectQueryIntent(prompt)
			console.log('[AI Query] Detected intent:', intent)

			// Add user message
			store.addUserMessage(prompt)
			store.setCurrentPrompt(prompt)
			store.setStatus('generating')

			try {
				// Generate SQL
				const result = await naturalLanguageToSQL(prompt)

				if (result.error) {
					store.addErrorMessage(result.error)
					store.setStatus('error')
					store.setCurrentSQL(null)
					return
				}

				// Store SQL and auto-execute
				store.setCurrentSQL(result.sql)
				store.setStatus('executing')

				// Detect query type
				const queryType = detectQueryType(result.sql)
				console.log('[AI Query] Query type:', queryType)

				// Auto-execute immediately
				const execResult = await executeSQL(result.sql)

				if (execResult.error) {
					store.addErrorMessage(`Query gagal: ${execResult.error}`)
					store.setStatus('error')
				} else {
					// Format message based on query type
					const summary = formatResultMessage(queryType, execResult, result.sql)
					
					store.addAssistantMessage(
						summary,
						result.sql,
						execResult
					)
					store.setStatus('completed')
				}
			} catch (error) {
				store.addErrorMessage('Gagal memproses query. Silakan coba lagi.')
				store.setStatus('error')
			}
		},
		[store, executeSQL, isDataReady]
	)

	// Clear chat
	const clearChat = useCallback(() => {
		store.clearMessages()
		store.setCurrentSQL(null)
		store.setStatus('idle')
	}, [store])

	return {
		isOpen: store.isOpen,
		isLoading: store.status === 'generating' || store.status === 'executing',
		status: store.status,
		currentSQL: store.currentSQL,
		messages: store.messages,
		isDataReady,
		isSyncing,
		syncProgress,
		toggleOpen: store.toggleOpen,
		sendQuery,
		clearChat,
		isAIConfigured,
	}
}
