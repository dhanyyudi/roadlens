
import { useMemo, useEffect, useCallback, useRef } from "react"
import { useMap } from "react-map-gl/maplibre"
import type {
	FilterSpecification,
	SymbolLayerSpecification,
	MapSourceDataEvent,
} from "maplibre-gl"
import { zigzag } from "@osmix/shared/zigzag"
import { osmixIdToTileUrl, setOsmixVectorMinZoom } from "../../lib/osmix-vector-protocol"
import { VECTOR_MAX_ZOOM } from "../../constants"
import { useUIStore } from "../../stores/ui-store"
import { useOsmStore } from "../../stores/osm-store"
import { useSpeedStore } from "../../stores/speed-store"
import {
	roadColorExpression,
	roadCasingColorExpression,
	roadWidthExpression,
	roadCasingWidthExpression,
} from "../../lib/road-style"
import { registerNodeIcons, nodeIconId } from "../../lib/node-icons"

interface RoadLayerProps {
	osmId: string
}

// Filters
const wayLinesFilter: FilterSpecification = [
	"==",
	["geometry-type"],
	"LineString",
]
// nodeFilter kept for reference if needed
// const nodeFilter: FilterSpecification = ["==", ["get", "type"], "node"]

// Oneway filters (raw OSM: string values)
const onewayForwardFilter: FilterSpecification = [
	"all",
	["==", ["geometry-type"], "LineString"],
	["any",
		["==", ["get", "oneway"], "yes"],
		["==", ["get", "oneway"], "1"],
	],
]
const onewayReverseFilter: FilterSpecification = [
	"all",
	["==", ["geometry-type"], "LineString"],
	["==", ["get", "oneway"], "-1"],
]
// All ways that are NOT oneway (for faint way-direction arrows)
const notOnewayFilter: FilterSpecification = [
	"all",
	["==", ["geometry-type"], "LineString"],
	["!", ["any",
		["==", ["get", "oneway"], "yes"],
		["==", ["get", "oneway"], "1"],
		["==", ["get", "oneway"], "-1"],
	]],
]

const DASHED_TYPES = ["track", "path", "footway", "sidewalk", "cycleway", "steps", "bridleway", "construction", "proposed"]
const dashedFilter: FilterSpecification = [
	"all",
	["==", ["geometry-type"], "LineString"],
	["in", ["get", "highway"], ["literal", DASHED_TYPES]],
]
const solidFilter: FilterSpecification = [
	"all",
	["==", ["geometry-type"], "LineString"],
	["!", ["in", ["get", "highway"], ["literal", DASHED_TYPES]]],
]

// barrierFilter replaced by iconNodeFilter below
// const barrierFilter: FilterSpecification = [
// 	"all",
// 	["==", ["get", "type"], "node"],
// 	["has", "barrier"],
// ]

// Nodes that have a specific icon (highway or barrier or traffic_calming)
const ICON_HIGHWAY_TYPES = [
	"traffic_signals", "bus_stop", "stop", "give_way", "crossing",
]
const ICON_BARRIER_TYPES = ["gate", "bollard", "lift_gate"]

const iconNodeFilter: FilterSpecification = [
	"all",
	["==", ["get", "type"], "node"],
	["any",
		["in", ["get", "highway"], ["literal", ICON_HIGHWAY_TYPES]],
		["in", ["get", "barrier"], ["literal", ICON_BARRIER_TYPES]],
		["has", "traffic_calming"],
	],
]

// Remaining nodes without a specific icon (fallback circle)
const plainNodeFilter: FilterSpecification = [
	"all",
	["==", ["get", "type"], "node"],
	["!",
		["any",
			["in", ["get", "highway"], ["literal", ICON_HIGHWAY_TYPES]],
			["in", ["get", "barrier"], ["literal", ICON_BARRIER_TYPES]],
			["has", "traffic_calming"],
		],
	],
]

/**
 * Generate iD-style chevron arrow (open '>') for SDF rendering.
 * Arrow points right — MapLibre auto-rotates along line direction.
 * SDF mode allows controlling color via `icon-color` paint property.
 *
 * Draws a slim, elegant chevron that matches iD Editor's visual style:
 * - Narrow chevron angle (~60°) for a sleek look
 * - Thin stroke for subtlety
 * - Vertically compact to sit within road lines
 */
