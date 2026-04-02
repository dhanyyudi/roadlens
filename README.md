# OSMRoad

**Browser-based OSM Road Network Visualizer — Visualize, inspect, and analyze OpenStreetMap road networks**

Load `.osm.pbf` files directly in your browser. No server required — everything runs client-side using Web Workers and WebAssembly.

Visit **[osmroad.vercel.app](https://osmroad.vercel.app)** to try it now.

![OSMRoad Demo](https://github.com/user-attachments/assets/a836701b-3234-41b0-b67a-c2d8a7e89abc)

---

## Features

### Core Map

- **PBF File Loading** — Drag & drop `.osm.pbf` files, parsed entirely client-side via Web Workers
- **Road Visualization** — Color-coded highway classification (motorway → track) with oneway arrows and dashed lines
- **Node Markers** — Traffic signals, stop signs, barriers, crossings with icons
- **7 Basemaps** — Dark Matter, Positron, Voyager, OSM Standard, Dark, Light, No Basemap (auto light/dark theme)
- **Cursor Coordinates** — Real-time lat/lon at bottom-left as you move the cursor
- **Geocoding Search** — Search places via Nominatim or enter `lat,lon` directly to fly to location
- **Street View** — Click any road/node → Inspect panel → "Open Street View" opens Google Maps in new tab

### Analysis

- **AI Query Assistant** — Ask questions in natural language (English/Indonesian). Bilingual, works offline with local parser fallback
- **Turn-by-Turn Routing** — Click two points to route; shows distance, time, and road segments
- **Entity Search** — Search by ID (`way/123`, `node/456`) or tag value (`highway=primary`)
- **Access Restrictions Layer** — Visualize `motor_vehicle=no`, `access=no`, barriers
- **Speed Data Overlay** — Load CSV speed data for traffic analysis
- **Overpass API** — Draw bbox on map and fetch live OSM data from Overpass API

### Editing & Export

- **Tag Editing** — Edit OSM tags for nodes and ways directly in the browser
- **PBF Export** — Download edited data back to `.osm.pbf` format
- **Layer Toggle** — Show/hide roads, nodes, restrictions, access layers

### Performance & Memory

- **Smart Render Strategy** — Automatically selects full-vector / hybrid / raster render mode based on file size
- **Memory Monitor** — Live memory usage with warnings at >80%
- **File Upload Lock** — One file at a time to prevent memory issues
- **Large File Support** — Files with 24M+ nodes handled via raster preview + vector tiles at high zoom

### Mobile

- **Responsive Layout** — Full-screen map on mobile with floating controls
- **Bottom Sheet** — Draggable iOS-style panel (snap at 40%, 70%, 92%)
- **Auto-Open on Click** — Tap a road → Inspect panel opens automatically (no need to open menu first)
- **Mobile Controls** — Zoom +/-, geolocation, layers toggle at bottom-right
- **Compact Basemap Switcher** — Icon + label button on mobile, full grid on desktop

---

## Quick Start

### Online

Visit **[osmroad.vercel.app](https://osmroad.vercel.app)**

### Local Development

```bash
npm install
npm run dev
# Open http://localhost:5173
```

---

## How to Use

### Loading OSM Data

Three ways to load data:

1. **Upload PBF** — Drag & drop `.osm.pbf` onto the map, or use the File panel
2. **Sample Data** — Load built-in samples: Bali (~14MB), Singapore (~14MB), Taipei (~71MB)
3. **Overpass API** — Draw a bounding box on the map → fetch live data from OSM

> Large files (>50K roads) skip DuckDB sync and use worker-based streaming queries instead.

### AI Query Assistant

1. Load OSM data and wait for it to be ready
2. Click the **Sparkles (AI)** icon in the sidebar
3. Ask in English or Indonesian:
   - `"How many motorways?"` / `"Berapa jalan tol?"`
   - `"Show primary roads longer than 5km"`
   - `"Total panjang semua jalan"`
   - `"Average length of residential roads"`
4. SELECT results are highlighted amber on the map with auto-zoom

### Inspecting Roads & Nodes

- **Desktop**: Click any road or node → Inspect panel opens in sidebar
- **Mobile**: Tap any road or node → bottom sheet opens automatically at 40% height (drag up for more)
- Panel shows: type, ID, all OSM tags, coordinate (with copy), Street View button

### Routing

1. Open the **Route** panel
2. Click "Set Start" then click a point on the map
3. Click "Set End" then click another point
4. Route renders with distance and estimated time

---

## AI Query Details

The AI assistant uses a two-step fallback:

```
User query
    ↓
Try Vertex AI API (/api/ai/query)
    ↓ fails (404 / offline)
Local NL2SQL parser (offline)
    ↓
Execute on:
  Small files (<50K roads)  → DuckDB-wasm
  Large files (>50K roads)  → Worker streaming (10K batches)
    ↓
Highlight results on map
```

Supported query types: COUNT, SELECT, AGGREGATE, GROUP BY — in English and Indonesian.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI | React 19 + Tailwind CSS v4 |
| Map | MapLibre GL JS 5.x |
| State | Zustand |
| Build | Vite 6 |
| OSM parsing | osmix + Comlink (Web Workers) |
| SQL queries | DuckDB-wasm |
| AI / NL2SQL | Google Vertex AI (Gemini 2.5 Flash) + local fallback |
| Deployment | Vercel (static + serverless function) |
| PWA | vite-plugin-pwa + Workbox |

---

## Environment Variables (optional)

Server-side only (Vercel):

```
GOOGLE_SERVICE_ACCOUNT_JSON   Vertex AI service account credentials
GOOGLE_CLOUD_PROJECT          GCP project ID
VERTEX_AI_LOCATION            Vertex AI region (default: us-central1)
VERTEX_AI_MODEL               Model name (default: gemini-2.5-flash)
```

Without these, the app uses the local NL2SQL parser — all features still work.

Legacy aliases `GOOGLE_PROJECT_ID` and `GOOGLE_LOCATION` are still supported for older setups, but `GOOGLE_CLOUD_PROJECT` and `VERTEX_AI_LOCATION` are the preferred names.

---

## License

MIT © OSMRoad Contributors
