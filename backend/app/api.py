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

@api_bp.route("/api/flights/search-by-time")
def search_by_time():
    """Find flights nearest to a given datetime"""
    datetime_str = request.args.get("datetime")

    if not datetime_str:
        return jsonify({"error": "datetime parameter required"}), 400

    # Ensure datetime has seconds (datetime-local doesn't include them)
    if len(datetime_str) == 16 and datetime_str[13] == ':':  # Format: YYYY-MM-DDTHH:MM
        datetime_str += ":00"

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # Find flights closest to the provided datetime
    # Using ABS to get time difference and sort by it
    cur.execute(
        """
        SELECT *,
            ABS(julianday(last_seen) - julianday(?)) * 86400 as time_diff_seconds
        FROM flights
        ORDER BY time_diff_seconds ASC
        LIMIT 50;
        """,
        (datetime_str,),
    )

    rows = [dict(r) for r in cur.fetchall()]
    conn.close()

    # Filter to flights within 7 days (more lenient than 24h)
    filtered = [r for r in rows if r.get('time_diff_seconds', float('inf')) <= 604800]

    return jsonify(filtered[:10])  # Return top 10 closest

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


@api_bp.route("/api/stats/altitude-distribution")
def stats_altitude_distribution():
    """Returns altitude bands: low (<10k), medium (10k-25k), high (>25k)"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute("""
        SELECT
            CASE
                WHEN altitude_ft = 'ground' OR altitude_ft IS NULL THEN 'ground'
                WHEN CAST(altitude_ft AS INTEGER) < 10000 THEN 'low'
                WHEN CAST(altitude_ft AS INTEGER) BETWEEN 10000 AND 25000 THEN 'medium'
                ELSE 'high'
            END as altitude_band,
            COUNT(*) as count
        FROM flights
        GROUP BY altitude_band
        ORDER BY
            CASE altitude_band
                WHEN 'ground' THEN 0
                WHEN 'low' THEN 1
                WHEN 'medium' THEN 2
                WHEN 'high' THEN 3
            END;
    """)

    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return jsonify(rows)


@api_bp.route("/api/stats/aircraft-types")
def stats_aircraft_types():
    """Returns breakdown of most common aircraft types"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute("""
        SELECT
            type_code,
            model,
            COUNT(*) AS event_count,
            COUNT(DISTINCT COALESCE(NULLIF(reg, ''), hex)) AS unique_aircraft
        FROM flights
        WHERE type_code IS NOT NULL AND type_code != ''
        GROUP BY type_code
        ORDER BY event_count DESC
        LIMIT 15;
    """)

    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return jsonify(rows)


@api_bp.route("/api/stats/activity-by-day")
def stats_activity_by_day():
    """Returns activity levels by day of week"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute("""
        SELECT
            CASE CAST(strftime('%w', last_seen) AS INTEGER)
                WHEN 0 THEN 'Sun'
                WHEN 1 THEN 'Mon'
                WHEN 2 THEN 'Tue'
                WHEN 3 THEN 'Wed'
                WHEN 4 THEN 'Thu'
                WHEN 5 THEN 'Fri'
                WHEN 6 THEN 'Sat'
            END as day_name,
            CAST(strftime('%w', last_seen) AS INTEGER) as day_num,
            COUNT(*) as events
        FROM flights
        WHERE last_seen >= datetime('now', '-7 days')
        GROUP BY day_num
        ORDER BY day_num;
    """)

    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return jsonify(rows)


@api_bp.route("/api/stats/recent-notable")
def stats_recent_notable():
    """Returns recent government/military and unusual activity"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute("""
        SELECT
            callsign,
            reg,
            classification,
            COALESCE(airline_name, owner) as operator,
            type_code,
            model,
            altitude_ft,
            last_seen,
            times_seen,
            country_iso
        FROM flights
        WHERE classification IN ('government', 'cargo')
           OR times_seen >= 5
        ORDER BY last_seen DESC
        LIMIT 20;
    """)

    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return jsonify(rows)


@api_bp.route("/api/stats/classification-detailed")
def stats_classification_detailed():
    """Returns classification breakdown with percentages and 24h comparisons"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute("""
        SELECT
            COALESCE(classification, 'unknown') AS classification,
            COUNT(*) AS total_count,
            COUNT(DISTINCT COALESCE(NULLIF(reg, ''), hex)) AS unique_aircraft,
            CAST(AVG(
                CASE WHEN altitude_ft != 'ground' AND altitude_ft IS NOT NULL
                     THEN CAST(altitude_ft AS INTEGER)
                END
            ) AS INTEGER) AS avg_altitude,
            SUM(CASE WHEN last_seen >= datetime('now', '-24 hours') THEN 1 ELSE 0 END) AS count_24h
        FROM flights
        GROUP BY classification
        ORDER BY total_count DESC;
    """)

    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return jsonify(rows)


@api_bp.route("/api/stats/routes-map")
def stats_routes_map():
    """Returns top routes with coordinates for map visualization"""
    time_range = request.args.get("range", "all")  # "all" or "week"

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # Build time filter
    time_filter = ""
    if time_range == "week":
        time_filter = "WHERE f.last_seen >= datetime('now', '-7 days')"

    query = f"""
        SELECT
            f.origin_iata,
            f.dest_iata,
            COUNT(*) AS flight_count,
            o.latitude AS origin_lat,
            o.longitude AS origin_lon,
            o.city AS origin_city,
            o.country AS origin_country,
            d.latitude AS dest_lat,
            d.longitude AS dest_lon,
            d.city AS dest_city,
            d.country AS dest_country,
            GROUP_CONCAT(DISTINCT f.classification) AS classifications
        FROM flights f
        LEFT JOIN airports o ON f.origin_iata = o.iata_code
        LEFT JOIN airports d ON f.dest_iata = d.iata_code
        {time_filter}
        {"AND" if time_filter else "WHERE"} f.origin_iata IS NOT NULL
          AND f.dest_iata IS NOT NULL
          AND o.latitude IS NOT NULL
          AND d.latitude IS NOT NULL
        GROUP BY f.origin_iata, f.dest_iata
        HAVING flight_count >= 2
        ORDER BY flight_count DESC
        LIMIT 20;
    """

    cur.execute(query)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()

    return jsonify(rows)






