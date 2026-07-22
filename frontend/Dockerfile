# syntax=docker/dockerfile:1
# Build context: repository root (`.`).
#   docker build -f frontend/Dockerfile -t ml-air-frontend:latest .
# Do not use context ./frontend — root package.json has no "build" script.
FROM node:20-alpine AS deps

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY frontend/package.json frontend/package-lock.json* ./

RUN --mount=type=cache,target=/root/.npm \
    npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    for attempt in 1 2 3; do npm ci && break || { echo "npm ci attempt $attempt failed, retrying..."; sleep 15; }; done

FROM node:20-alpine AS builder

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

# Empty = browser same-origin /v1 proxy; set at build only when UI and API are on different public hosts.
ARG NEXT_PUBLIC_API_BASE_URL=
ARG NEXT_PUBLIC_MLAIR_REALTIME_WS=

ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ENV NEXT_PUBLIC_MLAIR_REALTIME_WS=${NEXT_PUBLIC_MLAIR_REALTIME_WS}

COPY --from=deps /app/node_modules ./node_modules

COPY frontend .

RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

ARG MLAIR_NEXT_INTERNAL_API_URL=http://api:8080
ENV MLAIR_NEXT_INTERNAL_API_URL=${MLAIR_NEXT_INTERNAL_API_URL}

RUN addgroup -S nextjs && adduser -S nextjs -G nextjs

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000',(r)=>{r.resume();process.exit(r.statusCode<500?0:1)}).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
