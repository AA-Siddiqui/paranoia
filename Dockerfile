FROM node:22-bookworm-slim

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV PUPPETEER_CACHE_DIR=/home/node/.cache/puppeteer
ENV CHECK_INTERVAL_SECONDS=300
ENV NODE_ENV=production
ENV MOZ_DISABLE_CONTENT_SANDBOX=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    dumb-init \
    libasound2 \
    libdbus-glib-1-2 \
    libgtk-3-0 \
    libx11-xcb1 \
    libxt6 \
    xz-utils \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.15.1 --activate

WORKDIR /app

RUN mkdir -p /app /home/node/.cache/puppeteer \
  && chown -R node:node /app /home/node/.cache

USER node

COPY --chown=node:node package.json pnpm-lock.yaml ./
RUN PUPPETEER_SKIP_DOWNLOAD=true pnpm install --frozen-lockfile --prod

USER root

RUN pnpm exec puppeteer browsers install firefox@stable_146.0.1 --install-deps \
  && chown -R node:node /app /home/node/.cache

USER node

COPY --chown=node:node main.js docker-entrypoint.sh ./
RUN chmod +x /app/docker-entrypoint.sh

ENTRYPOINT ["dumb-init", "--", "/app/docker-entrypoint.sh"]
