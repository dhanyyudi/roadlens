import type { Tile } from "@osmix/shared/types"
import maplibre from "maplibre-gl"
import { VECTOR_PROTOCOL_NAME } from "../constants"
import { getOsmRemote } from "../hooks/use-osm"

const VECTOR_URL_PATTERN =
	/^@osmix\/vector:\/\/([^/]+)\/(\d+)\/(\d+)\/(\d+)\.mvt$/

let registered = false

export function osmixIdToTileUrl(osmId: string) {
	return `${VECTOR_PROTOCOL_NAME}://${encodeURIComponent(osmId)}/{z}/{x}/{y}.mvt`
}

export function addOsmixVectorProtocol() {
	if (registered) return
	maplibre.addProtocol(
		VECTOR_PROTOCOL_NAME,
		async (
			req,
			abortController,
		): Promise<maplibregl.GetResourceResponse<ArrayBuffer | null>> => {
			const match = VECTOR_URL_PATTERN.exec(req.url)
			if (!match) throw new Error(`Bad @osmix/vector URL: ${req.url}`)
			const [, osmId, zStr, xStr, yStr] = match
			const tileIndex: Tile = [+xStr!, +yStr!, +zStr!]
			
			console.log(`[vector-protocol] Request: ${osmId}/${tileIndex[2]}/${tileIndex[0]}/${tileIndex[1]}`)
			
			const remote = getOsmRemote()
			if (!remote) {
				console.warn(`[vector-protocol] No remote available for ${osmId}`)
				return { data: null }
			}
			if (abortController.signal.aborted) {
				console.log(`[vector-protocol] Aborted: ${osmId}/${tileIndex[2]}/${tileIndex[0]}/${tileIndex[1]}`)
				return { data: null }
			}
			
			const startTime = performance.now()
			try {
				const data = await remote.getVectorTile(
					decodeURIComponent(osmId!),
					tileIndex,
				)
				const duration = performance.now() - startTime
				
				if (!data || data.byteLength === 0) {
					console.warn(`[vector-protocol] Empty tile (${duration.toFixed(1)}ms): ${osmId}/${tileIndex[2]}/${tileIndex[0]}/${tileIndex[1]}`)
					return { data: null }
				}

				console.log(`[vector-protocol] Success (${duration.toFixed(1)}ms, ${data.byteLength} bytes): ${osmId}/${tileIndex[2]}/${tileIndex[0]}/${tileIndex[1]}`)
				return {
					data: abortController.signal.aborted ? null : data,
					cacheControl: "no-cache",
				}
			} catch (err) {
				const duration = performance.now() - startTime
				console.error(`[vector-protocol] Error (${duration.toFixed(1)}ms): ${osmId}/${tileIndex[2]}/${tileIndex[0]}/${tileIndex[1]}`, err)
				return { data: null }
			}
		},
	)
	registered = true
}

export function removeOsmixVectorProtocol() {
	if (!registered) return
	maplibre.removeProtocol(VECTOR_PROTOCOL_NAME)
	registered = false
}

// Register protocol at module load time (same pattern as merge.osmix.dev)
if (typeof window !== "undefined") {
	addOsmixVectorProtocol()
}
