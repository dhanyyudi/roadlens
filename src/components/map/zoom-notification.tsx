import { useEffect, useState } from "react"
import { useMap } from "react-map-gl/maplibre"
import { useOsmStore } from "../../stores/osm-store"
import { VECTOR_MIN_ZOOM } from "../../constants"
import { ZoomIn } from "lucide-react"

export function ZoomNotification() {
	const dataset = useOsmStore((s) => s.dataset)
	const { current: mapInstance } = useMap()
	const [currentZoom, setCurrentZoom] = useState<number | null>(null)
	const [isVisible, setIsVisible] = useState(false)

	useEffect(() => {
		const map = mapInstance?.getMap()
		if (!map || !dataset) {
			setIsVisible(false)
			return
		}

		const checkZoom = () => {
			const zoom = map.getZoom()
			setCurrentZoom(zoom)
			// Show notification if zoom < VECTOR_MIN_ZOOM and dataset exists
			setIsVisible(zoom < VECTOR_MIN_ZOOM)
		}

		// Check initial zoom
		checkZoom()

		// Listen for zoom changes
		map.on("zoom", checkZoom)

		return () => {
			map.off("zoom", checkZoom)
		}
	}, [mapInstance, dataset])

	if (!isVisible || !dataset) return null

	return (
		<div
			style={{
				position: "absolute",
				top: "80px",
				left: "50%",
				transform: "translateX(-50%)",
				zIndex: 1000,
				backgroundColor: "rgba(30, 41, 59, 0.95)",
				border: "1px solid rgba(71, 85, 105, 0.5)",
				borderRadius: "8px",
				padding: "12px 16px",
				display: "flex",
				alignItems: "center",
				gap: "10px",
				boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.3)",
				backdropFilter: "blur(4px)",
			}}
		>
			<ZoomIn size={18} style={{ color: "#60a5fa" }} />
			<div>
				<div style={{ fontSize: "14px", fontWeight: 500, color: "#f1f5f9" }}>
					Zoom in untuk melihat data
				</div>
				<div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>
					Data {dataset.fileName} ({(dataset.info.stats.nodes / 1_000_000).toFixed(1)}M nodes) ter-load. 
					Zoom ke level {VECTOR_MIN_ZOOM}+ untuk visualisasi.
				</div>
				{currentZoom !== null && (
					<div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
						Zoom saat ini: {currentZoom.toFixed(1)} / Target: {VECTOR_MIN_ZOOM}
					</div>
				)}
			</div>
		</div>
	)
}
