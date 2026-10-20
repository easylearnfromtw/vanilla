FROM node:22-bookworm-slim
WORKDIR /srv
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund \
    && npm cache clean --force
COPY runtime.mjs server.mjs ./
ENV NODE_ENV=production
ENV PDFCRAFT_VM_RUNNER_ENABLED=false
USER node
EXPOSE 8080
CMD ["node","server.mjs"]
