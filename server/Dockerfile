FROM node:24.14.0-bookworm-slim AS development
WORKDIR /app
COPY package.json package-lock.json eslint.config.js .prettierrc.json ./
RUN npm ci
COPY prisma.config.ts tsconfig.json tsconfig.build.json ./
COPY prisma ./prisma
RUN DATABASE_URL=file:/tmp/prisma-build.db npx prisma generate
COPY src ./src
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && chown -R node:node /app
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "run", "dev"]

FROM development AS build
RUN npm run build && npm prune --omit=dev

FROM node:24.14.0-bookworm-slim AS production
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
EXPOSE 3001
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "start"]
