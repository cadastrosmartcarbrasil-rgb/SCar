# CLAUDE.md — SCar (Proteção Veicular)

> Memória do projeto. Leia isto no início de cada sessão em vez de varrer o repositório inteiro.
> Mantenha este arquivo atualizado ao adicionar módulos/migrations (é barato e faz o projeto andar rápido).

## Estado atual (retomar aqui) — revisão consolidada

**Um único projeto, um único repositório:** `cadastrosmartcarbrasil-rgb/scar`.
O trabalho e o deploy acontecem no branch **`claude/claude-md-opcao-x-98kfj5`**
(contém todo o histórico + os módulos novos). O `claude/scar-project-btasdf` é o
branch padrão do GitHub e está parado em `953c53c` — não é outro projeto.

### Comandos que resolvem 90% da sessão
| Objetivo | Comando |
|---|---|
| Validar tudo antes de commitar | `npm run validate` (tipos → Vitest → migrations+testes de banco+schema → build) |
| Só os testes de banco | `npm run test:db` · um módulo: `npm run test:db -- 0028` |
| Regerar o `supabase/schema.sql` | `npm run schema` (rodar SEMPRE após criar/editar migration) |
| Publicar no VPS | Windows: `.\scripts\deploy.ps1` · Linux/WSL: `npm run deploy` |
| Achar a pasta do projeto no VPS | `.\scripts\deploy.ps1 -Descobrir` |

O passo a passo do deploy (incluindo as migrations no Supabase) está em **`DEPLOY.md`**.
CI no GitHub Actions (`.github/workflows/ci.yml`) roda a mesma validação a cada push.

### O que foi entregue nesta fase (migrations 0024→0031)
1. **Cobrança** (`0024`+`0025`, menu → `/cobrancas`): mensalidade por veículo
   (`dia_vencimento` + `valor_mensalidade`), faturas → títulos, dashboard com KPIs e
   filtros, geração automática na ativação do veículo, boletagem em lote (6 meses) e
   camada de integração bancária (service pattern + remessas).
2. **Assistência 24h** (`0026`, menu → `/assistencia`): catálogo de serviços com KM
   excedente e limite por janela, trava financeira/cadastral com alçada de liberação,
   cotação → OS → voucher (e-mail/WhatsApp) → Contas a Pagar.
3. **Refino da 24h** (`0027`): centro de custo `ASSIST24` obrigatório, OS editável
   (valores, trajeto, troca de prestador, cancelamento) com auditoria e sincronia
   automática do título; DRE ganhou filtro por centro de custo e passou a considerar
   as baixas de contas a pagar/receber.
4. **CRM de Vendas** (`0028`): Kanban com drag-and-drop, status **Em Negociação**,
   cotação editável com trava dos itens obrigatórios do plano e política de desconto
   por franquia com alçada de Gestor/Diretor.
5. **SAC + Protocolos** (`0029`, menu → `/protocolos` e aba no `/sac`): ficha do veículo
   passou a listar **só o que foi contratado**, VCards unificados (Editar Veículo/Item,
   Histórico Financeiro com edição do boleto em aberto, WhatsApp e E-mail) e a
   **Central de Protocolos** (fila, histórico de interações, transferência entre
   atendentes, encerramento) com contador em tempo real no Dashboard.

6. **Correções do SAC** (`0030`): alerta/pendência do veículo agora é **editável e
   resolvível** na ficha e no cadastro (mesma fonte do card), busca por **placa vai
   direto ao atendimento** do veículo e todas as listagens usam a **ordenação padrão**
   (ativos primeiro).
7. **Geolocalização da 24h** (`0031`): origem/destino geocodificados, mapa interativo da
   rota na tela do acionamento, distância em KM validando o KM excedente e links de
   navegação (Google Maps/Waze) no voucher do prestador.

### Estado de validação
- **Migrations `0001`..`0031`** + `schema.sql` consolidado aplicam limpos no harness local.
- **Testes de banco:** 8 suites em `supabase/tests/*.test.sql` (0024→0031) — todas passando.
- **Vitest:** 106/106 (`sac.ts`, `cobranca.ts`, `pagamentos/`, `assistencia.ts`, `crm.ts`,
  `protocolos.ts`, `geo.ts`).
- `npx tsc --noEmit` limpo e `npm run build:check` OK (44 rotas).

### Pendências conhecidas (não são bugs, são decisões pendentes)
- **Gateway bancário mockado:** `MockGateway` gera linha digitável/PIX fictícios e
  determinísticos. Ligar o real = implementar `AsaasGateway.emitir` (esqueleto com
  endpoints e mapeamento prontos) + webhook chamando `registrar_retorno_cobranca`.
- **`/api/boletos/emitir-lote` é a rotina ANTIGA** (mock, cobra `taxa_administrativa`) —
  usar `/api/v1/cobrancas/*`. Pode ser removida quando você autorizar.
- **Cadastros que precisam de valor:** preços dos opcionais novos (RCF 50/75/100mil,
  Carro Reserva 10/30d, Vidros III/Completa, Assist VIP) nascem em R$0
  (Configurações → Produtos); serviços 24h vêm com valores de referência
  (Assistência 24h → Serviços 24h); **desconto máximo por regional nasce 0%**
  (Configurações → Regionais) — ou seja, hoje nenhum desconto passa sem alçada.
- **DRE mudou de comportamento** no `0027`: passou a incluir as baixas de contas a
  pagar/receber. Os números ficam maiores (e corretos) do que antes.

### Próximos passos oferecidos (o usuário escolhe)
1. **Ligar o gateway real** (Asaas) — emissão + webhook + baixa automática.
2. **Termo de adesão** com aceite eletrônico (`contratos_adesao.token`, nos moldes de `/cotacao/[token]`).
3. **Módulo de Vistoria** (tabelas `vistorias`/`vistoria_anexos` já existem; falta upload + status).
4. **Portal do Associado** (login CPF, autosserviço reusando `SERVICOS_SAC` + RLS por dono —
   o protocolo já nasce pronto para o canal `PORTAL`).
5. **SLA / notificações do protocolo** (prazo por prioridade, aviso ao responsável, e-mail ao associado).

## O que é
Sistema de gestão para **associação de proteção veicular** (associados, frota, eventos/sinistros,
financeiro, precificação por FIPE). Escala esperada: grande (maior que o "Smartvida").
Prioridade: **segurança (RLS)** e **sempre validado** antes de commitar.

