import os
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
    # Ensure the directory for the SQLite file exists
    db_dir = os.path.dirname(DB_PATH)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)

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

    # ---- airports reference table ----
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS airports (
            iata_code TEXT PRIMARY KEY,
            name TEXT,
            city TEXT,
            country TEXT,
            latitude REAL,
            longitude REAL
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
    Returns one of: commercial | private | government | cargo | unknown
    Uses only fields we already store: airline_name, owner, callsign, type_code, reg, country, etc.
    """
    airline = (row.get("airline_name") or "").strip().lower()
    owner = (row.get("owner") or "").strip().lower()
    callsign = (row.get("callsign") or "").strip().upper()
    type_code = (row.get("type_code") or "").strip().upper()
    reg = (row.get("reg") or "").strip().upper()

    # ============================================================
    # GOVERNMENT / MILITARY (highest priority - most specific)
    # ============================================================

    gov_owner_terms = [
        "air force", "usaf", "navy", "army", "marines", "government",
        "homeland", "state dept", "department of", "police", "sheriff",
        "coast guard", "national guard", "royal air force", "raf",
        "us marshal", "dhs", "customs", "border patrol", "fbi",
        "military", "defense", "armed forces", "ministry of defence",
    ]
    if any(t in owner for t in gov_owner_terms):
        return "government"

    # Military callsign prefixes (US and international)
    gov_callsign_prefixes = (
        "RCH", "SAM", "MC", "AF", "NAVY", "ARMY", "AE", "EVAC",
        "BOXER", "REACH", "SPAR", "VENUS", "EXEC", "PAT",
        "CNV", "SHAMU", "CONVOY", "TEAL"
    )
    if callsign.startswith(gov_callsign_prefixes):
        return "government"

    # Military registration prefixes
    if reg.startswith(("N", "AF", "166", "167", "168", "169")):
        # US military aircraft often have registrations starting with specific numbers
        # This is a rough heuristic
        if any(term in owner for term in ["llc", "inc", "corp", "trust"]) == False:
            if not airline and not any(term in owner for term in ["aviation", "air charter", "jet"]):
                # Possible military if no clear commercial/private signals
                pass

    # ============================================================
    # COMMERCIAL AIRLINES (high confidence)
    # ============================================================

    # Airline name from callsign lookup is strongest signal
    if airline:
        # Check if it's cargo masquerading as commercial
        cargo_airlines = [
            "fedex", "ups", "united parcel", "dhl", "amazon air", "amazon prime",
            "atlas air", "kalitta", "polar air", "southern air", "cargo", "freight",
            "air cargo", "express freight"
        ]
        if any(c in airline for c in cargo_airlines):
            return "cargo"
        return "commercial"

    # Commercial airline owner patterns
    commercial_owner_terms = [
        "airlines", "airways", "air lines", "airline",
    ]
    if any(t in owner for t in commercial_owner_terms):
        # Exclude cargo/charter
        if not any(c in owner for c in ["cargo", "freight", "charter"]):
            return "commercial"

    # ============================================================
    # CARGO OPERATIONS
    # ============================================================

    cargo_owner_terms = ["cargo", "freight", "logistics", "express"]
    if any(t in owner for t in cargo_owner_terms):
        return "cargo"

    cargo_type_codes = {
        "B763", "B762", "B752", "B744", "B748", "MD11",  # Common cargo conversions
        "A306", "A30B", "DC10", "DC86", "DC87",
    }
    if type_code in cargo_type_codes and not airline:
        return "cargo"

    # ============================================================
    # PRIVATE / BUSINESS JETS
    # ============================================================

    # Charter operators (technically commercial but often categorized as private)
    charter_owner_terms = [
        "flexjet", "netjets", "wheels up", "xojet", "sentient",
        "vistajet", "luxaviation", "privé", "air charter",
        "charter", "executive", "flight options", "bombardier fractional",
    ]
    if any(t in owner for t in charter_owner_terms):
        return "private"

    # Personal ownership patterns
    private_owner_terms = [
        " llc", " inc", " trust", " corp", "holdings",
        "management", "investments", "aviation llc",
    ]
    # Only classify as private if owner has these terms AND it's a jet/small aircraft
    if any(owner.endswith(t) or t + " " in owner for t in private_owner_terms):
        if type_code:  # Has type code, likely private
            return "private"

    # Business jet type codes (comprehensive list)
    private_type_codes = {
        # Embraer Phenom/Praetor/Legacy
        "E50P", "E55P", "E545", "E550", "E35L", "E35X", "E135", "E145",
        # Cessna Citation family
        "C25A", "C25B", "C25C", "C500", "C501", "C510", "C525", "C550",
        "C551", "C560", "C56X", "C650", "C680", "C700", "C750",
        # Gulfstream
        "GLF2", "GLF3", "GLF4", "GLF5", "GLF6", "G150", "G200", "G280",
        "GLEX", "G650",
        # Bombardier/Canadair
        "CL30", "CL35", "CL60", "CL64", "CL65", "GALX", "GL5T", "GL7T",
        # Dassault Falcon
        "F900", "FA10", "FA20", "FA50", "FA7X", "FA8X", "FA2T", "FA5X",
        # Learjet
        "LJ23", "LJ24", "LJ25", "LJ31", "LJ35", "LJ40", "LJ45", "LJ55",
        "LJ60", "LJ70", "LJ75", "LJ85",
        # Hawker/Beechjet
        "H25A", "H25B", "H25C", "BE40", "BE20", "BE30", "BE9L", "BE9T",
        # Pilatus
        "PC12", "PC24",
        # Other common business jets
        "HDJT", "HA4T", "ASTR", "C68A", "PRM1", "EA50",
    }
    if type_code in private_type_codes:
        return "private"

    # Small single/twin props (likely private/training)
    small_aircraft_codes = {
        "C172", "C182", "C206", "PA28", "PA32", "PA46", "SR20", "SR22",
        "BE36", "BE58", "C310", "C340", "C414", "C421",
    }
    if type_code in small_aircraft_codes:
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
