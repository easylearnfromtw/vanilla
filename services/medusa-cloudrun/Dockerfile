# Dedicated, unprivileged Cloud Run service. Requires --sandbox-launcher at DEPLOY TIME.
FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
 && useradd --create-home --uid 10001 medusa
COPY app.py ./
USER 10001
EXPOSE 8080
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1", "--no-access-log"]
