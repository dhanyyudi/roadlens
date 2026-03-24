import { useEffect, useState } from "react"
import { OsmixRemote } from "osmix"
import * as Comlink from "comlink"
import type { Progress } from "@osmix/shared/progress"
import type { VizWorker } from "../workers/osm.worker"
import { useOsmStore, type ExtendedProgress, type LoadingStage } from "../stores/osm-store"

// Module-level singleton
let _remote: OsmixRemote<VizWorker> | null = null
let _initPromise: Promise<OsmixRemote<VizWorker>> | null = null

// Progress tracking for ETA calculation
let progressHistory: Array<{ timestamp: number; bytes: number }> = []
const MAX_HISTORY = 10

export function getOsmRemote(): OsmixRemote<VizWorker> | null {
	return _remote
}

/**
 * Detect loading stage from progress message
 */
function detectStage(msg: string | undefined): LoadingStage {
	if (!msg) return "parsing"
	const lowerMsg = msg.toLowerCase()
	
	if (lowerMsg.includes("download") || lowerMsg.includes("fetch")) {
		return "downloading"
	}
	if (lowerMsg.includes("parse") || lowerMsg.includes("read") || lowerMsg.includes("decoding")) {
		return "parsing"
	}
	if (lowerMsg.includes("index") || lowerMsg.includes("build") || lowerMsg.includes("spatial")) {
		return "indexing"
	}
	if (lowerMsg.includes("tile") || lowerMsg.includes("vector") || lowerMsg.includes("encoder")) {
		return "building-tiles"
	}
	if (lowerMsg.includes("complete") || lowerMsg.includes("done") || lowerMsg.includes("finished")) {
		return "complete"
	}
	
	// Default based on common patterns
	if (lowerMsg.includes("node") || lowerMsg.includes("way")) {
		return "parsing"
	}
	
	return "parsing"
}

/**
 * Calculate progress percentage from message
 */
function calculatePercent(msg: string | undefined, stage: LoadingStage): number {
	if (!msg) return 50
	// Try to extract percentage from message
	const percentMatch = msg.match(/(\d+(?:\.\d+)?)%/)
	if (percentMatch) {
		return Math.min(100, Math.max(0, parseFloat(percentMatch[1])))
	}
	
	// Try to extract "X of Y" pattern
	const ofMatch = msg.match(/(\d+)\s*\/\s*(\d+)/)
	if (ofMatch) {
		const current = parseInt(ofMatch[1], 10)
		const total = parseInt(ofMatch[2], 10)
		if (total > 0) {
			return Math.min(100, Math.max(0, (current / total) * 100))
		}
	}
	
	// Default progress based on stage
	const stageDefaults: Record<LoadingStage, number> = {
		downloading: 30,
		parsing: 50,
		indexing: 70,
		"building-tiles": 90,
		complete: 100,
	}
	
	return stageDefaults[stage]
}

/**
 * Calculate ETA based on progress history
 */
function calculateETA(bytesLoaded: number, bytesTotal: number): number | undefined {
	if (!bytesTotal || bytesTotal <= 0 || bytesLoaded <= 0) {
		return undefined
	}
	
	const now = Date.now()
	progressHistory.push({ timestamp: now, bytes: bytesLoaded })
	
	// Keep only recent history
	if (progressHistory.length > MAX_HISTORY) {
		progressHistory.shift()
	}
	
	// Need at least 2 data points
	if (progressHistory.length < 2) {
		return undefined
	}
	
	const first = progressHistory[0]
	const last = progressHistory[progressHistory.length - 1]
	if (!first || !last) return undefined
	const timeDiff = (last.timestamp - first.timestamp) / 1000 // seconds
	const bytesDiff = last.bytes - first.bytes
	
	if (timeDiff <= 0 || bytesDiff <= 0) {
		return undefined
	}
	
	const bytesPerSecond = bytesDiff / timeDiff
	const bytesRemaining = bytesTotal - bytesLoaded
	
	return Math.ceil(bytesRemaining / bytesPerSecond)
}

