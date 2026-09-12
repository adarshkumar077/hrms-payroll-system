# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────
# Orbit — multi-stage build producing a small Next.js standalone image.
# ─────────────────────────────────────────────────────────────

# ── Stage 1: install full dependencies (incl. dev) ──────────────
FROM node:20-alpine AS deps
WORKDIR /app
# libc compat for prisma engines on alpine
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json* ./
RUN npm ci

# ── Stage 2: build (prisma generate + next build) ───────────────
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# DATABASE_URL only needs to be a valid-looking URL for `prisma generate`
# and `next build`; the real one is injected at runtime.
ENV DATABASE_URL="file:./dev.db"
ENV NEXT_TELEMETRY_DISABLED=1
# `npm run build` = prisma generate && next build (see package.json)
RUN npm run build

# ── Stage 3: runner (minimal, non-root) ─────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# non-root user
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# The standalone output ships its own trimmed node_modules + server.js.
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Prisma: schema, generated client + query engine, migration/seed tooling.
COPY --from=builder /app/prisma ./prisma
# The seed script (run at first boot) imports from ./lib and needs tsconfig
# for the "@/*" path alias, plus bcryptjs. Ship the TS source it depends on.
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/node_modules/bcryptjs ./node_modules/bcryptjs
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
# tsx + its deps are needed to run the TypeScript seed at first boot.
COPY --from=builder /app/node_modules/tsx ./node_modules/tsx
COPY --from=builder /app/node_modules/.bin ./node_modules/.bin

COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Data dir for the SQLite file (volume-mounted in compose); writable by app user.
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app

USER nextjs
EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
