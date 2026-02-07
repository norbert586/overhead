"""WSGI entry point for production deployment"""
from app.main import create_app, start_ingestion_thread, start_classifier_thread
from app.db import init_db

# Initialize database
init_db()

# Start background workers
start_ingestion_thread()
start_classifier_thread()

# Create Flask app for gunicorn
app = create_app()

if __name__ == "__main__":
    app.run()
