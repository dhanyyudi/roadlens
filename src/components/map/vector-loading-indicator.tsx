import { useEffect, useState, useRef } from "react"
import { useMap } from "react-map-gl/maplibre"
import { useOsmStore } from "../../stores/osm-store"
import { FILE_SIZE_THRESHOLDS } from "../../constants"
import { Loader2 } from "lucide-react"

/**
 * Loading indicator for vector tiles.
 * Shows when user is zoomed in to vector range but tiles are still loading.
 */
export function VectorLoadingIndicator() {
	const dataset = useOsmStore((s) => s.dataset)
	const { current: mapInstance } = useMap()
	const [isLoading, setIsLoading] = useState(false)
	const [tileCount, setTileCount] = useState(0)
	const loadingStartTime = useRef<number | null>(null)

	// Calculate vector min zoom based on file size
	const vectorMinZoom = (() => {
		if (!dataset) return 0
		const nodes = dataset.info.stats.nodes
		if (nodes <= FILE_SIZE_THRESHOLDS.FULL_VECTOR) return 0
		if (nodes <= FILE_SIZE_THRESHOLDS.HYBRID) return 8
		return 10
	})()

	useEffect(() => {
		const map = mapInstance?.getMap()
		if (!map || !dataset || vectorMinZoom === 0) {
			setIsLoading(false)
			return
		}

		let tilesLoading = new Set<string>()
		let tilesLoaded = new Set<string>()
		let checkTimeout: ReturnType<typeof setTimeout> | null = null

		const checkLoadingState = () => {
			const zoom = map.getZoom()
			const inVectorRange = zoom >= vectorMinZoom

			if (!inVectorRange) {
				setIsLoading(false)
				loadingStartTime.current = null
				return
			}

			// Check if we have any pending tiles
			const sourceId = `osmviz:${dataset.osmId}:source`
			const source = map.getSource(sourceId) as maplibregl.VectorTileSource | undefined

			if (source) {
				// MapLibre doesn't expose loading state directly
				// We infer from sourcedata events
				const stillLoading = tilesLoading.size > tilesLoaded.size
				setIsLoading(stillLoading)
				if (stillLoading && !loadingStartTime.current) {
					loadingStartTime.current = performance.now()
				} else if (!stillLoading) {
					loadingStartTime.current = null
				}
				setTileCount(tilesLoaded.size)
			}
		}

		const onSourceData = (e: maplibregl.MapSourceDataEvent) => {
			if (e.sourceId !== `osmviz:${dataset.osmId}:source`) return

			if (e.tile) {
				const tileKey = `${e.tile.x}/${e.tile.y}/${e.tile.z}`
				if (e.dataType === 'tile') {
					tilesLoading.add(tileKey)
				}
			}

			// Debounce check
			if (checkTimeout) clearTimeout(checkTimeout)
			checkTimeout = setTimeout(checkLoadingState, 100)
		}

		const onZoom = () => {
			// Clear state on zoom change
			tilesLoading.clear()
			tilesLoaded.clear()
			checkLoadingState()
		}

		map.on("sourcedata", onSourceData)
		map.on("zoom", onZoom)
		checkLoadingState()

		return () => {
			map.off("sourcedata", onSourceData)
			map.off("zoom", onZoom)
			if (checkTimeout) clearTimeout(checkTimeout)
		}
	}, [mapInstance, dataset, vectorMinZoom])

	if (!isLoading || !dataset) return null

	const nodeCount = dataset.info.stats.nodes
	const isLargeFile = nodeCount > FILE_SIZE_THRESHOLDS.RASTER_REQUIRED

	return (
		<div
			style={{
				position: "absolute",
				bottom: "100px",
				left: "50%",
				transform: "translateX(-50%)",
				zIndex: 1000,
				backgroundColor: "rgba(15, 23, 42, 0.95)",
				border: "1px solid rgba(71, 85, 105, 0.5)",
				borderRadius: "8px",
				padding: "10px 16px",
				display: "flex",
				alignItems: "center",
				gap: "10px",
				boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.3)",
				backdropFilter: "blur(4px)",
			}}
		>
			<Loader2 size={16} style={{ color: "#60a5fa", animation: "spin 1s linear infinite" }} />
			<div>
				<div style={{ fontSize: "13px", fontWeight: 500, color: "#f1f5f9" }}>
					{isLargeFile ? "Memuat vector tiles..." : "Loading tiles..."}
				</div>
				{isLargeFile && (
					<div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>
						File besar membutuhkan waktu lebih lama untuk generate tiles
					</div>
				)}
			</div>
		</div>
	)
}
