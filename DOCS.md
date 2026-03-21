# How OSMRoad Works 🗺️

> A beginner-friendly explanation of the magic behind browser-based OSM visualization

---

## The Big Picture

Imagine you have a **giant encyclopedia** with millions of pages about every road in the world. That's basically what an OSM PBF file is — a massive database of roads, intersections, and geographic data.

Now, the crazy part: **OSMRoad opens this encyclopedia directly in your browser**, without sending it to any server. How? Let's break it down.

---

## 1. Loading Massive Data Files (The "How is this not crashing?" Section)

### The Problem
OSM PBF files can be HUGE:
- City-level: ~50-200 MB
- Country-level: ~1-5 GB  
- Full planet: ~70+ GB

Your browser typically struggles with files larger than a few hundred MBs. So how do we handle this?

### The Solution: Smart Streaming + Indexing

Think of it like this: instead of reading the entire encyclopedia cover-to-cover, we build a **super-smart table of contents** first.

#### Step 1: Web Workers (The Helpful Assistants)

**Tech: Web Workers + Comlink**

Imagine you're a librarian, and you have **invisible helpers** (Web Workers) who work in the background. While you're showing the map to users, these helpers are:
- Parsing the PBF file
- Building indexes
- Preparing data

They work in **parallel threads** (separate from the main browser), so the map stays smooth and responsive.

#### Step 2: Streaming Parser (Reading as We Go)

**Tech: osmix library**

Instead of loading the entire file into memory (which would crash), we use a **streaming parser**:

```
Traditional way:  Download → Wait → Parse everything → Show
Our way:         Download → Parse chunk 1 → Show → Parse chunk 2 → Show...
```

It's like watching a movie while it's still downloading — you don't need the whole file to start enjoying it.

#### Step 3: Spatial Index (The GPS of Data)

**Tech: R-tree spatial indexing (via osmix)**

Imagine you have a map of Indonesia and want to find roads in Bali. Without an index, you'd have to check **every single road** in the database. With billions of roads, that's impossible!

Instead, we build an **R-tree index** — think of it as dividing the world into nested boxes:

```
World
├── Asia
│   ├── Southeast Asia
│   │   ├── Indonesia
│   │   │   ├── Bali ✨ (found it!)
│   │   │   └── Java
```

Now finding "roads near Bali" takes milliseconds instead of minutes.

#### Step 4: Vector Tiles (Only Show What's Visible)

**Tech: MapLibre GL JS + Custom Vector Tile Protocol**

When you zoom into a city, you don't need to see roads in other countries. We use **vector tiles** — we only send the roads that are actually visible on your screen right now.

It's like Google Maps: as you pan and zoom, new tiles load. But instead of downloading images, we download **raw road data** that gets rendered beautifully on your GPU.

#### Step 5: Memory Management (Don't Crash the Browser!)

**Tech: Dynamic throttling + Worker-based queries**

For **large files** (Thailand-size with 24M+ nodes, 2.8M+ roads):
- **Skip DuckDB sync** — Would use too much memory
- **Use Worker queries** — Streaming batch processing (10K roads per batch)
- **Max zoom limit** — Large files capped at zoom 12 to prevent tile overload
- **Memory monitor** — Live memory usage display with warnings

```
Small files (<50K roads):  DuckDB + SQL queries
Large files (>50K roads):  Worker streaming queries (no DuckDB)
```

---

## 2. AI-Powered Natural Language Queries (UPDATED!)

### The Problem
SQL is powerful but intimidating. Most users don't know how to write:
```sql
SELECT highway, COUNT(*) FROM roads GROUP BY highway;
```

But they CAN ask: **"How many roads of each type are there?"**

### The Solution: Natural Language to SQL (with Fallback!)

**Tech: Google Vertex AI (Gemini) + Local Parser + DuckDB-wasm/Worker Queries**

#### Architecture

```
┌─────────────┐    ┌──────────────────┐    ┌─────────────┐
│   Browser   │ →  │  Vercel Server   │ →  │ Vertex AI   │
│  (User)     │    │  (Edge Function) │    │ (Gemini)    │
└─────────────┘    └──────────────────┘    └─────────────┘
      │   ↓                                           │
      │   └─────────── Local Parser Fallback ─────────┘
      │                    ↓
      └────────────────────┘
               ↓
   ┌─────────────────────────────┐
   │ Small files: DuckDB-wasm    │
   │ Large files: Worker queries │
   └─────────────────────────────┘
```

