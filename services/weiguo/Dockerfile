FROM mcr.microsoft.com/playwright/python:v1.58.0-noble
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY policy.py app.py tasks.py server.py security.py ./
RUN useradd --create-home --uid 10001 weiguo \
    && mkdir -p /data \
    && chown -R weiguo:weiguo /app /data
USER weiguo
ENV PYTHONDONTWRITEBYTECODE=1
ENV XDG_CACHE_HOME=/tmp/.cache
EXPOSE 8080
CMD ["uvicorn","app:app","--host","0.0.0.0","--port","8080","--workers","1"]
