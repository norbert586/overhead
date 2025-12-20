import requests

ADSBDB_AIRCRAFT_URL = "https://api.adsbdb.com/v0/aircraft"
ADSBDB_CALLSIGN_URL = "https://api.adsbdb.com/v0/callsign"


# ------------------------------------------------------------
# Aircraft enrichment (registration-based)
# ------------------------------------------------------------

def fetch_aircraft_intel(reg: str):
    if not reg:
        return None

    try:
        r = requests.get(
            f"{ADSBDB_AIRCRAFT_URL}/{reg}",
            timeout=8,
            headers={"User-Agent": "overhead-tracker/1.0"},
        )
        r.raise_for_status()
        return r.json().get("response", {}).get("aircraft")
    except Exception as e:
        print("[ENRICH] aircraft lookup failed:", e)
        return None


# ------------------------------------------------------------
# Callsign / route enrichment
# ------------------------------------------------------------

def fetch_callsign_route(callsign: str):
    if not callsign:
        return None

    try:
        r = requests.get(
            f"{ADSBDB_CALLSIGN_URL}/{callsign}",
            timeout=8,
            headers={"User-Agent": "overhead-tracker/1.0"},
        )
        r.raise_for_status()
        return r.json().get("response", {}).get("flightroute")
    except Exception as e:
        print("[ENRICH] callsign lookup failed:", e)
        return None