- **Repo:** `cadastrosmartcarbrasil-rgb/scar` · **branch de trabalho/deploy:** `claude/claude-md-opcao-x-98kfj5`
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
  schema.sql                    # consolidado (gerado por npm run schema) p/ o SQL Editor
  tests/*.test.sql              # testes FUNCIONAIS do banco (um por modulo) + bootstrap.sql
  functions/                    # edge functions (webhook-banco, enviar-email)
scripts/
  db-test.sh                    # sobe pg, aplica migrations e roda supabase/tests em bancos isolados
  schema-build.sh               # regenera supabase/schema.sql
  build-check.sh                # next build da validacao/CI (env dummy quando nao ha env)
  deploy.ps1 / deploy.sh        # publica no VPS (roda o git pull DENTRO do servidor)
DEPLOY.md                       # runbook de deploy (migrations + VPS + diagnostico)
.github/workflows/ci.yml        # CI: tipos, Vitest, migrations+testes de banco, build
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
    assistencia.ts              # KM excedente, trava do acionamento e voucher do prestador + testes
    crm.ts                      # esteira/Kanban, itens obrigatorios e politica de desconto + testes
    protocolos.ts               # categorias/prioridade/status, WhatsApp-email e ajuste de boleto + testes
    geo.ts                      # endereco/coordenada, links Google-Waze e rotulo da rota + testes
    sac-servicos.ts             # menu modular de VCards do SAC (SERVICOS_SAC + modo)
  hooks/                        # um arquivo por dominio (use-*.ts), TanStack Query
  components/                   # ui/ (Button,Input,Modal,Card,field), + por dominio
                                # protocolos/central-protocolos.tsx, sac/acoes-veiculo.tsx
  app/(dashboard)/              # telas internas (layout gateia staff + mostra logo)
  app/(auth)/login, app/portal  # login staff e portal do associado
  app/api/                      # route handlers (cnpj, placa, fipe, usuarios, portal/login, boletos)
  app/api/v1/cobrancas/         # gerar (lote por periodo) e remessa (envio ao banco)
  app/api/v1/assistencia/       # acionamento (com alcada de liberacao) e voucher do prestador
  app/api/v1/geo/               # proxy de mapas (geocode + rota): Google ou OSM/OSRM
  app/api/v1/vendas/desconto/   # alcada de excecao do desconto (sessao do gestor)
  app/(dashboard)/protocolos/   # Central de Protocolos (fila + KPIs); aba espelhada no /sac
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
· `0026_assistencia_24h` (MODULO ASSISTENCIA 24H: papel `assistencia_24h` (comparado como TEXTO,
gotcha do 0017); catalogo `servicos_assistencia` (valor padrao, plano de contas `categoria_dre_id`,
`cobra_km_excedente`+`valor_km_excedente`+`km_franquia`, `computa_limite`+`limite_quantidade`+
`limite_janela_meses`, status) + seed de 9 servicos; `fornecedores` ganha `prestador_assistencia/
whatsapp/cobertura/chave_pix/observacoes` e a tabela `prestador_servicos` (o que cada prestador
atende e por quanto); `acionamentos_assistencia` (protocolo ASS-YYYYMMDD-XXXX + `codigo_os`
OS-YYYYMMDD-XXXX, origem/destino jsonb, valores, trava e liberacao, `lancamento_id`),
`acionamento_cotacoes` e `acionamento_historico` (trilha automatica por trigger). Motor:
`elegibilidade_assistencia(veic)` (consumo por janela flutuante em MESES, so conta AUTORIZADO/
EM_ATENDIMENTO/CONCLUIDO), `situacao_assistencia_veiculo(veic)` (ativo + adimplente + alertas ->
`pode_acionar`+`motivos[]`), `abrir_acionamento(...)` (bloqueia e so passa com
`pode_liberar_assistencia()` + justificativa), `registrar_cotacao_assistencia`,
`confirmar_prestador_assistencia` (gera a OS e calcula KM excedente), `concluir_acionamento`
(cria o lancamento em Contas a Pagar, idempotente), `cancelar_acionamento`,
`marcar_voucher_enviado`, `historico_assistencia_veiculo` e `prestadores_do_servico`).
· `0027_assistencia_centro_custo` (REFINO DA 24H: (A) CENTRO DE CUSTO — seed do centro
`ASSIST24` "Assistencia 24 Horas" + `centro_custo_assistencia()`; todo lancamento do modulo nasce
nele (backfill dos antigos); prestadores seguem em `fornecedores` e o pagamento no fluxo padrao;
(B) OS EDITAVEL — `atualizar_acionamento(valor,km,valor_km,km_percorrido,destino,prazo,obs,motivo)`,
`trocar_prestador_acionamento(acion,fornecedor,motivo,...)` (cancela o lancamento anterior em
aberto e gera o novo; zera o voucher) e `cancelar_acionamento` com justificativa OBRIGATORIA;
(C) SINCRONIA — `sincronizar_lancamento_acionamento()` cria/atualiza/cancela o titulo enquanto ele
nao tem baixa; com baixa, NAO altera e registra a divergencia; (D) AUDITORIA — `acionamento_edicoes`
+ trigger `fn_acionamento_auditoria` (campo, de->para, quem, quando, motivo via
`set_config('scar.motivo_edicao')`; `created_at` usa `clock_timestamp()` p/ ordenar edicoes da mesma
transacao) e `historico_edicoes_acionamento()`; (E) RELATORIOS — `gerar_dre`/`gerar_dre_resumo`
ganham 4o argumento `p_centro_custo_id` e passam a considerar as BAIXAS de contas a pagar/receber
(as versoes de 3 args delegam); novo `resumo_por_centro_custo(inicio,fim,regional?)`).
· `0028_crm_vendas_refino` (CRM DE VENDAS: (A) PIPELINE — novo status `EM_NEGOCIACAO` (comparado
como TEXTO, gotcha do 0017) + `mover_lead_status(lead,status_texto,obs)` (valida a transicao, exige
motivo na perda, bloqueia ATIVO/EM_AUDITORIA pelo funil) e `leads_kanban(regional?,consultor?)`
(card com a ultima cotacao); `fn_lead_historico` passa a gravar a obs via `set_config('scar.obs_lead')`;
(B) COTACAO EDITAVEL — `cotacoes` ganha `plano_id`/`opcionais_ids` (agora persistidos) +
`atualizar_cotacao(...)` que recalcula o snapshot pelo `cotar_plano` enquanto `lead_em_negociacao()`,
recusando qualquer edicao que remova item de `produtos_obrigatorios_cotacao(tipo,plano,fipe)`;
(C) DESCONTO — `regionais.percentual_maximo_desconto_venda` (+`desconto_observacao`) e
`limite_desconto_regional()`; `cotacoes.desconto_percentual/valores/total_com_desconto/
adesao_com_desconto/aprovado_por/justificativa`; trigger `fn_cotacao_valida_desconto` (trava valendo
para QUALQUER caminho, inclusive insert direto) + `pode_aprovar_desconto()` (admin/gestor_regional),
`aplicar_desconto_cotacao()` e `simular_desconto_cotacao()` p/ a UI).
· `0029_protocolos_sac` (SAC + CENTRAL DE PROTOCOLOS: (A) FICHA — `opcionais_veiculo(veiculo)`
devolve SO o que o veiculo contratou (plano via `cotar_plano` + avulsos de `veiculo_produtos`), com
`origem` PLANO/AVULSO e o consumo por janela; substitui o `opcionais_elegibilidade` na ficha do SAC
(que lista o catalogo inteiro); (B) BOLETO EDITAVEL — `titulos_financeiros` ganha `valor_original/
desconto/acrescimo/observacao/alterado_por/alterado_em`; `ajustar_titulo(titulo,vencimento,desconto,
acrescimo,obs)` recalcula SEMPRE a partir do original (nao acumula) e recusa pago/cancelado;
`reemitir_titulo(titulo)` limpa o gateway p/ 2a via; `titulos_do_cliente(cliente,veiculo?,limite)`;
(C) PROTOCOLO = a tabela `atendimentos` EVOLUIDA (nada de tabela paralela): novos valores de
`tipo_atendimento` (`FINANCEIRO`/`DUVIDAS`/`RECLAMACAO`/`OUTROS`, comparados como TEXTO), enums
`prioridade_atendimento` e `tipo_interacao_protocolo`, colunas `prioridade/responsavel_id/
encerrado_em/encerrado_por/solucao` e `veiculo_id` AGORA NULAVEL (protocolo da pessoa); nova
`protocolo_interacoes` (`created_at` = `clock_timestamp()`); (D) FUNCOES — `abrir_protocolo(...)`,
`registrar_interacao_protocolo(...)` (1o retorno move ABERTO->EM_ANDAMENTO),
**`transferir_atendimento(...)`** (nome escolhido porque `transferir_protocolo` JA EXISTE p/ eventos),
`alterar_status_protocolo(...)`, `encerrar_protocolo(id,solucao)` (solucao obrigatoria),
`listar_protocolos(status,responsavel,busca,prioridade,regional,limite)`, `interacoes_protocolo(id)`
e `resumo_protocolos(regional)` p/ o card do dashboard).
· `0030_sac_alertas_ordenacao` (CORRECOES DO SAC: (A) ALERTAS — o card do SAC lia as LINHAS de
`veiculo_alertas` e o form do veiculo montava checkbox pelo CATALOGO `tipos_alerta` filtrando
`ativo` — alerta de tipo desativado (ou duplicado) sumia da tela e ninguem resolvia (caso da placa
EWG9B46). Agora: dedup dos ativos + indice unico parcial `uq_veiculo_alerta_ativo (veiculo_id,
tipo_alerta_id) where ativo`, colunas `resolvido_por`/`resolucao_observacao`, e as funcoes
`alertas_veiculo(veiculo, incluir_resolvidos)` (traz o tipo junto, INCLUSIVE desativado, com
`tipo_ativo`), `abrir_alerta_veiculo(veiculo,tipo,msg)` (idempotente por tipo — nunca duplica a
contagem) e `resolver_alerta_veiculo(alerta,obs)` (baixa com autor/data); (B) ORDENACAO —
`ordem_status_veiculo(status)` (ativo 0 · em_evento 1 · vistoria_pendente 2 · suspenso 3 · inativo 4
· baixado 5 · excluido 6) e `veiculos_do_cliente(cliente)`, que devolve a lista do SAC ja ordenada
(status → data_ativacao desc → modelo → placa) e com plano/alertas/eventos/assistencia resolvidos
no banco — a rota `/visao-360` deixou de fazer 4 consultas separadas).
· `0031_assistencia_geolocalizacao` (GEO DA OS 24H — a "ordem de servico" e a propria
`acionamentos_assistencia` (nada de `ordens_servico_24h` paralela): colunas `endereco_origem/
latitude_origem/longitude_origem`, `endereco_destino/latitude_destino/longitude_destino`,
`distancia_km_calculada`, `duracao_minutos`, `rota_polyline` e `rota_calculada_em`; o jsonb
`origem`/`destino` segue sendo a digitacao e o trigger `trg_acionamento_geo` espelha nas colunas
planas por QUALQUER caminho; `km_excedente_servico(servico,distancia)` (espelho do
`calcularKmExcedente`); `definir_trajeto_acionamento(...)` grava rota, RECALCULA KM excedente e
valores e chama `sincronizar_lancamento_acionamento` (auditoria do 0027 pega sozinha);
`links_navegacao_acionamento(...)` + `ponto_navegacao`/`urlencode` devolvem Google (rota e pin) e
Waze (`ll` p/ coordenada, `q` p/ endereco)).
· `0032_financeiro_dre_pro` (financeiro nivel gestao: (A) `lancamentos_financeiros` ganha
`numero_documento`/`competencia`/`observacoes`/`parcela_numero`/`parcela_total`/`grupo_parcelas`
e os CACHES `valor_pago`/`valor_saldo` mantidos pelo trigger BEFORE `fn_lanc_calcular_saldo()`
(fim do calculo de saldo linha a linha na tela); `movimentacoes_caixa.lancamento_id` liga a
movimentacao avulsa ao titulo p/ o DRE nao contar duas vezes; (B) DRE ganha **REGIME**:
`dre_movimentos(inicio,fim,regional,regime)` e a fonte unica (CAIXA = baixas; COMPETENCIA =
competencia do titulo) + movimentacoes avulsas, titulos de mensalidade e NF de evento, com
`gerar_dre_completo`/`gerar_dre_resumo_completo`/`gerar_dre_mensal` por cima. As versoes do 0027
(`gerar_dre` 3 e 4 args, `gerar_dre_resumo`, `resumo_por_centro_custo`) seguem INTACTAS; valor sem
categoria vira linha "nao classificadas" (1.9.99/4.9.99) em vez de sumir; (C) indicadores:
`financeiro_resumo`, `financeiro_fluxo_mensal` (previsto x realizado) e `financeiro_aging`
(faixas de atraso); `quitar_lancamento(id,data,conta)` baixa o saldo remanescente; +9 categorias
no plano de contas. **SEGURANCA:** as RPCs novas sao SECURITY DEFINER, entao `escopo_regional(uuid)`
forca a regional de quem chama — so admin/financeiro (`tem_acesso_global`) leem consolidado e
usuario sem regional nao le nada.)
· `0033_baixa_sem_atalho` (remove o `quitar_lancamento` criado no 0032: ele gravava baixa "de um
clique" com a data de hoje e SEM conta bancaria nem comprovante. Toda liquidacao passa pelo registro
de baixa completo — e ele que sustenta a conciliacao bancaria. Nada mais dependia da funcao: a baixa
e um insert em `baixas_financeiras` e os triggers `fn_recalcular_lancamento` (0012) e
`fn_lanc_calcular_saldo` (0032) cuidam de status e saldo).
· `0034_vendas_rota_completa` (a rota da venda para de terminar no CPF: (A) COMISSAO EM DOIS NIVEIS —
`regionais.taxa_comissao_adesao/recorrente` (fracao, mesma unidade de `vendedores`) e o TETO da
franquia; triggers `fn_vendedor_valida_comissao` (vendedor nunca passa a regional) e
`fn_regional_valida_comissao` (nao da para baixar a regional deixando vendedor acima) +
`limite_comissao_regional()`; (B) FICHA COMPLETA no lead — `tipo_pessoa`, `rg_ie`,
`data_nascimento`, `endereco` jsonb, `cliente_existente_id`, `chassi`, `renavam`, `cor`,
`ano_fabricacao`, `crlv_qrcode`, `crlv_url`, `vendedor_id`, `plano_id`, `adesao_forma`
(enum `forma_recebimento_adesao`), `adesao_valor`; (C) VISTORIA ANTES DA BASE — `vistorias.veiculo_id`
vira NULAVEL e ganha `lead_id` (check exige um dos dois); as policies `vist_*`/`vanx_*` foram
reescritas para enxergar tambem por lead — sem isso a vistoria da venda ficaria invisivel;
(D) CHECKLIST — `checklist_lead(lead)` devolve item/grupo/ok/detalhe e `lead_pronto_para_base()`;
`autorizar_entrada_lead` REESCRITA: recusa com `check_violation` listando o que falta, cria/atualiza
o associado com a ficha inteira, cria o veiculo completo e converte a vistoria do lead em vistoria
do veiculo; (E) ADESAO — `VENDEDOR_NA_HORA` nao gera NADA no financeiro (so a comissao ja `pago`);
boleto/PIX/cartao geram titulo a receber + comissao `pendente`, e `repassar_comissao_vendedor()`
cria o contas a pagar do repasse; (F) bucket privado `vendas` para fotos da vistoria e CRLV.)
· `0035_vendedor_completo` (o vendedor vira cadastro proprio: `nome`/`email`/`telefone`/`documento`,
`codigo` UNICO (hotlink), dados bancarios (`banco`/`agencia`/`conta`/`chave_pix`), prazo de pagamento
(`dia_pagto_entrada` 1..7 na SEMANA e `dia_pagto_recorrencia` 1..31 no MES) e trilha de onboarding
(`contrato_url`, `boas_vindas_enviada_em`). **`usuario_id` vira NULAVEL** — cadastra-se o vendedor e o
acesso ao portal vem depois. `regionais` ganha `dia_pagto_entrada_padrao`/`dia_pagto_recorrencia_padrao`
(herdados por quem nao definir o proprio). Funcoes: `gerar_codigo_vendedor(nome, ignorar)` (primeiro
nome sem acento, desambigua com sufixo), trigger `fn_vendedor_preencher` (herda o nome do usuario
quando em branco e garante o codigo), `prazo_pagamento_vendedor()` (proprio x padrao da franquia),
`listar_vendedores(regional, busca)` (franquia, teto herdado, portal, vendas e comissao pendente) e
`vendedor_por_codigo()` (hotlink; concedida tambem ao `anon` e ignora vendedor inativo).)
· `0036_portal_regional` (PORTAL DA FRANQUIA: (A) `regionais.codigo` UNICO — a unidade tambem tem
hotlink; `gerar_codigo_regional` + trigger `fn_regional_codigo` (o codigo nao pode colidir com o de
vendedor); `leads.origem_hotlink` guarda QUAL link trouxe o lead; `resolver_hotlink(codigo)` devolve
vendedor OU regional; (B) RPCs do portal — `regional_painel` (leads, hotlink, convertidos, taxa de
conversao, veiculos, equipe, comissao paga/pendente, a receber/a pagar da unidade e resultado),
`regional_desempenho_vendedores`, `regional_comissoes` e `regional_leads`. **ISOLAMENTO:** todas sao
SECURITY DEFINER usando `escopo_regional()` (0032) — passar o id de outra franquia NAO muda o que
volta, e lancamento da matriz (`regional_id` nulo) nunca aparece para um gestor. Ha teste cobrindo
exatamente isso.)

· `0037_financeiro_regional` (FINANCEIRO COMPACTO DA FRANQUIA: o portal (0036) reusava a tela do
financeiro da matriz — boa tela, errada para a unidade: pedia plano de contas, centro de custo e
conta bancaria, cadastros que sao da matriz. A operacao toda e da matriz; a franquia so movimenta
COMISSAO. Entao: (A) `lancamentos_financeiros.vendedor_id` (favorecido do repasse) e
`baixas_financeiras.forma_pagamento`/`observacao` (a unidade nao concilia banco: registra COMO
pagou); (B) categoria `1.3.01` "Comissao de Franquia (repasse da matriz)"; (C) **CORRECAO de 3
funcoes de 0034** que usavam `join usuarios` para achar o nome do vendedor — depois que o 0035
tornou `vendedores.usuario_id` OPCIONAL o join interno DESCARTAVA o vendedor sem portal:
`repassar_comissao_vendedor` gerava o titulo com `regional_id` NULO (o repasse da franquia caia na
MATRIZ), `fn_regional_valida_comissao` deixava furar o teto "vendedor nunca passa a regional" e
`checklist_lead` dizia "nao informado" com vendedor preenchido — todas passaram a `left join` +
`coalesce(v.nome, u.nome)`; (D) RPCs `regional_categoria_movimento`, `regional_titulo_no_escopo`,
`regional_financeiro_resumo`, `regional_financeiro_titulos` (situacao ja efetiva),
`regional_lancar_titulo` (so `COMISSAO_RECEBER`/`COMISSAO_PAGAR`; a regional gravada e SEMPRE a de
quem chama e o vendedor tem de ser da casa), `regional_baixar_titulo`, `regional_cancelar_titulo`
(pede motivo, recusa titulo com baixa) e `regional_repassar_comissao` — todas SECURITY DEFINER com
`escopo_regional()`, de modo que titulo da matriz (`regional_id` nulo) ou de franquia vizinha nao e
lido NEM baixado por um gestor.)

## Módulos (status: todos funcionais)
Assistência 24h (`/assistencia`: painel de acionamento com trava + limites em tempo real, cotação,
OS, voucher ao prestador e Contas a Pagar) · SAC / Atendimento (`/sac`: **veículo-first + lazy** — busca por Nome/CPF/Placa → `visao-360` traz
uma **lista resumida leve** (Placa/Marca-Modelo/Ano/Status, sem opcionais); ao clicar, `/api/v1/sac/veiculo`
carrega o **detalhe sob demanda** e isola o item, abrindo o **menu modular de serviços**
(`SERVICOS_SAC`): **Evento** (redireciona direto p/ `/sinistros/novo?placa=` — chamamos sinistro
de EVENTO), Assistência 24h, **Editar Veículo/Item**, **Histórico Financeiro**, **WhatsApp**,
**E-mail**, **Abrir Protocolo**, 2ª via de Boleto, Vistoria/Acessórios, Cancelamento — os que geram
chamado criam um `atendimento` (protocolo) vinculado ao `veiculo_id` (trava de propriedade no banco).
Abas **Veículos | Eventos | Protocolos** (a 3ª é a Central filtrada pelo associado);
a lista de veículos marca quem já teve **evento** ou acionou **Assist 24h**.
Também: toggle de faturamento Agrupado↔Individual, status financeiro e os opcionais
**efetivamente contratados** (`opcionais_veiculo`, com o consumo da janela flutuante).
APIs REST em `/api/v1/sac/*` — `busca`, `visao-360`, `veiculo`, `faturamento`, `boleto`, `atendimento`
— reutilizáveis por Portal do Associado/Assistência 24h/Chatbot)
· **Protocolos** (`/protocolos`: Central com fila, filtros, histórico, transferência e encerramento)
Vendas/CRM (`/vendas` mobile-first: captura de lead + FIPE por placa/cascata, cotação com
link público `/cotacao/[token]` detalhada/consolidada + print-PDF, esteira com trava de
Auditoria — só papel `auditoria`/`admin` clica "Autorizar Entrada" e efetiva cliente+veículo)
· Associados (painel `/associados/[id]` com abas) · Veículos/Contratos · Eventos/Sinistros
(protocolo, reparo próprio/terceiro, financeiro do evento) · Precificação (simulador + editor de
tabela FIPE com reajuste % + importação por planilha, uma por tipo de veículo) · Empresa (logo/diretoria/mandatos/documentos) · Fornecedores (auto
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

## Assistência 24h — geolocalização e rota (0031)
- **Provedor de mapas com fallback:** proxy server-side `/api/v1/geo` (`action: geocode | rota`),
  no mesmo padrão do `/api/fipe` — a chave nunca vai ao navegador. Com `GOOGLE_MAPS_API_KEY`
  usa Google (Geocoding + Directions); **sem chave** cai em OpenStreetMap/Nominatim + OSRM,
  que são públicos. Trocar de provedor é só preencher a env.
- **Mapa:** `<MapaRota>` (`src/components/mapa/mapa-rota.tsx`) usa **Leaflet** com tiles do OSM,
  import dinâmico dentro do efeito (o Leaflet não roda no SSR). Pinos A (resgate) / B (destino)
  e o traçado em ciano. `invalidateSize()` no fim — sem isso o mapa em modal nasce cinza.
- **`<TrajetoAcionamento>`:** origem + destino (CEP → ViaCEP, "Localizar no mapa" → geocode),
  botão **Calcular rota**, distância/tempo e a **simulação do KM excedente** em tempo real
  (rota − franquia × valor do KM). Usado na abertura do acionamento e na edição do trajeto da OS.
- **Editar o trajeto recalcula tudo:** `definir_trajeto_acionamento` refaz KM excedente, valor
  total e sincroniza o Contas a Pagar (título já baixado não é alterado — regra do 0027);
  a mudança entra na trilha de auditoria da OS e exige motivo na tela.
- **Voucher do prestador** leva *Rota autorizada: X km · Y min*, **link do Google Maps** (rota
  completa), **links do Waze** (resgate e destino) e o aviso de que rota e KM autorizados são
  estritamente os da OS — trecho não autorizado não é pago. Espelho puro em
  `src/lib/geo.ts` + `rotaDoVoucher` (`src/lib/assistencia.ts`), com testes.

## SAC — alertas, busca e ordenação (0030)
- **Alerta do veículo tem UMA fonte:** `alertas_veiculo` (linhas de `veiculo_alertas` + o tipo).
  O componente `<AlertasVeiculo veiculoId>` (`src/components/veiculos/alertas-veiculo.tsx`) é o
  mesmo na **ficha do SAC** e no **formulário do veículo** — lista, adiciona e **resolve**
  (com observação, autor e histórico). Nunca voltar a montar a lista pelo catálogo `tipos_alerta`:
  alerta de tipo desativado sumia da tela e o atendente não tinha como resolver.
- **Salvar o veículo NÃO reescreve os alertas** de um veículo já cadastrado (`alertasIds` só é
  enviado no cadastro novo) — senão apagaria mensagem, autor e resolução de cada pendência.
- **Um alerta ativo por tipo por veículo** (índice único parcial). Reabrir o mesmo tipo atualiza a
  mensagem em vez de duplicar o contador.
- **Busca por placa vai direto ao atendimento:** `/api/v1/sac/busca` devolve `veiculo_id`+`placa`
  nos acertos por placa (uma linha por veículo) e o SAC já abre o item. Nome e CPF/CNPJ continuam
  abrindo a ficha do associado com a lista.
- **Ordenação padrão de veículo em todo o sistema:** ativos primeiro, inativos/cancelados no fim;
  desempate por data de ativação (recentes primeiro) e modelo/placa. No banco é
  `ordem_status_veiculo` (usada por `veiculos_do_cliente`); na UI é `ordenarVeiculos`
  (`src/lib/sac.ts`, com testes) aplicada em `/veiculos`, ficha do associado e Portal.

## SAC + Central de Protocolos (0029) — ficha, VCards e fila
- **Protocolo NÃO é tabela nova.** É a `atendimentos` evoluída (prioridade, responsável,
  encerramento, `veiculo_id` nulável) + `protocolo_interacoes` para a tramitação. Mesma regra
  do módulo 24h: nada de estrutura paralela ao que já existe.
- **Ficha do veículo só mostra o contratado:** `/api/v1/sac/veiculo` usa `opcionais_veiculo`
  (plano + avulsos de `veiculo_produtos`), com badge de origem (plano/opcional) e o consumo
  `usados/limite` **apenas** para quem tem regra de limite. O antigo `opcionais_elegibilidade`
  (catálogo inteiro) continua existindo para a tela de elegibilidade, não para a ficha.
- **VCards do atendimento** (`src/lib/sac-servicos.ts`, campo `modo`): `evento` → `/sinistros/novo?placa=`,
  `assistencia` → `/assistencia?placa=`, **`editar`** (fundiu Cadastro+Upgrade → `/veiculos?editar=<id>`),
  **`financeiro`** (histórico de títulos com edição do boleto em aberto e 2ª via), **`whatsapp`**,
  **`email`**, `protocolo`/`boleto`/`vistoria`/`cancelamento` (abrem chamado).
- **Boleto editável:** só `pendente`/`vencido`. `ajustar_titulo` altera vencimento, desconto e
  acréscimo recalculando **a partir do `valor_original`** (aplicar duas vezes não acumula) e
  `reemitir_titulo` limpa os campos do gateway para a 2ª via. Espelho puro em `src/lib/protocolos.ts`
  (`valorAjustado`, `tituloEditavel`, `validarAjuste`) com testes.
- **Abertura:** pela ficha do **veículo** (VCards) ou pela ficha do **associado** (botão
  "Abrir protocolo" no cabeçalho do SAC — `veiculo_id` nulo). Campos: categoria, assunto,
  descrição, prioridade; número `ATD-YYYYMMDD-XXXX`.
- **Central** (`/protocolos` e aba **Protocolos** do SAC, filtrada pelo associado): fila com filtros
  (status/responsável/prioridade/busca), detalhe com **histórico de interações**, comentário
  (interno ou visível), **transferência entre atendentes** (`transferir_atendimento`) e
  **encerramento com solução obrigatória**.
- **Dashboard:** banner clicável "Protocolos em aberto" (abertos, em atendimento, alta/urgente,
  meus, parados +7 dias) via `resumo_protocolos`, com `refetchInterval` de 60s.

## CRM de Vendas (0028) — Kanban, cotação editável e desconto
- **Visualização:** `/vendas` alterna **Kanban ↔ Lista** (a escolha fica no `localStorage`). Colunas:
  Novo Lead → Cotação Criada → Proposta Enviada → **Em Negociação** → Aprovado (Auditoria) → Perdido.
  Arrastar o card chama `mover_lead_status`; soltar em "Perdido" abre o modal de motivo (obrigatório).
  Cards em `EM_AUDITORIA`/`ATIVO` ficam **travados** (cadeado) — quem decide ali é a Auditoria.
- **Cotação editável** (`/vendas/[id]` → botão *Editar* na cotação): troca FIPE, plano/combo e
  opcionais enquanto o lead **não** foi para a auditoria. Os itens **obrigatórios** (base + plano)
  aparecem marcados e desabilitados; o banco recusa qualquer snapshot que os remova.
- **Desconto por franquia:** limite em `Configurações → Regionais` (campo *Desconto máximo de
  venda*). Na cotação, o campo de % mostra o limite e o valor final em tempo real; **dentro do
  limite** grava direto, **acima** o botão vira "Salvar e pedir aprovação" e abre o modal de alçada
  (e-mail + senha do **Gestor/Diretor** + justificativa). A rota `/api/v1/vendas/desconto` autentica
  o gestor numa sessão efêmera e aplica o desconto com ela, gravando `desconto_aprovado_por`.
  Voltar para dentro do limite limpa a aprovação. Uma trigger garante a regra mesmo fora da UI.

## Módulo Assistência 24h (0026) — fluxo, trava e integrações
- **Entradas:** menu lateral → **Assistência 24h** (`/assistencia`) e o card **Assistência 24h** do
  SAC (leva a `/assistencia?placa=` com o veículo já selecionado). Abas: Painel de Acionamento,
  Acionamentos, Serviços 24h e Prestadores.
- **Parametrização** (aba Serviços 24h): descrição, **valor padrão pago**, **plano de contas**
  (`categorias_dre`, usado no lançamento), **KM excedente** (checkbox + valor + franquia) e a
  **regra de limite** (checkbox + N usos / janela em meses). Status Ativo/Inativo. 9 serviços vêm
  no seed (Reboque Passeio/Utilitário, Chaveiro, Auxílio Mecânico, Troca de Pneu, Pane Seca,
  Carga de Bateria, Carro Reserva, Transporte).
- **Trava:** `situacao_assistencia_veiculo` exige veículo **ATIVO**, sem título vencido (do veículo
  ou do associado, no agrupado), associado não marcado como inadimplente e sem alerta cadastral
  ativo. O limite do serviço entra na mesma avaliação (`elegibilidade_assistencia`, janela
  flutuante em MESES — cancelado não consome).
- **Alçada:** bloqueado, o painel abre o modal **Liberação de superior**: e-mail + senha do gestor
  (`admin`/`financeiro`/`gestor_regional`) + justificativa. A rota `/api/v1/assistencia/acionamento`
  autentica o gestor numa **sessão efêmera** e chama `abrir_acionamento` com ela — a alçada é
  conferida no banco (`pode_liberar_assistencia`) e ficam gravados `liberado_por`,
  `liberacao_justificativa` e os `bloqueio_motivos`.
- **Operação:** cotação com prestadores (valores acordados vêm de `prestador_servicos`) →
  `confirmar_prestador_assistencia` gera a **OS** (`OS-YYYYMMDD-XXXX`) já com o KM excedente →
  `/api/v1/assistencia/voucher` monta o comunicado (texto/HTML), envia por e-mail via **Resend**
  (quando `RESEND_API_KEY` existe) e devolve **link do WhatsApp** + texto para copiar.
- **Financeiro:** `concluir_acionamento` cria o **lançamento em Contas a Pagar** (DESPESA,
  fornecedor = prestador, plano de contas do serviço, descrição com o código da OS) — idempotente;
  a baixa é a do Financeiro. O papel **`assistencia_24h`** tem policy para cadastrar prestadores e
  lançar/baixar contas a pagar.
- **Ficha do veículo:** o histórico de acionamentos aparece no SAC (card "Assistência 24h deste
  veículo") e no próprio painel, marcando quais consumiram cota.
- **Centro de custo (0027):** todo lançamento do módulo nasce no centro **"Assistência 24 Horas"**
  (`ASSIST24`) — nada de estrutura financeira paralela: prestador é `fornecedores`, pagamento é
  Contas a Pagar, classificação é o plano de contas do serviço + esse centro de custo.
- **OS editável (0027):** "Editar OS" (valor, KM excedente, KM percorrido, destino, prazo,
  observações), "Trocar prestador" (justificativa obrigatória) e "Cancelar OS" (justificativa
  obrigatória). Toda alteração **sincroniza o título** no Contas a Pagar: em aberto, recalcula;
  na troca, cancela o do prestador anterior e gera o do substituto; **se já houve baixa, não mexe**
  e registra a divergência para tratamento manual.
- **Auditoria:** card "Histórico de alterações" na OS — campo, de → para, data/hora, operador e
  motivo (trigger no banco, pega até alteração feita fora das telas).
- **Relatórios:** `/financeiro` → DRE com **filtro por centro de custo** e a tabela
  **Receitas × Despesas por centro de custo** (clicar num centro filtra o DRE). A aba Contas a
  Pagar/Receber também filtra e exibe o centro de custo.

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

## Financeiro e DRE (0032) — arquitetura
- **`/financeiro` tem 3 abas:**
  - **Contas a Pagar / Receber** — 4 indicadores do periodo (a receber, a pagar, resultado de caixa,
    inadimplencia com % da carteira e "vence em 7 dias"), filtro de periodo com atalhos
    (mes/mes anterior/trimestre/semestre/ano) + **escolha do campo de data** (vencimento, competencia
    ou emissao), filtros de tipo/situacao/categoria/centro de custo, busca livre e export CSV.
    A tabela mostra documento, parcela, classificacao contabil, **saldo devedor** e situacao REAL
    (`situacaoTitulo` marca atrasado pela data de hoje, sem depender da rotina do banco); acoes por
    linha: baixar, **quitar saldo** (1 clique, RPC), editar e cancelar. Rodape soma o que esta em tela.
  - **Fluxo de Caixa** — previsto x realizado por mes (barras acima/abaixo do eixo), saldo acumulado
    projetado e **aging** da carteira (a vencer / 1-30 / 31-60 / 61-90 / +90).
  - **DRE** — seletor de **REGIME** (Caixa x Competencia) e de centro de custo, comparativo com o
    periodo anterior (mes fechado compara com o mes anterior inteiro), **AV%** (analise vertical sobre
    a receita bruta), subtotais por grupo, linha de **Margem de Contribuicao**, **ponto de equilibrio**,
    grafico de 12 meses, export CSV e impressao.
- **Regra de ouro do DRE:** ele le `dre_movimentos()`. Titulo cancelado nunca entra; movimentacao de
  caixa com `lancamento_id` preenchido nao entra (evita dupla contagem); titulo de mensalidade so
  entra se nao houver `movimentacoes_caixa` espelhando. A despesa da Assistencia 24h entra pelo
  lancamento que o `sincronizar_lancamento_acionamento` (0027) cria.
- **Nada de excluir dinheiro:** cancelar um titulo muda o status (historico imutavel); a baixa a maior
  continua barrada pelo trigger de 0012.
- **Baixa sem atalho (0033):** NAO existe botao de "quitar saldo". Toda liquidacao abre o modal de
  baixa, que ja nasce com o **valor pago pre-preenchido com o saldo devedor** (o caso comum e pagar
  o valor cheio; quem paga parcial edita) e pede a **conta que pagou/recebeu** — sem isso a
  conciliacao bancaria nao fecha. O link "Usar o saldo total" so aparece quando o valor digitado
  diverge do saldo (ex.: depois de lancar juros ou desconto).
- **Anexos do titulo:** `<AnexosLancamento lancamentoId>` (bucket privado `financeiro` +
  `anexos_financeiros` do 0012). O campo **so e liberado depois que o lancamento existe** — no
  cadastro novo o modal grava primeiro e so entao mostra a area de upload (botao vira "Concluir").
  Assim um cadastro abandonado nunca deixa arquivo orfao no storage. Se a linha do anexo falhar, o
  arquivo recem-enviado e removido do bucket. Carne de parcelas: cada parcela e um titulo proprio,
  entao o anexo entra pela edicao da parcela a que o documento pertence.
- **Logica pura testada (Vitest):** `src/lib/money.ts` (mascara/parse/aritmetica de centavos) e
  `src/lib/financeiro.ts` (situacao do titulo, aging, parcelamento com ajuste de centavos na ultima
  parcela, estruturacao do DRE, indicadores, periodo anterior).
- **Componentes:** `src/components/financeiro/` — `ui-financeiro.tsx` (Indicador, Selo, FiltroPeriodo,
  Vazio, baixarCsv), `lancamento-modal.tsx` (form em secoes + previa do parcelamento),
  `baixa-modal.tsx`, `contas-financeiro.tsx`, `fluxo-caixa.tsx`, `dre-report.tsx`.

## Convenção de moeda (UI)
- **Todo campo de dinheiro usa `<MoneyInput>` de `@/components/ui/field`** — nunca `<input type="number">`
  (ele nasce com "0", obriga manobra de cursor e aceita "0012").
- `MoneyInput` recebe `value: number | null` e `onChange: (v: number | null) => void`; mostra prefixo
  R$, alinha a direita, usa `.tnum` e seleciona tudo ao focar. Campo vazio = `null` (placeholder `0,00`).
- Regra de digitacao (`src/lib/money.ts`, testada): **digitacao LIVRE**. Em foco o campo mostra
  exatamente o que foi digitado (`352,00`, `1500`, `1.234,56`, `1234.56`); ao sair, formata em BR
  com 2 casas (`352,00`, `1.500,00`). `352` = trezentos e cinquenta e dois reais.
- **NUNCA voltar a mascara por centavos** no `MoneyInput`: ela injeta uma virgula ja na primeira
  tecla e quem digita o separador em seguida termina com `0,0352,00` (bug real em producao).
  Ha teste de regressao em `money.test.ts` digitando "352,00" tecla a tecla.
- Somas de dinheiro usam `somarMoeda()` (centavos inteiros) para nao acumular erro de ponto flutuante.
- **Percentual usa `<PercentInput>`** (mesmo arquivo, mesma regra de digitacao livre, sufixo `%` e
  teto opcional via `max`). O valor trafega em PERCENTUAL (15,5 = 15,5%); quem guarda fracao no
  banco divide por 100 ao salvar — e o caso da comissao de Regionais e Vendedores, que e
  `numeric(6,4)`. Ha teste de regressao em `money.test.ts` (digitar "15,5" nao pode virar 16).
- Ainda em `type="number"` (nao sao moeda nem percentual de cadastro): o % de reajuste e as celulas
  da grade em `precificacao/tabela-precos-editor.tsx`.

## Precificação — importação por planilha (uma por tipo de veículo)
- **O campo já existia:** `tabela_precos_faixa`, `participacao_faixa` e `adesao_faixa` sao TODAS
  chaveadas por `tipo_veiculo_id`, e o RPC `substituir_tabela_precos(tipo, faixas, participacoes,
  adesoes)` (0018) troca de forma atomica SO o tipo escolhido. Uma planilha por tipo de veiculo e o
  desenho natural do banco — **nao foi preciso migration** para a importacao.
- **`/precificacao` tem 3 abas:** Simulador · Tabela de Precos (editor celula a celula) ·
  **Importar Planilha**.
- **Fluxo:** escolher o tipo → *Baixar modelo* (CSV ja preenchido com a tabela em vigor daquele
  tipo) → editar no Excel → subir (.xlsx ou .csv) → **previa com diff** (novas / alteradas /
  removidas, com o valor antigo riscado ao lado do novo) → Confirmar.
- **Layout da planilha:** `FIPE_MINIMO`, `FIPE_MAXIMO`, `PARTICIPACAO`, `PARTICIPACAO_TIPO`
  (VALOR ou PERCENTUAL), `ADESAO` + **uma coluna por produto obrigatorio de FAIXA_FIPE**
  (mesma regra do editor: `metodo_preco === 'FAIXA_FIPE' && status && obrigatorio`). A ordem das
  colunas nao importa e o nome do produto casa sem acento/caixa. Valores em formato BR.
- **Validacao (`src/lib/precificacao-import.ts`, testada):** faixa sobreposta **bloqueia** (a cotacao
  acharia dois precos para o mesmo FIPE) e o erro aponta **as duas linhas do Excel**; o caso mais
  comum — faixa que comeca no MESMO valor em que a anterior termina (`200.000,00` depois de
  `...a 200.000,00`) — vem com a correcao sugerida (`comece em 200.000,01`). A varredura guarda o
  maior fim ja visto, entao pega tambem faixa **contida** dentro de outra, nao so vizinhas.
  Buraco entre faixas so **avisa**; maximo < minimo bloqueia apontando a linha; coluna desconhecida
  e produto sem coluna viram aviso, nao erro.
- **Celula com erro de formula do Excel** (`#VALOR!`, `#N/D`, `#REF!`, `#DIV/0!`, `#NOME?`, `#NUM!`,
  e os equivalentes em ingles) **bloqueia a importacao**, dizendo linha e coluna. Antes ela passava
  como celula vazia e gravava **R$ 0,00 em silencio** — o pior desfecho possivel numa tabela de
  preco.
- **A importacao SUBSTITUI a tabela inteira do tipo** (e o que o RPC faz). Por isso a previa mostra
  em destaque as faixas em vigor que sumiriam. Os demais tipos nunca sao tocados.
- **.xlsx** e lido com `exceljs` em **import dinamico** (nao pesa no bundle da pagina); `.csv` e
  parseado sem dependencia (detecta `;` ou `,`, respeita aspas e BOM).

## Rota de venda (0034) — do lead à entrada na base
- **A rota tem 4 etapas e o veículo só entra na base no fim:** cotação → **Fechamento da venda**
  (`<FechamentoVenda>` em `/vendas/[id]`) → Auditoria → base.
- **Fechamento da venda** (`src/components/vendas/fechamento-venda.tsx`) tem 4 secoes:
  **Associado** (o botao *Conferir* busca o CPF/CNPJ em `clientes` e reaproveita a ficha em vez de
  duplicar; endereco por CEP/ViaCEP), **Veiculo** (chassi, Renavam, cor e anos passam a ser
  obrigatorios), **Documentos e vistoria** (CRLV + minimo de 4 fotos) e **Adesao e vendedor**.
- **Checklist ao vivo** (`<ChecklistEntrada>`) na lateral: le a MESMA `checklist_lead()` que a
  autorizacao usa no banco, entao nao existe "passou na tela e o banco recusou". O botao
  *Autorizar entrada na base* fica **desabilitado** enquanto houver pendencia, e a trava real
  esta no `autorizar_entrada_lead`.
- **CRLV por QR Code** (`<LeitorCrlv>` + `src/lib/crlv.ts`, com testes): camera (`getUserMedia`) ou
  imagem, decodificado com **jsqr** em import dinamico. **Limite real, documentado na propria tela:**
  o QR do CRLV-e aponta para a validacao no gov.br e NAO carrega a ficha do veiculo — extrair marca/
  modelo/ano exigiria API paga (SERPRO/Senatran). O que fazemos: guardar o conteudo como prova,
  pescar placa/Renavam/chassi quando vierem, e completar a ficha pela consulta da placa (FIPE) que
  ja existe.
- **Fotos da vistoria** nascem no LEAD (bucket privado `vendas`); ao autorizar, a vistoria passa a
  apontar para o veiculo criado e vira `APROVADA`.

## Comissão em dois níveis (0034) — franquia → vendedor
- **A regional é a franquia.** Ela recebe um percentual da associacao (`Configuracoes → Regionais`:
  *Comissao da franquia* — adesao e recorrencia) e distribui parte dele aos seus vendedores.
- **Regra dura: o vendedor NUNCA passa a regional.** Ex.: regional com 15% de recorrencia pode ceder
  de 0% a 15%; 16% e recusado. Vale nos dois sentidos — tambem nao da para BAIXAR a comissao da
  regional deixando um vendedor acima do novo teto (a mensagem nomeia quem ficaria).
  Trava no banco por trigger; a tela de Vendedores mostra o teto herdado antes de salvar.
- **Vendedor e editavel** (`Configuracoes → Vendedores`, botao de lapis). Na edicao o **usuario nao
  muda** — o vinculo e um por vendedor (unique no banco), entao o campo fica travado.
- Espelho puro em `src/lib/vendas.ts` (`validarComissaoVendedor`, `margemRegional`) com testes.
  **Atencao:** comissao e `numeric(6,4)` — arredondar em 2 casas transformaria 15,5% em 16%.

## Adesão (1ª mensalidade do vendedor) — quando entra no DRE
- **Recebida pelo vendedor na hora** (`VENDEDOR_NA_HORA`): o dinheiro nunca passou pela associacao,
  entao **nada** entra no financeiro. Fica so o registro em `comissoes_vendas` como `pago`.
- **Recebida pelo nosso sistema** (boleto/PIX/cartao): vira **titulo a receber** (categoria 1.1.01) e
  a comissao do vendedor nasce **pendente**; `repassar_comissao_vendedor()` gera o **contas a pagar**
  do repasse (categoria 3.2.01) e marca a comissao como paga.
- Espelho puro em `ratearAdesao`/`adesaoEntraNoCaixa` (`src/lib/vendas.ts`), com testes.

## Cadastro do vendedor (0035) — ficha, portal e hotlink
- **`Configuracoes → Vendedores`** tem lista + 5 acoes por linha: **Ver** (ficha), **Editar**,
  **Hotlink** (copia o link), **Boas-vindas** (e-mail + contrato) e Remover.
- **O cadastro nao depende mais de um usuario existir.** `usuario_id` e opcional: cadastra-se o
  vendedor com nome/contato/comissao e o **acesso ao portal** e criado depois, pelo proprio modal
  (secao *Criar acesso / Redefinir senha*). A senha passa por `/api/v1/vendedores/acesso`, que usa a
  **admin API no servidor** (nunca no cliente) e so aceita admin/financeiro/gestor da regional.
- **Codigo** e a identidade curta do vendedor (AMANDA, CLEIDE26): sai do primeiro nome, sem acento,
  e o banco desambigua com sufixo. E o que forma o **hotlink** `https://<host>/v/<CODIGO>`.
- **Hotlink** (`/v/[codigo]`, publico — entrou em `PUBLIC_PATHS` no middleware): pagina de captura
  que cria o lead **ja vinculado ao vendedor**. Como o visitante nao tem sessao, o insert vai por
  `/api/v1/hotlink` com service_role, aceitando SO os campos do formulario e sempre amarrando ao
  vendedor do codigo. Vendedor inativo -> link nao resolve.
- **Prazo de pagamento:** o dia do vendedor vence; em branco, herda o padrao da franquia
  (`prazo_pagamento_vendedor`). Entrada e por dia da SEMANA (comissao de adesao, paga semanalmente);
  recorrencia e por dia do MES.
- **Boas-vindas** (`/api/v1/vendedores/boas-vindas`): guarda o contrato no bucket privado `vendas`
  (`contratos/<vendedor>/`) e envia por Resend com o PDF anexado (max ~5 MB). **Sem `RESEND_API_KEY`
  nao finge que enviou:** guarda o contrato, devolve o texto pronto e avisa que o envio e manual.
  So marca `boas_vindas_enviada_em` quando o e-mail realmente saiu.

## Portal da Franquia (0036) — `/regional`
- **Quem entra:** papel `gestor_regional` COM regional no cadastro (admin/financeiro entram para dar
  suporte, mas o banco continua limitando o que veem). Layout proprio em `src/app/regional/layout.tsx`,
  sidebar cockpit com o hotlink da unidade no topo. Atalho "Portal da Franquia" no menu principal.
- **5 telas:** Painel (indicadores + ranking da equipe) · Minha Equipe (desempenho por vendedor com
  o hotlink de cada um) · Leads (tudo da unidade, com filtro "somente hotlink" e a origem marcada) ·
  Comissoes (extrato + export CSV) · Financeiro (contas a pagar/receber da unidade).
- **O isolamento nao e visual, e do banco.** As RPCs usam `escopo_regional()`: um gestor que passe o
  id de outra franquia recebe os proprios numeros. No financeiro, a RLS `pode_regional(regional_id)`
  ja impede ver a matriz (`regional_id` nulo) — por isso "nao se mistura" vale mesmo se alguem
  chamar a API direto.
- **O financeiro da unidade e OUTRO** (0037), nao a tela da matriz — ver a secao abaixo.
- **Hotlink da unidade:** `/v/<CODIGO_DA_REGIONAL>` funciona igual ao do vendedor, mas o lead entra
  sem vendedor (fica para a unidade distribuir). `leads.origem_hotlink` permite medir cada link.

## Financeiro da franquia (0037) — compacto de proposito
- **Ele nao e o financeiro da matriz reduzido; e outro financeiro.** A operacao (mensalidade,
  evento, assistencia, fornecedor) e toda da matriz. A unidade movimenta **so comissao**: a que
  RECEBE da matriz e a que PAGA aos seus vendedores. Dois movimentos, so:
  `COMISSAO_RECEBER` (receita, categoria `1.3.01`) e `COMISSAO_PAGAR` (despesa, `3.2.01`).
- **A franquia nao cria cadastro nenhum.** Sem plano de contas, sem centro de custo, sem conta
  bancaria — sao estruturas da matriz. A classificacao contabil vem pronta no movimento
  (`regional_categoria_movimento` resolve no banco) e a **baixa registra a FORMA** (PIX,
  transferencia, boleto, cartao, dinheiro) em vez de exigir a conta bancaria da matriz: a unidade
  nao faz conciliacao bancaria.
- **Isolamento e do banco, nao da tela.** Toda escrita passa por `regional_titulo_no_escopo`, que
  compara `regional_id` com `escopo_regional(regional_id)`. Efeito: o gestor nao le nem baixa
  titulo da franquia vizinha, e **titulo da matriz (`regional_id` nulo) fica fora do alcance dele**.
  Ha teste cobrindo os dois casos.
- **Do extrato ao caixa:** em `/regional/comissoes` o botao **Repassar** chama
  `regional_repassar_comissao` -> `repassar_comissao_vendedor`, que cria o contas a pagar da
  unidade. A baixa acontece em `/regional/financeiro`.
- **Cancelar nao apaga:** muda a situacao e guarda o motivo na observacao; titulo com baixa
  registrada nao pode ser cancelado.
- Espelho puro em `src/lib/regional-financeiro.ts` (`MOVIMENTOS_REGIONAIS`, `totaisDaFila`,
  `validarLancamentoRegional`) com testes; UI em `src/components/regional/financeiro-regional.tsx`.
- **Login e saida:** `/regional` exige sessao (o layout redireciona para `/login`); o gestor
  regional cai direto no portal ao entrar, e o **Sair** fica no cartao da unidade na sidebar e
  tambem na barra do mobile.

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
Um comando só, que é o mesmo que o CI roda:

```bash
npm run validate      # tsc --noEmit -> vitest -> migrations+testes de banco+schema.sql -> next build
```

Por trás dele:
1. `npm run typecheck` — 0 erros (a convenção de tipos abaixo evita o bug de `never`).
2. `npm test` — lógica pura espelhada do SQL (`sac`, `cobranca`, `pagamentos`, `assistencia`,
   `crm`, `protocolos`).
3. `npm run test:db -- --schema` — sobe um Postgres 16 local, aplica **todas** as
   migrations em ordem, valida o `schema.sql` consolidado e roda cada suite de
   `supabase/tests/` num banco isolado (clone por template, para um teste não sujar o outro).
4. `npm run build:check` (`scripts/build-check.sh`) — `next build` com **env dummy** quando as
   variáveis não existem. O build real (Docker/VPS) segue usando `npm run build` com as de verdade;
   sem isso o prerender de `/portal/sinistros/novo` quebra com "URL and API key are required".

**Ao criar uma migration nova:** escreva também a suite `supabase/tests/00NN_*.test.sql`
(padrão: um bloco `do $$ ... $$` com `assert` e um `raise notice '=== ... PASSARAM ==='`
no fim — o runner procura por "PASSARAM") e rode `npm run schema`.

## Commit / deploy
- Commits em PT, com footer:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` + linha `Claude-Session:`.
- Push para **`claude/claude-md-opcao-x-98kfj5`** (branch de trabalho E de deploy).
  Consolidar com o branch padrão só com autorização do usuário.
- **Publicar:** `DEPLOY.md` tem o runbook. Resumo: (A) migrations novas no Supabase
  SQL Editor, na ordem; (B) `.\scripts\deploy.ps1` (Windows) ou `npm run deploy`.
- **O `git pull` roda DENTRO do VPS.** Rodar no PowerShell do Windows dá
  `fatal: not a git repository` — foi o erro que mais custou tempo nesta fase.
  Toda janela nova de terminal começa fora do servidor; o `ssh` precisa ser refeito.
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
- **Novo valor de enum não pode ser USADO na mesma transação** que o adicionou (55P04 no
  SQL Editor). Padrão adotado: `alter type ... add value if not exists` + comparar como
  TEXTO no resto do arquivo (`auth_papel()::text in ('assistencia_24h')`, `p_status not in
  ('EM_NEGOCIACAO', ...)`, `status::text`). Vale para `auditoria` (0017), `assistencia_24h`
  (0026), `EM_NEGOCIACAO` (0028) e `FINANCEIRO`/`DUVIDAS`/`RECLAMACAO`/`OUTROS` (0029).
- **Nome de função já usado em outro domínio dá `function ... is not unique`**: `transferir_protocolo`
  já existia para EVENTOS (`evento_id, usuario_destino, parecer, status`) — a da Central de
  Protocolos virou **`transferir_atendimento`**. Antes de criar função nova, `grep` o schema.
- **Função que devolve uma linha após efeitos colaterais** precisa re-selecionar o registro
  antes do `return` — senão devolve o estado velho (mordeu em `trocar_prestador_acionamento`,
  que só preenche `lancamento_id` depois da sincronia).
- **Auditoria com `now()` não ordena** duas edições da mesma transação (timestamp idêntico);
  `acionamento_edicoes.created_at` usa `clock_timestamp()`.
- **`coalesce` entre enum e texto não compila** — casteie antes: `coalesce(cat.tipo::text, ...)::tipo_categoria_dre`.
- **Teste de banco que roda 2x no mesmo banco colide** (CPF/placa únicos). O runner cria um
  banco por suite via `create database ... template scar_base`.

## Como me manter rápido nas próximas sessões
- **Leia este arquivo primeiro** e vá direto ao ponto: busca direcionada (grep) no que
  o "Mapa do repositório" e a lista de migrations indicarem. Não varra o repo.
- `supabase/schema.sql` responde quase tudo sobre o banco sem abrir 28 migrations.
- **Nunca reescreva migration já aplicada** — crie a próxima (`ALTER ...`).
- **Rotina de entrega, sem exceção:** migration + suite em `supabase/tests/` +
  espelho da lógica pura em `src/lib/*.ts` com Vitest + `npm run schema` +
  `npm run validate` + commit/push + atualizar ESTE arquivo (Estado atual,
  Migrations, Módulos e a seção do módulo).
- **Não invente ambiente novo:** o harness de banco, os scripts de deploy e o CI já
  estão no repositório. Se algo falhar, conserte o script — não crie um caminho paralelo.
- **Antes de responder "não dá"** sobre acesso a repo/arquivo, confira o branch: o
  deploy e o trabalho vivem em `claude/claude-md-opcao-x-98kfj5`.
