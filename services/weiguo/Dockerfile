FROM ubuntu:24.04 AS moli-verified
# Official Moli Linux x86_64 release, pinned to both tag and GitHub asset SHA-256.
# Avoid unverified curl|sh installers. The runner must fail closed on changes.
ARG MOLI_VERSION=v1.1.18
ARG MOLI_SHA256=59715fbdb2b016bb9136e1edb59a2a195c0f98459fd06739e17edc62da6a48b1
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl; \
    mkdir -p /tmp/moli-unpack; \
    curl --fail --location --show-error --silent --retry 3 --connect-timeout 15 --max-time 240 \
      "https://github.com/lexmount/moli/releases/download/${MOLI_VERSION}/moli-x86_64-unknown-linux-gnu.tar.gz" \
      -o /tmp/moli-release.tar.gz; \
    echo "${MOLI_SHA256}  /tmp/moli-release.tar.gz" | sha256sum -c -; \
    tar -xzf /tmp/moli-release.tar.gz -C /tmp/moli-unpack; \
    count="$(find /tmp/moli-unpack -type f -name moli | wc -l)"; \
    test "$count" = "1"; \
    install -m 0755 "$(find /tmp/moli-unpack -type f -name moli -print -quit)" /usr/local/bin/moli

FROM mcr.microsoft.com/playwright/python:v1.58.0-noble
COPY --from=moli-verified /usr/local/bin/moli /usr/local/bin/moli
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY policy.py app.py tasks.py server.py security.py auth.py moli_engine.py ./
COPY entrypoint.sh /usr/local/bin/weiguo-entrypoint
RUN /usr/local/bin/moli --version \
    && useradd --create-home --uid 10001 weiguo \
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
