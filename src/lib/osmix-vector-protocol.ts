import type { Tile } from "@osmix/shared/types"
import maplibre from "maplibre-gl"
import { VECTOR_PROTOCOL_NAME } from "../constants"
import { getOsmRemote } from "../hooks/use-osm"

const VECTOR_URL_PATTERN =
	/^@osmix\/vector:\/\/([^/]+)\/(\d+)\/(\d+)\/(\d+)\.mvt$/

let registered = false

// Per-osmId minimum zoom. Tiles requested below this zoom return null immediately
// without calling the worker, preventing overload for country-scale files.
const osmMinZoomMap = new Map<string, number>()

// Limit concurrent worker tile requests to avoid overwhelming the single-threaded worker.
// Aborted requests waiting in the queue are dropped immediately.
const MAX_CONCURRENT = 4
let pendingCount = 0
const waitQueue: Array<{ resolve: () => void; reject: (err: Error) => void }> = []

function acquireSlot(signal: AbortSignal): Promise<void> {
	if (pendingCount < MAX_CONCURRENT) {
		pendingCount++
		return Promise.resolve()
	}
	return new Promise<void>((resolve, reject) => {
		const entry = { resolve, reject }
		waitQueue.push(entry)
		signal.addEventListener("abort", () => {
			const idx = waitQueue.indexOf(entry)
			if (idx !== -1) waitQueue.splice(idx, 1)
			reject(new Error("aborted"))
		}, { once: true })
	})
}

function releaseSlot() {
	const next = waitQueue.shift()
	if (next) {
		next.resolve()
	} else {
		pendingCount--
	}
}

export function osmixIdToTileUrl(osmId: string) {
	return `${VECTOR_PROTOCOL_NAME}://${encodeURIComponent(osmId)}/{z}/{x}/{y}.mvt`
}

/**
 * Register the minimum zoom for an osmId.
 * Tiles below this zoom return null immediately without calling the worker.
 */
export function setOsmixVectorMinZoom(osmId: string, minZoom: number) {
	osmMinZoomMap.set(osmId, minZoom)
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
			const zoom = +zStr!

			// Skip tiles below the registered min zoom — no worker call needed.
			const decodedId = decodeURIComponent(osmId!)
			const minZoom = osmMinZoomMap.get(decodedId) ?? 0
			if (zoom < minZoom) {
				return { data: null }
			}

			console.log(`[vector-protocol] Request: ${osmId}/${zoom}/${tileIndex[0]}/${tileIndex[1]}`)

			const remote = getOsmRemote()
			if (!remote) {
				console.warn(`[vector-protocol] No remote available for ${osmId}`)
				return { data: null }
			}
			if (abortController.signal.aborted) {
				return { data: null }
			}

			// Wait for a concurrency slot. If aborted while waiting, bail out early
			// without ever sending the request to the worker.
			try {
				await acquireSlot(abortController.signal)
			} catch {
				return { data: null }
			}

			if (abortController.signal.aborted) {
				releaseSlot()
				return { data: null }
			}

			const startTime = performance.now()
			try {
				const data = await remote.getVectorTile(
					decodedId,
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
			} finally {
				releaseSlot()
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
