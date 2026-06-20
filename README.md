# Nossa Grana — Finanças Pessoais & Familiares

PWA de finanças pessoais e familiares. Monorepo npm.

- **`apps/api`** — backend Fastify + TypeScript + Prisma + PostgreSQL (pronto).
- **`apps/web`** — PWA React + Vite + shadcn/ui, offline-first (pronto).

A fundação de modelagem está em [`ARQUITETURA.md`](./ARQUITETURA.md) e
[`apps/api/prisma/schema.prisma`](./apps/api/prisma/schema.prisma).

---

## Pré-requisitos

- Node.js 20+ (testado no 22)
- Docker (para o Postgres de dev) **ou** um PostgreSQL local

## Setup rápido

```bash
npm install                 # instala todo o monorepo

# 1) Banco (opção A: Docker)
npm run db:up               # sobe Postgres em localhost:5432

# 1) Banco (opção B: Postgres próprio)
#    edite apps/api/.env -> DATABASE_URL apontando para o seu banco

# 2) Configurar o .env do backend
cp apps/api/.env.example apps/api/.env   # e troque os segredos JWT

# 3) Migração + client + seed
npm run prisma:migrate      # cria as tabelas (1ª migration)
npm run seed                # popula instituições (bancos BR)

# 4) Rodar a API
npm run dev                 # http://localhost:3333  (health: /health)
```

> Segredos JWT: gere com `openssl rand -hex 48` e cole em
> `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`.

## Scripts (raiz)

| Script | O que faz |
|--------|-----------|
| `npm run dev` | API em watch (tsx) |
| `npm run build` | Compila os workspaces |
| `npm run db:up` / `db:down` | Sobe/derruba o Postgres (docker compose) |
| `npm run prisma:migrate` | `prisma migrate dev` |
| `npm run prisma:studio` | Prisma Studio |
| `npm run seed` | Seed de instituições |
| `npm run jobs --workspace apps/api` | Roda os jobs de manutenção uma vez |

---

## Arquitetura do backend

```
apps/api/src
├── env.ts                 # validação de env (zod) — falha cedo
├── prisma.ts              # PrismaClient singleton
├── server.ts              # monta o Fastify (helmet, cors, rate-limit, plugins)
├── routes.ts              # árvore de rotas sob /api
├── index.ts              # entrypoint (sobe server + scheduler)
├── lib/                   # erros, senha (argon2), tokens, datas, dinheiro,
│                          # saldo derivado, recorrência, papéis, atividade
├── plugins/               # prisma, auth (JWT), workspace (multi-tenant), erros
├── modules/               # um diretório por domínio (rotas + service)
│   ├── auth, workspaces, members, invitations, institutions
│   ├── accounts, categories, tags, transactions, budgets
│   ├── recurring, installments, invoices, investments
│   ├── sync          # push/pull offline-first
│   └── forecast      # previsão de saldo + resumo do dashboard
└── jobs/                  # materializar recorrências + fechar faturas
```

### Decisões-chave (ver `ARQUITETURA.md`)

- **Multi-tenant rígido:** toda rota de dados vive sob
  `/api/workspaces/:workspaceId/*` e passa por `authenticate` + `resolveWorkspace`,
  que garante que o usuário é membro e injeta `request.workspace` (id, role).
  Permissões por `MemberRole` (OWNER > ADMIN > MEMBER > VIEWER) via `requireRole`.
- **Dinheiro é `Decimal`**, nunca float. Serializa como string no JSON (preserva
  precisão). Helpers em `lib/money.ts`.
- **Saldo é derivado** (`lib/balance.ts`): `openingBalance` + Σ transações
  `COMPLETED`. Transferência grava `amount` **assinado** nas duas pernas
  (− origem / + destino) para o saldo de cada conta ficar correto.
- **Soft delete** em tudo (`deletedAt`) — o sync precisa propagar remoções.
- **Auth:** access JWT curto (15 min) + refresh opaco rotativo guardado (hash) em
  `Session`, revogável. Rotação detecta reuso.

### Sync offline-first

- `POST /api/workspaces/:id/sync/push` — lote idempotente por `clientId` (UUID do
  device). Upsert por `clientId`; referências criadas no mesmo lote são resolvidas
  via `idMap` (ordem contas → categorias → transações). Conflito = **last-write-wins
  por ordem de chegada** (servidor é a autoridade de relógio).
- `GET /api/workspaces/:id/sync/pull?since=<ISO>` — delta de tudo com
  `updatedAt > since` (inclui removidos). `serverTime` vira o novo watermark.

### Jobs

- **Materializar recorrências:** gera ocorrências futuras como `Transaction`
  `PENDING` até `forecastHorizon` meses (controle por `materializedUntil`).
- **Fechar faturas:** `OPEN → CLOSED` ao fim do ciclo; `CLOSED` vencida → `OVERDUE`.

