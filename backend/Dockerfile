FROM node:22-alpine AS base
WORKDIR /app

# ── dependencies ─────────────────────────────────────────────────────────────
# Full install, including devDependencies: the build needs typescript and
# swagger-jsdoc.
FROM base AS deps
COPY package*.json ./
RUN npm ci

# Runtime dependencies only, resolved separately so the final image never
# carries typescript, jest, ts-jest or tsx.
FROM base AS prod-deps
COPY package*.json ./
RUN npm ci --omit=dev

# ── build ────────────────────────────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# V8 sizes its default heap from the container's memory, and on a small host
# that ceiling is below what tsc needs to check this project plus the
# firebase-admin type surface -- the build died with "Reached heap limit
# Allocation failed" (exit 134) on a 1GB instance. Raising it explicitly makes
# the build independent of how much RAM the builder happens to have; swap
# absorbs the peak on the small ones.
ENV NODE_OPTIONS=--max-old-space-size=1536
RUN npm run build

# ── runtime ──────────────────────────────────────────────────────────────────
FROM base AS runner

ENV NODE_ENV=production

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/swagger.json ./swagger.json

# The migration runner reads its .sql files from beside itself, and tsc only
# emits .js — so without this the image cannot migrate its own database and
# `npm run db:migrate` has to be run from a checkout instead.
COPY --from=builder /app/src/db/*.sql ./dist/db/

# The storage root must exist and be owned by `node` BEFORE privileges are
# dropped. A named volume mounted at this path inherits the ownership of the
# directory underneath it, so creating it here is what makes uploads work — the
# container cannot mkdir inside a root-owned mount point once it is `node`.
RUN mkdir -p /var/lib/getitdone/storage/public/artwork  && chown -R node:node /var/lib/getitdone/storage

# Drop privileges. The node image ships an unprivileged `node` user; running as
# root is the default only because nothing changes it.
USER node

EXPOSE 4000

# Compose and orchestrators can then wait for readiness rather than for the
# process to merely exist. /health/ready checks the database, Redis and storage.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
