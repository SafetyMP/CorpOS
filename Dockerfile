# CorpOS control-plane image.
#
# Runs the app under tsx (the same ESM resolver used in dev). The codebase
# uses directory/extensionless imports that tsx resolves; a compiled image
# would require a bundler step, which is out of scope for this reference.
# Simulation-first: works with zero configuration (no API key required).

FROM node:20-alpine AS base

WORKDIR /app

# Install dependencies first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

# Copy the application source (dashboard + runtime + tools + tests).
COPY . .

# SQLite writes here at runtime; ensure the non-root user owns it.
RUN mkdir -p data && chown -R node:node /app

ENV NODE_ENV=production \
    PORT=3000 \
    LOG_LEVEL=info

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/api/health" >/dev/null 2>&1 || exit 1

# No API key set → simulation mode. Set OPENROUTER_API_KEY (etc.) to go live.
CMD ["npx", "tsx", "src/index.ts"]
