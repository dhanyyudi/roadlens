// Vercel API Route: AI Query Endpoint
// Uses @vercel/node runtime

import { VertexAI } from '@google-cloud/vertexai';

// Read from environment variables (Vercel env vars)
// For local testing, the env var should be set in .env.local
const SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT;
const LOCATION = process.env.VERTEX_AI_LOCATION || 'us-central1';
const MODEL_ID = process.env.VERTEX_AI_MODEL || 'gemini-2.5-flash';

let SERVICE_ACCOUNT;
try {
  SERVICE_ACCOUNT = SERVICE_ACCOUNT_JSON ? JSON.parse(SERVICE_ACCOUNT_JSON) : null;
} catch (e) {
  console.error('Failed to parse service account JSON:', e.message);
  SERVICE_ACCOUNT = null;
}

// Schema context for prompt
const SCHEMA_CONTEXT = `
DATABASE SCHEMA:

Table: roads
- id (INTEGER): Unique road identifier
- name (TEXT): Road name (may be NULL)
- highway (TEXT): Road type: motorway, trunk, primary, secondary, tertiary, residential, service, unclassified, track, path, footway, cycleway
- geometry (BLOB): Line geometry
- length_meters (DOUBLE): Road length in meters
- tags (JSON): Additional OSM tags

Table: nodes
- id (INTEGER): Unique node identifier
- lat (DOUBLE): Latitude
- lon (DOUBLE): Longitude
- tags (JSON): OSM tags

Table: intersections
- node_id (INTEGER): Reference to nodes.id
- road_ids (JSON): Array of connected road IDs

Use tags->>'key' for JSON extraction in DuckDB.
`.trim();

const SYSTEM_INSTRUCTION = `
You are an expert SQL assistant for OpenStreetMap data.
Convert natural language to DuckDB SQL.

RULES:
1. ONLY use tables and columns from schema
2. Return ONLY the SQL query, no explanation
3. Use proper DuckDB syntax
4. Use length_meters for length comparisons
5. Use tags->>'key' for JSON extraction

RESPONSE FORMAT:
Return ONLY the SQL query.
No markdown, no explanation.
`.trim();

const EXAMPLES = `
EXAMPLES:
User: "Find primary roads longer than 5km"
SQL: SELECT * FROM roads WHERE highway = 'primary' AND length_meters > 5000;

User: "Count roads by type"
SQL: SELECT highway, COUNT(*) as count FROM roads GROUP BY highway ORDER BY count DESC;
`.trim();

// Rate limiting (simple in-memory)
const queryCounts = new Map();
const MAX_QUERIES_PER_MINUTE = 10;

function checkRateLimit(clientId) {
  const now = Date.now();
  const oneMinuteAgo = now - 60000;
  
  let timestamps = queryCounts.get(clientId) || [];
  timestamps = timestamps.filter(ts => ts > oneMinuteAgo);
  
  if (timestamps.length >= MAX_QUERIES_PER_MINUTE) {
    const oldestQuery = timestamps[0];
    const waitSeconds = Math.ceil((60000 - (now - oldestQuery)) / 1000);
    queryCounts.set(clientId, timestamps);
    return { allowed: false, waitSeconds };
  }
  
  timestamps.push(now);
  queryCounts.set(clientId, timestamps);
  return { allowed: true };
}

function buildPrompt(userQuery) {
  return `${SYSTEM_INSTRUCTION}

${SCHEMA_CONTEXT}

${EXAMPLES}

USER QUERY:
"${userQuery}"

Generate SQL query:
`.trim();
}

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  
  // Validate service account
  if (!SERVICE_ACCOUNT) {
    res.status(500).json({ error: 'Service account not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON env var.' });
    return;
  }
  
  try {
    const { prompt, history } = req.body;
    
    // Validate
    if (!prompt || prompt.trim().length === 0) {
      res.status(400).json({ error: 'Prompt is required' });
      return;
    }
    
    if (prompt.length > 1000) {
      res.status(400).json({ error: 'Prompt too long (max 1000 chars)' });
      return;
    }
    
    // Rate limiting
    const clientId = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'anonymous';
    const rateLimit = checkRateLimit(clientId);
    if (!rateLimit.allowed) {
      res.status(429).json({ 
        error: `Rate limit exceeded. Please wait ${rateLimit.waitSeconds} seconds.` 
      });
      return;
    }
    
    // Initialize Vertex AI
    const vertexAI = new VertexAI({
      project: PROJECT_ID,
      location: LOCATION,
      googleAuthOptions: { credentials: SERVICE_ACCOUNT },
    });
    
    const model = vertexAI.getGenerativeModel({
      model: MODEL_ID,
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024,
        topP: 0.95,
        topK: 40,
      },
    });
    
    // Build and send prompt
    const fullPrompt = buildPrompt(prompt);
    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!text) {
      res.status(500).json({ error: 'Empty response from AI' });
      return;
    }
    
    // Clean SQL
    let sql = text.trim().replace(/```sql\n?/g, '').replace(/```\n?/g, '').trim();
    if (!sql.endsWith(';')) {
      sql += ';';
    }
    
    res.status(200).json({ sql, success: true });
    
  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({ 
      error: error.message || 'Internal server error',
      success: false 
    });
  }
}
