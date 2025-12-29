import time
import sqlite3
from .config import DB_PATH
from .db import classify_flight

INTERVAL_SECONDS = 30


def classification_loop():
    print("[CLASSIFIER] Classification worker started")

    while True:
        try:
            run_classification_pass()
        except Exception as e:
            print("[CLASSIFIER] Error:", e)

        time.sleep(INTERVAL_SECONDS)


def run_classification_pass():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # Only rows that need classification
    cur.execute("""
        SELECT id, airline_name, owner, callsign, type_code
        FROM flights
        WHERE classification IS NULL
           OR TRIM(classification) = ''
           OR classification = 'unknown'
        LIMIT 250;
    """)

    rows = cur.fetchall()
    updated = 0

    for r in rows:
        row_dict = dict(r)
        cls = classify_flight(row_dict)

        if cls and cls != "unknown":
            cur.execute(
                "UPDATE flights SET classification = ? WHERE id = ?;",
                (cls, r["id"]),
            )
            updated += 1

    conn.commit()
    conn.close()

    if updated:
        print(f"[CLASSIFIER] Updated {updated} rows")
