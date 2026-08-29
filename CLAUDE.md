# CLAUDE.md — SCar (Proteção Veicular)

> Memória do projeto. Leia isto no início de cada sessão em vez de varrer o repositório inteiro.
> Mantenha este arquivo atualizado ao adicionar módulos/migrations (é barato e faz o projeto andar rápido).

## Estado atual (retomar aqui) — atualizado nesta sessão
- **Branch:** `claude/financial-dre-improvements-6zfj3k` · migration nova: **`0024_financeiro_dre_pro`**.
- **Migrations no repo:** `0001`..`0024` (todas validadas no harness pg local). **Deploy:** rodar a nova no
  Supabase SQL Editor + no VPS `cd /opt/scar && git pull && sudo docker compose up -d --build`.
- **Financeiro repaginado** (`/financeiro`, 3 abas): Contas a Pagar/Receber · Fluxo de Caixa · DRE.
  Detalhes na seção "Financeiro e DRE" abaixo.
- **Campo de moeda corrigido em todo o sistema** (`MoneyInput`): nasce vazio com placeholder `0,00`
  (fim do "0" preso na frente), máscara por centavos ao digitar só números e respeito à vírgula/ponto
  quando o operador digita ou cola (`1.234,56` / `1234.56`). Lógica pura em `src/lib/money.ts`.
- **Vitest:** 47 testes (`npm test`) — `sac.test.ts`, `money.test.ts`, `financeiro.test.ts`.
- **Próximos passos oferecidos** (o usuário escolhe):
  1. **Cobranças** usando `dia_vencimento` + `valor_mensalidade` por veículo (ligar no `gerar_faturas_cliente`)
     e **espelhar as faturas em `lancamentos_financeiros`** para o DRE ver a receita recorrente.
  2. **Termo de adesão**: documento + página pública de aceite eletrônico (`contratos_adesao.token`).
  3. **Módulo de Vistoria** (tabelas `vistorias`/`vistoria_anexos` já existem).
  4. **Portal do Associado**: login CPF + autosserviço reusando `SERVICOS_SAC`.
  5. **Fila de atendimentos** p/ a equipe tramitar chamados.
  6. **Conciliação bancária** (as baixas já guardam `end_to_end_id_pix`/`id_transacao_bancaria_externa`).
- **Pendências técnicas conhecidas:** gateway bancário ainda MOCKADO (`/api/boletos/emitir-lote` e
  `/api/v1/sac/boleto`); preços dos opcionais novos (RCF 50/75/100mil, Carro Reserva 10/30d, Vidros III/
  Completa, Assist VIP) começam em R$0 — cadastrar em Configurações → Produtos.

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
- **Design system (marca Smart Car Brasil):** tema "cockpit". `tailwind.config.ts` define
  `brand` = **NAVY** (`brand-600 #1E2B4D`, a barra do site; acao primaria/estrutura) e `cyan` =
  **CIANO** da marca (`cyan-500 #22A7E4`/`cyan-600 #139AD6`; energia/acento — o "CAR" e o rodape).
  Sidebar = cabine escura (navy + pinstripe `.cockpit-stripe`, wordmark SMART**CAR**BRASIL, item
  ativo com glow ciano). Numeros de painel usam `.tnum` (tabular). Ground `--background #eef2f8`,
  cards brancos `rounded-2xl`. Botao primario navy; foco/realce em ciano. Status colors a parte.
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
    fipe.ts                     # Tabela FIPE (placafipe.com.br) - proxy server-side /api/fipe
    utils.ts                    # cn, formatCurrency, formatDate, monthRange
  hooks/                        # um arquivo por dominio (use-*.ts), TanStack Query
  components/                   # ui/ (Button,Input,Modal,Card,field), + por dominio
  app/(dashboard)/              # telas internas (layout gateia staff + mostra logo)
  app/(auth)/login, app/portal  # login staff e portal do associado
  app/api/                      # route handlers (cnpj, placa, fipe, usuarios, portal/login, boletos)
