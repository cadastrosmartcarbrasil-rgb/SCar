# CLAUDE.md — SCar (Proteção Veicular)

> Memória do projeto. Leia isto no início de cada sessão em vez de varrer o repositório inteiro.
> Mantenha este arquivo atualizado ao adicionar módulos/migrations (é barato e faz o projeto andar rápido).

## O que é
Sistema de gestão para **associação de proteção veicular** (associados, frota, eventos/sinistros,
financeiro, precificação por FIPE). Escala esperada: grande (maior que o "Smartvida").
Prioridade: **segurança (RLS)** e **sempre validado** antes de commitar.

- **Repo:** `cadastrosmartcarbrasil-rgb/scar` · **branch de trabalho:** `claude/scar-project-btasdf`
- **Produção:** `https://app.smartvidanet.com.br` (VPS KingHost, Docker + Caddy/HTTPS auto)
- **Idioma:** UI e mensagens em português (sem acentuação em identificadores/SQL para evitar problemas).

## Stack e decisões de arquitetura
- **Next.js 14 (App Router)** — Server Components + Route Handlers fazem o papel de API. Deploy único.
- **Supabase** (Postgres + RLS + Auth + Storage). O caminho de dados usa **`supabase-js`** (respeita RLS),
  NÃO Prisma (Prisma ignora RLS).
- **TanStack Query** para cache/estado client-side. **Tailwind** + lucide-react + Recharts.
- **Edge Functions (Deno)** para webhook bancário e e-mail (Resend).
- **RLS é a espinha de segurança.** Toda tabela tem policies; multi-tenant por `regional`.

## Mapa do repositório
```
supabase/
  migrations/0001..NNNN_*.sql   # historico imutavel; FONTE DE VERDADE do banco
  schema.sql                    # consolidado (todas as migrations) p/ colar no SQL Editor
  functions/                    # edge functions (webhook-banco, enviar-email)
src/
  lib/
    database.types.ts           # tipos do banco (MANUAL, ver "Convencao de tipos")
    supabase/{client,server,admin,middleware}.ts
    documento.ts                # validarCPF/CNPJ, formatar*, calcularIdade
    cep.ts / cnpj.ts / placa.ts # integracoes externas (ViaCEP, BrasilAPI, placa)
    utils.ts                    # cn, formatCurrency, formatDate, monthRange
  hooks/                        # um arquivo por dominio (use-*.ts), TanStack Query
  components/                   # ui/ (Button,Input,Modal,Card,field), + por dominio
  app/(dashboard)/              # telas internas (layout gateia staff + mostra logo)
  app/(auth)/login, app/portal  # login staff e portal do associado
  app/api/                      # route handlers (cnpj, placa, usuarios, portal/login, boletos)
middleware.ts                   # refresh de sessao + guard de rotas
```

## Migrations (ordem)
`0001_schema` · `0002_functions_triggers` · `0003_rls` · `0004_seed` · `0005_integracoes_bancarias`
· `0006_associados` · `0007_veiculos_contratos` · `0008_comunicacoes` · `0009_eventos_completo`
· `0010_precificacao` · `0011_empresa` · `0012_financeiro_fornecedores` · `0013_editor_precos`
· `0014_marcas_modelos` (enum `status_cadastro` ATIVO/INATIVO/SUSPENSO + colunas `tipo_veiculo`,
`idade_maxima`, `status` em modelos e `status` em marcas) · `0015_seed_marcas_modelos`
(carga do relatorio SGA: 241 marcas, 8819 modelos; idempotente via `on conflict do nothing`).

## Módulos (status: todos funcionais)
Associados (painel `/associados/[id]` com abas) · Veículos/Contratos · Eventos/Sinistros
(protocolo, reparo próprio/terceiro, financeiro do evento) · Precificação (simulador + editor de
tabela FIPE com reajuste %) · Empresa (logo/diretoria/mandatos/documentos) · Fornecedores (auto
CNPJ/CEP) · Financeiro (contas a pagar/receber + baixas + DRE) · Configurações (regionais, usuários,
vendedores, marcas/modelos, tipos de veículo, tipos de evento, produtos, contas bancárias,
integrações bancárias, plano de contas).

