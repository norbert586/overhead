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

        # ---- lightweight migrations (safe on existing DBs) ----
    cur.execute("PRAGMA table_info(flights);")
    cols = {row[1] for row in cur.fetchall()}  # row[1] is column name

    if "classification" not in cols:
        cur.execute("ALTER TABLE flights ADD COLUMN classification TEXT;")


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


def classify_flight(row: Dict[str, Any]) -> str:
    """
    Returns one of: commercial | private | government | unknown
    Uses only fields we already store: airline_name, owner, callsign, type_code, reg, country, etc.
    """
    airline = (row.get("airline_name") or "").strip().lower()
    owner = (row.get("owner") or "").strip().lower()
    callsign = (row.get("callsign") or "").strip().upper()
    type_code = (row.get("type_code") or "").strip().upper()

    # GOV / MIL signals (high confidence)
    gov_owner_terms = [
        "air force", "usaf", "navy", "army", "marines", "government",
        "homeland", "state", "dept", "department", "police", "sheriff",
        "coast guard", "national guard", "royal air force", "raf",
    ]
    if any(t in owner for t in gov_owner_terms):
        return "government"

    gov_callsign_prefixes = ("RCH", "SAM", "MC", "AF", "NAVY", "ARMY", "AE")
    if callsign.startswith(gov_callsign_prefixes):
        return "government"

    # Commercial: airline name present is the cleanest signal
    if airline:
        return "commercial"

    # Private / business jet heuristics
    private_owner_terms = [
        "flexjet", "netjets", "wheels up", "vista", "luxaviation",
        "aviation", "charter", "jet", "executive", "air charter",
    ]
    if any(t in owner for t in private_owner_terms):
        return "private"

    private_type_codes = {
        "E545", "E550", "E35L", "E35X", "E50P", "E55P",
        "CL60", "GLEX", "GLF5", "GLF6", "GLF4", "GLF3",
        "PC24", "FA50", "FA7X", "LJ45", "LJ60", "C750",
        "C25A", "C25B", "C25C", "C560", "C650",
    }
    if type_code in private_type_codes:
        return "private"

    return "unknown"



def log_flight(row: Dict[str, Any]) -> None:
    init_db()

    now_iso = row.get("seen_at") or datetime.now().isoformat(timespec="seconds")
    row["seen_at"] = now_iso
    now_dt = datetime.fromisoformat(now_iso)

    event_key = _build_event_key(row)
    classification = classify_flight(row)


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
    # Recompute classification if enrichment data arrived
    enrichment_fields = (
        row.get("airline_name")
        or row.get("owner")
        or row.get("callsign")
    )

    should_update_classification = enrichment_fields is not None

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
                dest_name = COALESCE(NULLIF(dest_name, ''), ?),
                classification = ?
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
                classification,
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
                heading_deg = ?,
                classification = ?
            WHERE id = ?;
            """,
            (
                now_iso,
                now_iso,
                row.get("altitude_ft"),
                row.get("ground_speed_kt"),
                row.get("distance_nm"),
                row.get("heading_deg"),
                classification,
                match["id"],
            ),
        )

    conn.commit()
    conn.close()


def _insert_new_event(row: Dict[str, Any], event_key: str) -> None:
    conn = _connect()
    cur = conn.cursor()

    seen_at = row.get("seen_at") or datetime.now().isoformat(timespec="seconds")
    classification = classify_flight(row)

    cur.execute(
        """
        INSERT INTO flights (
            seen_at,
            hex,
            reg,
            callsign,
            type_code,
            model,
            manufacturer,
            country,
            country_iso,
            owner,
            airline_name,
            origin_iata,
            origin_name,
            dest_iata,
            dest_name,
            altitude_ft,
            ground_speed_kt,
            distance_nm,
            heading_deg,
            event_key,
            first_seen,
            last_seen,
            times_seen,
            classification
        )
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
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
            classification,
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
