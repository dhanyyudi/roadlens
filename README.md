# OSMRoad 🗺️

**Browser-based OSM Road Network Visualizer — Visualize, inspect, and analyze OpenStreetMap road networks**

Load `.osm.pbf` files directly in your browser to visualize, inspect, and analyze OpenStreetMap road networks. No server required — everything runs client-side using Web Workers and WebAssembly.

<!-- GIF Demo - Upload to GitHub Releases or Imgur and replace URL below -->
<!-- Current file: public/gif/osmroad.gif (147MB - too large for repo) -->
<!-- Compress to <10MB or host externally -->

![OSMRoad Demo](https://via.placeholder.com/800x450/1f2937/3b82f6?text=Demo+GIF+-+Upload+to+GitHub+Releases+or+Imgur)

<details>
<summary>🎬 View Demo GIF (click to expand)</summary>

<!-- TODO: Replace with actual GIF URL -->
<!-- Upload compressed GIF (<10MB) to: -->
<!-- Option 1: GitHub Releases (recommended) -->
<!-- Option 2: Imgur -->
<!-- Option 3: Giphy -->
<!-- Then update URL below: -->

<!-- ![Demo](YOUR_GIF_URL_HERE) -->

**To view demo:**
1. Visit [osmroad.vercel.app](https://osmroad.vercel.app)
2. Click "Try Sample Data" to see it in action!

</details>

## 🌟 Features

### Core
- **📁 PBF File Loading** — Drag & drop `.osm.pbf` files, parsed entirely client-side via Web Workers
- **🛣️ Road Visualization** — Color-coded highway classification (motorway, trunk, primary, secondary, etc.) with oneway arrows
- **🔍 Interactive Inspection** — Click any road to view detailed OSM tags and properties
- **🚦 Node Markers** — Traffic signals, stop signs, barriers, crossings with intuitive icons

### Analysis
- **🧭 Routing** — Click-to-route with turn-by-turn directions, distance, and estimated time
- **🔎 Search** — Geocoding via Nominatim and entity search within loaded data
- **🚫 Access Restrictions** — Visualize motor_vehicle=no, access=no, and barriers
- **⚡ Speed Data** — CSV speed overlay support for traffic analysis

### Data
- **✏️ Tag Editing** — Edit OSM tags directly in the browser
- **📤 Export** — Download edited data back to PBF format
- **🗺️ Multiple Basemaps** — Dark Matter, Positron, Voyager, OSM Standard, and more

## 🚀 Quick Start

### Online (Recommended)
Visit **[osmroad.vercel.app](https://osmroad.vercel.app)** and start visualizing immediately!

### Local Development
```bash
npm install
npm run dev
```

Open `http://localhost:5173` and drop an `.osm.pbf` file onto the map.

## 📖 How to Use

OSMRoad provides **3 ways** to load OSM data:

### 1️⃣ Upload Your Own PBF File
Simply **drag & drop** your `.osm.pbf` file onto the map, or use the file picker in the sidebar.

### 2️⃣ Load Sample Data
Click **"Load Sample"** to instantly load **Denpasar, Bali** data (~5 MB). Perfect for trying out the app without downloading anything!

### 3️⃣ Download from OSM (Overpass API)
Get fresh OSM road data for any area in the world:

1. Click **"Draw Area on Map"** in the sidebar
2. **Click and drag** on the map to draw a rectangle around your area of interest
3. Click **"Download & Load"** — data will be fetched from Overpass API and loaded automatically!

**Tips:**
- Smaller areas (~2-5 km²) load faster
- Maximum area: 10 km² (to prevent timeout)
- Data includes roads only (filtered for efficiency)

**Example:** Try drawing a small rectangle around Kuta, Bali or your neighborhood!

## 🛠️ Tech Stack

- **[osmix](https://github.com/conveyal/osmix)** — OSM PBF parsing, spatial indexing, and routing (MIT)
- **[MapLibre GL JS](https://maplibre.org/)** — Map rendering with vector tiles
- **[React](https://react.dev/)** — UI framework
- **[Vite](https://vite.dev/)** — Build tool
- **[Tailwind CSS](https://tailwindcss.com/)** — Styling
- **[DuckDB-wasm](https://duckdb.org/)** — In-browser SQL queries
- **[Comlink](https://github.com/GoogleChromeLabs/comlink)** — Web Worker communication

## 🚧 Roadmap

- [x] OSM PBF file loading & visualization
- [x] Road network rendering with classification
- [x] Interactive routing with directions
- [x] Tag inspection and editing
- [x] Export to PBF
- [x] Sample Data (Denpasar, Bali)
- [x] Overpass API download with interactive bbox drawing
- [x] Direct OSM XML to GeoJSON conversion in browser
- [ ] More sample cities (Jakarta, Surabaya, etc.)
- [ ] Area size preview before download
- [ ] Download history/cache

## 📝 License

MIT © OSMRoad Contributors

---

**Made with ❤️ for the OpenStreetMap community**