## Banco de dados — regras
- **Migrations são append-only.** Nunca reescreva uma migration já aplicada em produção; crie a próxima (`ALTER ...`).
- Após criar/editar migration, **regenere `supabase/schema.sql`** (concatenação em ordem).
- Helpers de RLS já existem: `auth_papel()`, `auth_regional_id()`, `is_admin()`, `is_staff()`,
  `tem_acesso_global()` (admin+financeiro), `pode_regional(uuid)`, `auth_cliente_id()`.
- Validação de documento no banco: `validar_cpf`, `validar_cnpj`, `validar_documento(doc, tipo)`.
- Enums existentes são muitos; para novos VALORES de enum use `alter type ... add value if not exists`.

## Convenção de tipos (IMPORTANTE — evita bug de `never`)
`src/lib/database.types.ts` é mantido à mão. Regras que já nos morderam:
- Os `Row` DEVEM ser `type` (NÃO `interface`) — interface não é atribuível a `Record<string,unknown>`
  e o supabase-js infere `never`.
- `Views`/`CompositeTypes` vazios = `{ [_ in never]: never }` (NUNCA `Record<string,never>` — cria index
  signature e quebra os embeds para `never`).
- Cada tabela é `TableDef<Row, [Rel<'col','tabela_ref'>, ...]>`. Sem os `Rel`, os embeds
  (`select('*, outra(campo)')`) viram `SelectQueryError`.
- Para JSONB tipado em formulário, adicione `[key: string]: string | undefined` na interface do endereço/local.
- Versões: `@supabase/ssr@^0.7`, `@supabase/supabase-js@2.111`. Não voltar o ssr para 0.5 (arity incompatível).

## Fluxo de validação (fazer SEMPRE antes de commitar)
Há um Postgres 16 local para testar migrations de verdade (usuário `pgtest`, porta 5433, socket/host 127.0.0.1).
Padrão usado nas sessões:
1. Subir pg como `pgtest`, dropar/recriar schemas `public/auth/storage` + roles `authenticated/anon/service_role`.
2. Aplicar `bootstrap.sql` (stubs de `auth.users`, `auth.uid()`, `storage.*`) e depois todas as migrations em ordem com `ON_ERROR_STOP`.
3. Rodar testes funcionais (ex.: triggers, baixa financeira, motor de preço) — validar valores esperados.
4. `npx tsc --noEmit` (0 erros) e `npm run build` (com env dummy) — 0 erros.
Só então: commit + push. (Docker build da imagem NÃO builda aqui: proxy bloqueia Docker Hub — validar só schema+tsc+build.)

## Commit / deploy
- Commits em PT, com footer:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` + linha `Claude-Session:`.
- Push sempre para `origin claude/scar-project-btasdf`.
- **Atualizar produção:** (A) rodar a migration nova no Supabase SQL Editor; (B) no VPS:
  `cd /opt/scar && git pull && docker compose up -d --build`.
- Raw URL de arquivo (branch tem `/`, use `refs/heads/`):
  `https://raw.githubusercontent.com/cadastrosmartcarbrasil-rgb/scar/refs/heads/claude/scar-project-btasdf/<path>`

## Gotchas já resolvidos (não repetir)
- Erro `syntax error near "//"` no SQL Editor = arquivo TypeScript colado por engano; SQL começa com `--`.
- Trigger com CASE retornando enum: fazer cast `(case ... end)::meu_enum`.
- Comparar `old.status` (enum) com `''` quebra; usar `is [not] distinct from`.
- `useSearchParams` exige `<Suspense>` no build.
- Faltava pasta `public/` para o Docker (`COPY /app/public`) — já criada; Dockerfile faz `mkdir -p public`.

## Como me manter rápido nas próximas sessões
- Leia este arquivo primeiro. Para achar código específico, use busca direcionada (não leia tudo).
- `supabase/schema.sql` responde quase tudo sobre o banco sem abrir 13 migrations.
- Ao entregar um módulo novo: atualize a lista "Módulos" e a lista de migrations aqui.
