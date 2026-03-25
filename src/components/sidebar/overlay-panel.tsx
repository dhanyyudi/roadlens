import { useRef, useState, useCallback } from "react"
import { Upload, Layers, Eye, EyeOff, Trash2, X, MapPin, ChevronDown, ChevronUp } from "lucide-react"
import { useOverlayStore, nextOverlayColor, type OverlayFeature, type OverlayDataset } from "../../stores/overlay-store"

// ─── CSV parser ──────────────────────────────────────────────────────────────

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
	const lines = text.trim().split(/\r?\n/)
	if (lines.length < 2) throw new Error("CSV must have a header row and at least one data row")
	const headers = (lines[0] ?? "").split(",").map((h) => h.trim().replace(/^"|"$/g, ""))
	const rows = lines.slice(1).map((line) => {
		const vals = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""))
		const row: Record<string, string> = {}
		headers.forEach((h, i) => { row[h] = vals[i] ?? "" })
		return row
	})
	return { headers, rows }
}

function detectLatLon(headers: string[]): { latCol: string; lonCol: string } | null {
	const lower = headers.map((h) => h.toLowerCase())
	const latCandidates = ["lat", "latitude", "y", "lat_y"]
	const lonCandidates = ["lon", "lng", "longitude", "x", "lon_x", "long"]
	const latIdx = lower.findIndex((h) => latCandidates.includes(h))
	const lonIdx = lower.findIndex((h) => lonCandidates.includes(h))
	const latCol = latIdx >= 0 ? headers[latIdx] : undefined
	const lonCol = lonIdx >= 0 ? headers[lonIdx] : undefined
	if (!latCol || !lonCol) return null
	return { latCol: latCol as string, lonCol: lonCol as string }
}

function csvToFeatures(text: string): { points: OverlayFeature[]; geojson: null } {
	const { headers, rows } = parseCSV(text)
	const cols = detectLatLon(headers)
	if (!cols) throw new Error(`Could not detect lat/lon columns. Found: ${headers.join(", ")}.\nExpected columns named: lat, lon (or latitude/longitude/y/x).`)

	const features: OverlayFeature[] = []
	for (const [i, row] of rows.entries()) {
		const lat = parseFloat(row[cols.latCol] ?? '')
		const lon = parseFloat(row[cols.lonCol] ?? '')
		if (isNaN(lat) || isNaN(lon)) continue
		const props: Record<string, string | number | boolean | null> = {}
		for (const [k, v] of Object.entries(row)) {
			if (k === cols.latCol || k === cols.lonCol) continue
			const num = Number(v)
			props[k] = v === "" ? null : isNaN(num) ? v : num
		}
		features.push({ id: `f${i}`, lat, lon, properties: props })
	}
	if (features.length === 0) throw new Error("No valid lat/lon rows found in CSV")
	return { points: features, geojson: null }
}

// ─── GeoJSON parser ───────────────────────────────────────────────────────────

const POLYGON_TYPES = new Set(["Polygon", "MultiPolygon", "LineString", "MultiLineString"])

function geojsonToOverlay(text: string): { points: OverlayFeature[]; geojson: GeoJSON.FeatureCollection | null } {
	const gj = JSON.parse(text)
	const collection: GeoJSON.FeatureCollection =
		gj.type === "FeatureCollection" ? gj :
		gj.type === "Feature" ? { type: "FeatureCollection", features: [gj] } :
		(() => { throw new Error("Expected a GeoJSON FeatureCollection or Feature") })()

	const points: OverlayFeature[] = []
	const polyFeatures: GeoJSON.Feature[] = []

	for (const [i, f] of collection.features.entries()) {
		const geomType = f.geometry?.type
		if (!geomType) continue

		if (geomType === "Point") {
			const coords = (f.geometry as GeoJSON.Point).coordinates
			const lon = coords[0] ?? 0
			const lat = coords[1] ?? 0
			const props: Record<string, string | number | boolean | null> = {}
			for (const [k, v] of Object.entries(f.properties ?? {})) {
				props[k] = v as string | number | boolean | null
			}
			points.push({ id: `f${i}`, lat, lon, properties: props })
		} else if (POLYGON_TYPES.has(geomType)) {
			polyFeatures.push(f)
		}
	}

	if (points.length === 0 && polyFeatures.length === 0) {
		throw new Error("No Point or Polygon/LineString features found in GeoJSON")
	}

	const geojson: GeoJSON.FeatureCollection | null = polyFeatures.length > 0
		? { type: "FeatureCollection", features: polyFeatures }
		: null

	return { points, geojson }
}

