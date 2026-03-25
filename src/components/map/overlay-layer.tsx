import { useEffect, useRef } from "react"
import { useMap } from "react-map-gl/maplibre"
import maplibregl from "maplibre-gl"
import { useOverlayStore } from "../../stores/overlay-store"

/** SVG map pin icon — the tip of the pin is at the bottom center */
function createPinSVG(color: string): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="24" viewBox="0 0 28 36">
		<path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.27 21.73 0 14 0z"
			fill="${color}" stroke="#fff" stroke-width="2"/>
		<circle cx="14" cy="13" r="5" fill="#fff" opacity="0.9"/>
	</svg>`
}

/**
 * Renders overlay datasets:
 * - Points → MapLibre HTML Markers (DOM-based, map-pin SVG icons)
 * - Polygons/Lines → map.addSource/addLayer (WebGL-rendered, transparent fill + outline)
 */
export function OverlayLayer() {
	const { current: mapRef } = useMap()
	const { datasets, selectedFeatureId, setSelectedFeatureId } = useOverlayStore()
	const markersRef = useRef<Map<string, { marker: maplibregl.Marker; pin: HTMLDivElement; label: HTMLDivElement }[]>>(new Map())
	const polyLayersRef = useRef<Set<string>>(new Set())

	// ─── Point markers ────────────────────────────────────────────────────────
	useEffect(() => {
		const map = mapRef?.getMap()
		if (!map) return

		const currentIds = new Set(datasets.map((d) => d.id))

		// Remove markers for deleted datasets
		for (const [dsId, entries] of markersRef.current) {
			if (!currentIds.has(dsId)) {
				for (const e of entries) e.marker.remove()
				markersRef.current.delete(dsId)
			}
		}

		// Add/update markers for each dataset
		for (const ds of datasets) {
			if (ds.features.length === 0) continue

			const existing = markersRef.current.get(ds.id)

			if (existing) {
				for (const e of existing) {
					e.marker.getElement().style.display = ds.visible ? "" : "none"
				}
				continue
			}

			const entries: { marker: maplibregl.Marker; pin: HTMLDivElement; label: HTMLDivElement }[] = []
			for (const f of ds.features) {
				const el = document.createElement("div")
				el.style.cssText = "cursor: pointer; display: flex; flex-direction: column; align-items: center;"

				const pin = document.createElement("div")
				pin.innerHTML = createPinSVG(ds.color)
				pin.style.cssText = `
					width: 18px; height: 24px;
					filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
					transition: transform 0.15s, filter 0.15s;
				`

				const labelText = Object.values(f.properties).find((v) => typeof v === "string" && v.trim()) as string | undefined
				const label = document.createElement("div")
				label.style.cssText = `
					font-size: 11px; font-weight: 600; color: #fff; white-space: nowrap;
					-webkit-text-stroke: 3px rgba(0,0,0,0.9);
					paint-order: stroke fill;
					margin-top: 1px; max-width: 120px; overflow: hidden; text-overflow: ellipsis;
					pointer-events: none;
				`
				label.textContent = labelText ?? ""

				el.appendChild(pin)
				el.appendChild(label)

				el.addEventListener("mouseenter", () => {
					pin.style.transform = "scale(1.2)"
					pin.style.filter = `drop-shadow(0 0 6px ${ds.color}88) drop-shadow(0 2px 4px rgba(0,0,0,0.5))`
				})
				el.addEventListener("mouseleave", () => {
					pin.style.transform = ""
					pin.style.filter = "drop-shadow(0 2px 4px rgba(0,0,0,0.5))"
				})
				el.addEventListener("click", (e) => {
					e.stopPropagation()
					setSelectedFeatureId(`${ds.id}:::${f.id}`)
				})

				const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
					.setLngLat([f.lon, f.lat])
					.addTo(map)

				if (!ds.visible) {
					el.style.display = "none"
				}

				entries.push({ marker, pin, label })
			}
			markersRef.current.set(ds.id, entries)
		}
	}, [mapRef, datasets, setSelectedFeatureId])

	// ─── Highlight selected marker ────────────────────────────────────────────
	useEffect(() => {
		for (const [dsId, entries] of markersRef.current) {
			const ds = datasets.find((d) => d.id === dsId)
			if (!ds) continue
			for (let i = 0; i < entries.length; i++) {
				const f = ds.features[i]
				const isSelected = selectedFeatureId === `${dsId}:::${f?.id}`
				const entry = entries[i]
				if (!entry) continue
				const { pin, marker } = entry
				if (isSelected) {
					pin.style.transform = "scale(1.3)"
					pin.style.filter = `drop-shadow(0 0 10px ${ds.color}) drop-shadow(0 2px 4px rgba(0,0,0,0.5))`
					marker.getElement().style.zIndex = "10"
				} else {
					pin.style.transform = ""
					pin.style.filter = "drop-shadow(0 2px 4px rgba(0,0,0,0.5))"
					marker.getElement().style.zIndex = ""
				}
			}
		}
	}, [selectedFeatureId, datasets])

	// ─── Polygon/Line layers (WebGL via addSource/addLayer) ───────────────────
	useEffect(() => {
		const map = mapRef?.getMap()
		if (!map) return

		const currentIds = new Set<string>()

		for (const ds of datasets) {
			if (!ds.geojson) continue

			const srcId = `overlay-poly-${ds.id}`
			const fillId = `overlay-fill-${ds.id}`
			const lineId = `overlay-line-${ds.id}`
			currentIds.add(ds.id)

			if (map.getSource(srcId)) {
				// Update visibility
				const vis = ds.visible ? "visible" : "none"
				if (map.getLayer(fillId)) map.setLayoutProperty(fillId, "visibility", vis)
				if (map.getLayer(lineId)) map.setLayoutProperty(lineId, "visibility", vis)
				continue
			}

			// Add new source + layers
			map.addSource(srcId, {
				type: "geojson",
				data: ds.geojson,
			})

			// Transparent fill layer
			map.addLayer({
				id: fillId,
				type: "fill",
				source: srcId,
				paint: {
					"fill-color": ds.color,
					"fill-opacity": 0.15,
				},
				filter: ["any",
					["==", ["geometry-type"], "Polygon"],
					["==", ["geometry-type"], "MultiPolygon"],
				],
			})

			// Outline / line layer
			map.addLayer({
				id: lineId,
				type: "line",
				source: srcId,
				paint: {
					"line-color": ds.color,
					"line-width": 2,
					"line-opacity": 0.8,
				},
			})

			polyLayersRef.current.add(ds.id)
		}

		// Remove layers for deleted datasets
		for (const dsId of polyLayersRef.current) {
			if (!currentIds.has(dsId)) {
				const srcId = `overlay-poly-${dsId}`
				const fillId = `overlay-fill-${dsId}`
				const lineId = `overlay-line-${dsId}`
				if (map.getLayer(fillId)) map.removeLayer(fillId)
				if (map.getLayer(lineId)) map.removeLayer(lineId)
				if (map.getSource(srcId)) map.removeSource(srcId)
				polyLayersRef.current.delete(dsId)
			}
		}
	}, [mapRef, datasets])

	// ─── Cleanup on unmount ───────────────────────────────────────────────────
	useEffect(() => {
		return () => {
			// Clean markers
			for (const entries of markersRef.current.values()) {
				for (const e of entries) e.marker.remove()
			}
			markersRef.current.clear()

			// Clean polygon layers
			const map = mapRef?.getMap()
			if (map) {
				for (const dsId of polyLayersRef.current) {
					const srcId = `overlay-poly-${dsId}`
					const fillId = `overlay-fill-${dsId}`
					const lineId = `overlay-line-${dsId}`
					if (map.getLayer(fillId)) map.removeLayer(fillId)
					if (map.getLayer(lineId)) map.removeLayer(lineId)
					if (map.getSource(srcId)) map.removeSource(srcId)
				}
			}
			polyLayersRef.current.clear()
		}
	}, [])

	return null
}