function createChevronArrowSDF(size = 20): {
	width: number
	height: number
	data: Uint8Array
} {
	const canvas = document.createElement("canvas")
	canvas.width = size
	canvas.height = size
	const ctx = canvas.getContext("2d")!

	ctx.clearRect(0, 0, size, size)

	// Slim chevron: narrower angle, vertically compact
	const leftX = size * 0.3
	const tipX = size * 0.7
	const midY = size * 0.5
	const armY = size * 0.25  // vertical extent of arms

	ctx.strokeStyle = "#ffffff"
	ctx.lineWidth = size * 0.1  // thinner stroke (~2px at 20px)
	ctx.lineCap = "round"
	ctx.lineJoin = "round"

	ctx.beginPath()
	ctx.moveTo(leftX, midY - armY)
	ctx.lineTo(tipX, midY)
	ctx.lineTo(leftX, midY + armY)
	ctx.stroke()

	const imageData = ctx.getImageData(0, 0, size, size)
	return {
		width: size,
		height: size,
		data: new Uint8Array(imageData.data.buffer),
	}
}

/** Layer IDs for cleanup */
function allLayerIds(osmId: string) {
	return [
		`osmviz:${osmId}:casing`,
		`osmviz:${osmId}:ways`,
		`osmviz:${osmId}:ways-dashed`,
		`osmviz:${osmId}:way-direction`,
		`osmviz:${osmId}:oneway-casing`,
		`osmviz:${osmId}:oneway-arrows`,
		`osmviz:${osmId}:oneway-reverse-casing`,
		`osmviz:${osmId}:oneway-arrows-reverse`,
		`osmviz:${osmId}:road-labels`,
		`osmviz:${osmId}:node-bg`,
		`osmviz:${osmId}:node-icons`,
		`osmviz:${osmId}:nodes-plain`,
	]
}

