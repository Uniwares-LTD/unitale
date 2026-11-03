FROM node:24.16.0-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Build with credential-free local defaults and an allowlisted application flag map.
RUN npm run build

FROM node:24.16.0-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
ENV NODE_OPTIONS=--require=/app/load-runtime-settings.cjs
RUN groupadd --gid 1001 unitale && useradd --uid 1001 --gid unitale --no-create-home unitale
COPY --from=build --chown=1001:1001 /app/.next/standalone ./
COPY --from=build --chown=1001:1001 /app/.next/static ./.next/static
COPY --from=build --chown=1001:1001 /app/public ./public
COPY --from=build --chown=1001:1001 /app/dist/payment-worker.cjs ./payment-worker.cjs
COPY --from=build --chown=1001:1001 /app/dist/ai-worker.cjs ./ai-worker.cjs
COPY --from=build --chown=1001:1001 /app/dist/worker-healthcheck.cjs ./worker-healthcheck.cjs
COPY --from=build --chown=1001:1001 /app/dist/runtime-settings.json ./runtime-settings.json
COPY --from=build --chown=1001:1001 /app/scripts/runtime-settings.cjs ./runtime-settings.cjs
COPY --from=build --chown=1001:1001 /app/scripts/load-runtime-settings.cjs ./load-runtime-settings.cjs
USER 1001:1001
EXPOSE 3000
CMD ["node", "server.js"]
