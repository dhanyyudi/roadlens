import { create } from "zustand"

export type SidebarTab =
	| "file"
	| "search"
	| "inspect"
	| "edit"
	| "routing"
	| "speed"
	| "layers"
	| "export"
	| "ai"
	| "overlay"

interface LayerVisibility {
	roads: boolean
	nodes: boolean
	speed: boolean
	restrictions: boolean
	access: boolean
}

/** Basemaps considered "light" — UI will switch to light theme */
const LIGHT_BASEMAPS = new Set(["positron", "voyager", "osm-standard", "light"])

export type AppTheme = "dark" | "light"

export type DrawnBbox = {
	minLon: number
	minLat: number
	maxLon: number
	maxLat: number
}

interface UIState {
	activeTab: SidebarTab
	sidebarOpen: boolean
	mobilePanelOpen: boolean
	layers: LayerVisibility
	basemapId: string
	legendOpen: boolean
	theme: AppTheme
	// Drawing mode states
	isDrawingMode: boolean
	drawnBbox: DrawnBbox | null

	setActiveTab: (tab: SidebarTab) => void
	setMobilePanelOpen: (open: boolean) => void
	toggleSidebar: () => void
	toggleLayer: (layer: keyof LayerVisibility) => void
	setBasemapId: (id: string) => void
	setLegendOpen: (open: boolean) => void
	// Drawing mode actions
	setDrawingMode: (active: boolean) => void
	setDrawnBbox: (bbox: DrawnBbox | null) => void
	clearDrawnBbox: () => void
}

export const useUIStore = create<UIState>((set) => ({
	activeTab: "file",
	sidebarOpen: true,
	mobilePanelOpen: false,
	layers: {
		roads: true,
		nodes: true,
		speed: false,
		restrictions: false,
		access: false,
	},
	basemapId: "dark-matter",
	legendOpen: false,
	theme: "dark",
	// Drawing mode
	isDrawingMode: false,
	drawnBbox: null,

	setActiveTab: (tab) => set({ activeTab: tab }),
	setMobilePanelOpen: (open) => set({ mobilePanelOpen: open }),
	toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
	toggleLayer: (layer) =>
		set((s) => ({
			layers: { ...s.layers, [layer]: !s.layers[layer] },
		})),
	setBasemapId: (id) =>
		set({
			basemapId: id,
			theme: LIGHT_BASEMAPS.has(id) ? "light" : "dark",
		}),
	setLegendOpen: (open) => set({ legendOpen: open }),
	// Drawing mode
	setDrawingMode: (active) => set({ isDrawingMode: active }),
	setDrawnBbox: (bbox) => set({ drawnBbox: bbox }),
	clearDrawnBbox: () => set({ drawnBbox: null }),
}))
