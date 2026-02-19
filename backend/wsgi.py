"""
Production WSGI entry point — used by Gunicorn.

  cd backend
  gunicorn --workers 1 --bind 0.0.0.0:8080 --timeout 120 wsgi:app

The background ingestion and classification threads are started here so they
run inside the single Gunicorn worker process.  Using --workers 1 is
intentional: SQLite is not designed for concurrent writers, and the daemon
threads need to share the same process.
"""
import threading

from app.db import init_db
from app.ingest import ingestion_loop
from app.classifier import classification_loop
from app.main import create_app

# Initialise the database (creates tables / runs migrations)
init_db()

# Start background workers
threading.Thread(target=ingestion_loop, daemon=True, name="ingestion").start()
threading.Thread(target=classification_loop, daemon=True, name="classifier").start()

# Export the Flask app object for Gunicorn
app = create_app()
