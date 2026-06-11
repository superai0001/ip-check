# Backend image for the ip-check geo/risk API.
# Build (from the backend/ dir):  docker build -t ip-check-backend .
# Run:                            docker run -p 8080:8080 -v ipcheck-data:/data ip-check-backend
FROM python:3.12-slim

WORKDIR /app

# Install the app + its dependencies from pyproject.toml (hatchling build).
COPY pyproject.toml ./
COPY app ./app
COPY main.py ./
RUN pip install --no-cache-dir .

# SQLite cache lives here; mount a volume at /data to persist it across restarts.
ENV IPCHECK_DB_PATH=/data/ipcheck.db
# Listen port (Fly/Render/Cloud Run inject $PORT; default 8080).
ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
