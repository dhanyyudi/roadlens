import { useCallback, useState } from "react"
import { FileDropZone } from "../shared/file-drop-zone"
import { ProgressBar } from "../shared/progress-bar"
import { useOsmStore } from "../../stores/osm-store"
import { useUIStore } from "../../stores/ui-store"
import { useOsm } from "../../hooks/use-osm"
import { FileText, MapPin, Route, GitBranch, MapPinned, Download, ExternalLink, Globe, Loader2 } from "lucide-react"

// Sample data - Denpasar only (using GeoJSON for now, PBF coming soon)
const SAMPLE_FILE = {
	name: "Denpasar Center, Bali",
	url: "/samples/denpasar_center.geojson",
	description: "Central Denpasar roads (~1.7 MB)",
	format: "geojson" as const,
}

// Overpass API endpoint
const OVERPASS_API = "https://overpass-api.de/api/interpreter"

export function FilePanel() {
	const { remote } = useOsm()
	const { dataset, isLoading, progress, error } = useOsmStore()
	const setActiveTab = useUIStore((s) => s.setActiveTab)
	
	// Overpass download state
	const [showOverpassForm, setShowOverpassForm] = useState(false)
	const [bboxInput, setBboxInput] = useState("")
	const [overpassLoading, setOverpassLoading] = useState(false)

	const handleFile = useCallback(
		async (file: File) => {
			if (!remote) return
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
		const store = useOsmStore.getState()
		store.setLoading(true)
		store.setError(null)
		try {
			const response = await fetch(SAMPLE_FILE.url)
			if (!response.ok) {
				throw new Error(`Failed to download: ${response.statusText}`)
			}
			const blob = await response.blob()
			
			if (SAMPLE_FILE.format === "geojson") {
				const file = new File([blob], "denpasar_center.geojson", {
					type: "application/geo+json",
				})
				const result = await remote.fromGeoJSON(file, { id: file.name })
				store.setDataset({
					osmId: result.id,
					info: result,
					fileName: file.name,
				})
			} else {
				const file = new File([blob], "denpasar_sample.osm.pbf", {
					type: "application/octet-stream",
				})
				const result = await remote.fromPbf(file, { id: file.name })
				store.setDataset({
					osmId: result.id,
					info: result,
					fileName: file.name,
				})
			}
			store.setLoading(false)
			store.setProgress(null)
			setActiveTab("inspect")
		} catch (err) {
			store.setError(String(err))
		}
	}, [remote, setActiveTab])

	const downloadFromOverpass = useCallback(async () => {
		if (!remote || !bboxInput.trim()) return
		
		setOverpassLoading(true)
		const store = useOsmStore.getState()
		store.setLoading(true)
		store.setError(null)
		try {
			// Parse bbox: minLon,minLat,maxLon,maxLat
			const bbox = bboxInput.trim().split(",").map(Number)
			if (bbox.length !== 4 || bbox.some(isNaN)) {
				throw new Error("Invalid bbox format. Use: minLon,minLat,maxLon,maxLat")
			}
			const [minLon, minLat, maxLon, maxLat] = bbox
			
			// Build Overpass QL query - roads only for efficiency
			const query = `[bbox:${minLat},${minLon},${maxLat},${maxLon}];
(
  way["highway"];
  node(w);
);
out meta;`
			
			// Fetch from Overpass API
			const response = await fetch(OVERPASS_API, {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: `data=${encodeURIComponent(query)}`,
			})
			
			if (!response.ok) {
				throw new Error(`Overpass API error: ${response.statusText}`)
			}
			
			const osmXml = await response.text()
			
			// Note: osmix doesn't support OSM XML directly, user needs to convert
			store.setError("Downloaded OSM XML. Convert to PBF using: osmium cat file.osm -o output.pbf")
			
			// Auto-download the file for user
			const blob = new Blob([osmXml], { type: "application/xml" })
			const url = URL.createObjectURL(blob)
			const a = document.createElement("a")
			a.href = url
			a.download = `roads_${minLon}_${minLat}.osm`
			a.click()
			URL.revokeObjectURL(url)
			
		} catch (err) {
			store.setError(String(err))
		} finally {
			setOverpassLoading(false)
			store.setLoading(false)
		}
	}, [remote, bboxInput])

	return (
		<div className="flex flex-col gap-4 p-4">
			<h2 className="text-sm font-semibold text-zinc-300">Load OSM PBF</h2>

			<FileDropZone
				accept=".pbf,.osm.pbf"
				label="Drop .pbf file here or click to browse"
				onFile={handleFile}
				disabled={isLoading || !remote}
			/>

			{/* Sample Data Section */}
			<div className="rounded-lg bg-zinc-800/50 p-3">
				<div className="mb-2 flex items-center gap-2">
					<MapPinned className="h-4 w-4 text-blue-400" />
					<span className="text-xs font-medium text-zinc-300">Try Sample Data</span>
				</div>
				<button
					onClick={loadSample}
					disabled={isLoading || !remote}
					className="flex w-full items-center justify-between rounded-md bg-zinc-700/50 px-3 py-2 text-left text-xs transition-colors hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					<div>
						<div className="font-medium text-zinc-200">{SAMPLE_FILE.name}</div>
						<div className="text-zinc-500">{SAMPLE_FILE.description}</div>
					</div>
					<Download className="h-3.5 w-3.5 text-zinc-400" />
				</button>
			</div>

			{/* Download from OSM Section */}
			<div className="rounded-lg bg-zinc-800/50 p-3">
				<div className="mb-2 flex items-center gap-2">
					<Globe className="h-4 w-4 text-green-400" />
					<span className="text-xs font-medium text-zinc-300">Download from OSM</span>
				</div>
				<p className="mb-2 text-[10px] text-zinc-500">
					Download road data directly via Overpass API
				</p>
				
				{!showOverpassForm ? (
					<button
						onClick={() => setShowOverpassForm(true)}
						disabled={isLoading || !remote}
						className="w-full rounded-md bg-green-600/20 px-3 py-2 text-xs font-medium text-green-400 transition-colors hover:bg-green-600/30 disabled:opacity-50"
					>
						Define Area of Interest
					</button>
				) : (
					<div className="space-y-2">
						<div>
							<label className="mb-1 block text-[10px] text-zinc-400">
								Bounding Box (lon,lat,lon,lat)
							</label>
							<input
								type="text"
								value={bboxInput}
								onChange={(e) => setBboxInput(e.target.value)}
								placeholder="115.20,-8.70,115.25,-8.65"
								className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:border-blue-500 focus:outline-none"
							/>
						</div>
						<div className="flex gap-2">
							<button
								onClick={downloadFromOverpass}
								disabled={overpassLoading || !bboxInput.trim()}
								className="flex-1 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-500 disabled:opacity-50"
							>
								{overpassLoading ? (
									<span className="flex items-center justify-center gap-1">
										<Loader2 className="h-3 w-3 animate-spin" />
										Downloading...
									</span>
								) : (
									"Download Roads"
								)}
							</button>
							<button
								onClick={() => setShowOverpassForm(false)}
								className="rounded-md bg-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-600"
							>
								Cancel
							</button>
						</div>
						<p className="text-[9px] text-zinc-500">
							Tip: Get bbox from{" "}
							<a
								href="http://bboxfinder.com/"
								target="_blank"
								rel="noopener noreferrer"
								className="text-blue-400 hover:underline"
							>
								bboxfinder.com
							</a>
						</p>
					</div>
				)}
			</div>

			{/* Help Section */}
			{!dataset && !isLoading && (
				<div className="rounded-lg bg-zinc-800/30 p-3 text-xs text-zinc-500">
					<p className="mb-2">
						<strong className="text-zinc-400">Need more data?</strong>
					</p>
					<ul className="list-disc space-y-1 pl-4">
						<li>
							Download from{" "}
							<a
								href="https://download.geofabrik.de/"
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-0.5 text-blue-400 hover:underline"
							>
								Geofabrik
								<ExternalLink className="h-3 w-3" />
							</a>
							{" "}(country extracts)
						</li>
						<li>
							Custom extract from{" "}
							<a
								href="https://extract.bbbike.org/"
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-0.5 text-blue-400 hover:underline"
							>
								BBBike
								<ExternalLink className="h-3 w-3" />
							</a>
						</li>
						<li>
							Or use{" "}
							<a
								href="http://bboxfinder.com/"
								target="_blank"
								rel="noopener noreferrer"
								className="text-blue-400 hover:underline"
							>
								bboxfinder.com
							</a>
							{" "}+ Download from OSM above
						</li>
					</ul>
				</div>
			)}

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
