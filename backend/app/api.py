from flask import Blueprint, jsonify, request
import sqlite3
from .config import DB_PATH

api_bp = Blueprint("api", __name__)

@api_bp.route("/api/flights")
def get_flights():
    limit = min(int(request.args.get("limit", 100)), 1000)
    offset = int(request.args.get("offset", 0))

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute(
        """
        SELECT *
        FROM flights
        ORDER BY last_seen DESC
        LIMIT ? OFFSET ?;
        """,
        (limit, offset),
    )

    rows = [dict(r) for r in cur.fetchall()]
    conn.close()

    return jsonify(rows)

@api_bp.route("/api/stats/summary")
def stats_summary():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute("""
        SELECT
          COUNT(*) AS total_events,
          COUNT(DISTINCT event_key) AS unique_aircraft,
          COUNT(DISTINCT COALESCE(airline_name, owner)) AS operators,
          COUNT(DISTINCT country_iso) AS countries,
          CAST(AVG(
            CASE
              WHEN altitude_ft IS NOT NULL
                   AND altitude_ft != 'ground'
              THEN altitude_ft
            END
          ) AS INTEGER) AS avg_altitude
        FROM flights;
    """)

    row = dict(cur.fetchone())
    conn.close()
    return jsonify(row)

@api_bp.route("/api/stats/top-aircraft")
def stats_top_aircraft():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute("""
        SELECT
          reg,
          model,
          type_code,
          COALESCE(airline_name, owner) AS operator,
          country_iso,
          MAX(times_seen) AS times_seen
        FROM flights
        WHERE reg IS NOT NULL
        GROUP BY reg
        ORDER BY times_seen DESC
        LIMIT 10;
    """)

    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return jsonify(rows)

@api_bp.route("/api/stats/top-operators")
def stats_top_operators():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute("""
        SELECT
          COALESCE(airline_name, owner) AS operator,
          COUNT(*) AS total_events,
          COUNT(DISTINCT event_key) AS unique_aircraft
        FROM flights
        WHERE airline_name IS NOT NULL OR owner IS NOT NULL
        GROUP BY operator
        ORDER BY total_events DESC
        LIMIT 10;
    """)

    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return jsonify(rows)

@api_bp.route("/api/stats/countries")
def stats_countries():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute("""
        SELECT
          country_iso,
          country,
          COUNT(DISTINCT event_key) AS aircraft_count,
          COUNT(*) AS event_count
        FROM flights
        WHERE country_iso IS NOT NULL
        GROUP BY country_iso
        ORDER BY event_count DESC;
    """)

    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return jsonify(rows)


@api_bp.route("/api/stats/routes")
def stats_routes():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute("""
        SELECT
          origin_iata,
          dest_iata,
          COUNT(*) AS event_count
        FROM flights
        WHERE origin_iata IS NOT NULL
          AND dest_iata IS NOT NULL
        GROUP BY origin_iata, dest_iata
        HAVING event_count >= 2
        ORDER BY event_count DESC
        LIMIT 10;
    """)

    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return jsonify(rows)





