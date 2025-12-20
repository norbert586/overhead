import time
import requests
from datetime import datetime

from .config import ME_LAT, ME_LON, RADIUS_NM, POLL_SECONDS
from .db import (
    log_flight,
    get_cached_aircraft,
    upsert_aircraft_cache,
    get_cached_callsign,
    upsert_callsign_cache,
)
from .enrich import fetch_aircraft_intel, fetch_callsign_route


ADSB_LOL_URL = "https://api.adsb.lol/v2/closest"


def fetch_nearest():
    url = f"{ADSB_LOL_URL}/{ME_LAT}/{ME_LON}/{RADIUS_NM}"
    resp = requests.get(url, timeout=10)
    resp.raise_for_status()
    data = resp.json()

    # adsb.lol sometimes returns { ac: [...] }
    if isinstance(data, dict) and "ac" in data and data["ac"]:
        return data["ac"][0]

    # fallback shape
    if isinstance(data, dict) and data.get("hex"):
        return data

    return None


def ingestion_loop():
    print("[INGEST] Ingestion thread started")

    while True:
        try:
            ac = fetch_nearest()
            if not ac:
                time.sleep(POLL_SECONDS)
                continue

            row = {
                "seen_at": datetime.now().isoformat(timespec="seconds"),
                "hex": ac.get("hex"),
                "reg": ac.get("r"),
                "callsign": (ac.get("flight") or "").strip(),
                "type_code": ac.get("t"),
                "altitude_ft": ac.get("alt_baro"),
                "ground_speed_kt": ac.get("gs"),
                "distance_nm": ac.get("dst"),
                "heading_deg": ac.get("track"),
            }

            # -------- Aircraft enrichment (registration-based) --------
            reg = row.get("reg")

            cached_aircraft = get_cached_aircraft(reg)
            if cached_aircraft:
                row.update({
                    "type_code": cached_aircraft.get("type_code") or row.get("type_code"),
                    "model": cached_aircraft.get("model"),
                    "manufacturer": cached_aircraft.get("manufacturer"),
                    "owner": cached_aircraft.get("owner"),
                    "country": cached_aircraft.get("country"),
                    "country_iso": cached_aircraft.get("country_iso"),
                })
            else:
                intel = fetch_aircraft_intel(reg)
                if intel:
                    upsert_aircraft_cache(reg, intel)
                    row.update({
                        "type_code": intel.get("icao_type") or row.get("type_code"),
                        "model": intel.get("type"),
                        "manufacturer": intel.get("manufacturer"),
                        "owner": intel.get("registered_owner"),
                        "country": intel.get("registered_owner_country_name"),
                        "country_iso": intel.get("registered_owner_country_iso_name"),
                    })

                # -------- Route / airline enrichment (callsign-based) --------
                callsign = row.get("callsign")

                cached_route = get_cached_callsign(callsign)
                if cached_route:
                    row.update({
                        "airline_name": cached_route.get("airline_name"),
                        "origin_iata": cached_route.get("origin_iata"),
                        "origin_name": cached_route.get("origin_name"),
                        "dest_iata": cached_route.get("dest_iata"),
                        "dest_name": cached_route.get("dest_name"),
                    })
                else:
                    route = fetch_callsign_route(callsign)
                    if route:
                        upsert_callsign_cache(callsign, route)

                        airline = route.get("airline") or {}
                        origin = route.get("origin") or {}
                        dest = route.get("destination") or {}

                        row.update({
                            "airline_name": airline.get("name"),
                            "origin_iata": origin.get("iata_code"),
                            "origin_name": origin.get("name") or origin.get("municipality"),
                            "dest_iata": dest.get("iata_code"),
                            "dest_name": dest.get("name") or dest.get("municipality"),
                        })

            log_flight(row)
            print(
                f"[INGEST] {row.get('callsign') or 'UNKNOWN'} "
                f"{row.get('reg') or ''} "
                f"{row.get('altitude_ft')} ft"
            )

        except Exception as e:
            # Never crash the loop
            print("[INGEST] Error:", e)

        time.sleep(POLL_SECONDS)
