import { useMemo } from "react"
import { useOsmStore } from "../stores/osm-store"
import {
	getRenderStrategy,
	getVectorMinZoom,
	getRasterMaxZoom,
	needsRasterLayer,
	getStrategyDescription,
	type RenderStrategy,
} from "../lib/file-size-detector"

interface RenderStrategyResult {
	strategy: RenderStrategy
	vectorMinZoom: number
	rasterMaxZoom: number
	showRaster: boolean
	description: string
	nodeCount: number
}

export function useRenderStrategy(): RenderStrategyResult | null {
	const dataset = useOsmStore((s) => s.dataset)

	return useMemo(() => {
		if (!dataset) return null

		const nodeCount = dataset.info.stats.nodes
		const strategy = getRenderStrategy(nodeCount)

		return {
			strategy,
			vectorMinZoom: getVectorMinZoom(strategy),
			rasterMaxZoom: getRasterMaxZoom(strategy),
			showRaster: needsRasterLayer(strategy),
			description: getStrategyDescription(strategy),
			nodeCount,
		}
	}, [dataset])
}
