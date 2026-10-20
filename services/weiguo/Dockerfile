# Pin the GridCraft v0.8.0 source to the reviewed release commit, not a moving branch.
# Build the headless CLI in a separate stage; Rust/Cargo never ship to production.
FROM rust:1.99-bookworm AS gridcraft-builder
ARG GRIDCRAFT_TAG=v0.8.0
ARG GRIDCRAFT_COMMIT=823c56582d00be91e31b4f7f3680496cf89e84fb
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch "${GRIDCRAFT_TAG}" https://github.com/storytold/gridcraft.git /gridcraft \
    && test "$(git -C /gridcraft rev-parse HEAD)" = "${GRIDCRAFT_COMMIT}"
WORKDIR /gridcraft
ENV CARGO_BUILD_JOBS=2
ENV CARGO_PROFILE_RELEASE_LTO=false
RUN cargo build --locked --release --package gridcraft-cli
COPY gridcraft-smoke.jsonl /tmp/gridcraft-smoke.jsonl
RUN ./target/release/gridcraft-cli version \
    && ./target/release/gridcraft-cli run --script /tmp/gridcraft-smoke.jsonl --out /tmp/gridcraft-smoke.xlsx --quiet \
    && ./target/release/gridcraft-cli info /tmp/gridcraft-smoke.xlsx --json > /tmp/gridcraft-smoke-info.json \
    && grep -q '"charts"' /tmp/gridcraft-smoke-info.json

FROM mcr.microsoft.com/playwright/python:v1.58.0-noble
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY --from=gridcraft-builder /gridcraft/target/release/gridcraft-cli /usr/local/bin/gridcraft-cli
RUN test "$(gridcraft-cli version)" = "gridcraft-cli 0.8.0"
COPY slime.py slime_telegram.py policy.py app.py tasks.py notion_schedule.py scouts_search.py server.py security.py auth.py moli_engine.py wordcraft_engine.py pdfcraft_engine.py pdfcraft_native.py pdfcraft_wire.py pdfcraft_remote.py orchestra_capabilities.py canva_adapter.py gridcraft_adapter.py medusa_adapter.py medusa_cloudrun_adapter.py medusa_lite.py medusa_family.py quirinus_family_actions.py ceres_gateway.py quirinus_adapter.py detroit_quirinus_dispatcher.py ceres_dialogue.py ceres_telegram_registration.py ceres_agent_bridge.py ceres_agent_delivery.py ceres_server_model.py ceres_server_tools.py ceres_server_agent.py ceres_admin_policy.py ceres_admin_bot.py ceres_admin_web.py family_model_gateway.py ceres_model_catalog.py ceres_model_routes.py ceres_command_center.py ceres_model_ops.py ceres_model_ops_routes.py ceres_maintenance.py vanilla_public_api.py vanilla_api_console.py ./
COPY luca.py ./
# Build must fail before rollout if Telegram /hub runtime module is absent.
RUN python3 -c "import ceres_command_center, ceres_model_ops, ceres_model_ops_routes, ceres_maintenance, vanilla_public_api, vanilla_api_console"
COPY gridcraft-smoke.py ./gridcraft-smoke.py
RUN python3 gridcraft-smoke.py && rm gridcraft-smoke.py
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
