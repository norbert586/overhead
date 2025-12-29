import threading
from flask import Flask
from flask_cors import CORS

from .db import init_db
from .api import api_bp
from .ingest import ingestion_loop
from .classifier import classification_loop


def create_app():
    app = Flask(__name__)
    CORS(app)  # dev-only, allow all origins
    app.register_blueprint(api_bp)
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
