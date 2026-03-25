import { useCallback, useEffect, useMemo, useRef } from "react"
import Map, { type MapRef } from "react-map-gl/maplibre"
import { Popup } from "maplibre-gl"
import { decodeZigzag } from "@osmix/shared/zigzag"
import { DEFAULT_ZOOM, BASEMAP_OPTIONS } from "../../constants"
import { useOsmStore } from "../../stores/osm-store"
import { useUIStore } from "../../stores/ui-store"
import { useRoutingStore } from "../../stores/routing-store"
import { useOsm } from "../../hooks/use-osm"
import { RoadLayer } from "./road-layer"
import { RestrictionLayer } from "./restriction-layer"
import { AccessLayer } from "./access-layer"
import { SpeedLayer } from "./speed-layer"
import { RouteLayer } from "./route-layer"
import { SearchHighlightLayer } from "./search-highlight-layer"
import { GeocodingOverlay } from "./geocoding-overlay"
import { BasemapSwitcher } from "./basemap-switcher"
import { MapLegend } from "./map-legend"
import { BBoxDrawLayer } from "./bbox-draw-layer"
import { CursorCoordinates } from "./cursor-coordinates"
import { ZoomNotification } from "./zoom-notification"
import { VectorLoadingIndicator } from "./vector-loading-indicator"
import { MemoryMonitor } from "./memory-monitor"
import { VectorTilesProgress } from "./vector-tiles-progress"
import { MobileControls } from "./mobile-controls"
import { OverlayLayer } from "./overlay-layer"
// Protocol imports ensure they're registered at module load time
import "../../lib/osmix-vector-protocol"
import "../../lib/osmix-raster-protocol"

const SNAP_RADIUS_M = 200  // Reduced for more precise snapping

/** Minimal style spec for OSM raster tiles */
const OSM_RASTER_STYLE: maplibregl.StyleSpecification = {
	version: 8,
	sources: {
		"osm-raster": {
			type: "raster",
			tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
			tileSize: 256,
			attribution: "&copy; OpenStreetMap contributors",
		},
	},
	layers: [
		{
			id: "osm-raster-layer",
			type: "raster",
			source: "osm-raster",
		},
	],
}

/** Empty style for no basemap */
const EMPTY_STYLE: maplibregl.StyleSpecification = {
	version: 8,
	sources: {},
	layers: [
		{
			id: "background",
			type: "background",
			paint: { "background-color": "#0a0a0f" },
		},
	],
}