/** Compute bounds from a GeoJSON FeatureCollection by traversing all coordinates */
function geojsonBounds(fc: GeoJSON.FeatureCollection): [[number, number], [number, number]] | null {
	let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity
	let found = false

	function visitCoords(coords: unknown) {
		if (!Array.isArray(coords)) return
		if (typeof coords[0] === "number" && typeof coords[1] === "number") {
			found = true
			const lon = coords[0] as number
			const lat = coords[1] as number
			if (lon < minLon) minLon = lon
			if (lon > maxLon) maxLon = lon
			if (lat < minLat) minLat = lat
			if (lat > maxLat) maxLat = lat
		} else {
			for (const c of coords) visitCoords(c)
		}
	}

	for (const f of fc.features) {
		if (f.geometry && "coordinates" in f.geometry) {
			visitCoords(f.geometry.coordinates)
		}
	}

	return found ? [[minLon, minLat], [maxLon, maxLat]] : null
}

// ─── Feature detail card ──────────────────────────────────────────────────────

function FeatureDetail({ datasetId }: { datasetId: string }) {
	const { datasets, selectedFeatureId, setSelectedFeatureId } = useOverlayStore()
	if (!selectedFeatureId) return null
	const [dsId, fId] = selectedFeatureId.split(":::")
	if (dsId !== datasetId) return null
	const ds = datasets.find((d) => d.id === datasetId)
	const feature = ds?.features.find((f) => f.id === fId)
	if (!feature) return null

	const entries = Object.entries(feature.properties).filter(([, v]) => v !== null && v !== "")

	return (
		<div className="rounded-lg border border-zinc-700 bg-zinc-800/60 p-3">
			<div className="mb-2 flex items-center justify-between">
				<div className="flex items-center gap-1.5">
					<MapPin className="h-3.5 w-3.5" style={{ color: ds?.color }} />
					<span className="text-xs font-medium text-zinc-200">Selected Point</span>
				</div>
				<button onClick={() => setSelectedFeatureId(null)} className="text-zinc-500 hover:text-zinc-300">
					<X className="h-3.5 w-3.5" />
				</button>
			</div>
			<div className="mb-1.5 font-mono text-[10px] text-zinc-500">
				{feature.lat.toFixed(6)}, {feature.lon.toFixed(6)}
			</div>
			{entries.length > 0 && (
				<div className="space-y-0.5">
					{entries.map(([k, v]) => (
						<div key={k} className="flex gap-2 text-[11px]">
							<span className="shrink-0 text-zinc-500 w-24 truncate" title={k}>{k}</span>
							<span className="text-zinc-300 truncate" title={String(v)}>{String(v)}</span>
						</div>
					))}
				</div>
			)}
		</div>
	)
}

// ─── Dataset card ─────────────────────────────────────────────────────────────

