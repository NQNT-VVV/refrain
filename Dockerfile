# syntax=docker/dockerfile:1

# --- Dependances completes (le build Next a besoin de TypeScript) ----------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- Build Next -----------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- Dependances de production seules -------------------------------------
FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# --- Image finale ---------------------------------------------------------
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=3000 \
    METRICS_PORT=9464 \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY package.json next.config.mjs ./
COPY server ./server
COPY public ./public

# Cache des listes Deezer : monte en volume ephemere dans Kubernetes
RUN mkdir -p /app/.cache && chown -R node:node /app

USER node
EXPOSE 3000 9464

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server/index.js"]
