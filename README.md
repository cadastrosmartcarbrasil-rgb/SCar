# SCar — Sistema de Gestão para Associação de Proteção Veicular

Plataforma web escalável (10.000+ veículos) para gestão de uma associação de
proteção veicular (mutuário/seguro): clientes e frota, financeiro com DRE,
integração bancária, workflow de sinistros com protocolos, e portal do associado.

## Stack

| Camada | Tecnologia |
| --- | --- |
| Frontend / API | **Next.js 14 (App Router)** — Server Components + Route Handlers |
| State & Data Fetching | **TanStack Query** (React Query) |
| Auth / DB / Storage | **Supabase** (PostgreSQL + RLS, Auth, Storage) |
| Serverless | **Supabase Edge Functions** (Deno) — webhook bancário e e-mail |
| E-mail | **Resend** (via Edge Function `enviar-email`) |
| Estilo | Tailwind CSS + lucide-react + Recharts |
| Deploy | **Vercel** (app) + **Supabase Cloud** (backend) |

### Decisões de arquitetura (importantes)

- **Next.js full-stack em vez de NestJS separado.** Server Components e Route
  Handlers cumprem o papel da API REST sem uma segunda infra para operar no
  deploy Vercel.
- **`supabase-js` em vez de Prisma no caminho de dados.** Prisma conecta direto
  ao Postgres e **ignora o RLS**. O `supabase-js` propaga o JWT do usuário e
  respeita as políticas — essencial para o multi-tenant por regional. O
  `schema.sql` (migrations) é a fonte de verdade do banco.
- **RLS é a espinha de segurança.** Toda tabela tem políticas por papel e
  regional; o Portal do Associado enxerga apenas os próprios dados.

## Estrutura

```
scar/
├── supabase/
│   ├── migrations/
│   │   ├── 0001_schema.sql            # extensões, enums, tabelas, índices
│   │   ├── 0002_functions_triggers.sql# protocolo, tramitação, comissão, DRE
│   │   ├── 0003_rls.sql               # políticas RLS + bucket Storage
│   │   └── 0004_seed.sql              # catálogos (DRE, planos, templates)
│   ├── functions/
│   │   ├── webhook-banco/index.ts     # conciliação de pagamento
│   │   └── enviar-email/index.ts      # templates dinâmicos via Resend
│   └── config.toml
├── src/
│   ├── lib/supabase/{client,server,admin,middleware}.ts
│   ├── lib/database.types.ts          # tipos (regenerar com `npm run db:types`)
│   ├── hooks/                         # TanStack Query (dashboard, eventos, dre)
│   ├── components/                    # dashboard, financeiro (DRE), sinistros
│   └── app/                           # App Router (dashboard + portal + api)
└── middleware.ts                      # refresh de sessão + guarda de rotas
```

## Modelo de dados (resumo)

- **Organização:** `regionais`, `usuarios` (↔ `auth.users`), `vendedores`
- **Associados/Frota:** `clientes` (1→N) `veiculos`, `planos_protecao`
- **Financeiro:** `titulos_financeiros`, `movimentacoes_caixa`, `categorias_dre`,
  `comissoes_vendas`
- **Sinistros:** `eventos_sinistro` (+ `historico_protocolo`, `anexos_evento`,
  `cotacoes_pecas`, `itens_cotacao`, `notas_fiscais_evento`)
- **Comunicação:** `email_templates`

### Regras de negócio no banco (PL/pgSQL)

- **Protocolo** `EVT-YYYYMMDD-XXXX` gerado por trigger (`fn_gerar_numero_protocolo`,
  sequencial diário com advisory lock anti-corrida).
- **Tramitação:** `transferir_protocolo(evento, destino, parecer, novo_status)` —
  atualiza operador e grava `historico_protocolo` atomicamente.
- **Comissão automática:** ao liquidar um título (`status = 'pago'`),
  `fn_calcular_comissao` insere a comissão do vendedor (adesão vs. recorrente).
- **DRE:** `gerar_dre(inicio, fim, regional?)` e `gerar_dre_resumo(...)` agregam
  receitas, custos variáveis (inclui custo de sinistro por NF) e despesas fixas.