/**
 * Transform osmix Progress to ExtendedProgress with stages
 */
function transformProgress(
	progress: Progress,
	bytesTotal?: number,
): ExtendedProgress {
	const stage = detectStage(progress.msg)
	const percent = calculatePercent(progress.msg, stage)
	
	// Extract bytes loaded from message if possible
	let bytesLoaded: number | undefined
	const bytesMatch = progress.msg.match(/(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)/i)
	if (bytesMatch) {
		const value = parseFloat(bytesMatch[1])
		const unit = bytesMatch[2].toUpperCase()
		const multipliers: Record<string, number> = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 }
		bytesLoaded = value * (multipliers[unit] || 1)
	}
	
	const eta = bytesTotal && bytesLoaded ? calculateETA(bytesLoaded, bytesTotal) : undefined
	
	return {
		...progress,
		stage,
		percent,
		bytesLoaded,
		bytesTotal,
		etaSeconds: eta,
	}
}

/**
 * Create the VizWorker using the `new Worker(new URL(...))` pattern
 * so Vite bundles it for production. Then initialize OsmixRemote
 * with the pre-created worker.
 */
async function initRemote(): Promise<OsmixRemote<VizWorker>> {
	if (_remote) return _remote
	if (_initPromise) return _initPromise

	_initPromise = (async () => {
		// Vite detects this pattern and bundles the worker as a separate chunk
		const rawWorker = new Worker(
			new URL("../workers/osm.worker.ts", import.meta.url),
			{ type: "module" },
		)
		const workerProxy = Comlink.wrap<VizWorker>(rawWorker)

		// Register progress listener with transformation
		await workerProxy.addProgressListener(
			Comlink.proxy((progress: Progress) => {
				const extended = transformProgress(progress)
				useOsmStore.getState().setProgress(extended)
			}),
		)

		// Build OsmixRemote that delegates everything to our single worker
		const remote = new Proxy(
			new OsmixRemote<VizWorker>(),
			{
				get(target, prop, receiver) {
					// Override getWorker to return our pre-created worker
					if (prop === "getWorker") {
						return () => workerProxy
					}

					const value = Reflect.get(target, prop, receiver)
					return value
				},
			},
		) as unknown as OsmixRemote<VizWorker>

		// Monkey-patch the remote to use our worker for all operations
		const r = remote as unknown as Record<string, unknown>

		// Core data operations with progress tracking reset
		r.fromPbf = async (
			data: ArrayBufferLike | ReadableStream | Uint8Array | File,
			options: Record<string, unknown> = {},
		) => {
			// Reset progress tracking
			progressHistory = []
			
			// Get file size for progress calculation
			let bytesTotal: number | undefined
			if (data instanceof File) {
				bytesTotal = data.size
			} else if (data instanceof ArrayBuffer || data instanceof SharedArrayBuffer) {
				bytesTotal = data.byteLength
			} else if (data instanceof Uint8Array) {
				bytesTotal = data.byteLength
			}
			
			// Override progress listener to include file size
			await workerProxy.addProgressListener(
				Comlink.proxy((progress: Progress) => {
					const extended = transformProgress(progress, bytesTotal)
					useOsmStore.getState().setProgress(extended)
				}),
			)
			
			const transferable = await fileToBuffer(data)
			const info = await workerProxy.fromPbf(
				Comlink.transfer({ data: transferable, options }, [
					transferable as ArrayBuffer,
				]),
			)
			
			// Clear progress tracking
			progressHistory = []
			
			return info as Awaited<ReturnType<OsmixRemote<VizWorker>["fromPbf"]>>
		}

		r.fromGeoJSON = async (
			data: ArrayBufferLike | ReadableStream | Uint8Array | File,
			options: Record<string, unknown> = {},
		) => {
			progressHistory = []

			const transferable = await fileToBuffer(data)
			const info = await workerProxy.fromGeoJSON(
				Comlink.transfer({ data: transferable, options }, [
					transferable as ArrayBuffer,
				]),
			)

			progressHistory = []
			return info as Awaited<ReturnType<OsmixRemote<VizWorker>["fromGeoJSON"]>>
		}

		r.fromGeoParquet = async (
			data: ArrayBufferLike | File,
			options: Record<string, unknown> = {},
		) => {
			progressHistory = []

			let bytesTotal: number | undefined
			if (data instanceof File) {
				bytesTotal = data.size
			} else if (data instanceof ArrayBuffer) {
				bytesTotal = data.byteLength
			}

			await workerProxy.addProgressListener(
				Comlink.proxy((progress: Progress) => {
					const extended = transformProgress(progress, bytesTotal)
					useOsmStore.getState().setProgress(extended)
				}),
			)

			const transferable = (await fileToBuffer(data)) as ArrayBuffer
			const info = await workerProxy.fromGeoParquet(
				Comlink.transfer({ data: transferable, options }, [transferable]),
			)

			progressHistory = []
			return info as Awaited<ReturnType<OsmixRemote<VizWorker>["fromGeoParquet"]>>
		}

		r.getVectorTile = (osmId: unknown, tile: [number, number, number]) => {
			return workerProxy.getVectorTile(toId(osmId), tile)
		}

		r.toPbfData = (osmId: unknown) => {
			return workerProxy.toPbf(toId(osmId))
		}

		r.exportRoadsPbf = (osmId: unknown) => {
			return (workerProxy as any).exportRoadsPbf(toId(osmId))
		}

		r.search = (osmId: unknown, key: string, val?: string) => {
			return workerProxy.search(toId(osmId), key, val)
		}

		r.waysGetById = (osmId: unknown, wayId: number) => {
			return workerProxy.waysGetById(toId(osmId), wayId)
		}

		r.nodesGetById = (osmId: unknown, nodeId: number) => {
			return workerProxy.nodesGetById(toId(osmId), nodeId)
		}

		r.relationsGetById = (osmId: unknown, relId: number) => {
			return workerProxy.relationsGetById(toId(osmId), relId)
		}

		// Routing
		r.findNearestRoutableNode = (
			osmId: unknown,
			point: [number, number],
			maxDistanceM: number,
		) => {
			return workerProxy.findNearestRoutableNode(
				toId(osmId),
				point,
				maxDistanceM,
			)
		}

		r.route = (
			osmId: unknown,
			fromIndex: number,
			toIndex: number,
			options?: Record<string, unknown>,
		) => {
			return workerProxy.route(toId(osmId), fromIndex, toIndex, options)
		}

		r.buildRoutingGraph = (osmId: unknown) => {
			return workerProxy.buildRoutingGraph(toId(osmId))
		}

		r.getWorker = () => workerProxy

		_remote = remote as OsmixRemote<VizWorker>
		return _remote
	})()

	return _initPromise
}

