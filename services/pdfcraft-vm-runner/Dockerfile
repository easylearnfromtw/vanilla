FROM node:22-bookworm-slim
WORKDIR /srv
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund \
    && npm cache clean --force
# The Rails Sandbox template builder may be unavailable even while ordinary
# microVM allocation works. Pin the official binary as an image asset and
# upload it as bytes into each throwaway VM; it is never run in this broker.
RUN set -eu; \
    apt-get update; \
    apt-get install -y --no-install-recommends curl ca-certificates; \
    curl --fail --location --silent --show-error --retry 3 --max-time 180 \
      'https://github.com/storytold/pdfcraft/releases/download/v0.9.0/pdfcraft-cli-0.9.0-linux-x86_64.tar.gz' \
      -o /tmp/pdfcraft.tar.gz; \
    printf '%s  %s\n' cdba2bec4d502d016dd78101a402d07845b708c49d77bc85e0ab640aca65372b /tmp/pdfcraft.tar.gz | sha256sum -c -; \
    mkdir -p /tmp/pdfcraft-release; \
    tar -xzf /tmp/pdfcraft.tar.gz -C /tmp/pdfcraft-release --no-same-owner --no-same-permissions; \
    install -m 0755 /tmp/pdfcraft-release/pdfcraft-cli-0.9.0-linux-x86_64/pdfcraft-cli /srv/pdfcraft-cli; \
    printf '%s  %s\n' 073c9c4eb4193cbbf52211d5ad8102969b0731b3294e44c47ab289ac84d2640f /srv/pdfcraft-cli | sha256sum -c -; \
    rm -rf /tmp/pdfcraft-release /tmp/pdfcraft.tar.gz /var/lib/apt/lists/*
COPY runtime.mjs server.mjs ./
ENV NODE_ENV=production
ENV PDFCRAFT_VM_RUNNER_ENABLED=false
USER node
EXPOSE 8080
CMD ["node","server.mjs"]