---

## 1. Rodando localmente

```bash
# 1. Dependências
npm install

# 2. Supabase local (requer Docker) — sobe DB, Auth, Storage e aplica migrations
npx supabase start
npx supabase db reset          # aplica migrations/ e seed

# 3. Variáveis de ambiente
cp .env.example .env.local
#   preencha NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY
#   (o `supabase start` imprime esses valores no terminal)

# 4. App
npm run dev                    # http://localhost:3000

# 5. (opcional) Edge Functions locais
npm run functions:serve
```

Gerar/atualizar os tipos do banco a partir do schema real:

```bash
npm run db:types               # supabase gen types typescript --local
```

---

## 2. Deploy do banco no Supabase (produção)

1. Crie um projeto em [app.supabase.com](https://app.supabase.com).
2. Vincule o repositório ao projeto e aplique as migrations:
   ```bash
   npx supabase login
   npx supabase link --project-ref SEU_PROJECT_REF
   npx supabase db push          # aplica supabase/migrations/*.sql
   ```
3. O bucket privado `sinistros-docs` e as políticas de Storage são criados pela
   migration `0003_rls.sql`.
4. **Edge Functions e secrets:**
   ```bash
   npx supabase functions deploy webhook-banco --no-verify-jwt
   npx supabase functions deploy enviar-email
   npx supabase secrets set RESEND_API_KEY=... EMAIL_FROM="SCar <no-reply@seudominio>" \
     GATEWAY_WEBHOOK_SECRET=... 
   ```
5. Configure o webhook do gateway (Asaas/PJBank) apontando para:
   `https://SEU_REF.functions.supabase.co/webhook-banco`
   com o header do segredo (`asaas-access-token` / `x-webhook-secret`).
6. **Primeiro admin:** crie o usuário no Auth (Dashboard → Authentication) com
   `user_metadata` contendo `{"nome":"...","papel":"admin"}`. O trigger
   `fn_handle_new_user` provisiona automaticamente o perfil em `usuarios`.
   Para associados do Portal, crie o `auth.users` **sem** `papel` e preencha
   `clientes.auth_user_id` com o id gerado.
7. **(Opcional) Cron de vencidos:** agende `select marcar_titulos_vencidos();`
   diariamente via `pg_cron` (extensão) ou Scheduled Function.

---

## 3. Deploy do app na Vercel

1. Importe o repositório em [vercel.com/new](https://vercel.com/new)
   (framework detectado: **Next.js**).
2. Em **Environment Variables**, adicione:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` *(secret — usada só no servidor)*
   - `NEXT_PUBLIC_SUPABASE_BUCKET_SINISTROS=sinistros-docs`
3. Em Supabase → Authentication → URL Configuration, adicione o domínio da
   Vercel em **Site URL** e **Redirect URLs**.
4. Deploy. A cada push na branch de produção a Vercel refaz o build.

---

## Rotas principais

| Rota | Descrição |
| --- | --- |
| `/login` | Login do staff (e-mail + senha) |
| `/dashboard` | KPIs (veículos ativos, sinistros, MRR, inadimplência) + gráfico |
| `/clientes` | Clientes PF/PJ e frota (1→N) |
| `/sinistros` | Kanban de protocolos por status (drag-and-drop) |
| `/sinistros/[id]` | Gestão do protocolo: dados, anexos (upload), cotação, histórico, tramitação |
| `/financeiro` | Relatório DRE com filtro por período |
| `/portal/login` | Login do associado (CPF/CNPJ + senha) |
| `/portal` | Frota protegida + 2ª via de boletos + abrir sinistro |
| `POST /api/boletos/emitir-lote` | Emissão de boletos em lote (gateway mockado) |

## Segurança

- **RLS habilitado em todas as tabelas.** Papéis `admin`/`financeiro` têm acesso
  global; os demais são restritos à própria regional; associados só veem seus dados.
- **Storage privado.** Anexos ficam no bucket `sinistros-docs`; acesso via URL
  assinada temporária e política que valida o `evento_id` no path.
- **`service_role`** nunca é exposta ao cliente — usada apenas em Route Handlers
  e Edge Functions.
