import { useCallback, useState } from "react"
import { FileDropZone } from "../shared/file-drop-zone"
import { ProgressBar } from "../shared/progress-bar"
import { useOsmStore } from "../../stores/osm-store"
import { useUIStore } from "../../stores/ui-store"
import { useOsm } from "../../hooks/use-osm"
import { osmXmlToGeoJSON, formatBbox, calculateBboxAreaKm2 } from "../../lib/osm-xml-parser"
import { FileText, MapPin, Route, GitBranch, MapPinned, SquareDashedMousePointer, Loader2, X, Check, Zap, ArrowRight, Lock } from "lucide-react"

// Sample data - Denpasar only (roads/highway only, filtered)
const SAMPLE_FILE = {
	name: "Denpasar, Bali",
	url: "/samples/denpasar.osm.pbf",
	description: "Denpasar roads only (~5 MB)",
	format: "pbf" as const,
}

// Overpass API endpoint
const OVERPASS_API = "https://overpass-api.de/api/interpreter"

// Maximum allowed area (km²) to prevent timeout
const MAX_AREA_KM2 = 10
const OVERPASS_TIMEOUT_MS = 90000 // 90 seconds

export function FilePanel() {
	const { remote } = useOsm()
	const { dataset, isLoading, progress, error } = useOsmStore()
	const setActiveTab = useUIStore((s) => s.setActiveTab)
	const isDrawingMode = useUIStore((s) => s.isDrawingMode)
	const setDrawingMode = useUIStore((s) => s.setDrawingMode)
	const drawnBbox = useUIStore((s) => s.drawnBbox)
	const clearDrawnBbox = useUIStore((s) => s.clearDrawnBbox)
	
	const [overpassLoading, setOverpassLoading] = useState(false)
	const [downloadSuccess, setDownloadSuccess] = useState(false)

	const handleFile = useCallback(
		async (file: File) => {
			if (!remote) return
			// Prevent upload if file already loaded
			if (useOsmStore.getState().dataset) {
				console.log("[FilePanel] Upload blocked: file already loaded")
				return
			}
			const store = useOsmStore.getState()
			store.setLoading(true)
			store.setError(null)
			try {
				const result = await remote.fromPbf(file, { id: file.name })
				store.setDataset({
					osmId: result.id,
					info: result,
					fileName: file.name,
				})
				store.setLoading(false)
				store.setProgress(null)
				setActiveTab("inspect")
			} catch (err) {
				store.setError(String(err))
			}
		},
		[remote, setActiveTab],
	)

	const loadSample = useCallback(async () => {
		if (!remote) return
		// Prevent upload if file already loaded
		if (useOsmStore.getState().dataset) {
			console.log("[FilePanel] Sample load blocked: file already loaded")
			return
		}
		const store = useOsmStore.getState()
		store.setLoading(true)
		store.setError(null)
		try {
			const response = await fetch(SAMPLE_FILE.url)
			if (!response.ok) {
				throw new Error(`Failed to download: ${response.statusText}`)
			}
			const blob = await response.blob()
			const file = new File([blob], "denpasar_sample.osm.pbf", {
				type: "application/octet-stream",
			})
			const result = await remote.fromPbf(file, { id: file.name })
			store.setDataset({
				osmId: result.id,
				info: result,
				fileName: file.name,
			})
			store.setLoading(false)
			store.setProgress(null)
			setActiveTab("inspect")
		} catch (err) {
			store.setError(String(err))
		}
	}, [remote, setActiveTab])

	const startDrawingMode = useCallback(() => {
		// Prevent drawing mode if file already loaded
		if (useOsmStore.getState().dataset) {
			console.log("[FilePanel] Drawing mode blocked: file already loaded")
			return
		}
		clearDrawnBbox()
		setDrawingMode(true)
	}, [clearDrawnBbox, setDrawingMode])

	const cancelDrawing = useCallback(() => {
		setDrawingMode(false)
		clearDrawnBbox()
	}, [setDrawingMode, clearDrawnBbox])

	const downloadFromOverpass = useCallback(async () => {
		if (!remote || !drawnBbox) return

		// Check area size
		const areaKm2 = calculateBboxAreaKm2(
			drawnBbox.minLon,
			drawnBbox.minLat,
			drawnBbox.maxLon,
			drawnBbox.maxLat,
		)

		if (areaKm2 > MAX_AREA_KM2) {
			useOsmStore
				.getState()
				.setError(
					`Area too large (${areaKm2.toFixed(1)} km²). Max allowed: ${MAX_AREA_KM2} km². Please draw a smaller area (about 2-5 km² works best).`,
				)
			return
		}

		setOverpassLoading(true)
		setDownloadSuccess(false)
		const store = useOsmStore.getState()
		store.setLoading(true)
		store.setError(null)

		try {
			// Optimized Overpass QL query - use 'out geom' for full geometry
			// This is more efficient than 'node(w); out meta' which downloads all nodes separately
			const query = `[bbox:${drawnBbox.minLat},${drawnBbox.minLon},${drawnBbox.maxLat},${drawnBbox.maxLon}];
way["highway"];
out geom;`

			// Fetch from Overpass API with timeout
			const controller = new AbortController()
			const timeoutId = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS)
			
			const response = await fetch(OVERPASS_API, {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: `data=${encodeURIComponent(query)}`,
				signal: controller.signal,
			})
			
			clearTimeout(timeoutId)

			if (!response.ok) {
				if (response.status === 504) {
					throw new Error("Overpass API timeout. Area too large or too complex. Try a smaller area (2-3 km²).")
				}
				throw new Error(`Overpass API error: ${response.statusText}`)
			}

			const osmXml = await response.text()

			// Parse OSM XML to GeoJSON
			const geojson = osmXmlToGeoJSON(osmXml)

			if (geojson.features.length === 0) {
				throw new Error("No roads found in selected area. Try a larger area.")
			}

			// Load GeoJSON directly using fromGeoJSON
			const fileName = `roads_${drawnBbox.minLon.toFixed(2)}_${drawnBbox.minLat.toFixed(2)}.geojson`
			const result = await remote.fromGeoJSON(
				new File([JSON.stringify(geojson)], fileName, { type: "application/geo+json" }),
				{ id: fileName },
			)

			store.setDataset({
				osmId: result.id,
				info: result,
				fileName: fileName,
			})

			setDownloadSuccess(true)
			setTimeout(() => setDownloadSuccess(false), 3000)

			store.setLoading(false)
			store.setProgress(null)
			setDrawingMode(false)
			clearDrawnBbox()
			setActiveTab("inspect")
		} catch (err) {
			if (err instanceof Error && err.name === "AbortError") {
				store.setError("Request timed out. Area may be too large or network is slow. Try a smaller area.")
			} else {
				store.setError(String(err))
			}
			setOverpassLoading(false)
			store.setLoading(false)
		}
	}, [remote, drawnBbox, clearDrawnBbox, setDrawingMode, setActiveTab])

	// Lock state: prevent upload if file already loaded
	const isLocked = !!dataset

	return (
		<div className="flex flex-col gap-4 p-4">
			<h2 className="text-sm font-semibold text-zinc-300">Load OSM PBF</h2>

			{isLocked && (
				<div className="rounded-lg border border-amber-500/30 bg-amber-900/20 p-3">
					<div className="flex items-center gap-2 text-amber-400">
						<Lock className="h-4 w-4" />
						<span className="text-xs font-medium">Upload Locked</span>
					</div>
					<p className="mt-1 text-[10px] text-amber-300/70">
						File already loaded. Refresh page to load a new file.
					</p>
				</div>
			)}

			<FileDropZone
				accept=".pbf,.osm.pbf"
				label={isLocked ? "File already loaded" : "Drop .pbf file here or click to browse"}
				onFile={handleFile}
				disabled={isLoading || !remote || isLocked}
			/>

			{/* Sample Data Section - Prominent Quick Start */}
			<div className={`relative overflow-hidden rounded-lg border border-blue-500/30 bg-gradient-to-br from-blue-900/30 via-zinc-800/50 to-zinc-800/50 p-3 ${isLocked ? 'opacity-50' : ''}`}>
				{/* Quick Start Badge */}
				<div className="absolute right-2 top-2">
					<span className="inline-flex items-center gap-1 rounded-full bg-green-500/20 px-2 py-0.5 text-[10px] font-medium text-green-400">
						<Zap className="h-3 w-3" />
						Quick Start
					</span>
				</div>
				
				<div className="mb-3 flex items-center gap-2">
					<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/20">
						<MapPinned className="h-4 w-4 text-blue-400" />
					</div>
					<div>
						<span className="text-xs font-semibold text-zinc-200">Try Sample Data</span>
						<p className="text-[10px] text-zinc-500">Instant demo, no setup needed</p>
					</div>
				</div>
				
				<button
					onClick={loadSample}
					disabled={isLoading || !remote || isLocked}
					className="group flex w-full items-center justify-between rounded-lg bg-blue-600/20 px-3 py-2.5 text-left text-xs transition-all hover:bg-blue-600/30 hover:shadow-lg hover:shadow-blue-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					<div className="flex items-center gap-2">
						<div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-500/20 group-hover:bg-blue-500/30 transition-colors">
							<span className="text-xs">🇮🇩</span>
						</div>
						<div>
							<div className="font-medium text-blue-300 group-hover:text-blue-200 transition-colors">{SAMPLE_FILE.name}</div>
							<div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
								<span>~5 MB</span>
								<span className="text-zinc-600">•</span>
								<span className="text-green-400/80">No download required</span>
							</div>
						</div>
					</div>
					<ArrowRight className="h-4 w-4 text-blue-400 transition-transform group-hover:translate-x-0.5" />
				</button>
			</div>

			{/* Download from OSM Section */}
			<div className={`rounded-lg bg-zinc-800/50 p-3 ${isLocked ? 'opacity-50' : ''}`}>
				<div className="mb-2 flex items-center gap-2">
					<SquareDashedMousePointer className="h-4 w-4 text-green-400" />
					<span className="text-xs font-medium text-zinc-300">Download from OSM</span>
				</div>
				
				{!isDrawingMode && !drawnBbox && (
					<>
						<p className="mb-2 text-[10px] text-zinc-500">
							Draw a rectangle on the map (max {MAX_AREA_KM2} km², ~2-5 km² works best)
						</p>
						<button
							onClick={startDrawingMode}
							disabled={isLoading || !remote || overpassLoading || isLocked}
							className="w-full rounded-md bg-green-600/20 px-3 py-2 text-xs font-medium text-green-400 transition-colors hover:bg-green-600/30 disabled:opacity-50"
						>
							{isLocked ? "File already loaded" : "Draw Area on Map"}
						</button>
					</>
				)}

				{isDrawingMode && !drawnBbox && (
					<div className="rounded-md bg-blue-500/10 p-3">
						<div className="flex items-center gap-2 text-blue-400">
							<Loader2 className="h-4 w-4 animate-spin" />
							<span className="text-xs font-medium">Drawing mode active...</span>
						</div>
						<p className="mt-1 text-[10px] text-blue-300/70">
							Click and drag on the map. Tip: Smaller areas (~2-3 km²) load faster.
						</p>
						<button
							onClick={cancelDrawing}
							className="mt-2 flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300"
						>
							<X className="h-3 w-3" />
							Cancel
						</button>
					</div>
				)}

				{drawnBbox && (
					<div className="space-y-2">
						{(() => {
							const areaKm2 = calculateBboxAreaKm2(drawnBbox.minLon, drawnBbox.minLat, drawnBbox.maxLon, drawnBbox.maxLat)
							const isTooLarge = areaKm2 > MAX_AREA_KM2
							return (
								<div className={`rounded-md p-2 ${isTooLarge ? 'bg-red-500/10' : 'bg-green-500/10'}`}>
									<div className={`flex items-center gap-1.5 ${isTooLarge ? 'text-red-400' : 'text-green-400'}`}>
										{isTooLarge ? <X className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
										<span className="text-[10px] font-medium">
											{isTooLarge ? 'Area too large!' : 'Area selected'}
										</span>
									</div>
									<div className="mt-1 text-[10px] text-zinc-400 font-mono">
										{formatBbox(drawnBbox)}
									</div>
									<div className={`text-[9px] ${isTooLarge ? 'text-red-400' : 'text-zinc-500'}`}>
										Area: ~{areaKm2.toFixed(1)} km² {isTooLarge && `(max ${MAX_AREA_KM2} km²)`}
									</div>
								</div>
							)
						})()}
						
						{(() => {
							const areaKm2 = calculateBboxAreaKm2(drawnBbox.minLon, drawnBbox.minLat, drawnBbox.maxLon, drawnBbox.maxLat)
							const isTooLarge = areaKm2 > MAX_AREA_KM2
							return (
								<div className="flex gap-2">
									<button
										onClick={downloadFromOverpass}
										disabled={overpassLoading || isTooLarge || isLocked}
										className="flex-1 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-500 disabled:opacity-50"
									>
										{overpassLoading ? (
											<span className="flex items-center justify-center gap-1">
												<Loader2 className="h-3 w-3 animate-spin" />
												Loading...
											</span>
										) : downloadSuccess ? (
											<span className="flex items-center justify-center gap-1">
												<Check className="h-3 w-3" />
												Loaded!
											</span>
										) : isLocked ? (
											"File already loaded"
										) : isTooLarge ? (
											"Area Too Large"
										) : (
											"Download & Load"
										)}
									</button>
									<button
										onClick={cancelDrawing}
										disabled={overpassLoading}
										className="rounded-md bg-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-600 disabled:opacity-50"
									>
										Redraw
									</button>
								</div>
							)
						})()}
					</div>
				)}
			</div>

			{isLoading && progress && (
				<ProgressBar
					progress={0.5}
					label={progress.msg ?? "Loading..."}
				/>
			)}

			{error && (
				<div className="rounded bg-red-900/50 p-2 text-xs text-red-300">
					{error}
				</div>
			)}

			{dataset && (
				<div className="flex flex-col gap-2 rounded-lg bg-zinc-800 p-3">
					<div className="flex items-center gap-2">
						<FileText className="h-4 w-4 text-zinc-400" />
						<span className="text-sm font-medium text-zinc-200 truncate">
							{dataset.fileName}
						</span>
					</div>
					<div className="grid grid-cols-2 gap-2 text-xs text-zinc-400">
						<div className="flex items-center gap-1.5">
							<MapPin className="h-3 w-3" />
							<span>{dataset.info.stats.nodes.toLocaleString()} nodes</span>
						</div>
						<div className="flex items-center gap-1.5">
							<Route className="h-3 w-3" />
							<span>{dataset.info.stats.ways.toLocaleString()} ways</span>
						</div>
						<div className="flex items-center gap-1.5">
							<GitBranch className="h-3 w-3" />
							<span>
								{dataset.info.stats.relations.toLocaleString()} relations
							</span>
						</div>
					</div>
					{dataset.info.bbox && (
						<div className="text-xs text-zinc-500">
							bbox: [{dataset.info.bbox.map((v) => v.toFixed(4)).join(", ")}]
						</div>
					)}
				</div>
			)}
		</div>
	)
}
