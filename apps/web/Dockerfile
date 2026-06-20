# Build context = raiz do monorepo (nossa-grana-app).
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY apps/web ./apps/web
COPY tsconfig.base.json ./
# VITE_API_URL vazio → o app chama /api na mesma origem (o nginx faz o proxy).
RUN npm run build --workspace apps/web

FROM nginx:alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
