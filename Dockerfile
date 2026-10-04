FROM node:22-bookworm-slim
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile --filter @mapping/api --filter @mapping/web --filter @mapping/shared
COPY apps/api apps/api
COPY apps/web apps/web
COPY packages packages
RUN pnpm build && mkdir -p /app/data && chown node:node /app/data
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4180 DATA_DIR=/app/data
USER node
EXPOSE 4180
CMD ["node","apps/api/src/server.js"]
