# CLAUDE.md — SCar (Proteção Veicular)

> Memória do projeto. Leia isto no início de cada sessão em vez de varrer o repositório inteiro.
> Mantenha este arquivo atualizado ao adicionar módulos/migrations (é barato e faz o projeto andar rápido).

## Estado atual (retomar aqui) — atualizado nesta sessão
- **Branch:** `claude/claude-md-opcao-x-98kfj5` (a partir do `6efa280`) · **entrega da sessão:**
  migrations `0024_cobrancas` + `0025_cobranca_modulo` e o **módulo Cobrança** (`/cobrancas`, menu lateral):
  dashboard com KPIs/filtros, geração automática na ativação, boletagem em lote (6 meses) e
  camada de integração bancária (service pattern + remessas).
- **Migrations no repo:** `0001`..`0025` (todas validadas no harness pg local). **Deploy:** rodar as
  novas no Supabase SQL Editor (na ordem) + no VPS `cd /opt/scar && git pull && sudo docker compose up -d --build`.
- **Design system "cockpit"** aplicado (navy `#1E2B4D` + ciano `#139AD6`); sidebar usa a logo de
  `Configurações → Empresa` (placa branca). Dashboard com KPIs de instrumento + tacômetro (inadimplência real).
- **SAC** (`/sac`) veículo-first + lazy: lista resumida → clica → detalhe sob demanda → menu de serviços;
  aba **Eventos**; banner de **alertas** do associado; marcadores (evento/assist 24h/alerta) na lista.
- **Vitest** ativo (`npm test`, 43/43) — `sac.ts`, `cobranca.ts` e `pagamentos/` (mock + Asaas + fábrica).
- **Próximos passos oferecidos** (o usuário escolhe no próximo chat):
  1. **Ligar o gateway real** (Asaas): implementar `AsaasGateway.emitir` (esqueleto pronto, endpoints
     e mapeamento documentados) + webhook chamando `registrar_retorno_cobranca`/baixa do título.
  2. **Termo de adesão**: gerar documento + página pública de **aceite eletrônico** (`contratos_adesao.token`,
     nos moldes da cotação pública `/cotacao/[token]`).
  3. **Módulo de Vistoria**: captura com upload de fotos (bucket) + status (tabelas `vistorias`/`vistoria_anexos` já existem).
  4. **Portal do Associado**: login CPF + autosserviço reusando `SERVICOS_SAC` + `abrir_atendimento` + RLS por dono.
  5. **Fila de atendimentos** p/ a equipe tramitar chamados (Assist 24h, Upgrade, etc.).
