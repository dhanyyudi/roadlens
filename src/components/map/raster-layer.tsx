import { useEffect, useRef, useMemo } from "react"
import { useMap } from "react-map-gl/maplibre"
import { osmixIdToRasterTileUrl } from "../../lib/osmix-raster-protocol"
import { RASTER_OPACITY, FILE_SIZE_THRESHOLDS } from "../../constants"
import { useOsmStore } from "../../stores/osm-store"
import { useUIStore } from "../../stores/ui-store"

interface RasterLayerProps {
	osmId: string
}

/** Layer IDs for cleanup */
function allRasterLayerIds(osmId: string) {
	return [`osmviz:${osmId}:raster`]
}

/**
 * Raster preview layer for low-zoom overview.
 * Shows a rasterized image of OSM data for zoom levels where vector tiles
 * would be too heavy to generate (large area coverage).
 * 
 * Dynamic threshold:
 * - File < 500K nodes: No raster needed (full vector)
 * - File 500K-2M nodes: Raster 0-8, vector 8+
 * - File > 2M nodes: Raster 0-10, vector 10+
 */
export function RasterLayer({ osmId }: RasterLayerProps) {
	const roadsVisible = useUIStore((s) => s.layers.roads)
	const dataset = useOsmStore((s) => s.dataset)
	const { current: mapInstance } = useMap()

	const sourceId = `osmviz:${osmId}:raster-source`
	const bounds = dataset?.info.bbox as [number, number, number, number] | undefined

	// Calculate max zoom for raster based on file size
	const nodeCount = dataset?.info.stats.nodes ?? 0
	const rasterMaxZoom = useMemo(() => {
		if (nodeCount <= FILE_SIZE_THRESHOLDS.FULL_VECTOR) return 0  // No raster needed
		if (nodeCount <= FILE_SIZE_THRESHOLDS.HYBRID) return 8
		if (nodeCount <= FILE_SIZE_THRESHOLDS.COUNTRY) return 11  // 2M-10M: covers up to vectorMinZoom 10
		return 13  // > 10M: covers up to vectorMinZoom 12
	}, [nodeCount])

	const createdRef = useRef(false)

	// Skip raster for small files
	if (rasterMaxZoom === 0) return null

	// ── STRUCTURAL EFFECT: create raster source + layer ──
	useEffect(() => {
		const map = mapInstance?.getMap()
		if (!map) return

		const create = () => {
			// Clean up any existing
			for (const id of allRasterLayerIds(osmId)) {
				try { if (map.getLayer(id)) map.removeLayer(id) } catch { /* */ }
			}
			try { if (map.getSource(sourceId)) map.removeSource(sourceId) } catch { /* */ }

			// Add raster source - only generate tiles for zoom 0-8
			map.addSource(sourceId, {
				type: "raster",
				tiles: [osmixIdToRasterTileUrl(osmId)],
				bounds,
				minzoom: 0,
				maxzoom: rasterMaxZoom,  // Dynamic based on file size
				tileSize: 256,
			})

			// Add raster layer at the bottom of all OSM layers
			// This ensures vector layers will render on top when they appear
			map.addLayer({
				id: `osmviz:${osmId}:raster`,
				type: "raster",
				source: sourceId,
				minzoom: 0,
				maxzoom: rasterMaxZoom, // Dynamic based on file size
				paint: {
					"raster-opacity": roadsVisible ? RASTER_OPACITY : 0,
					"raster-fade-duration": 200,
				},
			})

			createdRef.current = true
		}

		// Create now if style is loaded, or wait for it
		if (map.isStyleLoaded()) {
			create()
		} else {
			map.once("style.load", create)
		}

		// Re-create after basemap switch
		const onStyleLoad = () => {
			createdRef.current = false
			create()
		}
		map.on("style.load", onStyleLoad)

		return () => {
			map.off("style.load", onStyleLoad)
			// Remove on unmount
			for (const id of allRasterLayerIds(osmId)) {
				try { if (map.getLayer(id)) map.removeLayer(id) } catch { /* */ }
			}
			try { if (map.getSource(sourceId)) map.removeSource(sourceId) } catch { /* */ }
			createdRef.current = false
		}
	}, [mapInstance, osmId, sourceId, bounds, rasterMaxZoom])

	// ── REACTIVE EFFECT: update visibility ──
	useEffect(() => {
		const map = mapInstance?.getMap()
		if (!map || !createdRef.current) return

		try {
			if (map.getLayer(`osmviz:${osmId}:raster`)) {
				map.setPaintProperty(
					`osmviz:${osmId}:raster`,
					"raster-opacity",
					roadsVisible ? RASTER_OPACITY : 0
				)
			}
		} catch { /* layer may not exist yet */ }
	}, [mapInstance, osmId, roadsVisible])

	// Component renders nothing — all rendering is via native MapLibre API
	return null
}
