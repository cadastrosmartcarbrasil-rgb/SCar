# Integração com o Mutual — consulta, diagnóstico e importação

> **Status: ANÁLISE E PLANO. Nada foi construído.**
> Documento escrito na sessão de 08/09/2026, a partir do levantamento que já estava no
> `CLAUDE.md` ("PRÓXIMO TÓPICO") mais as respostas do usuário e uma leitura do código do SCar.
> A próxima sessão começa **decidindo e construindo a Fase 1**, não pesquisando.

## As respostas que faltavam (dadas pelo usuário)

| Pergunta | Resposta |
|---|---|
| Qual é o sistema atual? | **Mutual** (Mutual Ignit) |
| Tem API? | **Sim** — `https://smartcar-api.mutualignit.com.br/public_api/v2/docs/` |
| Consulta ao vivo ou migração? | **Consultar primeiro**, para avaliar os dados antes de importar |
| O que entra? | **Associados/veículos · financeiro · eventos** — os três |
| Os dois sistemas vão conviver? | **Sim, por um tempo. E por enquanto QUEM MANDA É O MUTUAL.** |
| Volume e janela? | A definir — é uma das saídas da Fase 1 |

> ⚠️ **A documentação da API não pôde ser lida nesta sessão.** O domínio
> `smartcar-api.mutualignit.com.br` é recusado pelo proxy de egress do ambiente (403 no CONNECT,
> política da organização) — não é instabilidade da Mutual. Ver "O que precisamos da documentação"
> no fim: ou o domínio é liberado, ou o usuário cola o OpenAPI/spec no repositório. **O plano
> abaixo não depende disso; o de-para campo a campo, sim.**

---

## A decisão que muda o desenho inteiro

O `CLAUDE.md` tratava isso como "importação". **Não é.** A resposta 4 — *os dois convivem e o
Mutual manda* — transforma o projeto em outra coisa:

> **Replicação unidirecional Mutual → SCar, com cutover gradual por unidade.**

A diferença é prática, não semântica:

| Se fosse migração de uma vez | Como de fato é |
|---|---|
| Roda uma vez, confere, desliga o antigo | Roda **repetidamente**, por meses, sobre dados que mudam do outro lado |
| Chave natural (CPF, placa) basta | Precisa de **correspondência estável** — CPF é corrigido, placa é transferida |
| Registro importado é do SCar | Registro importado é **espelho**: editar no SCar cria divergência silenciosa |
| Cobrança liga junto com a carga | Cobrança **não pode ligar** — o Mutual está cobrando essas pessoas |
| "Deu certo" = os dados entraram | "Deu certo" = os dados entraram **e ninguém foi cobrado duas vezes** |

Tudo o que segue deriva disso.

---

## Achados novos (o que o levantamento anterior não tinha visto)

As três minas terrestres do `CLAUDE.md` (trigger de primeira cobrança, `data_ativacao` virando
hoje, `chk_documento_valido`) continuam válidas. Estas seis são adicionais, e duas delas são
mais graves que as originais.

### 1. Não existe chave externa em lugar nenhum do SCar — e isso é bloqueante

Varredura no schema: **nenhuma tabela tem coluna de id externo, origem ou sistema legado.**
Tudo é chaveado por chave natural de negócio:

- `clientes.cpf_cnpj` — `not null unique`
- `veiculos.placa` — `not null unique` · `chassi`, `renavam` — `unique` (nuláveis)

Para uma carga que roda uma vez isso até serve. Para replicação contínua, não:

- o CPF é **corrigido** no Mutual (digitação) e a linha vira "novo associado" na próxima sincronia;
- a **placa é transferida** entre associados — a mesma placa aparece em dois contratos;
- dois registros do Mutual (a mesma pessoa em duas filiais) precisam virar **um** `cliente`,
  porque `cpf_cnpj` é unique;
- registro que **não entrou** (quarentena) não tem linha no SCar para pendurar id nenhum.

**Recomendação: uma tabela de vínculo, não colunas espalhadas.**
`integracao_vinculos (sistema, entidade, id_externo, registro_id, hash_payload, primeira_carga_em,
ultima_sincronia_em, situacao)`, com unique em `(sistema, entidade, id_externo)`. Resolve os quatro
casos de uma vez, inclusive o da quarentena (vínculo sem `registro_id`), e não obriga a mexer em
seis tabelas de produção. É o mesmo raciocínio do `0051`: um cadastro só, não estruturas paralelas.

### 2. `veiculo_faturavel()` é o interruptor do cutover — e são 4 call sites

