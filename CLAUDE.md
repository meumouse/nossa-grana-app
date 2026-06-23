# Nossa Grana — App PWA (convenções)

Frontend PWA **offline-first**: **React 18 + Vite 6 + TypeScript 6**, TanStack
Query (estado de servidor), Dexie/IndexedDB (estado local), Tailwind +
shadcn/ui (Radix), React Router 6.

> Leia primeiro o [`CLAUDE.md` da raiz](../CLAUDE.md) e a
> [`ARQUITETURA.md`](ARQUITETURA.md) (fundação do modelo, sync e previsão).

## Comandos

```bash
npm run dev          # vite (porta 5173; o launch.json usa 5180)
npm run typecheck    # tsc -b --noEmit  ← rode SEMPRE antes de concluir
npm run build        # tsc -b && vite build
npm run preview      # serve o build
```

O dev server faz proxy de `/api` e `/health` → `http://127.0.0.1:3333`
(ver `vite.config.ts`). Suba a API antes para testar com dados reais.

## Estrutura

```
src/
  main.tsx, App.tsx     entry + roteamento
  pages/                uma página por rota (XxxPage.tsx)
  components/
    ui/                 shadcn/ui (Radix) — primitivos reutilizáveis
    *.tsx               componentes de domínio (modais, layout, nav)
  providers/            contextos: auth/, workspace/, sync/, ui/ (theme, privacy)
  api/                  client.ts, endpoints.ts, types.ts, tokens.ts
  db/dexie.ts           modelo local (IndexedDB) — fonte do offline
  sync/                 engine.ts (pull/push), mutations.ts (fila)
  hooks/                useLiveData, usePagedList, useSelection
  lib/                  format.ts, utils.ts, duplicates.ts, image.ts, avatars.ts…
```

## Regras de ouro do frontend

1. **Offline-first: escreva local primeiro.** Toda mutação grava no Dexie + na
   fila de mutations e atualiza a UI na hora (optimistic). O push para a API é
   responsabilidade do `sync/engine.ts` — **não** chame o endpoint de escrita
   direto de um componente.
2. **Leitura reativa via Dexie.** Use os hooks (`useLiveData` etc., sobre
   `dexie-react-hooks`) para ler do IndexedDB; a UI reflete o estado local que o
   sync mantém atualizado. TanStack Query é para o que **não** persiste offline.
3. **`Money` é `string`, não `number`.** Formate sempre com os helpers de
   [`lib/format.ts`](src/lib/format.ts) (`formatMoney`, `formatMoneyCents`).
   Respeite o modo privacidade: `formatMoney(v, hidden)` (o `hidden` vem do
   `PrivacyProvider`).
4. **Referências guardam a `key` local** (clientId p/ criados aqui; id do
   servidor p/ vindos só do pull). A tradução para id/clientId do servidor
   acontece no push — não assuma que `accountId` num registro local é o id do
   servidor.
5. **Chamadas de API** passam pelo `api/client.ts` (faz refresh de token
   automático e lança `ApiError`/`OfflineError`). Endpoints ficam centralizados
   em `api/endpoints.ts` — não monte URL na mão no componente.
6. **Erros:** trate `OfflineError` degradando para o fluxo offline (não mostre
   erro vermelho); `ApiError` use `.code`/`.message` para o toast (Sonner).

## UI / estilo

- **Componentes base:** use os de `components/ui/` (shadcn/ui). Só crie um novo
  primitivo se não existir.
- **Estilo:** Tailwind. Combine classes condicionais com `cn()` de
  [`lib/utils.ts`](src/lib/utils.ts) (clsx + tailwind-merge) — nunca concatene
  strings de classe na mão.
- **Variantes de componente:** `class-variance-authority` (cva), seguindo o
  padrão dos componentes existentes em `ui/`.
- **Ícones:** `lucide-react`; logos de banco/marca via `simple-icons`
  (`BankLogo.tsx`).
- **Mobile-first:** o app é instalável e usado no celular. `BottomNav` é a
  navegação primária no mobile; teste layouts em viewport estreito.
- **Toasts:** `sonner`. **Tema:** `ThemeProvider` (dark/light/system).

## PWA

- `vite-plugin-pwa` gera service worker + manifest. `/api` usa estratégia
  **NetworkFirst** (ver `vite.config.ts`). Ao mudar caching/manifest, valide que
  o app ainda funciona offline.

## Campos específicos já resolvidos (não reinventar)

- **Telefone internacional:** `intl-tel-input` v29 vanilla (sem wrapper React);
  opção é `uiTranslations` (não `i18n`), tema via CSS vars da lib.
