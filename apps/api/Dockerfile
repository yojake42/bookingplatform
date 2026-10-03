FROM node:24-alpine AS build
WORKDIR /workspace
RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --no-audit --no-fund --include-workspace-root --workspace apps/api

COPY apps/api apps/api
RUN npm run prisma:generate -w apps/api \
  && npm run build -w apps/api \
  && npm prune --omit=dev --include-workspace-root --workspace apps/api \
  && npm cache clean --force

FROM node:24-alpine AS production
WORKDIR /workspace
ENV NODE_ENV=production
RUN apk add --no-cache openssl ca-certificates

COPY --from=build --chown=node:node /workspace/package.json ./package.json
COPY --from=build --chown=node:node /workspace/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /workspace/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /workspace/apps/api/prisma ./apps/api/prisma

USER node
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "apps/api/dist/src/main.js"]