Este é o achado que resolve o problema mais perigoso do projeto: **não faturar de novo quem já
paga no Mutual.**

`veiculo_faturavel(veiculo, competencia)` (0024) é o único filtro de quem entra em fatura, e toda
a geração passa por ele — `0025` linhas 49, 206, 237 e 317, ou seja: a primeira cobrança do
trigger, o lote por competência, o lote por período e o dashboard. Hoje ela diz:

```sql
status in ('ativo','em_evento','vistoria_pendente')
and (data_ativacao is null or data_ativacao <= fim do mes)
```

**Somar uma condição de "cobrança externa" ali resolve os quatro caminhos numa linha.** O veículo
importado entra `ativo` — aparece no SAC, no portal do associado, na Assistência 24h, no painel —
e simplesmente **não é faturável** enquanto o Mutual cobrar.

E é também o **cutover**: virar a flag de uma unidade faz o SCar começar a cobrar aquela unidade
no mês seguinte. Cutover por regional, reversível, sem carga nova. É exatamente o que
"os dois convivem por um tempo" pede.

> A flag tem de ser **persistente na linha**, não uma GUC de importação. GUC protege a janela da
> carga; ela não protege o lote de faturamento que alguém roda em outubro.

### 3. A GUC de importação só funciona se for setada DENTRO da RPC que grava

O `CLAUDE.md` sugere `set_config('scar.importacao','true')` seguindo o padrão de
`scar.motivo_edicao` / `scar.obs_lead` / `scar.motivo_rastreador`. Correto — mas com uma armadilha
que o texto não registra:

**`set_config(..., true)` é local à TRANSAÇÃO.** Como cada chamada do supabase-js é uma transação
própria, "setar a GUC e depois inserir" em duas chamadas **não funciona** — a segunda chamada não
enxerga a primeira. É por isso que o `0027` e o `0050` fazem `set_config` e a escrita dentro da
mesma função. A RPC de importação tem de seguir o mesmo formato: **uma função que seta a GUC e
grava o lote**, nunca duas chamadas.

(É também mais um argumento para o item 2: a GUC não é o mecanismo de cobrança, é só o cinto de
segurança da janela de carga.)

### 4. `clientes.matricula` é gerada por sequence — dois sistemas numerando no mesmo espaço

`0006` criou `matricula text unique` + `matricula_seq` + trigger `fn_gerar_matricula` (preenche
só quando vem nula, `lpad(...,6,'0')` a partir de 1000).

O associado **conhece a matrícula dele** — é o número que ele fala no telefone. Se o Mutual tem
matrícula própria, importar sem ela faz o SCar inventar outra e o SAC passa a ter dois números
para a mesma pessoa. Se importar com ela, duas numerações passam a disputar o mesmo `unique`, e a
primeira venda nova do SCar pode colidir.

**Decisão necessária antes da carga** (nenhuma exige código complicado, só escolha):
reservar faixa para a sequence acima do maior número do Mutual · prefixar o que nasce no SCar ·
ou tratar a matrícula do Mutual como campo de consulta e não como a matrícula.

### 5. Título em aberto importado errado **bloqueia** o associado — em três lugares

Isto é o principal argumento a favor do "consultar primeiro" que o usuário pediu. Título em aberto
no SCar não é dado passivo: é insumo de regra operacional.

`dias_atraso_cliente()` (0053) lê `titulos_financeiros` com status `pendente`/`vencido` e
vencimento passado. Quem consome:

- **Assistência 24h** — `situacao_assistencia_veiculo` recusa acionamento de quem tem título
  vencido. Um bom pagador com título fantasma importado **fica sem guincho**.
- **Rastreadores** — `sincronizar_rastreadores_inadimplencia` manda para "3 - Inadimplente" e
  `instalar_rastreador` recusa acima de 35 dias.
- **Cobrança/inadimplência** — o dashboard e o aging passam a mentir.

Ou seja: **carregar financeiro sujo não gera um relatório errado, gera uma recusa de atendimento.**

### 6. Histórico pago reescreve DRE de mês já fechado

`dre_movimentos()` (0032) é a fonte única do DRE e lê títulos por competência (regime
Competência) ou pelas baixas (regime Caixa). Importar o histórico de títulos pagos do Mutual
**muda o resultado de meses que já foram fechados e reportados** — e, no período de convivência,
faz os dois sistemas contarem a mesma receita.

