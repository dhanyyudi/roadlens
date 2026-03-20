// AI Query Configuration
// Note: All AI processing happens in Edge Function (server-side)
// This file is for client-side configuration only

export const AI_CONFIG = {
	// Rate Limiting (client-side enforcement, server also enforces)
	rateLimit: {
		maxQueriesPerMinute: 10,
		maxPromptLength: 1000,
	},

	// Result Limits
	queryLimits: {
		maxResults: 10000,
		maxExecutionTime: 5000, // 5 seconds
	},
} as const

// AI is always "ready" because Edge Function handles it
export const isAIEnabled = true
