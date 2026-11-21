# syntax=docker/dockerfile:1
# --- Construction ---
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev && mkdir -p server/node_modules

# --- Exécution ---
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PORT=3000 \
    KNOWLIST_DATA_DIR=/data \
    KNOWLIST_WEB_DIR=/app/web/dist
WORKDIR /app
COPY --from=build --chown=root:root /app/node_modules ./node_modules
COPY --from=build --chown=root:root /app/server/package.json ./server/package.json
COPY --from=build --chown=root:root /app/server/dist ./server/dist
COPY --from=build --chown=root:root /app/server/node_modules ./server/node_modules
COPY --from=build --chown=root:root /app/web/dist ./web/dist
COPY --from=build --chown=root:root /app/package.json ./package.json
# Utilisateur système sans privilèges (uid 1000 « node »), seul /data est inscriptible.
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/dist/server.js"]
