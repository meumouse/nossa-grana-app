# Nossa Grana — App (PWA)

Frontend headless do **Nossa Grana** (finanças pessoais & familiares).
PWA **offline-first** em **React 18 + Vite 6 + TypeScript**, shadcn/ui (Tailwind +
Radix), TanStack Query (estado de servidor) e Dexie/IndexedDB (estado local/sync).

O backend vive em um repositório separado: **`nossa-grana-api`** (Fastify + Prisma).

## Sumário

- [Stack](#stack)
- [Rodando em dev](#rodando-em-dev)
- [Como o app fala com a API](#como-o-app-fala-com-a-api)
- [Scripts](#scripts)
- [Variáveis de ambiente](#variáveis-de-ambiente)
  - [Login com Google — como obter o Client ID](#login-com-google--como-obter-o-client-id)
- [PWA](#pwa)
- [Docker (web + nginx)](#docker-web--nginx)

## Stack

- **React 18 + Vite 6 + TypeScript**
- **shadcn/ui** (Tailwind CSS + Radix UI) — `cn()` (clsx + tailwind-merge), `cva`
- **TanStack Query** (estado de servidor) + **Dexie** (offline-first, outbox/sync)
- **React Router 6**, **Recharts** (gráficos de previsão)
- **lucide-react** + **simple-icons** (logos de banco), **sonner** (toasts)
- **intl-tel-input** (telefone internacional)
- **vite-plugin-pwa** (service worker, instalável)

## Rodando em dev

Pré-requisito: **Node ≥ 20**.

```bash
npm install
cp .env.example .env     # VITE_API_URL vazio em dev (usa o proxy do Vite)
npm run dev              # http://localhost:5173
```

O Vite faz proxy de `/api` e `/health` para `http://127.0.0.1:3333` — suba a API
(repo `nossa-grana-api`) em paralelo: `npm run dev` lá.

> **Antes de concluir qualquer mudança**, rode `npm run typecheck` — é a principal
> rede de segurança (não há testes automatizados ainda).

## Como o app fala com a API

- **Dev:** `VITE_API_URL` vazio → o app chama `/api` na mesma origem e o
  **proxy do Vite** redireciona para `http://127.0.0.1:3333` (sem CORS).
- **Docker:** o nginx serve o SPA e faz proxy `/api → api:3333` (mesma origem).
- **Deploy desacoplado (CDN/estático):** defina `VITE_API_URL=https://api.seu-dominio`
  no build; aí o app chama a API por URL absoluta e a API precisa liberar `CORS_ORIGIN`.

## Scripts

| Script | Descrição |
| --- | --- |
| `npm run dev` | Vite dev server (porta 5173) |
| `npm run build` | `tsc -b && vite build` → `dist/` |
| `npm run preview` | Serve o build de produção localmente |
| `npm run typecheck` | `tsc -b --noEmit` |

## Variáveis de ambiente

Configuradas em `.env` (ver [`.env.example`](.env.example)). Como é um app Vite,
**só variáveis com prefixo `VITE_` chegam ao browser** e são embutidas no build.

| Variável | Obrigatória | Default | Descrição |
| --- | :---: | --- | --- |
| `VITE_API_URL` | | (vazio = proxy do Vite) | URL base da API em produção, ex.: `https://api.nossagrana.app`. Em dev deixe vazio para usar o proxy `/api → :3333` |
| `VITE_GOOGLE_CLIENT_ID` | | — | Client ID OAuth do Google. Sem ele, o botão "Entrar com Google" não aparece (o app segue com e-mail/senha) |

### Login com Google — como obter o Client ID

O app usa **Google Identity Services**: obtém um *ID token* e o envia à API, que
o valida. Use o **mesmo Client ID** aqui (`VITE_GOOGLE_CLIENT_ID`) e na API
(`GOOGLE_OAUTH_CLIENT_ID`).

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/) e crie (ou
   selecione) um projeto.
2. Configure a **OAuth consent screen** (*APIs & Services → OAuth consent screen*):
   **External**, nome do app, e-mail de suporte. Em dev pode ficar em *Testing*.
3. Vá em **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
4. **Application type:** **Web application**.
5. Em **Authorized JavaScript origins**, adicione as origens do PWA:
   - Dev: `http://localhost:5173`
   - Produção: `https://seu-dominio.app`
6. Copie o **Client ID** para `VITE_GOOGLE_CLIENT_ID` (e `GOOGLE_OAUTH_CLIENT_ID`
   na API).

## PWA

- `vite-plugin-pwa` gera service worker + manifest (`registerType: 'autoUpdate'`),
  app instalável no celular.
- Requisições à API usam estratégia **NetworkFirst** (`api-cache`, timeout 5s) — o
  sync próprio do app cuida do offline de **escrita**; o cache só acelera GETs.
- `/api` fica fora do `navigateFallback` (o SPA fallback não intercepta a API).

> Ao mexer em caching/manifest, valide que o app ainda funciona offline.

## Docker (web + nginx)

```bash
docker network create nossa-grana-net   # uma vez (rede compartilhada com a API)
# Suba a API primeiro (repo nossa-grana-api): docker compose up -d
docker compose up -d --build             # web em http://localhost:8081
```

O nginx serve o SPA e faz proxy `/api → API` (mesma origem, sem CORS). O host da
API é injetado por `envsubst` via a variável **`API_UPSTREAM`** (ex.: `api:3333` no
compose local; `<projeto>_nossa-grana-api:3333` no EasyPanel). Veja
[`nginx.conf`](nginx.conf), o [`Dockerfile`](Dockerfile) e o
[`docker-compose.yml`](docker-compose.yml).
