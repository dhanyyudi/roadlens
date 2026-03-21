import { useEffect, useState, useCallback, useRef } from 'react'
import { useOsmStore } from '@/stores/osm-store'
import { getOsmRemote } from './use-osm'
import { useDuckDB } from './use-duckdb'

/**
 * Sync OSM data to DuckDB for AI Query
 * This runs automatically when OSM data is loaded
 * For large files (>500K roads), only sync a sample for AI Query
 */
export function useOsmDuckDBSync() {
	const { dataset } = useOsmStore()
	const { duckdb, isLimited } = useDuckDB()
	const [isSyncing, setIsSyncing] = useState(false)
	const [isSynced, setIsSynced] = useState(false)
	const [useWorkerOnly, setUseWorkerOnly] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [progress, setProgress] = useState(0)
	const [statusMessage, setStatusMessage] = useState<string>('')
	const cancelRef = useRef(false)

	const cancelSync = useCallback(() => {
		cancelRef.current = true
	}, [])

	const syncData = useCallback(async () => {
		if (!dataset || !duckdb || isLimited) {
			setIsSynced(false)
			setProgress(0)
			return
		}

		setIsSyncing(true)
		setError(null)
		setProgress(0)
		cancelRef.current = false

		const nodeCount = dataset.info.stats.nodes
		const wayCount = dataset.info.stats.ways
		
		// For large files, skip DuckDB sync and use worker queries directly
		// This avoids memory issues and provides better performance
		const MAX_ROADS_FOR_SYNC = 50000 // Reduced from 100K to 50K
		const isLargeFile = wayCount > MAX_ROADS_FOR_SYNC

		// For large files, skip DuckDB entirely
		if (isLargeFile) {
			console.log(`[OsmDuckDBSync] Large file detected (${wayCount.toLocaleString()} roads). Using worker queries only.`)
			setStatusMessage(`Large file (${wayCount.toLocaleString()} roads). Using direct query mode.`)
			setIsSynced(true) // Mark as ready for AI query (will use worker)
			setUseWorkerOnly(true)
			setIsSyncing(false)
			return
		}
		
		setUseWorkerOnly(false)

		try {
			const remote = getOsmRemote()
			if (!remote) {
				throw new Error('OSM remote not initialized')
			}

			const worker = remote.getWorker()
			
			// Export roads data from worker
			setStatusMessage(`Exporting ${wayCount.toLocaleString()} roads from worker...`)
			setProgress(10)
			
			let roads = await worker.exportRoadsData(dataset.osmId)
			
			if (cancelRef.current) {
				setIsSyncing(false)
				return
			}
			
			// Limit roads for large files
			if (roads.length > MAX_ROADS_FOR_SYNC) {
				setStatusMessage(`Large file detected. Sampling ${MAX_ROADS_FOR_SYNC.toLocaleString()} roads for AI Query...`)
				// Take a systematic sample to maintain distribution
				const sampleInterval = Math.ceil(roads.length / MAX_ROADS_FOR_SYNC)
				roads = roads.filter((_, index) => index % sampleInterval === 0).slice(0, MAX_ROADS_FOR_SYNC)
			}
			
			setProgress(30)
			
			// Create roads table in DuckDB with BIGINT for IDs
			setStatusMessage('Creating database table...')
			await duckdb.executeQuery(`
				CREATE OR REPLACE TABLE roads (
					id BIGINT,
					name VARCHAR,
					highway VARCHAR,
					length_meters DOUBLE,
					tags JSON
				)
			`)
			setProgress(40)

			// Insert roads data in batches
			const batchSize = 1000
			const totalBatches = Math.ceil(roads.length / batchSize)
			
			for (let i = 0; i < roads.length; i += batchSize) {
				if (cancelRef.current) {
					setIsSyncing(false)
					return
				}
				
				const batch = roads.slice(i, i + batchSize)
				const values = batch.map(r => {
					const name = r.name ? `'${r.name.replace(/'/g, "''")}'` : 'NULL'
					const highway = r.highway ? `'${r.highway}'` : 'NULL'
					const tags = JSON.stringify(r.tags).replace(/'/g, "''")
					return `(${r.id}::BIGINT, ${name}, ${highway}, ${r.length_meters}, '${tags}'::JSON)`
				}).join(',')

				await duckdb.executeQuery(`
					INSERT INTO roads VALUES ${values}
				`)
				
				const batchNum = Math.floor(i / batchSize) + 1
				const currentProgress = 40 + Math.round((batchNum / totalBatches) * 50)
				setProgress(currentProgress)
				setStatusMessage(`Inserting batch ${batchNum}/${totalBatches}...`)
			}

			// Create indexes
			setStatusMessage('Creating indexes...')
			await duckdb.executeQuery('CREATE INDEX IF NOT EXISTS idx_roads_highway ON roads(highway)')
			await duckdb.executeQuery('CREATE INDEX IF NOT EXISTS idx_roads_name ON roads(name)')
			setProgress(100)

			setIsSynced(true)
			console.log(`[OsmDuckDBSync] Synced ${roads.length} roads to DuckDB`)
			setStatusMessage(`Synced ${roads.length.toLocaleString()} roads`)
		} catch (err) {
			console.error('[OsmDuckDBSync] Failed to sync:', err)
			setError(String(err))
			setIsSynced(false)
			setStatusMessage('Sync failed')
		} finally {
			setIsSyncing(false)
		}
	}, [dataset, duckdb, isLimited])

	useEffect(() => {
		syncData()
		return () => {
			// Cancel sync on unmount
			cancelRef.current = true
		}
	}, [syncData])

	return { isSyncing, isSynced, useWorkerOnly, error, progress, statusMessage, syncData, cancelSync }
}
