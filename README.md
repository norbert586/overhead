# Overhead — Flight Intelligence Log

A local-first aircraft proximity detection and intelligence logging system.

Passively observes nearby aircraft in real-time, enriches them with comprehensive registry and route intelligence, and presents the results as a fast, utilitarian chronological feed — designed to feel like an instrument panel, not a dashboard.

**No maps in the main feed. No noise. Just aircraft data as it arrives.**

---

## What It Does

Overhead monitors the sky above your location by polling live ADS-B transponder data. Every aircraft that enters your configured radius gets logged, enriched with intel from multiple sources, classified by type, and displayed in a dense chronological feed you can leave running 24/7.

### At a Glance

- **Real-time ADS-B ingestion** — polls nearby aircraft every 12 seconds (configurable)
- **Automatic enrichment** — aircraft model, manufacturer, owner, airline, and route (origin/destination)
- **Smart deduplication** — event-based logging with configurable time windows to prevent duplicate spam
- **Flight classification** — automatically tags flights as commercial, private, government, cargo, or unknown
- **40+ API endpoints** — comprehensive stats, search, filtering, and analytics
- **Dense list UI** — React-based feed with expandable detail rows, keyboard navigation, and aircraft photos
- **Statistics dashboard** — top aircraft, operators, countries, altitude distribution, hourly activity, route maps
- **Interactive route map** — Leaflet-powered visualization of the most common flight routes over your area
- **SQLite persistence** — everything stored locally, no cloud dependency
- **Designed for long-running unattended operation** — daemon threads, error recovery, cached lookups

---

## Architecture

```
┌──────────────────┐
│   ADS-B Source    │    adsb.lol API — live transponder data
│   (adsb.lol)     │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Ingestion Thread │    Polls every POLL_SECONDS, extracts hex/reg/callsign/alt/speed
│   (ingest.py)    │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│   Enrichment     │    Aircraft lookup → model, manufacturer, owner
│   (enrich.py)    │    Callsign lookup → airline, origin, destination
└────────┬─────────┘    Source: adsbdb.com (cached per registration & callsign)
         │
         ▼
┌──────────────────┐
│  Event Logic     │    Deduplication by event key (hex|reg|callsign)
│    (db.py)       │    Configurable time window before creating new event
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Classification  │    Categorizes: commercial | private | government | cargo
│ (classifier.py)  │    Runs every 30s, processes up to 250 flights per pass
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ SQLite Database  │    flights, aircraft_cache, callsign_cache, airports
│  (flight_log.db) │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│   Flask API      │    40+ endpoints: feed, search, stats, classification
│    (api.py)      │    http://localhost:8080
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ React Frontend   │    Live feed, stats dashboard, route map
│   (Vite)         │    http://localhost:5173
└──────────────────┘
```

---

## Tech Stack

| Layer    | Technology                              |
|----------|-----------------------------------------|
| Backend  | Python 3.10+, Flask 3.0, SQLite         |
| Frontend | React 19, Vite 7, Leaflet              |
| Data     | adsb.lol (ADS-B), adsbdb.com (registry) |
| Runner   | concurrently (dev), daemon threads       |

---

## Prerequisites

- **Python 3.10+**
- **Node.js 18+** and **npm**
- A network connection (for ADS-B and enrichment API calls)

---

## Quick Start

### 1. Clone the repo

```bash
git clone https://github.com/norbert586/overhead.git
cd overhead
```