#### How It Works

1. **User types question** (e.g., "berapa jalan tol?")
2. **Try API first**: Send to Vertex AI via Vercel Edge Function
3. **API fails?** (404, network error, etc.) → Fall back to **local parser**
4. **Generate SQL**: `SELECT COUNT(*) as total FROM roads WHERE highway = 'motorway'`
5. **Execute query**:
   - Small files: DuckDB-wasm client-side SQL
   - Large files: Worker streaming queries
6. **Highlight on map**: Results shown in amber/yellow with auto-zoom

#### Local Parser (Offline Support!)

When API unavailable, local parser handles common queries:

| User Query | SQL Generated |
|------------|---------------|
| "Berapa jalan tol?" | `SELECT COUNT(*) FROM roads WHERE highway = 'motorway'` |
| "Tampilkan jalan utama" | `SELECT * FROM roads WHERE highway = 'primary'` |
| "Total panjang jalan" | `SELECT SUM(length_meters) FROM roads` |
| "Rata-rata panjang jalan tol" | `SELECT AVG(length_meters) FROM roads WHERE highway = 'motorway'` |

**Supported query types:**
- COUNT queries — "berapa", "count", "jumlah"
- SELECT queries — "tampilkan", "show", "cari"
- AGGREGATE queries — "total", "average", "rata-rata"
- GROUP queries — "group by", "kelompokkan"

#### Bilingual Support

Both **English** and **Indonesian** are supported:

| English | Indonesian | SQL Generated |
|---------|-----------|---------------|
| "How many motorways?" | "Berapa jalan tol?" | `SELECT COUNT(*) FROM roads WHERE highway = 'motorway'` |
| "Show primary roads" | "Tampilkan jalan utama" | `SELECT * FROM roads WHERE highway = 'primary'` |
| "Average road length" | "Rata-rata panjang jalan" | `SELECT AVG(length_meters) FROM roads` |
| "Total length of roads" | "Total panjang jalan" | `SELECT SUM(length_meters) FROM roads` |

#### Smart Query Detection

The system detects query types and shows appropriate responses:
- **COUNT** → Shows number (e.g., "Ditemukan 15 jalan tol")
- **AGGREGATE** → Shows statistics (e.g., "avg_length: 1,234m")
- **SELECT** → Highlights roads on map + auto-zoom

#### Worker-Based Queries for Large Files

For large files (>50K roads), we skip DuckDB and use worker streaming:

```typescript
// Process in batches to avoid memory issues
for (let i = 0; i < roads.length; i += batchSize) {
  const batch = roads.slice(i, i + batchSize)
  const filtered = batch.filter(road => matchesFilter(road, filter))
  results.push(...filtered)
  
  // Yield control for UI updates
  if (batchNumber % 10 === 0) {
    await new Promise(resolve => setTimeout(resolve, 0))
  }
}
```

This allows querying files with millions of roads without crashing!

---

## 3. Routing (Finding the Best Path)

### The Problem
You click two points on the map. How does the app find the shortest/fastest route between them through potentially millions of roads?

### The Solution: Dijkstra's Algorithm + Graph Theory

#### First, We Build a Graph

Think of roads as **edges** and intersections as **nodes**:

```
    A ---- B
    |      |
    C ---- D ---- E
```

Each road segment knows:
- How long it is (distance)
- What type (highway, residential, etc.)
- Speed limit
- One-way or not

#### Then, Dijkstra's Algorithm Finds the Way

**Tech: osmix built-in routing**

Imagine you're at point A and want to get to E. Dijkstra's algorithm works like this:

1. Start at A. Mark distance = 0
2. Look at all neighbors (B and C). Record distances
3. Go to the closest unvisited node (say, B)
4. From B, check its neighbors. If going through B to D is shorter than current known path, update it
5. Repeat until reaching E

It's like **spreading water** from the start point — it flows through all possible paths simultaneously, always taking the easiest route first.

