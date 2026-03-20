// AI Query Hook - Main logic for AI-powered queries
import { useState, useCallback } from 'react'
import { useAIQueryStore, type QueryResults } from '@/stores/ai-query-store'
import { naturalLanguageToSQL } from '@/services/ai/vertex-ai'
import { useDuckDB } from './use-duckdb'
import { useOsmDuckDBSync } from './use-osm-duckdb-sync'

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
function detectQueryType(sql: string): 'count' | 'aggregate' | 'select' {
	const upperSQL = sql.toUpperCase()
	if (upperSQL.includes('COUNT(*)') || upperSQL.includes('COUNT(')) {
		return 'count'
	}
	if (upperSQL.includes('AVG(') || upperSQL.includes('SUM(') || upperSQL.includes('MIN(') || upperSQL.includes('MAX(')) {
		return 'aggregate'
	}
	return 'select'
}

// Format result message based on query type
function formatResultMessage(queryType: 'count' | 'aggregate' | 'select', results: QueryResults): string {
	if (results.error) {
		return `Query failed: ${results.error}`
	}

	if (queryType === 'count') {
		// For COUNT queries, show the actual count value
		const count = results.sampleData?.[0]?.count || results.sampleData?.[0]?.total || results.rowCount || 0
		return `Found **${count}** roads matching your query.`
	}

	if (queryType === 'aggregate') {
		// For aggregate queries, show the result
		if (results.sampleData && results.sampleData.length > 0) {
			const row = results.sampleData[0] as Record<string, number | string>
			const entries = Object.entries(row)
				.filter(([key]) => key !== 'id' && key !== 'name' && key !== 'highway')
				.map(([key, value]) => {
					const numVal = Number(value)
					if (!isNaN(numVal)) {
						return `${key}: ${numVal.toFixed(2)}`
					}
					return `${key}: ${value}`
				})
				.join(', ')
			return `Result: ${entries}`
		}
		return `Query completed with ${results.rowCount} result(s).`
	}

	// For SELECT queries
	if (results.rowCount === 0) {
		return 'No roads found matching your query.'
	}
	if (results.rowCount === 1) {
		return 'Found 1 road matching your query.'
	}
	return `Found ${results.rowCount} roads matching your query.`
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
				store.addErrorMessage('Please load OSM data first before using AI Query.')
				return
			}

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

				// Auto-execute immediately
				const execResult = await executeSQL(result.sql)

				if (execResult.error) {
					store.addErrorMessage(`Query failed: ${execResult.error}`)
					store.setStatus('error')
				} else {
					// Format message based on query type
					const summary = formatResultMessage(queryType, execResult)
					
					store.addAssistantMessage(
						summary,
						result.sql,
						execResult
					)
					store.setStatus('completed')
				}
			} catch (error) {
				store.addErrorMessage('Failed to process query. Please try again.')
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
