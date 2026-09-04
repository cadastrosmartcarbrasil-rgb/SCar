<!--
  NOTA DE IMPLEMENTACAO (SCar) — leia junto com este documento.

  A especificacao abaixo foi escrita sem acesso ao repositorio e propoe algumas
  estruturas que JA EXISTEM aqui com outro nome. O que foi implementado na
  migration `0050_rastreadores_modulo.sql` segue o projeto, como a propria spec
  manda no §1 ("identifique os nomes reais das tabelas"):

  | Spec                      | SCar (implementado)                                  |
  |---------------------------|------------------------------------------------------|
  | `scar_filiais`            | `regionais` — a unidade ja e o eixo do multi-tenant   |
  | `scar_plataformas`        | `empresas_rastreamento` (0049) + custo e `api_config` |
  | `scar_rastreadores`       | `rastreadores`                                        |
  | `scar_rastreador_eventos` | `rastreador_eventos`                                  |
  | `scar_rastreador_manutencoes` | `rastreador_manutencoes`                          |
  | views `scar_vw_*`         | RPCs SECURITY DEFINER com `escopo_regional()`         |
  | Server Actions + Zod      | RPC no banco + hooks TanStack Query (padrao do SCar)  |
  | `types/supabase.ts` gerado| `src/lib/database.types.ts`, mantido a mao            |
  | `exige_rastreador` no plano| `planos_protecao.exige_rastreador` + a regra por tipo |
  |                           | de veiculo que ja existia (`tipos_veiculo`, 0019)     |

  Diferencas deliberadas:
   . Sem prefixo `scar_`: nenhuma tabela do projeto usa prefixo.
   . Sem seed de 30 equipamentos ficticios em migration — dado de mentira nao
     entra em producao. O cenario de teste vive em
     `supabase/tests/0050_rastreadores_modulo.test.sql`.
   . Views substituidas por funcoes: view com RLS herda o dono e vaza escopo;
     todo o resto do sistema usa RPC com `escopo_regional()`.
   . Importacao em massa: mantida FORA (§6).
-->

# Scar — Módulo de Rastreadores (Fase 1: estoque + vínculo com veículo)

> Prompt/especificação para o Claude Code. Cole este arquivo inteiro na raiz do projeto Scar
> (sugestão: `docs/modulos/rastreadores.md`) e peça: "implemente o módulo descrito em
> docs/modulos/rastreadores.md, começando pela migration".

---

## 0. Contexto do produto

O **Scar** é o software de gestão da associação de proteção veicular. Já existe (ou está sendo
construído) o cadastro de **associados**, **veículos** e **planos/mensalidades**. Este módulo
adiciona a gestão do parque de **rastreadores** e, principalmente, **cruza essa informação com o
cadastro de veículos**: todo rastreador ativo deve estar instalado em um veículo conhecido, e todo
veículo cujo plano exige rastreamento deve ter um rastreador ativo. As divergências entre os dois
lados são o principal valor do módulo.

Hoje esse controle vive num sistema separado (TrackerStock) com ~2.400 equipamentos distribuídos em
filiais (Cuiabá, Grande Natal, MT Norte, Ribeirão Preto, São Paulo 1) e plataformas de rastreamento
(D Traker, New Tracker, Lógica, Alerta Virtual, Marcílio Safety, Total Traker, Escritório). O módulo
precisa **absorver esse modelo** — o schema abaixo é desenhado para acomodar essa base sem
remodelagem depois.

> **O sistema está sendo construído do zero e NÃO haverá carga de dados nesta fase.** A importação
> da base atual do TrackerStock só acontece depois que os clientes e veículos estiverem cadastrados
> no Scar — sem cadastro de veículo, o cruzamento (§3) não tem contra-parte e a importação geraria
> milhares de registros órfãos. Não construir importador agora; ver §6.

**Fase 1 (este escopo):** cadastro e ciclo de vida dos equipamentos, filiais, plataformas, vínculo
rastreador ↔ veículo ↔ associado, histórico, relatórios e painel de divergências. Dados entram por
**cadastro manual na tela**.
**Fora do escopo agora:** importação em massa (§6), integração via API/webhook com as plataformas de
rastreamento e régua de cobrança do rastreador (§10).

---

## 1. Stack e convenções obrigatórias

