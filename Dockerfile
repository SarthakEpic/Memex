# Multi-stage build for any Docker host (Railway, Render, Koyeb, Fly.io, a VPS).
# Targets PostgreSQL by default; build with --build-arg PRISMA_PROVIDER=sqlite
# (and run with DATABASE_URL pointing at a file on a persistent volume) for SQLite.
ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-slim AS deps
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm install

FROM node:${NODE_VERSION}-slim AS builder
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ARG PRISMA_PROVIDER=postgres
ENV PRISMA_PROVIDER=${PRISMA_PROVIDER} NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# One-off schema push against a running Postgres, used by the compose
# tooling service: docker compose --profile tools run --rm db-push
FROM builder AS migrator
CMD ["npx", "prisma", "db", "push"]

FROM node:${NODE_VERSION}-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/* \
    && groupadd --system nodejs && useradd --system --gid nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# Belt-and-braces for the Prisma query engine (file tracing usually includes it).
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
