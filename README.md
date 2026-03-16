# RoadLens

Browser-based OSM road data viewer. Load `.osm.pbf` files directly in the browser to visualize, inspect, and route on OpenStreetMap road networks.

## Features

- **PBF Loading** — Drag & drop `.osm.pbf` files, parsed entirely client-side via Web Workers
- **Road Visualization** — Color-coded highway classification (motorway, trunk, primary, etc.) with oneway arrows
- **Routing** — Click-to-route with turn-by-turn directions, distance, and estimated time
- **Node Inspection** — Traffic signals, stop signs, barriers, crossings with icon markers
- **Search** — Geocoding via Nominatim and entity search within loaded data
- **Speed Data** — CSV speed overlay support
- **Multiple Basemaps** — Dark Matter, Positron, Voyager, OSM Standard, and more

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:5173` and drop an `.osm.pbf` file onto the map.

## Deploy

Configured for Vercel. Connect the repo and it auto-deploys.

Build: `npm run build` → Output: `dist/`

## Built With

- [osmix](https://github.com/conveyal/osmix) — OSM PBF parsing, spatial indexing, and routing (MIT)
- [MapLibre GL JS](https://maplibre.org/) — Map rendering
- [React](https://react.dev/) + [Vite](https://vite.dev/) + [Tailwind CSS](https://tailwindcss.com/)
- [DuckDB-wasm](https://duckdb.org/) — In-browser SQL queries
- [Comlink](https://github.com/GoogleChromeLabs/comlink) — Web Worker communication

## License

MIT