- **Next.js 14.2.13 (App Router) + React 18 + TypeScript 5.6**
- **Supabase**: Postgres + RLS + Auth + Storage
- Server Components por padrão; `"use client"` só onde há interação real (filtros, modais, tabelas).
- Mutações via **Server Actions** (`"use server"`) com validação **Zod** na entrada. Nada de lógica
  de negócio no cliente.
- Acesso ao banco: cliente **anon + RLS** para leitura no contexto do usuário; `service_role`
  somente em rotas/actions de servidor que precisem ignorar RLS (importação, jobs).
- Migrations SQL numeradas em `supabase/migrations/` (ex.: `20260904_0001_rastreadores.sql`).
  **Nunca** editar migration já aplicada — criar uma nova.
- Tipos gerados do banco em `types/supabase.ts`; não escrever tipos à mão para tabelas.
- Nomenclatura de tabelas do módulo: prefixo **`scar_`** (siga o prefixo já usado no projeto se for
  outro — verifique as migrations existentes antes de criar qualquer coisa).
- Datas sempre `timestamptz`; a aplicação exibe em `America/Cuiaba`.
- Mensagens de UI em **pt-BR**. Moeda `R$`, documentos com máscara.

**Antes de escrever código:** leia o schema atual (`supabase/migrations/`, `types/supabase.ts`) e
identifique os nomes reais das tabelas de **veículo**, **associado/cliente**, **contrato/plano** e
**usuário interno**. As FKs abaixo devem apontar para elas, não para nomes inventados.

---

## 2. Modelo de dados

### 2.1 `scar_filiais`
| coluna | tipo | notas |
|---|---|---|
| id | uuid pk default gen_random_uuid() | |
| nome | text not null unique | ex.: "CUIABÁ", "GRANDE NATAL" |
| uf | char(2) | |
| cidade | text | |
| responsavel_id | uuid null → usuários internos | |
| ativa | boolean default true | |
| created_at / updated_at | timestamptz | |

### 2.2 `scar_plataformas`
Plataforma = software/fornecedor onde o equipamento é gerenciado.

| coluna | tipo | notas |
|---|---|---|
| id | uuid pk | |
| nome | text not null unique | D TRAKER, NEW TRACKER, LÓGICA, ALERTA VIRTUAL, MARCILIO SAFETY, TOTAL TRAKER, ESCRITÓRIO |
| custo_mensal_equipamento | numeric(10,2) default 0 | custo pago à plataforma por equipamento ativo |
| url_painel | text | |
| contato | text | |
| api_config | jsonb default '{}' | **placeholder da fase 2**, não usar agora |
| ativa | boolean default true | |

### 2.3 `scar_rastreadores` (tabela central)
| coluna | tipo | notas |
|---|---|---|
| id | uuid pk | |
| imei | text not null unique | **chave natural**; validar 15 dígitos numéricos |
| numero_serie | text | |
| iccid | text | chip |
| linha | text | número da linha (MSISDN) |
| operadora | text | |
| modelo | text | |
| fabricante | text | |
| plataforma_id | uuid not null → scar_plataformas | |
| filial_id | uuid not null → scar_filiais | |
| status | scar_rastreador_status not null default 'DISPONIVEL' | enum §2.4 |
| veiculo_id | uuid null → (tabela de veículos) | preenchido só quando instalado |
| associado_id | uuid null → (tabela de associados) | desnormalizado a partir do veículo, para relatório |
| data_aquisicao | date | |
| valor_aquisicao | numeric(10,2) | |
| nota_fiscal | text | |
| data_instalacao | timestamptz | |
| data_desinstalacao | timestamptz | |
| local_instalacao | text | onde foi escondido no veículo |
| instalador | text | |
| observacoes | text | |
| status_desde | timestamptz not null default now() | usado para regras de prazo (§4) |
| created_at / updated_at / created_by / updated_by | | |

**Índices:** `imei` (único), `(status)`, `(filial_id, status)`, `(plataforma_id, status)`,
`(veiculo_id)` e um **índice único parcial** `unique (veiculo_id) where veiculo_id is not null and
status = 'ATIVO'` — um veículo não pode ter dois rastreadores ativos.

### 2.4 Enum `scar_rastreador_status`
Preservar exatamente esta semântica (é a do sistema atual, a equipe já opera com esses números —
guarde o número em uma coluna gerada ou em constante no front para exibir "2 - Ativo/Instalado"):

