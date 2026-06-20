# Arquitetura — PWA de Finanças Pessoais & Familiares

Documento de fundação. Acompanha o `schema.prisma`. Foco: por que o modelo é
assim e como cada funcionalidade se apoia nele.

---

## 1. Stack recomendada

Alinhada ao que você já usa:

| Camada        | Escolha                                   | Por quê |
|---------------|-------------------------------------------|---------|
| Banco         | PostgreSQL                                | Decimal nativo, JSONB, índices parciais, RLS opcional |
| ORM           | Prisma                                     | Você já domina; migrations + tipos |
| API           | Fastify + TypeScript                       | Performance, schema-validation nativo (Zod/TypeBox) |
| Auth          | Access JWT curto (~15min) + refresh rotativo | Stateless no edge, revogável via `Session` |
| Storage       | S3/R2 p/ anexos                            | Guarde só a chave/URL no banco (`Attachment.url`) |
| Frontend      | PWA (React/Vue) + Vite + service worker    | Mobile-first, instalável, offline |
| Cache local   | IndexedDB (Dexie) + fila de mutations      | Base do offline-first |

> **Prisma 7**: a CLI nova exige mover `url = env("DATABASE_URL")` do
> `datasource` para um `prisma.config.ts`. Se estiver no Prisma 5/6 (mais comum),
> o schema funciona como está. Se for v7, remova a linha `url` e configure no
> `prisma.config.ts`.

---

## 2. Decisões de modelagem (as que doem se errar)

**Dinheiro nunca é Float.** Uso `Decimal(18,2)` para valores e `Decimal(18,8)`
para quantidade/preço de ativos. Float acumula erro em somas — inaceitável em
finanças. (Alternativa válida: inteiros em *minor units*/centavos; escolhi
Decimal pela legibilidade e por suportar multi-moeda com casas diferentes.)

**`amount` é sempre positivo; o sinal vem do `type`.** Evita o clássico bug de
"esqueci o sinal". Receita soma, despesa subtrai, transferência move.

**Saldo é derivado, não armazenado.** `Account.openingBalance` + soma das
transações `COMPLETED` da conta = saldo atual. Guardar saldo "vivo" gera
divergência sob concorrência (dois membros lançando ao mesmo tempo). Calcule e
**cacheie** (materialized view ou cache em Redis invalidado por escrita).

**Natureza do gasto (fixo/variável/lazer) vive na Categoria** (`CategoryNature`).
Assim a classificação para relatórios e previsão é automática — você não
re-etiqueta cada lançamento.

**Soft delete em tudo** (`deletedAt`). Sync precisa propagar remoções entre
dispositivos; um DELETE físico "some" sem o outro device saber.

---

## 3. Multi-tenancy: perfis e família

- Um **Workspace** = um "perfil" financeiro. `PERSONAL` (1 membro) ou `SHARED`
  (família). Um `User` participa de **vários** workspaces via `Member`.
- **Toda** entidade financeira carrega `workspaceId`. Regra inegociável do
  backend: **toda query filtra por `workspaceId`** do contexto autenticado.
  Centralize isso (plugin Fastify que injeta o workspace ativo + um wrapper de
  Prisma que exige o filtro). Opcional reforçar com **RLS** no Postgres.
- **Permissões** por `MemberRole`: `OWNER` > `ADMIN` > `MEMBER` > `VIEWER`.
  - VIEWER: só leitura. MEMBER: cria/edita lançamentos. ADMIN: membros +
    configurações. OWNER: exclui workspace / billing.
- **Convite** por e-mail via `Invitation` (token + expiração). Aceitar cria um
  `Member`.
- `ActivityLog` dá o feed "Maria adicionou despesa de R$120" — essencial no
  modo compartilhado para transparência.

---

## 4. Sync offline-first (multi-dispositivo)

PWA precisa funcionar no metrô sem sinal. Modelo **client-server com fila**:

1. **Escrita local primeiro.** Toda mutação grava no IndexedDB e numa fila de
   pendências. UI atualiza na hora (optimistic).
2. **Idempotência.** O dispositivo gera o `clientId` (UUID) de cada registro.
   O servidor faz *upsert* por `clientId` → reenviar a fila nunca duplica.
3. **Push.** Quando há rede, a fila envia as mutações em ordem. Resposta traz o
   `id` definitivo do servidor.
4. **Pull incremental (delta).** Cliente guarda o último `syncedAt` e pede
   `GET /sync?since=<timestamp>&workspaceId=...`. Servidor devolve tudo com
   `updatedAt > since` (incluindo `deletedAt` preenchido = remoções).
5. **Conflito → Last-Write-Wins por `updatedAt`** (suficiente p/ finanças
   pessoais; raramente dois editam o MESMO lançamento). Para campos críticos dá
   p/ evoluir a um merge por campo depois.

