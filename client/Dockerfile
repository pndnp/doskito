FROM node:24.14.0-bookworm-slim AS development
WORKDIR /app
COPY client/package.json client/package-lock.json client/eslint.config.js client/stylelint.config.js client/.prettierrc.json client/.prettierignore ./
RUN npm ci
COPY client/index.html client/tsconfig.json client/tsconfig.app.json client/tsconfig.node.json client/vite.config.ts ./
COPY client/src ./src
COPY design ./design
RUN chown -R node:node /app
EXPOSE 5173
CMD ["npm", "run", "dev"]

FROM development AS build
ARG VITE_API_URL=
ENV VITE_API_URL=${VITE_API_URL}
ENV DESIGN_PATH=/design
RUN npm run build

FROM nginx:1.29.7-alpine AS production
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD wget -q -O /dev/null http://127.0.0.1/health || exit 1