| nº | valor do enum | significado |
|---|---|---|
| 1 | `DISPONIVEL` | em estoque, pronto para instalar |
| 2 | `ATIVO` | instalado em veículo |
| 3 | `INADIMPLENTE` | 35+ dias sem pagamento — tentar recuperar |
| 4 | `INATIVO` | pedir devolução |
| 5 | `A_DEVOLVER` | devolução solicitada, prazo de 5 dias |
| 6 | `COBRAR_RASTREADOR` | cobrar o equipamento não devolvido |
| 7 | `BOLETO_GERADO` | boleto do equipamento emitido |
| 8 | `PENDENCIA_DADOS` | cadastro incompleto |
| 9 | `MANUTENCAO` | em reparo |
| 10 | `DUPLICADO` | registro duplicado |
| 11 | `BAIXADO` | sem condição de uso / inutilizado |

### 2.5 `scar_rastreador_eventos` (histórico — append only)
| coluna | tipo |
|---|---|
| id | uuid pk |
| rastreador_id | uuid not null → scar_rastreadores on delete cascade |
| tipo | text not null (`STATUS`, `INSTALACAO`, `DESINSTALACAO`, `TRANSFERENCIA_FILIAL`, `TROCA_PLATAFORMA`, `MANUTENCAO`, `IMPORTACAO`, `OBSERVACAO`) |
| status_anterior / status_novo | scar_rastreador_status null |
| veiculo_anterior_id / veiculo_novo_id | uuid null |
| filial_anterior_id / filial_nova_id | uuid null |
| descricao | text |
| payload | jsonb default '{}' |
| user_id | uuid |
| created_at | timestamptz default now() |

Gravado **sempre** por trigger `AFTER UPDATE` na `scar_rastreadores` (não confiar na aplicação) +
inserções explícitas para eventos de negócio. `status_desde` é atualizado pela mesma trigger quando
o status muda.

### 2.6 `scar_rastreador_manutencoes` (opcional, mas criar)
`id`, `rastreador_id`, `aberta_em`, `fechada_em`, `defeito`, `solucao`, `custo`, `fornecedor`,
`status` (`ABERTA`/`CONCLUIDA`/`SEM_REPARO`). Ao abrir → rastreador vai para `MANUTENCAO`; ao
concluir → volta para `DISPONIVEL` ou vai para `BAIXADO`.

### 2.7 RLS
- `scar_*`: `select` para qualquer usuário autenticado do tenant; `insert/update` conforme papel.
- Papéis: `admin` (tudo), `gestor_filial` (só a sua `filial_id`), `operador` (instalar/desinstalar,
  sem baixa), `consulta` (somente leitura). Escrever as policies explicitamente e testá-las.
- `scar_rastreador_eventos`: `select` para autenticados; `insert` só por trigger/service_role;
  **sem update/delete para ninguém**.

---

## 3. Cruzamento com o cadastro de veículos (o coração do módulo)

Criar a view `scar_vw_rastreador_veiculo` juntando `scar_rastreadores` ← veículo ← associado ←
contrato/plano, expondo: imei, status, filial, plataforma, placa, marca/modelo, ano, chassi, nome e
documento do associado, status do contrato, status financeiro (adimplente/inadimplente), plano e se
o plano **exige rastreador** (`boolean`; se essa flag não existir no cadastro de planos, criar
`exige_rastreador boolean default false` no plano — é pré-requisito deste módulo).

E a view `scar_vw_divergencias`, que é o que a operação vai olhar todo dia. Cada linha tem `tipo`,
`severidade` (`ALTA`/`MEDIA`/`BAIXA`), chave (imei e/ou placa) e descrição:

1. **VEICULO_SEM_RASTREADOR** — plano exige rastreador, contrato ativo, nenhum rastreador `ATIVO`
   vinculado. *(alta)*
2. **RASTREADOR_ORFAO** — status `ATIVO` com `veiculo_id` nulo, ou apontando para veículo
   inexistente/excluído. *(alta)*
3. **RASTREADOR_EM_VEICULO_INATIVO** — rastreador `ATIVO` em veículo cujo contrato está
   cancelado/suspenso → candidato a recolhimento. *(alta)*
4. **INADIMPLENTE_COM_EQUIPAMENTO_ATIVO** — associado inadimplente há mais de N dias (parâmetro,
   default 35) e rastreador ainda `ATIVO` → deveria ser status 3. *(alta)*
5. **VEICULO_COM_MAIS_DE_UM_ATIVO** — mais de um rastreador `ATIVO` no mesmo veículo. *(alta)*
6. **STATUS_INCOERENTE** — `ATIVO` sem `data_instalacao`; `DISPONIVEL` com `veiculo_id`
   preenchido; `A_DEVOLVER` há mais de 5 dias; `BOLETO_GERADO` há mais de 30 dias. *(média)*
