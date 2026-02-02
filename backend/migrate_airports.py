#!/usr/bin/env python3
"""
Migration script to populate airports table from OpenFlights database.

Run once to populate the airports reference table with coordinates:
    python migrate_airports.py
"""

import sqlite3
import urllib.request
import csv
import os
from pathlib import Path

# Determine DB path (same logic as config.py but without dotenv dependency)
SCRIPT_DIR = Path(__file__).parent
DB_PATH = os.getenv("DB_PATH", str(SCRIPT_DIR / "data" / "flight_log.db"))

OPENFLIGHTS_URL = "https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat"


def download_and_parse_airports():
    """Download OpenFlights airport data and parse it"""
    print(f"Downloading airport data from {OPENFLIGHTS_URL}...")

    try:
        with urllib.request.urlopen(OPENFLIGHTS_URL) as response:
            data = response.read().decode('utf-8')
    except Exception as e:
        print(f"Error downloading data: {e}")
        return []

    # OpenFlights format (CSV, no header):
    # 0: Airport ID, 1: Name, 2: City, 3: Country, 4: IATA, 5: ICAO,
    # 6: Latitude, 7: Longitude, 8: Altitude, 9: Timezone, 10: DST, 11: Tz database time zone

    airports = []
    reader = csv.reader(data.strip().split('\n'))

    for row in reader:
        if len(row) < 8:
            continue

        iata = row[4].strip()
        name = row[1].strip()
        city = row[2].strip()
        country = row[3].strip()

        # Only include airports with valid IATA codes
        if not iata or iata == '\\N' or len(iata) != 3:
            continue

        try:
            lat = float(row[6])
            lon = float(row[7])
        except (ValueError, IndexError):
            continue

        airports.append({
            'iata_code': iata,
            'name': name,
            'city': city,
            'country': country,
            'latitude': lat,
            'longitude': lon
        })

    print(f"Parsed {len(airports)} valid airports")
    return airports


def populate_airports_table(airports):
    """Insert airports into database"""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Clear existing data
    cur.execute("DELETE FROM airports")

    # Insert airports
    inserted = 0
    for airport in airports:
        try:
            cur.execute(
                """
                INSERT INTO airports (iata_code, name, city, country, latitude, longitude)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    airport['iata_code'],
                    airport['name'],
                    airport['city'],
                    airport['country'],
                    airport['latitude'],
                    airport['longitude']
                )
            )
            inserted += 1
        except sqlite3.IntegrityError:
            # Skip duplicates
            pass

    conn.commit()
    conn.close()

    print(f"Inserted {inserted} airports into database")


def main():
    db_path = Path(DB_PATH)
    if not db_path.exists():
        print(f"Error: Database not found at {DB_PATH}")
        print("Please run the main application first to create the database")
        return

    print("=" * 50)
    print("Airport Migration Script")
    print("=" * 50)

    airports = download_and_parse_airports()

    if not airports:
        print("No airports to insert")
        return

    populate_airports_table(airports)

    print("\n✓ Migration complete!")
    print(f"Airports table populated with {len(airports)} airports")


if __name__ == "__main__":
    main()
