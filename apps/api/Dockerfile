# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm install --workspace=@eitf/api --include-workspace-root --omit=optional --no-audit --no-fund

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY apps/api ./apps/api
COPY package.json ./
WORKDIR /app/apps/api
RUN npx prisma generate
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
# Source files that prisma/seed.ts imports at container start (roles, settings, statutory rules).
# Without them the seed fails silently and a fresh database has no company, roles or admin.
COPY --from=build /app/apps/api/src/company/default-settings.ts ./apps/api/src/company/default-settings.ts
COPY --from=build /app/apps/api/src/payroll/statutory ./apps/api/src/payroll/statutory
COPY apps/api/docker-entrypoint.sh ./apps/api/docker-entrypoint.sh
RUN chmod +x ./apps/api/docker-entrypoint.sh \
  && mkdir -p /app/apps/api/uploads /app/apps/api/data \
  && chown -R node:node /app/apps/api/uploads /app/apps/api/data
# Run as the unprivileged "node" user (uid 1000), not root. An uploads volume created by an older
# root image must be re-owned once:  docker compose run --rm --user root --entrypoint chown api -R node:node /app/apps/api/uploads
USER node
WORKDIR /app/apps/api
EXPOSE 3001
ENTRYPOINT ["sh", "./docker-entrypoint.sh"]
