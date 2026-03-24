import { useCallback, useState } from "react"
import { useOsmStore } from "../../stores/osm-store"
import { useOsm } from "../../hooks/use-osm"
import { Download, FileText, Route, Loader2, Check } from "lucide-react"

type ExportState = "idle" | "exporting" | "done" | "error"

function triggerDownload(data: Uint8Array, filename: string) {
	const blob = new Blob([data.buffer as ArrayBuffer], { type: "application/octet-stream" })
	const url = URL.createObjectURL(blob)
	const a = document.createElement("a")
	a.href = url
	a.download = filename
	a.click()
	URL.revokeObjectURL(url)
}

export function ExportPanel() {
	const { remote } = useOsm()
	const dataset = useOsmStore((s) => s.dataset)
	const [fullState, setFullState] = useState<ExportState>("idle")
	const [roadsState, setRoadsState] = useState<ExportState>("idle")
	const [roadsFileSizeMb, setRoadsFileSizeMb] = useState<number | null>(null)

	const exportPbf = useCallback(async () => {
		if (!remote || !dataset) return
		setFullState("exporting")
		try {
			const data = await remote.toPbfData(dataset.osmId)
			const baseName = dataset.fileName.replace(/\.(?:osm\.)?pbf$/, "").replace(/\.osm$/, "")
			triggerDownload(new Uint8Array(data), `${baseName}-modified.osm.pbf`)
			setFullState("done")
			setTimeout(() => setFullState("idle"), 2500)
		} catch (err) {
			console.error("Export failed:", err)
			setFullState("error")
			setTimeout(() => setFullState("idle"), 3000)
		}
	}, [remote, dataset])

	const exportRoadsPbf = useCallback(async () => {
		if (!remote || !dataset) return
		setRoadsState("exporting")
		setRoadsFileSizeMb(null)
		try {
			const data = await (remote as any).exportRoadsPbf(dataset.osmId) as Uint8Array
			if (!data || data.byteLength === 0) {
				throw new Error("No highway ways found in this dataset")
			}
			const baseName = dataset.fileName.replace(/\.(?:osm\.)?pbf$/, "").replace(/\.osm$/, "")
			triggerDownload(data, `${baseName}-roads-only.osm.pbf`)
			setRoadsFileSizeMb(Math.round(data.byteLength / 1024 / 1024 * 10) / 10)
			setRoadsState("done")
			setTimeout(() => { setRoadsState("idle"); setRoadsFileSizeMb(null) }, 3000)
		} catch (err) {
			console.error("Roads export failed:", err)
			setRoadsState("error")
			setTimeout(() => setRoadsState("idle"), 3000)
		}
	}, [remote, dataset])

	if (!dataset) {
		return (
			<div className="flex flex-col items-center justify-center gap-2 p-8 text-zinc-500">
				<FileText className="h-8 w-8" />
				<span className="text-sm">Load a file first</span>
			</div>
		)
	}

	const isPbfSource = !dataset.format || dataset.format === "pbf" || dataset.format === "osm"

	return (
		<div className="flex flex-col gap-4 p-4">
			<h2 className="text-sm font-semibold text-zinc-300">Export</h2>

			{/* Full dataset export */}
			<div className="rounded-lg bg-zinc-800/50 p-3 space-y-2">
				<div className="flex items-center gap-2">
					<FileText className="h-4 w-4 text-zinc-400" />
					<span className="text-xs font-medium text-zinc-300">Full Dataset</span>
				</div>
				<p className="text-[10px] text-zinc-500">
					Export all loaded data as-is, including any tag edits.
				</p>
				<button
					onClick={exportPbf}
					disabled={fullState === "exporting"}
					className="flex w-full items-center justify-center gap-2 rounded bg-blue-600/80 px-3 py-2 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
				>
					{fullState === "exporting" ? (
						<><Loader2 className="h-3.5 w-3.5 animate-spin" /> Exporting...</>
					) : fullState === "done" ? (
						<><Check className="h-3.5 w-3.5" /> Downloaded!</>
					) : fullState === "error" ? (
						"Export failed"
					) : (
						<><Download className="h-3.5 w-3.5" /> Download .osm.pbf</>
					)}
				</button>
			</div>

			{/* Roads-only export — only for OSM-native formats */}
			{isPbfSource ? (
				<div className="rounded-lg bg-zinc-800/50 p-3 space-y-2">
					<div className="flex items-center gap-2">
						<Route className="h-4 w-4 text-green-400" />
						<span className="text-xs font-medium text-zinc-300">Roads Only</span>
						<span className="ml-auto rounded bg-green-500/20 px-1.5 py-0.5 text-[9px] font-medium text-green-400 font-mono">
							highway=*
						</span>
					</div>
					<p className="text-[10px] text-zinc-500">
						Export a filtered PBF with only <span className="text-zinc-400">highway=*</span> ways and their referenced nodes — useful for reducing file size or routing tools.
					</p>
					<div className="rounded bg-zinc-700/40 px-2.5 py-2 text-[10px] text-zinc-400 space-y-1">
						<div className="flex justify-between">
							<span>Source</span>
							<span className="font-mono text-zinc-300 truncate max-w-35">{dataset.fileName}</span>
						</div>
						<div className="flex justify-between">
							<span>Total ways</span>
							<span className="font-mono text-zinc-300">{dataset.info.stats.ways.toLocaleString()}</span>
						</div>
						<div className="flex justify-between">
							<span>Total nodes</span>
							<span className="font-mono text-zinc-300">{dataset.info.stats.nodes.toLocaleString()}</span>
						</div>
					</div>
					<button
						onClick={exportRoadsPbf}
						disabled={roadsState === "exporting"}
						className="flex w-full items-center justify-center gap-2 rounded bg-green-700/80 px-3 py-2 text-xs font-medium text-white hover:bg-green-600 disabled:opacity-50 transition-colors"
					>
						{roadsState === "exporting" ? (
							<><Loader2 className="h-3.5 w-3.5 animate-spin" /> Filtering & exporting...</>
						) : roadsState === "done" ? (
							<><Check className="h-3.5 w-3.5" /> Downloaded!{roadsFileSizeMb !== null && ` (${roadsFileSizeMb} MB)`}</>
						) : roadsState === "error" ? (
							"Failed — no highway ways found"
						) : (
							<><Download className="h-3.5 w-3.5" /> Download roads-only .osm.pbf</>
						)}
					</button>
				</div>
			) : (
				<p className="text-[10px] text-zinc-600 text-center px-2">
					Roads-only export is available for .pbf and .osm datasets.
				</p>
			)}
		</div>
	)
}