middleware.ts                   # refresh de sessao + guard de rotas
```

## Migrations (ordem)
`0001_schema` · `0002_functions_triggers` · `0003_rls` · `0004_seed` · `0005_integracoes_bancarias`
· `0006_associados` · `0007_veiculos_contratos` · `0008_comunicacoes` · `0009_eventos_completo`
· `0010_precificacao` · `0011_empresa` · `0012_financeiro_fornecedores` · `0013_editor_precos`
· `0014_marcas_modelos` (enum `status_cadastro` ATIVO/INATIVO/SUSPENSO + colunas `tipo_veiculo`,
`idade_maxima`, `status` em modelos e `status` em marcas) · `0015_seed_marcas_modelos`
(carga do relatorio SGA: 241 marcas, 8819 modelos; idempotente via `on conflict do nothing`)
· `0016_cotas_participacao` (desacopla a COTA DE PARTICIPACAO do Plano: catalogo
`cotas_participacao` V5..V15 = %FIPE; `modelos.cota_participacao_id/grupo_veiculo/especial`;
`veiculos.cota_participacao_id/modelo_id`; backfill via parser do texto SGA;
`calcular_participacao(fipe,tipo,cota)` overload + `calcular_participacao_veiculo(veic,fipe)`
com precedencia veiculo>modelo>faixa. Parser TS em `src/lib/participacao.ts`).
· `0017_crm_vendas` (Vendas/CRM: papel `auditoria`; enums `status_lead`/`origem_fipe`;
tabelas `leads`, `cotacoes` (snapshot+token publico), `lead_historico`, `fipe_precos_local`;
trigger auto APROVADO->EM_AUDITORIA; `autorizar_entrada_lead()` SECURITY DEFINER cria
cliente+veiculo so p/ auditoria/admin; `pode_auditar()`).
· `0018_passeio_padrao_adesao` (padroniza Passeio pela planilha "Veiculos Passeio":
BASICOS da mensalidade = Taxa Administrativa + Assistencia 24h + Protecao Casco +
Rastreador; participacao 1500 ate 35k, 1800 ate 40k, 4% FIPE de 40k+; NOVO
`adesao_faixa` (cobranca unica por faixa: 250/350/500) + `calcular_adesao(fipe,tipo)`;
`calcular_mensalidade` passa a devolver `taxa_adesao`; overload
`substituir_tabela_precos(uuid,jsonb,jsonb,jsonb)` c/ adesao; `cotacoes.taxa_adesao`;
rebuild das 46 faixas 0..250000).
· `0019_planos_combos_motor` (evolucao atuarial: (1) RASTREADOR vira REGRA por tipo
de veiculo -- colunas `tipos_veiculo.exige_rastreador/valor_limite_isencao/
valor_mensalidade_rastreador`; sai da matriz produto-por-faixa (produto aposentado)
e `calcular_mensalidade` aplica o gatilho de isencao na base; (2) RCF sai da BASE e
vira MODULO OPCIONAL por faixa de cobertura -- produtos RCF 30/50/75/100mil
categoria `RCF`, nao-obrigatorios; a Cotacao Base (Plano Prata) passa a ser
Casco+TaxaAdmin+Assist24h+Rastreador(regra) = coluna "PRATA S/ TERCEIRO" da planilha;
(3) COMBOS: `planos_protecao.descricao_comercial/nivel` + `plano_produtos`; seed
Prata/Ouro/Diamante; motor `cotar_plano(fipe,tipo,plano_id,avulsos[])` devolve
mensalidade+adesao+franquia+detalhamento. Novos opcionais Carro Reserva 10/30d,
Vidros III/Completa, Assist VIP com preco 0 a definir em Configuracoes->Produtos).
· `0020_fix_matriz_base` (corretiva/idempotente: garante que a matriz base por
faixa FIPE tenha SO os obrigatorios variaveis -- Protecao Casco (FAIXA/obrig/ativo,
categoria CASCO) + Taxa Administrativa (ADMIN); RCF sempre FIXO/opcional/categoria
RCF; Assist 24h FIXO/obrig; Rastreador aposentado; limpa faixas indevidas de
RCF/Rastreador/nao-FAIXA. O editor tambem passa a montar colunas so por
`FAIXA_FIPE && status && obrigatorio`).
· `0021_sac_faturamento_opcionais` (core unificado SAC/Assistencia/Vendas/Chatbot:
(A) veiculo ganha `categoria`, `data_ativacao` e status novos (inativo/
vistoria_pendente/em_evento via ADD VALUE); (B) FATURAMENTO flexivel por veiculo
`tipo_faturamento` (AGRUPADO_ASSOCIADO x INDIVIDUAL_VEICULO) + tabelas `faturas`/
`fatura_itens` (snapshot imutavel: trocar o modo so afeta competencias futuras) +
`definir_faturamento_veiculo()` e `gerar_faturas_cliente(cliente,competencia)`
idempotente; (C) opcionais com limite por JANELA FLUTUANTE -- `produtos.tem_limite_uso/
quantidade_limite/janela_dias_limite(365)` + `opcionais_elegibilidade(veiculo)` que
conta eventos do mesmo `tipo_evento_id` nos ultimos N dias. Logica pura espelhada em
`src/lib/sac.ts` (testada com Vitest). APIs REST em `/api/v1/sac/*` e painel `/sac`).
· `0022_atendimentos_sac` (nucleo de ATENDIMENTOS/solicitacoes sempre vinculadas ao
`veiculo_id`: enums `tipo_atendimento`(SINISTRO/ASSISTENCIA_24H/UPGRADE_COBERTURA/
SEGUNDA_VIA_BOLETO/VISTORIA_ACESSORIOS/ALTERACAO_CADASTRAL/CANCELAMENTO),
`canal_atendimento`(SAC_INTERNO/PORTAL), `status_atendimento`; tabela `atendimentos`
com protocolo ATD-YYYYMMDD-XXXX; `abrir_atendimento()` SECURITY DEFINER com TRAVA DE
PROPRIEDADE -- so staff-na-regional ou o proprio dono (auth_cliente_id); RLS pronta
p/ Portal. Menu modular em `src/lib/sac-servicos.ts` (SERVICOS_SAC), API
`/api/v1/sac/atendimento`, SAC refeito veiculo-first (seleciona 1 veiculo -> isola)).
· `0023_veiculo_ficha` (ficha ampliada do veiculo: colunas `alienado`/`alienado_financeira`/
`numero_portas`/`valor_mensalidade`/`dia_vencimento`; `veiculo_produtos` (opcionais do veiculo;
plano ja em veiculos.plano_protecao_id); ALERTAS reutilizaveis `tipos_alerta` (catalogo) +
`veiculo_alertas` (o SAC abre os ativos ao localizar o associado); `contratos_adesao` (termo
pos-venda + token de aceite eletronico -- estrutura, termo depois); `vistorias`+`vistoria_anexos`
(modulo proprio depois, mas ja aparecem na ficha). RLS por veiculo (staff-regional ou dono);
seed de 5 alertas. Form de veiculo ganhou Plano+Opcionais+Calcular mensalidade (cotar_plano)+
dia de vencimento+alienado+portas+alertas; nova tela Configuracoes->Alertas).
· `0024_financeiro_dre_pro` (financeiro nivel gestao: (A) `lancamentos_financeiros` ganha
`numero_documento`/`competencia`/`observacoes`/`parcela_numero`/`parcela_total`/`grupo_parcelas`
e os CACHES `valor_pago`/`valor_saldo` mantidos pelo trigger BEFORE `fn_lanc_calcular_saldo()`
(fim do N+1 de saldo na tela); `movimentacoes_caixa.lancamento_id` liga a movimentacao avulsa ao
titulo p/ o DRE nao contar duas vezes; (B) **o DRE passa a enxergar o Contas a Pagar/Receber**:
`dre_movimentos(inicio,fim,regional,regime)` e a fonte unica (baixas no regime CAIXA, competencia
do titulo no regime COMPETENCIA, + movimentacoes avulsas, titulos de mensalidade e NF de evento),
com `gerar_dre_completo` / `gerar_dre_resumo_completo` / `gerar_dre_mensal` por cima (as versoes
antigas `gerar_dre`/`gerar_dre_resumo` seguem INTACTAS); valor sem categoria vira linha
"nao classificadas" (1.9.99/4.9.99) em vez de sumir; (C) indicadores: `financeiro_resumo`,
`financeiro_fluxo_mensal` (previsto x realizado) e `financeiro_aging` (faixas de atraso);
`quitar_lancamento(id,data,conta)` baixa o saldo remanescente; +9 categorias no plano de contas.
**SEGURANCA:** as RPCs de relatorio sao SECURITY DEFINER, entao `escopo_regional(uuid)` forca a
regional de quem chama — so admin/financeiro (`tem_acesso_global`) leem consolidado; usuario sem
regional nao le nada).

## Módulos (status: todos funcionais)
SAC / Atendimento (`/sac`: **veículo-first + lazy** — busca por Nome/CPF/Placa → `visao-360` traz
uma **lista resumida leve** (Placa/Marca-Modelo/Ano/Status, sem opcionais); ao clicar, `/api/v1/sac/veiculo`
carrega o **detalhe sob demanda** e isola o item, abrindo o **menu modular de serviços**
(`SERVICOS_SAC`): **Evento** (redireciona direto p/ `/sinistros/novo?placa=` — chamamos sinistro
de EVENTO), Assistência 24h, Upgrade/Cobertura, 2ª via de Boleto, Vistoria/Acessórios,
Cadastro/Cancelamento — os demais criam um `atendimento` vinculado ao `veiculo_id` (trava de
propriedade no banco). Abas **Veículos | Eventos** (eventos do associado c/ atalho "Gerenciar" →
`/sinistros/[id]`); a lista de veículos marca quem já teve **evento** ou acionou **Assist 24h**.
Também: toggle de faturamento Agrupado↔Individual, status financeiro, elegibilidade de opcionais
(janela flutuante 12m). APIs REST em `/api/v1/sac/*` — `busca`, `visao-360`, `faturamento`, `boleto`, `atendimento`
— reutilizáveis por Portal do Associado/Assistência 24h/Chatbot).
Vendas/CRM (`/vendas` mobile-first: captura de lead + FIPE por placa/cascata, cotação com
link público `/cotacao/[token]` detalhada/consolidada + print-PDF, esteira com trava de
Auditoria — só papel `auditoria`/`admin` clica "Autorizar Entrada" e efetiva cliente+veículo)
· Associados (painel `/associados/[id]` com abas) · Veículos/Contratos · Eventos/Sinistros
(protocolo, reparo próprio/terceiro, financeiro do evento) · Precificação (simulador + editor de
tabela FIPE com reajuste %) · Empresa (logo/diretoria/mandatos/documentos) · Fornecedores (auto
CNPJ/CEP) · Financeiro (ver secao propria) · Configurações (regionais, usuários,
vendedores, marcas/modelos, tipos de veículo, cotas de participação (V5..V15), tipos de evento,
produtos, planos/combos (Prata/Ouro/Diamante), contas bancárias, integrações bancárias, plano de contas).

## Motor de cotação e combos (0019) — arquitetura
- **Cotação Base (Plano Prata)** = Casco + Taxa Admin + Assistência 24h + **Rastreador (regra)**.
  RCF NÃO entra na base. Bate a coluna "PRATA S/ TERCEIRO" da planilha Passeio.
- **Rastreador é regra por tipo de veículo** (`tipos_veiculo.exige_rastreador/valor_limite_isencao/
  valor_mensalidade_rastreador`), não mais produto-por-faixa. `calcular_mensalidade` aplica o gatilho
  de isenção (Passeio: isento até 60k, R$35 acima). Editável em Precificação→Tabela (painel da regra).
- **RCF = módulo opcional** por faixa de cobertura (produtos categoria `RCF`: 30/50/75/100mil).
- **Combos**: `planos_protecao` (+`descricao_comercial`/`nivel`) ⨯ `plano_produtos` (opcionais amarrados).
  `cotar_plano(fipe, tipo, plano_id?, avulsos[]?)` → mensalidade + adesão + franquia + detalhamento.
  Precedência: base(obrigatórios+regra rastreador) + produtos do plano + avulsos. Usado por Simulador,
  Vendas/novo e snapshot da cotação. Preços dos opcionais novos: cadastrar em Configurações→Produtos.

## Financeiro e DRE (0024) — arquitetura
- **`/financeiro` tem 3 abas:**
  - **Contas a Pagar / Receber** — 4 indicadores do periodo (a receber, a pagar, resultado de caixa,
    inadimplencia com % da carteira e "vence em 7 dias"), filtro de periodo com atalhos
    (mes/mes anterior/trimestre/semestre/ano) + **escolha do campo de data** (vencimento, competencia
    ou emissao), filtros de tipo/situacao/categoria/centro de custo, busca livre, exportacao CSV.
    A tabela mostra documento, parcela, classificacao contabil, **saldo devedor** e situacao REAL
    (`situacaoTitulo` marca atrasado pela data de hoje, sem depender da rotina do banco); acoes por
    linha: baixar, **quitar saldo** (1 clique, RPC), editar e cancelar. Rodape soma o que esta em tela.
  - **Fluxo de Caixa** — previsto x realizado por mes (barras acima/abaixo do eixo), saldo acumulado
    projetado e **aging** da carteira (a vencer / 1-30 / 31-60 / 61-90 / +90).
  - **DRE** — seletor de **REGIME** (Caixa x Competencia) e de **centro de custo**, comparativo com o
    periodo anterior (mes fechado compara com o mes anterior inteiro), **AV%** (analise vertical sobre
    a receita bruta), subtotais por grupo, linha de **Margem de Contribuicao**, **ponto de equilibrio**,
    grafico de 12 meses, export CSV e impressao.
- **Regra de ouro do DRE:** ele le `dre_movimentos()`. Titulo cancelado nunca entra; movimentacao de
  caixa com `lancamento_id` preenchido nao entra (evita dupla contagem); titulo de mensalidade so
  entra se nao houver `movimentacoes_caixa` espelhando.
- **Nada de excluir dinheiro:** cancelar um titulo muda o status (historico imutavel); a baixa a maior
  continua barrada pelo trigger de 0012.
- **Logica pura testada (Vitest):** `src/lib/money.ts` (mascara/parse/aritmetica de centavos) e
  `src/lib/financeiro.ts` (situacao do titulo, aging, parcelamento com ajuste de centavos na ultima
  parcela, estruturacao do DRE, indicadores, periodo anterior).
- **Componentes:** `src/components/financeiro/` — `ui-financeiro.tsx` (Indicador, Selo, FiltroPeriodo,
  Vazio, baixarCsv), `lancamento-modal.tsx` (form em secoes + previa do parcelamento),
  `baixa-modal.tsx`, `contas-financeiro.tsx`, `fluxo-caixa.tsx`, `dre-report.tsx`.

## Cota de participação (rateio no evento) — arquitetura
- **Desacoplada do Plano.** O Plano define a mensalidade (produtos); a cota (% da FIPE no rateio)
  é uma dimensão própria resolvida por **precedência**: `veiculo.cota` (override) → `modelo.cota`
  (herdada do texto SGA) → `participacao_faixa` (padrão por tipo/faixa, comportamento antigo).
- **Catálogo `cotas_participacao`** (V5=5%…V15=15%): editar o % num único lugar reflete em todos.
- **Parser** do texto `[ESPECIAL] V<N> <GRUPO>` (número após V = %). SQL no backfill do 0016 e
  TS em `src/lib/participacao.ts` (`parseCategoriaSGA`) — usados para preencher a cota ao salvar modelo.
- Motor: `calcular_participacao_veiculo(veic,fipe)` p/ veículo real; `calcular_participacao(fipe,tipo,cota)`
  (3-arg) p/ preview no simulador; a versão 2-arg antiga segue intacta.

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

## Convenção de moeda (UI)
- **Todo campo de dinheiro usa `<MoneyInput>` de `@/components/ui/field`** — nunca `<input type="number">`
  (ele nasce com "0", obriga manobra de cursor e aceita "0012").
- `MoneyInput` recebe `value: number | null` e `onChange: (v: number | null) => void`; mostra prefixo
  R$, alinha a direita, usa `.tnum` e seleciona tudo ao focar. Campo vazio = `null` (placeholder `0,00`).
- Regra de digitacao (`src/lib/money.ts`, testada): so digitos -> mascara por centavos
  (`150000` -> `1.500,00`); com virgula/ponto -> respeita o texto (`1.234,56`, `1234.56`).
- Somas de dinheiro usam `somarMoeda()` (centavos inteiros) para nao acumular erro de ponto flutuante.

## Fluxo de validação (fazer SEMPRE antes de commitar)
Há um Postgres 16 local para testar migrations de verdade (usuário `pgtest`, porta 5433, socket/host 127.0.0.1).
Padrão usado nas sessões:
1. Subir pg como `pgtest`, dropar/recriar schemas `public/auth/storage` + roles `authenticated/anon/service_role`.
2. Aplicar `bootstrap.sql` (stubs de `auth.users`, `auth.uid()`, `storage.*`) e depois todas as migrations em ordem com `ON_ERROR_STOP`.
3. Rodar testes funcionais (ex.: triggers, baixa financeira, motor de preço) — validar valores esperados.
4. `npx tsc --noEmit` (0 erros) e `npm run build` (com env dummy) — 0 erros.
5. Testes unitarios de logica pura: `npm test` (Vitest; ex.: `src/lib/sac.test.ts`).
Só então: commit + push. (Docker build da imagem NÃO builda aqui: proxy bloqueia Docker Hub — validar só schema+tsc+build.)

## Commit / deploy
- Commits em PT, com footer:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` + linha `Claude-Session:`.
- Push sempre para `origin claude/scar-project-btasdf`.
- **Atualizar produção:** (A) rodar a migration nova no Supabase SQL Editor; (B) no VPS:
  `cd /opt/scar && git pull && docker compose up -d --build`.
- Raw URL de arquivo (branch tem `/`, use `refs/heads/`):
  `https://raw.githubusercontent.com/cadastrosmartcarbrasil-rgb/scar/refs/heads/claude/scar-project-btasdf/<path>`

## Integração FIPE (placafipe.com.br)
- Contrato: **POST JSON, token NO CORPO**, base `https://api.placafipe.com.br`, envelope
  `{codigo,msg,tempo,...payload}`. Endpoints: `getplacafipe {placa}` → `{fipe:[...]}` (placa→valor);
  `get-veiculos-tipos {}`; `get-marcas {codigo_tipo_veiculo?}` → `[{codigo_marca,descricao}]`;
  `get-modelos {codigo_marca}` → `{modelos:[{Label,Value}], anos:[{Label,Value}]}`;
  `fipebycodigo {codigo_fipe,ano}` → valor. `valor` vem tipo `"22159.00"` (ponto decimal!) —
  `parseValor` trata isso e o formato BR. Combustível vem textual ("GASOLINA") → `combustivelEnum`.
- Token é secreto: só no servidor (`/api/fipe/route.ts`, POST, env `PLACAFIPE_TOKEN`/`PLACAFIPE_BASE`);
  o cliente chama o proxy interno com `{action, ...params}`. Sem token → modo manual.
- UI: no form de veículo o botão **Consultar** da placa chama `getplacafipe` (placa→dados+valor);
  `<FipeConsulta>` faz a cascata manual (hooks `use-fipe.ts`). Ambos preenchem
  marca/modelo/ano/valor_fipe/codigo_fipe/combustivel. Normalização best-effort.
- **A confirmar em teste real:** no `fipebycodigo` da cascata, passamos o Value do modelo como
  `codigo_fipe` — se a API esperar o código FIPE textual, ajustar em `/api/fipe` (um ponto só).

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