7. **CADASTRO_INCOMPLETO** — sem IMEI válido, sem chip/linha, sem plataforma ou sem filial →
   sugerir status 8. *(baixa)*
8. **IMEI_DUPLICADO** — mesmo IMEI/serial em mais de um registro → sugerir status 10. *(alta)*

A tela de divergências lista, filtra por tipo/filial/severidade, exporta CSV e oferece **ação de
correção em um clique** quando ela é óbvia e reversível (ex.: marcar como `PENDENCIA_DADOS`, abrir o
veículo, iniciar desinstalação). Nunca corrigir em massa sem confirmação explícita.

---

## 4. Regras de negócio

- **Instalar**: só a partir de `DISPONIVEL`. Exige `veiculo_id` + `data_instalacao`. Ao instalar:
  status → `ATIVO`, preenche `associado_id` a partir do veículo, grava evento `INSTALACAO`. Bloquear
  se o veículo já tem rastreador ativo (o índice parcial garante no banco; a action deve devolver
  erro amigável).
- **Desinstalar**: de `ATIVO` para `DISPONIVEL` (voltou ao estoque), `MANUTENCAO` ou `BAIXADO`.
  Limpa `veiculo_id`/`associado_id`, preenche `data_desinstalacao`, grava evento.
- **Transição de status**: implementar uma máquina de estados única em
  `lib/rastreadores/transicoes.ts`, usada tanto pela UI (para habilitar botões) quanto pela Server
  Action (para validar). Transições proibidas devolvem erro. Toda mudança exige `motivo` quando o
  destino for `BAIXADO`, `DUPLICADO` ou `COBRAR_RASTREADOR`.
- **Prazos** (calculados sobre `status_desde`, exibidos como alerta na lista):
  `A_DEVOLVER` > 5 dias → sugerir `COBRAR_RASTREADOR`; `INADIMPLENTE` > 35 dias → sugerir
  `INATIVO`/`A_DEVOLVER`; `MANUTENCAO` > 30 dias → destacar.
- **Transferência entre filiais**: action própria, gera evento; não muda status.
- **Exclusão**: rastreador nunca é deletado — usa `BAIXADO` ou `DUPLICADO`.

---

## 5. Telas (App Router)

```
app/(app)/rastreadores/
  page.tsx                      # lista + filtros + ações em massa
  novo/page.tsx
  [id]/page.tsx                 # detalhe: dados, veículo vinculado, timeline de eventos
  [id]/editar/page.tsx
  divergencias/page.tsx         # §3
  relatorios/page.tsx           # §7
  # importar/  -> NÃO criar nesta fase (§6)
app/(app)/rastreadores/filiais/     page.tsx | [id]/page.tsx
app/(app)/rastreadores/plataformas/ page.tsx | [id]/page.tsx
```

- **Dashboard** (pode ser um bloco no `page.tsx` ou card no dashboard geral do Scar): total de
  equipamentos, cards por status (com o número do status ao lado do nome, como a equipe já usa),
  quebra **por filial** e **por plataforma**, e contador de divergências abertas por severidade.
  Cada card é um link que já aplica o filtro correspondente na lista.
- **Lista**: paginada no servidor (nunca carregar 2.400 linhas), busca por IMEI/placa/nome do
  associado/linha, filtros combináveis (status, filial, plataforma, com/sem veículo, período),
  ordenação, seleção múltipla para mudança de status em lote (com confirmação e motivo), exportar
  CSV do resultado filtrado. Filtros refletidos na query string (compartilháveis).
- **Detalhe**: bloco do equipamento, bloco do veículo/associado com link para os cadastros,
  timeline de `scar_rastreador_eventos`, botões de ação conforme a máquina de estados.
- Componentes seguindo o design system já existente no Scar. **Não introduzir biblioteca de UI
  nova** — verificar o que o projeto já usa (shadcn/ui, Tailwind, etc.) e seguir.

---

## 6. Importação da base atual — NÃO IMPLEMENTAR NESTA FASE

A carga da base do TrackerStock fica para depois que os clientes e veículos estiverem cadastrados no
Scar. **Não criar tela, rota, parser nem dependência de planilha agora.**

O que fazer nesta fase é apenas **não fechar a porta**, e isso já está contemplado pelo schema:

