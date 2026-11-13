# gamfix-wa-router — the WhatsApp chat bot brain.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# /data holds chat state; /media is the RO mount of gowa-chat's statics.
RUN mkdir -p /data /media \
    && useradd --system --uid 10001 warouter \
    && chown -R warouter:warouter /data
USER warouter

EXPOSE 8080
# Single worker: chat state lives in process memory (store.py), so the whole
# app must stay in ONE process — 8 threads cover the concurrency.
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "1", "--threads", "8", "--timeout", "30", "main:app"]
