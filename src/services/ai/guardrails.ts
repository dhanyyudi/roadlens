// Prompt Guardrails & Security Validation
// Protects against prompt injection and malicious queries

import { AI_CONFIG } from '@/lib/ai-config'

// Blocked patterns for prompt injection
const BLOCKED_PROMPT_PATTERNS = [
	/ignore previous instructions/i,
	/ignore all prior instructions/i,
	/system prompt/i,
	/system instruction/i,
	/you are now/i,
	/you are now a/i,
	/forget everything/i,
	/forget all previous/i,
	/disregard all previous/i,
	/\{\{\{.*\}\}\}/, // Template injection
	/<script.*>/i, // XSS attempts
	/javascript:/i,
	/on\w+\s*=/i, // Event handlers
]

// Blocked SQL patterns for security
const BLOCKED_SQL_PATTERNS = [
	/;\s*\w+/i, // Multiple statements (only allow single statement)
	/--/g, // SQL comments
	/\/\*/g, // Block comments
	/UNION\s+ALL\s+SELECT/i, // Union injection
	/EXEC\s*\(/i, // Stored procedures
	/xp_/i, // Extended procedures
	/INTO\s+OUTFILE/i, // File operations
	/INTO\s+DUMPFILE/i,
	/LOAD_FILE/i,
	/BENCHMARK\s*\(/i, // Timing attacks
	/SLEEP\s*\(/i,
	/WAITFOR\s+DELAY/i,
]

// Allowed SQL commands
const ALLOWED_COMMANDS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE']

// Validation result interface
export interface ValidationResult {
	valid: boolean
	reason?: string
}

/**
 * Validate user prompt for injection attacks
 */
export function validatePrompt(prompt: string): ValidationResult {
	// Check length
	if (prompt.length > AI_CONFIG.rateLimit.maxPromptLength) {
		return {
			valid: false,
			reason: `Prompt too long. Maximum ${AI_CONFIG.rateLimit.maxPromptLength} characters.`,
		}
	}

	// Check blocked patterns
	for (const pattern of BLOCKED_PROMPT_PATTERNS) {
		if (pattern.test(prompt)) {
			return {
				valid: false,
				reason: 'Potentially harmful prompt detected.',
			}
		}
	}

	return { valid: true }
}

/**
 * Validate generated SQL for security
 */
export function validateSQL(sql: string): ValidationResult {
	// Trim whitespace
	const trimmed = sql.trim()

	// Must start with allowed command
	const parts = trimmed.split(/\s+/)
	const firstWord = parts[0]?.toUpperCase()
	if (!firstWord || !ALLOWED_COMMANDS.includes(firstWord)) {
		return {
			valid: false,
			reason: `SQL command '${firstWord}' not allowed. Only ${ALLOWED_COMMANDS.join(', ')} are permitted.`,
		}
	}

	// Check blocked SQL patterns
	for (const pattern of BLOCKED_SQL_PATTERNS) {
		if (pattern.test(trimmed)) {
			return {
				valid: false,
				reason: 'SQL contains potentially dangerous patterns.',
			}
		}
	}

	return { valid: true }
}

/**
 * Sanitize SQL (basic cleanup)
 */
export function sanitizeSQL(sql: string): string {
	// Remove extra whitespace
	let sanitized = sql.trim().replace(/\s+/g, ' ')

	// Ensure semicolon at end if not present
	if (!sanitized.endsWith(';')) {
		sanitized += ';'
	}

	return sanitized
}

/**
 * Add LIMIT clause if not present
 */
export function ensureLimit(sql: string, maxResults: number = AI_CONFIG.queryLimits.maxResults): string {
	// Check if LIMIT already exists
	if (/\bLIMIT\b/i.test(sql)) {
		return sql
	}

	// Remove trailing semicolon if present
	let cleanSql = sql.trim()
	if (cleanSql.endsWith(';')) {
		cleanSql = cleanSql.slice(0, -1)
	}

	// Add LIMIT
	return `${cleanSql} LIMIT ${maxResults};`
}

// Rate limiting storage (in-memory, per session)
const queryTimestamps: number[] = []

/**
 * Check rate limit
 */
export function checkRateLimit(): ValidationResult {
	const now = Date.now()
	const oneMinuteAgo = now - 60000

	// Remove old timestamps
	while (queryTimestamps.length > 0 && queryTimestamps[0]! < oneMinuteAgo) {
		queryTimestamps.shift()
	}

	// Check limit
	if (queryTimestamps.length >= AI_CONFIG.rateLimit.maxQueriesPerMinute) {
		const oldestQuery = queryTimestamps[0]
		if (oldestQuery) {
			const waitSeconds = Math.ceil((60000 - (now - oldestQuery)) / 1000)
			return {
				valid: false,
				reason: `Rate limit exceeded. Please wait ${waitSeconds} seconds before sending another query.`,
			}
		}
	}

	// Add current timestamp
	queryTimestamps.push(now)
	return { valid: true }
}

/**
 * Clear rate limit history (for testing)
 */
export function clearRateLimit(): void {
	queryTimestamps.length = 0
}
