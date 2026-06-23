# Alter Ego - single-container build.
# Builds the Vite frontend and runs the Express API from one Node process,
# serving the static app same-origin (no CORS). The large compendium DB
# (alter_eger.db, ~77 MB) is NOT baked in; it is provided at runtime via a
# persistent volume mounted at /data-public. See doc/deploy-vps.md.

# ---- Stage 1: build frontend + prune to production deps ----
FROM node:20-bookworm AS builder
WORKDIR /app

# package-lock.json is gitignored, so use npm install (not npm ci).
COPY package.json ./
RUN npm install

COPY . .

# vite build -> normalize (skips when no DB present) -> copy static assets.
RUN npm run build:app

# Strip dev dependencies but keep native modules (better-sqlite3) compiled above.
RUN npm prune --omit=dev

# ---- Stage 2: lean runtime ----
FROM node:20-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    STATIC_DIR=/app/dist/app \
    PUBLIC_DATA_DIR=/data-public \
    COMPENDIUM_DB_PATH=/data-public/alter_eger.db \
    DATABASE_PATH=/data-private/campaigns.db \
    PUBLIC_JOIN_PATH=/join/index.html

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/metadata ./metadata
COPY --from=builder /app/data/samples ./data/samples
COPY --from=builder /app/package.json ./package.json

# Public data (compendium DB, samples) and private data (campaigns.db) live on
# persistent volumes so they survive image rebuilds.
RUN mkdir -p /data-public /data-private
VOLUME ["/data-public", "/data-private"]

EXPOSE 3000

# Container health endpoint used by Coolify / docker compose.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.mjs"]
