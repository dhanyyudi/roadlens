import { create } from "zustand"

export interface OverlayFeature {
	id: string
	lat: number
	lon: number
	/** All original attributes from the source row/feature */
	properties: Record<string, string | number | boolean | null>
}

export interface OverlayDataset {
	id: string
	fileName: string
	/** "csv" | "geojson" */
	format: "csv" | "geojson"
	/** Point features (rendered as pin markers) */
	features: OverlayFeature[]
	/** Raw GeoJSON for polygon/line features (rendered via addSource/addLayer) */
	geojson: GeoJSON.FeatureCollection | null
	/** Color for rendering, auto-assigned */
	color: string
	visible: boolean
}

interface OverlayState {
	datasets: OverlayDataset[]
	selectedFeatureId: string | null

	addDataset: (dataset: OverlayDataset) => void
	removeDataset: (id: string) => void
	toggleDatasetVisibility: (id: string) => void
	setSelectedFeatureId: (id: string | null) => void
	clearAll: () => void
}

const OVERLAY_COLORS = [
	"#F97316", // orange
	"#EF4444", // red
	"#A855F7", // purple
	"#14B8A6", // teal
	"#F59E0B", // amber
	"#EC4899", // pink
	"#06B6D4", // cyan
	"#84CC16", // lime
]

export function nextOverlayColor(existingCount: number): string {
	return OVERLAY_COLORS[existingCount % OVERLAY_COLORS.length] ?? "#F97316"
}

export const useOverlayStore = create<OverlayState>((set) => ({
	datasets: [],
	selectedFeatureId: null,

	addDataset: (dataset) =>
		set((s) => ({ datasets: [...s.datasets, dataset] })),

	removeDataset: (id) =>
		set((s) => ({
			datasets: s.datasets.filter((d) => d.id !== id),
			selectedFeatureId: s.selectedFeatureId?.startsWith(id) ? null : s.selectedFeatureId,
		})),

	toggleDatasetVisibility: (id) =>
		set((s) => ({
			datasets: s.datasets.map((d) =>
				d.id === id ? { ...d, visible: !d.visible } : d
			),
		})),

	setSelectedFeatureId: (id) => set({ selectedFeatureId: id }),

	clearAll: () => set({ datasets: [], selectedFeatureId: null }),
}))
