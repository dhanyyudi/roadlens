export const VECTOR_PROTOCOL_NAME = "@osmix/vector"
export const RASTER_PROTOCOL_NAME = "@osmix/raster"
export const MIN_ZOOM = 2
export const MAX_ZOOM = 22

// Vector tile settings - lowered for better large file support
export const MIN_PICKABLE_ZOOM = 9  // Lowered from 10 to show data earlier
export const VECTOR_MIN_ZOOM = 9    // When vector tiles become visible
export const VECTOR_MAX_ZOOM = 14

// Raster preview settings - for low-zoom overview of large datasets
export const RASTER_MAX_ZOOM = 9    // Raster tiles up to this zoom
export const RASTER_OPACITY = 0.9

export const DEFAULT_ZOOM = 5

export const BASEMAP_DARK =
	"https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"

export interface BasemapOption {
	id: string
	label: string
	url: string
}

export const BASEMAP_OPTIONS: BasemapOption[] = [
	{
		id: "dark-matter",
		label: "Dark Matter",
		url: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
	},
	{
		id: "positron",
		label: "Positron",
		url: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
	},
	{
		id: "voyager",
		label: "Voyager",
		url: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
	},
	{
		id: "osm-standard",
		label: "OpenStreetMap",
		url: "",
	},
	{
		id: "dark",
		label: "Dark",
		url: "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json",
	},
	{
		id: "light",
		label: "Light",
		url: "https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json",
	},
	{
		id: "no-basemap",
		label: "No Basemap",
		url: "",
	},
]
