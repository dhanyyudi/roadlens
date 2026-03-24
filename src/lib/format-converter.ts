/**
 * Multi-format file converter
 * Converts various geo formats to GeoJSON for ingestion via remote.fromGeoJSON()
 *
 * Supported: .osm, .geojson, .gpx, .kml, .kmz, .zip (shapefile)
 */

import * as toGeoJSON from "togeojson"
import JSZip from "jszip"
import * as shapefile from "shapefile"

export type FileFormat =
	| "pbf"
	| "osm"
	| "geojson"
	| "gpx"
	| "kml"
	| "kmz"
	| "shp-zip"
	| "parquet"
	| "unknown"

export function detectFormat(file: File): FileFormat {
	const name = file.name.toLowerCase()
	if (name.endsWith(".osm.pbf") || name.endsWith(".pbf")) return "pbf"
	if (name.endsWith(".osm")) return "osm"
	if (name.endsWith(".geojson") || name.endsWith(".json")) return "geojson"
	if (name.endsWith(".gpx")) return "gpx"
	if (name.endsWith(".kml")) return "kml"
	if (name.endsWith(".kmz")) return "kmz"
	if (name.endsWith(".zip")) return "shp-zip"
	if (name.endsWith(".parquet") || name.endsWith(".geoparquet")) return "parquet"
	return "unknown"
}

export async function convertToGeoJSON(
	file: File,
	format: FileFormat,
): Promise<GeoJSON.FeatureCollection> {
	switch (format) {
		case "osm":
			return convertOsm(file)
		case "geojson":
			return convertGeoJSON(file)
		case "gpx":
			return convertGpx(file)
		case "kml":
			return convertKml(file)
		case "kmz":
			return convertKmz(file)
		case "shp-zip":
			return convertShpZip(file)
		default:
			throw new Error(`Unsupported format: ${format}`)
	}
}

// --- OSM XML (.osm) ---
// Parses ALL features (not just highway=*) unlike the Overpass-only parser
async function convertOsm(file: File): Promise<GeoJSON.FeatureCollection> {
	const text = await file.text()
	const parser = new DOMParser()
	const doc = parser.parseFromString(text, "application/xml")

	if (doc.querySelector("parsererror")) {
		throw new Error("Failed to parse OSM XML file")
	}

	// Build node lookup
	const nodes = new Map<number, { lat: number; lon: number; tags: Record<string, string> }>()
	doc.querySelectorAll("node").forEach((el) => {
		const id = parseInt(el.getAttribute("id") || "0")
		const lat = parseFloat(el.getAttribute("lat") || "0")
		const lon = parseFloat(el.getAttribute("lon") || "0")
		const tags: Record<string, string> = {}
		el.querySelectorAll("tag").forEach((t) => {
			const k = t.getAttribute("k")
			const v = t.getAttribute("v")
			if (k && v) tags[k] = v
		})
		nodes.set(id, { lat, lon, tags })
	})

	const features: GeoJSON.Feature[] = []

	// Ways → LineString (or Polygon if closed)
	doc.querySelectorAll("way").forEach((el) => {
		const id = parseInt(el.getAttribute("id") || "0")
		const tags: Record<string, string> = {}
		el.querySelectorAll("tag").forEach((t) => {
			const k = t.getAttribute("k")
			const v = t.getAttribute("v")
			if (k && v) tags[k] = v
		})

		const coords: [number, number][] = []
		el.querySelectorAll("nd").forEach((nd) => {
			const ref = parseInt(nd.getAttribute("ref") || "0")
			const node = nodes.get(ref)
			if (node) coords.push([node.lon, node.lat])
		})

		if (coords.length < 2) return

		const first = coords[0]
		const last = coords[coords.length - 1]
		const isClosed =
			coords.length > 2 &&
			first !== undefined &&
			last !== undefined &&
			first[0] === last[0] &&
			first[1] === last[1]

		const geometry: GeoJSON.Geometry =
			isClosed && (tags.building || tags.landuse || tags.leisure || tags.natural || tags.amenity)
				? { type: "Polygon", coordinates: [coords] }
				: { type: "LineString", coordinates: coords }

		features.push({ type: "Feature", geometry, properties: { id, ...tags } })
	})

	// Standalone nodes with tags → Point
	doc.querySelectorAll("node").forEach((el) => {
		const hasTags = el.querySelectorAll("tag").length > 0
		if (!hasTags) return
		const id = parseInt(el.getAttribute("id") || "0")
		const lat = parseFloat(el.getAttribute("lat") || "0")
		const lon = parseFloat(el.getAttribute("lon") || "0")
		const tags: Record<string, string> = {}
		el.querySelectorAll("tag").forEach((t) => {
			const k = t.getAttribute("k")
			const v = t.getAttribute("v")
			if (k && v) tags[k] = v
		})
		features.push({
			type: "Feature",
			geometry: { type: "Point", coordinates: [lon, lat] },
			properties: { id, ...tags },
		})
	})

	return { type: "FeatureCollection", features }
}

