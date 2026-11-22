FROM node:24.14.0-bookworm-slim AS development
WORKDIR /app
COPY package*.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
RUN npm ci --workspace=doskito-server --include-workspace-root --ignore-scripts
WORKDIR /app/server
COPY server/prisma.config.ts server/tsconfig.json server/tsconfig.build.json server/eslint.config.js server/.prettierrc.json ./
COPY server/prisma ./prisma
RUN DATABASE_URL=file:/tmp/prisma-build.db npx prisma generate
COPY server/src ./src
COPY server/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && chown -R node:node /app
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "run", "dev"]

FROM development AS build
RUN npm run build && npm prune --omit=dev --ignore-scripts --workspace=doskito-server

FROM node:24.14.0-bookworm-slim AS production
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
COPY --from=build /app/node_modules ./node_modules
WORKDIR /app/server
COPY --from=build /app/server/dist ./dist
COPY server/prisma ./prisma
COPY server/prisma.config.ts ./
COPY server/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
EXPOSE 3001
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "--enable-source-maps", "dist/index.js"]
