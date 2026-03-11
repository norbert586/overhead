# Overhead — Technical Context for Claude

## What This App Is

**Overhead** is a local-first aircraft proximity detection and intelligence logging system. It passively monitors nearby aircraft in real-time by polling ADS-B transponder data, enriches each sighting with aircraft registry and route intelligence from public APIs, and presents everything as a chronological feed designed to feel like an instrument panel — not a map dashboard.

The user sets their lat/lon. The app watches the sky around them and logs every aircraft that passes overhead.

---

## Architecture

```
ADS-B Source (adsb.lol)
  → Ingestion Thread (polls every 12s)
    → Enrichment (aircraft registry + route lookup → adsbdb.com)
      → Event Deduplication & Logging
        → Classification Thread (background, every 30s)
          → SQLite Database
            → Flask REST API (~40 endpoints)
              → React 19 Frontend (Vite)
```

**Concurrency model:** Two Python daemon threads run inside a single Gunicorn worker (intentional — SQLite cannot handle concurrent writers). The ingestion thread polls ADS-B data and writes to the database. The classification thread reads unclassified flights and updates them. The Flask app serves the frontend and API in the same process.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.10+, Flask 3.0, SQLite |
| Frontend | React 19, Vite 7, Leaflet 1.9 |
| External APIs | adsb.lol, adsbdb.com, OpenFlights, Planespotters |
| Production | Docker, Docker Compose, Gunicorn (1 worker) |
| Dev | `concurrently` runs both services from root `npm run dev` |

---

## Directory Structure

```
overhead/
├── package.json               # Root: npm run dev runs both services via concurrently
├── docker-compose.yml         # Production container config
├── Dockerfile                 # Multi-stage: Node (frontend build) → Python runtime
├── CLAUDE.md                  # This file
│
├── backend/
│   ├── requirements.txt       # Flask, requests, python-dotenv, flask-cors, gunicorn
│   ├── .env.example           # Template for environment config
│   ├── wsgi.py                # Gunicorn entry point
│   ├── migrate_airports.py    # One-time script: populates airports table from OpenFlights
│   └── app/
│       ├── __init__.py
│       ├── main.py            # Flask app factory, thread startup, dev entry point
│       ├── config.py          # Loads .env vars into a Config object
│       ├── db.py              # Schema, init_db(), log_flight(), classify logic, cache mgmt
│       ├── ingest.py          # Polling loop: adsb.lol → enrich → log_flight()
│       ├── enrich.py          # HTTP wrappers for adsbdb.com (aircraft + callsign lookups)
│       ├── classifier.py      # Background thread: classifies unclassified flight rows
│       └── api.py             # All Flask route handlers (~40 endpoints)
│
└── frontend/
    ├── package.json           # React, Vite, Leaflet
    ├── vite.config.js         # Dev proxy: /api/* → localhost:8080
    ├── index.html
    └── src/
        ├── main.jsx           # React entry point
        ├── App.jsx            # Main feed: live flights, search, keyboard nav, photos
        ├── App.css
        ├── Stats.jsx          # Statistics dashboard (summary, charts, tables, map)
        ├── RouteMap.jsx       # Leaflet map: routes with frequency-weighted lines
        └── RouteMap.css
```

---

## Environment Variables

Stored in `backend/.env` (copy from `.env.example`). All config is location-based — multiple instances in different locations just need different `.env` files.

| Variable | Default | Purpose |
|---|---|---|
| `ME_LAT` | `42.7077` | Observer latitude (decimal degrees) |
| `ME_LON` | `-83.0315` | Observer longitude (decimal degrees) |
| `RADIUS_NM` | `50` | Detection radius in nautical miles |
| `POLL_SECONDS` | `12` | ADS-B polling interval |
| `EVENT_WINDOW_MINUTES` | `20` | Gap before same aircraft logs as new event |
| `DB_PATH` | `./data/flight_log.db` | SQLite database file path |

Loaded via `python-dotenv` in `config.py`.

**Docker:** These are set as environment variables in `docker-compose.yml` instead of a `.env` file.

---

## Database Schema

Auto-created by `init_db()` in `db.py` on first run. SQLite file at `DB_PATH`.

### `flights` — Main event log

```sql
CREATE TABLE flights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    seen_at TEXT,              -- ISO UTC timestamp of this sighting
    hex TEXT,                  -- ICAO hex code (unique aircraft identifier)
    reg TEXT,                  -- Registration/tail number (e.g. N12345)
    callsign TEXT,             -- Flight callsign (e.g. DAL123)
    type_code TEXT,            -- ICAO type code (e.g. B738, C172)
    model TEXT,                -- Model name (e.g. "Boeing 737-800")
    manufacturer TEXT,
    country TEXT,              -- Registered country name
    country_iso TEXT,          -- ISO country code
    owner TEXT,                -- Registered owner
    airline_name TEXT,         -- Airline from callsign lookup
    origin_iata TEXT,
    origin_name TEXT,
    dest_iata TEXT,
    dest_name TEXT,
    altitude_ft REAL,
    ground_speed_kt REAL,
    distance_nm REAL,          -- Distance from observer at time of sighting
    heading_deg REAL,
    event_key TEXT,            -- Dedup key: "{hex}|{reg}|{callsign}"
    first_seen TEXT,           -- ISO UTC timestamp
    last_seen TEXT,            -- ISO UTC timestamp
    times_seen INTEGER DEFAULT 1,  -- How many times this event was updated
    classification TEXT        -- commercial | private | cargo | government | unknown
);
```