function toId(osmId: unknown): string {
	if (typeof osmId === "string") return osmId
	if (osmId && typeof osmId === "object" && "id" in osmId)
		return (osmId as { id: string }).id
	return String(osmId)
}

async function fileToBuffer(
	data: ArrayBufferLike | ReadableStream | Uint8Array | File,
): Promise<ArrayBufferLike> {
	if (data instanceof ArrayBuffer || data instanceof SharedArrayBuffer)
		return data
	if (data instanceof Uint8Array) return data.buffer as ArrayBuffer
	if (data instanceof File) return data.arrayBuffer()
	const reader = (data as ReadableStream<Uint8Array>).getReader()
	const chunks: Uint8Array[] = []
	for (;;) {
		const { value, done } = await reader.read()
		if (value) chunks.push(value)
		if (done) break
	}
	const total = chunks.reduce((s, c) => s + c.length, 0)
	const buf = new Uint8Array(total)
	let off = 0
	for (const c of chunks) {
		buf.set(c, off)
		off += c.length
	}
	return buf.buffer as ArrayBuffer
}

export function useOsm() {
	const [remote, setRemote] = useState<OsmixRemote<VizWorker> | null>(_remote)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		initRemote()
			.then(setRemote)
			.catch((err) => setError(String(err)))
	}, [])

	return { remote, error }
}
