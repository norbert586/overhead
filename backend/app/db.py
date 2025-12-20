import sqlite3
from datetime import datetime
from typing import Dict, Any

from .config import DB_PATH, EVENT_WINDOW_MINUTES


# ============================================================
# Connection helper
# ============================================================

def _connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# ============================================================
# DB initialization
# ============================================================

def init_db() -> None:
    conn = _connect()
    cur = conn.cursor()

    # ---- main flight events table ----
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS flights (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            seen_at TEXT,
            hex TEXT,
            reg TEXT,
            callsign TEXT,
            type_code TEXT,
            model TEXT,
            manufacturer TEXT,
            country TEXT,
            country_iso TEXT,
            owner TEXT,
            airline_name TEXT,
            origin_iata TEXT,
            origin_name TEXT,
            dest_iata TEXT,
            dest_name TEXT,
            altitude_ft REAL,
            ground_speed_kt REAL,
            distance_nm REAL,
            heading_deg REAL,
            event_key TEXT,
            first_seen TEXT,
            last_seen TEXT,
            times_seen INTEGER DEFAULT 1
        );
        """
    )

    # ---- aircraft intelligence cache ----
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS aircraft_cache (
            reg TEXT PRIMARY KEY,
            type_code TEXT,
            model TEXT,
            manufacturer TEXT,
            owner TEXT,
            country TEXT,
            country_iso TEXT,
            updated_at TEXT
        );
        """
    )

    # ---- callsign / route cache ----
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS callsign_cache (
            callsign TEXT PRIMARY KEY,
            airline_name TEXT,
            origin_iata TEXT,
            origin_name TEXT,
            dest_iata TEXT,
            dest_name TEXT,
            updated_at TEXT
        );
        """
    )

    conn.commit()
    conn.close()


# ============================================================
# Event logic
# ============================================================

def _build_event_key(row: Dict[str, Any]) -> str:
    hex_ = (row.get("hex") or "").strip()
    reg = (row.get("reg") or "").strip()
    cs = (row.get("callsign") or "").strip()
    return f"{hex_}|{reg}|{cs}"


def log_flight(row: Dict[str, Any]) -> None:
    init_db()

    now_iso = row.get("seen_at") or datetime.now().isoformat(timespec="seconds")
    row["seen_at"] = now_iso
    now_dt = datetime.fromisoformat(now_iso)

    event_key = _build_event_key(row)

    if not event_key.replace("|", ""):
        _insert_new_event(row, event_key)
        return

    conn = _connect()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT id, last_seen
        FROM flights
        WHERE event_key = ?
        ORDER BY last_seen DESC
        LIMIT 1;
        """,
        (event_key,),
    )

    match = cur.fetchone()

    if not match:
        conn.close()
        _insert_new_event(row, event_key)
        return

    last_seen_dt = datetime.fromisoformat(match["last_seen"])
    gap_minutes = (now_dt - last_seen_dt).total_seconds() / 60
    increment = gap_minutes >= EVENT_WINDOW_MINUTES

    if increment:
        cur.execute(
            """
            UPDATE flights
            SET
                last_seen = ?,
                seen_at = ?,
                times_seen = times_seen + 1,
                altitude_ft = ?,
                ground_speed_kt = ?,
                distance_nm = ?,
                heading_deg = ?,
                model = COALESCE(NULLIF(model, ''), ?),
                manufacturer = COALESCE(NULLIF(manufacturer, ''), ?),
                country = COALESCE(NULLIF(country, ''), ?),
                country_iso = COALESCE(NULLIF(country_iso, ''), ?),
                owner = COALESCE(NULLIF(owner, ''), ?),
                airline_name = COALESCE(NULLIF(airline_name, ''), ?),
                origin_iata = COALESCE(NULLIF(origin_iata, ''), ?),
                origin_name = COALESCE(NULLIF(origin_name, ''), ?),
                dest_iata = COALESCE(NULLIF(dest_iata, ''), ?),
                dest_name = COALESCE(NULLIF(dest_name, ''), ?)
            WHERE id = ?;
            """,
            (
                now_iso,
                now_iso,
                row.get("altitude_ft"),
                row.get("ground_speed_kt"),
                row.get("distance_nm"),
                row.get("heading_deg"),
                row.get("model"),
                row.get("manufacturer"),
                row.get("country"),
                row.get("country_iso"),
                row.get("owner"),
                row.get("airline_name"),
                row.get("origin_iata"),
                row.get("origin_name"),
                row.get("dest_iata"),
                row.get("dest_name"),
                match["id"],
            ),
        )
    else:
        cur.execute(
            """
            UPDATE flights
            SET
                last_seen = ?,
                seen_at = ?,
                altitude_ft = ?,
                ground_speed_kt = ?,
                distance_nm = ?,
                heading_deg = ?
            WHERE id = ?;
            """,
            (
                now_iso,
                now_iso,
                row.get("altitude_ft"),
                row.get("ground_speed_kt"),
                row.get("distance_nm"),
                row.get("heading_deg"),
                match["id"],
            ),
        )

    conn.commit()
    conn.close()


