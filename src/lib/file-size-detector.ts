/**
 * Smart detection untuk memilih render strategy berdasarkan ukuran file
 */

export interface FileSizeThresholds {
	/** Max nodes untuk full vector (semua zoom) */
	fullVector: number
	/** Max nodes untuk hybrid (vector dari zoom 8+) */
	hybrid: number
	/** Lebih dari ini = raster only sampai zoom 10+ */
	rasterRequired: number
	/** Lebih dari ini = country-scale, vector dari zoom 12+ */
	country: number
}

export const DEFAULT_THRESHOLDS: FileSizeThresholds = {
	fullVector: 500_000,      // < 500K nodes = full vector
	hybrid: 2_000_000,        // 500K - 2M = hybrid
	rasterRequired: 2_000_000, // > 2M = raster required
	country: 10_000_000,      // > 10M = country scale
}

export type RenderStrategy = "full-vector" | "hybrid" | "raster-required" | "country"

/**
 * Tentukan render strategy berdasarkan jumlah nodes
 */
export function getRenderStrategy(
	nodeCount: number,
	thresholds: FileSizeThresholds = DEFAULT_THRESHOLDS
): RenderStrategy {
	if (nodeCount <= thresholds.fullVector) {
		return "full-vector"
	}
	if (nodeCount <= thresholds.hybrid) {
		return "hybrid"
	}
	if (nodeCount <= thresholds.country) {
		return "raster-required"
	}
	return "country"
}

/**
 * Get min zoom untuk vector tiles berdasarkan strategy
 */
export function getVectorMinZoom(strategy: RenderStrategy): number {
	switch (strategy) {
		case "full-vector":
			return 0   // Vector tiles di semua zoom
		case "hybrid":
			return 8   // Vector tiles dari zoom 8+
		case "raster-required":
			return 10  // Vector tiles dari zoom 10+
		case "country":
			return 12  // Vector tiles dari zoom 12+ (country-scale, fewer ways per tile)
	}
}

/**
 * Get max zoom untuk raster tiles berdasarkan strategy
 */
export function getRasterMaxZoom(strategy: RenderStrategy): number {
	switch (strategy) {
		case "full-vector":
			return 0   // Tidak perlu raster
		case "hybrid":
			return 8   // Raster sampai zoom 8
		case "raster-required":
			return 11  // Raster sampai zoom 11, overlap dengan vector di zoom 10
		case "country":
			return 13  // Raster sampai zoom 13, overlap dengan vector di zoom 12
	}
}

/**
 * Cek apakah perlu raster layer
 */
export function needsRasterLayer(strategy: RenderStrategy): boolean {
	return strategy !== "full-vector"
}

/**
 * Get deskripsi untuk user
 */
export function getStrategyDescription(strategy: RenderStrategy): string {
	switch (strategy) {
		case "full-vector":
			return "Full vector mode - all zoom levels"
		case "hybrid":
			return "Hybrid mode - raster preview, vector at zoom 8+"
		case "raster-required":
			return "Large file mode - raster preview, vector at zoom 10+"
		case "country":
			return "Country-scale mode - raster preview, vector at zoom 12+"
	}
}
