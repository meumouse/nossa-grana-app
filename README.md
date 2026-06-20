# Nossa Grana — App (PWA)

Frontend headless do **Nossa Grana** (finanças pessoais & familiares).
PWA offline-first em **React + Vite + TypeScript**, shadcn/ui (Tailwind + Radix),
TanStack Query e Dexie (IndexedDB).

O backend vive em um repositório separado: **`nossa-grana-api`** (Fastify + Prisma).

## Stack

- **React 18 + Vite 6 + TypeScript**
- **shadcn/ui** (Tailwind CSS + Radix UI, lucide, sonner)
- **TanStack Query** (estado de servidor) + **Dexie** (offline-first, outbox/sync)
- **vite-plugin-pwa** (service worker, instalável)
- **Recharts** (gráficos de previsão)

## Rodando em dev

```bash
npm install
cp .env.example .env     # VITE_API_URL vazio em dev (usa o proxy do Vite)
npm run dev              # http://localhost:5173
```

O Vite faz proxy de `/api` e `/health` para `http://localhost:3333` — suba a API
(repo `nossa-grana-api`) em paralelo: `npm run dev` lá.

## Como o app fala com a API

- **Dev:** `VITE_API_URL` vazio → o app chama `/api` na mesma origem e o
  **proxy do Vite** redireciona para `http://localhost:3333` (sem CORS).
- **Docker:** o nginx serve o SPA e faz proxy `/api → api:3333` (mesma origem).
- **Deploy desacoplado (CDN/estático):** defina `VITE_API_URL=https://api.seu-dominio`
  no build; aí o app chama a API por URL absoluta e a API precisa liberar `CORS_ORIGIN`.

## Docker (web + nginx)

```bash
docker network create nossa-grana-net   # uma vez (rede compartilhada com a API)
# Suba a API primeiro (repo nossa-grana-api): docker compose up -d
docker compose up -d --build             # web em http://localhost:8081
```

## Scripts

| Script | Descrição |
| --- | --- |
| `npm run dev` | Vite dev server (porta 5173) |
| `npm run build` | `tsc -b && vite build` → `dist/` |
| `npm run preview` | Serve o build de produção localmente |
| `npm run typecheck` | `tsc -b --noEmit` |

## Variáveis de ambiente

Veja [`.env.example`](.env.example). Única var: `VITE_API_URL` (vazia em dev).
