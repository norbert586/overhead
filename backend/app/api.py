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