### `aircraft_cache` — Registry data cache

```sql
CREATE TABLE aircraft_cache (
    reg TEXT PRIMARY KEY,
    type_code TEXT, model TEXT, manufacturer TEXT,
    owner TEXT, country TEXT, country_iso TEXT,
    updated_at TEXT
);
```

### `callsign_cache` — Route/airline data cache

```sql
CREATE TABLE callsign_cache (
    callsign TEXT PRIMARY KEY,
    airline_name TEXT,
    origin_iata TEXT, origin_name TEXT,
    dest_iata TEXT, dest_name TEXT,
    updated_at TEXT
);
```

### `airports` — Reference data for route map

```sql
CREATE TABLE airports (
    iata_code TEXT PRIMARY KEY,
    name TEXT, city TEXT, country TEXT,
    latitude REAL, longitude REAL
);
```

Populated by `migrate_airports.py` (one-time, from OpenFlights CSV). ~7,000 airports.

**Migrations:** Lightweight ALTER TABLE checks in `db.py` add missing columns safely (e.g., `classification` was added post-initial-release).

---

## Data Flow in Detail

### 1. Ingestion (`ingest.py`)

Runs in a daemon thread. Every `POLL_SECONDS` (default 12):

1. `GET https://api.adsb.lol/v2/closest/{lat}/{lon}/{radius_nm}`
2. Returns the **single nearest aircraft** with: `hex`, `r` (reg), `flight` (callsign), `t` (type_code), `alt_baro`, `gs`, `dst`, `track`
3. Enriches with aircraft registry data (by reg) → check `aircraft_cache` first, else hit `adsbdb.com/v0/aircraft/{reg}`
4. Enriches with route data (by callsign) → check `callsign_cache` first, else hit `adsbdb.com/v0/callsign/{callsign}`
5. Calls `log_flight()` in `db.py`

### 2. Event Deduplication (`db.py` → `log_flight()`)

`event_key = "{hex}|{reg}|{callsign}"`

- Find most recent row in `flights` with same `event_key`
- If found AND `(now - last_seen) >= EVENT_WINDOW_MINUTES`: create a NEW row (carry over `times_seen + 1`)
- Else: UPDATE existing row — refresh `last_seen`, `seen_at`, and telemetry fields (altitude, speed, distance)

This means the database accumulates distinct "passes" — same aircraft flying over multiple times on different days each gets its own row, but a continuous single pass updates one row.

### 3. Classification (`classifier.py`)

Background thread, every 30 seconds. Processes up to 250 rows with NULL/empty/`unknown` classification.

Priority order (first match wins):

1. **Government/Military** — owner keywords (`air force`, `navy`, `army`, `coast guard`, `government`...) OR callsign prefixes (`RCH`, `SAM`, `SPAR`, `REACH`, `EVAC`, `MEDEVAC`...)
2. **Commercial** — has `airline_name` from callsign lookup (excluding cargo carriers)
3. **Cargo** — cargo keywords (`cargo`, `freight`, `express`, `fedex`, `ups`...) OR cargo aircraft ICAO type codes (`B763`, `MD11`, `B744`...)
4. **Private** — charter operators (`NetJets`, `Flexjet`...) OR owner patterns (`LLC`, `Inc`, `Trust`...) OR business jet type codes (`C550`, `GLF5`, `CL60`...)
5. **Unknown** — nothing matched

Admin endpoint `POST /api/admin/backfill-classification?force=true` reclassifies all rows.

### 4. Frontend Polling

`App.jsx` polls `GET /api/flights?limit=150` every 5 seconds. React state update triggers re-render of the feed.

---

## External APIs (All Free, No Keys Required)

| API | Endpoint | Used For |
|---|---|---|
| **adsb.lol** | `GET /v2/closest/{lat}/{lon}/{radius_nm}` | Live ADS-B data (nearest aircraft) |
| **adsbdb.com** | `GET /v0/aircraft/{reg}` | Aircraft registry (model, owner, country) |
| **adsbdb.com** | `GET /v0/callsign/{callsign}` | Route intelligence (airline, origin, dest) |
| **OpenFlights** | GitHub CSV | Airport reference data (one-time migration) |
| **Planespotters** | `GET /pub/photos/reg/{reg}` | Aircraft photos (lazy-loaded in frontend) |

Cache strategy: Aircraft and callsign results are cached indefinitely in SQLite. No TTL currently — the assumption is registry data changes rarely.