- `imei` é `unique` — a deduplicação futura já tem chave natural.
- O tipo de evento `IMPORTACAO` fica declarado em `scar_rastreador_eventos.tipo` desde já, sem
  produtor.
- Nenhum campo do §2 pode ser `not null` sem default além dos que a tela de cadastro manual já
  preenche — assim a carga futura não exige migration.
- Cadastro manual deve aceitar um equipamento sem veículo vinculado (status `DISPONIVEL` ou
  `PENDENCIA_DADOS`), que é como a maior parte da base vai entrar.

Quando a importação for feita (fase posterior), o desenho previsto é: upload CSV/XLSX no Storage,
mapeamento de colunas na tela, **dry-run obrigatório** antes de qualquer escrita, dedup por IMEI,
match de veículo por placa normalizada (Mercosul incluído) sem nunca criar veículo, lotes de 500 em
transação e relatório linha a linha. Registrar isso no backlog, não no código.

---

## 7. Relatórios (com exportação CSV e impressão)

- Posição de estoque por filial e por plataforma (espelha o painel atual).
- Equipamentos ativos por plataforma × **custo mensal** (`qtd_ativos × custo_mensal_equipamento`) —
  quanto se paga por plataforma.
- Instalações e desinstalações por período/filial/instalador.
- Tempo médio em estoque (de `DISPONIVEL` até `ATIVO`) e giro por filial.
- Equipamentos a recuperar: status 3, 4, 5, 6 com associado, veículo, telefone e dias no status.
- Divergências (§3) consolidadas.

---

## 8. Qualidade e testes

- **Vitest** para: máquina de transições (tabela de casos válidos/inválidos), normalização de placa
  e IMEI, cálculo de prazos.
- Como não há carga de dados, criar um **seed de desenvolvimento** (`supabase/seed.sql` ou script)
  com ~30 rastreadores fictícios cobrindo todos os 11 status e algumas divergências propositais —
  senão as telas de dashboard e divergências nascem vazias e sem como validar.
- Testes das **policies de RLS** (gestor_filial não enxerga outra filial; operador não baixa
  equipamento) usando dois clientes Supabase com JWTs diferentes.
- Teste de integração da action de instalação cobrindo o caso "veículo já tem rastreador ativo".
- `npm run lint` e `tsc --noEmit` limpos. Sem `any` em código novo.

---

## 9. Ordem de entrega (faça nesta sequência, parando para revisão a cada etapa)

1. Migration completa (§2) + seed de filiais e plataformas + tipos gerados.
2. Máquina de estados + Server Actions + testes unitários.
3. Lista, detalhe, criar/editar (cadastro **manual** — é a única porta de entrada de dados agora).
4. Dashboard e cards por filial/plataforma.
5. Views de cruzamento e tela de divergências (§3).
6. Relatórios (§7).
7. Policies de RLS revisadas e testadas.

Importação em massa **não entra nesta sequência** (§6).

Ao final de cada etapa: resumo curto do que mudou, arquivos tocados e o que ficou pendente.

---

## 10. Preparado para a fase 2 (não implementar agora)

Deixar a fronteira pronta, sem código morto além do mínimo:

- `scar_plataformas.api_config jsonb` já existe para credenciais (que devem ficar **no banco,
  criptografadas ou via Supabase Vault — nunca em `.env` commitado**).
- Definir a interface `PlataformaAdapter` em `lib/rastreadores/plataformas/types.ts` com
  `sincronizarEquipamentos()`, `obterUltimaPosicao(imei)`, `obterStatusOnline(imei)` — e **uma única
  implementação `MockAdapter`** para os testes. Nenhum adapter real nesta fase.
- Prever as colunas `ultima_comunicacao timestamptz` e `ultima_posicao jsonb` em
  `scar_rastreadores`, já criadas na migration e apenas não alimentadas.
- Cobrança do rastreador (status 6 e 7) permanece manual; não acoplar ao financeiro ainda.

---

## 11. Restrições

- Não alterar tabelas de veículo/associado além de acrescentar `exige_rastreador` no plano (§3) —
  qualquer outra alteração necessária deve ser **proposta antes**, não executada.
- Não instalar dependências novas sem justificar em uma linha.
- Não usar `service_role` em código que roda no cliente.
- Toda a interface em pt-BR; nomes de colunas em português seguindo o padrão já adotado no Scar
  (se o projeto usa inglês nas colunas, siga o projeto e ajuste os nomes acima).
