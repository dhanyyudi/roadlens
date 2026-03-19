#!/usr/bin/env node
/**
 * Patch @osmix/vt to not exclude relation member ways from tile rendering.
 * Without this patch, roads that are members of route/restriction/boundary
 * relations are invisible on the map.
 *
 * This patch runs after npm install (via postinstall) and before build (via prebuild).
 */

import { readFileSync, writeFileSync, existsSync } from "fs"

const ENCODE_JS = "node_modules/@osmix/vt/dist/encode.js"

if (!existsSync(ENCODE_JS)) {
	console.log("Skipping VT patch:", ENCODE_JS, "not found")
	process.exit(0)
}

let content = readFileSync(ENCODE_JS, "utf-8")

// Check if already patched
if (!content.includes("const relationWayIds = this.osm.relations.getWayMemberIds()")) {
	console.log("Patched @osmix/vt: already patched or no patch needed")
	process.exit(0)
}

// Step 1: Remove the line that declares relationWayIds in getTileForBbox
content = content.replace(
	/const relationWayIds = this\.osm\.relations\.getWayMemberIds\(\);\n/,
	""
)

// Step 2: Remove relationWayIds parameter from wayFeatures call
content = content.replace(
	/this\.wayFeatures\(bbox, proj, relationWayIds\)/,
	"this.wayFeatures(bbox, proj)"
)

// Step 3: Remove relationWayIds parameter from wayFeatures function definition
content = content.replace(
	/\*wayFeatures\(bbox, proj, relationWayIds\)/,
	"*wayFeatures(bbox, proj)"
)

// Step 4: Remove the comment and if statement that skips relation ways
// Match the comment line and the following if statement
content = content.replace(
	/\/\/ Skip ways that are part of relations \(they will be rendered via relations\)\n\s+if \(id !== undefined && relationWayIds\?\.has\(id\)\)\n\s+continue;/,
	""
)

writeFileSync(ENCODE_JS, content)
console.log("Patched @osmix/vt: relation member ways are now rendered individually")