export function MapViewer({ showMobileControls = false }: { showMobileControls?: boolean }) {
	const mapRef = useRef<MapRef>(null)
	const popupRef = useRef<Popup | null>(null)
	const dataset = useOsmStore((s) => s.dataset)
	const selectEntity = useOsmStore((s) => s.selectEntity)
	const setActiveTab = useUIStore((s) => s.setActiveTab)
	const setMobilePanelOpen = useUIStore((s) => s.setMobilePanelOpen)
	const routingActive = useRoutingStore((s) => s.isActive)
	const basemapId = useUIStore((s) => s.basemapId)
	const setLegendOpen = useUIStore((s) => s.setLegendOpen)
	const { remote } = useOsm()

	const mapStyle = useMemo(() => {
		if (basemapId === "no-basemap") return EMPTY_STYLE
		if (basemapId === "osm-standard") return OSM_RASTER_STYLE
		const opt = BASEMAP_OPTIONS.find((b) => b.id === basemapId)
		return opt?.url || EMPTY_STYLE
	}, [basemapId])

	// Protocol is registered at module load time in osmix-vector-protocol.ts
	// (same pattern as merge.osmix.dev)

	// Fly to dataset bounds when loaded + auto-open legend
	// Auto-zoom based on file size to ensure vector tiles are visible
	useEffect(() => {
		if (!dataset?.info.bbox || !mapRef.current) return
		const [minLon, minLat, maxLon, maxLat] = dataset.info.bbox
		const nodeCount = dataset.info.stats.nodes
		
		// Determine max zoom based on file size for optimal vector tile visibility
		// Large files: zoom 12+ for vector tiles to appear clearly
		// Medium files: zoom 14+ 
		// Small files: zoom 16 max
		let maxZoom = 16
		if (nodeCount > 2_000_000) {
			maxZoom = 12  // Large files like Thailand
		} else if (nodeCount > 500_000) {
			maxZoom = 14  // Medium files
		}
		
		console.log(`[MapViewer] Auto-zoom: nodes=${nodeCount}, maxZoom=${maxZoom}`)
		
		mapRef.current.fitBounds(
			[
				[minLon, minLat],
				[maxLon, maxLat],
			],
			{ padding: 50, duration: 1000, maxZoom },
		)
		// Auto-open legend when data is loaded
		setLegendOpen(true)
	}, [dataset, setLegendOpen])

	// Listen for flyTo/fitBounds events from search panels
	useEffect(() => {
		const handleFlyTo = (e: Event) => {
			const { lon, lat, zoom } = (e as CustomEvent).detail
			mapRef.current?.flyTo({ center: [lon, lat], zoom, duration: 1000 })
		}
		const handleFitBounds = (e: Event) => {
			const { bounds, padding } = (e as CustomEvent).detail
			mapRef.current?.fitBounds(bounds, { padding, duration: 1000 })
		}
		window.addEventListener("osmviz:flyto", handleFlyTo)
		window.addEventListener("osmviz:fitbounds", handleFitBounds)
		return () => {
			window.removeEventListener("osmviz:flyto", handleFlyTo)
			window.removeEventListener("osmviz:fitbounds", handleFitBounds)
		}
	}, [])

	// Handle routing click directly in MapViewer to avoid stale closures
	const handleRoutingClick = useCallback(
		async (lon: number, lat: number) => {
			if (!remote || !dataset) return
			const store = useRoutingStore.getState()
			if (store.isRouting) return

			store.setIsRouting(true)
			store.setNoNodeNearby(false)

			try {
				const snapped = await remote.findNearestRoutableNode(
					dataset.osmId,
					[lon, lat],
					SNAP_RADIUS_M,
				)

				if (!snapped) {
					store.setNoNodeNearby(true)
					setTimeout(() => store.setNoNodeNearby(false), 2000)
					return
				}

				const snappedCoords: [number, number] = [
					Number(snapped.coordinates[0]),
					Number(snapped.coordinates[1]),
				]
				const snappedNode = {
					nodeIndex: Number(snapped.nodeIndex),
					nodeId: 0,
					coordinates: snappedCoords,
					distance: Number(snapped.distance),
				}

				const currentState = useRoutingStore.getState()

				if (currentState.clickPhase === "from") {
					store.setFromPoint([lon, lat], snappedNode)
				} else {
					const fromNode = currentState.fromNode
					if (!fromNode) return

					const routeResult = await remote.route(
						dataset.osmId,
						fromNode.nodeIndex,
						snappedNode.nodeIndex,
						{ includeStats: true, includePathInfo: true },
					)

					if (routeResult) {
						const plainResult = JSON.parse(
							JSON.stringify(routeResult),
						) as {
							coordinates: Array<[number, number]>
							distance?: number
							time?: number
							segments?: Array<{
								wayIds: number[]
								name: string
								highway: string
								distance: number
								time: number
							}>
							turnPoints?: Array<[number, number]>
						}

						store.setToPointAndResult(
							[lon, lat],
							snappedNode,
							plainResult,
						)

						if (plainResult.coordinates.length > 0) {
							const coords = plainResult.coordinates
							let minLon = Infinity,
								minLat = Infinity,
								maxLon = -Infinity,
								maxLat = -Infinity
							for (const [lo, la] of coords) {
								if (lo < minLon) minLon = lo
								if (la < minLat) minLat = la
								if (lo > maxLon) maxLon = lo
								if (la > maxLat) maxLat = la
							}
							mapRef.current?.fitBounds(
								[
									[minLon, minLat],
									[maxLon, maxLat],
								],
								{ padding: 60, duration: 1000 },
							)
						}
					} else {
						store.setToPointAndResult([lon, lat], snappedNode, null)
					}
				}
			} catch (err) {
				console.error("[routing] error:", err)
			} finally {
				store.setIsRouting(false)
			}
		},
		[remote, dataset],
	)

	const handleClick = useCallback(
		async (event: maplibregl.MapLayerMouseEvent) => {
			if (routingActive) {
				await handleRoutingClick(event.lngLat.lng, event.lngLat.lat)
				return
			}

			const feature = event.features?.[0]
			if (!feature || !remote || !dataset) {
				selectEntity(null)
				return
			}

			const featureType =
				(feature.properties?.type as "node" | "way" | "relation") ?? "way"
			const decodedId =
				typeof feature.id === "number"
					? decodeZigzag(feature.id)
					: Number(feature.properties?.id ?? 0)

			if (!decodedId) {
				selectEntity(null)
				return
			}

			const tags = await remote
				.getWorker()
				.getEntityTags(dataset.osmId, featureType, decodedId)

			selectEntity({
				id: decodedId,
				type: featureType,
				tags: tags ?? {},
				geometry: feature.geometry,
				lat: event.lngLat.lat,
				lon: event.lngLat.lng,
			})
			setActiveTab("inspect")
			setMobilePanelOpen(true)
		},
		[remote, dataset, selectEntity, setActiveTab, setMobilePanelOpen, routingActive, handleRoutingClick],
	)

	const handleMouseMove = useCallback(
		(event: maplibregl.MapLayerMouseEvent) => {
			const map = mapRef.current?.getMap()
			if (!map) return

			if (routingActive) {
				map.getCanvas().style.cursor = "crosshair"
				popupRef.current?.remove()
				return
			}

			const feature = event.features?.[0]
			if (!feature) {
				map.getCanvas().style.cursor = ""
				popupRef.current?.remove()
				return
			}

			map.getCanvas().style.cursor = "pointer"

			const type = feature.properties?.type ?? "way"
			const id =
				typeof feature.id === "number"
					? decodeZigzag(feature.id)
					: feature.properties?.id

			if (!popupRef.current) {
				popupRef.current = new Popup({
					closeButton: false,
					closeOnClick: false,
				})
			}
			popupRef.current
				.setLngLat(event.lngLat)
				.setHTML(`<span>${type}/${id}</span>`)
				.addTo(map)
		},
		[routingActive],
	)

	const handleMouseLeave = useCallback(() => {
		const map = mapRef.current?.getMap()
		if (map) map.getCanvas().style.cursor = routingActive ? "crosshair" : ""
		popupRef.current?.remove()
	}, [routingActive])

	const interactiveLayerIds = useMemo(() => {
		if (!dataset) return []
		return [
			`osmviz:${dataset.osmId}:ways`,
			`osmviz:${dataset.osmId}:ways-dashed`,
			`osmviz:${dataset.osmId}:ferry`,
			`osmviz:${dataset.osmId}:node-bg`,
			`osmviz:${dataset.osmId}:node-icons`,
			`osmviz:${dataset.osmId}:nodes-plain`,
		]
	}, [dataset])

	return (
		<>
			<Map
				ref={mapRef}
				mapStyle={mapStyle}
				style={{ width: "100%", height: "100%" }}
				initialViewState={{
					longitude: 103.85,
					latitude: 1.29,
					zoom: DEFAULT_ZOOM,
				}}
				interactiveLayerIds={interactiveLayerIds}
				onClick={handleClick}
				onMouseMove={handleMouseMove}
				onMouseLeave={handleMouseLeave}
				cursor={routingActive ? "crosshair" : undefined}
			>
				{(() => {
					console.log('[MapViewer] dataset:', dataset ? { osmId: dataset.osmId, fileName: dataset.fileName } : null)
					return dataset ? (
						<>
							<RoadLayer osmId={dataset.osmId} />
							<RestrictionLayer osmId={dataset.osmId} />
							<AccessLayer osmId={dataset.osmId} />
							<SpeedLayer osmId={dataset.osmId} />
						</>
					) : null
				})()}
				<RouteLayer />
				<SearchHighlightLayer />
				<BBoxDrawLayer />
				<OverlayLayer />
				{showMobileControls && <MobileControls />}
			</Map>
			<CursorCoordinates />
			<ZoomNotification />
			<VectorLoadingIndicator />
			<MemoryMonitor />
			<VectorTilesProgress />
			<GeocodingOverlay />
			<BasemapSwitcher />
			<MapLegend />
		</>
	)
}