export function RoadLayer({ osmId }: RoadLayerProps) {
	console.log(`[RoadLayer] Rendering with osmId: ${osmId}`)
	
	const roadsVisible = useUIStore((s) => s.layers.roads)
	const nodesVisible = useUIStore((s) => s.layers.nodes)
	const speedVisible = useUIStore((s) => s.layers.speed)
	const dataset = useOsmStore((s) => s.dataset)
	const highlightedWayIds = useOsmStore((s) => s.highlightedWayIds)
	const speedLoaded = useSpeedStore((s) => s.isLoaded)
	const speedStats = useSpeedStore((s) => s.stats)
	const speedData = useSpeedStore((s) => s.speedData)
	const { current: mapInstance } = useMap()

	const sourceId = `osmviz:${osmId}:source`
	const sourceLayerPrefix = `@osmix:${osmId}`

	const bounds = dataset?.info.bbox as [number, number, number, number] | undefined
	console.log(`[RoadLayer] bounds:`, bounds)

	const colorBySpeed = speedVisible && speedLoaded && speedStats

	// All files use full vector from zoom 0 (no minimum zoom restriction)
	// Vector tiles will load progressively - may be slow for large files at low zoom
	// but provides immediate feedback to users
	const vectorMinZoom = 0

	console.log(`[RoadLayer] mapInstance:`, mapInstance ? 'exists' : 'null', `vectorMinZoom: ${vectorMinZoom}`)

	// Dynamic road color
	const roadColor = useMemo(() => {
		if (colorBySpeed && speedStats) {
			return [
				"case",
				["boolean", ["feature-state", "hasSpeed"], false],
				[
					"interpolate", ["linear"], ["feature-state", "speed"],
					speedStats.minSpeed, "#ff0000",
					speedStats.minSpeed + (speedStats.maxSpeed - speedStats.minSpeed) * 0.25, "#ff8800",
					speedStats.minSpeed + (speedStats.maxSpeed - speedStats.minSpeed) * 0.5, "#ffff00",
					speedStats.minSpeed + (speedStats.maxSpeed - speedStats.minSpeed) * 0.75, "#88ff00",
					speedStats.maxSpeed, "#00ff00",
				],
				"rgba(80, 80, 80, 0.4)",
			] as unknown as maplibregl.ExpressionSpecification
		}
		return roadColorExpression
	}, [colorBySpeed, speedStats])

	const opacity = roadsVisible ? 1 : 0

	// Track if layers have been created
	const createdRef = useRef(false)

	// Register SDF arrow + node icons on map
	const registerImages = useCallback(() => {
		const map = mapInstance?.getMap()
		if (!map) return
		if (!map.hasImage("oneway-arrow")) {
			const arrow = createChevronArrowSDF(20)
			map.addImage("oneway-arrow", arrow, { sdf: true })
		}
		registerNodeIcons(map, 24)
	}, [mapInstance])

	useEffect(() => {
		const map = mapInstance?.getMap()
		if (!map) return

		if (map.isStyleLoaded()) {
			registerImages()
		} else {
			map.once("style.load", registerImages)
		}

		// Re-add when style changes (basemap switch wipes images)
		const onStyleData = () => { registerImages() }
		map.on("styledata", onStyleData)
		return () => { map.off("styledata", onStyleData) }
	}, [mapInstance, registerImages])

	// ── STRUCTURAL EFFECT: create source + layers (only on osmId change) ──
	useEffect(() => {
		console.log(`[RoadLayer] useEffect triggered - osmId: ${osmId}, mapInstance: ${!!mapInstance}, bounds: ${!!bounds}`)
		const map = mapInstance?.getMap()
		if (!map) {
			console.log(`[RoadLayer] Early return - no map`)
			return
		}

		const waysSL = `${sourceLayerPrefix}:ways`
		const nodesSL = `${sourceLayerPrefix}:nodes`

		const create = () => {
			console.log(`[RoadLayer] Creating source and layers for ${osmId}, vectorMinZoom=${vectorMinZoom}, bounds:`, bounds)
			console.log(`[RoadLayer] Current map zoom: ${map.getZoom()}`)

			// Register per-osmId min zoom so the protocol handler can skip low-zoom tiles
			setOsmixVectorMinZoom(osmId, vectorMinZoom)
			
			// Clean up any existing
			for (const id of allLayerIds(osmId)) {
				try { if (map.getLayer(id)) map.removeLayer(id) } catch { /* */ }
			}
			try { if (map.getSource(sourceId)) map.removeSource(sourceId) } catch { /* */ }

			registerImages()

			const tileUrl = osmixIdToTileUrl(osmId)
			console.log(`[RoadLayer] Vector tile URL: ${tileUrl}`)
			console.log(`[RoadLayer] Source config: vectorMinZoom=${vectorMinZoom}, maxzoom=${VECTOR_MAX_ZOOM}, bounds=`, bounds)

			// Use minzoom:0 on source so MapLibre always requests tiles via the protocol.
			// The protocol handler filters low-zoom requests. Layer minzoom controls rendering.
			// (MapLibre 5.x may not request tiles when source.minzoom is set for custom protocols)
			map.addSource(sourceId, {
				type: "vector",
				tiles: [tileUrl],
				bounds,
				minzoom: 0,
				maxzoom: VECTOR_MAX_ZOOM,
			})

			console.log(`[RoadLayer] Source created: ${sourceId}`)

			// === CASING (outline) for solid roads ===
			map.addLayer({
				id: `osmviz:${osmId}:casing`,
				type: "line",
				source: sourceId,
				"source-layer": waysSL,
				filter: solidFilter,
				minzoom: vectorMinZoom,
				layout: { "line-join": "round", "line-cap": "round" },
				paint: {
					"line-color": roadCasingColorExpression as any,
					"line-width": roadCasingWidthExpression as any,
					"line-opacity": 0.8,
				},
			})

			// === SOLID road fill ===
			map.addLayer({
				id: `osmviz:${osmId}:ways`,
				type: "line",
				source: sourceId,
				"source-layer": waysSL,
				filter: solidFilter,
				minzoom: vectorMinZoom,
				layout: { "line-join": "round", "line-cap": "round" },
				paint: {
					"line-color": roadColorExpression as any,
					"line-width": roadWidthExpression as any,
					"line-opacity": 1,
				},
			})

			// === DASHED road fill ===
			map.addLayer({
				id: `osmviz:${osmId}:ways-dashed`,
				type: "line",
				source: sourceId,
				"source-layer": waysSL,
				filter: dashedFilter,
				minzoom: vectorMinZoom,
				layout: { "line-join": "round", "line-cap": "butt" },
				paint: {
					"line-color": roadColorExpression as any,
					"line-width": roadWidthExpression as any,
					"line-dasharray": [4, 3],
					"line-opacity": 1,
				},
			})

			// === WAY DIRECTION ARROWS ===
			map.addLayer({
				id: `osmviz:${osmId}:way-direction`,
				type: "symbol",
				source: sourceId,
				"source-layer": waysSL,
				filter: notOnewayFilter,
				minzoom: 16,
				layout: {
					"symbol-placement": "line",
					"symbol-spacing": 80,
					"icon-image": "oneway-arrow",
					"icon-size": ["interpolate", ["linear"], ["zoom"], 16, 0.5, 18, 0.65],
					"icon-rotation-alignment": "map",
					"icon-keep-upright": false,
					"icon-allow-overlap": true,
					"icon-ignore-placement": true,
				} as SymbolLayerSpecification["layout"],
				paint: {
					"icon-color": "#888888",
					"icon-opacity": ["interpolate", ["linear"], ["zoom"], 16, 0, 17, 0.2, 20, 0.3] as any,
				},
			})

			// === ONEWAY ARROW CASING ===
			map.addLayer({
				id: `osmviz:${osmId}:oneway-casing`,
				type: "symbol",
				source: sourceId,
				"source-layer": waysSL,
				filter: onewayForwardFilter,
				minzoom: 13,
				layout: {
					"symbol-placement": "line",
					"symbol-spacing": 75,
					"icon-image": "oneway-arrow",
					"icon-size": ["interpolate", ["linear"], ["zoom"], 13, 0.65, 15, 0.85, 18, 1.05],
					"icon-rotation-alignment": "map",
					"icon-keep-upright": false,
					"icon-allow-overlap": true,
					"icon-ignore-placement": true,
				} as SymbolLayerSpecification["layout"],
				paint: {
					"icon-color": "#333333",
					"icon-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0.2, 15, 0.35, 18, 0.4] as any,
				},
			})

			// === ONEWAY ARROWS FORWARD ===
			map.addLayer({
				id: `osmviz:${osmId}:oneway-arrows`,
				type: "symbol",
				source: sourceId,
				"source-layer": waysSL,
				filter: onewayForwardFilter,
				minzoom: 13,
				layout: {
					"symbol-placement": "line",
					"symbol-spacing": 75,
					"icon-image": "oneway-arrow",
					"icon-size": ["interpolate", ["linear"], ["zoom"], 13, 0.5, 15, 0.7, 18, 0.9],
					"icon-rotation-alignment": "map",
					"icon-keep-upright": false,
					"icon-allow-overlap": true,
					"icon-ignore-placement": true,
				} as SymbolLayerSpecification["layout"],
				paint: {
					"icon-color": "#ffffff",
					"icon-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0.55, 15, 0.85, 18, 0.9] as any,
				},
			})

			// === ONEWAY REVERSE CASING ===
			map.addLayer({
				id: `osmviz:${osmId}:oneway-reverse-casing`,
				type: "symbol",
				source: sourceId,
				"source-layer": waysSL,
				filter: onewayReverseFilter,
				minzoom: 13,
				layout: {
					"symbol-placement": "line",
					"symbol-spacing": 75,
					"icon-image": "oneway-arrow",
					"icon-size": ["interpolate", ["linear"], ["zoom"], 13, 0.65, 15, 0.85, 18, 1.05],
					"icon-rotation-alignment": "map",
					"icon-keep-upright": false,
					"icon-rotate": 180,
					"icon-allow-overlap": true,
					"icon-ignore-placement": true,
				} as SymbolLayerSpecification["layout"],
				paint: {
					"icon-color": "#333333",
					"icon-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0.2, 15, 0.35, 18, 0.4] as any,
				},
			})

			// === ONEWAY ARROWS REVERSE ===
			map.addLayer({
				id: `osmviz:${osmId}:oneway-arrows-reverse`,
				type: "symbol",
				source: sourceId,
				"source-layer": waysSL,
				filter: onewayReverseFilter,
				minzoom: 13,
				layout: {
					"symbol-placement": "line",
					"symbol-spacing": 75,
					"icon-image": "oneway-arrow",
					"icon-size": ["interpolate", ["linear"], ["zoom"], 13, 0.5, 15, 0.7, 18, 0.9],
					"icon-rotation-alignment": "map",
					"icon-keep-upright": false,
					"icon-rotate": 180,
					"icon-allow-overlap": true,
					"icon-ignore-placement": true,
				} as SymbolLayerSpecification["layout"],
				paint: {
					"icon-color": "#ffffff",
					"icon-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0.55, 15, 0.85, 18, 0.9] as any,
				},
			})

			// === ROAD LABELS ===
			map.addLayer({
				id: `osmviz:${osmId}:road-labels`,
				type: "symbol",
				source: sourceId,
				"source-layer": waysSL,
				filter: wayLinesFilter,
				minzoom: 15,
				layout: {
					"symbol-placement": "line-center",
					"text-field": [
						"case",
						["all", ["has", "name"], ["has", "ref"]],
						["concat", ["get", "name"], " (", ["get", "ref"], ")"],
						["has", "name"],
						["get", "name"],
						["has", "ref"],
						["get", "ref"],
						"",
					],
					"text-size": ["interpolate", ["linear"], ["zoom"], 15, 10, 18, 13],
					"text-max-angle": 30,
					"text-padding": 10,
					"text-font": ["Open Sans Regular"],
				} as SymbolLayerSpecification["layout"],
				paint: {
					"text-color": "#e0e0e0",
					"text-halo-color": "#1a1a2e",
					"text-halo-width": 1.5,
					"text-opacity": 0.85,
				},
			})

			// === NODE BACKGROUND CIRCLES ===
			map.addLayer({
				id: `osmviz:${osmId}:node-bg`,
				type: "circle",
				source: sourceId,
				"source-layer": nodesSL,
				filter: iconNodeFilter,
				minzoom: 14,
				paint: {
					"circle-color": [
						"match",
						["get", "highway"],
						"traffic_signals", "#e8a838",
						"bus_stop", "#4a90e2",
						"stop", "#e03030",
						"give_way", "#e07020",
						"crossing", "#6a8fa0",
						[
							"case",
							["has", "barrier"], "#888888",
							["has", "traffic_calming"], "#ff9900",
							"#555555",
						],
					] as unknown as maplibregl.ExpressionSpecification,
					"circle-radius": ["interpolate", ["linear"], ["zoom"], 14, 5, 16, 9, 18, 12],
					"circle-stroke-color": "#ffffff",
					"circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 14, 1, 16, 1.5, 18, 2],
					"circle-opacity": 1,
					"circle-stroke-opacity": 1,
				},
			})

			// === NODE ICONS ===
			map.addLayer({
				id: `osmviz:${osmId}:node-icons`,
				type: "symbol",
				source: sourceId,
				"source-layer": nodesSL,
				filter: iconNodeFilter,
				minzoom: 14,
				layout: {
					"icon-image": [
						"case",
						["==", ["get", "highway"], "traffic_signals"], nodeIconId("traffic_signals"),
						["==", ["get", "highway"], "bus_stop"], nodeIconId("bus_stop"),
						["==", ["get", "highway"], "stop"], nodeIconId("stop"),
						["==", ["get", "highway"], "give_way"], nodeIconId("give_way"),
						["==", ["get", "highway"], "crossing"], nodeIconId("crossing"),
						["==", ["get", "barrier"], "gate"], nodeIconId("gate"),
						["==", ["get", "barrier"], "bollard"], nodeIconId("bollard"),
						["==", ["get", "barrier"], "lift_gate"], nodeIconId("lift_gate"),
						["has", "traffic_calming"], nodeIconId("speed_bump"),
						"",
					] as unknown as maplibregl.ExpressionSpecification,
					"icon-size": ["interpolate", ["linear"], ["zoom"], 14, 0.35, 16, 0.55, 18, 0.75],
					"icon-allow-overlap": true,
					"icon-ignore-placement": true,
				} as unknown as SymbolLayerSpecification["layout"],
				paint: {
					"icon-color": "#ffffff",
					"icon-opacity": 1,
				},
			})

			// === PLAIN NODES ===
			map.addLayer({
				id: `osmviz:${osmId}:nodes-plain`,
				type: "circle",
				source: sourceId,
				"source-layer": nodesSL,
				filter: plainNodeFilter,
				minzoom: 15,
				paint: {
					"circle-color": "#cccccc",
					"circle-radius": ["interpolate", ["linear"], ["zoom"], 15, 2, 18, 4],
					"circle-stroke-color": "#ffffff",
					"circle-stroke-width": 1,
					"circle-opacity": 1,
					"circle-stroke-opacity": 1,
				},
			})

			createdRef.current = true
			console.log(`[RoadLayer] All layers created for ${osmId}`)
			
			// Debug: Check if source exists after creation
			setTimeout(() => {
				const source = map.getSource(sourceId)
				console.log(`[RoadLayer] Source check: ${sourceId}, exists: ${!!source}, type: ${(source as any)?.type}`)
				
				// Check if layers exist
				const casingLayer = map.getLayer(`osmviz:${osmId}:casing`)
				const waysLayer = map.getLayer(`osmviz:${osmId}:ways`)
				console.log(`[RoadLayer] Layers check: casing=${!!casingLayer}, ways=${!!waysLayer}`)
			}, 100)
		}

		// Create now if style is loaded, or wait for it
		if (map.isStyleLoaded()) {
			create()
		} else {
			map.once("style.load", create)
		}

		// Re-create after basemap switch (wipes all sources/layers)
		const onStyleLoad = () => {
			createdRef.current = false
			create()
		}
		map.on("style.load", onStyleLoad)
		
		// Debug: listen for source data events - ALL data types
		const onSourceData = (e: MapSourceDataEvent) => {
			if (e.sourceId === sourceId) {
				const tileInfo = e.tile ? `${e.tile.x}/${e.tile.y}/${e.tile.z}` : 'none'
				console.log(`[RoadLayer] SourceData: dataType=${e.dataType}, loaded=${e.isSourceLoaded}, tile=${tileInfo}`)
			}
		}
		map.on("sourcedata", onSourceData)
		
		// Debug: listen for all errors
		const onError = (e: any) => {
			console.error(`[RoadLayer] Map error:`, e.error || e)
		}
		map.on("error", onError)

		return () => {
			map.off("style.load", onStyleLoad)
			map.off("sourcedata", onSourceData)
			map.off("error", onError)
			// Remove on unmount
			for (const id of allLayerIds(osmId)) {
				try { if (map.getLayer(id)) map.removeLayer(id) } catch { /* */ }
			}
			try { if (map.getSource(sourceId)) map.removeSource(sourceId) } catch { /* */ }
			createdRef.current = false
		}
	// Re-run when osmId, map, or vectorMinZoom changes
	}, [mapInstance, osmId, sourceId, sourceLayerPrefix, bounds, registerImages, vectorMinZoom])

	// ── REACTIVE EFFECT: update paint properties without recreating layers ──
	useEffect(() => {
		const map = mapInstance?.getMap()
		if (!map || !createdRef.current) return

		try {
			// Road visibility
			if (map.getLayer(`osmviz:${osmId}:casing`)) {
				map.setPaintProperty(`osmviz:${osmId}:casing`, "line-color",
					colorBySpeed ? "rgba(0,0,0,0.3)" : (roadCasingColorExpression as any))
				map.setPaintProperty(`osmviz:${osmId}:casing`, "line-opacity", opacity * 0.8)
			}
			if (map.getLayer(`osmviz:${osmId}:ways`)) {
				map.setPaintProperty(`osmviz:${osmId}:ways`, "line-color", roadColor as any)
				map.setPaintProperty(`osmviz:${osmId}:ways`, "line-opacity", opacity)
			}
			if (map.getLayer(`osmviz:${osmId}:ways-dashed`)) {
				map.setPaintProperty(`osmviz:${osmId}:ways-dashed`, "line-color", roadColor as any)
				map.setPaintProperty(`osmviz:${osmId}:ways-dashed`, "line-opacity", opacity)
			}
			if (map.getLayer(`osmviz:${osmId}:road-labels`)) {
				map.setPaintProperty(`osmviz:${osmId}:road-labels`, "text-opacity", opacity * 0.85)
			}

			// Node visibility
			if (map.getLayer(`osmviz:${osmId}:node-bg`)) {
				map.setPaintProperty(`osmviz:${osmId}:node-bg`, "circle-opacity", nodesVisible ? 1 : 0)
				map.setPaintProperty(`osmviz:${osmId}:node-bg`, "circle-stroke-opacity", nodesVisible ? 1 : 0)
			}
			if (map.getLayer(`osmviz:${osmId}:node-icons`)) {
				map.setPaintProperty(`osmviz:${osmId}:node-icons`, "icon-opacity", nodesVisible ? 1 : 0)
			}
			if (map.getLayer(`osmviz:${osmId}:nodes-plain`)) {
				map.setPaintProperty(`osmviz:${osmId}:nodes-plain`, "circle-opacity", nodesVisible ? 1 : 0)
				map.setPaintProperty(`osmviz:${osmId}:nodes-plain`, "circle-stroke-opacity", nodesVisible ? 1 : 0)
			}
		} catch { /* layers may not exist yet */ }
	}, [mapInstance, osmId, roadColor, colorBySpeed, opacity, nodesVisible])

	// ── SPEED COLORING via feature state ──
	useEffect(() => {
		const map = mapInstance?.getMap()
		if (!colorBySpeed || !speedStats || !map) return
		const sourceLayer = `${sourceLayerPrefix}:ways`

		const applyStates = () => {
			try {
				map.removeFeatureState({ source: sourceId, sourceLayer })
			} catch { /* ignore */ }

			for (const [wayId, records] of speedData) {
				const speed = records[0]?.speed ?? 0
				try {
					map.setFeatureState(
						{ source: sourceId, sourceLayer, id: zigzag(wayId) },
						{ speed, hasSpeed: true },
					)
				} catch { /* feature may not be loaded yet */ }
			}
		}

		applyStates()
		map.on("sourcedata", applyStates)
		return () => { map.off("sourcedata", applyStates) }
	}, [colorBySpeed, speedData, speedStats, sourceId, sourceLayerPrefix, mapInstance])

	// ── AI QUERY HIGHLIGHT via feature state ──
	useEffect(() => {
		const map = mapInstance?.getMap()
		if (!map || !createdRef.current) return
		const sourceLayer = `${sourceLayerPrefix}:ways`

		// Set feature state for highlighted ways
		for (const wayId of highlightedWayIds) {
			try {
				map.setFeatureState(
					{ source: sourceId, sourceLayer, id: zigzag(wayId) },
					{ highlighted: true }
				)
			} catch { /* feature may not be loaded yet */ }
		}

		// Cleanup: remove highlight from ways not in set
		return () => {
			for (const wayId of highlightedWayIds) {
				try {
					map.removeFeatureState(
						{ source: sourceId, sourceLayer, id: zigzag(wayId) },
						'highlighted'
					)
				} catch { /* ignore */ }
			}
		}
	}, [highlightedWayIds, sourceId, sourceLayerPrefix, mapInstance])

	// Listen untuk zoom event dari AI query
	useEffect(() => {
		const map = mapInstance?.getMap()
		if (!map) return

		const handleZoom = (e: Event) => {
			const customEvent = e as CustomEvent
			const bounds = customEvent.detail?.bounds
			if (bounds && Array.isArray(bounds) && bounds.length === 4) {
				map.fitBounds(
					[ [bounds[0], bounds[1]], [bounds[2], bounds[3]] ],
					{ padding: 50, maxZoom: 16, duration: 1000 }
				)
			}
		}

		window.addEventListener('ai-query-zoom', handleZoom)
		return () => window.removeEventListener('ai-query-zoom', handleZoom)
	}, [mapInstance])

	// Component renders nothing — all rendering is via native MapLibre API
	return null
}