#### Why It's Fast

Thanks to our **spatial index**, we don't search the whole world:
1. Find roads near start point (fast with R-tree)
2. Find roads near end point
3. Run Dijkstra only in that area

Instead of checking millions of roads, we might only check thousands.

---

## 4. Cursor Coordinates & Street View

### The Problem
Users want to know exact coordinates and see Street View of locations.

### The Solution: Real-time Coordinate Display + Google Maps Integration

#### Cursor Coordinates

As you move your mouse over the map:
1. MapLibre converts **screen pixel** → **latitude/longitude** using `map.unproject()`
2. Display updates in real-time at bottom-left corner
3. Throttled to ~30fps for performance

#### Street View Integration

When you click a road:
1. Store the click coordinate (lat/lon) in `SelectedEntity`
2. Inspect panel shows coordinate with **Copy** button
3. **"Open Street View"** button generates Google Maps URL:
   ```
   https://www.google.com/maps/@lat,lon,3a,75y,0h,90t
   ```
4. Opens in new tab (not embedded — respects Google ToS)

---

## 5. Tag Editing (The "Save Changes" Feature)

### The Problem
OSM data is just a bunch of "tags" (key-value pairs) on roads and nodes:
```
highway=primary
name=Jalan Sudirman
maxspeed=60
oneway=yes
```

How do we let users edit these and save them back?

### The Solution: In-Memory Modification + PBF Export

**Tech: Zustand (state management) + osmix PBF writer**

#### Step 1: Track Changes in Memory

When you click a road or node and edit its name, we don't modify the original file. Instead, we:
1. Keep the original data in memory
2. Store your changes separately ("diffs")
3. Show the merged result on the map

Think of it like **track changes in Word** — the original document stays intact, but you see your edits overlaid.

#### Step 2: Export Modified PBF

When you click "Export," we:
1. Take the original PBF data
2. Apply all your changes
3. Write a brand new PBF file
4. Download it to your computer

**Tech stack:**
- **Zustand**: Remembers what you changed
- **osmix**: Knows how to write PBF format
- **ArrayBuffer**: Efficient binary data handling

---

## 6. Overpass API Integration (Fresh OSM Data)

### The Problem
What if users want data for an area they don't have a PBF file for?

### The Solution: Live Query from OpenStreetMap

**Tech: Overpass API + OSM XML Parser**

#### How It Works

1. You draw a rectangle on the map
2. We convert that to coordinates (bounding box)
3. Send query to Overpass API: "Give me all roads in this box"
4. Receive OSM XML response
5. Parse XML → Convert to GeoJSON → Load on map

#### The Query Looks Like This

```
[out:xml];
way["highway"](south,west,north,east);
out geom;
```

Translation: "Find all ways with a 'highway' tag within these coordinates, and include their geometry."

#### Why 10km² Limit?

Overpass API is a free public service. If everyone downloaded country-sized data, it would crash. So we limit to ~10km² (about the size of a medium city district) to be nice to the servers.

---

## 7. SQL Queries with DuckDB (The Power User Feature)

### The Problem
Power users want to ask complex questions:
- "Show me all primary roads longer than 5km"
- "Find intersections with traffic lights"
- "Average road length by type"

### The Solution: DuckDB-wasm (for small files)

**Tech: DuckDB-wasm (SQLite for the browser)**

DuckDB is like **Excel on steroids** that runs entirely in your browser. It can:
- Query millions of rows in milliseconds
- Run complex SQL queries
- Join, filter, aggregate data

#### How We Use It

1. Load OSM data into DuckDB as tables (`roads`, `nodes`)
2. User writes SQL query (or AI generates it)
3. DuckDB executes it at native speed (WebAssembly)
4. Results display on the map with highlight

#### Example Query

```sql
SELECT name, length_meters 
FROM roads 
WHERE highway = 'primary' 
  AND length_meters > 5000
ORDER BY length_meters DESC;
```

Translation: "Show me primary roads longer than 5km, sorted by length."

#### Worker Queries for Large Files

For files >50K roads, we skip DuckDB (would use too much memory):
- Export roads from worker
- Process in streaming batches (10K per batch)
- Supports COUNT, FILTER, AGGREGATE operations