- **Pendências técnicas conhecidas:** o envio ao banco usa o **MockGateway** (linha digitável/PIX
  fictícios, determinísticos) até cadastrar a integração real em Configurações → Integrações bancárias;
  `/api/boletos/emitir-lote` é a rotina ANTIGA (mock, cobra taxa_administrativa) — usar
  `/api/v1/cobrancas/*`; preços dos opcionais novos (RCF 50/75/100mil, Carro Reserva 10/30d,
  Vidros III/Completa, Assist VIP) começam em R$0 — cadastrar em Configurações → Produtos.

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
    cobranca.ts                 # regras de mensalidade/vencimento (espelha o SQL) + testes
    pagamentos/                 # service pattern do gateway (types/mock/asaas/index) + testes
  hooks/                        # um arquivo por dominio (use-*.ts), TanStack Query
  components/                   # ui/ (Button,Input,Modal,Card,field), + por dominio
  app/(dashboard)/              # telas internas (layout gateia staff + mostra logo)
  app/(auth)/login, app/portal  # login staff e portal do associado
  app/api/                      # route handlers (cnpj, placa, fipe, usuarios, portal/login, boletos)
  app/api/v1/cobrancas/         # gerar (lote por periodo) e remessa (envio ao banco)
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
· `0024_cobrancas` (COBRANCA RECORRENTE — liga a ficha do veiculo (0023) ao faturamento
(0021) e ao financeiro: helpers `calcular_vencimento(competencia,dia)` (clampa dia 31 ao
ultimo dia do mes; sem dia = padrao legado dia 10 do mes seguinte),
`valor_mensalidade_veiculo(veic)` (precedencia `veiculos.valor_mensalidade` >
`cotar_plano(fipe,tipo,plano,opcionais de veiculo_produtos)` > 0),
`veiculo_faturavel(veic,competencia)` (so ativo/em_evento/vistoria_pendente e ja ativado ate
o fim do mes — suspenso/inativo/baixado NAO geram mensalidade) e
`dia_vencimento_agrupado(cliente,competencia)` (dia mais usado, desempate menor).
`gerar_faturas_cliente` reescrita usando os helpers (nao cria mais fatura zerada);
`gerar_faturas_competencia(competencia,regional?)` = lote do mes; `emitir_titulo_fatura(fatura)`
e `emitir_titulos_competencia(...)` criam o `titulos_financeiros` (base de boleto/2a via/
inadimplencia) de forma idempotente; trigger `titulo -> fatura` (pago=PAGA, cancelado=CANCELADA)
fecha o ciclo com o webhook bancario; `cancelar_fatura(fatura)`. Logica pura espelhada em
`src/lib/cobranca.ts` (Vitest)).
· `0025_cobranca_modulo` (MODULO COBRANCA: (A) GERACAO AUTOMATICA na entrada na base — trigger
BEFORE carimba `veiculos.data_ativacao` e AFTER dispara `gerar_primeira_cobranca_veiculo()` quando
o veiculo nasce/vira `ativo` (inclui o fluxo de auditoria de Vendas); agrupado entra como item na
fatura do mes se ela ainda estiver ABERTA e sem titulo, senao ganha fatura propria; nunca duplica;
(B) BOLETAGEM RECORRENTE — `gerar_faturas_cliente_veiculos(cliente,comp,veiculo_ids?,venc?)` vira o
nucleo (o `gerar_faturas_cliente` passa a delegar) e `gerar_faturas_periodo(comp_inicial,meses,
cliente?,veiculo_ids?,regional?)` gera N competencias (ex.: 6 meses) por associado/grupo/regional;
(C) INTEGRACAO BANCARIA — `titulos_financeiros` ganha `pix_copia_cola/pix_qrcode_url/integracao_id/
gateway_status/gateway_erro/enviado_em`; novas tabelas `cobranca_remessas` + `cobranca_remessa_itens`
(fila de envio) com `criar_remessa_cobranca`, `marcar_remessa_enviada`, `registrar_retorno_cobranca`
(grava linha digitavel/PDF/PIX ou erro) e `finalizar_remessa` (CONCLUIDA/PARCIAL/ERRO);
(D) DASHBOARD — `listar_cobrancas(...)` (filtros: placa, associado/CPF, vencimento de/ate, faixa de
valor, status, regional) + `resumo_cobrancas(...)` (emitido x recebido, inadimplencia %/valor,
a vencer 7/15/30) + `titulos_para_remessa(...)` e `status_cobranca_efetivo()` (pendente vencido = vencido)).

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
CNPJ/CEP) · **Cobrança** (`/cobrancas`: dashboard + faturas por competência + boletagem em lote +
remessas bancárias) · Financeiro (contas a pagar/receber + baixas + DRE)
· Configurações (regionais, usuários,
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

## Módulo Cobrança (0025) — navegação, dashboard, lote e banco
- **Menu lateral → "Cobrança" (`/cobrancas`)**, com 3 abas: **Visão Geral** (dashboard),
  **Faturas por Competência** (gerar/emitir/cancelar do 0024) e **Boletagem em Lote**.
- **Dashboard** (`resumo_cobrancas` + `listar_cobrancas`): Total Emitido × Recebido, Inadimplência
  (% e valor em atraso), Boletos a vencer em 7/15/30 dias; filtros por **placa, associado (nome ou
  CPF/CNPJ), vencimento de/até, faixa de valor, status** (Em aberto/Pago/Vencido/Cancelado) e regional.
  Status é **efetivo**: pendente com vencimento passado já conta como vencido.
- **Geração automática:** ao ativar o veículo (insert já `ativo` ou mudança para `ativo` — inclusive
  pela auditoria de Vendas) o banco carimba `data_ativacao` e gera a **primeira cobrança**. Reativar
  não duplica. Falha na geração não bloqueia o cadastro (vira `warning`).
- **Boletagem em lote:** `/api/v1/cobrancas/gerar` → `gerar_faturas_periodo` (padrão 6 meses) com
  escopo Toda a base / Um associado / Grupo de veículos + regional, e emissão dos títulos junto.
- **Envio ao banco:** `/api/v1/cobrancas/remessa` monta a fila (`titulos_para_remessa`), cria a
  **remessa**, marca enviada, chama o **gateway** e grava o retorno por título
  (`registrar_retorno_cobranca`), fechando com `finalizar_remessa`.
- **Service pattern** (`src/lib/pagamentos/`): `PaymentGateway` (emitir, emitirLote, consultar,
  cancelar, parseWebhook) + `BasePaymentGateway` (lote tolerante a erro por item);
  `MockGateway` (padrão hoje, retorno determinístico) e `AsaasGateway` (esqueleto com endpoints e
  mapeamento documentados). `getPaymentGateway(integracao)` resolve pelo cadastro em
  **Configurações → Integrações bancárias**; sem credencial cai no mock. Trocar de banco = novo
  adaptador, sem tocar nas rotinas de cobrança.

## Cobranças / mensalidade (0024) — arquitetura
- **Fluxo:** veículo (ficha) → `gerar_faturas_cliente`/`gerar_faturas_competencia` → **fatura**
  (snapshot com itens) → `emitir_titulo_fatura` → **`titulos_financeiros`** (o que vira boleto,
  aparece na 2ª via do SAC e alimenta a inadimplência) → webhook bancário marca `pago` → trigger
  fecha a **fatura** como `PAGA`. Cancelamento: `cancelar_fatura` (bloqueia se já paga).
- **Valor do veículo:** `veiculos.valor_mensalidade` (override negociado na ficha) → senão
  `cotar_plano(fipe, tipo, plano, opcionais de veiculo_produtos)`. Sem tipo/plano = R$0 e **não gera**
  fatura (fatura zerada nunca é emitida).
- **Vencimento:** `veiculos.dia_vencimento` no mês da competência (dia 31 cai no último dia do mês).
  Fatura **agrupada** usa o dia mais frequente entre os veículos do associado. Sem dia definido, cai no
  padrão histórico (dia 10 do mês seguinte).
- **Quem é cobrado:** `veiculo_faturavel` = status `ativo`/`em_evento`/`vistoria_pendente` **e**
  `data_ativacao <= fim do mês`. Suspenso/inativo/baixado/excluído não geram mensalidade.
- **Idempotência:** rodar o lote de novo na mesma competência não recria nem altera fatura existente
  (histórico imutável; trocar Agrupado↔Individual só afeta competências futuras).
- **UI:** `/financeiro` → aba **Cobranças** (competência/regional/status, KPIs, "Gerar cobranças",
  "Emitir títulos", expandir itens da agrupada, cancelar). Hook `use-cobrancas.ts`; lógica pura
  espelhada em `src/lib/cobranca.ts` (com testes).

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
- **ATENÇÃO — branch de deploy:** o VPS (`/opt/scar`) hoje acompanha
  **`claude/claude-md-opcao-x-98kfj5`** (branch desta sessão, que contém todo o histórico do
  `claude/scar-project-btasdf` + o módulo Cobrança). O `claude/scar-project-btasdf` segue como
  branch padrão do repo, parado em `953c53c`. **Mesmo repositório, dois branches** — não são
  projetos diferentes. Se uma sessão futura for configurada para outro branch, avise o usuário
  logo no início: senão o `git pull` do VPS não traz o código novo e a tela "some" (foi o que
  aconteceu com o menu Cobrança).
- Push para o branch da sessão; consolidar os branches só com autorização do usuário.
- **Atualizar produção:** (A) rodar as migrations novas no Supabase SQL Editor, na ordem;
  (B) no VPS: `cd /opt/scar && git pull origin <branch-da-sessao> && docker compose up -d --build`.
- Raw URL de arquivo (branch tem `/`, use `refs/heads/`):
  `https://raw.githubusercontent.com/cadastrosmartcarbrasil-rgb/scar/refs/heads/<branch>/<path>`

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