// --- GeoJSON (.geojson / .json) ---
async function convertGeoJSON(file: File): Promise<GeoJSON.FeatureCollection> {
	const text = await file.text()
	const parsed = JSON.parse(text)
	if (parsed.type === "FeatureCollection") return parsed as GeoJSON.FeatureCollection
	if (parsed.type === "Feature") return { type: "FeatureCollection", features: [parsed] }
	throw new Error("Not a valid GeoJSON FeatureCollection or Feature")
}

// --- GPX ---
async function convertGpx(file: File): Promise<GeoJSON.FeatureCollection> {
	const text = await file.text()
	const parser = new DOMParser()
	const doc = parser.parseFromString(text, "application/xml")
	if (doc.querySelector("parsererror")) throw new Error("Failed to parse GPX file")
	const geojson = toGeoJSON.gpx(doc)
	return geojson as GeoJSON.FeatureCollection
}

// --- KML ---
async function convertKml(file: File): Promise<GeoJSON.FeatureCollection> {
	const text = await file.text()
	const parser = new DOMParser()
	const doc = parser.parseFromString(text, "application/xml")
	if (doc.querySelector("parsererror")) throw new Error("Failed to parse KML file")
	const geojson = toGeoJSON.kml(doc)
	return geojson as GeoJSON.FeatureCollection
}

// --- KMZ (zipped KML) ---
async function convertKmz(file: File): Promise<GeoJSON.FeatureCollection> {
	const zip = await JSZip.loadAsync(file)
	const kmlFile = Object.values(zip.files).find((f) => f.name.toLowerCase().endsWith(".kml"))
	if (!kmlFile) throw new Error("No KML file found inside KMZ archive")
	const kmlText = await kmlFile.async("text")
	const parser = new DOMParser()
	const doc = parser.parseFromString(kmlText, "application/xml")
	if (doc.querySelector("parsererror")) throw new Error("Failed to parse KML inside KMZ")
	const geojson = toGeoJSON.kml(doc)
	return geojson as GeoJSON.FeatureCollection
}

// --- Shapefile ZIP (.zip containing .shp + .dbf) ---
async function convertShpZip(file: File): Promise<GeoJSON.FeatureCollection> {
	const zip = await JSZip.loadAsync(file)

	const shpFile = Object.values(zip.files).find((f) => f.name.toLowerCase().endsWith(".shp"))
	const dbfFile = Object.values(zip.files).find((f) => f.name.toLowerCase().endsWith(".dbf"))

	if (!shpFile) throw new Error("No .shp file found inside ZIP archive")

	const shpBuffer = await shpFile.async("arraybuffer")
	const dbfBuffer = dbfFile ? await dbfFile.async("arraybuffer") : undefined

	const features: GeoJSON.Feature[] = []
	const source = await shapefile.open(shpBuffer, dbfBuffer)
	let result = await source.read()
	while (!result.done) {
		if (result.value) features.push(result.value as GeoJSON.Feature)
		result = await source.read()
	}

	return { type: "FeatureCollection", features }
}