---

## How to Run

### Development

```bash
# From repo root
npm install
npm run dev
```

- Backend: `http://localhost:8080` (Flask dev server, debug=True, reloader disabled)
- Frontend: `http://localhost:5173` (Vite, proxies `/api/*` to backend)

### Production (Docker)

```bash
docker-compose up
```

- App served at `http://localhost:8080`
- Frontend is built into `dist/` and served as static files by Flask/Gunicorn
- Data persisted to `./data/` volume on host

**Key Docker details:**
- Multi-stage Dockerfile: Node 20-alpine builds frontend → Python 3.11-slim runtime
- Gunicorn: `--workers 1` (intentional — SQLite + daemon threads require single process)
- Timeout: 120s (for slow enrichment API calls on first encounters)

---

## Flask API Endpoints

### Flight Data
- `GET /api/flights` — Latest events (`limit`, `offset` params; max 1000)
- `GET /api/flights/search-by-time` — Find flights near a datetime

### Statistics
- `GET /api/stats/summary` — All-time totals
- `GET /api/stats/summary-24h` — Last 24 hours
- `GET /api/stats/hourly` — Events per hour (last 24h)
- `GET /api/stats/activity-by-day` — Events by day of week (last 7 days)
- `GET /api/stats/top-aircraft` — Top 10 most frequent aircraft
- `GET /api/stats/top-operators` — Top 10 airlines/operators
- `GET /api/stats/countries` — Aircraft count by registration country
- `GET /api/stats/routes` — Most common origin→destination pairs
- `GET /api/stats/routes-map` — Routes with airport coordinates (`range=all|week`)
- `GET /api/stats/classification` — Count by classification category
- `GET /api/stats/classification-detailed` — With percentages and 24h delta
- `GET /api/stats/altitude-distribution` — Low/medium/high/ground breakdown
- `GET /api/stats/aircraft-types` — Most common ICAO type codes
- `GET /api/stats/recent-notable` — Government/cargo/frequent flights

### Admin
- `GET /api/admin/classification-stats` — Diagnostics
- `POST /api/admin/backfill-classification` — Reclassify flights (`force=true`, `limit=N`)

---

## Frontend Features

### Live Feed (`App.jsx`)
- Auto-refreshes every 5 seconds
- Up to 150 most recent flights, newest first
- Expandable rows: click to see full detail + aircraft photo
- Lazy photo loading from Planespotters (220ms sequential delay to avoid hammering)
- Photo fallback: tries registration first, then ICAO type code
- Keyboard nav: `/` to search, `Esc` to collapse, arrow keys to navigate
- Search/filter: callsign, reg, type, origin, dest, country
- DateTime search: find flights near a specific timestamp
- Classification dots: color-coded legend per category
- Row fade: older rows visually fade
- Status bar: "last sweep" age, traffic density indicator (NO TARGETS / LOW / ACTIVE / HIGH DENSITY)

### Statistics Dashboard (`Stats.jsx`)
- Summary metrics: total events, unique aircraft, operators, countries
- 24h comparison numbers
- Classification breakdown table with 24h delta
- Hourly activity histogram (last 24h)
- Top aircraft table with photos
- Top operators table
- Countries list
- Aircraft types table
- Activity by day of week
- Recent notable flights (government, cargo, frequent)
- Interactive route map (Leaflet)

### Route Map (`RouteMap.jsx`)
- Leaflet map centered on observer location
- Lines drawn between origin and destination airports
- Line thickness = frequency (more flights → thicker line)
- Line color = classification type
- Observer location marked
- Toggle between all-time and last 7 days

---

## Key Design Decisions

1. **Single ADS-B aircraft per poll** — `adsb.lol`'s `/closest` endpoint returns the single nearest aircraft. The app logs whatever is closest at each poll. It does not scan all aircraft in the radius simultaneously.

2. **SQLite only** — No Postgres, no Redis. Intentional for local-first simplicity. Single-writer model enforced by Gunicorn's `--workers 1`.

3. **No auth** — Designed for personal local use. No user accounts, no API keys.

4. **Timestamps stored as UTC ISO strings** — No timezone info in DB. Frontend appends `Z` to force UTC parsing, then converts to local timezone via browser's `toLocaleTimeString()`.

5. **Classification is background, not inline** — Flights are logged immediately, classified later. This keeps the ingestion loop fast and allows batch reclassification when rules change.

6. **Reloader disabled in dev** — Flask's `use_reloader=False` prevents duplicate daemon threads when running in debug mode.

---

## Known Limitations / Future Work Ideas

- Only tracks the **single nearest** aircraft per poll — not all aircraft in radius simultaneously
- No cache TTL — registry data never expires (static for most aircraft)
- No authentication or multi-user support
- Classification rules are hardcoded in `db.py` — no UI to edit them
- No alerting (e.g., notify when a specific aircraft appears)
- Route map requires airports table to be populated via manual migration script
- Photos are fetched client-side; no server-side photo caching
