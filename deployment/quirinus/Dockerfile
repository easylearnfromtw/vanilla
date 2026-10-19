# Quirinus isolated CLI image. Do not publish an API endpoint.
# Built online; runtime must be launched with --network none and no secrets.
FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
RUN pip install --no-cache-dir "vulnclaw==0.4.1" "fastapi==0.119.0" \
    && useradd --uid 10001 --create-home --shell /usr/sbin/nologin scanner \
    && mkdir -p /opt/quirinus /scan-src /output \
    && chown scanner:scanner /output
COPY services/weiguo/quirinus_adapter.py services/weiguo/detroit_quirinus_dispatcher.py /opt/quirinus/
COPY deployment/quirinus/actions_entrypoint.py /opt/quirinus/
WORKDIR /opt/quirinus
USER 10001:10001
ENTRYPOINT ["python", "-B", "/opt/quirinus/actions_entrypoint.py"]