**Recomendação:** o DRE do SCar começa na **data de corte**. Histórico pago entra como dado frio
(fora de `dre_movimentos`), servindo para tempo de casa, adimplência e a ficha do associado — não
para resultado. Quem quiser o passado consolidado, consulta o Mutual.

---

## O plano — 6 fases, cada uma útil sozinha

O corte é proposital: as três primeiras fases **não escrevem uma linha em `clientes`, `veiculos`
ou `titulos_financeiros`**. O risco só aparece na Fase 4, e aí já com o diagnóstico na mão.

### Fase 1 — Espelho de leitura e diagnóstico *(é o que o usuário pediu para esta rodada)*

**Objetivo:** saber o que existe do outro lado, sem tocar em produção.

- **Proxy server-side** `/api/v1/mutual/*`, no molde do `/api/fipe`: credencial em env
  (`MUTUAL_API_TOKEN` / `MUTUAL_API_BASE`), **nunca no navegador**, cliente chama a rota interna.
  Guard próprio na rota (`getUser()` + papel), porque o middleware não protege `/api/*`.
- **Staging cru:** `mutual_captura (entidade, id_externo, payload jsonb, capturado_em, pagina)`.
  Guarda o retorno **exatamente como veio**. Payload cru é o que permite reprocessar sem puxar
  tudo de novo quando o de-para mudar — e vai mudar.
- **Relatório de qualidade** — as perguntas que decidem tudo o mais:
  - volume real por entidade (o painel fala em ~13 mil veículos e 2.522 ativos; a Fase 1 diz qual
    é qual);
  - quantos CPF/CNPJ **reprovam** em `validar_documento` (dimensiona a mina nº 3);
  - quantos veículos vêm **sem data de ativação** (dimensiona a mina nº 2);
  - `chassi`/`renavam` vazios, repetidos, e placas repetidas em contratos diferentes;
  - quantas **filiais** aparecem e como se chamam (insumo do de-para de regionais);
  - títulos em aberto: quantidade, valor, distribuição de atraso;
  - quantos associados aparecem **mais de uma vez** (o merge por CPF).

**Entrega:** uma tela `/integracao/mutual` com "Puxar amostra" e o relatório. Nenhuma migration
que altere tabela de produção.

### Fase 2 — De-para e quarentena

- **`regionais` primeiro, e à mão.** A unidade atravessa RLS, `escopo_regional()` e todos os
  painéis; criar regional é criar tenant. Tela de correspondência "filial do Mutual → regional do
  SCar", revisada por humano, igual ao que `docs/modulos/rastreadores.md` já fez com o
  TrackerStock. **Nada é criado automaticamente.**
- **`integracao_vinculos`** (achado nº 1).
- **Quarentena:** linha que não pode entrar fica no staging com o motivo, e a tela mostra o quê e
  por quê. **Documento inválido vai para quarentena — não entra como pendente.** Não é preferência:
  `clientes.cpf_cnpj` é `not null unique` e o `chk_documento_valido` vale para toda linha nova, e
  CPF de placeholder colidiria entre si no unique. Quarentena é a única saída honesta.
- **Campo vazio vira `NULL`, nunca `''`** — `chassi` e `renavam` são unique nuláveis; duas strings
  vazias colidem. Foi o que mordeu em `fornecedores.documento` (0051).

**Entrega:** "de N registros, X prontos e Y em quarentena, por estes motivos" — antes de qualquer
gravação.

### Fase 3 — Carga de associados e veículos, com a cobrança desligada

Só aqui entra migration em produção. Ordem obrigatória de FK:
`regionais → clientes → veiculos`.

- **flag de cobrança externa** + `veiculo_faturavel()` reescrita (achado nº 2). Sem ela, não carrega.
- **`data_ativacao` real, sempre.** O `trg_veiculo_marca_ativacao` só preenche quando vem nulo, então
  basta trazer a data — mas veículo sem data no Mutual **vai para quarentena**, não recebe `current_date`
  (contaminaria `veiculo_faturavel`, tempo de casa e o custo por veículo ativo do painel da 24h).
- **GUC `scar.importacao`** lida pelo `fn_veiculo_primeira_cobranca`, setada dentro da própria RPC
  de carga (achado nº 3).
- **Idempotente por construção** — `gerar_faturas_cliente`, `emitir_titulo_fatura` e
  `abrir_alerta_veiculo` são os exemplos da casa. Rodar duas vezes não duplica; a primeira carga
  nunca é a definitiva.

**Entrega:** SAC, portal do associado e Assistência 24h funcionando sobre a base real, **sem
nenhum boleto emitido**.