### 2. Configure your location

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` with your coordinates and preferences:

```env
ME_LAT=42.7077              # Your latitude
ME_LON=-83.0315             # Your longitude
RADIUS_NM=50                # Detection radius in nautical miles
POLL_SECONDS=12             # Polling interval
EVENT_WINDOW_MINUTES=20     # Minutes before same aircraft creates a new event
DB_PATH=./data/flight_log.db
```

### 3. Run everything

**Option A — Single command (recommended)**

```bash
npm install
npm run dev
```

This uses `concurrently` to start both the backend and frontend in one terminal.

**Option B — Separate terminals (better for development/debugging)**

Terminal 1 — Backend:
```bash
cd backend
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m app.main
```

Terminal 2 — Frontend:
```bash
cd frontend
npm install
npm run dev
```

### 4. Open the UI

Navigate to **http://localhost:5173** — aircraft will start appearing as they enter your radius.

The backend API is available at **http://localhost:8080**.

---

## Detailed Setup

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

**Dependencies:**
- `flask` — web framework and API server
- `requests` — HTTP client for ADS-B and enrichment APIs
- `python-dotenv` — loads configuration from `.env`
- `flask-cors` — enables cross-origin requests from the frontend

**Start the backend:**
```bash
python -m app.main
```

The backend will:
1. Initialize the SQLite database (auto-creates tables on first run)
2. Start the **ingestion thread** — polls ADS-B data on a loop
3. Start the **classification thread** — categorizes flights every 30 seconds
4. Serve the Flask API on **http://localhost:8080**

### Frontend

```bash
cd frontend
npm install
```

**Start the dev server:**
```bash
npm run dev
```

**Build for production:**
```bash
npm run build        # Output in frontend/dist/
npm run preview      # Preview the production build locally
```

**Lint:**
```bash
npm run lint
```

### Airport Data Migration (Optional)

To populate the airports reference table (enables airport name resolution for routes):

```bash
cd backend
python migrate_airports.py
```

This downloads ~7,000 airports with IATA codes from OpenFlights and inserts them into the database.

---

## Environment Variables

All configuration lives in `backend/.env`. Copy from the example to get started:

```bash
cp backend/.env.example backend/.env
```

| Variable               | Default                  | Description                                              |
|------------------------|--------------------------|----------------------------------------------------------|
| `ME_LAT`               | `42.7077`                | Your latitude (decimal degrees)                          |
| `ME_LON`               | `-83.0315`               | Your longitude (decimal degrees)                         |
| `RADIUS_NM`            | `50`                     | Detection radius in nautical miles                       |
| `POLL_SECONDS`         | `12`                     | How often to poll ADS-B data (seconds)                   |
| `EVENT_WINDOW_MINUTES` | `20`                     | Time window before the same aircraft generates a new event |
| `DB_PATH`              | `./data/flight_log.db`   | Path to the SQLite database file                         |

---

## API Reference

The backend exposes 40+ JSON endpoints. All responses are JSON.

### Core

| Method | Endpoint                        | Description                                    |
|--------|---------------------------------|------------------------------------------------|
| GET    | `/api/flights`                  | Latest flight events (`limit`, `offset` params) |
| GET    | `/api/flights/search-by-time`   | Find flights nearest to a datetime (`datetime` param, ISO format) |

### Statistics

| Method | Endpoint                              | Description                                    |
|--------|---------------------------------------|------------------------------------------------|
| GET    | `/api/stats/summary`                  | Total events, unique aircraft, operators, countries |
| GET    | `/api/stats/summary-24h`              | Summary scoped to last 24 hours                |
| GET    | `/api/stats/top-aircraft`             | Top 10 most frequently seen aircraft           |
| GET    | `/api/stats/top-operators`            | Top 10 airlines/operators                      |
| GET    | `/api/stats/countries`                | Aircraft count by country of registration      |
| GET    | `/api/stats/routes`                   | Most common routes                             |
| GET    | `/api/stats/routes-map`               | Routes with coordinates for map visualization  |
| GET    | `/api/stats/classification`           | Breakdown by flight classification             |
| GET    | `/api/stats/classification-detailed`  | Classification with avg altitude and 24h delta |
| GET    | `/api/stats/hourly`                   | Activity by hour (last 24h)                    |
| GET    | `/api/stats/activity-by-day`          | Events by day of week                          |
| GET    | `/api/stats/altitude-distribution`    | Low / medium / high / ground breakdown         |
| GET    | `/api/stats/aircraft-types`           | Most common aircraft models                    |
| GET    | `/api/stats/recent-notable`           | Government, cargo, and frequently-seen flights |

### Admin

| Method | Endpoint                               | Description                         |
|--------|----------------------------------------|-------------------------------------|
| GET    | `/api/admin/classification-stats`      | Classification diagnostic stats     |
| POST   | `/api/admin/backfill-classification`   | Reclassify existing flights         |

---

## Flight Classification

Overhead automatically classifies every flight using a priority-based rule engine:

| Priority | Classification | Detection Method |
|----------|---------------|------------------|
| 1        | **Government / Military** | Owner keywords (air force, navy, government), callsign prefixes (RCH, SAM, SPAR, REACH) |
| 2        | **Commercial** | Has airline name from callsign lookup, excludes known cargo operators |
| 3        | **Cargo** | Cargo keywords in owner/airline, cargo-typical type codes (B763, MD11, etc.) |
| 4        | **Private** | Charter operators (NetJets, Flexjet), owner patterns (LLC, Inc, Trust), business jet type codes |
| 5        | **Unknown** | No matching patterns |

---

## Database

Overhead uses SQLite with four tables:

- **flights** — the main event log (hex, registration, callsign, model, owner, airline, route, altitude, speed, distance, classification, timestamps, times_seen)
- **aircraft_cache** — cached registration lookups (model, manufacturer, owner, country)
- **callsign_cache** — cached callsign lookups (airline, origin, destination)
- **airports** — reference data with IATA codes and coordinates

The database is auto-created on first run at the path specified by `DB_PATH`.

---

## Project Structure

```
overhead/
├── package.json                 # Root — runs both services via concurrently
├── README.md
│
├── backend/
│   ├── .env.example             # Environment variable template
│   ├── requirements.txt         # Python dependencies
│   ├── migrate_airports.py      # Airport data migration script
│   └── app/
│       ├── main.py              # Entry point — Flask app, thread startup
│       ├── config.py            # Configuration loader
│       ├── api.py               # 40+ Flask API routes
│       ├── db.py                # Database schema, event logic, classification rules
│       ├── ingest.py            # ADS-B polling loop
│       ├── enrich.py            # Aircraft & route enrichment via external APIs
│       └── classifier.py        # Background classification worker
│
└── frontend/
    ├── package.json             # Frontend dependencies & scripts
    ├── vite.config.js           # Vite configuration
    ├── index.html               # HTML entry point
    └── src/
        ├── main.jsx             # React entry point
        ├── App.jsx              # Main app — live feed, search, keyboard nav
        ├── App.css              # Core styling
        ├── Stats.jsx            # Statistics dashboard
        ├── RouteMap.jsx         # Interactive Leaflet route map
        └── RouteMap.css         # Map styling
