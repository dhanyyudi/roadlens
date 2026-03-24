declare module "togeojson" {
	import type { FeatureCollection } from "geojson"
	export function gpx(doc: Document): FeatureCollection
	export function kml(doc: Document): FeatureCollection
	export function tcx(doc: Document): FeatureCollection
}

declare module "shapefile" {
	export interface Source {
		read(): Promise<{ done: true } | { done: false; value: object }>
	}
	export function open(
		shpBuffer: ArrayBuffer,
		dbfBuffer?: ArrayBuffer,
	): Promise<Source>
}
