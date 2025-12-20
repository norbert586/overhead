import os
from dotenv import load_dotenv

load_dotenv()

ME_LAT = float(os.getenv("ME_LAT", "42.7077"))
ME_LON = float(os.getenv("ME_LON", "-83.0315"))
RADIUS_NM = float(os.getenv("RADIUS_NM", "50"))

POLL_SECONDS = int(os.getenv("POLL_SECONDS", "12"))
EVENT_WINDOW_MINUTES = int(os.getenv("EVENT_WINDOW_MINUTES", "20"))

DB_PATH = os.getenv("DB_PATH", os.path.join(os.path.dirname(__file__), "..", "data", "flight_log.db"))
