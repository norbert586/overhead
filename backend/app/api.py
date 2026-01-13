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

from .db import classify_flight  # add near your other imports

@api_bp.route("/api/admin/classification-stats", methods=["GET"])
def classification_stats():
    """
    Diagnostic: shows current state of classifications in DB
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute("""
        SELECT
            COUNT(*) as total,
            COUNT(CASE WHEN classification IS NULL THEN 1 END) as null_count,
            COUNT(CASE WHEN TRIM(classification) = '' THEN 1 END) as empty_count,
            COUNT(CASE WHEN classification = 'unknown' THEN 1 END) as unknown_count,
            COUNT(CASE WHEN classification NOT IN ('commercial', 'private', 'government', 'cargo', 'unknown')
                       AND classification IS NOT NULL
                       AND TRIM(classification) != ''
                  THEN 1 END) as invalid_count
        FROM flights;
    """)

    stats = dict(cur.fetchone())
    conn.close()

    return jsonify(stats)


@api_bp.route("/api/admin/backfill-classification", methods=["POST"])
def backfill_classification():
    """
    Reclassifies ALL flights (or specific subset based on query params)
    Query params:
      - force=true: Reclassify everything (default: only NULL/empty/unknown)
      - limit=N: Limit number of rows to update (default: all)
    """
    force = request.args.get("force", "false").lower() == "true"
    limit = request.args.get("limit", type=int)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # Build query based on force flag
    if force:
        query = """
            SELECT id, airline_name, owner, callsign, type_code, reg, hex, country, country_iso
            FROM flights
        """
    else:
        query = """
            SELECT id, airline_name, owner, callsign, type_code, reg, hex, country, country_iso
            FROM flights
            WHERE classification IS NULL
               OR TRIM(classification) = ''
               OR classification = 'unknown';
        """

    if limit:
        query += f" LIMIT {limit};"
    else:
        query += ";"

    cur.execute(query)
    rows = cur.fetchall()

    updated = 0
    changed = 0

    for r in rows:
        row_dict = dict(r)
        old_class = row_dict.get("classification")
        new_class = classify_flight(row_dict)

        cur.execute(
            "UPDATE flights SET classification = ? WHERE id = ?;",
            (new_class, r["id"]),
        )
        updated += 1

        if old_class != new_class:
            changed += 1

    conn.commit()
    conn.close()

    return jsonify({
        "updated": updated,
        "changed": changed,
        "forced": force
    })


@api_bp.route("/api/stats/summary")
def stats_summary():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute("""
        SELECT
          COUNT(*) AS total_events,

          COUNT(
            DISTINCT COALESCE(NULLIF(reg, ''), hex)
          ) AS unique_aircraft,

          COUNT(
            DISTINCT COALESCE(NULLIF(airline_name, ''), NULLIF(owner, ''))
          ) AS operators,

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
          COALESCE(NULLIF(airline_name, ''), NULLIF(owner, '')) AS operator,

          COUNT(*) AS total_events,

          COUNT(
            DISTINCT COALESCE(NULLIF(reg, ''), hex)
          ) AS unique_aircraft

        FROM flights
        WHERE airline_name IS NOT NULL
           OR owner IS NOT NULL

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

          COUNT(
            DISTINCT COALESCE(NULLIF(reg, ''), hex)
          ) AS aircraft_count,

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

@api_bp.route("/api/stats/summary-24h")
def stats_summary_24h():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute("""
        SELECT
          COUNT(*) AS events_24h,

          COUNT(
            DISTINCT COALESCE(NULLIF(reg, ''), hex)
          ) AS aircraft_24h,

          COUNT(
            DISTINCT COALESCE(NULLIF(airline_name, ''), NULLIF(owner, ''))
          ) AS operators_24h

        FROM flights
        WHERE last_seen >= datetime('now', '-24 hours');
    """)

    row = dict(cur.fetchone())
    conn.close()
    return jsonify(row)


@api_bp.route("/api/stats/classification")
def stats_classification():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute("""
        SELECT
          COALESCE(classification, 'unknown') AS classification,
          COUNT(*) AS count
        FROM flights
        GROUP BY classification;
    """)

    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return jsonify(rows)

@api_bp.route("/api/stats/hourly")
def stats_hourly():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute("""
      SELECT
        strftime('%H', last_seen, 'localtime') AS hour,
        COUNT(*) AS events
      FROM flights
      WHERE last_seen >= datetime('now', '-24 hours', 'localtime')
      GROUP BY hour
      ORDER BY hour;
    """)

    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return jsonify(rows)






