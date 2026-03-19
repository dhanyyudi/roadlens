# RoadLens 🗺️

**Browser-based OSM Road Network Visualizer**

Load `.osm.pbf` files directly in your browser to visualize, inspect, and analyze OpenStreetMap road networks. No server required — everything runs client-side using Web Workers and WebAssembly.

![RoadLens Screenshot](https://via.placeholder.com/800x400/1f2937/ffffff?text=RoadLens+Screenshot)

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
Visit **[roadlens.vercel.app](https://roadlens.vercel.app)** and start visualizing immediately!

### Local Development
```bash
npm install
npm run dev
```

Open `http://localhost:5173` and drop an `.osm.pbf` file onto the map.

## 📖 How to Use

RoadLens provides **3 ways** to load OSM data:

### 1️⃣ Upload Your Own PBF File
Simply **drag & drop** your `.osm.pbf` file onto the map, or use the file picker in the sidebar.

### 2️⃣ Load Sample Data
Click **"Load Sample"** to instantly load **Denpasar, Bali** data (~5 MB). Perfect for trying out the app without downloading anything!

### 3️⃣ Download from OSM (Overpass API)
Get fresh OSM data for any area in the world:

1. Click **"Define Area of Interest"** in the sidebar
2. Go to [bboxfinder.com](http://bboxfinder.com/) to find your bounding box
3. Draw a rectangle on the map and copy the coordinates
4. Paste the bbox (format: `minLon,minLat,maxLon,maxLat`) in RoadLens
5. Click **"Download Roads"**
6. The OSM XML file will be downloaded to your computer
7. Convert to PBF using the command shown, then upload to RoadLens

**Example:** For Denpasar area, use bbox: `115.20,-8.70,115.25,-8.65`

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
- [x] Overpass API download
- [ ] Direct OSM XML to PBF conversion in browser
- [ ] Interactive bbox drawing on map
- [ ] More sample cities

## 📝 License

MIT © RoadLens Contributors

---

**Made with ❤️ for the OpenStreetMap community**
