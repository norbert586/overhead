# ── Stage 1: build the React frontend ────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build
# Output: /app/frontend/dist/

# ── Stage 2: Python runtime with embedded frontend ────────────────────────────
FROM python:3.11-slim

WORKDIR /app

# Install Python dependencies
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend source
COPY backend/ ./backend/

# Copy compiled frontend from stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Persistent volume mount point for SQLite
RUN mkdir -p /data

ENV DB_PATH=/data/flight_log.db
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

EXPOSE 8080

WORKDIR /app/backend
CMD ["gunicorn", "--workers", "1", "--bind", "0.0.0.0:8080", "--timeout", "120", "wsgi:app"]