```

---

## External APIs

Overhead pulls data from these free, public APIs:

| API | Purpose | Endpoint |
|-----|---------|----------|
| [adsb.lol](https://adsb.lol) | Live ADS-B transponder data | `/v2/closest/{lat}/{lon}/{radius}` |
| [adsbdb.com](https://www.adsbdb.com) | Aircraft registry & route lookup | `/v0/aircraft/{reg}`, `/v0/callsign/{cs}` |
| [OpenFlights](https://openflights.org/data) | Airport reference data | Used by `migrate_airports.py` |

No API keys required.

---

## UI Features

### Live Feed
- Auto-refreshing chronological list of nearby aircraft (every 5 seconds)
- Expandable detail rows with aircraft photos, owner info, and route details
- Full-text search filtering
- DateTime picker for historical lookups
- Keyboard navigation: `/` to search, `Esc` to clear, arrow keys to browse

### Statistics Dashboard
- Summary metrics (total events, unique aircraft, operators, countries)
- Classification breakdown with 24-hour comparison
- Top aircraft and operators charts
- Hourly and daily activity patterns
- Altitude distribution analysis
- Notable flight highlights (government, cargo, frequent flyers)

### Route Map
- Interactive Leaflet map showing most common routes
- Line thickness indicates frequency
- Time range filtering (all time vs. last week)
- Collapsible drawer UI

---

## License

This project is for personal and educational use.
