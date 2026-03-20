import { useEffect, useState } from "react"
import * as duckdb from "@duckdb/duckdb-wasm"
import { isFullMode } from "../lib/browser-support"
import eh_worker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url"
import mvp_worker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url"
import duckdb_wasm_eh from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url"
import duckdb_wasm from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url"

const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
	mvp: {
		mainModule: duckdb_wasm,
		mainWorker: mvp_worker,
	},
	eh: {
		mainModule: duckdb_wasm_eh,
		mainWorker: eh_worker,
	},
}

// Singleton DuckDB client (runs on main thread, DuckDB manages its own worker internally)
let _db: duckdb.AsyncDuckDB | null = null
let _conn: duckdb.AsyncDuckDBConnection | null = null
let _initPromise: Promise<DuckDBClient> | null = null

export interface DuckDBClient {
	loadSpeedmapCSV(buffer: ArrayBuffer, fileName: string): Promise<void>
	getStats(): Promise<{
		totalRows: number
		uniqueWays: number
		minSpeed: number
		maxSpeed: number
		avgSpeed: number
	} | null>
	getSpeedForWays(
		wayIds: number[],
	): Promise<
		Array<{
			wayId: number
			timeband: number
			speed: number
			multiplier: number
		}>
	>
	getTimebands(): Promise<number[]>
	// For AI Query feature
	executeQuery(sql: string): Promise<{ rows: unknown[]; schema: unknown; error?: string }>
}

const client: DuckDBClient = {
	async loadSpeedmapCSV(buffer: ArrayBuffer, fileName: string) {
		if (!_db || !_conn) throw new Error("DuckDB not initialized")

		const filePath = `/${fileName}`
		await _db.registerFileBuffer(filePath, new Uint8Array(buffer))

		await _conn.query(`
			CREATE OR REPLACE TABLE speedmap AS
			SELECT
				column0::BIGINT AS way_id,
				column1::INT AS timeband,
				column2::DOUBLE AS speed,
				column3::DOUBLE AS multiplier
			FROM read_csv('${filePath}',
				header=false,
				columns={'column0': 'BIGINT', 'column1': 'INT', 'column2': 'DOUBLE', 'column3': 'DOUBLE'},
				auto_detect=false
			)
		`)

		await _conn.query(
			`CREATE INDEX IF NOT EXISTS idx_speedmap_way ON speedmap(way_id)`,
		)
	},

	async getStats() {
		if (!_conn) throw new Error("DuckDB not initialized")

		const result = await _conn.query(`
			SELECT
				COUNT(*)::INT AS total_rows,
				COUNT(DISTINCT abs(way_id))::INT AS unique_ways,
				MIN(speed)::DOUBLE AS min_speed,
				MAX(speed)::DOUBLE AS max_speed,
				AVG(speed)::DOUBLE AS avg_speed
			FROM speedmap
		`)

		const row = result.get(0)
		if (!row) return null

		return {
			totalRows: Number(row.total_rows),
			uniqueWays: Number(row.unique_ways),
			minSpeed: Number(row.min_speed),
			maxSpeed: Number(row.max_speed),
			avgSpeed: Number(row.avg_speed),
		}
	},

	async getSpeedForWays(wayIds: number[]) {
		if (!_conn || wayIds.length === 0) return []

		const idList = wayIds.flatMap((id) => [id, -id]).join(",")
		const result = await _conn.query(`
			SELECT way_id::BIGINT AS way_id, timeband::INT AS timeband,
				   speed::DOUBLE AS speed, multiplier::DOUBLE AS multiplier
			FROM speedmap
			WHERE way_id IN (${idList})
		`)

		const rows: Array<{
			wayId: number
			timeband: number
			speed: number
			multiplier: number
		}> = []
		for (let i = 0; i < result.numRows; i++) {
			const row = result.get(i)
			if (!row) continue
			rows.push({
				wayId: Number(row.way_id),
				timeband: Number(row.timeband),
				speed: Number(row.speed),
				multiplier: Number(row.multiplier),
			})
		}
		return rows
	},

	async getTimebands() {
		if (!_conn) return []
		const result = await _conn.query(`
			SELECT DISTINCT timeband::INT AS timeband FROM speedmap ORDER BY timeband
		`)
		const bands: number[] = []
		for (let i = 0; i < result.numRows; i++) {
			const row = result.get(i)
			if (row) bands.push(Number(row.timeband))
		}
		return bands
	},

	async executeQuery(sql: string) {
		if (!_conn) {
			return { rows: [], schema: null, error: 'DuckDB not initialized' }
		}
		
		try {
			const result = await _conn.query(sql)
			const rows: unknown[] = []
			for (let i = 0; i < result.numRows; i++) {
				const row = result.get(i)
				if (row) rows.push(row)
			}
			return { rows, schema: result.schema }
		} catch (err: any) {
			return { rows: [], schema: null, error: err.message || 'Query execution failed' }
		}
	},
}

async function initDuckDB(): Promise<DuckDBClient | null> {
	// Skip initialization in limited mode (Safari)
	// DuckDB requires SharedArrayBuffer which is not available
	if (!isFullMode()) {
		return null
	}

	if (_conn) return client
	if (_initPromise) return _initPromise

	_initPromise = (async () => {
		const bundle = await duckdb.selectBundle(MANUAL_BUNDLES)
		const worker = new Worker(bundle.mainWorker!)
		const logger = new duckdb.ConsoleLogger()
		_db = new duckdb.AsyncDuckDB(logger, worker)
		await _db.instantiate(bundle.mainModule, bundle.pthreadWorker)
		_conn = await _db.connect()
		return client
	})()

	return _initPromise
}

export function useDuckDB() {
	const [duckClient, setDuckClient] = useState<DuckDBClient | null>(
		isFullMode() && _conn ? client : null,
	)
	const [error, setError] = useState<string | null>(null)
	const [isLimited, setIsLimited] = useState(!isFullMode())

	useEffect(() => {
		// In limited mode, skip DuckDB initialization entirely
		if (!isFullMode()) {
			setIsLimited(true)
			setDuckClient(null)
			return
		}

		initDuckDB()
			.then((client) => {
				setDuckClient(client)
				setIsLimited(false)
			})
			.catch((err) => setError(String(err)))
	}, [])

	return { duckdb: duckClient, error, isLimited }
}
