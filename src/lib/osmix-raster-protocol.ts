import type { Tile } from "@osmix/shared/types"
import type { DrawToRasterTileOptions } from "osmix"
import maplibre from "maplibre-gl"
import { getOsmRemote } from "../hooks/use-osm"

const RASTER_PROTOCOL_NAME = "@osmix/raster"

const RASTER_URL_PATTERN =
	/^@osmix\/raster:\/\/([^/]+)\/(\d+)\/(\d+)\/(\d+)\.png$/

let registered = false

export function osmixIdToRasterTileUrl(osmId: string) {
	return `${RASTER_PROTOCOL_NAME}://${encodeURIComponent(osmId)}/{z}/{x}/{y}.png`
}

export function addOsmixRasterProtocol() {
	if (registered) return
	maplibre.addProtocol(
		RASTER_PROTOCOL_NAME,
		async (
			req,
			abortController,
		): Promise<maplibregl.GetResourceResponse<HTMLImageElement | ImageBitmap | null>> => {
			const match = RASTER_URL_PATTERN.exec(req.url)
			if (!match) throw new Error(`Bad @osmix/raster URL: ${req.url}`)
			const [, osmId, zStr, xStr, yStr] = match
			const tile: Tile = [+xStr!, +yStr!, +zStr!]
			const zoom = +zStr!

			// Generate raster tiles for zoom 0-10 max
			// Zoom 11+ should use vector tiles (or upscaled raster from zoom 10)
			if (zoom >= 11) {
				return { data: null }
			}
			
			const remote = getOsmRemote()
			if (!remote || abortController.signal.aborted) return { data: null }

			try {
				// Get raster tile data from worker
				// Using custom line color for dark theme visibility
				const opts: DrawToRasterTileOptions = {
					tileSize: 256,
					lineColor: [255, 255, 255, 180],  // White roads with slight transparency
					pointColor: [200, 200, 200, 200], // Gray points
				}
				
				const rgbaData = await remote.getWorker().getRasterTile(
					decodeURIComponent(osmId!),
					tile,
					opts
				)

				if (!rgbaData || rgbaData.byteLength === 0) {
					return { data: null }
				}

				// Convert RGBA data to ImageBitmap
				const imageData = new ImageData(
					rgbaData,
					256,
					256
				)

				// Create bitmap from image data
				const bitmap = await createImageBitmap(imageData)

				return {
					data: abortController.signal.aborted ? null : bitmap,
					cacheControl: "no-cache",
				}
			} catch (err) {
				console.error("[raster] Failed to generate tile:", err)
				return { data: null }
			}
		},
	)
	registered = true
}

export function removeOsmixRasterProtocol() {
	if (!registered) return
	maplibre.removeProtocol(RASTER_PROTOCOL_NAME)
	registered = false
}

// Register protocol at module load time
if (typeof window !== "undefined") {
	addOsmixRasterProtocol()
}
