FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json* .npmrc* ./
COPY packages ./packages
COPY apps ./apps
COPY scripts ./scripts
COPY tsconfig*.json vitest.config.ts eslint.config.mjs ./
RUN corepack enable && corepack prepare npm@11.17.0 --activate \
 && npm ci --include=dev && npm run build
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "run", "start"]