> Endpoints-chave: `POST /sync/push` (lote de mutações idempotentes) e
> `GET /sync/pull?since=`. Mantenha-os por workspace.

---

## 5. Como cada feature funciona

### Contas a pagar / a receber
São transações `status = PENDING` com `dueDate`:
- `EXPENSE` + `PENDING` + `dueDate` → **a pagar**.
- `INCOME` + `PENDING` + `dueDate` → **a receber**.
Pagar/receber = mudar para `COMPLETED` e setar `paidAt` (aí entra no saldo).
"Vencidas" = `PENDING` com `dueDate < hoje` (calculado, não é status fixo).

### Transferência entre contas
Duas pernas `type = TRANSFER` ligadas pelo mesmo `transferId`, cada uma na sua
conta, com `counterAccountId` apontando para a outra. Mantém o saldo de cada
conta correto e não "cria" nem "destrói" dinheiro.

### Cartão de crédito + fatura
- Conta `type = CREDIT_CARD` com `creditLimit`, `statementClosingDay`,
  `paymentDueDay`, `paymentAccountId` (corrente que paga).
- Compras no cartão são `Transaction` vinculadas a uma `CreditCardInvoice` do
  ciclo (agrupadas por `closingDate`/`dueDate`).
- A fatura aberta/fechada entra na previsão como conta a pagar.
- **Pagar a fatura** = uma `TRANSFER` da corrente → cartão; marca a invoice
  como `PAID`. Limite disponível = `creditLimit` − soma das compras não pagas.

### Compra parcelada
`InstallmentPlan` (total, nº de parcelas, 1ª data) gera N `Transaction`
(`installmentNumber` 1..N). Parcelas futuras nascem `PENDING`/agendadas — então
**já aparecem na previsão** dos próximos meses automaticamente.

### Gasto recorrente
`RecurringTransaction` é o *template* (frequência + intervalo + ancoragem). Um
**job** materializa ocorrências futuras como `Transaction` `PENDING` até
`WorkspaceSettings.forecastHorizon` meses à frente. `materializedUntil` controla
até onde o job já gerou. `autoConfirm` efetiva sozinho na data, se quiser.

### Financiamento
Conta `type = LOAN` com `loanPrincipal`, `loanInstallments`, `loanInterestRate`,
`loanStartDate`. As parcelas modelam-se como recorrência (ou um InstallmentPlan)
— assim aparecem na previsão como qualquer outra obrigação futura.

### Investimentos
Conta `INVESTMENT` → `InvestmentAsset` (ativo) → `InvestmentTransaction`
(BUY/SELL/DIVIDEND/...). **Posição (qtd, preço médio) é derivada** dos
movimentos; cacheie se precisar. Valor de mercado = posição × `lastPrice`.
Cotações podem vir de integração ou entrada manual.

---

## 6. Previsibilidade de gastos (o cálculo)

Previsão do mês M = saldo projetado a partir de fontes **conhecidas** +
**estimadas**:

```
saldo_inicial(M)
  + recorrências materializadas de M        (conhecido)
  + parcelas com vencimento em M            (conhecido)
  + contas a pagar/receber (PENDING) em M   (conhecido)
  + faturas de cartão com vencimento em M   (conhecido)
  ± estimativa de gastos VARIÁVEIS          (média móvel dos últimos
                                             `variableLookback` meses,
                                             por categoria)
= saldo_projetado(M)  →  encadeia para M+1, M+2 ...
```

A parte "conhecida" sai direto do banco (já está modelada como lançamentos
futuros). A parte "estimada" é a média móvel por categoria de natureza
`VARIABLE`/`LEISURE`. Resultado: linha de saldo projetado por mês + alerta de
meses que ficam negativos. Não precisa de tabela própria — é uma query +
agregação; cacheie o snapshot se o cálculo pesar.

---

## 7. Preferências

- `UserPreferences`: tema, privacidade (esconder saldos), notificações,
  workspace padrão, layout do dashboard (`ui` JSON livre).
- `WorkspaceSettings`: moeda base, `monthStartDay` (mês financeiro ≠ civil),
  horizonte de previsão, janela da média móvel, início da semana.

---

## 8. Próximos passos sugeridos

1. `prisma migrate dev` para gerar a 1ª migration e o banco.
2. Seed: instituições (bancos BR) + categorias padrão com `nature` definida.
3. Camada de autorização (plugin de workspace + checagem de `MemberRole`).
4. Endpoints de sync (`push`/`pull`) com upsert por `clientId`.
5. Jobs: materializar recorrências + fechar faturas no `statementClosingDay`.
6. Só então a UI (PWA mobile-first) sobre essa base.
