import { useCallback, useState, useEffect } from "react"
import { FileDropZone } from "../shared/file-drop-zone"
import { ProgressBar } from "../shared/progress-bar"
import { ReloadDialog } from "../shared/reload-dialog"
import { useOsmStore } from "../../stores/osm-store"
import { useUIStore } from "../../stores/ui-store"
import { useOsm } from "../../hooks/use-osm"
import { osmXmlToGeoJSON, formatBbox, calculateBboxAreaKm2 } from "../../lib/osm-xml-parser"
import { detectFormat, convertToGeoJSON } from "../../lib/format-converter"
import {
	saveDatasetMetadata,
	getLastDataset,
	type CachedDataset
} from "../../lib/storage"
import { FileText, MapPin, Route, GitBranch, MapPinned, SquareDashedMousePointer, Loader2, X, Check, Zap, ArrowRight, Lock, ChevronDown } from "lucide-react"

// Sample datasets - Multiple regions for capacity demonstration
interface SampleFile {
	name: string
	url: string
	description: string
	format: "pbf"
	region: string
	flag: string
	size: string
	downloadedOn: string
}

const SAMPLE_FILES: SampleFile[] = [
	{
		name: "Bali Island",
		url: "/samples/bali-island-roads.osm.pbf",
		description: "Complete Bali road network",
		format: "pbf",
		region: "indonesia",
		flag: "ID",
		size: "~14 MB",
		downloadedOn: "23 March 2026",
	},
	{
		name: "Singapore",
		url: "/samples/singapore-roads.osm.pbf",
		description: "Singapore full road network",
		format: "pbf",
		region: "singapore",
		flag: "SG",
		size: "~14 MB",
		downloadedOn: "23 March 2026",
	},
	{
		name: "Chinese Taipei",
		url: "/samples/chinese-taipei-roads.osm.pbf",
		description: "Taipei city roads",
		format: "pbf",
		region: "taiwan",
		flag: "TW",
		size: "~71 MB",
		downloadedOn: "23 March 2026",
	},
]

// Overpass API endpoint
const OVERPASS_API = "https://overpass-api.de/api/interpreter"

// Area limit — self-imposed soft cap. Overpass itself has no hard area limit;
// dense cities may still be slow for very large areas.
const MAX_AREA_KM2 = 50
const OVERPASS_TIMEOUT_MS = 180000 // 3 minutes

