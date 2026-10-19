FROM mcr.microsoft.com/playwright/python:v1.58.0-noble
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY policy.py app.py tasks.py server.py security.py auth.py ./
COPY entrypoint.sh /usr/local/bin/weiguo-entrypoint
RUN useradd --create-home --uid 10001 weiguo \
    && mkdir -p /data \
    && chown -R weiguo:weiguo /app /data \
    && chmod 0755 /usr/local/bin/weiguo-entrypoint
# The container starts as root only long enough to fix the post-mount volume
# permissions, then runuser drops privileges before executing uvicorn.
USER root
ENV PYTHONDONTWRITEBYTECODE=1
ENV XDG_CACHE_HOME=/tmp/.cache
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/weiguo-entrypoint"]
CMD ["uvicorn","app:app","--host","0.0.0.0","--port","8080","--workers","1"]
