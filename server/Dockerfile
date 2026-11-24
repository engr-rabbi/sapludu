# Build context: repository root   →   docker build -f server/Dockerfile -t sapludu-server .
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --workspace=server --workspace=@sapludu/engine --include-workspace-root
COPY packages/engine packages/engine
COPY server server
RUN npm run build -w server

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev --workspace=server --include-workspace-root && npm cache clean --force
COPY --from=build /app/server/dist server/dist
USER node
EXPOSE 3003
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:${PORT:-3003}/health || exit 1
CMD ["node", "server/dist/index.js"]