export function FilePanel() {
	const { remote } = useOsm()
	const { dataset, isLoading, progress, error } = useOsmStore()
	const setActiveTab = useUIStore((s) => s.setActiveTab)
	const isDrawingMode = useUIStore((s) => s.isDrawingMode)
	const setDrawingMode = useUIStore((s) => s.setDrawingMode)
	const drawnBbox = useUIStore((s) => s.drawnBbox)
	const clearDrawnBbox = useUIStore((s) => s.clearDrawnBbox)
	
	const [overpassLoading, setOverpassLoading] = useState(false)
	const [overpassStage, setOverpassStage] = useState<"querying" | "downloading" | "parsing" | "loading" | null>(null)
	const [downloadSuccess, setDownloadSuccess] = useState(false)
	const [showAllSamples, setShowAllSamples] = useState(false)
	const [loadingSample, setLoadingSample] = useState<string | null>(null)
	
	// Reload dialog state
	const [showReloadDialog, setShowReloadDialog] = useState(false)
	const [cachedDataset, setCachedDataset] = useState<CachedDataset | null>(null)
	const [pendingSampleFile, setPendingSampleFile] = useState<SampleFile | null>(null)

	// Check for cached data on mount
	useEffect(() => {
		const checkCachedData = async () => {
			if (dataset) return // Don't show if already loaded
			
			const lastDataset = await getLastDataset()
			if (lastDataset) {
				// Check if it's a sample file
				const matchingSample = SAMPLE_FILES.find(s => 
					lastDataset.fileUrl?.includes(s.url) || 
					lastDataset.fileName.includes(s.region)
				)
				
				if (matchingSample) {
					setCachedDataset(lastDataset)
					setPendingSampleFile(matchingSample)
					setShowReloadDialog(true)
				}
			}
		}
		
		checkCachedData()
	}, [dataset])
	
	// Save dataset metadata when loaded
	useEffect(() => {
		if (dataset) {
			saveDatasetMetadata({
				id: dataset.osmId,
				fileName: dataset.fileName,
				cachedAt: Date.now(),
				fileSize: 0, // Will be updated if available
				stats: dataset.info.stats,
				bbox: dataset.info.bbox,
			})
		}
	}, [dataset])

	const handleFile = useCallback(
		async (file: File) => {
			if (!remote) return
			if (useOsmStore.getState().dataset) {
				console.log("[FilePanel] Upload blocked: file already loaded")
				return
			}
			const store = useOsmStore.getState()
			store.setLoading(true)
			store.setError(null)
			try {
				const format = detectFormat(file)
				if (format === "unknown") {
					throw new Error(`Unsupported file type: ${file.name}. Supported formats: .pbf, .osm, .geojson, .gpx, .kml, .kmz, .zip`)
				}

				let result
				if (format === "pbf") {
					result = await remote.fromPbf(file, { id: file.name })
				} else if (format === "parquet") {
					result = await (remote as any).fromGeoParquet(file, { id: file.name })
				} else {
					const geojson = await convertToGeoJSON(file, format)
					const gjFile = new File([JSON.stringify(geojson)], file.name, { type: "application/geo+json" })
					result = await remote.fromGeoJSON(gjFile, { id: file.name })
				}

				store.setDataset({
					osmId: result.id,
					info: result,
					fileName: file.name,
					format,
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

	const loadSample = useCallback(async (sampleFile: SampleFile) => {
		if (!remote) return
		if (useOsmStore.getState().dataset) {
			console.log("[FilePanel] Sample load blocked: file already loaded")
			return
		}
		setLoadingSample(sampleFile.name)
		const store = useOsmStore.getState()
		store.setLoading(true)
		store.setError(null)
		try {
			const response = await fetch(sampleFile.url)
			if (!response.ok) {
				throw new Error(`Failed to download: ${response.statusText}`)
			}
			const blob = await response.blob()
			const fileName = sampleFile.url.split('/').pop() || `${sampleFile.region}_sample.osm.pbf`
			const file = new File([blob], fileName, {
				type: "application/octet-stream",
			})
			const result = await remote.fromPbf(file, { id: fileName })
			store.setDataset({
				osmId: result.id,
				info: result,
				fileName: fileName,
				format: "pbf",
			})
			store.setLoading(false)
			store.setProgress(null)
			setActiveTab("inspect")
		} catch (err) {
			store.setError(String(err))
		} finally {
			setLoadingSample(null)
		}
	}, [remote, setActiveTab])

	const startDrawingMode = useCallback(() => {
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
					`Area too large (${areaKm2.toFixed(1)} km²). Maximum is ${MAX_AREA_KM2} km².`,
				)
			return
		}

		setOverpassLoading(true)
		setOverpassStage("querying")
		setDownloadSuccess(false)
		const store = useOsmStore.getState()
		store.setError(null)

		try {
			// timeout + maxsize hints sent to Overpass server-side
			const query = `[out:xml][timeout:180][maxsize:134217728][bbox:${drawnBbox.minLat},${drawnBbox.minLon},${drawnBbox.maxLat},${drawnBbox.maxLon}];
way["highway"];
out geom;`

			const controller = new AbortController()
			const timeoutId = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS)

			setOverpassStage("downloading")
			const response = await fetch(OVERPASS_API, {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: `data=${encodeURIComponent(query)}`,
				signal: controller.signal,
			})

			clearTimeout(timeoutId)

			if (!response.ok) {
				if (response.status === 429) {
					throw new Error("Overpass API rate limited. Please wait a moment and try again.")
				}
				if (response.status === 504) {
					throw new Error("Overpass API server timeout. Try a smaller area or try again later.")
				}
				throw new Error(`Overpass API error: ${response.status} ${response.statusText}`)
			}

			// Stream the response to get byte progress
			const contentLength = response.headers.get("content-length")
			const totalBytes = contentLength ? parseInt(contentLength) : null
			const reader = response.body?.getReader()
			const chunks: Uint8Array[] = []
			let receivedBytes = 0

			if (reader) {
				while (true) {
					const { done, value } = await reader.read()
					if (done) break
					chunks.push(value)
					receivedBytes += value.length
					// Update download progress in store
					const dlMsg = totalBytes
					? `Downloading... ${(receivedBytes / 1024 / 1024).toFixed(1)} / ${(totalBytes / 1024 / 1024).toFixed(1)} MB`
					: `Downloading... ${(receivedBytes / 1024 / 1024).toFixed(1)} MB`
				store.setProgress({
						msg: dlMsg,
						timestamp: Date.now(),
						level: "info",
						stage: "downloading",
						percent: totalBytes ? Math.round((receivedBytes / totalBytes) * 60) : undefined,
						bytesLoaded: receivedBytes,
						bytesTotal: totalBytes ?? undefined,
					})
				}
			}

			const osmXml = new TextDecoder().decode(
				chunks.reduce((acc, chunk) => {
					const merged = new Uint8Array(acc.length + chunk.length)
					merged.set(acc)
					merged.set(chunk, acc.length)
					return merged
				}, new Uint8Array(0))
			)

			setOverpassStage("parsing")
			store.setProgress({ msg: "Parsing OSM XML...", timestamp: Date.now(), level: "info", stage: "parsing", percent: 70 })

			const geojson = osmXmlToGeoJSON(osmXml)

			if (geojson.features.length === 0) {
				throw new Error("No roads found in selected area. Try drawing a larger area.")
			}

			setOverpassStage("loading")
			store.setProgress({
				msg: `Loading ${geojson.features.length.toLocaleString()} road segments...`,
				timestamp: Date.now(),
				level: "info",
				stage: "indexing",
				percent: 80,
			})

			const fileName = `overpass_${drawnBbox.minLon.toFixed(3)}_${drawnBbox.minLat.toFixed(3)}.geojson`
			const result = await remote.fromGeoJSON(
				new File([JSON.stringify(geojson)], fileName, { type: "application/geo+json" }),
				{ id: fileName },
			)

			store.setDataset({
				osmId: result.id,
				info: result,
				fileName: fileName,
				format: "osm",
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
				store.setError("Request timed out after 3 minutes. The area may be too dense. Try a smaller area.")
			} else {
				store.setError(String(err))
			}
		} finally {
			setOverpassLoading(false)
			setOverpassStage(null)
			store.setProgress(null)
		}
	}, [remote, drawnBbox, clearDrawnBbox, setDrawingMode, setActiveTab])

	const isLocked = !!dataset
	const displayedSamples = showAllSamples ? SAMPLE_FILES : SAMPLE_FILES.slice(0, 1)

	return (
		<div className="flex flex-col gap-4 p-4">
			<h2 className="text-sm font-semibold text-zinc-300">Load OSM Data</h2>

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
				accept=".pbf,.osm.pbf,.osm,.geojson,.json,.gpx,.kml,.kmz,.zip,.parquet,.geoparquet"
				label={isLocked ? "File already loaded" : "Drop file here or click to browse"}
				onFile={handleFile}
				disabled={isLoading || !remote || isLocked}
			/>
			<p className="text-[10px] text-zinc-600 -mt-2">
				Supported: .pbf, .osm, .geojson, .gpx, .kml, .kmz, .zip (shapefile), .parquet
			</p>

			{/* Sample Data Section - Multiple Regions */}
			<div className={`relative overflow-hidden rounded-lg border border-blue-500/30 bg-gradient-to-br from-blue-900/30 via-zinc-800/50 to-zinc-800/50 p-3 ${isLocked ? 'opacity-50' : ''}`}>
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
						<span className="text-xs font-semibold text-zinc-200">Sample Datasets</span>
						<p className="text-[10px] text-zinc-500">Load pre-filtered road networks</p>
					</div>
				</div>
				
				<div className="space-y-2">
					{displayedSamples.map((sample) => (
						<button
							key={sample.region}
							onClick={() => loadSample(sample)}
							disabled={isLoading || !remote || isLocked || loadingSample === sample.name}
							className="group flex w-full items-center justify-between rounded-lg bg-blue-600/20 px-3 py-2.5 text-left text-xs transition-all hover:bg-blue-600/30 hover:shadow-lg hover:shadow-blue-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
						>
								<div className="flex items-center gap-2 flex-1 min-w-0">
									<div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-500/20 group-hover:bg-blue-500/30 transition-colors shrink-0">
										<span className="text-[10px] font-bold">{sample.flag}</span>
									</div>
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-2 flex-wrap">
											<div className="font-medium text-blue-300 group-hover:text-blue-200 transition-colors">{sample.name}</div>
											<span className="inline-flex items-center rounded bg-zinc-700/50 px-1.5 py-0.5 text-[9px] text-zinc-400 shrink-0">
												{sample.downloadedOn}
											</span>
										</div>
										<div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
											<span>{sample.size}</span>
											<span className="text-zinc-600">•</span>
											<span className="text-zinc-400 truncate">{sample.description}</span>
										</div>
									</div>
								</div>
							{loadingSample === sample.name ? (
								<Loader2 className="h-4 w-4 text-blue-400 animate-spin" />
							) : (
								<ArrowRight className="h-4 w-4 text-blue-400 transition-transform group-hover:translate-x-0.5" />
							)}
						</button>
					))}
				</div>

				{SAMPLE_FILES.length > 1 && (
					<button
						onClick={() => setShowAllSamples(!showAllSamples)}
						className="mt-2 flex w-full items-center justify-center gap-1 rounded-md py-1.5 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
					>
						<span>{showAllSamples ? "Show less" : `Show ${SAMPLE_FILES.length - 1} more datasets`}</span>
						<ChevronDown className={`h-3 w-3 transition-transform ${showAllSamples ? 'rotate-180' : ''}`} />
					</button>
				)}
			</div>

			{/* Download from OSM Section */}
			<div className={`rounded-lg bg-zinc-800/50 p-3 ${isLocked ? 'opacity-50' : ''}`}>
				<div className="mb-2 flex items-center gap-2">
					<SquareDashedMousePointer className="h-4 w-4 text-green-400" />
					<span className="text-xs font-medium text-zinc-300">Download from OSM</span>
				</div>

				{!isDrawingMode && !drawnBbox && !overpassLoading && (
					<>
						<p className="mb-2 text-[10px] text-zinc-500">
							Draw a rectangle on the map to fetch road data (highways only). Up to ~{MAX_AREA_KM2} km².
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
							Click and drag on the map to select an area.
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

				{/* Download progress stages */}
				{overpassLoading && (
					<div className="rounded-md bg-green-500/10 p-3 space-y-2">
						<div className="flex items-center gap-2 text-green-400">
							<Loader2 className="h-4 w-4 animate-spin shrink-0" />
							<span className="text-xs font-medium">
								{overpassStage === "querying" && "Sending query to Overpass API..."}
								{overpassStage === "downloading" && "Downloading road data..."}
								{overpassStage === "parsing" && "Parsing OSM XML..."}
								{overpassStage === "loading" && "Loading into map..."}
							</span>
						</div>
						{/* Stage pipeline */}
						<div className="flex items-center gap-1">
							{(["querying", "downloading", "parsing", "loading"] as const).map((stage, i) => {
								const stages = ["querying", "downloading", "parsing", "loading"] as const
								const currentIdx = stages.indexOf(overpassStage ?? "querying")
								const isDone = i < currentIdx
								const isActive = i === currentIdx
								return (
									<div key={stage} className="flex items-center gap-1 flex-1">
										<div className={`h-1.5 flex-1 rounded-full transition-colors ${
											isDone ? "bg-green-500" : isActive ? "bg-green-400 animate-pulse" : "bg-zinc-700"
										}`} />
										{i < 3 && <div className={`w-1 h-1 rounded-full shrink-0 ${isDone ? "bg-green-500" : "bg-zinc-700"}`} />}
									</div>
								)
							})}
						</div>
						<div className="flex justify-between text-[9px] text-zinc-500">
							<span>Query</span>
							<span>Download</span>
							<span>Parse</span>
							<span>Load</span>
						</div>
						{/* Byte progress from store */}
						{progress?.bytesLoaded !== undefined && (
							<div className="text-[10px] text-zinc-400">
								{progress.msg}
							</div>
						)}
						<p className="text-[9px] text-zinc-600">
							Large areas may take up to 3 minutes depending on road density.
						</p>
					</div>
				)}

				{drawnBbox && !overpassLoading && (
					<div className="space-y-2">
						{(() => {
							const areaKm2 = calculateBboxAreaKm2(drawnBbox.minLon, drawnBbox.minLat, drawnBbox.maxLon, drawnBbox.maxLat)
							const isTooLarge = areaKm2 > MAX_AREA_KM2
							const isLargeArea = areaKm2 > 20
							return (
								<>
									<div className={`rounded-md p-2 ${isTooLarge ? "bg-red-500/10" : isLargeArea ? "bg-amber-500/10" : "bg-green-500/10"}`}>
										<div className={`flex items-center gap-1.5 ${isTooLarge ? "text-red-400" : isLargeArea ? "text-amber-400" : "text-green-400"}`}>
											{isTooLarge ? <X className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
											<span className="text-[10px] font-medium">
												{isTooLarge ? "Area too large" : isLargeArea ? "Large area — may be slow" : "Area selected"}
											</span>
										</div>
										<div className="mt-1 text-[10px] text-zinc-400 font-mono">
											{formatBbox(drawnBbox)}
										</div>
										<div className={`text-[9px] mt-0.5 ${isTooLarge ? "text-red-400" : isLargeArea ? "text-amber-400/70" : "text-zinc-500"}`}>
											~{areaKm2.toFixed(1)} km²
											{isLargeArea && !isTooLarge && " · dense cities may take longer"}
											{isTooLarge && ` · max ${MAX_AREA_KM2} km²`}
										</div>
									</div>

									<div className="flex gap-2">
										<button
											onClick={downloadFromOverpass}
											disabled={overpassLoading || isTooLarge || isLocked}
											className="flex-1 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-500 disabled:opacity-50"
										>
											{downloadSuccess ? (
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
								</>
							)
						})()}
					</div>
				)}
			</div>

			{isLoading && progress && (
				<ProgressBar progress={progress} />
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
						<span className="text-sm font-medium text-zinc-200 truncate flex-1">
							{dataset.fileName}
						</span>
						<span className="shrink-0 rounded bg-zinc-700 px-1.5 py-0.5 text-[9px] font-mono font-medium text-zinc-400 uppercase">
							{dataset.format ?? "pbf"}
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

			{/* Reload Dialog */}
			<ReloadDialog
				isOpen={showReloadDialog}
				cachedDataset={cachedDataset}
				onClose={() => {
					setShowReloadDialog(false)
					setPendingSampleFile(null)
				}}
				onReload={() => {
					setShowReloadDialog(false)
					if (pendingSampleFile) {
						loadSample(pendingSampleFile)
					}
				}}
				onLoadNew={() => {
					setShowReloadDialog(false)
					setCachedDataset(null)
					// Don't load anything, let user choose
				}}
			/>
		</div>
	)
}