def _insert_new_event(row: Dict[str, Any], event_key: str) -> None:
    conn = _connect()
    cur = conn.cursor()

    seen_at = row.get("seen_at") or datetime.now().isoformat(timespec="seconds")

    cur.execute(
        """
        INSERT INTO flights (
            seen_at, hex, reg, callsign, type_code,
            model, manufacturer, country, country_iso, owner,
            airline_name, origin_iata, origin_name,
            dest_iata, dest_name,
            altitude_ft, ground_speed_kt, distance_nm, heading_deg,
            event_key, first_seen, last_seen, times_seen
        )
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        (
            seen_at,
            row.get("hex"),
            row.get("reg"),
            row.get("callsign"),
            row.get("type_code"),
            row.get("model"),
            row.get("manufacturer"),
            row.get("country"),
            row.get("country_iso"),
            row.get("owner"),
            row.get("airline_name"),
            row.get("origin_iata"),
            row.get("origin_name"),
            row.get("dest_iata"),
            row.get("dest_name"),
            row.get("altitude_ft"),
            row.get("ground_speed_kt"),
            row.get("distance_nm"),
            row.get("heading_deg"),
            event_key,
            seen_at,
            seen_at,
            1,
        ),
    )

    conn.commit()
    conn.close()


# ============================================================
# Aircraft cache helpers
# ============================================================

def get_cached_aircraft(reg: str):
    if not reg:
        return None

    conn = _connect()
    cur = conn.cursor()
    cur.execute("SELECT * FROM aircraft_cache WHERE reg = ?", (reg,))
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None


def upsert_aircraft_cache(reg: str, intel: dict):
    if not reg or not intel:
        return

    conn = _connect()
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO aircraft_cache (
            reg, type_code, model, manufacturer, owner,
            country, country_iso, updated_at
        )
        VALUES (?,?,?,?,?,?,?,?)
        ON CONFLICT(reg) DO UPDATE SET
            type_code=excluded.type_code,
            model=excluded.model,
            manufacturer=excluded.manufacturer,
            owner=excluded.owner,
            country=excluded.country,
            country_iso=excluded.country_iso,
            updated_at=excluded.updated_at;
        """,
        (
            reg,
            intel.get("icao_type"),
            intel.get("type"),
            intel.get("manufacturer"),
            intel.get("registered_owner"),
            intel.get("registered_owner_country_name"),
            intel.get("registered_owner_country_iso_name"),
            datetime.now().isoformat(timespec="seconds"),
        ),
    )

    conn.commit()
    conn.close()


# ============================================================
# Callsign cache helpers
# ============================================================

def get_cached_callsign(callsign: str):
    if not callsign:
        return None

    conn = _connect()
    cur = conn.cursor()
    cur.execute("SELECT * FROM callsign_cache WHERE callsign = ?", (callsign,))
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None


def upsert_callsign_cache(callsign: str, route: dict):
    if not callsign or not route:
        return

    airline = route.get("airline") or {}
    origin = route.get("origin") or {}
    dest = route.get("destination") or {}

    conn = _connect()
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO callsign_cache (
            callsign, airline_name,
            origin_iata, origin_name,
            dest_iata, dest_name,
            updated_at
        )
        VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(callsign) DO UPDATE SET
            airline_name=excluded.airline_name,
            origin_iata=excluded.origin_iata,
            origin_name=excluded.origin_name,
            dest_iata=excluded.dest_iata,
            dest_name=excluded.dest_name,
            updated_at=excluded.updated_at;
        """,
        (
            callsign,
            airline.get("name"),
            origin.get("iata_code"),
            origin.get("name") or origin.get("municipality"),
            dest.get("iata_code"),
            dest.get("name") or dest.get("municipality"),
            datetime.now().isoformat(timespec="seconds"),
        ),
    )

    conn.commit()
    conn.close()
