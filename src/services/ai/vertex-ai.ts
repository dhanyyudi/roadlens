// Vertex AI Client - Calls local Edge Function endpoint
// This file runs in browser, NO API keys here!

import { validatePrompt } from './guardrails'
import { naturalLanguageToSQLLocal } from './local-nl2sql'

export interface NL2SQLResult {
	sql: string
	error?: string
}

export interface QueryHistoryItem {
	role: 'user' | 'assistant'
	content: string
}

// API endpoint (relative, works in both dev and production)
const API_ENDPOINT = '/api/ai/query'

/**
 * Check if AI is configured (always true for Edge Function approach)
 */
export function isAIReady(): boolean {
	return true // Edge Function handles the configuration
}

/**
 * Initialize AI (no-op for Edge Function approach)
 */
export function initAI(): boolean {
	return true
}

/**
 * Convert natural language to SQL via Edge Function
 */
export async function naturalLanguageToSQL(
	query: string,
	history?: QueryHistoryItem[]
): Promise<NL2SQLResult> {
	// Validate prompt client-side (double protection)
	const validation = validatePrompt(query)
	if (!validation.valid) {
		return { sql: '', error: validation.reason }
	}

	try {
		const response = await fetch(API_ENDPOINT, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				prompt: query,
				history,
			}),
		})

		// Check if response is OK before parsing JSON
		if (!response.ok) {
			// API error - fall back to local parsing
			console.log('[AI Query] API error, using local parser...')
			return naturalLanguageToSQLLocal(query)
		}

		const data = await response.json()

		if (!response.ok) {
			return {
				sql: '',
				error: data.error || `HTTP ${response.status}: ${response.statusText}`,
			}
		}

		if (!data.sql) {
			return {
				sql: '',
				error: 'No SQL returned from server',
			}
		}

		return { sql: data.sql }
	} catch (error: any) {
		console.error('AI query error:', error)

		// Any error - fall back to local parser
		console.log('[AI Query] Network/parse error, using local parser...')
		return naturalLanguageToSQLLocal(query)
	}
}

/**
 * Retry SQL generation with error correction (simplified version)
 */
export async function correctSQL(
	originalQuery: string,
	failedSQL: string,
	errorMessage: string
): Promise<NL2SQLResult> {
	// Build a correction prompt
	const correctionPrompt = `The following SQL query failed:

Original request: "${originalQuery}"
Generated SQL: ${failedSQL}
Error: ${errorMessage}

Please fix the SQL query.`

	return naturalLanguageToSQL(correctionPrompt)
}

// Query stats (client-side tracking)
export interface QueryStats {
	queriesToday: number
	totalTokens: number
	estimatedCost: number
}

const stats: QueryStats = {
	queriesToday: 0,
	totalTokens: 0,
	estimatedCost: 0,
}

export function getQueryStats(): QueryStats {
	return { ...stats }
}

export function resetQueryStats(): void {
	stats.queriesToday = 0
	stats.totalTokens = 0
	stats.estimatedCost = 0
}

export function trackQuery(tokensUsed: number): void {
	stats.queriesToday++
	stats.totalTokens += tokensUsed
	// Vertex AI Gemini 3 Flash: ~$0.000001 per 1K characters (approximate)
	stats.estimatedCost += (tokensUsed / 1000) * 0.000001
}
