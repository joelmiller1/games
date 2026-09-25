# syntax=docker/dockerfile:1
# Arcade game server. Multi-arch: build with
#   docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/joelmiller1/games:latest arcade/
ARG NODE_IMAGE=node:24-alpine

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM ${NODE_IMAGE}
ARG APP_VERSION=dev
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data \
    APP_VERSION=${APP_VERSION}
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
COPY shared ./shared
COPY public ./public
RUN mkdir -p /data && chown node:node /data
# The official image's unprivileged "node" user (uid 1000).
USER node
EXPOSE 8080
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "server/index.js"]