---

## 8. Highlighting Query Results on Map

### The Problem
After a query returns road IDs, how do we highlight them visually?

### The Solution: MapLibre Feature State

**Tech: MapLibre GL JS Feature State**

Instead of recreating layers (slow), we use **feature state**:

```javascript
// Mark a road as highlighted
map.setFeatureState(
  { source, sourceLayer, id: zigzag(roadId) },
  { highlighted: true }
)
```

Then in the style expression:
```javascript
"line-color": [
  "case",
  ["boolean", ["feature-state", "highlighted"], false],
  "#fbbf24",  // Amber for highlighted
  roadColorExpression  // Default color
]
```

**Benefits:**
- No layer recreation → 60fps smooth
- Instant color change
- Easy to clear (just remove feature state)

### Auto-Zoom

When SELECT query returns results:
1. Get geometries of all matching roads
2. Calculate bounding box (min/max lat/lon)
3. `map.fitBounds()` with padding

---

## 9. File Upload Lock (Prevent User Errors)

### The Problem
Users might try to load multiple files simultaneously, causing:
- Memory overflow
- Confusing UI state
- Worker conflicts

### The Solution: Single File Mode

**Tech: UI state management**

Once a file is loaded:
- Upload controls are **disabled**
- Visual warning banner: "File upload locked — Refresh page to load new file"
- All upload methods blocked (drag-drop, sample data, Overpass)

This ensures one file at a time, preventing memory and state issues.

---

## Tech Stack Summary

| Problem | Solution | Tech Used |
|---------|----------|-----------|
| **Parsing huge files** | Streaming parser + Web Workers | osmix, Comlink |
| **Fast spatial queries** | R-tree spatial index | osmix built-in |
| **Smooth map rendering** | Vector tiles + GPU acceleration | MapLibre GL JS |
| **Finding routes** | Graph algorithms | osmix routing (Dijkstra) |
| **Remembering edits** | State management | Zustand |
| **Exporting PBF** | Binary file writing | osmix PBF writer |
| **Fresh OSM data** | API queries | Overpass API |
| **Large file queries** | Streaming batch processing | Worker queries |
| **Small file queries** | In-browser database | DuckDB-wasm |
| **Natural language queries** | NL2SQL + Local Parser | Vertex AI + Rule-based |
| **Worker communication** | Simplified RPC | Comlink |
| **Coordinate display** | Real-time projection | MapLibre unproject |
| **Memory management** | Dynamic throttling | Memory monitor, query routing |

---

## Why This Architecture?

### The Philosophy: Client-First

Most mapping apps work like this:
```
Browser → Server → Database → Response
   ↑______________|
        (slow!)
```

OSMRoad works like this:
```
Browser → Local processing → Done!
   ↑______________|
        (fast!)
```

By doing everything in the browser:
- ✅ **Privacy**: Your data never leaves your computer
- ✅ **Speed**: No network latency
- ✅ **Offline**: Works without internet after initial load
- ✅ **Free**: No server costs to pay
- ✅ **Scalable**: Can handle files with millions of roads

### The Trade-offs

Of course, there are downsides:
- ❌ **Limited by device RAM** (can't load planet-sized files)
- ❌ **Initial load can be slow** (download big PBF first)
- ❌ **Safari has limitations** (no SharedArrayBuffer support)
- ❌ **AI queries need fallback** (API might be unavailable)

But for most use cases — analyzing city or regional OSM data — it's perfect.

---

## Conclusion

OSMRoad is essentially a **mini-GIS workstation** that runs in your browser. It combines:
- Database indexing (R-trees)
- Graph algorithms (routing)
- Binary parsing (PBF)
- SQL processing (DuckDB + Worker queries)
- Natural language processing (Vertex AI + Local parser)
- GPU rendering (MapLibre)
- Memory management (Dynamic throttling)

All working together to let you explore OpenStreetMap data without installing anything or paying for servers.

The magic is in **smart data structures** (not loading everything at once) and **modern web tech** (WebAssembly, Web Workers, AI APIs) that make the browser way more powerful than most people realize.

---

**Want to dig deeper?** Check the source code in `src/` — it's organized by feature and heavily commented!
