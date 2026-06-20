# Build context = raiz do monorepo (nossa-grana-app).
FROM node:22-alpine AS build
WORKDIR /app

# Toolchain p/ módulos nativos (argon2) durante o npm ci.
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY apps/api ./apps/api
COPY tsconfig.base.json ./
RUN npm run prisma:generate --workspace apps/api \
  && npm run build --workspace apps/api

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Copia o app já buildado + dependências (com Prisma client gerado).
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/api ./apps/api

EXPOSE 3333

# Sobe o schema no banco (db push) + seed e inicia a API.
CMD ["sh", "-c", "cd apps/api && npx prisma db push --skip-generate && npx prisma db seed && node dist/index.js"]
