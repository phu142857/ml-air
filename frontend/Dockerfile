FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

FROM node:20-alpine AS builder
WORKDIR /app
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
ARG NEXT_PUBLIC_MLAIR_REALTIME_WS=
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ENV NEXT_PUBLIC_MLAIR_REALTIME_WS=${NEXT_PUBLIC_MLAIR_REALTIME_WS}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ARG MLAIR_NEXT_INTERNAL_API_URL=http://api:8080
ENV NODE_ENV=production
ENV MLAIR_NEXT_INTERNAL_API_URL=${MLAIR_NEXT_INTERNAL_API_URL}
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
