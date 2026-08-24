FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.5 --activate
COPY . .
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @abn/worker build
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production RUNTIME_MODE=STOPPED
COPY --from=build /app /app
CMD ["node","apps/worker/dist/index.js"]
