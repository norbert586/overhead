# Flight Intelligence Log

A local-first aircraft proximity detection and intelligence logging system.

This project passively observes nearby aircraft, enriches them with registry
and route intelligence, and presents the results as a fast, utilitarian
chronological feed — designed to feel like an instrument, not a dashboard.

No maps. No noise. Just aircraft data as it arrives.

---

## Overview

Flight Intelligence Log consists of two independent services:

- **Backend**: Python + Flask + SQLite  
  Responsible for ingestion, enrichment, event modeling, and API exposure.

- **Frontend**: React (Vite)  
  A minimal, high-performance list UI that consumes the backend API.

They communicate exclusively over HTTP and can be run together or independently.

---

## Core Features

- Aircraft proximity polling (ADS-B)
- Event-based logging (no duplicate spam during a single pass)
- Intelligent enrichment:
  - Aircraft model & manufacturer
  - Owner / operator
  - Airline (when applicable)
  - Route intent (origin → destination)
- SQLite-backed persistence
- Read-only JSON API
- Dense, fast, chronological list UI
- Designed for long-running unattended operation

---

## Architecture

┌──────────────┐
│ ADS-B Source │
└──────┬───────┘
│
▼
┌────────────────────┐
│ Ingestion Thread │
│ (Python) │
└──────┬─────────────┘
│
▼
┌────────────────────┐
│ Event Logic │
│ - Deduplication │
│ - Time windows │
└──────┬─────────────┘
│
▼
┌────────────────────┐
│ Enrichment Layer │
│ (cached lookups) │
└──────┬─────────────┘
│
▼
┌────────────────────┐
│ SQLite Database │
└──────┬─────────────┘
│
▼
┌────────────────────┐
│ Flask API │
│ /api/flights │
└──────┬─────────────┘
│
▼
┌────────────────────┐
│ React Frontend │
│ (list UI) │
└────────────────────┘

---

## API

### `GET /api/flights`

Returns the most recent flight events.

**Query parameters**
- `limit` (default: 100)
- `offset` (default: 0)

**Example**

GET http://localhost:8080/api/flights?limit=50


---

## Running the Project

### Prerequisites

- Python 3.10+
- Node.js 18+
- npm

---

## Option A — Run Backend and Frontend Separately (recommended for development)

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m app.main

Backend runs at:

http://localhost:8080

cd frontend
npm install
npm run dev

Frontend runs at:

http://localhost:5173
