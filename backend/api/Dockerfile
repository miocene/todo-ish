FROM node:24.19.0-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

COPY package.json yarn.lock ./
RUN corepack enable \
  && yarn install --frozen-lockfile --production \
  && yarn cache clean

COPY src ./src

USER node

EXPOSE 3000

CMD ["node", "src/index.mjs"]