function DatasetCard({ ds }: { ds: OverlayDataset }) {
	const { toggleDatasetVisibility, removeDataset, selectedFeatureId } = useOverlayStore()
	const [expanded, setExpanded] = useState(false)

	const pointCount = ds.features.length
	const polyCount = ds.geojson?.features.length ?? 0
	const hasPoints = pointCount > 0
	const hasPolygons = polyCount > 0

	const zoomToDataset = () => {
		let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity
		let found = false

		// Points bounds
		for (const f of ds.features) {
			found = true
			minLat = Math.min(minLat, f.lat); maxLat = Math.max(maxLat, f.lat)
			minLon = Math.min(minLon, f.lon); maxLon = Math.max(maxLon, f.lon)
		}

		// Polygon bounds
		if (ds.geojson) {
			const b = geojsonBounds(ds.geojson)
			if (b) {
				found = true
				minLon = Math.min(minLon, b[0][0]); minLat = Math.min(minLat, b[0][1])
				maxLon = Math.max(maxLon, b[1][0]); maxLat = Math.max(maxLat, b[1][1])
			}
		}

		if (!found) return
		window.dispatchEvent(new CustomEvent("osmviz:fitbounds", {
			detail: { bounds: [[minLon, minLat], [maxLon, maxLat]], padding: 80 }
		}))
	}

	const activeFeature = selectedFeatureId?.startsWith(ds.id) ? selectedFeatureId : null

	// Build summary text
	const parts: string[] = []
	if (hasPoints) parts.push(`${pointCount.toLocaleString()} point${pointCount > 1 ? "s" : ""}`)
	if (hasPolygons) parts.push(`${polyCount.toLocaleString()} polygon${polyCount > 1 ? "s" : ""}`)
	const summary = `${parts.join(" + ")} · ${ds.format.toUpperCase()}`

	return (
		<div className="rounded-lg border border-zinc-700 bg-zinc-800/40 overflow-hidden">
			<div className="flex items-center gap-2 px-3 py-2">
				{/* color swatch */}
				{hasPolygons && !hasPoints ? (
					<div className="h-3 w-3 shrink-0 rounded border border-white/20" style={{ backgroundColor: ds.color + "33", borderColor: ds.color }} />
				) : (
					<div className="h-3 w-3 shrink-0 rounded-full border border-white/20" style={{ backgroundColor: ds.color }} />
				)}
				<button onClick={zoomToDataset} className="flex-1 min-w-0 text-left" title="Zoom to dataset">
					<div className="text-xs font-medium text-zinc-200 truncate">{ds.fileName}</div>
					<div className="text-[10px] text-zinc-500">{summary}</div>
				</button>
				{hasPoints && (
					<button
						onClick={() => setExpanded(!expanded)}
						className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
						title="Show points list"
					>
						{expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
					</button>
				)}
				<button
					onClick={() => toggleDatasetVisibility(ds.id)}
					className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
					title={ds.visible ? "Hide" : "Show"}
				>
					{ds.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
				</button>
				<button
					onClick={() => removeDataset(ds.id)}
					className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
					title="Remove dataset"
				>
					<Trash2 className="h-3.5 w-3.5" />
				</button>
			</div>

			{/* Selected feature detail */}
			{activeFeature && (
				<div className="px-3 pb-2">
					<FeatureDetail datasetId={ds.id} />
				</div>
			)}

			{/* Expanded point list (max 50) */}
			{expanded && hasPoints && (
				<div className="border-t border-zinc-700 max-h-40 overflow-y-auto">
					{ds.features.slice(0, 50).map((f) => {
						const label = Object.values(f.properties).find((v) => typeof v === "string" && v) as string | undefined
						return (
							<div key={f.id} className="flex items-center gap-2 px-3 py-1 text-[10px] text-zinc-400 hover:bg-zinc-700/40 cursor-pointer"
								onClick={() => {
									window.dispatchEvent(new CustomEvent("osmviz:flyto", {
										detail: { lon: f.lon, lat: f.lat, zoom: 15 }
									}))
									useOverlayStore.getState().setSelectedFeatureId(`${ds.id}:::${f.id}`)
								}}
							>
								<div className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: ds.color }} />
								<span className="font-mono">{f.lat.toFixed(5)}, {f.lon.toFixed(5)}</span>
								{label && <span className="text-zinc-500 truncate">· {label}</span>}
							</div>
						)
					})}
					{ds.features.length > 50 && (
						<div className="px-3 py-1.5 text-[10px] text-zinc-600">
							+{(ds.features.length - 50).toLocaleString()} more points
						</div>
					)}
				</div>
			)}
		</div>
	)
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function OverlayPanel() {
	const { datasets, clearAll, addDataset } = useOverlayStore()
	const fileInputRef = useRef<HTMLInputElement>(null)
	const [error, setError] = useState<string | null>(null)
	const [loading, setLoading] = useState(false)

	const handleFile = useCallback(async (file: File) => {
		setError(null)
		setLoading(true)
		try {
			const text = await file.text()
			const ext = file.name.split(".").pop()?.toLowerCase()

			let points: OverlayFeature[]
			let geojson: GeoJSON.FeatureCollection | null = null
			let format: "csv" | "geojson"

			if (ext === "csv") {
				const result = csvToFeatures(text)
				points = result.points
				format = "csv"
			} else if (ext === "geojson" || ext === "json") {
				const result = geojsonToOverlay(text)
				points = result.points
				geojson = result.geojson
				format = "geojson"
			} else {
				throw new Error("Unsupported format. Upload a .csv or .geojson file.")
			}

			const id = `overlay_${Date.now()}`
			const color = nextOverlayColor(datasets.length)
			const ds: OverlayDataset = {
				id, fileName: file.name, format, features: points, geojson, color, visible: true,
			}
			addDataset(ds)

			// Auto-zoom
			let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity
			let found = false

			for (const f of points) {
				found = true
				minLat = Math.min(minLat, f.lat); maxLat = Math.max(maxLat, f.lat)
				minLon = Math.min(minLon, f.lon); maxLon = Math.max(maxLon, f.lon)
			}

			if (geojson) {
				const b = geojsonBounds(geojson)
				if (b) {
					found = true
					minLon = Math.min(minLon, b[0][0]); minLat = Math.min(minLat, b[0][1])
					maxLon = Math.max(maxLon, b[1][0]); maxLat = Math.max(maxLat, b[1][1])
				}
			}

			if (found) {
				window.dispatchEvent(new CustomEvent("osmviz:fitbounds", {
					detail: { bounds: [[minLon, minLat], [maxLon, maxLat]], padding: 80 }
				}))
			}
		} catch (e: any) {
			setError(e.message ?? "Failed to parse file")
		} finally {
			setLoading(false)
		}
	}, [datasets.length, addDataset])

	const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0]
		if (file) handleFile(file)
		e.target.value = ""
	}

	const onDrop = (e: React.DragEvent) => {
		e.preventDefault()
		const file = e.dataTransfer.files[0]
		if (file) handleFile(file)
	}

	return (
		<div className="flex flex-col gap-4 p-4">
			<div className="flex items-center justify-between">
				<h2 className="text-sm font-semibold text-zinc-300">Overlay Data</h2>
				{datasets.length > 0 && (
					<button onClick={clearAll} className="text-[10px] text-zinc-500 hover:text-red-400 transition-colors">
						Clear all
					</button>
				)}
			</div>

			<p className="text-[10px] text-zinc-500 -mt-2">
				Upload waypoints or polygons to overlay on the road map. Click a point to inspect its attributes.
			</p>

			{/* Drop zone */}
			<div
				onDrop={onDrop}
				onDragOver={(e) => e.preventDefault()}
				onClick={() => fileInputRef.current?.click()}
				className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-zinc-700 bg-zinc-800/30 p-6 transition-colors hover:border-zinc-500 hover:bg-zinc-800/50"
			>
				<Upload className="h-5 w-5 text-zinc-500" />
				{loading ? (
					<span className="text-xs text-zinc-400">Parsing…</span>
				) : (
					<>
						<span className="text-xs font-medium text-zinc-400">Drop file or click to browse</span>
						<span className="text-[10px] text-zinc-600">Supported: .csv, .geojson</span>
					</>
				)}
				<input
					ref={fileInputRef}
					type="file"
					accept=".csv,.geojson,.json"
					className="hidden"
					onChange={onInputChange}
				/>
			</div>

			{/* Format hints */}
			<div className="rounded-md bg-zinc-800/40 p-2.5 text-[10px] text-zinc-500">
				<span className="font-medium text-zinc-400">CSV format:</span> must have{" "}
				<code className="rounded bg-zinc-700/60 px-1 text-zinc-300">lat</code> and{" "}
				<code className="rounded bg-zinc-700/60 px-1 text-zinc-300">lon</code>{" "}
				columns (also accepts <code className="rounded bg-zinc-700/60 px-1 text-zinc-300">latitude/longitude</code>).
				All other columns are shown as attributes.
				<br />
				<span className="font-medium text-zinc-400">GeoJSON:</span> supports Point, Polygon, MultiPolygon, LineString, MultiLineString.
			</div>

			{error && (
				<div className="rounded-md bg-red-900/30 border border-red-500/30 p-2.5 text-[11px] text-red-300">
					{error}
				</div>
			)}

			{/* Dataset list */}
			{datasets.length > 0 && (
				<div className="flex flex-col gap-2">
					<div className="flex items-center gap-1.5">
						<Layers className="h-3.5 w-3.5 text-zinc-500" />
						<span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
							{datasets.length} overlay{datasets.length > 1 ? "s" : ""}
						</span>
					</div>
					{datasets.map((ds) => (
						<DatasetCard key={ds.id} ds={ds} />
					))}
				</div>
			)}

			{datasets.length === 0 && (
				<div className="text-center text-[11px] text-zinc-600 py-2">
					No overlays loaded yet
				</div>
			)}
		</div>
	)
}
