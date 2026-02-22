import os
import threading
from flask import Flask, send_from_directory
from flask_cors import CORS

from .db import init_db
from .api import api_bp
from .ingest import ingestion_loop
from .classifier import classification_loop

# Resolve the built frontend dist directory (populated by `npm run build`)
_FRONTEND_DIST = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
)


def create_app():
    app = Flask(__name__)
    CORS(app)
    app.register_blueprint(api_bp)

    # Serve the compiled React SPA if the dist folder exists.
    # In dev the Vite dev server handles this; in production Flask does.
    if os.path.isdir(_FRONTEND_DIST):
        @app.route("/", defaults={"path": ""})
        @app.route("/<path:path>")
        def serve_spa(path):
            target = os.path.join(_FRONTEND_DIST, path) if path else None
            if path and target and os.path.isfile(target):
                return send_from_directory(_FRONTEND_DIST, path)
            return send_from_directory(_FRONTEND_DIST, "index.html")

    return app


def start_ingestion_thread():
    t = threading.Thread(
        target=ingestion_loop,
        daemon=True,
        name="ingestion-thread",
    )
    t.start()
    return t


def start_classifier_thread():
    t = threading.Thread(
        target=classification_loop,
        daemon=True,
        name="classification-thread",
    )
    t.start()
    return t


if __name__ == "__main__":
    print("[MAIN] Starting Flight Tracker")

    # Ensure DB + migrations exist
    init_db()

    # Background workers
    start_ingestion_thread()
    start_classifier_thread()

    # Web API
    app = create_app()
    app.run(
        host="0.0.0.0",
        port=8080,
        debug=True,
        use_reloader=False,  # IMPORTANT: prevents double threads
    )
