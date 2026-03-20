export const VECTOR_PROTOCOL_NAME = "@osmix/vector"
export const RASTER_PROTOCOL_NAME = "@osmix/raster"
export const MIN_ZOOM = 2
export const MAX_ZOOM = 22

// Vector tile settings - Dynamic based on file size
// File kecil (< 500K nodes): Vector zoom 0+
// File medium (500K-2M nodes): Vector zoom 8+  
// File besar (> 2M nodes): Vector zoom 10+
export const MIN_PICKABLE_ZOOM = 10  // Default minimum
export const VECTOR_MIN_ZOOM = 10    // Default for large files
export const VECTOR_MAX_ZOOM = 14

// Raster preview settings
export const RASTER_MAX_ZOOM = 10   // Default for large files
export const RASTER_OPACITY = 0.9

// Thresholds untuk smart detection
export const FILE_SIZE_THRESHOLDS = {
	FULL_VECTOR: 500_000,      // < 500K nodes = full vector
	HYBRID: 2_000_000,         // 500K - 2M = hybrid (raster 0-8, vector 8+)
	RASTER_REQUIRED: 2_000_000 // > 2M = raster 0-10, vector 10+
} as const

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