### Fase 4 — Financeiro

- **Títulos em aberto entram** (é o que dá inadimplência e 2ª via) — mas só depois que a Fase 1
  provar que estão limpos, por causa do achado nº 5.
- **Histórico pago entra frio**, fora de `dre_movimentos` (achado nº 6).
- **Enquanto a flag de cobrança externa estiver ligada, o SCar não emite boleto para esses
  títulos.** Emitir seria cobrar duas vezes a mesma pessoa — o pior desfecho possível do projeto.

### Fase 5 — Eventos

Histórico primeiro, leitura apenas. Depende do de-para de `tipo_evento` e do que a API expõe
(a aba `#tag/Events` da documentação é justamente a que o usuário apontou).

### Fase 6 — Sincronia incremental e cutover

- **Sincronia incremental**, não recarga: exige que a API aceite filtro por data de alteração —
  é a pergunta nº 3 da lista abaixo. Sem isso, o custo de manter o espelho vivo muda de ordem.
- **Cutover por unidade:** desliga a flag de cobrança externa de uma regional, confere um mês,
  segue para a próxima. Se der errado, religa.

**Sobre "consulta ao vivo":** a recomendação é **espelho com sincronia**, não chamada ao Mutual a
cada tela. Tela que depende de API de terceiro herda a latência e a indisponibilidade dele, e o
SAC não pode parar porque o Mutual caiu. O ao-vivo cabe como **botão sob demanda** ("conferir no
Mutual") numa ficha específica — não como fonte das telas.

---

## O que precisamos da documentação da API

Lista curta e objetiva — é isto que destrava o de-para campo a campo:

1. **Autenticação:** token fixo, OAuth client-credentials, expiração? Onde vai (header, corpo)?
2. **Paginação:** page/offset ou cursor? Qual o tamanho máximo de página?
3. **Filtro por alteração:** existe `updated_since` / `modified_after`? **Esta é a pergunta mais
   importante da lista** — é ela que decide se a Fase 6 é barata ou cara.
4. **Rate limit** e janela — decide se a carga é uma madrugada ou uma semana.
5. **Entidades e campos** de associados, veículos, títulos/financeiro e eventos. Em especial:
   **id estável** de cada registro, **matrícula**, **data de ativação/adesão do veículo**,
   **filial**, e o **status** de cada entidade (com a lista de valores possíveis).
6. Ambiente de **homologação/sandbox**, se houver.

**Como destravar:** liberar `smartcar-api.mutualignit.com.br` na política de egress da sessão,
**ou** salvar o OpenAPI (o `.json`/`.yaml` que a página de docs consome) em
`docs/modulos/mutual-openapi.json`. A segunda opção tem uma vantagem: o contrato fica versionado
no repositório e a próxima sessão não depende de rede.

---

## O que NÃO fazer (registrado para não se repetir)

- **Não criar caminho paralelo.** Fornecedor é `fornecedores` (0051), protocolo é `atendimentos`
  evoluída (0029), OS é `acionamentos_assistencia` (0031). O mesmo vale aqui: staging e vínculo
  são estrutura nova porque **não existem**; associado, veículo e título já existem e são estes.
- **Não importar veículo `ativo` sem a trava de faturamento.** É a mina nº 1 e a mais cara.
- **Não deixar `chk_documento_valido` de lado** para "resolver depois". Ele sustenta o login do
  portal (a chave é o CPF) e o reaproveitamento de cadastro em `autorizar_entrada_lead`.
- **Não confiar na tela.** Regra que só vive no front não é regra — mesma lição do teto de 10 MB
  dos anexos (0047/0048).
- **Não pular o rito de entrega:** migration + suite em `supabase/tests/` + espelho puro em
  `src/lib/*.ts` com Vitest + `npm run schema` + `npm run validate`. E o **rito de segurança da
  0052** (revoke/grant) em toda migration que cria função — a suite `0052` reprova quem esquecer.

---

## Configuração — o que precisa ser preparado

Sim, precisa. E são **três coisas diferentes**, que não moram no mesmo lugar de propósito.

### 1. O segredo — variável de ambiente no VPS

`MUTUAL_API_BASE` e `MUTUAL_API_TOKEN` (ou `MUTUAL_CLIENT_ID`/`MUTUAL_CLIENT_SECRET`, se a
autenticação for OAuth — a documentação decide). Mesmo padrão do `PLACAFIPE_TOKEN`,
`GOOGLE_MAPS_API_KEY` e `RESEND_API_KEY`: **o token nunca vai ao navegador**, é injetado na rota
`/api/v1/mutual/*` do lado do servidor.

> **Por que env e não uma tabela**, já que `integracoes_bancarias` guarda `api_key` no banco?
> Porque aquilo é multi-gateway, por regional e editável pela tela — precisa ser dado. Aqui é um
> sistema só, da matriz, e **o token do Mutual dá leitura da base inteira de associados**. No env
> ele fica fora do alcance de quem tem `tem_acesso_global()` e abre Configurações.

**Passo de deploy:** editar o `.env` no VPS e `docker compose up -d --build`. É o mesmo passo que
o `RESEND_API_KEY` ainda pendente — vale resolver os dois na mesma janela.

### 2. A configuração operacional — no banco, com tela

Isto é dado, não segredo, e muda sem deploy:

- **de-para filial do Mutual → `regionais`** — revisado por humano, nada criado automaticamente
  (criar regional é criar tenant, e ela atravessa RLS, `escopo_regional()` e todos os painéis);
- **de-para de vocabulário** — status e tipo de evento (ver a tabela de destino abaixo);
- **estado da sincronia** — cursor/última página/último erro por entidade, para **retomar de onde
  parou** em vez de recomeçar 13 mil registros;
- **flag de cobrança externa por regional** — o interruptor do cutover.

### 3. O que NÃO configurar

Nada de tela de "mapeamento genérico configurável campo a campo". **De-para de campo vive em
código, testado** (`src/lib/*.ts` + Vitest, o padrão da casa). Configurável demais é pior: ninguém
descobre qual regra estava valendo quando o dado entrou errado.

> A migration disso seria a **`0062`** (próxima livre).

---

## O contrato de destino — a metade do de-para que já dá para preencher

**A comparação com o Mutual não pôde ser feita** (domínio bloqueado, ver o topo). O que segue é o
**lado SCar completo**: todo campo de destino, com tipo, obrigatoriedade e o que acontece se vier
vazio. Quando a documentação chegar, comparar vira preencher a coluna vazia — não trabalho novo.

Legenda: **PK-N** = chave natural (unique) · **OBR** = `not null` · **CHK** = tem constraint.

### `clientes`
| Campo SCar | Regra | Se vier vazio do Mutual | Campo Mutual |
|---|---|---|---|
| `cpf_cnpj` | **OBR · PK-N · CHK** `validar_documento` | **Quarentena** — não há placeholder possível (unique) | ❓ |
| `tipo_pessoa` | **OBR** · enum `PF`\|`PJ` | Deduzir pelo tamanho do documento | ❓ |
| `nome_razao_social` | **OBR** | Quarentena | ❓ |
| `status` | **OBR** · enum: `ativo` `inadimplente` `cancelado` `inativo` `suspenso` `excluido` | `ativo` (default) — **perigoso**: importar cancelado como ativo | ❓ |
| `matricula` | **PK-N** · gerada por `matricula_seq` se nula | SCar inventa outra ⇒ **dois números para a mesma pessoa** (achado nº 4) | ❓ |
| `regional_id` | nulável, mas **na prática obrigatório** (RLS/escopo) | Associado fica invisível nos painéis por unidade | ❓ |
| `email` · `telefone` | opcionais | Portal e WhatsApp ficam sem contato | ❓ |
| `endereco` (jsonb) | opcional | Praça do painel da 24h cai em "NAO INFORMADO" | ❓ |
| `data_nascimento` | opcional | É a alternativa para endurecer o 1º acesso do portal | ❓ |
| `rg_ie` · `nome_mae` · `sexo` · `email_adicional` | opcionais | — | ❓ |

### `veiculos`
| Campo SCar | Regra | Se vier vazio do Mutual | Campo Mutual |
|---|---|---|---|
| `placa` | **OBR · PK-N** (global, não por cliente) | Quarentena. Placa transferida ⇒ dois contratos disputam | ❓ |
| `cliente_id` | **OBR** (FK) | Quarentena | ❓ |
| `status` | **OBR** · enum: `ativo` `suspenso` `baixado` `inativo` `excluido` `vistoria_pendente` `em_evento` | `ativo` (default) | ❓ |
| `data_ativacao` | — | **Vira `current_date` pelo trigger `trg_veiculo_marca_ativacao`** ⇒ mina nº 2. **Quarentena** | ❓ |
| `chassi` · `renavam` | **PK-N** nuláveis | **Vazio tem de virar `NULL`, nunca `''`** — duas strings vazias colidem no unique | ❓ |
| `valor_fipe` · `codigo_fipe` | opcionais | Sem eles a mensalidade não recalcula | ❓ |
| `tipo_veiculo_id` | FK | Sem tipo, `cotar_plano` devolve 0 e **não gera fatura** | ❓ |
| `plano_protecao_id` | FK | idem | ❓ |
| `valor_mensalidade` | override negociado | Cai no `cotar_plano` | ❓ |
| `dia_vencimento` | — | Cai no padrão legado (dia 10 do mês seguinte) | ❓ |
| `tipo_faturamento` | **OBR** · `AGRUPADO_ASSOCIADO` \| `INDIVIDUAL_VEICULO` | Default agrupado | ❓ |
| `uso` | **OBR** · `passeio` \| `app` \| `comercial` | Default `passeio` | ❓ |
| `marca` · `modelo` · `ano_fabricacao` · `ano_modelo` · `cor` | opcionais | Ficha pobre no SAC | ❓ |
| `rastreador_imei` · `rastreador_chip` · `empresa_rastreamento_id` | **CHK** IMEI 14-17 díg., chip 8-22; IMEI **unique parcial** | Alimenta a divergência `FICHA_SEM_EQUIPAMENTO` (0050) | ❓ |
| `regional_id` · `alienado` · `numero_portas` · `categoria` | opcionais | — | ❓ |

### `titulos_financeiros`
| Campo SCar | Regra | Observação | Campo Mutual |
|---|---|---|---|
| `cliente_id` | **OBR** (FK) | — | ❓ |
| `veiculo_id` | nulável | — | ❓ |
| `valor` | **OBR · CHK** `>= 0` | — | ❓ |
| `data_vencimento` | **OBR** | **Alimenta `dias_atraso_cliente` ⇒ bloqueia 24h e rastreador** (achado nº 5) | ❓ |
| `status` | **OBR** · `pendente` `pago` `cancelado` `vencido` | Efetivo: pendente + vencido no passado já conta como vencido | ❓ |
| `data_pagamento` · `valor_pago` | opcionais | Histórico pago **fora do DRE** (achado nº 6) | ❓ |
| `linha_digitavel` · `nosso_numero` · `url_boleto` | opcionais | **Provavelmente NÃO reaproveitáveis** — são do banco do Mutual | ❓ |

### `eventos_sinistro`
| Campo SCar | Regra | Observação | Campo Mutual |
|---|---|---|---|
| `numero_protocolo` | **PK-N** · gerado por trigger `EVT-YYYYMMDD-XXXX` | **Mesma colisão de numeração da `matricula`** — decidir junto | ❓ |
| `veiculo_id` · `cliente_id` | **OBR** (FK) | Evento de veículo em quarentena não entra | ❓ |
| `data_ocorrencia` | **OBR** | — | ❓ |
| `tipo_evento` | **OBR** · enum com **só 5 valores**: `ROUBO` `FURTO` `COLISAO` `TERCEIROS` `GUINCHO` | **É o de-para mais apertado do projeto.** Incêndio, alagamento, vidros, fenômeno natural não existem hoje | ❓ |
| `status` | **OBR** · `ABERTO` `EM_ANALISE` `COTACAO_PECAS` `REPARO` `CONCLUIDO` `NEGADO` | — | ❓ |
| `descricao` · `operador_atual_id` · `regional_id` | opcionais | Operador do Mutual não existe em `usuarios` | ❓ |

> **Se o de-para de `tipo_evento` exigir valores novos:** `alter type ... add value if not exists`
> **e comparar como TEXTO no resto do arquivo** — valor novo de enum não pode ser usado na mesma
> transação que o criou (`55P04`). Gotcha já registrado no `CLAUDE.md` (0017/0026/0028/0029).

### As três decisões que este quadro já expõe, sem depender do Mutual

1. **Numeração:** `matricula` e `numero_protocolo` são unique e autogerados. Duas fontes numerando
   no mesmo espaço colidem. Reservar faixa, prefixar, ou tratar o número do Mutual como campo de
   consulta — **uma escolha, três lugares.**
2. **Status importado como `ativo` por default é o pior default possível** aqui: transforma
   associado cancelado em associado ativo, e veículo baixado em veículo faturável. O de-para de
   status é obrigatório, não "se der tempo".
3. **Campo vazio tem de virar `NULL`** em `chassi`, `renavam` e em todo unique nulável. É a mordida
   do `fornecedores.documento` (0051) esperando para acontecer de novo, agora em escala de milhares.
