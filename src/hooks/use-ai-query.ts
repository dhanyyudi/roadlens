// AI Query Hook - Main logic for AI-powered queries
import { useState, useCallback } from 'react'
import { useAIQueryStore, type QueryResults } from '@/stores/ai-query-store'
import { naturalLanguageToSQL } from '@/services/ai/vertex-ai'
import { useDuckDB } from './use-duckdb'

export interface UseAIQueryReturn {
	// State
	isOpen: boolean
	isLoading: boolean
	status: 'idle' | 'generating' | 'confirming' | 'executing' | 'completed' | 'error'
	currentSQL: string | null
	messages: import('@/stores/ai-query-store').QueryMessage[]

	// Actions
	toggleOpen: () => void
	sendQuery: (prompt: string) => Promise<void>
	confirmSQL: () => Promise<void>
	rejectSQL: () => void
	clearChat: () => void
	executeSQL: (sql: string) => Promise<QueryResults>

	// Status
	isAIConfigured: boolean
}

export function useAIQuery(): UseAIQueryReturn {
	const store = useAIQueryStore()
	const duckDBState = useDuckDB()
	const [isAIConfigured] = useState(true) // Always true with Edge Function

	// Send natural language query
	const sendQuery = useCallback(
		async (prompt: string) => {
			if (!prompt.trim()) return

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

				// Show SQL for confirmation
				store.addAssistantMessage(
					`I've generated a SQL query for your request. Would you like to execute it?`,
					result.sql
				)
				store.setCurrentSQL(result.sql)
				store.setStatus('confirming')
			} catch (error) {
				store.addErrorMessage('Failed to generate query. Please try again.')
				store.setStatus('error')
			}
		},
		[store]
	)

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
					sampleData: result.rows.slice(0, 5), // First 5 rows
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

	// Confirm and execute SQL
	const confirmSQL = useCallback(async () => {
		const sql = store.currentSQL
		if (!sql) return

		store.confirmSQL()

		// Get last assistant message ID
		const messages = useAIQueryStore.getState().messages
		const lastAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant')

		if (!lastAssistantMsg) return

		// Execute
		const results = await executeSQL(sql)

		// Update message with results
		store.setQueryResults(lastAssistantMsg.id, results)

		// Add summary message
		if (results.error) {
			store.addErrorMessage(`Execution failed: ${results.error}`)
		} else {
			store.addSystemMessage(
				`Query completed: ${results.rowCount} rows found in ${results.executionTime.toFixed(0)}ms`
			)
		}
	}, [store, executeSQL])

	// Reject SQL
	const rejectSQL = useCallback(() => {
		store.rejectSQL()
		store.addSystemMessage('Query cancelled. You can try a different question.')
	}, [store])

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
		toggleOpen: store.toggleOpen,
		sendQuery,
		confirmSQL,
		rejectSQL,
		clearChat,
		executeSQL,
		isAIConfigured,
	}
}