Rodam in-process (scheduler a cada 6h) e também via `npm run jobs` (cron externo).

### Previsão (`/forecast`)

`saldo_inicial + conhecidos (PENDING materializados) ± estimativa de variáveis
(média móvel dos últimos N meses)`, encadeado mês a mês, sinalizando meses
negativos. Resumo do dashboard em `/forecast/summary`.

---

## Visão geral dos endpoints

Base: `http://localhost:3333/api`

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/auth/register` `/auth/login` `/auth/refresh` `/auth/logout` | Auth |
| GET | `/auth/me` | Usuário atual |
| GET/POST | `/workspaces` | Listar/criar workspaces |
| GET/PATCH/DELETE | `/workspaces/:id` | Detalhe/editar/excluir |
| GET/PATCH | `/workspaces/:id/settings` | Configurações (moeda, mês financeiro…) |
| GET/PATCH/DELETE | `/workspaces/:id/members[/:memberId]` | Membros |
| GET/POST/`:id/revoke` | `/workspaces/:id/invitations` | Convites |
| POST | `/invitations/accept` | Aceitar convite |
| CRUD | `/workspaces/:id/accounts` | Contas (+ saldo, limite do cartão) |
| CRUD | `/workspaces/:id/categories` `/tags` | Categorias / tags |
| GET/POST/PATCH/DELETE | `/workspaces/:id/transactions` | Transações |
| GET | `/workspaces/:id/transactions/payables` | Contas a pagar/receber |
| POST | `/workspaces/:id/transactions/transfer` | Transferência |
| POST | `/workspaces/:id/transactions/:id/pay` | Efetivar pendência |
| GET/POST/DELETE | `/workspaces/:id/budgets` | Orçamentos (com gasto) |
| CRUD | `/workspaces/:id/recurring` | Recorrências |
| GET/POST/DELETE | `/workspaces/:id/installments` | Parcelamentos |
| GET/`:id/pay` | `/workspaces/:id/invoices` | Faturas de cartão |
| GET/POST/PATCH | `/workspaces/:id/investments/assets` | Ativos (posição derivada) |
| POST/DELETE | `/workspaces/:id/investments/transactions` | Movimentos |
| POST/GET | `/workspaces/:id/sync/push` `/sync/pull` | Sync |
| GET | `/workspaces/:id/forecast` `/forecast/summary` | Previsão / resumo |
| GET | `/workspaces/:id/activity` | Feed de atividade |

Veja exemplos prontos em [`apps/api/requests.http`](./apps/api/requests.http).

---

## Frontend (`apps/web`) — PWA offline-first

React + Vite + **shadcn/ui** (Tailwind + Radix), **TanStack Query** (leitura
online), **Dexie** (IndexedDB) e **vite-plugin-pwa** (service worker instalável).

```bash
npm run dev:web        # http://localhost:5173 (proxy /api -> :3333)
npm run build --workspace apps/web
```

> `apps/web/.env`: `VITE_API_URL` vazio em dev (usa o proxy do Vite). Em produção
> aponte para o host da API.

### Como o offline funciona

- **Transações são 100% local-first.** Toda criação/edição/pagamento grava no
  IndexedDB e numa **fila (outbox)**; a UI atualiza na hora (optimistic). Quando há
  rede, o `SyncProvider` chama `POST /sync/push` (idempotente por `clientId`) e
  `GET /sync/pull` para baixar o delta. Funciona no metrô sem sinal.
- **Saldos são calculados no cliente** a partir das transações locais (em
  centavos, sem erro de float) — disponíveis mesmo offline.
- **Contas e categorias** são geridas online (REST) e espelhadas no IndexedDB pelo
  pull para leitura offline.
- **Previsão** (`/forecast`) é online (gráfico Recharts).
- Indicador de sync no header (online/offline + nº de itens na fila) e **modo
  privacidade** (oculta valores).

### Estrutura

```
apps/web/src
├── api/           # client (fetch + refresh automático), endpoints, types, tokens
├── auth/          # AuthProvider (login/registro/logout)
├── workspace/     # WorkspaceProvider (workspace ativo)
├── sync/          # engine (push/pull), mutations local-first, SyncProvider
├── db/            # Dexie (IndexedDB) — accounts, categories, transactions, outbox
├── hooks/         # leitura reativa (useLiveQuery) + cálculo de saldo
├── components/    # AppLayout, TransactionFormModal, ui/ (shadcn)
├── pages/         # Login, Register, Dashboard, Accounts, Transactions, Payables, Forecast
└── ui/            # PrivacyProvider
```

## Próximos passos sugeridos

- Compartilhar tipos entre api/web num `packages/shared`.
- Telas de orçamentos, recorrências, parcelamentos, faturas e investimentos no
  front (os endpoints já existem).
- Code-splitting por rota (o bundle inicial passa de 500 kB).
- Push notifications e tela de membros/convites (família).
