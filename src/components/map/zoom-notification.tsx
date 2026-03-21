import { useEffect, useState } from "react"
import { useMap } from "react-map-gl/maplibre"
import { useOsmStore } from "../../stores/osm-store"
import { ZoomIn, Info } from "lucide-react"

export function ZoomNotification() {
	const dataset = useOsmStore((s) => s.dataset)
	const { current: mapInstance } = useMap()
	const [currentZoom, setCurrentZoom] = useState<number | null>(null)
	const [isVisible, setIsVisible] = useState(false)

	// Determine if we should show notification based on zoom level and file size
	const getRecommendedZoom = (nodes: number): number => {
		if (nodes > 10_000_000) return 12  // Country scale
		if (nodes > 2_000_000) return 11   // Large region
		if (nodes > 500_000) return 10     // Medium region
		return 8                           // Small area
	}

	const recommendedZoom = dataset ? getRecommendedZoom(dataset.info.stats.nodes) : 10
	const isLargeFile = dataset ? dataset.info.stats.nodes > 2_000_000 : false

	useEffect(() => {
		const map = mapInstance?.getMap()
		if (!map || !dataset) {
			setIsVisible(false)
			return
		}

		const checkZoom = () => {
			const zoom = map.getZoom()
			setCurrentZoom(zoom)
			// Show notification if zoom is less than recommended for the file size
			setIsVisible(zoom < recommendedZoom)
		}

		// Check initial zoom
		checkZoom()

		// Listen for zoom changes
		map.on("zoom", checkZoom)

		return () => {
			map.off("zoom", checkZoom)
		}
	}, [mapInstance, dataset, recommendedZoom])

	if (!isVisible || !dataset) return null

	return (
		<div
			style={{
				position: "absolute",
				top: "80px",
				left: "50%",
				transform: "translateX(-50%)",
				zIndex: 1000,
				backgroundColor: "rgba(15, 23, 42, 0.95)",
				border: "1px solid rgba(71, 85, 105, 0.5)",
				borderRadius: "8px",
				padding: "12px 16px",
				display: "flex",
				alignItems: "flex-start",
				gap: "10px",
				boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.3)",
				backdropFilter: "blur(4px)",
				maxWidth: "400px",
			}}
		>
			{isLargeFile ? (
				<Info size={20} style={{ color: "#60a5fa", marginTop: "2px" }} />
			) : (
				<ZoomIn size={20} style={{ color: "#60a5fa", marginTop: "2px" }} />
			)}
			<div>
				<div style={{ fontSize: "14px", fontWeight: 500, color: "#f1f5f9" }}>
					{isLargeFile ? "File besar terdeteksi" : "Zoom in untuk detail"}
				</div>
				<div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "4px", lineHeight: "1.5" }}>
					{isLargeFile ? (
						<>
							{dataset.fileName} ({(dataset.info.stats.nodes / 1_000_000).toFixed(1)}M nodes) 
							memerlukan zoom level {recommendedZoom}+ untuk menampilkan detail jalan.
							<br />
							<span style={{ color: "#60a5fa" }}>
								Zoom saat ini: {currentZoom?.toFixed(1)} / Target: {recommendedZoom}+
							</span>
							</>
						) : (
							<>Zoom ke level {recommendedZoom}+ untuk melihat detail jalan</>
						)}
				</div>
			</div>
		</div>
	)
}
