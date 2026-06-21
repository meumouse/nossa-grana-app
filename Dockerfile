# Build context = raiz do repo (nossa-grana-app).
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# VITE_API_URL vazio → o app chama /api na mesma origem (o nginx faz o proxy).
RUN npm run build

FROM nginx:alpine AS runtime
# Host:porta da API, injetado no boot via envsubst (templates/*.template).
# Default = host interno do EasyPanel (<projeto>_<serviço>); o compose local
# sobrescreve com "api:3333".
ENV API_UPSTREAM=n8n_nossa-grana-api:3333
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
