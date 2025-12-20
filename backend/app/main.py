import threading
from flask import Flask
from .db import init_db
from flask_cors import CORS


from .api import api_bp
from .ingest import ingestion_loop


def create_app():
    app = Flask(__name__)
    CORS(app)  # ← allow all origins (dev only)
    app.register_blueprint(api_bp)
    return app


def start_ingestion_thread():
    t = threading.Thread(
        target=ingestion_loop,
        daemon=True,  # dies when main process exits
        name="ingestion-thread",
    )
    t.start()
    return t


if __name__ == "__main__":
    print("[MAIN] Starting Flight Tracker")

    # ✅ Ensure DB and tables exist BEFORE anything else
    init_db()

    start_ingestion_thread()

    app = create_app()
    app.run(host="0.0.0.0", port=8080, debug=True, use_reloader=False)

