FROM node:24.19.0-bookworm-slim AS build

WORKDIR /app

COPY package.json yarn.lock ./
RUN corepack enable \
  && yarn install --frozen-lockfile --ignore-scripts \
  && yarn cache clean

COPY index.html vite.config.js ./
COPY backend/catalogs/bambu-filaments.snapshot.json ./backend/catalogs/bambu-filaments.snapshot.json
COPY styles ./styles
COPY src ./src

RUN yarn build

FROM nginxinc/nginx-unprivileged:1.29-alpine

COPY --chown=101:101 backend/deploy/raspberry-pi/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=101:101 /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -q -O - http://127.0.0.1:8080/healthz >/dev/null || exit 1
