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

---

## 2. Routing (Finding the Best Path)

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

## 3. Tag Editing (The "Save Changes" Feature)

### The Problem
OSM data is just a bunch of "tags" (key-value pairs) on roads:
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

When you click a road and edit its name, we don't modify the original file. Instead, we:
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

## 4. Overpass API Integration (Fresh OSM Data)

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

## 5. SQL Queries with DuckDB (The Power User Feature)

### The Problem
Power users want to ask complex questions:
- "Show me all primary roads longer than 5km"
- "Find intersections with traffic lights"
- "Average road length by type"

### The Solution: DuckDB-wasm

**Tech: DuckDB-wasm (SQLite for the browser)**

DuckDB is like **Excel on steroids** that runs entirely in your browser. It can:
- Query millions of rows in milliseconds
- Run complex SQL queries
- Join, filter, aggregate data

#### How We Use It

1. Load OSM data into DuckDB as tables
2. User writes SQL query
3. DuckDB executes it at native speed (WebAssembly)
4. Results display on the map

#### Example Query

```sql
SELECT name, ST_Length(geometry) as length 
FROM roads 
WHERE highway = 'primary' 
  AND length > 5000
ORDER BY length DESC;
```

Translation: "Show me primary roads longer than 5km, sorted by length."

#### Why WebAssembly?

DuckDB is written in C++. WebAssembly lets us run C++ code in the browser at **near-native speed** — about 10-50x faster than JavaScript for heavy data processing.

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
| **Complex SQL queries** | In-browser database | DuckDB-wasm |
| **Worker communication** | Simplified RPC | Comlink |

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

### The Trade-offs

Of course, there are downsides:
- ❌ **Limited by device RAM** (can't load planet-sized files)
- ❌ **Initial load can be slow** (download big PBF first)
- ❌ **Safari has limitations** (no SharedArrayBuffer support)

But for most use cases — analyzing city or regional OSM data — it's perfect.

---

## Conclusion

OSMRoad is essentially a **mini-GIS workstation** that runs in your browser. It combines:
- Database indexing (R-trees)
- Graph algorithms (routing)
- Binary parsing (PBF)
- SQL processing (DuckDB)
- GPU rendering (MapLibre)

All working together to let you explore OpenStreetMap data without installing anything or paying for servers.

The magic is in **smart data structures** (not loading everything at once) and **modern web tech** (WebAssembly, Web Workers) that make the browser way more powerful than most people realize.

---

**Want to dig deeper?** Check the source code in `src/` — it's organized by feature and heavily commented!
