# CLAUDE.md — SCar (Proteção Veicular)

> ## ⛔ ANTES DE ESCREVER QUALQUER LINHA: CONFIRA O BRANCH
> ```bash
> git rev-parse --abbrev-ref HEAD    # tem de ser: claude/claude-md-opcao-x-98kfj5
> ```
> **Trabalho e deploy vivem em `claude/claude-md-opcao-x-98kfj5`.** O default do GitHub
> (`claude/scar-project-btasdf`) está **parado em `953c53c`** — é um branch MORTO, não outro projeto.
> Trabalhar nele já custou **dois dias**: a fase da tela de vendas e, depois, o painel da 24h
> (uma sessão inteira construída sobre uma base 59 commits atrás, com migration `0025` duplicada
> que precisou de uma corretiva — a `0060` — para sair da produção).
> Há um **SessionStart hook** (`.claude/hooks/session-start.sh`) que grita quando a sessão nasce
> no branch errado, mas ele só existe nos branches que o têm: **confira mesmo assim.**

> Memória do projeto. Leia isto no início de cada sessão em vez de varrer o repositório inteiro.
> Mantenha este arquivo atualizado ao adicionar módulos/migrations (é barato e faz o projeto andar rápido).

## Estado atual (retomar aqui) — atualizado ao fim da fase 0032→0061

**Um único projeto, um único repositório: `cadastrosmartcarbrasil-rgb/scar`** (no GitHub o nome
aparece como `SCar`). Trabalho e deploy acontecem no branch **`claude/claude-md-opcao-x-98kfj5`**.

**Os outros branches do repositório estão TODOS mortos** (conferido em 08/09/2026):

| Branch | Situação |
|---|---|
| `claude/claude-md-opcao-x-98kfj5` | **O ÚNICO VIVO** — trabalho e deploy |
| `claude/scar-project-btasdf` | default do GitHub, parado em `953c53c` |
| `claude/financial-dre-improvements-6zfj3k` | **29 commits atrás**, 0 à frente |
| `claude/git-push-issue-to49ky` | parado, contido na trunk salvo 1 commit |
| `claude/vehicle-trackers-module-jl4rjw` | totalmente contido na trunk |
| `claude/assistencia-24h-dashboard-cqdb35` | sessão que caiu no branch errado; **não mesclar** (traz `0024`/`0025` que colidem) |

> **CORREÇÃO — este arquivo dizia que o commit era "espelhado" em
> `claude/financial-dre-improvements-6zfj3k`. Era falso**, e foi o que levou uma sessão a cortar
> dali e trabalhar 59 commits atrás. Não existe branch espelho: existe UM branch vivo.

### ⚠️ DUAS AÇÕES MANUAIS PENDENTES (o usuário autorizou; o agente não tem permissão)
Tentadas em 08/09/2026 e **bloqueadas**: não há ferramenta para alterar configuração do
repositório, e `git push --delete` volta **HTTP 403** (a credencial da sessão faz push, não apaga
branch). Enquanto não forem feitas, a trava do SessionStart tem um furo conhecido.

1. **Trocar o branch padrão** para `claude/claude-md-opcao-x-98kfj5`:
   GitHub → repositório → *Settings* → *General* → *Default branch* → ícone de troca →
   escolher `claude/claude-md-opcao-x-98kfj5` → *Update*.
   **É isto que fecha o buraco:** o hook só existe no branch que a sessão clona; enquanto o
   padrão for o morto, uma sessão nova pode nascer sem aviso nenhum.
2. **Apagar os 4 branches mortos** (nenhum é o padrão, então podem ir a qualquer momento):
   `claude/financial-dre-improvements-6zfj3k` · `claude/git-push-issue-to49ky` ·
   `claude/vehicle-trackers-module-jl4rjw` · `claude/assistencia-24h-dashboard-cqdb35`.
   GitHub → *Branches* → lixeira em cada um. Depois da troca do padrão, o
   `claude/scar-project-btasdf` também pode ser apagado.

- **Produção:** `https://appsmartcar.com.br` — VPS KingHost, Docker + Caddy (HTTPS auto),
  pasta `/opt/scar`. **Domínio trocado em 14/10/2026** (antes `app.smartvidanet.com.br`; o
  subdomínio `portal.smartcarbrasil.com.br` foi descartado porque o DNS daquele domínio está na
  revenda HostGator de terceiro). `appsmartcar.com.br` foi comprado na própria KingHost, com DNS lá.
  `DOMAIN=appsmartcar.com.br` (UM domínio só) no `.env` do VPS; o `Caddyfile` do repositório
  serve também `www.` e `app.smartvidanet.com.br` (redirecionam 301 para o novo, mantendo o
  caminho) e o **`n8n.smartvida.com`** (webhooks do WhatsApp, outro serviço no mesmo VPS). Esses
  blocos nasceram editados à mão no servidor — **edite o `Caddyfile` no repositório, nunca em
  `/opt/scar`**, e nunca rode `git checkout Caddyfile` lá sem comparar antes. Os links do sistema são
  montados pelo `origin` da requisição, então nenhum ficou preso ao domínio antigo; o que era fixo
  (cron da baixa, scripts de deploy, User-Agent do CNPJ) foi trocado. **E-mail (14/10/2026): nada sai
  mais como smartvida** — remetente `nao-responda@appsmartcar.com.br` e contato `contato@appsmartcar.com.br`,
  num lugar só (`src/lib/email.ts`, testado; env vazia conta como ausente). O `.env` do VPS foi limpo
  (0 ocorrências de smartvida, contêiner conferido em 14/10). Falta verificar o domínio no Resend. Ficam de propósito: o redirect de
  `app.smartvidanet.com.br` e o `n8n.smartvida.com` no `Caddyfile` (links antigos e outro serviço).
- **Último commit desta fase:** `a468ead`.

### ⏱️ RETOMADA EM 30 SEGUNDOS — os 3 fatos que evitam erro de local e de deploy
> Esta caixa existe porque errar o LOCAL (branch) e a ORDEM do deploy foi o que mais custou tempo
> neste projeto. Leia-a antes de qualquer coisa; o resto do arquivo é referência.

**1. ONDE.** Branch `claude/claude-md-opcao-x-98kfj5`, e só ele. Repositório
`cadastrosmartcarbrasil-rgb/scar`. Confira com `git rev-parse --abbrev-ref HEAD`.
**O banco é o projeto Supabase `Scar Software`, ref `asinzcqbbqdglrguqtnr`** (sa-east-1) — ver
"Qual é o banco" logo abaixo. **Nenhum dos outros três projetos da conta é este sistema.**

**2. O QUE FALTA SUBIR.** **Nada no banco.** As migrations **`0001`..`0085`** estão aplicadas —
a **`0085` (de-para do PLANO) foi rodada e CONFERIDA em 01/10/2026**: as 7 funções do módulo
existem com `search_path` fixo, a allow-list de `mutual_captura` tem as **15 entidades** (conferidas
uma a uma, `CONTRACT` inclusive), `mutual_tipos_veiculo_externos`/`mutual_planos_externos` devolvem
**`destino_id`** e o rito da 0052 se manteve — **0 RPCs nossas abertas ao `anon`**; as 223 são de
extensão (`btree_gist` 188 · `pg_trgm` 31 · `unaccent` 4), como documentado.
> **📍 ESTADO DA MIGRAÇÃO DO MUTUAL — medido em produção em 05/10/2026**
> | Etapa | Situação |
> |---|---|
> | Captura | ✅ completa — `SALE_TEAM` puxada em 02/10 (**52**), `CONTRACT_OBJECT` 17.741, `CONTRACT` 17.658 |
> | Unidade (equipe de vendas) | ✅ 19 vínculos desde 21/09 |
> | `PLAN` | ✅ **Captura esgotada (05/10, 2ª rodada): 18 planos**, 16 casam com os `plan_id` dos contratos. **A API não tem mais o que dar:** o swagger só declara `/quotation/plan/` (GET, por veículo) e `/quotation/plan/select_plan/` (POST — é ESCRITA, não usar); não há GET por id. Na matriz: **163 de 474 faturáveis têm nome** — 88 *V6 Automóvel MT* (108), **41 *Moto MT* (44)**, 43, 46, 42, 45, 86, 98. **O 48 (112) segue sem nome** e só sai da tela do Mutual (contrato 20224) ou da decisão direta |
> | De-para do TIPO | ✅ **`0087` aplicada e conferida (05/10)** — o tipo sai da **CATEGORIA** do Mutual, por **par categoria/tipo**. **23 vínculos gravados** (decisão do usuário, FRETE → Caminhão Pesado): na matriz **467 entram, TODOS com tipo** — Passeio 300 · Pick-up/Van 83 · Moto 71 · Caminhão Pesado 8 · Diesel Leve 5. Sem vínculo (0 faturáveis na matriz): V15/V5/V12 pickups, TAXI, PICKUP-TAXI, LOCADORA, CAMINHONETE, SUV, roubo e furto, 99/UBER — decidir antes de dezembro. `VEHICLE_TYPE` (reserva) segue com 0 |
> | De-para `PLAN` | 🟡 **9 vínculos (05/10)** — `48`→*DIESEL MIGRADO MUTUAL* · `88`/`86`/`98`→**Ouro** · `41`/`43`/`42`→**Prata** · `45`→**Roubo e Furto** · `46`→**RASTREAMENTO**; aplicados por re-execução. **Motos (07/10): o plano saiu dos PRODUTOS, não do `plan_id`** (0091/0092 — terceiros → MOTOCICLETAS - OURO, sem → ESSENCIAL). Matriz hoje (467): **sem plano 172 · Diesel Migrado 112 · Ouro 109 · Moto Ouro 67 · Moto Essencial 3 · Rastreamento 3 · Roubo e Furto 1 · Prata 0**. ⚠️ **Os 46 "Prata" eram TODOS motos** — `41`/`43`/`42` são planos de MOTO vinculados a um plano de CARRO: corrigir esse vínculo (ou rodar a classificação por terceiros por unidade) antes de carregar outra unidade em dezembro. Caminhões (*Caminhões MT*, *CAMINHõES-LEVE-VANSMIG*, *VANS - CAMINHAO 3/4MIG*, *CAMINHõES-V-PESADOSMIG*) SEM plano por decisão. Próximos: ver a tabela **"PLANO DO MUTUAL SE CITA PELO NOME"** — e citar SEMPRE pelo nome do Mutual |
> | **Carga da MATRIZ** | ✅ **EXECUTADA em 05/10/2026** (autorizada pelo usuário): **426 associados e 467 veículos criados, 7 recusados**. Conferido: 467 com `cobranca_externa`, **0 faturas e 0 títulos novos** (faturas 8 e títulos 6, como antes), 0 ativados "hoje", 0 sem tipo, todos na matriz; status ativo 452 · vistoria_pendente 15; 112 com plano (o 48), 1 sem valor, 1 sem cor. **Próximo:** re-executar após recapturar (deriva), de-para dos planos 88/41/45/46, e o piloto de outubro (SAC, portal, 24h) |
>
> **🔴 Nenhum dos dois de-paras bloqueia a carga.** `mutual_executar_carga` grava
> `coalesce(v.plano_protecao_id, r.plano_id)` e o mesmo para o tipo: carregar AGORA e registrar o
> de-para depois **preenche os nulos na re-execução**. A semana de 28/09 parou porque a tela
> mentia (timeout virando "Puxe Equipes de vendas" com 52 capturadas) e porque o `/plan/` deu 404 —
> e o caminho crítico passou a ser tratado como se dependesse do plano, e não depende.
**✅ A `0087_mutual_categoria_veiculo` foi rodada e CONFERIDA em 05/10/2026** (funções com `search_path`, 0 RPCs nossas ao `anon`; a seção por unidade leva ~6 s, perto do teto de 8 s da tela). Texto original: (só funções: recria
`mutual_carga_linhas` trocando UMA linha — conferido em 05/10 que a versão em produção é idêntica à
da 0084, salvo `\r\n` — e cria `mutual_categorias_veiculo`). Depois dela, o deploy do contêiner
mostra a seção *Categoria do veículo* em `/integracao/mutual`.
**✅ A `0088_plano_sem_casco` e a `0089_produto_tipo_veiculo` foram rodadas e CONFERIDAS em 06/10/2026**: `planos_protecao.sem_casco` existe, `produto_tipos_veiculo` com RLS e as 2 policies, `produto_atende_tipo` security definer com `search_path`, `cotar_plano`/`calcular_mensalidade` com as versões novas (uma de cada, sem overload), 0 security definer sem `search_path`, **0 RPCs nossas ao `anon`**. **Nenhum preço mudou:** moto da QCC9H13 na base = R$ 61,00 e Passeio 50k = R$ 135,00, como antes; ainda 0 planos marcados sem casco e 0 restrições de tipo (falta marcar na tela). Texto original da 0088: Ela cria
`planos_protecao.sem_casco` e recria `cotar_plano` (a versão em produção foi conferida idêntica à da
0081 em 05/10, md5 igual): plano marcado não leva o casco OBRIGATÓRIO no detalhamento nem no total.
É o que corrige a ficha do SAC mostrando **casco para quem não tem** — a moto QCC9H13 (plano 57 do
Mutual: Taxa Adm 25 + terceiros 20 + rastreador 35 + 24h 23 − 6 = R$ 97, sem casco) e o plano
**RASTREAMENTO**. Default `false`: nenhum plano muda ao aplicar; o boleto dos migrados não muda
(override). Depois de rodar: marcar *Sem proteção de casco* no RASTREAMENTO e no plano de moto, em
`Configurações → Planos`.
**A `0089_produto_tipo_veiculo` (aplicada, ver acima).** Pedido
do usuário: *"ao cadastrar produtos, deixar claro para qual tipo de veículo se aplica… não parabrisa
para motos"*. Cria `produto_tipos_veiculo` (sem linha = TODOS os tipos, então é no-op ao aplicar) e
recria `calcular_mensalidade` (produção conferida idêntica à 0081, md5 igual, em 05/10) com UMA
condição: produto que não atende o tipo não entra no motor — nem da base, nem do plano, nem avulso.
As telas (Produtos, Planos, captura da venda, edição da cotação, ficha do veículo, simulador, tabela
de preços e importação) só oferecem o que atende o tipo; regra pura em `src/lib/produtos.ts`.
**✅ A `0090_rastreador_opcional` foi rodada e CONFERIDA em 07/10/2026** (coluna existe, só o "Rastreador" marcado, `calcular_mensalidade` com uma versão, 0 security definer sem `search_path`, 0 RPCs nossas ao `anon`; Passeio 50k = R$ 135 · 80k = R$ 215 com ou sem o opcional · 50k + opcional = R$ 170 · moto QCC9H13 base = R$ 61). Texto original: Regra do usuário (07/10): o
rastreador OPCIONAL só é oferecido e cobrado quando o veículo está ABAIXO do mínimo do tipo; acima, a
regra do tipo (0019) já cobra e o opcional some. Cria `produtos.rastreador_avulso`, marca o produto
"Rastreador" (R$ 35, ativo, em 0 planos e 0 veículos em 07/10 — nenhum preço muda) e recria
`calcular_mensalidade` (corpo da 0089 + a condição). O "RASTREAMENTO SMART CAR BRASIL" (produto do
plano RASTREAMENTO, R$ 59,90) NÃO é marcado: rastreamento puro é outra coisa. Telas: o opcional some
da lista quando a regra cobra (`regraRastreadorCobra`/`semRastreadorDaRegra`, `src/lib/produtos.ts`)
e o cadastro de Produtos ganhou a marca "Rastreador opcional".
**✅ A `0091_mutual_produtos_do_objeto` foi rodada e CONFERIDA em 07/10/2026** (as 8 funções existem,
allow-list com as **16** entidades, 0 security definer sem `search_path`). **Mas a 1ª captura voltou
VAZIA:** o Mutual recusa a listagem geral de `/contract/contract_object_product/` (HTTP 400: *"É
obrigatório informar UM dos parâmetros: quotation_token, contract_id, contract_object_id ou
quotation_object_id"*). A rota passou a perguntar **veículo por veículo** (`capturarProdutos`, 25 por
bloco), só pelos **já carregados** (vínculo `CONTRACT_OBJECT → veiculos`, 467 hoje), grudando o
`contract_object_id` da pergunta em cada linha (`comObjeto`). **Precisa do deploy do contêiner e de
puxar de novo.** Texto original: Regra do usuário (07/10): **moto com
TERCEIROS → MOTOCICLETAS - OURO, sem → MOTOCICLETA ESSENCIAL.** Medido: nos planos de moto do Mutual
(41/42/43/44) "Proteção a terceiros" (product_id 41) é **`required: false` — opcional DENTRO do mesmo
plano**, e os planos 57/63/64/50 nem vêm do `/quotation/plan/`; então **o `plan_id` não decide**. A
fonte é `/contract/contract_object_product/` (produtos por veículo), nova entidade *Produtos dos
veículos*. Depois de rodar + deploy: puxar a entidade na tela, conferir com
`mutual_terceiros_por_objeto(matriz, moto)` (e QUAL chave pegou — o payload ainda não foi visto) e
aplicar com `mutual_aplicar_plano_por_terceiros(matriz, moto, OURO, ESSENCIAL, array[PRATA], true)`.
Matriz hoje: 72 motos = 46 em PRATA (de-para do 41, plano de CARRO) · 25 sem plano · 1 RASTREAMENTO
(fica). Sem produto capturado = não é tocado.
**✅ A `0092_mutual_produtos_aninhados` foi rodada e CONFERIDA em 07/10/2026** (só recria
`mutual_terceiros_por_objeto`, mesma assinatura; 0 security definer sem `search_path`). A captura
de 07/10 trouxe os **467** veículos da matriz, e o formato real é **UMA LINHA POR VEÍCULO com
`products[]` dentro** (+ `plan_name`, `plate`, `price_total`), não uma linha por produto como a 0091
supôs. **✅ CLASSIFICAÇÃO DAS MOTOS APLICADA em 07/10/2026** (autorizada pelo usuário) com
`mutual_aplicar_plano_por_terceiros(matriz, moto, OURO, ESSENCIAL, array[PRATA], true)`:
**67 → MOTOCICLETAS - OURO · 3 → MOTOCICLETA ESSENCIAL · 1 sem produto (SKO7E85, plano 46) segue
no RASTREAMENTO** · OBA9558 (não é do Mutual, sem `cobranca_externa`) intocada. **Boleto idêntico
antes e depois: R$ 8.932,90** nas 72 motos da matriz (o override manda). A carga preserva o plano
pelo `coalesce`. **Falta na tela:** marcar *Sem proteção de casco* nos planos que não têm casco
(`sem_casco` está `false` em todos).
**⚠️ Achado do `plan_name`: o plano 48 do Mutual é "V5 AUTOMOVEL COMUM"** (112 carros da matriz),
não diesel — ele está vinculado a *DIESEL MIGRADO MUTUAL*. Os pendentes têm nome agora: 104 V7
Automóvel Especial MT · 116 V7 pickups MT · 120 V10 pickups MT · 54 V6 pickups · 49 Especial V10
pickups · 92 V7 Automóvel MT · 128 V10 pickups especiais MT.
**✅ A `0093_mutual_nome_plano_legado` foi rodada e CONFERIDA em 08/10/2026** (uma versão de `mutual_planos_externos`, lê `CONTRACT_OBJECT_PRODUCT`, 0 security definer sem `search_path`, fechada ao `anon`, comentário novo). Na MATRIZ: **50 de 69 planos com nome**; os 19 sem nome somam só **2 faturáveis** (acervo inativo, que não teve produtos puxados). Texto original:
Só recria `mutual_planos_externos` (mesma assinatura): o NOME do plano passa a sair também do
`plan_name` dos produtos dos veículos (reserva de `PLAN`), então os planos antigos ("…MIG",
"Plano Moto MT") aparecem com nome na seção *Plano / cobertura*. `capturado` passa a significar
"nome conhecido". A tela mostra **nome + (id N)**. Conferir depois de rodar:
`select count(*) from pg_proc where proname='mutual_planos_externos'` = 1 e o secdef sem
`search_path` = 0.
**✅ A `0094_mutual_carga_em_blocos` foi rodada e CONFERIDA em 08/10/2026** (uma versão de
`mutual_executar_carga` com `p_lote`/`p_preparar`, `mutual_unidade_dos_objetos` existe e as 3 leituras
a usam, `mutual_carga_fila` com RLS e 0 policies e vazia, 0 security definer sem `search_path`, 0 RPCs
nossas ao `anon`). **Tempos medidos em produção, RIBEIRÃO PRETO:** unidade de todos os objetos
0,7 s · leitura do lote 3,8 s (era 5,9) · prévia 3,7 s (era 9,9) · planos 1,4 s · categorias 1,4 s ·
simulação 3,8 s (1.171 veículos, 1.002 associados, 11 recusados). Lotes conferidos iguais aos de antes
(matriz 467 ATUALIZAR + 7 recusados; Grande Natal 432 + 1). Nota: o `anon` tem o `select` padrão em
`mutual_carga_fila`, mas RLS sem policy devolve 0 linhas — dá para revogar numa próxima migration, de
passagem. Texto original:
É o que torna a carga da base inteira possível pela TELA. Medido em 08/10/2026: a leitura do lote de
Ribeirão Preto levava 5,9 s, a prévia 9,9 s, e a carga da MATRIZ levou ~10 s (pg_stat_statements) —
**ela foi executada por fora da tela; pelo botão teria falhado** (teto de 8 s do `authenticated`; o
`service_role` pela API herda os mesmos 8 s do `authenticator`). Ela traz: `mutual_unidade_dos_objetos()`
(a unidade de todos os objetos EM CONJUNTO, ~1,9 s em vez de ~9 s, **0 divergências em 17.764** contra
`mutual_regional_do_objeto`, conferido em produção); `mutual_carga_linhas`/`mutual_planos_externos`/
`mutual_categorias_veiculo` recriadas usando ela (mesma assinatura); e `mutual_executar_carga` com
**FILA** (`mutual_carga_fila`): `p_lote` + `p_preparar` — a 1ª chamada lê uma vez e enche a fila, as
seguintes gravam 200 linhas cada sem cortar associado; fila de outro recorte ou com +1 h é recusada.
Sem `p_lote` faz tudo de uma vez, como antes. Conferir depois de rodar:
`select count(*) from pg_proc where proname='mutual_executar_carga'` = 1, a tabela `mutual_carga_fila`
existe com RLS e sem policy, secdef sem `search_path` = 0, 0 RPCs nossas ao `anon`.
**✅ A `0095_mutual_vendedor_do_consultor` foi rodada e CONFERIDA em 09/10/2026** (as 4 funções e o
trigger existem, `fn_calcular_comissao` lê `integracao_vinculos` e segue sobre o valor cheio, 0 secdef
sem `search_path`, 0 RPCs nossas ao `anon`, 0 CPF de vendedor com máscara; nenhuma fatura, título ou
comissão nova). **✅ "Ligar" na MATRIZ feito e CONFERIDO em 09/10/2026:** **465 de 467 migrados
com vendedor** (30 vendedores, 0 de outra unidade; Clayton segue com 34), resumo agora 453 já
ligados · 12 mantidos · 2 sem consultor (**HNC4288, NAU8B54** — o contrato no Mutual não tem
consultor; ligar à mão se quiser). Faturas 8, títulos 6, comissões 1 — nada novo. Texto original:
(A) `vendedores.documento` passa a ser gravado SÓ COM DÍGITOS por trigger (a tela gravava com
máscara); (B) `mutual_vendedores_dos_veiculos`/`_resumo`/`mutual_vincular_vendedores` — liga o
vendedor dos migrados pelo consultor do CONTRATO (CPF → `vendedores.documento`; e-mail só se apontar
para UM), **nunca troca vendedor já gravado** e **não liga vendedor de outra unidade**; o botão
*Carregar* chama no fim, e o quadro **"Vendedor dos veículos"** (seção da carga) mostra quem fica
sem e por quê; (C) `fn_calcular_comissao`: veículo com vínculo `CONTRACT_OBJECT` do Mutual **nunca
gera comissão de ADESÃO** (a recorrência segue sobre o valor cheio). Simulado em produção em
08/10 (mesma consulta, sem gravar): MATRIZ **429 a ligar · 24 já ligados · 12 mantidos (os do
Clayton de outros consultores) · 2 sem consultor**. Conferir depois de rodar: `fn_calcular_comissao`
contém `integracao_vinculos`, trigger `trg_vendedor_documento_digitos` existe, secdef sem
`search_path` = 0, 0 RPCs nossas ao `anon`; depois, na tela, **Ligar** na MATRIZ.
**✅ "Primeira ativação" conferida em 09/10/2026 (sem migration):** a carga GRAVOU certo —
`veiculos.data_ativacao` bate com `first_activation_date` do Mutual em **452 de 467**; os outros
**15** são `vistoria_pendente` que no Mutual estão com o campo VAZIO (nunca ativados lá), e
receberam a data de criação do contrato (a adesão). O que faltava era **TELA**: nenhuma mostrava a
data. Agora aparece no SAC (lista + ficha, com o tempo de casa), na lista e na ficha de
`/veiculos` (só leitura — nos migrados vem do Mutual a cada carga e decide faturamento) e no
portal ("Protegido desde"). Junto: **`formatDate` mostrava o DIA ANTERIOR para coluna `date`**
(`new Date('2025-11-28')` é meia-noite UTC = 27/11 no Brasil) — afetava também o "Associado
desde" do portal; corrigido na raiz (`src/lib/utils.ts`, teste em `utils.test.ts`). Helper
`primeiraAtivacao` em `src/lib/sac.ts`.
**✅ A `0096_mutual_captura_sem_regravar` foi APLICADA PELO AGENTE (com autorização do usuário,
`execute_sql`) e CONFERIDA em 11/10/2026** — a primeira pela regra nova. Uma versão de
`mutual_registrar_captura` com a regra de só regravar o que mudou, `mutual_resumo_capturas` novo,
`mutual_captura` com autovacuum em 2%, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`; e o
autovacuum começou sozinho logo depois (havia 39.709 versões mortas). **O porquê:** a recaptura de
CONTRACT_OBJECT de 11/10 (17.777 linhas) regravou TUDO, e a prévia, as linhas da carga e o funil do
consultor passaram a estourar os 8 s **mesmo uma por vez** (a fila da tela já estava no ar: os
cancelamentos saíram de 8 em 8 s). Como a rotina da convivência é recapturar toda semana, isso se
repetiria a cada rodada. **Regra que fica:** upsert de captura re-executável escreve só o que mudou —
regravar linha idêntica é inchar a tabela que a carga inteira lê.
**✅ CARGA DAS 3 UNIDADES RESTANTES EXECUTADA em 11–12/10/2026** (autorizada pelo usuário, pelo
agente via `execute_sql` com a sessão do admin): GRANDE NATAL 432 veíc./375 assoc. novos (1 recusado) ·
SÃO PAULO 1 821/760 (13) · RIBEIRÃO PRETO 1.169/998 (11). Vendedores ligados: GN 425 · SP1 821 ·
RP 1.054 — ficam sem: RP 112 *consultor sem vendedor* + 3 *outra unidade*; GN 3 + 1 sem consultor
+ 3 outra unidade. **Conferido:** base com **2.564 associados e 2.898 veículos, 2.889 com
`cobranca_externa`** (os 9 sem são os de antes da migração); **faturas 8, títulos 6, comissões 1 —
nada novo**; 0 ativados hoje; 0 sem tipo, 0 sem plano e 0 sem valor nas 3 unidades novas (o de-para
de plano foi refeito pelo usuário antes); 0 secdef sem `search_path`. **A MATRIZ segue com 172 sem
plano** — foi carregada antes do de-para novo; re-executar a carga dela preenche pelo `coalesce`.
**Pendente:** recapturar CONTRACT/PERSON/ADDRESS (143 faturáveis sem unidade = vendas posteriores à
captura) e recarregar; INVOICE de novo antes do carnê de 2027. **Bancos (decisão do usuário, não
bloqueia a carga):** Sicredi para boleto/PIX (~98% da carteira) e Asaas para cartão; API configurada
nos próximos dias (`integracoes_bancarias` ainda vazia).
**✅ A `0100_painel_visao_geral` está aplicada** (conferido em 13/10/2026: `painel_visao_geral` existe).
**🆕 A `0101_eventos_historico_mutual` é NOVA** — o histórico de eventos do Mutual (ver a seção
"HISTÓRICO DE EVENTOS DO MUTUAL (0101)"). Cria `eventos_historico` + 5 funções e recria
`veiculos_do_cliente` e `painel_visao_geral` (mesmas assinaturas). **⚠️ Tentada pelo `execute_sql` em 13/10/2026 e NÃO aplicada:** toda escrita
pelo MCP parou em 60 s sem chegar ao banco — inclusive um `create table` de teste vazio (leituras
respondem na hora, nenhum bloqueio no banco). O caminho de escrita do MCP não está passando nesta
sessão: **aplicar pelo SQL Editor** e depois `select * from mutual_importar_eventos_historico(true);`
(no SQL Editor `auth.uid()` é nulo, então a trava da matriz deixa passar). **Não importa nada sozinha:**
depois de rodar, `/integracao/mutual` → *Histórico de eventos* → *Importar* (medido em 13/10: 827 de
2.909 eventos entram). Conferir: `select count(*) from pg_proc where proname like '%eventos_historico%'`,
secdef sem `search_path` = 0, 0 RPCs nossas ao `anon`.
**🧹 COBRANÇA DE TESTE APAGADA em 13/10/2026 (autorizado pelo usuário: "todos os títulos são de teste"):** 8 títulos, 10 faturas (17 itens), 1 remessa e as 2 linhas do sandbox em `cobranca_liquidacoes` — tudo zerado. `boletos_historico` (Mutual, 78.425) e a 1 comissão intocados. ⚠️ Os **9 veículos sem `cobranca_externa`** continuam faturáveis: o próximo lote/ativação gera fatura nova para eles. Os textos abaixo que falam em "7 títulos reais" são anteriores a isso.
**✅ A `0104_provedor_sicredi` foi APLICADA pelo agente (autorizada) e CONFERIDA em 13/10/2026**: `provedor_banco` = ASAAS,PJBANK,CORA,INTER,GERENCIANET,OUTRO,SICREDI; `integracoes_bancarias` ainda vazia; 9 veículos cobrados no SCar e 7 títulos em aberto sem boleto (os de antes da migração).
**✅ A `0105_baixa_banco`** — a BAIXA AUTOMÁTICA pelo Sicredi: `cobranca_liquidacoes` (trilha de todo pagamento que o banco informou, casado ou não; unique por provedor+ambiente+nosso número+data) e `registrar_liquidacao_banco` (casa pelo nosso número **no mesmo provedor E ambiente** da integração que emitiu — o sandbox devolve sempre 211001292 —, reserva pelo `seuNumero` só com candidato único; cancelado NÃO reabre; valor diferente baixa e marca `valor_divergente`). Rota `/api/v1/cobrancas/baixa-banco` (sessão admin/financeiro OU header `x-cron-secret` = `COBRANCA_CRON_SECRET`; sem dia = ontem e hoje em São Paulo); botão *Dar baixa agora* na bancada do Sicredi; agendamento = crontab do VPS chamando `scripts/baixa-banco.sh` (log em `/var/log/scar-baixa.log`). Regras puras em `src/lib/baixa-banco.ts`. **✅ APLICADA pelo usuário (SQL Editor) e CONFERIDA em 13/10/2026:** tabela com RLS e a policy de select, unique + check, trigger de `updated_at`, uma versão de `registrar_liquidacao_banco` (security definer, `search_path=public`, fechada ao `anon`), 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`, trilha vazia e os 7 títulos reais intocados. (O `execute_sql` do MCP não passou o DDL nesta sessão, nem dentro de um `do` único.) **✅ A `0107_mutual_sincronia_automatica` foi APLICADA pelo usuário (SQL Editor, 2ª tentativa) e CONFERIDA em 14/10/2026** (as 3 funções com `or auth.uid() is null`, uma versão de cada, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`; a 1ª tentativa não chegou ao banco e o agendador das 17:54 foi recusado nas 5 capturas). **Em 14/10 a carga de RIBEIRÃO PRETO rodou pela tela COM "incluir inativos":** entraram 3.760 inativos (acervo) + 62 ativos/vistoria — base com 6.720 veículos, todos novos com `cobranca_externa`, 0 faturas, 0 títulos. Ver "SINCRONIA AUTOMÁTICA DO MUTUAL (0107)". **✅ A `0108_rls_initplan` foi APLICADA pelo usuário (SQL Editor) e CONFERIDA em 15/10/2026** (as 14 policies das 8 tabelas com `( SELECT f() )`, nenhuma com `pode_regional`; a mesma leitura de 1.000 veículos caiu de 1.430 ms para 4–30 ms). O motivo: as policies de `veiculos`/`clientes` e das tabelas grandes chamavam `pode_regional` POR LINHA — ver o gotcha "RLS com função por linha". **✅ A `0109_acionamento_edicao` foi APLICADA pelo usuário (SQL Editor) e CONFERIDA em 15/10/2026** (coluna `agendado_para` existe, uma versão de `atualizar_acionamento` com os 13 argumentos, security definer com `search_path`, auditoria nova, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`) — agendamento do atendimento da 24h (`acionamentos_assistencia.agendado_para`), `atualizar_acionamento` com agendamento e solicitante (DROP + CREATE, uma versão só) e a auditoria com origem/agendamento/solicitante/observações. **✅ A `0110_permissoes_por_papel` foi APLICADA pelo usuário e CONFERIDA em 15/10/2026** (72 linhas, 4 funções, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`; o admin já tinha mudado 2: consultor ganhou `leads`, gestor perdeu `desconto`). **✅ A `0111_permissoes_modulo_acao` foi APLICADA pelo usuário e CONFERIDA em 15/10/2026 (608 células = 8 papéis × 76, 316 concedidas, `papel_permissoes` com 24 alçadas, 7 policies RESTRICTIVE `perfil_excluir`, 4 funções, helpers lendo a grade — `pode_tratar_evento` usa `perfil_pode` —, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`; testada pelo usuário na tela). A grade MÓDULO × AÇÃO por perfil — ver "PERMISSÕES POR PERFIL (0110/0111)". Alçadas no ar: consultor sem `leads`, gestor sem `desconto`. **✅ A `0112_eventos_historico_kanban` foi APLICADA pelo usuário e CONFERIDA em 17/10/2026** (coluna `evento_id` + unique, uma versão de cada uma das 6 funções, `eventos_historico_listar` com `p_no_kanban`, painel/SAC/`veiculos_do_cliente` com `h.evento_id is null`, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`; 1 evento já levado ao Kanban) — levar eventos ESCOLHIDOS do histórico do Mutual para o Kanban (ver "LEVAR EVENTO DO HISTÓRICO AO KANBAN (0112)"). **✅ A `0113_eventos_prazo_regulatorio` foi APLICADA pelo usuário e CONFERIDA em 17/10/2026** (5 tabelas, 5 colunas em `eventos_sinistro`, as 14 funções com uma versão cada, os 4 triggers, 7 modelos de documento, 0 evento sem aviso, transporte do Mutual gravando o aviso, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`) — o PRAZO DE 90 DIAS do Art. 22 (ver "PRAZO REGULATÓRIO DO EVENTO (0113)"). Crontab `5 6 * * * /opt/scar/scripts/eventos-prazos.sh` LIGADO (conferido no `crontab -l` em 22/10/2026). **✅ A `0114_eventos_prazo_marcos` está APLICADA (17/10/2026; `configuracao_prazo_evento` existe em produção)** — os marcos de alerta (30/60/75/85) passam a ser configuráveis em `empresa` (Configurações → Prazos e Documentos do Evento, só admin) e o alerta fica único por NÍVEL. **Aplicar ANTES do deploy** (a tela chama `configuracao_prazo_evento`). **✅ A `0115_supervisor_regionais_cadastro` foi APLICADA pelo usuário e CONFERIDA em 17/10/2026** (`regionais_do_usuario` existe, `pode_regional`/`escopo_regional` e as 6 policies usam a lista, 0 secdef sem `search_path`, fechada ao `anon`; sessão simulada: a supervisora FRANCIELLI vê 6.808 veículos, 5.496 associados e as 4 unidades — antes 0; o gestor de GRANDE NATAL segue vendo só os 468 da unidade) — o supervisor passa a ver e operar o cadastro (veículos, associados, ~87 policies de `pode_regional`, `escopo_regional`) das unidades de `supervisor_regionais`; antes só a cobrança as lia e ele via 0 veículos. **✅ A `0116_permissoes_usuario_extras` foi APLICADA pelo usuário e CONFERIDA em 18/10/2026** (tabelas `usuario_permissoes`/`usuario_permissoes_log` com RLS e as 2 policies de select, uma versão de cada uma das 7 funções, `perfil_pode`/`papel_pode` lendo `permissao_extra_vigente`, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`; já em uso: 11 extras para 2 usuárias) — permissão EXTRA por usuário e COPIAR PERFIL (ver "PERMISSÃO EXTRA POR USUÁRIO E CÓPIA DE PERFIL (0116)"). ⚠️ O extra NÃO amplia a UNIDADE: `pode_tratar_evento` = `perfil_pode('eventos','editar') and (tem_acesso_global() or pode_regional(...))`, então um extra `eventos.editar` para quem está na matriz sem acesso global (ex.: papel `assistencia_24h` sem unidade) não deixa editar evento de unidade nenhuma no banco. **✅ A `0117_baixa_banco_mutual` foi APLICADA pelo usuário e CONFERIDA em 18/10/2026** (uma versão de cada função, trigger `trg_boleto_historico_baixa_banco`, 75.735 boletos com `nosso_numero`, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`). **Reprocessado em 18/10 (autorizado):** dos 602 pagamentos de 13–16/10, **579 BAIXADOS (R$ 121.073,56)** → 579 recebimentos quitados na conta SICREDI, NAO_CONCILIADO (297 PIX · 282 boleto), 0 sem unidade, 0 duplicados (RP 276 · SP1 166 · GN 74 · MATRIZ 63); **23 NAO_ENCONTRADO (R$ 4.487,25)** sem destino decidido. Ver "BAIXA DOS BOLETOS DO MUTUAL PELO BANCO (0117)". **✅ A `0118_recebimento_nao_identificado` foi APLICADA pelo usuário e CONFERIDA em 18/10/2026** (categoria 1.9.98, uma versão de `registrar_liquidacao_banco` com o corpo novo, 0 secdef sem `search_path`, fechada ao `anon`; **os 23 já lançados**: 23 recebimentos quitados na matriz, sem associado, conta SICREDI, NAO_CONCILIADO, R$ 4.487,25, 13–16/10, 0 duplicados; os 579 seguem como mensalidade) — o pagamento do Sicredi (produção, desde 13/10) que não casa com título nem boleto vira lançamento RECEITA **1.9.98 Recebimentos não identificados** na MATRIZ, com baixa na conta SICREDI (NAO_CONCILIADO); quando o pagador aparece, o mesmo lançamento vira a mensalidade (boleto do Mutual) ou é cancelado (título do SCar). **✅ A `0119_tesouraria` está APLICADA e no ar** (18/10/2026, conferida pelo usuário: "funcionando tudo") — saldos por conta, extrato, OFX, transferências e fluxo diário (ver "TESOURARIA (0119)"). Falta: Contas e Saldos → *Configurar* cada conta com o saldo inicial. **✅ A `0120_produto_descricao_cobertura` está APLICADA e testada pelo usuário (18/10/2026).** **✅ A `0121_renegociacao_boleto` foi APLICADA pelo usuário (SQL Editor) e CONFERIDA em 18/10/2026** (2 tabelas com RLS, as 4 RPCs, `cobranca_boletos_base`/`cobranca_acordos_situacao`/`fn_calcular_comissao` recriadas, colunas `renegociacao_id`, trigger `trg_boleto_historico_renegociado`, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`) — 2ª via vencida e boleto negociado NA HORA (ver "2ª VIA E BOLETO NEGOCIADO (0121)"). **✅ SICREDI em `producao` desde 18/10/2026** (padrão, ativa, global). 1ª 2ª via real em 18/10: boleto novo R$ 1,00 registrado (linha + PIX); a baixa do original do Mutual (venc. 10/12/2025) voltou `0078 título já baixado` (o banco baixa sozinho pelo prazo) — passou a contar como BAIXADO (`baixaJaFeitaNoBanco`). `conta_bancaria_id` ligada à conta SICREDI (0810/46899-3) em 18/10/2026, conferido. **✅ A `0122_avisos_banco_pendentes` foi APLICADA pelo usuário e CONFERIDA em 19/10/2026** (tabela com RLS, 1 policy de select, trigger, `anon` sem leitura; deploy no ar; a baixa do original do teste de 2ª via virou BAIXADO e o boleto do Mutual `cancelado` + renegociado) — aviso do webhook que o Sicredi ainda não confirmou em `liquidados/dia` passa a ser GRAVADO (`cobranca_avisos_banco`, AGUARDANDO) em vez de ficar só no log, e o agendador reconfere do dia do aviso até hoje até achar (CONFIRMADO) ou 15 dias (EXPIRADO); lista na bancada do Sicredi. Caso real: boleto de R$ 1,00 (600804668) pago no domingo 18/10 ficou sem baixa. Só tabela + RLS (select admin/financeiro, escrita só service_role). **Aplicar ANTES do deploy** (o webhook e o agendador gravam nela). **✅ A `0123_termos` foi APLICADA pelo usuário e CONFERIDA em 19/10/2026** (3 tabelas com RLS, bucket `termos` privado, 64 células de permissão, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`). **✅ A `0127_eventos_unidades_atuacao` foi APLICADA pelo usuário e CONFERIDA em 19/10/2026** (`regionais_do_usuario` com a regra nova, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`; HYASKARA e GABRIELA SOUZA RAMOS com as 4 unidades de atuação marcadas; NILMA não está mais no perfil Eventos) — o perfil EVENTOS (papel `sinistro`) passa a usar as unidades de atuação (`supervisor_regionais`, marcadas pelo admin na edição do usuário), como o supervisor: só muda `regionais_do_usuario()`. O defeito: HYASKARA (sem unidade) não via associado nenhum no SAC e NILMA (unidade MATRIZ) só via os da matriz. Depois de aplicar: Configurações → Usuários → editar cada uma → marcar as unidades. **✅ A `0126_operador_conta_bancaria` foi APLICADA pelo usuário e CONFERIDA em 19/10/2026** (operadores marcados em 20/10/2026 — BANCO INTER: LUANA LUCIA CASTILHO, FRANCIELLI ZARISTA e GABRIELA SOUZA RAMOS) — OPERADOR DE CONTA BANCÁRIA (ver a seção TESOURARIA): a matriz marca em Contas e Saldos → *Configurar* quem opera a conta (ex.: FRANCIELLI no INTER, conta exclusiva da 24h); essa pessoa vê as abas *Contas e Saldos* e *Extrato e Conciliação* só dessa conta. **Aplicar ANTES do deploy** (a tela chama `minhas_contas_bancarias`). Conferir: `conta_bancaria_operadores` com RLS, uma versão de cada função recriada, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`; depois, liberar o INTER para a Francielli na tela. **✅ A `0125_servicos_assistencia_equipe` foi APLICADA pelo usuário (19/10/2026)** — o catálogo de serviços da 24h passa a ser criado/editado por quem tem `assistencia.criar/editar` (`pode_assistencia`), como prestadores e acionamentos; apagar segue só da matriz. **✅ A `0124_anexos_financeiros_rls` foi APLICADA pelo usuário e CONFERIDA em 19/10/2026** — a policy de `anexos_financeiros` passa a ser "vê o título (pela RLS de `lancamentos_financeiros`) = anexa"; antes só global ou `pode_regional`, e a supervisora que edita a conta da 24h da MATRIZ (`lanc_assistencia`) não conseguia anexar o comprovante. Texto original da 0123: — o módulo de TERMOS (modelos com campos, versões imutáveis, termos emitidos com PDF; ver "TERMOS (0123)"). **Aplicar ANTES do deploy** (Configurações → Termos, a aba Termos das fichas e o portal leem as tabelas). Conferir depois: as 3 tabelas com RLS, bucket `termos` privado, `select count(*) from perfil_permissoes where modulo in ('termos','termos_modelos')` = 64, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`. **⚠️ O deploy dessa fase instala o Chromium na imagem** (Dockerfile, `apk add chromium`): a compilação no GitHub fica mais longa e a imagem ~150 MB maior. **✅ A `0128_historico_eventos_unidades` foi APLICADA pelo usuário e CONFERIDA em 20/10/2026** (função com `regionais_do_usuario`, 0 secdef sem `search_path`) — `eventos_historico_listar` (mesma assinatura) passa a mostrar TODAS as unidades de `regionais_do_usuario()` para quem não é da matriz; antes filtrava por `escopo_regional(null)`, que devolve UMA unidade (GABRIELA, Eventos com 4 unidades de atuação, via só GRANDE NATAL). ⚠️ Outras RPCs de painel com `escopo_regional(null)` têm o mesmo limite para supervisor/eventos com várias unidades. **Operador de conta (tela, 20/10):** o comando estava só num ícone de engrenagem; agora é o botão **Configurar** em Financeiro → Contas e Saldos e o botão **Quem opera** em Configurações → Contas Bancárias (`src/components/financeiro/operadores-conta.tsx`), com o nome de quem opera no cartão. **✅ A `0129_comunicacao_evento` foi APLICADA pelo usuário e CONFERIDA em 20/10/2026** (as 2 tabelas, as 3 colunas em `anexos_evento`, os 4 valores novos de `tipo_documento_anexo`, 0 secdef sem `search_path`; deploy no ar e testado pelo usuário — 2 convites e 1 declaração já gravados) — a COMUNICAÇÃO DE EVENTO ONLINE (ver a seção própria). **✅ A `0130_perfis_personalizados` foi APLICADA pelo usuário e CONFERIDA em 20/10/2026** (`perfis_acesso` com 1 perfil — RASTREAMENTO —, os 3 triggers, 0 secdef sem `search_path`; deploy no ar) — o admin cria perfil do zero (ver "PERFIS PERSONALIZADOS (0130)"). **⚠️ Caso real (20/10):** ANDERSON NEW TRACKER (perfil RASTREAMENTO, base `consultor_vendas`, unidade "Global") abria Veículos/Associados VAZIOS: a grade libera a TELA, os registros vêm do alcance (global só admin/financeiro; senão a unidade). A tela de usuários agora avisa (`semUnidadeVisivel`, `src/lib/usuario.ts`) e a lista marca "Sem unidade ⚠". **✅ A `0131_unidades_atuacao_todos` foi APLICADA pelo usuário e CONFERIDA em 20/10/2026** (uma versão de `regionais_do_usuario` sem filtro de papel, `usuarios_listar` com `unidades_atuacao`, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`) — as UNIDADES DE ATUAÇÃO (`supervisor_regionais`) passam a valer para QUALQUER papel sem acesso global (só muda `regionais_do_usuario()`), e `usuarios_listar` (DROP + CREATE) ganha `unidades_atuacao`. Medido em 20/10: só o ANDERSON (já com as 4 unidades marcadas) ganha alcance; a cobrança segue só do supervisor e a carteira de leads do consultor segue só dele. **🆕 A `0132_contas_pagar_estorno_exclusao` é NOVA** — ESTORNO de pagamento e EXCLUSÃO de conta em aberto (com trilha) e o fornecedor na cotação do evento (ver "CONTAS A PAGAR — ESTORNO, EXCLUSÃO E COTAÇÃO (0132)"). **Aplicar ANTES do deploy** (a tela chama `estornar_baixa`/`excluir_lancamento` e grava `cotacoes_pecas.fornecedor_id`/`lancamento_id`). Conferir: `financeiro_auditoria` com RLS e 1 policy de select, as 4 funções com uma versão, as 2 colunas em `cotacoes_pecas`, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`. **✅ A `0133_equipe_ativa` foi APLICADA pelo usuário e CONFERIDA em 21/10/2026** (1 versão, security definer com `search_path`, `anon` sem execute, 0 secdef sem `search_path`; 19 usuários ativos) — `equipe_ativa()` (security definer, só staff): id/nome/papel/unidade dos usuários ATIVOS para escolher destinatário. O defeito (21/10): HYASKARA (Eventos) abria "Passar para" na tramitação e só via o próprio nome — a tela lia `usuarios` direto e a policy `usuarios_select_self` só mostra a própria linha a quem não é admin/financeiro/gestor. Tramitação do evento, histórico do protocolo e a Central de Protocolos (`useAtendentes`) passaram a usar `useEquipeAtiva`. **✅ A `0134_acionamento_negado_exclusao` foi APLICADA pelo usuário e CONFERIDA em 21/10/2026** (NEGADO no enum, `acionamento_exclusoes`, policy RESTRICTIVE `acion_sem_delete_direto`, as 6 funções, 8 células `assistencia.excluir`, 0 secdef sem `search_path`, 0 RPCs novas ao `anon`) — pedido NEGADO na 24h e EXCLUSÃO de acionamento com trilha (ver "PEDIDO NEGADO E EXCLUSÃO NA 24H (0134)"). **🆕 A `0135_acionamento_excluir_concluido` é NOVA** — só recria `excluir_acionamento` (mesma assinatura) sem a recusa de OS CONCLUÍDA: a regra passa a ser o pagamento (título pago recusa). Conferir: uma versão de `excluir_acionamento`, sem a palavra `CONCLUIDO` no corpo, 0 secdef sem `search_path`. **✅ A `0136_veiculo_zero_km` foi APLICADA pelo usuário (SQL Editor) e CONFERIDA em 21/10/2026; as 4 unidades RECARREGADAS pelo agente no mesmo dia** (GN +1 veíc. · SP1 +12 veíc./+11 assoc. · MATRIZ +5/+4 · RP +12/+9, em blocos; 22 veículos 0 km na base, todos com chassi, `zero_km`, `cobranca_externa`, tipo, plano e vendedor; TULIO ROCHA LOPES entrou — NMAX, chassi 9C6SG5920R0028234; faturas 0 e títulos 4, nada novo; vendedores religados nas 4 — RP ligou 2.839, o acervo inativo carregado em 14/10 que estava sem vendedor). Texto original: A `0136_veiculo_zero_km` era NOVA — o VEÍCULO 0 KM (placa pendente), pedido do usuário em 21/10/2026 (caso TULIO ROCHA LOPES, NMAX sem placa no Mutual, ficou fora da carga junto com o associado): `veiculos.placa` deixa de ser obrigatória (o `unique` fica — NULL não colide), entra `veiculos.zero_km` e a regra `chk_veiculo_identidade` (sem placa só com `zero_km` E chassi); placa em branco vira NULL por trigger; a carga traz o sem placa COM chassi como 0 km e recusa só sem placa E sem chassi; a re-execução não apaga a placa preenchida no SCar (`coalesce(r.placa, v.placa)`). Ver "VEÍCULO 0 KM (0136)". **Aplicar ANTES do deploy** (a tela grava `zero_km`). Conferir: coluna `zero_km`, `placa` nullable, a constraint, o trigger `trg_veiculo_placa_vazia`, uma versão de `mutual_carga_linhas`/`mutual_executar_carga`, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`; depois, recarregar as 4 unidades (feito em 21/10). Ficam de fora só os sem placa E sem chassi (corrigir no Mutual) e os 0 km do acervo inativo — **decisão do usuário (22/10/2026): NÃO carregar os inativos sem placa** (a carga padrão e a rotina diária já não trazem; só entrariam se alguém marcar "incluir inativos" na tela). **✅ A `0137_revistoria_cobranca` foi APLICADA pelo usuário (SQL Editor) e CONFERIDA em 22/10/2026** (3 tabelas, 3 itens, os 2 triggers, `dias_revistoria_boleto` = 5, 36 células `revistoria`, 22 funções, 0 secdef sem `search_path`, 0 abertas ao `anon`; **908 veículos já precisam de revistoria** — `revistorias_a_solicitar`). Texto original: a 0137 era NOVA — a REVISTORIA DO BOLETO VENCIDO (ver a seção própria): boleto vencido há mais de N dias (padrão 5, `empresa.dias_revistoria_boleto`) só vira 2ª via/negociação depois da revistoria do veículo (frente, traseira e vídeo de até 30 s) APROVADA pela equipe; a trava é TRIGGER em `cobranca_renegociacao_origens` (a 0121 não foi reescrita). **Aplicar ANTES do deploy** (o modal da 2ª via chama `revistoria_exigida` e o deploy sem ela quebra a negociação). Conferir: `revistorias_cobranca`/`revistoria_cobranca_historico`/`revistoria_itens` (3 itens) com RLS, os 2 triggers (`trg_reneg_origem_revistoria`, `trg_reneg_consome_revistoria`), `empresa.dias_revistoria_boleto` = 5, `select count(*) from perfil_permissoes where modulo = 'revistoria'` > 0, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`. Crontab `15 6 * * * /opt/scar/scripts/revistorias-rotina.sh` LIGADO em 22/10/2026. **✅ A `0138_mutual_carga_transferencia` está APLICADA (conferida em 22/10/2026: uma versão de `mutual_carga_linhas` contendo `veiculo_assumido`)** — só recria `mutual_carga_linhas` (mesma assinatura): na placa repetida fica o objeto MAIS VIVO (depois o mais recente) e o carro REVENDIDO no Mutual (contrato novo de outro dono) ASSUME o veículo que já veio do Mutual, em vez de ser recusado e deixar o veículo ativo com o dono antigo (TLS5H69, OBN6J57, NJV5763, PYQ0F00, UGV3F70, OAQ7I14). Veículo cadastrado à mão segue recusa (EWH9B46). Conferir: uma versão de `mutual_carga_linhas` contendo `veiculo_assumido`, 0 secdef sem `search_path`; depois rodar a sincronia (recarrega as 4 unidades). Junto (sem migration): a busca por NOME do SAC e de Associados/Veículos ignora acento, espaço duplo e palavras do meio (`padraoNomeTolerante`, `src/lib/busca-cadastro.ts`) — "Flávio Nascimento" não achava FLAVIO RODRIGO NASCIMENTO DE SOUSA. **✅ A `0139_regua_cobranca` está APLICADA e testada pelo usuário (22/10/2026; as funções novas existem em produção)** — a RÉGUA DE COBRANÇA (ver a seção própria): `empresa.dias_bloqueio_inadimplencia` (1) ao lado da revistoria (0137) e da inativação (0072) com CHECK de ordem; a 24h passa a bloquear também por boleto do MUTUAL vencido (`vencidos_veiculo`, `situacao_assistencia_veiculo` recriada); `rotina_regua_cobranca()` (inadimplente/inativo/volta a ativo, SÓ veículo cobrado pelo SCar); a fila tira os "a inativar" e ganha `p_ordem` (DROP + CREATE de `cobranca_fila`); `cobranca_carteira` (DROP + CREATE) com `clientes_a_inativar`/`valor_a_inativar`; `cobranca_inativados`. **Aplicar ANTES do deploy** (a fila chama `cobranca_fila` com `p_ordem` e a Empresa grava `dias_bloqueio_inadimplencia`). Conferir: coluna nova + `chk_empresa_regua_ordem`, uma versão de `cobranca_fila`/`cobranca_carteira`/`situacao_assistencia_veiculo`, as 5 funções novas, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`. A rotina roda no crontab que já existe (`revistorias-rotina.sh`, 06:15). **✅ A `0140_boleto_mutual_substituido` foi APLICADA pelo usuário e CONFERIDA em 22/10/2026** (4 colunas, 2 gatilhos, 4 funções, 660 boletos substituídos (R$ 136,3 mil), todos `cancelado`, recálculo estável (0 pendentes), Inadimplente de setembro R$ 51.211 sobre R$ 492.807 vencidos, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`; 57.191 de 120.817 boletos têm referência — os demais não trazem `reference_id` no payload e não entram em grupo nenhum) — o boleto do Mutual SUBSTITUÍDO por uma 2ª via deixa de contar como dívida (ver "BOLETO DO MUTUAL SUBSTITUÍDO (0140)"). Medido: Inadimplente de setembro R$ 112.749 (20,34%) → R$ 51.211 (~10,4%). Só tabela/gatilhos/backfill, nenhuma função de leitura recriada. Aplicar pelo SQL Editor (backfill de ~120 mil linhas). Conferir: as 4 colunas novas, os 2 gatilhos `trg_boleto_historico_substituido`/`_recalcula_grupo`, `select count(*) from boletos_historico where substituido_por is not null` (~660), `recalcular_substituicoes_boletos(null)` = 0 numa segunda chamada, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`. **🟡 A `0141_permissoes_configuracoes_dre` está PARCIAL em produção (conferido em 23/10/2026)** — a 1ª execução pelo agente (MCP, em blocos) gravou as funções `pode_configurar`/`pode_ver_dre`, as 3 funções do DRE com a trava, `minhas_permissoes`/`permissao_celula_valida` (versão Ver/Editar) e os seeds; a execução do usuário no SQL Editor voltou INTEIRA porque mexia em policy de `storage.objects` (dono `supabase_storage_admin`: "must be owner of table objects"), então NENHUMA policy nova existe (`regionais_write` segue de pé) e `regionais_listar`/`salvar_marcos_prazo_evento` são as antigas. O estado parcial é seguro (as policies antigas são só global). O arquivo foi refeito em 23/10: Criar/Editar/Excluir separados por aba e as policies de storage num bloco que ignora a falta de dono (upload de logo/documento da empresa segue só da matriz). **Rodar o arquivo INTEIRO de novo no SQL Editor** (re-executável). Conferir: `select count(*) from pg_policies where qual like '%pode_configurar%' or with_check like '%pode_configurar%'` > 0, `regionais_write` não existe, `select count(*) from perfil_permissoes where modulo like 'cfg\_%'` = 16 × 4 × nº de perfis, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`. Texto original: CONFIGURAÇÕES POR ABA e o DRE SEPARADO na grade de permissões (ver "CONFIGURAÇÕES POR ABA E DRE (0141)"): 16 linhas `cfg_*` (Ver/Editar) que nascem sem ninguém, a linha `financeiro_dre` (Ver/Exportar) semeada para todo perfil que tem `financeiro.ver` (e para os extras de `financeiro.ver`), as travas de gravação dos cadastros trocadas por `pode_configurar('cfg_<aba>')`, o DRE (`gerar_dre_completo`/`_mensal`/`resumo_por_centro_custo`) vazio sem `pode_ver_dre()` e `resumo_por_centro_custo` passando a respeitar a unidade (`escopo_regional`). **Aplicar ANTES do deploy** (a tela pede `financeiro_dre.ver` para mostrar a aba DRE — sem a migration o DRE some para todos menos o admin). Conferir: `select count(*) from perfil_permissoes where modulo like 'cfg\_%' and concedida` = 0, `financeiro_dre.ver` concedido = `financeiro.ver` concedido em todo papel/perfil, uma versão de `pode_configurar`/`pode_ver_dre`/`regionais_listar`/`salvar_marcos_prazo_evento`, policies `regionais_insert/_update/_delete` (sem `regionais_write`), 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`. **🆕 A `0142_mutual_carga_cor_uma_vez` é NOVA (23/10/2026)** — só recria `mutual_carga_linhas` (mesma assinatura, mesmo resultado): a cor do Mutual passa a ser resolvida UMA vez por cor distinta. O defeito: a carga de RIBEIRÃO PRETO estourava o tempo TODO DIA na rotina ("canceling statement due to statement timeout") — desde 14/10 o acervo inativo (3.766) fica no lote, a leitura passou a ~5.000 linhas e levava 16,7 s (teto do service_role: 8 s); 8 s eram `mutual_cor_do_externo` por linha. ✅ APLICADA pelo usuário em 23/10/2026 — e ficou PIOR (SP1 3,4 s → 13,3 s; RP > 60 s): o CTE `cor_map`, referenciado uma vez, era inline-ado e o planejador o recalculava por objeto (nested loop). A medição de 3,7 s estava errada: a consulta de teste não lia a cor e o planejador descartava a junção. **🆕 A `0143_mutual_carga_cor_materializada` é NOVA e CORRIGE a 0142** — `cor_map as materialized` (medido lendo `cor_id`: RP 3,7 s, cor_map uma vez, 19 cores). Conferir: uma versão de `mutual_carga_linhas` contendo `cor_map as materialized`, 0 secdef sem `search_path`; depois a rotina mostra `carga RIBEIRÃO PRETO` ok. **Lição: medir otimização com a coluna otimizada LIDA na saída** — `count(*)` deixa o planejador remover a junção e mede outra consulta. **✅ A `0144_cancelamento_pro_rata` foi APLICADA pelo usuário e CONFERIDA em 23/10/2026** (coluna, tabela com RLS e 1 policy, os 3 triggers, `chk_reneg_tipo` com PRO_RATA, uma versão de cada função, a carga preservando o cancelado, a revistoria pulando PRO_RATA, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`; `pro_rata_veiculo` testado em veículos reais — AAK1F74 dia 20, R$ 119: 4 de 31 dias = R$ 15,35; deploy no ar). Texto original: — o CANCELAMENTO DE PROTEÇÃO VEICULAR no SAC e o PRÓ-RATA (ver "CANCELAMENTO DO VEÍCULO E PRÓ-RATA (0144)"). **Aplicar ANTES do deploy** (o card chama `cancelar_veiculo`/`pro_rata_veiculo`). Recria `mutual_executar_carga` (corpo da 0136 + o status preservado) e `fn_reneg_origem_exige_revistoria`. Conferir: tabela `veiculo_cancelamentos` com RLS e 1 policy, coluna `veiculos.cancelado_em`, os 3 triggers novos (`trg_veiculo_limpa_cancelamento`, `trg_evento_veiculo_cancelado`, `trg_acionamento_veiculo_cancelado`), `chk_reneg_tipo` com PRO_RATA, uma versão de `mutual_executar_carga` contendo `v.cancelado_em is not null`, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`. **✅ A `0145_adesao_carne_comissao` foi APLICADA pelo usuário e CONFERIDA em 23/10/2026** (uma versão de `autorizar_entrada_lead` com 4 args, `fn_calcular_comissao` nova, `uq_comissao_titulo_veiculo` sem o unique antigo, coluna `adesao_lead_id`, os 2 triggers, `dre_movimentos` novo, as 4 da remessa aceitando o servidor, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`; os 4 leads não convertidos com adesão = tabela; o ATIVO antigo intocado; deploy feito pelo usuário). Texto original: a NOVA ADESÃO até o CARNÊ (ver "NOVA ADESÃO, CARNÊ E COMISSÃO (0145)"). **Aplicar ANTES do deploy** (a aprovação chama `autorizar_entrada_lead` com 4 argumentos — DROP + CREATE — e a ficha chama `gerar_carne_veiculo`/`lead_adesao_tabela`). Conferir: uma versão de `autorizar_entrada_lead` (4 args), `fn_calcular_comissao` contendo `adesao_lead_id`, índice `uq_comissao_titulo_veiculo` (e sem `comissoes_vendas_titulo_id_key`), `titulos_financeiros.adesao_lead_id`, os 2 triggers (`trg_lead_adesao_da_tabela`, `trg_cotacao_sincroniza_adesao`), `dre_movimentos` com `left join faturas`, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`. **✅ A `0146_baixa_banco_data_credito` foi APLICADA pelo usuário e CONFERIDA em 25/10/2026** (uma versão de `registrar_liquidacao_banco` e de `tesouraria_movimentos` com o corpo novo, `data_credito_banco` existe, 26 feriados, as 3 colunas, 0 liquidação sem `data_credito`, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`; as 901 baixas do banco estão TODAS na data do crédito — COMPE/REDE no dia útil seguinte, PIX no dia) — a BAIXA DO BANCO NA DATA DO CRÉDITO (ver "BAIXA DOS BOLETOS DO MUTUAL PELO BANCO"): boleto liquidado por COMPE/REDE cai na conta no dia útil seguinte e só o PIX credita na hora; a baixa entrava no dia do PAGAMENTO e o extrato nunca batia. Semeia os feriados bancários nacionais 2026–2027 (`cobranca_feriados` estava VAZIA), cria `data_credito_banco`, as colunas `cobranca_liquidacoes.tipo_liquidacao/data_credito` e `titulos_financeiros.data_credito`, recria `registrar_liquidacao_banco` (mesma assinatura) e `tesouraria_movimentos`, e move as baixas do banco ainda NÃO conciliadas para o crédito (medido em 25/10: 432 baixas, R$ 89.536,90). Depois de aplicar: bancada do Sicredi → dia 09/10/2026 → *Dar baixa agora* (traz os 42 boletos pagos em 09/10 e creditados em 13/10, R$ 7.131,73). Conferir: uma versão de `registrar_liquidacao_banco` contendo `data_credito_banco`, `select count(*) from cobranca_feriados` ≥ 26, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`. **✅ A `0147_conciliacao_lote_cobranca` foi APLICADA pelo usuário e CONFERIDA em 25/10/2026** (tabela com RLS e 1 policy, uma versão de cada função, o crédito de 13/10 CONCILIADO com 42 vínculos/R$ 7.131,73 e as 42 baixas `CONCILIADO_API`, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`; deploy no ar) — a CONCILIAÇÃO EM LOTE do crédito somado da cobrança (ver TESOURARIA): `extrato_item_lote` (um crédito do extrato ↔ N baixas/títulos), `lote_cobranca_extrato_item` (prévia), `conciliar_lote_extrato_item`, `conciliar_lotes_cobranca(conta, desde)`; recria (mesmas assinaturas) `sugestao_extrato_item`, `candidatos_extrato_item`, `desfazer_extrato_item`, `classificar_extrato_itens` (concilia os lotes antes das regras), `fn_baixa_solta_extrato` e `tesouraria_movimentos`; e no fim concilia o que já está no extrato (prévia em produção: o crédito de 13/10, 42 baixas, R$ 7.131,73, fecha). **Aplicar ANTES do deploy** (a tela e a rotina de baixa chamam `conciliar_lotes_cobranca`). Conferir: tabela com RLS e 1 policy, uma versão de cada função, o item de 13/10 CONCILIADO com 42 vínculos, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`. **✅ A `0148_conciliacao_pix_cobranca` foi APLICADA pelo usuário e CONFERIDA em 25/10/2026** (uma versão de `conciliar_pix_cobranca`, `classificar_extrato_itens` chamando-a, os 200 PIX de 13/10 CONCILIADO por valor, R$ 42.341,00, 0 divergência de valor, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`; deploy no ar) — o PIX DA COBRANÇA CASA POR VALOR NO DIA (decisão do usuário): o OFX do Sicredi não traz o nosso número do PIX do boleto híbrido ("RECEB. COB HIBRIDA (A)-PIXCOBRAN CRED_COBPIX"), e com muitos valores iguais no dia a sugestão desistia (131 de 200 em 13/10). `conciliar_pix_cobranca(conta, desde)`: honra a sugestão que já aponta para uma baixa PIX e casa o resto valor a valor (FITID × id) com as baixas PIX do banco creditadas no dia; recria `classificar_extrato_itens` chamando-a e no fim concilia o que já está no extrato (prévia em produção: 200 de 200, R$ 42.341,00). Rotina de baixa e o botão **Conciliar cobrança (lotes e PIX)** também chamam. **Aplicar ANTES do deploy** (a tela chama `conciliar_pix_cobranca`). Conferir: uma versão de `conciliar_pix_cobranca` e de `classificar_extrato_itens` contendo-a, os 200 PIX de 13/10 CONCILIADO, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`. **✅ A `0149_extrato_grupo_cobranca` foi APLICADA pelo usuário e CONFERIDA em 25/10/2026** (uma versão de `extrato_conta` com `grupo`, índice criado, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`; deploy no ar; SICREDI 13/10 = COMPE/REDE 42 · R$ 7.131,73 e PIX 200 · R$ 42.341,00, 14/10 = COMPE/REDE 195 e PIX 33, cada grupo contíguo. Em produção os movimentos SEM grupo vêm ANTES dos grupos no dia — a collation do banco põe `~` antes das letras; no harness (C) vêm depois. Só muda a posição, o saldo é o mesmo) — o EXTRATO AGRUPADO (pedido do usuário: "agrupar por tipo de recebimento… só o total, e ao clicar listar os boletos"): `extrato_conta` (DROP + CREATE, mesmos argumentos) ganha a coluna `grupo` (PIX | COMPE_REDE | COBRANCA, pelo `cobranca_liquidacoes` do lançamento/título) e ordena o dia com os membros de cada grupo JUNTOS, para o saldo do último ser o saldo real depois do grupo; índice em `cobranca_liquidacoes.lancamento_id`. Medido em produção: a leitura de outubro leva 22 ms. A tela funciona antes dela (sem `grupo` não agrupa). Conferir: uma versão de `extrato_conta` com a coluna `grupo`, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`. **✅ A `0150_boleto_avulso` foi APLICADA e CONFERIDA em 26/10/2026** (11 tipos, uma versão de `criar_boleto_avulso`, 0 secdef sem `search_path`) — o BOLETO AVULSO no SAC (ver "BOLETO AVULSO NO SAC (0150)"). **Aplicar ANTES do deploy** (o card e Configurações → Boletos Avulsos leem `tipos_boleto_avulso`). Recria `cobranca_boletos_base`, `vencidos_veiculo` e `dre_movimentos` (mesmas assinaturas). Conferir: `select count(*) from tipos_boleto_avulso` = 11, as 3 categorias 1.2.03/04/05, `chk_reneg_tipo` com AVULSO, uma versão de `criar_boleto_avulso`, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`. **✅ A `0151_api_externa` foi APLICADA e CONFERIDA em 26/10/2026** (as 2 tabelas e as 4 funções de leitura/comunicação existem, 0 secdef sem `search_path`) — a API EXTERNA do SCar (ver "API EXTERNA (0151)"): chaves por sistema (`api_integracoes`, só o SHA-256), trilha (`api_requisicoes`), RPCs `api_veiculos`/`api_rastreadores`/`api_registrar_comunicacoes` (só sem sessão, conferem a chave de novo por `api_exigir`) e as de admin (`criar_`/`atualizar_`/`girar_chave_`/`revogar_api_integracao`, `api_integracoes_listar`); recria `fn_rastreador_espelha_veiculo` sem regravar a ficha quando nada mudou. **Aplicar ANTES do deploy** (a tela Configurações → API e Integrações chama `api_integracoes_listar`). Conferir: as 2 tabelas com RLS e 1 policy de select cada, uma versão de cada função, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`. **✅ A `0152_plano_contas_padrao` foi APLICADA pelo usuário e CONFERIDA em 26/10/2026** (77 contas, 28 RECODIFICADAS + 48 CRIADAS, 0 código antigo, 0 lançamento órfão, 0 função com código antigo, 0 secdef sem `search_path`; balancete de outubro fecha — D = C = R$ 821.876,57; classes: SICRED INVESTIMENTO = INVESTIMENTO, CAIXA = DINHEIRO, as demais CONTA_CORRENTE; deploy no ar, conferido pelo usuário). Texto original: A 0152 — o PLANO DE CONTAS PADRÃO, a DRE GERENCIAL, o BALANCETE e o FLUXO EVOLUTIVO (ver "PLANO DE CONTAS PADRÃO (0152)"). **Aplicar ANTES do deploy** (a tela lê `analitica`/`natureza` e chama `balancete_verificacao`/`fluxo_caixa_evolutivo`). Ela RECODIFICA as contas antigas no lugar (mesmo id: os lançamentos seguem) e reescreve as funções que procuram conta por código (troca do literal sobre a definição em vigor). Conferir: `select count(*) from categorias_dre where codigo_estruturado ~ '^[1-4]\.[0-9]\.[0-9]{2}$'` = 0, `select acao, count(*) from plano_contas_migracao group by 1`, 0 funções com código antigo (a própria migration levanta erro se sobrar), `select sum(debitos) - sum(creditos) from balancete_verificacao(date '2026-10-01', date '2026-10-31')` = 0, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`. Depois: Configurações → Contas Bancárias → marcar a linha de cada conta (SICRED INVESTIMENTO já entra como aplicação). **🆕 A `0153_disponibilidade_por_conta` é NOVA (27/10/2026)** — cada conta bancária ganha a SUA analítica em Disponibilidades (ver "PLANO DE CONTAS PADRÃO (0152)"). Conferir depois de rodar: 1.1.1.01/02/03/04 sintéticas, `select cb.nome, c.codigo_estruturado from contas_bancarias cb join categorias_dre c on c.id = cb.conta_contabil_id` com uma linha por conta, uma versão de `balancete_partidas` contendo `codigo_contabil_banco`, o balancete de outubro fechando (D = C), 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`. **✅ A `0153_disponibilidade_por_conta` foi APLICADA pelo usuário e o deploy está no ar (27/10/2026).** **🆕 A `0154_boleto_mutual_via_sem_vinculo` é NOVA (27/10/2026)** — a 2ª via paga que o Mutual emitiu SEM `original_reference_id` também tira o original da dívida (caso RQE9F00; ver "BOLETO DO MUTUAL SUBSTITUÍDO (0140)"). Só recria `recalcular_substituicoes_boletos` (mesma assinatura) e roda o recálculo (medido: 1,1 s, 20 boletos mudam). Conferir: uma versão da função contendo `pm as`, o boleto 261316 (RQE9F00, venc. 10/09) `cancelado` com `substituido_por`, `recalcular_substituicoes_boletos(null)` = 0 numa segunda chamada, 0 secdef sem `search_path`. **✅ A `0155_mutual_carga_inativo_com_evento` foi APLICADA pelo agente (autorizada) e CONFERIDA em 27/10/2026** (uma versão de `mutual_carga_linhas` contendo `com_evento`, security definer com `search_path`, `anon` sem execute, 0 secdef sem `search_path`; leitura por unidade: MATRIZ 4,6 s · RP 3,8 s · SP1 2,0 s · GN 2,2 s; a carregar pela regra nova: MATRIZ 955 inativos com evento, GN 85 — RP e SP1 já tinham o acervo inativo. Em produção o corpo tem os comentários encurtados; a lógica é a do arquivo). Texto original: A 0155 era NOVA (27/10/2026) — o veículo INATIVO que teve EVENTO no Mutual entra na carga padrão (sem marcar "incluir inativos"), como inativo, com `cobranca_externa`; a importação do histórico (rotina, depois das cargas) traz o evento. Pedido do usuário: caso DIOGO DE JESUS DO PRADO, moto GFN4E13 (contrato 14661, SÃO PAULO 1), FURTO de 05/06/2026 — o Mutual inativou o contrato no dia do furto e carro, associado e evento ficaram de fora. Chave do evento = contrato + veículo do Mutual; sem placa fica de fora (decisão de 22/10); se a placa tem contrato mais vivo no lote, o inativo some da lista em vez de virar recusa (o evento liga ao veículo vencedor). Só recria `mutual_carga_linhas` (mesma assinatura; corpo da 0143, conferido idêntico ao de produção por md5). Medido em 27/10: 1.146 objetos inativos com evento ainda não carregados. Conferir depois de rodar: uma versão de `mutual_carga_linhas` contendo `com_evento`, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`; depois a rotina (ou *Carregar* por unidade) traz os inativos com evento e o *Importar* do histórico traz os eventos. **✅ A `0156_evento_indenizacao_associado` foi APLICADA pelo agente (autorizada) e CONFERIDA em 27/10/2026** (uma versão de `fn_lanc_evento_favorecido` com a regra nova, trigger de pé, 0 secdef sem `search_path`, `anon` sem execute; falta o deploy do contêiner para a tela). Texto original: A 0156 era NOVA (27/10/2026) — a conta a pagar lançada pelo evento aceita como favorecido o PRÓPRIO associado do evento (indenização), em `cliente_id`; outro associado é recusado. Só recria `fn_lanc_evento_favorecido`. Tela: checkbox *Indenização ao associado* no lançamento do evento (preenche o nome, a descrição com o número do evento e a conta 4.1.4.03); a lista do Financeiro mostra o favorecido com "Evento EVT-…" embaixo (`rotuloFavorecido`, `src/lib/terceiros.ts`). **Aplicar ANTES do deploy** (sem ela o banco recusa a indenização). Conferir: uma versão de `fn_lanc_evento_favorecido` contendo `cliente_id`, 0 secdef sem `search_path`. **✅ A `0158_assistencia_profissional` está APLICADA (28/10/2026).** **✅ A `0159_comissao_liquidacao_assistencia` foi APLICADA pelo agente (autorizada) e CONFERIDA em 28/10/2026** (uma versão de `fn_calcular_comissao` com as origens da renegociação e o repasse, `fn_cotacao_valida_desconto` sem a trava da unidade, trigger de pé, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`; em produção os comentários do corpo foram encurtados, a lógica é a do arquivo). Texto original: CORRIGE a 0158 — decisões do usuário: (A) a comissão sai da LIQUIDAÇÃO, então o boleto RENEGOCIADO pago (2ª via, acordo, pró-rata) comissiona, repartido pelos veículos dos boletos originais (avulso continua sem comissão; renegociação nunca é adesão); (B) **comissão OU Assistência, nunca as duas** — a unidade que marca `paga_assistencia_profissional` paga ao consultor a Assistência do veículo NO LUGAR da comissão recorrente; (C) **qualquer unidade cobra a Assistência** (dentro do mínimo/máximo dela); a que não repassa paga o percentual sobre o valor cheio. Só recria `fn_cotacao_valida_desconto`, `assistencia_profissional_regras` e `fn_calcular_comissao` (mesmas assinaturas). **Aplicar ANTES do deploy** (a tela passa a oferecer a Assistência em toda unidade e a 0158 recusaria). Conferir: uma versão de `fn_calcular_comissao` contendo `cobranca_renegociacao_origens`, `fn_cotacao_valida_desconto` sem a palavra `nao paga`, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`. **✅ A `0160_plano_desconto_participacao` foi APLICADA pelo agente (autorizada) e CONFERIDA em 28/10/2026** (uma versão de `cotar_plano` com o desconto, `atualizar_cotacao` com `participacao_do_plano(`, 0 secdef sem `search_path`, 0 abertas ao `anon`; PLANO ECONÔMICO gravado com 30% e 2x — Passeio 50k: R$ 135,00 → R$ 94,50, participação R$ 2.000 → R$ 4.000; os demais planos inalterados; em produção os comentários do corpo foram encurtados). Texto original: A 0160 era NOVA (28/10/2026) — o PLANO ECONÔMICO: `planos_protecao.desconto_base_percentual` (0..90, desconto nos PRODUTOS obrigatórios da base) e `multiplicador_participacao` (0,5..5); `cotar_plano` aplica os dois, `participacao_do_plano` nova, `calcular_participacao_veiculo` e `atualizar_cotacao` (troca de literal) levam o plano (ver "PLANO COM DESCONTO NA BASE (0160)"). **Aplicar ANTES do deploy** (as telas chamam `participacao_do_plano`). Conferir: as 2 colunas, uma versão de `cotar_plano` contendo `desconto_base_percentual`, `atualizar_cotacao` contendo `participacao_do_plano(`, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`; depois, Configurações → Planos → PLANO ECONÔMICO: 30% e participação 2x. **✅ A `0161_adesao_backoffice` foi APLICADA pelo usuário e CONFERIDA em 30/10/2026** (enum, 0 leads em ORCAMENTO_GERADO, `cobertura_desde`, os triggers, uma versão de cada função, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`). Texto original: A 0161 era NOVA (30/10/2026) — a ROTINA DA NOVA ADESÃO revista com o usuário (ver "NOVA ADESÃO COM BACK-OFFICE (0161)"). **Aplicar ANTES do deploy** (a tela e o Kanban usam o status `AGUARDANDO_VISTORIA`; o envio à Auditoria passa a exigir o checklist completo). Recria `autorizar_entrada_lead` sobre o corpo da 0158 (Assistência Profissional) e corrige a conta da adesão no cartão para `3.1.1.03` (a 0158 tinha voltado a gravar `1.1.01`, que não existe desde a 0152). Conferir: `select 'AGUARDANDO_VISTORIA'::status_lead`, 0 leads em `ORCAMENTO_GERADO`, coluna `veiculos.cobertura_desde`, triggers `trg_cotacao_lead_proposta` e `trg_evento_carencia`, uma versão de `mover_lead_status`/`registrar_aceite_venda`/`checklist_lead`/`autorizar_entrada_lead`/`gerar_carne_veiculo`/`situacao_assistencia_veiculo`, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`. **✅ A `0162_plano_tipo_sugestoes_cota_modelo` foi APLICADA pelo usuário e CONFERIDA em 30/10/2026** (2 tabelas com RLS e 4 policies, `trg_cotacao_plano_do_tipo`, uma versão de cada função, `autorizar_entrada_lead` com os opcionais + carência + Assistência Profissional, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`; `modelo_do_catalogo` testado: Tracker → V6 6%, CG 160 → modelo sem cota). Texto original: A 0162 era NOVA (30/10/2026) — PLANO POR TIPO, PRÉ-MARCADOS E COTA PELO MODELO (ver "PLANOS POR TIPO, PRÉ-MARCADOS E COTA DO MODELO (0162)"). **Aplicar ANTES do deploy** (as telas leem `plano_tipos_veiculo`/`plano_sugestoes` e chamam `modelo_do_catalogo`). Conferir: as 2 tabelas com RLS e 2 policies cada, `trg_cotacao_plano_do_tipo`, uma versão de `modelo_do_catalogo` e de `plano_atende_tipo`, `autorizar_entrada_lead` contendo `0162: os opcionais`, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`. Depois: Configurações → Planos → marcar em cada plano **Oferecido para** e os **Pré-marcados**. **✅ A `0163_plano_preferencial` foi APLICADA pelo usuário e CONFERIDA em 30/10/2026** (coluna `not null default false`, 0 planos marcados) — só a coluna `planos_protecao.preferencial` (default false; nenhum plano muda). Ver "PLANO PREFERENCIAL E EDIÇÃO DA PROPOSTA (0163)". **Aplicar ANTES do deploy** (a cotação lê a coluna). Conferir: a coluna existe, `not null default false`. **✅ A `0164_proposta_reboque_validade` foi APLICADA pelo agente (autorizada) e CONFERIDA em 30/10/2026** (3 colunas, 2 CHECKs, validade 30 na empresa; km ainda em branco em todos os tipos) — só colunas: `tipos_veiculo.km_reboque_ida/volta` (o limite do reboque da 24h que a proposta mostra; nulo = "conforme o tipo") e `empresa.validade_proposta_dias` (30). Ver "PROPOSTA COMERCIAL v2". A página funciona sem ela (cai nos padrões), mas aplicar antes do deploy. Conferir: as 3 colunas e os 2 CHECKs. ****🆕 A `0165_api_cadastro_rastreadores` é NOVA (31/10/2026)** — `POST /api/externa/v1/rastreadores`: a rastreadora cadastra os equipamentos e instala nos veículos (ver "API EXTERNA (0151)"). Só cria `api_cadastrar_rastreadores`. **Aplicar ANTES do deploy.** Conferir: uma versão da função, security definer com `search_path`, `anon` sem execute. **Próxima migration livre: `0166`**** (antes: `0164`, `0163`, `0162`, `0161`, `0160`, `0159`, `0158`, `0157`, `0156`, `0155`, `0154`, `0153`, `0152`, `0151`, `0150`, `0149`, `0148`, `0147`, `0146`, `0145`, `0144`, `0143`, `0142`, `0141`, `0140`, `0139`, `0138`, `0137`, `0136`, `0135`, `0134`, `0133`, `0132`, `0131`,  (antes: `0130`, `0129`, `0128`, `0127`, `0126`, `0125`, `0124`, `0123`, `0122`, `0121`, `0120`, `0119`, `0118`, `0117`, `0116`, `0113`) (a `0106_regional_numeros` foi **APLICADA pelo agente, com autorização, e CONFERIDA em 14/10/2026**: as 9 funções existem, uma versão de `regional_painel` com o corpo novo, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`, 0 lançamentos de franquia na base e o "a pagar" de Ribeirão Preto zerado — falta o deploy do contêiner para a tela `/regional/cobranca`). **✅ BAIXA TESTADA NO SANDBOX em 13/10/2026** (*Dar baixa agora*): token OK, leu ontem e hoje, 2 pagamentos lidos e gravados na trilha como NAO_ENCONTRADO — o esperado, o mock devolve sempre o nosso número 211001202, que não é título nosso. Formato real de `liquidados/dia` guardado em `sicredi.test.ts` (`valorLiquidado` já com juros/multa, `dataPagamento` com hora). **✅ AGENDADOR LIGADO no VPS em 13/10/2026:** `COBRANCA_CRON_SECRET` no `.env` (64 caracteres, uma linha), contêiner recriado, script testado à mão (`lidos 2`) e crontab `10 7,12,18,22 * * * /opt/scar/scripts/baixa-banco.sh` ativo. Hoje roda contra o SANDBOX; vira produção ao trocar `SICREDI_AMBIENTE` e as credenciais. **✅ A `0102` e a `0103` estão APLICADAS e CONFERIDAS em
13/10/2026** (ver abaixo).
**✅ A `0098_cobranca_fila` foi APLICADA (pelo usuário, SQL Editor — o `execute_sql` estourou os 60 s do MCP e foi desfeito inteiro) e CONFERIDA em 12/10/2026:** 3 tabelas com RLS, 14 funções, 3 triggers de imutabilidade, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`. Tela `/cobrancas/fila` (Cobrança → Fila de Cobrança). Ver §9 de `docs/modulos/cobranca-inadimplencia.md`.
**✅ A `0099_historico_financeiro_mutual` foi APLICADA (pelo usuário, SQL Editor) e CONFERIDA em 12/10/2026:** 3 colunas novas em `boletos_historico`, 3 funções novas, importação e `portal_financeiro` nas versões novas, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`; QQQ5D49 com 35 boletos visíveis (29 pagos · 2 vencidos · 3 a vencer). Linha digitável ainda em 0 — falta reimportar o histórico. Texto original: O defeito: o Histórico Financeiro do SAC e o Financeiro do portal liam SÓ `titulos_financeiros` (6 linhas na base) e os 78.425 boletos importados do Mutual não apareciam. Ela: (A) `boletos_historico` ganha `linha_digitavel`/`url_boleto`/`url_pagamento` (o `checkout_link` do Mutual); (B) `cobranca_importar_historico_mutual` recriada (mesma assinatura) preenchendo os três; (C) `corte_cobranca_cliente`; (D) `boletos_mutual_do_cliente` (SAC, permissão de `titulos_do_cliente`) e `portal_boletos_mutual`; (E) `portal_financeiro` recriado somando as duas fontes. As telas unem as duas listas (`src/lib/historico-financeiro.ts`) e o boleto do Mutual é SÓ CONSULTA (selo "Mutual", sem editar/2ª via; link de pagamento e linha digitável do próprio Mutual). **Depois de aplicar:** deploy + `/integracao/mutual` → *Histórico de boletos* → *Importar / atualizar* (é o que traz a linha digitável para os 78 mil já importados).
**✅ A `0097_cobranca_painel` foi APLICADA (pelo usuário, SQL Editor — o `execute_sql` estourava os 60 s do MCP) e CONFERIDA em 12/10/2026:** 22 funções do módulo, `boletos_historico`/`supervisor_regionais`/`cobranca_feriados` com RLS, papéis `supervisor`/`cobranca` no enum, `resumo_cobrancas` com o denominador novo, meta/limite 5/10, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`. **Em produção desde 12/10/2026:** INVOICE recapturado (206.706) e **histórico importado — 78.425 boletos de 2.527 associados** (58.125 pagos · 8.428 abertos · 11.872 cancelados; 124 mil mensalidades de associados não carregados ficam de fora, de propósito). Deploy no ar com o painel, as listas paginadas (`lerTodas`) e a barra lateral fixa — conferido pelo usuário. **O VPS estava com o disco 100% cheio** (cache do BuildKit 30 GB + imagens antigas): limpo para 80% e swap ampliado para 3 GB — ver `DEPLOY.md` §2.1 antes de qualquer `prune`. **Migration longa: aplicar pelo SQL Editor**, o MCP corta em 60 s. Texto original: Fase 1 do módulo de
**Inadimplência e Cobranças** (documento 2 do Rodrigo Medeiros, 30/09/2026; decisões do usuário
em 12/10/2026: caminho B, perfis Supervisor e Cobrança, começar pela Fase 1). Cria os papéis
`supervisor`/`cobranca` + `supervisor_regionais`, `boletos_historico` (o histórico de boletos
do Mutual — tabela PRÓPRIA, nunca `titulos_financeiros`: lá contaria no DRE e travaria a 24h),
`cobranca_feriados`, meta/limite em `empresa`, a fonte única `cobranca_boletos_base` e as leituras
do painel; e **corrige `resumo_cobrancas`** (dividia o vencido pelo EMITIDO, incluindo o a vencer).
Nada de preço, fatura ou título muda. **Depois de aplicar:** deploy do contêiner →
`/integracao/mutual` → puxar **INVOICE** (captura atual é de 10/09) → seção *Histórico de
boletos* → importar. Medido em 12/10 com a captura velha: **77.884 boletos de mensalidade de
2.524 associados carregados** entram. Conferir: `select count(*) from pg_proc where proname like
'cobranca_%'` e o secdef sem `search_path` = 0. Ver a seção "INADIMPLÊNCIA E COBRANÇAS (0097)".
**🔴 DECISÃO DE 11/10/2026: depois de dezembro o Mutual é DESLIGADO de vez** — a integração é
migração com fim marcado, não conexão permanente. Ver "DECISÃO DO USUÁRIO (11/10/2026)" na seção
do Mutual: o que isso muda no desenho, o checklist pós-corte e o porquê do timeout da prévia.
**✅ A `0102_portal_regional_equipe` foi APLICADA e CONFERIDA em 13/10/2026** (`vendedores` com as
policies insert/update/select/delete, `vendedores_delete` = `is_admin()`, `regional_painel` devolvendo
`veiculos_carteira`). Texto original: ela fecha o buraco de
que o **gestor regional PODE APAGAR vendedor** (a policy `vendedores_write` é `for all`, e `for all`
inclui DELETE) e põe a CARTEIRA no painel da franquia, que mostrava a unidade de mil veículos com
cara de recém-aberta. Ver a seção própria.
**✅ A `0103_eventos_terceiros` foi APLICADA e CONFERIDA em 13/10/2026**: `evento_terceiros` com as 4
policies (update = `pode_tratar_evento`), FK composta `fk_terceiro_evento_associado`, os 4 triggers,
`possui_terceiros` + `evento_terceiro_id` nas 3 tabelas, categorias 3.1.04/3.1.05,
`fn_lanc_evento_favorecido` security definer, 0 secdef sem `search_path`, 0 RPCs nossas ao `anon`.
**Falta o deploy do contêiner** para as telas de terceiros aparecerem. **Próxima migration livre: `0104`.**
(Na mesma conferência a tabela `eventos_historico` da `0101` já existe em produção — a caixa da 0101
acima é anterior a isso; reconferir as funções dela antes de marcar como conferida.)
**⏱️ Teto do `authenticated` está em 20 s desde 11/10/2026 (temporário, migração).** Voltar a 8 s
no corte: `alter role authenticated set statement_timeout = '8s'; notify pgrst, 'reload config';`
**Próxima migration livre era `0088`.** As **`0001`..`0086`** estão aplicadas — a **`0086` foi rodada e
CONFERIDA em 05/10/2026**: o comentário de `mutual_planos_externos` diz 18/42 e 29/91 (sem "17" nem
"26"), a função segue `security definer` com `search_path=public`, fechada ao `anon`; 0 `security
definer` sem `search_path` e **0 RPCs nossas abertas ao `anon`**. (A primeira tentativa rodou num dos
OUTROS três projetos e deu `42883: function ... does not exist` — sem efeito. É o retrato exato do
"qual é o banco" abaixo: o erro foi o aviso.)
**Vínculos: 20** — entrou a equipe **22 → GRANDE NATAL** em 05/10/2026, pela tela.
As migrations **`0001`..`0084`** estão aplicadas em
produção — a **`0084` (a CARGA) foi rodada e CONFERIDA em 01/10/2026**: as 14 funções existem e o
rito da 0052 se manteve (0 RPCs nossas abertas ao `anon`; as 223 são de extensão, como documentado).
**A carga em si NÃO foi executada** — 9 veículos e 5 associados, nenhum com `cobranca_externa`.
As migrations **`0001`..`0083`** estavam aplicadas em produção — as `0001`..`0078` conferidas no próprio schema em 20/09/2026, a **`0079`..`0082` rodadas
pelo usuário em 20/09/2026** e a **`0083` conferida no banco em 21/09/2026** (as funções
`mutual_equipes_vendas`, `mutual_equipe_do_objeto` e `mutual_regional_do_objeto` existem).
**A `0084_carga_mutual` é NOVA** — é a carga da carteira, por unidade. Sem ela a seção
*Carga da carteira* de `/integracao/mutual` não abre (chama `mutual_carga_previa`).

> **🔴 A `0084` NÃO carrega nada por si.** Ela cria o instrumento; quem carrega é o botão na tela,
> por unidade e com confirmação. Rodar a migration é seguro e reversível — o risco começa no
> clique, e mesmo ali `mutual_desfazer_carga` é o caminho de volta.
> **O PILOTO DECIDIDO (30/09/2026): SMART CAR MATRIZ.** Medido em 01/10/2026, já pelas funções da
> 0084 em produção: dos 481 faturáveis, **473 entram** (431 associados) e **8 são recusados** — os
> 8 são os 0 km sem placa, e **só eles**. Zero CPF inválido, zero colisão, zero sem data de ativação.
>
> **⚠️ FALTAM DOIS CLIQUES ANTES DE CARREGAR** (nenhum dos dois bloqueia, mas os dois mudam o que
> a base vai dizer) — **reconferido em 01/10/2026, os dois continuam pendentes:**
> **`SALE_TEAM` tem ZERO linhas capturadas** (as 19 equipes aparecem com
> carteira e sem nome) e o **de-para do tipo de veículo não foi registrado** (ZERO vínculos de
> `VEHICLE_TYPE`) — são 3 decisões
> (`1`=390 carros · `2`=75 motos · `3`=14 caminhões, 2 sem tipo), na própria tela.
>
> **🔴 O DE-PARA DO PLANO deixou de ser impraticável — a `0085` está NO AR, e falta decidir.** Ele
> **não bloqueia a carga nem o boleto** (a carga carimba o valor que o Mutual cobra e o override
> vence), mas sem ele a ficha do SAC mostra cobertura incompleta. Medido em produção: **42 ids com
> carteira na matriz, e 18 deles cobrem 90%** dos 481 faturáveis — a tela diz onde parar.
> **Hoje há ZERO de-para de plano registrado.** Ver a seção da 0085.
> **⚠️ O QUE FALTA É O CONTÊINER, NÃO O BANCO.** A tela da `0083` (seção *Equipes de vendas*) só
> aparece depois do `docker compose up -d --build` com o commit da fase. Na build anterior a
> seção de unidades não renderiza nada — era o defeito que a `0082` corrigiu.
> **O agrupamento em si JÁ ESTÁ GRAVADO** (19 vínculos, 21/09/2026): ver a seção da `0083`.
> **A `0082_carga_mutual_preparacao` foi aplicada em 20/09/2026.** Ela é a preparação da
> carga do Mutual: a unidade passa a sair do **associado** (a corrente do consultor estava vazia),
> entra a tabela de vínculo e entra o **interruptor da cobrança**. Sem ela a tela
> `/integracao/mutual` quebra (chama `mutual_cobertura_unidade`) e a carga não tem como rodar sem
> emitir boleto para quem já paga no Mutual. **Próxima migration livre: `0083`.**
> Para reconferir a `0081` sem abrir o SQL Editor, o que importa é que o motor ficou INTACTO:
> `select (cotar_plano(50000, (select id from tipos_veiculo where nome ilike 'passeio%' limit 1))
>          ->>'valor_total_mensalidade')::numeric;` — tem de dar o MESMO valor de antes dela.
> E `select count(*) from regional_adicional_risco;` mostra quantos adicionais já foram cadastrados
> (zero logo depois de rodar: nenhuma unidade cobra a mais até alguém preencher a grade).
> Para reconferir a `0080` sem abrir o SQL Editor é uma linha:
> `select count(*) from cores;` — tem de vir **16** (as cores do CRLV).
> E `select cor, cor_id from veiculos where cor is not null;` mostra o texto já canonizado.
> Se precisar reconferir a `0079` sem abrir o SQL Editor, é uma linha:
> `select busca_texto, busca_digitos from leads limit 1;` — as duas colunas existem e vêm
> preenchidas.
> A `0077` (mudança de acesso) já passou: hoje há **0 usuários** em `cotador` e **0** em
> `sinistro`, então ninguém perdeu a Assistência 24h na virada.
> O backfill da `0078` não preencheu `data_saida` em ninguém, e isso está CERTO: não há nenhum
> veículo fora da base (`inativo`/`baixado`/`excluido`) para carimbar.

**3. COMO PUBLICAR.** Migrations primeiro (acima), depois o contêiner. **Desde 17/10/2026 a imagem
é compilada no GitHub Actions** (`.github/workflows/imagem.yml` → `ghcr.io/cadastrosmartcarbrasil-rgb/scar`,
tag = sha) e o VPS só baixa e troca (`scripts/atualizar-vps.sh`, espera a imagem do commit ficar pronta):
```bash
cd /opt/scar && git pull origin claude/claude-md-opcao-x-98kfj5 && bash scripts/atualizar-vps.sh
```
Configuração de uma vez (Variables do GitHub, `docker login ghcr.io`, DNS do daemon) em `DEPLOY.md` §2.0.
**✅ No ar desde 17/10/2026:** Variables cadastradas, `docker login ghcr.io` feito no VPS (token só
`read:packages`), primeiro deploy por imagem conferido pelo usuário (a compilação no GitHub leva ~3,5 min).
**Deploy pelo botão (20/10/2026):** Actions → **"Publicar em producao"** (`.github/workflows/publicar.yml`)
faz o mesmo `atualizar-vps.sh` por SSH, com uma chave presa ao `scripts/deploy-remoto.sh` (só atualiza).
Exige o branch padrão do GitHub = o de trabalho (o botão só aparece para workflow do branch PADRÃO), preparar o VPS uma vez (`scripts/preparar-deploy-github.sh`) e os Secrets `VPS_HOST`/`VPS_CHAVE_SSH`
— ver `DEPLOY.md`. Automático só com a Variable `DEPLOY_AUTOMATICO=true` (desligado).
**Plano B** (compilar no VPS, 10+ min), que continua funcionando:
```bash
cd /opt/scar && git pull origin claude/claude-md-opcao-x-98kfj5 \
  && DOCKER_BUILDKIT=0 docker compose up -d --build
```
O `git pull` roda **dentro do VPS**. O `DOCKER_BUILDKIT=0` **faz parte do comando** — sem ele o
build nem começa neste servidor. Runbook completo em `DEPLOY.md`.

### 🗄️ QUAL É O BANCO — o projeto Supabase certo, e como conferir
**`Scar Software` · ref `asinzcqbbqdglrguqtnr` · `db.asinzcqbbqdglrguqtnr.supabase.co` · sa-east-1.**

A conta tem **quatro** projetos e o nome não basta como prova — errar de banco é a versão pior do
erro de branch que já custou dois dias aqui. Os outros três (`SmartVida`, `Dashboard`,
`Smart Tracker`) **não têm nenhuma** das tabelas deste sistema; foi assim que este foi
identificado, e é assim que se confere de novo em uma consulta:

```sql
select count(*) from information_schema.tables
 where table_schema = 'public'
   and table_name in ('veiculos','leads','clientes','acionamentos_assistencia',
                      'rastreadores','mutual_captura','memos');   -- 7 aqui, 0 nos outros
```

**O repositório NÃO guarda o ref** (`supabase/config.toml` tem `project_id = "scar"`, que é o nome
do projeto LOCAL da CLI, não o remoto) e a env real (`NEXT_PUBLIC_SUPABASE_URL`) vive só no `.env`
do VPS — no repo é `xxxxxxxxxxxx`. Por isso o ref está escrito aqui: sem ele, a próxima sessão
adivinha entre quatro bancos de produção.

**Retrato da base em 20/09/2026** (serve para reconhecer o banco e para não confundir volume):
302.061 capturas do Mutual · 303 vendedores · 4 regionais · 18 leads · 9 veículos · 5 associados ·
8 usuários. **Os 9 veículos não são erro:** a carteira real ainda está no Mutual e a integração é
**Fase 1, só leitura** — nada foi importado para `clientes`/`veiculos` ainda.

#### ✅ DECISÃO DO USUÁRIO (10/10/2026) — substitui a de 20/09: CONSULTA livre, IMPLANTAÇÃO com autorização
*"As implantações podem ser feitas pelo Claude, o que é preciso que eu autorize; as consultas ficam
liberadas."* Está em `.claude/settings.json` + `.claude/hooks/supabase-sql-guard.sh` (commitados):
- **Consulta roda sem perguntar:** as ferramentas de leitura do MCP do Supabase (`list_tables`,
  `query_logs`, `get_advisors`…) estão em `allow`, e o `execute_sql` passa pelo hook, que libera
  quando o SQL é só leitura.
- **Implantação PERGUNTA, uma a uma:** o hook devolve `ask` para qualquer escrita/DDL, bloco `$$`,
  `SET`, e **SELECT que chama RPC com verbo de escrita** no nome (`mutual_executar_carga`,
  `vincular_externo`, `registrar_*`… — neste projeto quase toda ação é RPC, e
  `select vincular_externo(...)` grava sem conter INSERT). Na dúvida pergunta; nunca libera no
  escuro. Sem `jq`/`python3` o hook não responde e vale o fluxo normal (pergunta).
- **12/10/2026 — o hook passou a usar um tokenizador (python3) em vez de `sed`.** A versão
  anterior pedia autorização para leitura comum (alias em português entre aspas —
  `"dia do vencimento"` casava com o comando `DO` —, `EXPLAIN ANALYZE`, `gerar_dre`,
  `resolver_hotlink`) e **deixava passar duas escritas** (`select '--'; delete ...` e a RPC
  entre aspas `"mutual_executar_carga"(...)`). Funções STABLE com verbo no nome ficam numa
  lista liberada dentro do hook (Postgres proíbe escrita em função não-volátil) — ao recriar
  uma delas como VOLATILE, tirar de lá. **48 casos em `npm run test:hooks`**; mexeu no hook,
  acrescente o caso e rode.
- **O que ainda pergunta e só o usuário resolve:** o MODO da sessão. Abrir a sessão em
  **Auto** (seletor ao lado da caixa de mensagem); em "Accept edits" quase toda ferramenta
  que não é edição pergunta, com ou sem hook.
- **Migration se aplica pelo `execute_sql`, com o arquivo inteiro** — é o mesmo efeito do SQL
  Editor, e o usuário vê o SQL no pedido de autorização. Ritual inalterado: escrever →
  `npm run validate` → commit → **pedir** → aplicar → conferir no banco → atualizar a caixa de estado.
- **`apply_migration` está em `deny`, de propósito** (motivo abaixo). Não contornar.

#### (histórico) DECISÃO DE 20/09/2026: migration SÓ pelo SQL Editor
**O motivo continua valendo para o `apply_migration`:** `supabase_migrations.schema_migrations`
**NEM EXISTE** (conferido em 10/10/2026: `42P01 relation does not exist`) — as `0001`..`0095`
entraram pelo SQL Editor, que não registra nada ali. Aplicar a
próxima por ferramenta faria ela ser a **primeira linha** da tabela, e o banco passaria a dizer
que a história começa na `0079`, com setenta e oito migrations invisíveis. Um `db push` ou
`db reset` depois disso lê "só falta a 0079" — é a mesma família de erro do branch morto: um
registro que mente com confiança.

Consequência prática: o runbook do `DEPLOY.md` **não muda**. O agente pode escrever a migration,
validar no harness local (`npm run validate`) e te entregar o arquivo; **rodar é seu**, e é assim
que você vê cada DDL antes de ela tocar a produção.

**Se um dia quiser inverter** (passar a usar ferramenta), o passo obrigatório ANTES é preencher a
`schema_migrations` com as `0001`..`0078` como já aplicadas — senão a inconsistência acima nasce
no mesmo instante.

#### O que a varredura de segurança acusou — e por que 2 dos 4 não são problema
Conferido em 20/09/2026 (`get_advisors`, tipo `security`). **Nenhum aviso de RLS** — nada de
tabela exposta sem policy, que seria o grave num sistema cuja espinha é RLS.

| Aviso | Leitura |
|---|---|
| 200 `SECURITY DEFINER` chamáveis por `authenticated` | **É o desenho da `0052`**, não um furo: o `execute` foi concedido de propósito e a trava vive DENTRO de cada função (`is_staff() or auth.uid() is null`). O linter não tem como saber. |
| 96 funções sem `search_path` fixo | **As 96 são `SECURITY INVOKER`** (rodam com o privilégio de quem chama, então search_path mutável não escala nada). **As 200 `SECURITY DEFINER` têm `search_path` setado — todas.** A convenção se sustentou. |
| `pg_trgm` e `unaccent` no schema `public` | Pequeno, e **as duas passaram a ser USADAS na `0079`** (busca da Lista de vendas). Movê-las de schema hoje quebraria as colunas geradas de `leads` — não é uma limpeza de passagem. |
| Proteção contra senha vazada desligada | Toggle no painel (Auth), não SQL. Pesa mais aqui que em outro sistema: a senha de primeiro acesso do associado é o próprio CPF. |

A consulta que separa o barulho do sinal, para repetir depois de mexer em função:
```sql
select count(*) filter (where prosecdef)                        as secdef,
       count(*) filter (where prosecdef and proconfig is null)  as secdef_SEM_search_path
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prokind = 'f';   -- a segunda coluna tem de ser ZERO
```

**Depois de aplicar, ATUALIZE esta caixa** — uma lista de pendências desatualizada é pior que
nenhuma: manda rodar de novo o que já rodou.
- **A migration `0044` JÁ FOI APLICADA em produção** e o Portal do Associado está no ar,
  conferido pelo usuário. As migrations `0001`..`0044` estão todas aplicadas.
- **`0045_agenda_vendas`, `0046_vendas_duplicidade_aceite`, `0047_vistoria_anexo_peso`,
  `0048_assistencia_anexos` e `0049_rastreadores` são NOVAS e ainda NÃO foram aplicadas em
  produção** — rodar as cinco, nessa ordem, no SQL Editor do Supabase ANTES do
  `docker compose up -d --build`, senão a tela de vendas quebra (Kanban, agenda, aviso de
  duplicidade, aceite presencial e a aba de fotos chamam RPCs que só existem depois delas), os
  anexos da OS da 24h não têm onde gravar e a ficha do veículo quebra ao salvar o rastreador
  (as colunas `rastreador_imei`/`rastreador_chip`/`empresa_rastreamento_id` e a tabela
  `empresas_rastreamento` nascem na `0049`).
- **`0050_rastreadores_modulo` também é NOVA** — é o módulo de Rastreadores (parque de
  equipamentos por IMEI). Sem ela a tela `/rastreadores` não abre. Roda depois da `0049`.
- **`0056_memos_diretoria` é NOVA** — o mural ganha mão dupla (a franquia manda recado para a
  diretoria) e o mural pessoal deixa de despejar o aviso interno de toda unidade na matriz.
- **`0057_memos_autor_ve` é NOVA e CORRIGE a 0056** — quem publica um comunicado endereçado a
  UMA unidade (ou a um papel que não é o seu) não via o próprio aviso em tela nenhuma, e o
  sintoma era "publiquei e não apareceu". Roda depois da `0056`.
- **`0058_memos_respostas` é NOVA** — o comunicado vira CONVERSA: quem recebe devolve o recado
  por ali, e quem publicou responde de volta, uma conversa por destinatário.
- **`0059_protocolo_evento_pareceres` é NOVA** — a tramitação do evento/sinistro passa a ter
  destinatário de verdade (antes só trocava o status), usa a Central de Protocolos que já
  existia e ganha o pedido de PARECER a várias pessoas.
- **`0055_memos_comunicados` é NOVA** — o mural interno (`memos` + `memo_leituras`) que alimenta a
  **Central do Atendente** na tela do SAC. Sem ela, o SAC quebra ao abrir (a Central chama
  `memos_do_usuario`).
- **`0054_usuarios_protecao_admin` é NOVA** — a equipe passou a ser editável (papel, unidade,
  ativação e **redefinição de senha**) e o banco ganhou duas travas: ninguém se promove a admin na
  própria linha e o sistema não fica sem administrador ativo.
- **`0060_limpeza_atendimentos_orfaos` é NOVA e é CORRETIVA — rode-a ANTES da `0061`.**
  Uma sessão trabalhou no branch parado (o default morto abaixo) e aplicou em produção uma
  `0025_assistencia_24h` que **não pertence a esta linha**: ela montava a 24h em cima de
  `atendimentos`, sem saber que o módulo de verdade (`0026`) já existia. Nada foi destruído, mas
  ficaram 12 colunas mortas em `atendimentos`, um trigger inerte e 11 RPCs lendo fonte vazia.
  A `0060` desfaz tudo — **restaurando `abrir_atendimento` e `opcionais_elegibilidade` ANTES de
  dropar as colunas** (a versão substituída inseria nelas; dropar primeiro quebraria a abertura de
  protocolo no SAC). Em base limpa ela é no-op.
- **`0061_assistencia_painel` é NOVA** — o PAINEL GERENCIAL da 24h como aba da Visão Geral
  (ver seção própria). Só leitura, sobre `acionamentos_assistencia`. Sem ela a aba não abre.
- **`0062_integracao_mutual` é NOVA** — FASE 1 da integração com o Mutual (o sistema atual):
  espelho de leitura e diagnóstico. **Não escreve em `clientes`, `veiculos`, `titulos_financeiros`,
  `faturas` nem `eventos_sinistro`** — cria uma área de captura própria e devolve um relatório.
  Sem ela a tela `/integracao/mutual` não abre. Ver a seção própria.
- **`0063_mutual_diagnostico_faturavel` é NOVA e CORRIGE a `0062`** — a primeira leitura da base
  real mostrou que o diagnóstico contava bloqueio (valor, dia de vencimento, ativação) sobre
  **contrato encerrado**, onde a ausência é o esperado: 2.432 falsos CRÍTICOS afogavam os poucos
  verdadeiros. Agora o grupo `BLOQUEIO` conta **só sobre quem entraria faturável** (os três status
  de `veiculo_faturavel`, 0024) e o acervo inativo vira grupo informativo. Junto vieram
  `mutual_status_nao_mapeados()` (o enum do swagger **não é exaustivo**) e `/contract/` como
  entidade capturável — `due_day` e `regional` **não estão** no objeto do contrato.
- **`0064_mutual_dia_vencimento_contrato` é NOVA e CORRIGE outro falso alarme** — conferido na
  TELA do Mutual: o dia de vencimento **existe**, na *Configuração da cobrança* do CONTRATO
  ("Dia de vencimento da parcela"). O diagnóstico acusava centenas de "Faturável sem dia de
  vencimento" com o dado existindo, só noutro endpoint. Agora `due_day` e `regional` são
  resolvidos pelo `/contract/` (com o objeto como fallback) e, enquanto ninguém puxou os
  contratos, a tela **diz isso** em vez de acusar o dado. Junto veio `mutual_periodicidade()`,
  por causa do que a mesma tela revelou: contrato **Semestral, 6 parcelas, parcela R$ 120,
  total R$ 720** — `valor_mensalidade` (0024) é MENSAL, e importar o total cobraria 6× a mais.
- **`0065_mutual_inspecionar_campos` é NOVA** — a carga completa (17.611 objetos + 17.616
  contratos) respondeu a pergunta do valor e abriu outra. **`final_total_value` é a PARCELA**
  (semestral mediana R$ 164 × mensal R$ 204,50 — fosse o total, o semestral seria ~6×), então a
  carga grava direto em `valor_mensalidade`. **Mas a unidade não está em `regional` em lugar
  nenhum:** 3.527 de 3.527 faturáveis sem ela, com os contratos todos capturados. Em vez de
  chutar um terceiro lugar, entrou `mutual_campos(entidade, caminho)` — o inspetor que lista as
  chaves do payload, quantas vêm preenchidas e um exemplo.
- **`0066_mutual_indenizado_nao_fatura` é NOVA** — decisão do usuário: *"quem está em Indenizado,
  Indenização, Inativo/pago não vamos gerar mensalidades"*. Isso **muda o de-para**, porque
  `em_evento` **É faturável** (`veiculo_faturavel`, 0024): deixar `INDENIZADO` ali faria 26
  veículos já indenizados receberem boleto todo mês. Foram para `inativo`. **`SINISTRADO` continua
  `em_evento`** — sinistro em andamento é associado ativo, segue pagando. Junto, `mutual_por_status`
  parou de chamar vocabulário desconhecido de "funil de venda" (decisão tomada × decisão pendente).
- **`0067_regional_completa` é NOVA** — a unidade ganha contato (telefone/e-mail), endereço
  completo com busca por CEP e, sobretudo, **situação Ativa/Inativa**; e o banco passa a RECUSAR
  a exclusão de unidade com movimento (ver a seção própria). Sem ela a tela `/configuracoes/regionais`
  não abre (chama `regionais_listar`).
- **`0068_usuarios_ficha` é NOVA e é de SEGURANÇA, não cosmética** — o usuário ganha ficha
  (telefone, CPF, cargo, data de início/desligamento, observações) e, sobretudo, **`usuarios.ativo`
  passa a CORTAR O ACESSO DE VERDADE**: até aqui `is_staff()`/`auth_papel()` ignoravam o campo e
  desativar alguém não fazia nada (ver a seção própria). Sem ela a tela
  `/configuracoes/usuarios` não abre (chama `usuarios_listar`).
- **`0069_vendedores_importacao` é NOVA** — a carga da equipe de vendas por planilha
  (`Configurações → Vendedores → Importar planilha`). Ver a seção própria: as três decisões que
  moram no banco (todos entram INATIVOS, comissão zerada, nunca cria acesso) e a trava de que
  unidade em branco **não vira matriz**.
- **`0070_cotacao_troca_plano` é NOVA** — é o DOWNGRADE até a cobertura base na cotação, que a
  `0028` fazia em silêncio (plano nulo significava "mantém o que está", então "Somente cobertura
  base" salvava com o combo antigo). Ver "Troca de plano (upgrade / downgrade)".
- **`0071_mutual_status_do_objeto` é NOVA e CORRIGE duas leituras erradas** — (1) o status que
  mandava era o do **ASSOCIADO**: o contrato do Mutual guarda VÁRIOS veículos, então o associado
  fica ATIVO por causa de OUTRO carro enquanto AQUELE está encerrado, e o veículo morto entrava
  como faturável; (2) **veículo sem placa é 0 KM**, não dado sujo. As duas juntas esvaziam a
  quarentena. Ver a seção própria.
- **`0072_veiculo_inadimplente` é NOVA** — o status **`inadimplente`** do veículo: a TOLERÂNCIA
  entre "a mensalidade atrasou" e "o contrato acabou". Entra o estado, o **relógio**
  (`veiculos.status_desde`) e o **parâmetro** (`empresa.dias_tolerancia_inadimplencia`, 20) de que o
  CRON vai precisar. **A decisão que importa: inadimplente CONTINUA FATURÁVEL** — ver a seção
  própria. O CRON ainda não existe, então hoje ela é no-op.
- **`0073_mutual_consultor_regional` é NOVA** — o **instrumento que MEDE** a tese da unidade pelo
  consultor (`objeto.consultant` → consultor → vendedor importado → `regional_id`). Não carrega
  nada: conta quantos veículos sobrevivem a CADA um dos quatro saltos e nomeia quem se perde.
  Ver a seção própria.
- **`0074_mutual_consultor_sem_duplicar` é NOVA e é CORRETIVA da `0073`** — o funil que mede a
  unidade pelo consultor estava **contando o mesmo veículo várias vezes**: `vendedores.email` e
  `vendedores.nome` não são únicos (só `documento` é, 0069), então o `left join` multiplicava a
  linha do objeto e o `count(*)` do funil inflava. No cenário do teste: **16 onde existem 5.**
  Ver a seção própria.
- **`0075_veiculo_numero_motor` é NOVA** — a consulta por placa SEMPRE devolveu o registro do
  documento (chassi, cor, **número do motor**) e o nosso proxy descartava; corrigido o descarte,
  faltava onde gravar o motor. A coluna entra em `veiculos` **e** em `leads`, e
  `autorizar_entrada_lead` passa a carregá-la — ver "Consulta por placa" abaixo.
- **`0076_vistoria_link_publico`** (aplicada) — é a vistoria pelo CELULAR DO
  CLIENTE, a etapa que faltava depois do aceite no hotlink. Sem ela a rota `/vistoria/<token>` não
  abre e o aceite volta a terminar em "o consultor vai combinar a vistoria". Ver a seção própria.
- **`0077_papeis_cotador_sinistro` é NOVA e MUDA ACESSO** — aposenta o `cotador` e faz o
  `sinistro` governar o EVENTO (ver a seção própria). Não é cosmética: quem opera a 24h com papel
  `sinistro` **perde o acionamento**.
- **`0078_regionais_painel`** (aplicada) — o DASHBOARD EXECUTIVO DAS
  REGIONAIS (ver seção própria). Ela **mexe em estrutura**: cria `veiculos.data_saida` (a data do
  churn, que não existia) com trigger e backfill pelo `updated_at`, e duas colunas em `empresa`
  (o recorte do plano de contas). Sem ela a tela `/regionais` não abre.
- **`0079_busca_leads_sem_acento`** (aplicada em 20/09/2026) — liga o `unaccent` na busca da Lista
  de `/vendas` e, no mesmo movimento, conserta a busca por telefone. Ver a seção própria.
- **`0080_cores_veiculo`** (aplicada em 20/09/2026) — o CATÁLOGO DE CORES: `veiculos.cor` e
  `leads.cor` deixam de ser texto livre e passam por um vocabulário só. Ela **reescreveu dado
  existente** (backfill canonizando o que já estava gravado). Ver a seção própria.
- **`0081_adicional_risco_regional`** (aplicada em 20/09/2026) — o preço deixa de ser só nacional
  (ver a seção própria). Ela **derrubou e recriou `calcular_mensalidade` e `cotar_plano`** (overload
  seria ambíguo) e mexeu em `valor_mensalidade_veiculo`, `atualizar_cotacao` e
  `autorizar_entrada_lead`. **Nenhum preço mudou ao aplicá-la:** sem adicional cadastrado, o
  `p_regional_id` nulo devolve a matriz pura.
- **`0082_carga_mutual_preparacao`** (aplicada em 20/09/2026) — `integracao_vinculos`, o
  interruptor `cobranca_externa` e a unidade pelo associado. Ver a seção própria.
- **`0083_mutual_equipe_vendas`** (aplicada; conferida no banco em 21/09/2026) — o de-para muda de
  NÍVEL: a nossa `regionais` é a **equipe de vendas** do Mutual. Junto vai a correção de uma medição
  errada da 0082. **As 19 equipes já estão agrupadas nas 4 unidades** — ver a seção própria.
  **Próxima migration livre: `0084`.**
- **`0084_carga_mutual` é NOVA e é a PRIMEIRA que escreve em `clientes`/`veiculos`** — a carga da
  carteira do Mutual, por unidade, re-executável pelo vínculo (0082). Todo veículo entra com
  `cobranca_externa = true`, então nenhuma fatura é gerada. Ver a seção própria.
- **`.claude/hooks/session-start.sh` é NOVO** — avisa quando a sessão nasce no branch errado e
  instala as dependências. Ele **só roda se estiver no branch que a sessão clonou**; enquanto o
  default do GitHub for o branch morto, uma sessão que caia lá não terá o hook. A correção
  definitiva é trocar o branch padrão do repositório (decisão do usuário).
- **`0052_seguranca_rpc` e `0053_rastreador_ciclo_financeiro` são NOVAS** — a `0052` fecha a
  camada de RPC (ver "Segurança das RPCs" abaixo) e a `0053` liga o rastreador ao cadastro e ao
  financeiro. Rodam por último, depois da `0051`.
- **`0051_fornecedores_unificados` é NOVA e MEXE EM DADOS** — junta prestador da 24h, rastreadora
  e fornecedor de peças num cadastro só (`fornecedores`), **migra as linhas de
  `empresas_rastreamento`, reaponta as FKs de `veiculos`/`rastreadores` e APAGA a tabela
  paralela**. Rode-a depois da `0050`, na mesma janela — entre a `0049` e a `0051` a ficha do
  veículo aponta para uma tabela que vai deixar de existir.
- **A `0048` cria o bucket `assistencia`** — o SQL Editor cria o registro em `storage.buckets`;
  confira em *Storage* se ele aparece como **privado** depois de rodar.
- **A `0046` também FECHA UM BURACO DE SEGURANÇA:** `registrar_aceite_venda` era `security definer`
  concedida a `authenticated` **sem checar quem chama** — qualquer usuário logado (inclusive um
  associado do `/portal`) podia carimbar aceite em lead alheio. Agora, havendo sessão, exige
  `pode_tratar_lead()`; o hotlink público (service_role, sem sessão) segue igual.

### Os 4 portais (e as 2 páginas públicas)
| Portal | Link | Login | Quem entra |
|---|---|---|---|
| **Matriz** | `/dashboard` | `/login` | staff com cadastro em `usuarios` |
| **Franquia** | `/regional` | `/login` | `gestor_regional` COM regional definida (admin/financeiro p/ suporte) |
| **Vendedor** (PWA) | `/vendedor` | `/login` | cadastro ATIVO em `vendedores` ligado ao login |
| **Associado** | `/portal` | **`/portal/login`** | cadastro em `clientes` (login = CPF/CNPJ) |

Três dos quatro entram pela MESMA porta `/login`: o destino não é escolhido, é decidido pelo
cadastro. A regra vive em **`destinoAposLogin()` (`src/lib/acesso.ts`, testada)** e vai da MAIOR
responsabilidade para a menor: **acesso global (admin/financeiro) → `/dashboard`**; gestor COM
regional → `/regional`; `vendedor_atual()` → `/vendedor`; senão `/dashboard`.
Só o associado tem login próprio, porque a chave é o CPF.

> **A ordem é o conserto de um bug real.** Antes a pergunta "tem cadastro de vendedor?" vinha
> ANTES de "é da matriz?", então um **admin que também tem ficha em `vendedores`** (o dono que
> vende, o sócio que testa o hotlink) caía no portal do vendedor — e ficava preso, porque o
> `/vendedor` não tinha porta de volta, ao contrário do `/regional`. Agora quem administra a
> empresa entra na empresa, e o portal do vendedor segue acessível pela URL — do mesmo jeito que
> a matriz visita `/regional`. O `ShellVendedor` também ganhou o atalho de volta, por papel:
> **"Sistema da matriz"** (admin/financeiro) ou **"Portal da franquia"** (gestor regional).
> **O destino do login NÃO é controle de acesso** — quem decide o que cada um lê continua sendo a
> RLS e o `escopo_regional()`. Se alguém "não tem acesso a nada" no `/dashboard`, o problema é o
> **`usuarios.papel`**, não a rota: o acesso do vendedor é criado por
> `/api/v1/vendedores/acesso`, que provisiona o login com papel **`consultor_vendas`** — quem for
> promovido depois precisa ter o papel trocado em `Configurações → Usuários` (a trava da 0054
> impede promover a si mesmo).
Públicas, sem sessão: **`/v/<CODIGO>`** (hotlink de venda, vendedor ou franquia),
**`/cotacao/<token>`** (a proposta) e **`/vistoria/<token>`** (as fotos do carro pelo celular do
cliente — 0076, link com prazo).
**Todos os portais dividem a sessão do navegador** — logar como associado derruba a de staff;
para testar, aba anônima.

### Comandos que resolvem 90% da sessão
| Objetivo | Comando |
|---|---|
| Validar tudo antes de commitar | `npm run validate` (tipos → Vitest → migrations+testes de banco+schema → build) |
| Só os testes de banco | `npm run test:db` · um módulo: `npm run test:db -- 0043` |
| Regerar o `supabase/schema.sql` | `npm run schema` (rodar SEMPRE após criar/editar migration) |
| Publicar — **de dentro do VPS** (prompt `root@smartvida:~#`) | `cd /opt/scar && git pull origin claude/claude-md-opcao-x-98kfj5 && bash scripts/atualizar-vps.sh` (imagem pronta do GitHub; plano B: `DOCKER_BUILDKIT=0 docker compose up -d --build`) |
| Publicar — **do seu computador** (PowerShell/terminal local) | `.\scripts\deploy.ps1` ou `npm run deploy` (chamam o `atualizar-vps.sh` no VPS) |

**O `DOCKER_BUILDKIT=0` FAZ PARTE DO COMANDO — nao e contorno de emergencia.** O daemon do Docker
deste VPS resolve DNS pelo stub do `systemd-resolved`, que ja ficou "no ar e mudo": com o BuildKit
ligado o build para em `failed to resolve source metadata` ANTES de comecar, e perder tempo com isso
ja custou uma sessao inteira. Desligado, o builder classico usa a `node:20-alpine` do cache local e
passa. O nosso `Dockerfile` e generico (sem `# syntax=`, sem cache mount), entao **nada se perde**.
Nunca ensine o comando sem ele; o conserto definitivo do DNS esta em `DEPLOY.md`.

**O `git pull` roda DENTRO do VPS.** Os dois comandos acima fazem a mesma coisa; o que muda e de
onde voce digita. **Nao misture:** a versao com `ssh root@...` rodada DE DENTRO do servidor faz a
maquina tentar conectar nela mesma e falha; a versao sem `ssh` no PowerShell da
`fatal: not a git repository`, porque o projeto nao esta no seu computador.
As **migrations novas vão antes**, na ordem, pelo SQL Editor do Supabase. Runbook em `DEPLOY.md`;
o CI (`.github/workflows/ci.yml`) roda a mesma validação a cada push.

### A ROTA DA VENDA, ponta a ponta (é o coração desta fase)
```
hotlink /v/<CODIGO>            (vendedor OU franquia; codigo unico em vendedores/regionais)
   ↓ passo 1: contato          registrar_captura_hotlink -> aplica as REGRAS DE ATRIBUICAO (0041)
   |                            . CARTEIRA (ja e associado)  -> nasce com a ficha do associado copiada
   |                            . DUPLICADO (lead protegido) -> continua NO MESMO lead, dono nao muda
   |                            . REATIVACAO / NOVO          -> quem trouxe leva; link da unidade cai
   |                                                            no pool ou no rodizio
   |                            devolve `leads.token_publico` = capacidade das chamadas seguintes
   ↓ passo 2: veiculo          /api/v1/hotlink/veiculo — a PLACA puxa a FIPE na hora e o TIPO do
   |                            veiculo sai do registro da FIPE (o visitante so confirma)
   ↓ passo 3: planos           /api/v1/hotlink/cotar — um preco por plano ativo via `cotar_plano`
   ↓ passo 4: aceite           /api/v1/hotlink/contratar -> `registrar_aceite_venda` (0042/0043)
   |                            grava a prova (quem, CPF, data/hora, IP, user-agent, qual cotacao)
   |                            e deixa o lead em EM_NEGOCIACAO — NAO pula para a auditoria
   ↓ link da VISTORIA (0076)   /vistoria/<token> sai NO ACEITE — o cliente fotografa no celular
   |                            dele, 7 dias de prazo; a foto marca a origem e conta no checklist
   ↓ link da proposta          /cotacao/<token> sai pronto na tela (abrir, copiar, WhatsApp)
   ↓ trabalho do vendedor      ajusta opcionais, completa a ficha do associado, CRLV e a VISTORIA
   |                            guiada por poses (0040) — `/vendedor/leads/[id]` ou `<FechamentoVenda>`
   ↓ equipe manda p/ Auditoria APROVADO -> (trigger 0017) EM_AUDITORIA
   ↓ Auditoria efetiva         `autorizar_entrada_lead` (0034) — recusa listando o que falta;
   |                            cria/reaproveita o associado (acha pelo CPF) e cria o veiculo
   ↓ veiculo ativo             trigger do 0025 gera a PRIMEIRA COBRANCA
   ↓ comissao                  `fn_calcular_comissao` -> `repassar_comissao_vendedor` (0034/0037)
```

### O que foi entregue nesta fase (migrations 0032→0043)
| # | Entrega |
|---|---|
| `0032` | Financeiro/DRE nível gestão: regime **Caixa × Competência**, fluxo de caixa, aging, saldo em cache, `escopo_regional()` |
| `0033` | Removido o atalho `quitar_lancamento` — toda baixa passa pelo registro completo |
| `0034` | **Rota da venda completa**: comissão em dois níveis (vendedor nunca passa a franquia), ficha do lead, vistoria antes da base, `checklist_lead`, adesão |
| `0035` | Vendedor vira cadastro próprio (`usuario_id` OPCIONAL), código/hotlink, dados bancários, prazo de pagamento |
| `0036` | **Portal da Franquia** `/regional` — painel, equipe, leads, comissões (isolamento por `escopo_regional`) |
| `0037` | **Financeiro compacto da franquia** (só comissão) + correção de 3 funções quebradas pelo `usuario_id` opcional |
| `0038` | **Portal do Vendedor** `/vendedor` (PWA) — RPCs sem parâmetro de vendedor; RLS de `leads` fechada para o consultor |
| `0039` | O vendedor deixa de ver o teto de comissão da franquia |
| `0040` | **Vistoria por modelo de fotos** (6 poses obrigatórias) + `produtos_do_plano` (fim do item do combo vendido de novo) |
| `0041` | **Regras de atribuição do lead** — proteção, devolução ao pool, rodízio, carteira/duplicado |
| `0042` | **Aceite na página pública** + `leads.token_publico` |
| `0043` | A cotação não para para cliente da base nem para recaptura; o aceite não trava o vendedor |

### Depois da 0044 — trabalho de INTERFACE (sem migration)
| Commit | Entrega |
|---|---|
| `18c2cbb` | `0044` re-executável (`create trigger` não aceita `if not exists`) |
| `ad3028b` | a tela de login estava presa no guard do próprio portal — ver o gotcha |
| `cca2b92` | **tipografia escurecida** (escala `slate` própria; `text-slate-400` saiu de 2.56 para 5.35 de contraste), **cadastro em CAIXA ALTA** e endereço completo no perfil do associado |
| `a468ead` | **TEMA CLARO / ESCURO** em todo o sistema, com botão no cabeçalho dos 4 portais |

## PLANO DE CONTAS PADRÃO (0152) — DRE gerencial, balancete e fluxo evolutivo
Pedido do usuário (26/10/2026) com a planilha `Plano_de_Contas_e_Fluxo_Modelo.xlsx` (3 abas: Plano de Contas, Fluxo de
Caixa Modelo, DRE Gerencial Modelo). Decisões: **migrar** as contas antigas (recodificadas no lugar) e **acrescentar
analíticas da proteção** dentro dos grupos do plano.
- **O plano é `categorias_dre`** (todas as FKs já apontavam para ela). Hierarquia pelo CÓDIGO: a mãe é a conta existente
  de prefixo mais longo (`codigoPai`, `src/lib/plano-contas.ts`). **Sintética** só agrupa; **analítica** recebe
  lançamento. `natureza` decide onde aparece (ATIVO/PASSIVO/PATRIMONIO_LIQUIDO = balanço; RECEITA/DEDUCAO/CUSTO/DESPESA/
  RECEITA_FINANCEIRA/DESPESA_FINANCEIRA = DRE). O `tipo` antigo segue preenchido pela natureza (balanço = nulo).
- **De-para aplicado** (tela: Configurações → Plano de Contas → "Migração do plano anterior"): 1.1.00→3.1.1.01 ·
  1.1.01→3.1.1.03 Adesão · 1.2.01→3.1.1.02 · 1.2.02→4.3.1.01 · 1.2.03→3.1.1.04 Vistorias · 1.2.04→3.1.1.05 Rastreamento ·
  1.2.05→3.1.2.01 · 1.3.01→3.1.1.06 Comissão de Franquia · 1.4.00→3.1.1.07 Adiantamento 24h · 1.9.98→3.1.1.98 ·
  1.9.99→3.1.1.99 · 3.1.00→4.1.4.04 · 3.1.02→4.1.4.01 Assistência 24h · 3.1.03→4.1.4.05 · 3.1.04→4.1.4.02 Reparos de
  Eventos · 3.1.05→4.1.4.03 Indenizações · 3.2.01→4.1.2.01 · 3.2.02→4.1.3.01 · 3.2.03→4.3.2.01 · 4.1.01→4.2.2.02 ·
  4.1.02→4.2.1.01 · 4.1.03→4.2.1.04 · 4.1.04→4.2.2.03 · 4.1.05→4.2.1.03 · 4.2.01→4.2.3.02 · 4.2.02→4.2.1.06 ·
  4.3.01→4.2.1.07 · 4.9.99→4.2.1.99. **Código de conta fixo em função/tela: use o novo** (ex.: reparo de evento =
  `4.1.4.02`, comissão = `4.1.2.01`, mensalidade = `3.1.1.01`, sem conta = `3.1.1.99`/`4.2.1.99`).
- **Duplicidade**: antes de inserir, a conta é procurada pelo código ou pela descrição exata (sem caixa, acento e espaço
  duplo); a tela oferece "Abrir a existente" e o banco recusa (`fn_categoria_dre_plano`). Excluir conta com lançamento,
  em uso ou sintética com filhas é recusado.
- **Contas automáticas** (1.1.1.0x disponibilidades, 1.1.2.0x a receber, 2.1.1.01 fornecedores, 2.2.2.01 lucros
  acumulados) são alimentadas pelo sistema e não aceitam lançamento direto. Conta de balanço comum (imobilizado,
  empréstimo, capital) aceita lançamento e **fica fora da DRE** — vai ao balancete.
- **DRE** (aba DRE do Financeiro): estrutura da planilha (`montarDreGerencial`): receita bruta (por 3.1.1/3.1.2),
  deduções, receita líquida, custos, lucro bruto, despesas operacionais (4.2.1/4.2.2/4.2.3), resultado operacional
  (EBITDA), resultado financeiro, lucro líquido, % sobre a receita bruta e comparativo. Fonte: `gerar_dre_completo`.
- **Balancete** (aba Balancete, matriz + `financeiro_dre.ver`): `balancete_verificacao(inicio, fim)` por analítica,
  sintéticas somadas na tela. O sistema não é de partidas dobradas: `balancete_partidas` DERIVA as partidas (título a
  receber D 1.1.2.01 C receita; a pagar D despesa C 2.1.1.01; baixa contra a disponibilidade da classe da conta; juros
  e descontos para 4.3.x/3.2.1.02; títulos do SCar; avulsas contra o caixa; transferências; saldo inicial contra
  2.2.2.01; movimento até `saldo_inicial_em` vai para 2.2.2.01, para a disponibilidade bater com a tesouraria). Fecha
  por construção (há teste). Mensalidades do Mutual em aberto NÃO entram (só o recebido, que já é lançamento).
- **Disponibilidades por conta (0153):** 1.1.1.01 Caixas · 1.1.1.02 Bancos Conta Corrente · 1.1.1.03 Aplicações ·
  1.1.1.04 Outras Disponibilidades são SINTÉTICAS; cada conta bancária tem a sua analítica automática no grupo da classe
  (`contas_bancarias.conta_contabil_id`, ex.: 1.1.1.02.01 SICREDI), criada/renomeada/recodificada/inativada por trigger
  (`sincronizar_conta_contabil_banco`) e apagada junto com a conta. Nome que colide no plano ganha " (conta bancaria)".
  O balancete usa `codigo_contabil_banco(conta)`; baixa antiga sem conta vai para 1.1.1.99. No Fluxo Evolutivo cada conta
  aparece abaixo da sua classe; em Configurações → Contas Bancárias o cartão mostra o código.
- **Fluxo Evolutivo** (aba nova, matriz/operador): `fluxo_caixa_evolutivo` (sobre `tesouraria_movimentos`, só o
  realizado) + `montarFluxoEvolutivo`: colunas diárias, SALDOS INICIAIS por classe (`contas_bancarias.classe_fluxo`:
  CONTA_CORRENTE/INVESTIMENTO/DINHEIRO/OUTROS, editável em Configurações → Contas Bancárias), TOTAIS SALDOS, ENTRADAS e
  SAÍDAS por conta do plano, resultado do dia/acumulado e saldo final; transferência só move saldo entre classes.

## API EXTERNA (0151) — integração com outros sistemas (a 1ª: a rastreadora)
Pedido do usuário (25/10/2026): "criar a API do software para integrar com outros sistemas; a primeira será com um
software de rastreador, que fará o cruzamento das informações". **Leia `docs/modulos/api-externa.md` antes de mexer.**
- **Base:** `/api/externa/v1` (em `PUBLIC_PATHS`: autentica por CHAVE, nunca por sessão). **Documentação para o parceiro
  (28/10/2026):** `/api/externa/v1/docs` (página HTML), `docs.md`, `postman.json` e `openapi.json` (com exemplos), todos
  gerados do catálogo `src/lib/api-externa-doc.ts` + `src/lib/api-externa-openapi.ts` — rota ou campo novo: mude OS DOIS
  (teste confere rotas, erros e `$ref`). É o link `/docs` que se manda ao parceiro, não o `openapi.json` cru (a New Tracker
  recebeu só ele e respondeu que "faltavam os endpoints"). Botões em Configurações → API e Integrações.
- **Rotas:** `GET /status` · `GET /veiculos` (cursor, `atualizados_desde`, placa/chassi/imei/situacao) ·
  `GET /veiculos/{placa|chassi|id}` · `GET /rastreadores` · `POST /rastreadores/comunicacao` (até 500).
- **Chave:** Configurações → **API e Integrações** (`/configuracoes/api`, só admin — não entra na grade de permissões).
  Nasce em `/api/v1/api-integracoes` (Node `randomBytes`), vai ao banco só como SHA-256, aparece UMA vez. Escopos
  (`veiculos:ler`, `associados:ler` = dado pessoal, `rastreadores:ler`, `rastreadores:escrever`), unidades, IPs,
  validade, pausar (ativo) e revogar (definitivo, motivo). Ligada a uma rastreadora (fornecedor) vê/atualiza só os
  equipamentos dela.
- **`rotaApi(escopo, handler)`** (`src/lib/api-externa-server.ts`): toda rota nova da API externa passa por ele — chave,
  hash em tempo constante, situação, IP, escopo, 120 req/min por chave, 20 chaves erradas por IP em 10 min, trilha em
  `api_requisicoes`. As RPCs conferem de novo (`api_exigir`) e só rodam sem sessão.
- **`situacao_rastreamento`** (o que a plataforma faz): ATIVO (ativo/em_evento/vistoria_pendente) · SUSPENSO
  (inadimplente/suspenso) · ENCERRADO (o resto). SQL `api_situacao_rastreamento` = TS `situacaoRastreamento`.
- **Sincronia incremental** por `alterado_em` = max(veículo, associado). A comunicação da rastreadora grava
  `rastreadores.ultima_comunicacao/ultima_posicao` e NÃO mexe no veículo (o espelho da 0050 foi corrigido para não
  regravar a ficha sem mudança — senão a frota toda "mudaria" a cada minuto).
- **Cadastro do parque pela API (0165, 31/10/2026):** `POST /rastreadores` (`rastreadores:escrever`, até 500) →
  `api_cadastrar_rastreadores`: cria/completa por IMEI em nome da rastreadora da chave e instala com placa/chassi/
  veiculo_id. Caso real: a New Tracker leu os veículos 181 vezes e a tela ficou vazia (parque com 0 equipamentos).
- **Não feito:** webhook de saída (o SCar avisar a mudança), desinstalar/baixar pela API, limpeza da trilha.

### Estado de validação (fim da fase)
- **Migrations `0001`..`0164`** + `schema.sql` consolidado aplicam limpos no harness local.
- **139 suites** em `supabase/tests/*.test.sql` — todas passando.
- **Vitest: 1326 testes**, `npx tsc --noEmit` limpo e build OK.

### Pendências conhecidas (decisões, não bugs)
- **Logo oficial:** subir o arquivo em `Configurações → Empresa`. Os portais e páginas públicas
  leem `empresa.logo_url`; `public/logo-smartcar.svg` é só o fallback desenhado.
  **✅ LOGO OFICIAL EM TODAS AS ENTRADAS (15/10/2026):** `logoOficial()` (`src/lib/marca-server.ts`)
  lê `empresa.logo_url` pelo service_role — a policy `empresa_select` é `is_staff()`, então antes do
  login a sessão não lê a empresa e a tela caía no SVG de reserva (`/portal/login` com `url={null}`
  fixo, `/login` sem logo nenhuma). As duas telas de login viraram **page.tsx server** (busca a logo,
  `force-dynamic`) + formulário client ao lado (`login-staff.tsx`, `login-associado.tsx`) — o
  `/portal/login` continua FORA de `(associado)`, então o `ƒ` no build é o `force-dynamic`, não o
  gotcha do layout. `/vendedor` e `/regional` também passaram a usar o helper. **Página nova com
  logo: use `logoOficial()`, não `from('empresa')` pela sessão.** **Ícone do app instalado e favicon (15/10/2026):** rota `/icones/<32|180|192|512>.png`
  (`src/app/icones/[arquivo]/route.tsx`, regras em `src/lib/icone-app.ts`, testado) gera o PNG
  quadrado da logo oficial com margem branca (zona segura do ícone mascarável); manifesto e
  `layout.tsx` apontam para ela. Termina em `.png` para o middleware deixar passar sem sessão, e
  `/manifest.webmanifest` entrou nas rotas públicas (antes era redirecionado ao login). Trocar a
  logo em Configurações → Empresa troca o ícone (cache de 1 h; o app já instalado pode precisar
  ser reinstalado). O SVG de reserva ainda é o desenho antigo.
- **SICREDI (API Cobrança) — adaptador pronto, SANDBOX primeiro (13/10/2026).** Decisão do usuário:
  Sicredi para boleto/PIX, Asaas para cartão. `src/lib/pagamentos/sicredi.ts` (testado em
  `sicredi.test.ts`, `fetch` falso): token password-grant com cache e refresh, cadastro
  `tipoCobranca: HIBRIDO` (boleto + PIX), consulta, baixa, PDF e `liquidados/dia`. **Credenciais
  só nas `SICREDI_*` do servidor** (`.env` do VPS + `docker-compose.yml`, ver `.env.example`),
  nunca em `integracoes_bancarias`. Bancada de teste em **Configurações → Integrações bancárias**
  (rota `/api/v1/sicredi`, admin/financeiro): testar token, registrar boleto FICTÍCIO no sandbox,
  consultar, PDF, pagos do dia — nada grava em `titulos_financeiros`. **✅ 13/10/2026: autenticação e boleto de
  teste FUNCIONANDO no sandbox** — o formato real do cadastro (`nossoNumero`, `linhaDigitavel`,
  `qrCode`, `txid`, `codigoBarras`) está guardado em `sicredi.test.ts`; **✅ EMISSÃO PONTA A PONTA PELA REMESSA validada no sandbox em 13/10/2026** (título de teste do associado fictício TESTE SICREDI SANDBOX, CPF 35169335695: remessa CONCLUIDA, título com nosso número, linha, PIX e `gateway_status` REGISTRADO; os 7 títulos reais seguiram intocados). Para testar um título só: bancada → *Emitir título* (manda `titulo_ids`; o botão de lote de `/cobrancas/boletos` leva a fila inteira); o sandbox é MOCK fixo
  (sempre o mesmo nosso número, linha de R$ 0,50). **O sandbox só aceita os dados de TESTE da
  coleção** (usuário `123456789`, senha `teste123`, coop. `6789`, posto `03`, benef. `12345`) com a
  x-api-key do app; os dados reais da conta valem só em produção (ainda não testada). Ler o `.env`
  com `. .env` no shell quebra a chave — para testar por curl, pegue os valores com
  `docker compose exec -T app printenv`. **✅ O Sicredi TEM webhook de boleto** (a coleção
  geral não traz; está na coleção "Webhook", recebida em 13/10/2026 — o arquivo do usuário tem
  credenciais, NÃO commitar): um CONTRATO por beneficiário (`POST .../webhook/contrato/`, `PUT
  .../contrato/{id}`, `GET .../contratos/?cooperativa=&posto=&beneficiario=`; o caminho MUDA entre
  sandbox e produção — `caminhosWebhookSicredi`), evento `LIQUIDACAO`. Ver a seção "WEBHOOK DO
  SICREDI" logo abaixo. **A remessa usa o Sicredi desde a `0104`** (só o valor `SICREDI` no enum
  `provedor_banco`): cadastrar em Configurações → Integrações bancárias o provedor SICREDI como
  **padrão** (sem chave na tabela — a tela esconde os campos). `escolherIntegracao` (testada) pega a
  padrão da UNIDADE e, na falta, a GLOBAL — a rota antiga usava `maybeSingle()` e, com duas padrão,
  caía no MOCK calada. O gateway é resolvido ANTES de criar a remessa, e cadastro × `SICREDI_AMBIENTE`
  divergentes RECUSAM a emissão. Carteira com `cobranca_externa` não gera título, então nada sai
  para o banco até o cutover da unidade. Pagador sem endereço completo (CEP, logradouro,
  cidade, UF) é recusado antes de ir ao banco, por título. `seuNumero` (máx. 10) = 10 primeiros hex
  do UUID; a correlação forte é o `nosso_numero` devolvido.
- **✅ 18/10/2026: o contrato de webhook do Sicredi APONTA PARA O SCar** (o Sicredi confirmou: um contrato por
  beneficiário; substituído pela bancada, mesmo `idContrato` 67f3d103…, `acao: alterado`). Conferido pela consulta: url nossa, ATIVO, evento `LIQUIDACAO`, responsável Paulo Borges.
  Na resposta do PUT o Sicredi expande `LIQUIDACAO` nos eventos: `LIQUIDACAO_PIX`, `LIQUIDACAO_COMPE_H5/H6/H8`, `LIQUIDACAO_REDE`, `LIQUIDACAO_CARTORIO`,
  `AVISO_PAGAMENTO_COMPE` (pode chegar antes da liquidação: vira NAO_CONFIRMADO e o agendador pega) e
  `ESTORNO_LIQUIDACAO_REDE` (**logado e ignorado** — tratar quando o formato real aparecer). **✅ 1º aviso REAL recebido em 18/10/2026** (PIX de R$ 1,00,
  nosso número 261000090, guardado em `sicredi.test.ts`): datas vêm como LISTA Java (`dataEvento: [2026,10,18,8,27,…]`,
  `dataPrevisaoPagamento: [2026,10,19]`) — `dataIsoDeSicredi` lê as duas formas. O pagamento NÃO estava ainda em
  `liquidados/dia` (ontem/hoje) e ficou NAO_CONFIRMADO; a confirmação passou a incluir o dia da previsão do crédito
  quando ele já chegou, e o agendador pega no dia seguinte. Os boletos do Mutual dão baixa aqui (0117).
- **(histórico) 🔴 O CONTRATO DE WEBHOOK DO BENEFICIÁRIO É DO MUTUAL (conferido em produção, 13/10/2026).** O
  contrato é UM por beneficiário e o que existe aponta para `webhook.mutualignit.com.br` (responsável
  da mutualtech). Registrar o nosso por PUT TROCARIA o destino e derrubaria a baixa do Mutual, que
  emite os boletos até dezembro. Por isso `webhook_registrar` agora **recusa com 409** quando o
  contrato existente não aponta para a nossa rota (`webhookEhNosso`), e também quando a consulta
  falha. Substituir só com `substituir: true` (a bancada pede confirmação) — **no corte**, ou se o
  Sicredi confirmar que aceita mais de um contrato/URL. Até lá a baixa dos nossos boletos é o cron
  (`liquidados/dia`). O 422 "Falha na busca do beneficiário" era `SICREDI_POSTO` errado no `.env`
  (o certo é 39).
- **WEBHOOK DO SICREDI (13/10/2026) — a baixa na hora, o agendador vira rede de segurança.**
  Rota `/api/v1/sicredi/webhook/<SICREDI_WEBHOOK_SECRET>` (pública, sem sessão; segredo errado = 404;
  env nova no `.env` do VPS + compose, mín. 32 caracteres). **O Sicredi não assina o aviso, então o
  corpo NÃO é confiado:** ele só diz QUAL nosso número olhar (`avisosDoWebhook`, nomes candidatos);
  a rota confirma em `liquidados/dia` (data do aviso + ontem + hoje, `diasParaConfirmar`) e só então
  chama a MESMA `registrar_liquidacao_banco` do agendador (`registrarLiquidacoesSicredi`,
  `src/lib/pagamentos/baixa-sicredi.ts`). Não achou na lista = `NAO_CONFIRMADO` e o cron pega
  depois. Responde 200 sempre que o segredo confere (para o banco não reenviar em laço).
  **Desde a 0122 o NAO_CONFIRMADO é gravado** em `cobranca_avisos_banco` e o agendador o reconfere
  (do aviso até hoje), em vez de reler só ontem/hoje — pagamento de fim de semana não fica mais sem baixa. **Estorno
  NÃO é tratado** (o contrato assina só LIQUIDACAO; se vier, é logado e ignorado). O formato real
  do aviso ainda não foi visto: a rota loga o corpo (`docker compose logs app | grep
  sicredi-webhook`) — guardar o primeiro real em `sicredi.test.ts`. Registrar/consultar o contrato:
  bancada → *Webhook de liquidação* (URL montada a partir do host público, segredo mascarado na
  resposta; se já existe contrato, altera por PUT). No sandbox a coleção usa outro beneficiário
  (0101/19/79129) e outra x-api-key — o contrato de teste pode ser recusado com os dados de teste
  da cobrança. **Conferido em 13/10/2026: no sandbox o gateway responde `404 ... without destination`** em
  `/sb/cobranca/webhook/v1/api/contratos/` — a rota existe no gateway do Sicredi mas não tem serviço
  atrás para o nosso app. Não é defeito nosso; o contrato de webhook se registra **em produção**.
- **Gateway bancário mockado:** `MockGateway` gera linha digitável/PIX fictícios. Ligar o real =
  `AsaasGateway.emitir` (esqueleto pronto) + webhook chamando `registrar_retorno_cobranca`.
- **`/api/boletos/emitir-lote` é a rotina ANTIGA** (mock) — usar `/api/v1/cobrancas/*`. Pode sair.
- **Cadastros que nascem em R$ 0 / 0%:** opcionais novos (Configurações → Produtos), desconto
  máximo por regional (Configurações → Regionais). Hoje nenhum desconto passa sem alçada.
- **`RESEND_API_KEY` não configurada no VPS** — boas-vindas ao vendedor e voucher da 24h não
  enviam e-mail (o sistema avisa e devolve o texto, não finge que enviou).
- **`PLACAFIPE_TOKEN`:** sem ele a página pública cai no valor informado pelo visitante.
- **`PLACA_API_URL`/`PLACA_API_KEY` NUNCA foram configuradas** — é o provedor de placa OPCIONAL,
  outro serviço, lido por `/api/placa`. Sem a env a rota devolve `found: false` sem sair para a
  rede. Hoje **não falta nada por causa disso**: chassi, cor, ano de fabricação e número do motor
  vêm da própria Placa Fipe (ver "Consulta por placa"). Ela só acrescentaria dado de registro que a
  Placa Fipe não traz.
- **Dedução do tipo de veículo pela FIPE** (`tipoVeiculoSugerido`) foi escrita sem ver um retorno
  real da API — confirmar com uma placa de moto e ajustar o mapeamento se preciso.
- **Devolução de lead parado ao pool é MANUAL** (botão em `/regional/leads`); para rodar sozinha
  precisa de agendamento no Supabase.
- **Ícone do PWA** é o SVG da marca; para Android/iOS decentes, gerar PNGs 192/512.
- **MULTI-EMPRESA (white-label) — pedido do usuário, deixado para o fim.** O software vai ser
  usado por outras associações, cada uma com logomarca e paleta próprias. Hoje só a **logo** já é
  parametrizada (`empresa.logo_url`, lida por todos os portais); **a cor não** — o navy e o ciano
  estão fixos em `tailwind.config.ts`, que é build-time e por isso não dá para trocar por cliente
  sem republicar. O caminho quando for a hora: mover a paleta para **CSS custom properties** em
  `globals.css` (`--brand-600`, `--cyan-500`…), apontar o Tailwind para elas
  (`brand: { 600: 'rgb(var(--brand-600) / <alpha-value>)' }`), guardar as cores em `empresa`
  (junto da logo) e injetar um `<style>` com os valores no layout raiz — aí trocar a marca vira
  cadastro, não deploy. Isso é o mesmo movimento que a logo já fez. Enquanto não acontece, **não
  espalhe hex cru pelas telas**: use sempre os tokens `brand-*`/`cyan-*`, senão a migração vira
  uma caçada. Falta decidir também se a paleta é por **empresa** (uma instalação por cliente) ou
  por **regional** (uma instalação, várias marcas) — muda o desenho da tabela.

### TELA DE VENDAS — o que mudou nesta sessão (leia antes de mexer de novo)
Três frentes entregues, na ordem em que o usuário pediu:

**1. `/vendas/novo` virou cotação comparativa, na ordem da conversa.**
A tela começa na **PLACA** (campo grande, `autoFocus`): assim que ela fica completa
(`placaCompleta`), a FIPE é consultada sozinha e o **tipo de veículo vem deduzido**
(`tipoVeiculoSugerido`, o mesmo do hotlink — o vendedor só confirma). Com FIPE + tipo, o hook
**`useCotacaoComparativa`** cota **todos os planos ativos de uma vez** (mais a "Cobertura base"),
mostra os cards lado a lado com o do meio marcado como *sugerido*, e **marcar/desmarcar um
adicional recotiza tudo** — o botão "Calcular mensalidade" acabou, e com ele o buraco de gerar
proposta sem nunca ter visto o valor. Nome/celular ficaram por último, na seção 3.
*Cuidado:* o comparativo filtra, por plano, os avulsos que aquele combo já inclui — quem mexer no
hook tem de manter esse filtro, senão o cliente paga duas vezes pelo mesmo item.

**2. Agenda de vendas (migration `0045`).** O CRM agora guarda o TRABALHO, não só a fase:
`lead_interacoes` (tipo, resultado, observação, retorno combinado, autor) + as colunas
`leads.proximo_contato_em/proximo_contato_nota`, gravadas por `registrar_interacao_lead()`.
`agenda_vendas()` devolve a fila do dia e `leads_kanban()` foi recriada devolvendo `dias_parado` e
o `limite_sem_contato` da franquia — o card avisa que o lead vai voltar ao pool (regra do 0041)
**antes** de perdê-lo. "Parado" conta da **última interação**, nunca de `updated_at`: corrigir a
FIPE não é trabalhar o lead.

**3. `/vendas/[id]`: um caminho só e a ficha com espaço.** Os botões de status saíram do improviso
e vêm de **`acoesDoLead()`** (`crm.ts`), que espelha `mover_lead_status` — acabaram os dois botões
para a mesma coisa, *Em Negociação* passou a ser alcançável pela ficha (antes só arrastando) e
**Perdido exige motivo** pelo `<ModalPerda>`, o mesmo do Kanban (antes a ficha gravava o texto
fixo "Marcado como perdido"). A página foi de `max-w-2xl` para `max-w-5xl`, que é o que o
`<FechamentoVenda>` precisava para o checklist de 360px caber ao lado do formulário.

| Onde | Arquivo | O que é |
|---|---|---|
| `/vendas` | `src/app/(dashboard)/vendas/page.tsx` | lista/esteira; alterna **Kanban ↔ Lista** (`localStorage`) |
| ↳ agenda | `src/components/vendas/agenda-hoje.tsx` | **o que fazer agora**: atrasados + retornos de hoje (some quando vazia) |
| ↳ Kanban | `src/components/vendas/kanban-vendas.tsx` | colunas por etapa; card mostra retorno e "parado há N dias" |
| `/vendas/novo` | `src/app/(dashboard)/vendas/novo/page.tsx` | só embrulha o componente abaixo |
| ↳ captura | `src/components/vendas/novo-lead-cotacao.tsx` | **compartilhado com `/vendedor/leads/novo`** — mudar aqui muda os dois |
| `/vendas/[id]` | `src/app/(dashboard)/vendas/[id]/page.tsx` | ficha do lead: contatos, cotação, aceite, fechamento |
| ↳ contatos | `src/components/vendas/contatos-lead.tsx` | registra contato + retorno; linha do tempo (contatos **e** mudanças de etapa) |
| ↳ perda | `src/components/vendas/modal-perda.tsx` | motivo obrigatório — usado pela ficha E pelo Kanban |
| ↳ aceite | `src/components/vendas/aceite-presencial.tsx` | aceite com o cliente na frente (CRM **e** portal do vendedor) |
| ↳ cotação | `src/components/vendas/editar-cotacao.tsx` | troca FIPE/plano/opcionais e o desconto com alçada |
| ↳ fechamento | `src/components/vendas/fechamento-venda.tsx` | associado, veículo, documentos/vistoria, adesão |
| ↳ checklist | `src/components/vendas/checklist-entrada.tsx` | lê a MESMA `checklist_lead()` do banco |
| ↳ vistoria | `src/components/vistoria/fotos-vistoria.tsx` | poses, miniaturas e o visor em tela cheia |
| ↳ CRLV | `src/components/vendas/leitor-crlv.tsx` | QR do CRLV-e por câmera/imagem |

- **Estado e regras:** hook `use-vendas.ts`; lógica pura em `src/lib/crm.ts` (esteira, ações,
  itens obrigatórios, desconto), `src/lib/agenda.ts` (dias parado, situação do retorno, ordenação
  da fila) e `src/lib/vendas.ts` (comissão, adesão) — **todos com testes; mexeu na regra, ajuste o
  teste**.
- **Estado e regras (2):** `src/lib/imagem.ts` cuida do peso da foto (redução no navegador) e
  `src/lib/vendas.ts` das abas do fechamento — os dois com testes.
- **RPCs que a tela usa:** `leads_kanban`, `mover_lead_status`, `registrar_interacao_lead`,
  `agenda_vendas`, `classificar_captura_no_escopo`, `registrar_aceite_venda`,
  `atualizar_cotacao`, `cotar_plano`, `produtos_do_plano`,
  `produtos_obrigatorios_cotacao`, `simular_desconto_cotacao`, `checklist_lead`,
  `fotos_vistoria_lead`, `autorizar_entrada_lead`.
- **Antes de mexer no visual:** o sistema tem tema claro e escuro. Use os tokens
  (`bg-superficie`, `bg-fundo`, `bg-acao`, `text-slate-*`) e **nunca hex cru**.

**Segunda rodada (busca, duplicidade e aceite — migration `0046`):**

**4. Achar o lead, e não baixar a base.** `/vendas` ganhou **uma barra de busca só** (nome, CPF/CNPJ,
placa ou telefone) e o **filtro por consultor**, valendo para as duas visões. `useLeads` deixou de
trazer a tabela inteira: vem em páginas de 100 com "Carregar mais" e o rodapé diz quantos estão em
tela. As duas visões filtram de formas diferentes **de propósito** — a Lista busca no banco
(`filtroBuscaLeads`, um `or` do PostgREST com os caracteres perigosos neutralizados), o Kanban
filtra o que já está na tela (`leadCasaComBusca`, que responde a cada tecla e ignora acento). O
dono do lead vai para o banco nos dois casos (`leads_kanban` já aceitava `p_consultor_id`).

**5. Aviso de duplicidade no CRM.** `/vendas/novo` ganhou o campo **CPF/CNPJ** e passou a chamar
`classificar_captura_no_escopo` assim que há o que procurar (placa completa, celular com DDD ou
documento inteiro). O banner diz *"já está em atendimento com Fulano"*, *"já é associada"* ou
*"houve um atendimento antes"* — e **não trava nada**: quem está com o cliente na linha continua
cotando (mesma escolha do 0043). A RPC nova **não tem parâmetro de regional** (a antiga tem, e com
o id da franquia vizinha contava os leads e os vendedores de lá); a unidade sai de `escopo_regional()`.
Ela devolve `pode_abrir`, então o link "abrir o atendimento que já existe" só aparece quando o lead
é mesmo visível para quem está olhando. Como a tela é compartilhada, o portal do vendedor ganhou junto.

**6. Aceite presencial e a proposta no WhatsApp.** `<AceitePresencial>` grava
`registrar_aceite_venda(p_por := 'VENDEDOR')` com o cliente na frente — nome completo, CPF/CNPJ e a
declaração do vendedor; sem depender do celular do cliente. O IP **não** é gravado nesse caminho
(seria o do vendedor, e passaria por prova do cliente). Está no CRM e no portal do vendedor, que é
onde a venda presencial acontece. O card da cotação também ganhou **WhatsApp** mandando o link
direto para o número do lead (`mensagemDaProposta` + `linkWhatsApp`), e o `<LinkDaProposta>` passou
a aceitar destinatário. **Junto veio a trava que faltava:** ver a nota de segurança da `0046` no
topo deste arquivo.

**Terceira rodada (a ficha em abas e a foto que a Auditoria precisa ver — migration `0047`):**

**7. As fotos da vistoria agora APARECEM.** O problema não era o arquivo: ele sempre foi para o
bucket privado `vendas` e a policy de storage já libera qualquer staff. O que faltava era a
**miniatura** — a tela só tinha um botão "Ver" que abria uma aba por foto, então conferir uma
vistoria eram dez abas. Agora cada pose mostra a imagem, com **data do envio e peso**, e o clique
abre um **visor em tela cheia** (setas, `Esc`, "abrir original"). Miniatura que não carrega diz
isso em vermelho, em vez de fingir que está tudo certo. As URLs assinadas vêm **em lote**
(`useUrlsAssinadasVendas`, `createSignedUrls`, 10 min) — uma chamada, não uma por foto.

**8. Foto pesada é reduzida no navegador, antes de subir.** `src/lib/imagem.ts` (testado):
`comprimirImagem` redimensiona para no máximo **1600px** no maior lado e recodifica em **JPEG**
(qualidade 0,82; segunda passada em 0,65 se ainda passar de ~1,5 MB). Formato que o navegador não
decodifica (HEIC antigo) e imagem que ficaria maior comprimida sobem como vieram — a função nunca
falha para quem chama. **O teto de 10 MB é do BANCO** (`chk_vistoria_anexo_tamanho`, 0047): regra
que só vive na tela não é regra. `vistoria_anexos` passou a guardar `tamanho_bytes` e
`enviado_por`, e `fotos_vistoria_lead` devolve isso + o nome do arquivo. O CRLV segue a mesma
regra (PDF sobe como veio, só com o teto).

**9. A ficha da venda virou ABAS.** `<FechamentoVenda>` tinha associado, veículo, documentos,
vistoria e adesão numa coluna só. As abas são **Associado · Veículo · Documentos e fotos ·
Adesão** e espelham exatamente os **grupos do `checklist_lead`** — por isso cada aba mostra o
número de pendências dela, e o aviso "há pendência em X" leva para a aba certa. O checklist
continua visível em **qualquer** aba: barra fixa no topo (progresso + quanto falta) e o checklist
inteiro na coluna lateral no desktop, ou no botão "Checklist" no celular. **A aba de fotos só
carrega as imagens quando é aberta** (o componente monta ali), e para um lead `EM_AUDITORIA` a
ficha **abre direto nela** — é a primeira pergunta de quem audita. Lógica pura em
`ABAS_FECHAMENTO`/`pendenciasPorAba`/`primeiraAbaPendente` (`src/lib/vendas.ts`), com testes.

**Ficou de fora (o usuário decide se entra):**
1. **Uma cotação por lead** — para comparar duas propostas fechadas cria-se OUTRO lead ("+ Nova
   cotação (novo lead)"). Suja o funil e duplica o CPF.
2. **Desconto só em %** — a negociação real é "quanto fica por R$ 89"; falta o caminho inverso.
   E o campo usa `<input type="number">`, com o mesmo "0 preso na frente" que o `MoneyInput` curou.
3. ~~`editar-cotacao.tsx` não separa o que já vem no plano~~ — **resolvido** junto com a `0070`:
   ele agora mostra "Já incluídos neste plano" e envia só o avulso; o `selecaoValida(opcionais, [])`
   (no-op que prometia uma trava inexistente) saiu.
4. **Dono do lead na ficha** — não mostra consultor/vendedor nem permite reatribuir
   (`atribuir_lead` só está em `/regional/leads`).
5. ~~**Busca sem acento no banco**~~ — **resolvido na `0079`** (ver a seção própria). E o que
   apareceu junto era maior: a busca por TELEFONE também falhava, porque o `<FechamentoVenda>`
   grava o celular mascarado e a consulta procurava por dígitos.

### Próximos passos oferecidos (o usuário escolhe)
1. **Rastreadores — fase 3:** integração com a plataforma da rastreadora (posição, status de
   comunicação) e a **importação da base do TrackerStock** (~2.400 equipamentos), que por decisão
   do próprio escopo só acontece depois que clientes e veículos estiverem cadastrados — antes
   disso a carga geraria milhares de registros órfãos. A fronteira já existe:
   `empresas_rastreamento.api_config`, `rastreadores.ultima_comunicacao/ultima_posicao` e o tipo
   de evento `IMPORTACAO`. Também está aberto: **cobrança do equipamento não devolvido**
   (status 6 e 7 hoje são manuais, sem título no financeiro).
2. **Ligar o gateway real** (Asaas) — emissão + webhook + baixa automática.
3. **Termo de adesão** com aceite jurídico no fluxo (`contratos_adesao` já existe; hoje o aceite
   da página pública guarda a prova, mas o texto é o mínimo honesto).
4. **Endurecer o primeiro acesso do associado** — hoje a senha inicial é o próprio CPF, então
   quem souber o documento entra até a troca obrigatória. Pedir também a data de nascimento
   (já existe em `clientes`) ou um código por WhatsApp resolveria; é mudança localizada na
   rota `/api/portal/login`.
5. **SLA / notificações do protocolo** (prazo por prioridade, aviso ao responsável).
6. **Cotação pelo portal do vendedor** — ele vê o lead, mas monta a cotação só no `/vendas`.

## Integração com o MUTUAL — FASE 1 CONSTRUÍDA (migration `0062`)
> Levantamento feito ao fim da sessão do painel da 24h; as perguntas foram respondidas pelo usuário
> em 08–09/09/2026, o contrato da API foi lido inteiro e **a Fase 1 (consulta e diagnóstico) está
> construída**. As fases 2 a 6 (de-para, carga, financeiro, eventos, cutover) seguem no plano.
> **O PLANO COMPLETO ESTÁ EM `docs/modulos/integracao-mutual.md` — leia-o antes de escrever
> qualquer linha deste tópico.** O que fica aqui é o resumo e as minas terrestres.

### As 3 minas terrestres (confirmadas no código, não suposições)
1. **Importar veículo `ativo` FATURA a base inteira.** `trg_veiculo_primeira_cobranca` (0025) roda
   `after insert` e chama `gerar_primeira_cobranca_veiculo`. Carregar 2.522 veículos ativos geraria
   2.522 faturas do mês corrente — cobrar de novo quem já paga no sistema atual. **A importação
   precisa de um interruptor**, e o projeto já tem o padrão para isso: GUC de sessão
   (`set_config('scar.importacao','true')`, como `scar.motivo_edicao`/`scar.obs_lead`/
   `scar.motivo_rastreador` já fazem), lido pelo trigger.
2. **`data_ativacao` vira HOJE se vier vazia.** `trg_veiculo_marca_ativacao` (0025, BEFORE) carimba
   `current_date` quando o campo é nulo. Sem trazer a data real da migração, a carteira inteira
   nasce "ativada hoje" — e isso contamina `veiculo_faturavel` (0024), o tempo de casa e o painel
   da 24h. O trigger só preenche quando está NULO, então **basta a importação trazer a data**.
3. **O banco valida documento** (`chk_documento_valido` em `clientes`) e base legada sempre tem
   CPF em branco, com dígito errado ou "000...". Decidir ANTES de escrever código: recusar a linha,
   estacionar numa área de quarentena, ou importar o associado como pendente.

### Colisões de unicidade que a carga vai encontrar
`clientes.cpf_cnpj` · `veiculos.placa` · `veiculos.chassi` · `veiculos.renavam` são UNIQUE.
Chassi e renavam são **nuláveis**: campo vazio tem de virar **NULL**, nunca `''` — duas linhas com
string vazia colidem (foi exatamente o que mordeu em `fornecedores.documento`, 0051).

### Ordem obrigatória da carga (dependência de FK)
`regionais` → `clientes` → `veiculos` → `titulos_financeiros`/`faturas` → eventos e acionamentos.
**A unidade é o eixo de tudo:** `regional_id` atravessa RLS, `escopo_regional()` e os painéis. A
primeira coisa a definir é o **de-para "filial do sistema atual" → `regionais`** — a mesma tabela de
correspondência que `docs/modulos/rastreadores.md` já mapeou para o TrackerStock.

### O que REUSAR (o CLAUDE.md manda não inventar caminho paralelo)
- **Proxy com segredo no servidor:** `/api/fipe` é o padrão — token em env, nunca no navegador,
  cliente chama a rota interna. Uma API externa de consulta segue esse molde.
- **Importação por arquivo com PRÉVIA E DIFF:** `src/lib/precificacao-import.ts` (testado) já
  resolve o difícil — validação que aponta linha e coluna, erro de fórmula do Excel que bloqueia em
  vez de gravar zero em silêncio, e a prévia mostrando o que entra/muda/sai. É o modelo de UX para
  qualquer carga.
- **Idempotência:** `gerar_faturas_cliente`, `emitir_titulo_fatura` e `abrir_alerta_veiculo` são os
  exemplos da casa — rodar duas vezes não duplica. Importação **tem** de ser re-executável: a
  primeira carga nunca é a definitiva.
- **Rito de entrega:** migration + suite em `supabase/tests/` + espelho puro em `src/lib/*.ts` com
  Vitest + `npm run schema` + `npm run validate`. E o **rito de segurança da 0052** (revoke/grant)
  em toda migration que cria função.

### Respondido pelo usuário (08/09/2026) — não perguntar de novo
1. **Sistema atual: MUTUAL** (Mutual Ignit). **Tem API:**
   `https://smartcar-api.mutualignit.com.br/public_api/v2/docs/`.
2. **Consulta ao vivo ou migração? Consultar PRIMEIRO**, para avaliar os dados antes de importar.
3. **O que entra:** associados/veículos **e** financeiro **e** eventos — os três.
4. **Convivência: SIM, por um tempo — e por enquanto QUEM MANDA É O MUTUAL.**
5. **Volume e janela:** a definir; é uma das saídas da fase de diagnóstico.

### ✅ DECISÃO DO USUÁRIO (11/10/2026): é MIGRAÇÃO, com fim marcado — DEPOIS DE DEZEMBRO O MUTUAL É DESLIGADO
*"Depois de dezembro, o Mutual é desligado de vez. Vamos ficar só com o SCar."* A API do Mutual
serve **só para tirar a base de lá**; não existe conexão permanente a construir.
- **`mutual_captura` é ÁREA DE PASSAGEM, não estrutura do sistema.** A convivência (outubro: piloto
  da MATRIZ; dezembro: o resto) é o único motivo de recapturar e re-executar a carga.
- **Consequência para decisões de desenho:** nada de estrutura PERMANENTE para resolver problema da
  captura (foi descartada, por isso, uma tabela-resumo mantida a cada captura proposta para o
  timeout da prévia). Solução da migração tem de ser descartável junto com ela.
- **Depois do corte (checklist):** apagar a área de captura (`mutual_captura`, ~1,1 GB — é o que
  pressiona a memória do banco, ver abaixo), tirar `MUTUAL_API_TOKEN`/`MUTUAL_API_BASE` do VPS e do
  `docker-compose.yml`, **voltar o `statement_timeout` do `authenticated` de 20s para 8s** (subido
  em 11/10, ver abaixo), e decidir o destino de
  `integracao_vinculos` (guarda o id do Mutual de cada associado/veículo — vale manter como
  rastro histórico). O boleto passa a sair do SCar: `definir_cobranca_externa_regional` por unidade.
- **O timeout da prévia da carga (medido 11/10/2026):** o banco é pequeno (`shared_buffers` 256 MB,
  ~1 GB de RAM) e `mutual_captura` tem 794 MB; 16% das leituras dela já vão ao disco. A prévia da
  MATRIZ leva **2,8 s com cache quente** e **passa de 8 s frio** — por isso a tela falha "às
  vezes". Não é bug de SQL nem disputa (a fila já serializa).
- **✅ TETO TEMPORÁRIO APLICADO em 11/10/2026 (autorizado pelo usuário):**
  `alter role authenticated set statement_timeout = '20s'` + `notify pgrst, 'reload config'`
  (conferido: `authenticated` = 20s; `authenticator` segue 8s, e `anon` 3s). Vale para o sistema
  inteiro enquanto durar — consulta lenta em OUTRA tela deixa de falhar em 8 s e passa a demorar
  até 20 s. **🔴 DESFAZER NO CORTE DE DEZEMBRO:** `alter role authenticated set statement_timeout
  = '8s'; notify pgrst, 'reload config';` — item do checklist acima.

### O que a resposta 4 muda (a conclusão da análise)
> ⚠️ Lido à luz da decisão de 11/10/2026 acima: a "replicação" é só o meio da migração, e termina
> em dezembro.

**Não é migração, é replicação unidirecional Mutual → SCar com cutover gradual por unidade.**
Consequências que o levantamento original não tinha:
- **Não existe chave externa em NENHUMA tabela do SCar** (tudo é chave natural: `cpf_cnpj`,
  `placa`). Replicação contínua exige uma tabela de vínculo `(sistema, entidade, id_externo,
  registro_id)` — CPF é corrigido, placa é transferida e registro em quarentena não tem linha
  onde pendurar id.
- **`veiculo_faturavel()` (0024) é o interruptor do cutover.** Os 4 caminhos de geração de fatura
  (0025 linhas 49/206/237/317) passam por ela: uma condição de "cobrança externa" ali faz o
  veículo importado viver no SAC/portal/24h **sem gerar boleto** — e virar a flag por regional é
  o cutover. **Isso resolve a mina nº 1 melhor que a GUC**, que só protege a janela da carga e
  não o lote de faturamento rodado meses depois.
- **A GUC `scar.importacao` é LOCAL À TRANSAÇÃO** — setar numa chamada e gravar noutra não
  funciona (cada chamada do supabase-js é uma transação). Tem de ser `set_config` + escrita
  DENTRO da mesma RPC, como fazem 0027/0050.
- **`clientes.matricula` é gerada por sequence** (`matricula_seq`, 0006) e é `unique`: a
  numeração do Mutual e a do SCar disputam o mesmo espaço. Decidir antes da carga.
- **Título em aberto importado errado BLOQUEIA o associado**, não só relata: `dias_atraso_cliente`
  alimenta a recusa de acionamento da 24h e a inadimplência do rastreador. É o argumento a favor
  do "consultar primeiro".
- **Histórico pago reescreve DRE de mês fechado** (`dre_movimentos`, 0032) e, na convivência, faz
  os dois sistemas contarem a mesma receita. O DRE do SCar começa na data de corte.

## Integração com o Mutual — Fase 1 (0062 → 0066): espelho de leitura e diagnóstico
> Plano completo e de-para campo a campo: **`docs/modulos/integracao-mutual.md`**. Leia antes de
> tocar neste módulo.

- **A REGRA DA FASE, sem exceção:** nada escreve em `clientes`, `veiculos`, `titulos_financeiros`,
  `faturas` ou `eventos_sinistro`. O destino é a área de captura (`mutual_captura`) e o produto é um
  **relatório**. O risco de verdade só começa na Fase 3 (carga). **Há teste provando isso** — a
  suite `0062` confere que a operação segue com zero cliente, veículo, título e fatura.
- **Onde fica:** menu → **Integração Mutual** (`/integracao/mutual`), só para admin/financeiro.
- **O token é a coisa mais sensível do projeto** (dá leitura da base inteira de associados):
  `MUTUAL_API_TOKEN` + `MUTUAL_API_BASE` no `.env` do VPS, lidos pela rota `/api/v1/mutual` —
  molde do `/api/fipe`, **nunca no navegador**. Sem a env, a tela diz "não configurado" em vez de
  fingir erro da Mutual.
- **⚠️ ENV NOVA MEXE EM DOIS LUGARES.** O `docker-compose.yml` repassa as variáveis **uma a uma**
  no bloco `environment:` (não usa `env_file`). Escrever só no `.env` do VPS **não faz a variável
  chegar no contêiner** — e o sintoma é a tela dizer "não configurado" sem pista nenhuma. Ao criar
  env nova: `.env` do VPS **+** `docker-compose.yml` **+** `.env.docker.example`/`.env.example`.
- **A BARRA FINAL É OBRIGATÓRIA** em toda URL do Mutual: a API é Django com `APPEND_SLASH` e
  devolve **301** sem ela. `urlMutual()` já monta assim — não montar URL na mão.
- **`Authorization: Bearer <token>`** — o prefixo faz parte do valor (está escrito no contrato deles).
- **A carga é dirigida por CONTRATO, não por associado.** `/person/` não tem `updated_at` nem
  paginação declarada: é consulta pontual, não feed. A espinha é
  `/contract/contract_object/nested/` (incremental + paginado, já traz veículo e associado).
- **O valor cobrado hoje sai de `contract_object.final_total_value`** e a ativação de
  `first_activation_date` — é o que a decisão de **preço congelado** exige (o motor `cotar_plano`
  passa a valer só para contratos novos). **Mas o `due_day` e a unidade (`regional`) NÃO estão no
  objeto:** medido em produção, vieram vazios em **2.497 de 2.497** e em **100%**. Eles moram no
  **`/contract/`**, que virou entidade capturável na `0063`. Sem puxar os dois endpoints a carga
  nasceria com a carteira inteira na matriz e vencendo no dia 10.
- **R$ 0,00 NÃO congela — vaza.** `valor_mensalidade_veiculo` (0024) só respeita o override quando
  `> 0`; veículo de cortesia importado com zero cairia no `cotar_plano` e o associado que nunca
  pagou receberia boleto. Por isso o diagnóstico marca valor nulo **ou zero** como CRÍTICO.
- **Lógica pura testada:** `src/lib/mutual.ts` — `urlMutual`, `statusDeTexto` (uma palavra → um
  status), `ehFunilDeVenda`, `statusVeiculoDoContrato` (a disputa contrato × objeto pelo menos
  vivo, com `null` = não importar), `tipoPessoaMutual` ("1"/"2"),
  `dataLocalDeIso` (**converte o fuso ANTES de cortar a hora** — senão evento das 21h vira o dia
  seguinte), `textoOuNulo` (vazio → NULL, senão `chassi`/`renavam` colidem no unique),
  `ehMensalidade` (dos 20 `invoice_type`, só 3 são mensalidade) e `problemasDoObjeto` (quarentena).
- **Espelho no banco, de propósito:** `mutual_status_veiculo`, `mutual_tipo_pessoa` e `mutual_texto`
  repetem a regra em SQL — mexeu num lado, mexa no outro e nos dois testes (mesma escolha da
  máquina de estados do rastreador, 0050).
- **A captura é re-executável:** `unique (entidade, id_externo)` + upsert. Recapturar **atualiza**;
  e o `uuid_externo` usa `coalesce` para um payload parcial não apagar a chave externa estável.
- **Softruck, Zelo, Apoio, Split Risk, redeveiculos e Ativo247 estão FORA** — a associação não tem
  parceria com elas. Só `object_type = VEHICLE` (e `IMPLEMENTOS`) entra.
- **BLOQUEIO conta só a CARTEIRA VIVA (0063).** Valor, dia de vencimento e data de ativação são
  problema de quem vai **faturar** — nos mesmos três status de `veiculo_faturavel` (`ativo`,
  `em_evento`, `vistoria_pendente`). Contrato encerrado sem valor é o esperado, e marcá-lo como
  CRÍTICO afogava o sinal real (foi o que aconteceu: 2.432 falsos críticos na primeira leitura).
  O acervo inativo aparece no grupo **ACERVO INATIVO**, informativo, e a quarentena olha a
  carteira viva por padrão (`p_somente_faturaveis`, com botão na tela para ver tudo).
- **O ENUM DO SWAGGER NÃO É EXAUSTIVO.** `AGUARDADO A RETIRADA DO RASTREADOR` apareceu só na base
  real e caía no `else null`, ou seja, era contado como *funil de venda*. Status desconhecido não
  pode sumir: `mutual_status_nao_mapeados()` lista o que o de-para não reconhece (fora o funil
  conhecido) e o diagnóstico avisa. **Vocabulário novo do Mutual = veículo faltando na carga.**
- **A amostra da API vem dos MAIS ANTIGOS primeiro.** Nos 2.500 primeiros de 17.610 objetos:
  2.438 INATIVO contra 35 ATIVO. Nenhum percentual de amostra parcial fala da carteira — só
  concluir com a captura completa.
- **O DIA DE VENCIMENTO E A UNIDADE SAEM DO CONTRATO (0064), não do objeto.** Conferido na tela
  do Mutual: o campo está na *Configuração da cobrança* do contrato. `mutual_diagnostico` e
  `mutual_quarentena` resolvem `due_day`/`regional` pelo `/contract/` (objeto só como fallback).
  **Lição que vale para o módulo inteiro:** enquanto o endpoint que guarda o dado não foi
  capturado, o indicador tem de dizer *"puxe os contratos"* — acusar ausência de um dado que
  ninguém puxou foi o que gerou centenas de falsos críticos duas vezes seguidas.
- **✅ RESPONDIDO PELA CARGA COMPLETA: `final_total_value` é a PARCELA, não o total.**
  `mutual_periodicidade` mostrou o semestral com **mediana R$ 164,00** contra **R$ 204,50** do
  mensal — mesma ordem de grandeza. Fosse o total do contrato, o semestral estaria em ~6× o
  mensal. "Semestral" no Mutual é a **vigência** (6 parcelas mensais), não a frequência do boleto:
  bate com a tela (*parcela R$ 120 · 6× · total R$ 720*). **A carga grava `final_total_value`
  direto em `veiculos.valor_mensalidade`, sem dividir.**
- **QUEM NÃO GERA MENSALIDADE (decisão do usuário, 0066):** `INDENIZADO`, `INDENIZAÇÃO` (todas as
  grafias) e `INATIVO/PAGO` → `inativo`. **A armadilha era `em_evento`:** ele parece o lugar certo
  para "indenizado", mas está na lista de `veiculo_faturavel` (0024) — 26 veículos já indenizados
  receberiam boleto todo mês. **`SINISTRADO` fica em `em_evento` de propósito:** sinistro em
  andamento é associado ativo e segue pagando; indenizado já recebeu e saiu.
- **O FATURAMENTO É MENSAL — os 6 boletos são só o LOTE de emissão.** A associação emite carnê de
  6 meses de uma vez para não rodar emissão todo mês (em dezembro saem janeiro a junho). É
  exatamente o que `gerar_faturas_periodo(comp_inicial, meses, …)` (0025) já faz, com padrão de 6
  meses, na aba **Boletagem em Lote** de `/cobrancas`. **Não é preciso construir nada** — e é a
  confirmação de que `final_total_value` é a parcela mensal.
- **✅ RESPONDIDO DE VERDADE (0083): A UNIDADE É A `sales_team_id` DO CONTRATO.** O SCar tem UM
  nível (`regionais`) e o Mutual tem TRÊS (regional → equipe de vendas → consultor). **A nossa
  regional É a equipe de vendas dele** (decisão do usuário, 20/09/2026). O contrato traz
  `sales_team_id` em **3.384 de 3.384** faturáveis com contrato. Ver a seção própria — inclusive a
  correção do que a 0082 mediu errado.
- **A unidade também está no associado (0082), e ela virou RESERVA** — `PERSON.regional_id`, 100%:
  E a corrente do consultor (0073/0074) estava **vazia**: medido com a base completa em
  20/09/2026, `consultant` vem em branco em **0 de 17.675 objetos e 0 de 17.616 contratos**, ou
  seja o funil dela dá ZERO no segundo degrau. O elo real é
  `objeto.person_data.person_id → PERSON → regional_id`: **dois saltos, join exato por id**, com
  **99,1% de cobertura** na carteira viva (3.409 de 3.440). Ver a seção própria.
  **⚠️ Os números antigos deste arquivo ("3.527 de 3.527 faturáveis sem unidade", "as 10 filiais
  com 0 objetos") eram o SINTOMA de ler o lugar errado**, não a realidade da base.
- **🔴 O STATUS QUE MANDA É O DO VEÍCULO, NÃO O DO ASSOCIADO (0071).** O contrato do Mutual
  guarda **vários veículos**, então `contract_status` fala do ASSOCIADO: ele fica ATIVO porque tem
  OUTRO carro, enquanto AQUELE veículo está encerrado. Até a 0071 lia-se só o contrato e o carro
  morto entrava como **faturável** — indo para os bloqueios ser cobrado por valor, dia de
  vencimento e data de ativação que um contrato encerrado não tem por que ter. **Era isso que
  inflava a quarentena.**
- **MAS O OBJETO SÓ PIORA, NUNCA RESSUSCITA.** Contrato `CANCELADO` com objeto `ATIVO` é veículo
  sem cobertura, não veículo ativo. A regra não é "o objeto vence": vence o **MENOS VIVO dos
  dois** (`mutual_vitalidade`: ativo 4 · em_evento 3 · vistoria_pendente 2 · suspenso 1 ·
  inativo 0). Consequências que caem de graça: `SINISTRADO` não é apagado por um "ATIVO" genérico
  do objeto, e **funil de venda no contrato descarta a linha** de qualquer jeito — venda nova
  nasce no SCar e o objeto não reabre essa decisão.
- **A ASSIMETRIA DO DESCONHECIDO (0071) — e ela é deliberada.** Vocabulário novo **no contrato**
  continua sendo `null` (não importar): é decisão PENDENTE, e deixar o objeto resgatar a linha faria
  o veículo entrar com classificação adivinhada, em silêncio — o oposto do que
  `mutual_status_nao_mapeados()` existe para impedir. Vocabulário novo **no objeto** é "sem
  opinião" e o contrato manda: o status do objeto é um REFINAMENTO (só estreita), e refinamento
  ilegível é nenhum. *Isso foi pego pelas suites `0063` e `0066` quando a primeira versão da 0071
  deixou o objeto resgatar contrato desconhecido — o teste antigo fez o trabalho dele.*
- **`mutual_status_cruzado()` é o instrumento da 0071**: contrato × objeto, com o que mudou de
  classificação e quantos. Mudança de LEITURA tem de ser mensurável ANTES da carga — a tela mostra
  só as linhas que mudam, com "antes" riscado ao lado do "agora".
- **VEÍCULO SEM PLACA É 0 KM, NÃO DADO SUJO (0071).** São carros novos ainda não emplacados.
  Misturar com "sem CPF" (dado que a origem perdeu) escondia os dois: o 0 km virava alarme falso e
  o problema real sumia no meio da lista. Agora: **sem placa + COM chassi** = grupo
  `PLACA PENDENTE (0 KM)`, fora da quarentena por padrão (botão "Ver os 0 km" na tela);
  **sem placa E sem chassi** = `SEM_PLACA_NEM_CHASSI`, aí sim CRÍTICO — não há identidade nenhuma.
- **✅ RESOLVIDO NA `0136`:** o 0 km com chassi ENTRA na carga (placa pendente). Texto antigo:
- **⚠️ O 0 km ainda depende de decisão para a CARGA:** `veiculos.placa` é **not null unique**
  (0001). Ele só entra quando essa coluna aceitar a espera; o **chassi** é a identidade natural
  enquanto a placa não vem. A cobrança da placa é operacional — SAC no atendimento, ou aviso
  automático depois da adesão (decisão do usuário, ainda não construída).
- **`mutual_status_nao_mapeados` passou a ter `origem`** (CONTRATO/OBJETO): desde a 0071 o status
  do objeto decide carga, então vocabulário novo ali classifica veículo errado em silêncio.
- **`mutual_campos(entidade, caminho, amostra)` (0065) é o INSTRUMENTO CONTRA O CHUTE.** Lista as
  chaves que realmente vêm no payload capturado, quantas chegam preenchidas e um exemplo; aceita
  objeto aninhado (`vehicle_data`, `person_data`). **Supor onde um campo mora já custou duas
  rodadas** — o dia de vencimento e a unidade. Antes de dizer "o dado não veio", inspecione.
  Cuidado de implementação: valor de string sai por `#>> '{}'` (sem as aspas do JSON), senão
  `""` contaria como preenchido; `{}`, `[]` e `null` também não contam.
- **⚠️ O CONTRATO TEM PERÍODO — e `valor_mensalidade` (0024) é MENSAL.** A tela do Mutual mostra
  *Semestral · 6 parcelas · parcela R$ 120,00 · total R$ 720,00*. Se `final_total_value` for o
  TOTAL e a carga gravar como mensalidade, o associado recebe boleto de **6× o que paga**.
  **Isso ainda NÃO está decidido** — `mutual_periodicidade()` (período × parcelas × valor
  mediano/mín/máx do objeto) existe para a resposta sair dos DADOS: se a mediana do semestral
  for parecida com a do mensal, é parcela; se for ~6×, é total e a Fase 3 divide. `contract_period`
  (12/6/3/1 ou o rótulo) vira meses em `mesesDoPeriodoMutual`/`mutual_meses_periodo`, e período
  desconhecido devolve **null** de propósito: assumir "mensal" no escuro é o caminho para cobrar
  a mais.
- **A captura vai até o fim sozinha, EM BLOCOS (`useCapturaMutual`).** Um clique puxa a entidade
  inteira; o laço vive no navegador e cada bloco é uma requisição curta. Não é uma requisição só
  de propósito: 17.610 objetos são 36 páginas e as faturas passam de 400 — uma chamada desse
  tamanho estoura o tempo do proxy antes de terminar, e aí não se salva nem o que já tinha vindo.
  Como cada bloco já grava e a captura é re-executável (upsert), parar no meio ou cair a rede
  **nunca perde trabalho**: o retorno diz de qual página retomar, e o próximo clique continua dali.
  O cache do TanStack só é invalidado **no fim** — o diagnóstico é consulta cara e refazê-lo a cada
  bloco deixaria a tela mais lenta que a própria carga. `PAGINA_MAXIMA` (5.000) é o freio para o
  caso de a API nunca dizer que acabou.
- **✅ A COR JÁ TEM DE-PARA (0080).** `/vehicle/color/` é entidade capturável desde a 0062 e agora
  `mutual_cor_do_externo(id)` resolve `vehicle_color_id` → `cores`, pelo payload, com
  `mutual_texto_em` (nada de chutar a chave). `mutual_cores_nao_mapeadas()` é a fila do vocabulário
  novo, e ela aparece em `Configurações → Cores`. Vale a regra da 0064: **vazio sem ter capturado
  a entidade não prova nada**.
- **RPCs (0082):** `mutual_regional_externa`, `mutual_chaves_regional`,
  `mutual_regional_do_externo`, `mutual_cobertura_unidade`, `vincular_externo`,
  `desvincular_externo`, `registro_do_externo`, `vinculos_orfaos`,
  `definir_cobranca_externa_regional`, `cobranca_externa_resumo`.
- **RPCs:** `mutual_registrar_captura` (só `tem_acesso_global`), `mutual_diagnostico`,
  `mutual_por_status`, `mutual_filiais`, `mutual_quarentena`, `mutual_status_nao_mapeados`,
  `mutual_periodicidade`, `mutual_campos`, `mutual_resumo_capturas`,
  `mutual_cobertura_consultor`, `mutual_consultores_sem_vendedor` (0073).

## O que é
Sistema de gestão para **associação de proteção veicular** (associados, frota, eventos/sinistros,
financeiro, precificação por FIPE). Escala esperada: grande (maior que o "Smartvida").
Prioridade: **segurança (RLS)** e **sempre validado** antes de commitar.

- **Repo:** `cadastrosmartcarbrasil-rgb/scar` · **branch de trabalho/deploy:** `claude/claude-md-opcao-x-98kfj5`
- **Produção:** `https://appsmartcar.com.br` (VPS KingHost, Docker + Caddy/HTTPS auto)
- **Idioma:** UI e mensagens em português (sem acentuação em identificadores/SQL para evitar problemas).

## Stack e decisões de arquitetura
- **Next.js 14 (App Router)** — Server Components + Route Handlers fazem o papel de API. Deploy único.
- **Supabase** (Postgres + RLS + Auth + Storage). O caminho de dados usa **`supabase-js`** (respeita RLS),
  NÃO Prisma (Prisma ignora RLS).
- **TanStack Query** para cache/estado client-side. **Tailwind** + lucide-react + Recharts.
- **Layout redesenhado (17/10/2026, só visual — nenhuma rota/função mudou):** paleta oficial
  (Azul Marinho `#142445`, Azul Smart `#0BACE2`, Celeste `#6AA9DE`) nos tokens de `globals.css`;
  fontes self-hosted via `@fontsource` (Montserrat nos títulos = `font-display`, Barlow no texto,
  IBM Plex Mono em `.placa`/`.codigo`). Cartões planos com borda (sem sombra decorativa); menu lateral
  **recolhível** (preferência em `localStorage` `scar:menu-recolhido`) com item ativo em ciano chapado;
  `src/components/layout/topbar.tsx` mostra área + título da tela (derivado de `OPERACAO`/`GESTAO`
  exportados pelo `sidebar.tsx`); login da equipe em dois painéis. Rótulos de grupo em sentence case.
- **Design system (marca Smart Car Brasil):** tema "cockpit". `tailwind.config.ts` define
  `brand` = **NAVY** (`brand-600 #1E2B4D`, a barra do site; acao primaria/estrutura) e `cyan` =
  **CIANO** da marca (`cyan-500 #22A7E4`/`cyan-600 #139AD6`; energia/acento — o "CAR" e o rodape).
  Sidebar = cabine escura (navy + pinstripe `.cockpit-stripe`, wordmark SMART**CAR**BRASIL, item
  ativo com glow ciano). Numeros de painel usam `.tnum` (tabular). Botao primario navy; foco/realce
  em ciano. Status colors a parte.
- **CABINE CLARA (21/10/2026) — o visual claro atual.** Tudo em `globals.css` (`:root`) e
  `tailwind.config.ts`; o tema escuro (`.dark`) não foi tocado. Ground `--fundo #D5DDEA`
  (azul-acinzentado, antes #F2F5FA), card `--superficie #F8FAFD` (um tom MAIS CLARO que o fundo, antes
  branco), `--superficie-alta #EAEFF7` (cabeçalho de tabela, mais escuro que o card), borda do card
  `slate-200 #BCC7D9`, borda de campo `slate-300 #A3B1C8`. Texto: `slate-800 #0F1B33` (corpo),
  `slate-500 #38455C` (secundário, 7.07 no fundo), `slate-400 #525E70` (apoio, 4.81 no fundo — o piso).
  **Peso:** corpo 500 (`font-normal` = 500, `font-medium` = 600 no config). **Tamanho:** `text-sm` 15px,
  `text-xs` 13px (apague o bloco `fontSize` do config para voltar a 14/12). Número grande de painel
  (`.tnum.text-xl` / `.text-2xl`) em Montserrat 800. `rounded-2xl` = 12px. `cyan-600` = `#0678A0`.
  **Ao criar tela nova:** use `bg-superficie` no card e `border-slate-200`; NÃO use `bg-white` (só
  placa/logo) nem `text-slate-300` como texto. Valores medidos: contraste ≥ 4.5 em todo texto.
- **A escala `slate` é NOSSA, não a do Tailwind.** As faixas **400..700** foram escurecidas para
  metade da luminância original, com 15% de navy misturado — o cinza-claro padrão é fraco demais
  para uma marca navy e `text-slate-400` dava **2.56** de contraste no card branco, reprovado no
  WCAG AA (mínimo 4.5); agora dá 5.35. Redefinir a paleta escurece **todas as telas de uma vez**,
  e foi seguro porque essas faixas são usadas só como cor de TEXTO (zero `bg-`/`border-` nelas).
  **50..300 e 800/900 não foram tocados:** são fundo, borda e título.
- **Revisão de português (20/10/2026, só texto):** ~2.700 textos de tela ganharam acento e cedilha
  (não, veículo, cotação, histórico…). Feito por AST (só JSX, atributos de tela, rótulos e mensagens),
  com prova de que cada linha mudou SÓ por acento. **Ficaram sem acento, de propósito**, textos que
  são gravados ou comparados como valor: opções de natureza/"colidiu com" da comunicação de evento,
  motivos de perda, subtipos da 24h, tipos de documento da empresa, sinônimos de cabeçalho da
  importação de vendedores, o prefixo "Trazido do historico do Mutual" (o banco grava assim) e "Pix
  Copia e Cola" (nome oficial). Mensagens que vêm do BANCO (SQL) continuam sem acento — corrigir é
  migration. **Texto novo: escreva já com acento**; identificador, coluna e valor gravado, nunca.
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

· `0038_portal_vendedor` (PORTAL DO VENDEDOR `/vendedor`: (A) `vendedor_atual()` resolve o vendedor
pelo `auth.uid()` e **nenhuma RPC do portal recebe id de vendedor** — nao existe parametro para
pedir os dados de outra pessoa (um passo alem do `escopo_regional`, que aceita o id e ignora);
(B) **RLS de `leads` revista**: ate aqui o vendedor nao tinha login, entao `pode_regional(regional_id)`
dava a QUALQUER staff da franquia — inclusive um `consultor_vendas` — a carteira inteira da unidade;
com o vendedor logando isso viraria vazamento. Agora `pode_ver_carteira_regional()`
(admin/financeiro/gestor_regional/auditoria) mantem a visao da unidade e o `consultor_vendas` fica
com o que e dele (`consultor_id`, `created_by` ou `vendedor_id` apontando para o seu cadastro — este
ultimo e o que faz o lead do HOTLINK, criado pelo service_role, aparecer para o dono do link);
(C) RPCs `vendedor_painel`, `vendedor_leads`, `vendedor_comissoes`, `vendedor_perfil`,
`vendedor_criar_lead` (nasce amarrado a quem cadastrou, na regional dele) e
`vendedor_atualizar_perfil` (subconjunto seguro: telefone e dados bancarios — comissao, regional e
status NAO sao parametros, entao nao ha como o vendedor aumentar a propria comissao; a RLS de
`vendedores` ja barra o caminho direto). Ha teste cobrindo os dois bloqueios.)

· `0039_vendedor_sem_teto` (o portal do vendedor deixa de expor o TETO de comissao da franquia:
`vendedor_perfil()` e derrubada e recriada sem `teto_adesao`/`teto_recorrente` — teto e a negociacao
matriz-franquia, o vendedor precisa saber o percentual DELE. `listar_vendedores` (0035) fica como
esta: ela ja limita por `tem_acesso_global() or pode_regional(v.regional_id)`, e e justamente isso
que permite o gestor cadastrar a equipe de dentro do portal.)

· `0040_vistoria_modelo_fotos` (VISTORIA GUIADA + itens do combo: (A) `vistoria_fotos_modelo`
(codigo, nome, **instrucao de enquadramento**, obrigatorio, ordem, `tipo_veiculo_id` nulo = todos)
com seed de 10 poses — 6 OBRIGATORIAS (frente, traseira, duas laterais, chassi, hodometro) e 4
opcionais (motor, interior, pneus, acessorios). O codigo da pose vai em `vistoria_anexos.tipo`
(coluna que ja existia) e `fotos_vistoria_lead(lead)` devolve a lista pronta para o app, marcando o
que ja foi enviado (uma foto por pose: repetiu, vale a mais recente); (B) **`checklist_lead` deixa
de contar ARQUIVOS e passa a exigir POSES** — a regra antiga era "min. 4 fotos" e quatro fotos da
frente passavam; (C) `produtos_do_plano(plano)` — `produtos_obrigatorios_cotacao` (0028) so devolve
o que e obrigatorio no cadastro do produto, nunca os opcionais amarrados ao combo, entao a tela de
cotacao oferecia como AVULSO um item que ja vinha no plano; (D) RLS de `vistorias` ganha o caminho
do `vendedor_id` (mesma correcao que o 0038 fez em `leads`): sem ela o dono do HOTLINK — cujo lead
nasce pelo service_role, sem `consultor_id` — nao conseguiria abrir a propria vistoria.)

· `0041_atribuicao_lead` (REGRAS DE ATRIBUICAO DO LEAD: o hotlink fazia um INSERT cru — cada clique
virava lead novo. Agora `registrar_captura_hotlink` decide, e as regras sao PARAMETRO da franquia:
`regionais.dias_protecao_lead` (30), `dias_sem_contato_lead` (7) e `distribuicao_lead`
(MANUAL|RODIZIO). Classificacao em `classificar_captura(regional, celular, cpf, placa)`:
**CARTEIRA** (ja e associado — nasce marcado `leads.carteira`, nao vira venda nova),
**DUPLICADO** (ha lead aberto dentro da protecao — NAO cria outro lead, so incrementa
`recapturas` e registra a passagem; fica com quem captou PRIMEIRO), **REATIVACAO** (lead antigo
sem protecao: quem trouxe agora leva) e **NOVO**. `leads` ganha `atribuido_em`,
`atribuicao_motivo`, `ultima_interacao_em`, `recapturas`, `carteira`, `cliente_carteira_id`; nova
`lead_atribuicoes` guarda cada troca de dono. `atribuir_lead` (recusa vendedor de outra unidade),
`proximo_vendedor_rodizio`, `liberar_leads_sem_contato` (devolve os parados ao pool),
`registrar_contato_lead` (renova a protecao) e `leads_sem_vendedor` (o pool da unidade).
`fn_lead_historico` passa a carimbar `ultima_interacao_em` a cada mudanca de etapa.)

· `0042_aceite_venda` (ACEITE NA PAGINA PUBLICA: o hotlink parava na captura — agora a mesma pagina
cota e FECHA. `leads.token_publico` (unico) e a capacidade das chamadas publicas seguintes: sem ele
`/cotar` e `/contratar` receberiam um `lead_id` adivinhavel e qualquer um penduraria proposta no
atendimento alheio; por isso `registrar_captura_hotlink` foi recriada devolvendo o token (drop+create,
a coluna de OUT muda a assinatura). Colunas do aceite em `leads` (`aceite_em/por/nome/documento/ip/
user_agent/cotacao_id`) — `aceite_por` so aceita CLIENTE ou VENDEDOR. `registrar_aceite_venda(...)`
valida (nome completo, `validar_documento`, cotacao do proprio lead, sem aceite repetido, lead ainda
em negociacao), grava a prova do consentimento e poe `status = 'APROVADO'` — o trigger
`fn_lead_aprovacao` (0017) leva a EM_AUDITORIA, a Auditoria efetiva com `autorizar_entrada_lead` e o
0025 gera a primeira cobranca. `lead_por_token_publico(token)` e o unico caminho das rotas publicas.)

· `0043_cotacao_sem_interrupcao` (dois erros de desenho do 0041/0042: (A) **a captura parava a
cotacao** em CARTEIRA (ja e associado) e DUPLICADO (ja havia lead aberto), mandando o visitante
esperar um humano — joga fora a intencao de compra no momento em que ela existe. Agora os dois
seguem cotando: o DUPLICADO continua **no lead que ja existe** (devolve o token dele, sem criar
outro nem trocar o dono) e o da CARTEIRA nasce com a **ficha do associado copiada** (CPF/CNPJ,
e-mail, endereco, tipo de pessoa, `cliente_existente_id`) — e o CPF que faz `autorizar_entrada_lead`
reaproveitar o cadastro em vez de duplicar; (B) **o aceite ia direto para EM_AUDITORIA**, onde
`lead_em_negociacao()` e falso e a cotacao CONGELA — o vendedor nao ajustava mais opcional nenhum.
`registrar_aceite_venda` passa a deixar o lead em **EM_NEGOCIACAO**, marcado como aceito; quem
manda para a Auditoria continua sendo a equipe, quando a ficha esta completa.
`lead_por_token_publico` ganhou `cpf_cnpj`, `tipo_veiculo_id` e `valor_fipe`.)

· `0044_portal_associado` (PORTAL DO ASSOCIADO `/portal`: (A) PRIMEIRO ACESSO — `clientes` ganha
`portal_senha_provisoria`/`portal_primeiro_acesso_em`/`portal_senha_alterada_em`/
`portal_ultimo_acesso_em`. O login e CPF/CNPJ e, na primeira vez, a senha e o proprio documento:
a rota `/api/portal/login` cria o usuario de auth SO quando a senha digitada e o documento, ja
marcado como provisorio, e o layout troca a tela inteira pela criacao de senha antes de mostrar
qualquer dado; (B) CARTAO TOKENIZADO — `cartoes_cobranca` guarda **token, bandeira e 4 digitos**;
nao existe coluna para o numero do cartao nem para o CVV, e `portal_registrar_cartao` nem sequer
tem parametro para eles. Indice unico parcial garante um cartao principal por associado;
(C) RPCs sem parametro de cliente (mesma postura do 0038): `portal_perfil`, `portal_veiculos`,
`portal_titulos` (TODOS os boletos — pagos, a vencer e vencidos), `portal_financeiro`,
`portal_segunda_via` (so do proprio titulo; diz quando o banco ainda nao gerou em vez de inventar),
`portal_atualizar_perfil` (contato e endereco — nome, CPF e status NAO sao parametros),
`portal_cartoes`/`portal_registrar_cartao`/`portal_remover_cartao`, `portal_senha_trocada` e
`portal_registrar_acesso`.)
· `0045_agenda_vendas` (AGENDA DO VENDEDOR — o CRM sabia a FASE do lead, nao o TRABALHO nele:
(A) `lead_interacoes` (tipo LIGACAO/WHATSAPP/EMAIL/VISITA/OBSERVACAO x resultado FALOU/
NAO_ATENDEU/AGENDOU/SEM_INTERESSE, observacao, o retorno combinado NAQUELE contato e o autor) —
historico, nao rascunho: RLS so de SELECT, a escrita passa pela RPC; (B) o compromisso vigente mora
no lead (`proximo_contato_em`/`proximo_contato_nota`) porque a agenda precisa de UMA data por lead
para filtrar barato; (C) `registrar_interacao_lead(...)` grava, carimba `ultima_interacao_em` (o
mesmo campo que a devolucao ao pool do 0041 le) e move a agenda — recusa agendamento sem data,
data no passado, tipo desconhecido e "limpar + agendar" ao mesmo tempo, com a trava de propriedade
em `pode_tratar_lead()` (espelho exato do `using` da policy `leads_update` do 0038); (D)
`agenda_vendas(ate, consultor, limite)` = a fila do dia (o que venceu + o que vence hoje), sem
lead ATIVO/PERDIDO; (E) `leads_kanban()` **recriada** (muda a lista de colunas, entao e drop +
create) devolvendo `ultima_interacao_em`, `proximo_contato_em`, `dias_parado` e
`limite_sem_contato` da franquia. ESCOLHA REGISTRADA: "parado" conta de `ultima_interacao_em` (ou
da criacao), NUNCA de `updated_at` — corrigir a FIPE nao e trabalhar o lead.)
· `0046_vendas_duplicidade_aceite` (duas regras que JA existiam no banco e nenhuma tela chamava:
(A) `classificar_captura_no_escopo(celular, cpf, placa)` — a classificacao do 0041 para quem
cadastra na mao. E OUTRA funcao porque a original recebe a regional como PARAMETRO, e um parametro
que a tela escolhe e um parametro que qualquer um troca: com o id da franquia vizinha ela contava
os leads e os vendedores de la. Aqui a unidade sai de `escopo_regional()` (0032) e o retorno traz
`pode_abrir` = `pode_tratar_lead(lead)`, para a tela so oferecer o link do atendimento existente
quando ele for visivel a quem olha. Sem nada digitado ela nao varre nada; (B) **CORRECAO DE
SEGURANCA** em `registrar_aceite_venda`: ela nasceu para a pagina publica (service_role, posse
provada pelo `token_publico`), mas era SECURITY DEFINER concedida a `authenticated` SEM checar o
chamador — qualquer usuario logado, inclusive um ASSOCIADO do `/portal`, podia carimbar aceite em
lead alheio com nome e CPF inventados. Agora, quando `auth.uid()` nao e nulo, exige
`pode_tratar_lead()`; o caminho publico segue identico. So depois disso o CRM e o portal do
vendedor passaram a colher o ACEITE PRESENCIAL (`p_por := 'VENDEDOR'`).)
· `0047_vistoria_anexo_peso` (A AUDITORIA precisa CONFERIR a foto, nao so saber que ela existe:
(A) `vistoria_anexos` ganha `tamanho_bytes` e `enviado_por`, com **teto de 10 MB no proprio banco**
(`chk_vistoria_anexo_tamanho`) — a reducao acontece no navegador (`src/lib/imagem.ts`: 1600px no
maior lado, JPEG), mas regra que so vive na tela nao e regra. Linha antiga fica com peso nulo e
continua valendo; (B) `fotos_vistoria_lead` **recriada** (muda a lista de colunas de OUT, entao e
drop + create) devolvendo `enviada_em`, `tamanho_bytes` e `arquivo` — e o que aparece embaixo de
cada miniatura. O `distinct on` ganhou `a.id` como desempate: dois anexos gravados na MESMA
transacao tem o mesmo `created_at` (o default e `now()`) e a escolha da "mais recente" seria
arbitraria — mesmo gotcha da auditoria da OS 24h.)
· `0048_assistencia_anexos` (ANEXOS DA OS DA 24H — o modulo nasceu completo no dinheiro (cotacao,
OS, KM excedente, contas a pagar, auditoria da edicao) e VAZIO NA PROVA: a foto do veiculo chegava
pelo WhatsApp do atendente e morria ali. (A) `acionamento_anexos` (foto do veiculo, foto do local,
documento, comprovante) com `tamanho_bytes`/`enviado_por`; `tipo` e TEXTO com CHECK, nao enum —
evita o gotcha de "novo valor de enum na mesma transacao" quando a lista crescer; (B) bucket
privado **`assistencia`**, no padrao do `sinistros-docs`: o caminho comeca pelo id do acionamento e
a policy de storage confere o acesso por ele (com regex de uuid antes do cast — sem isso um `name`
fora do padrao derruba a consulta inteira). RLS espelha `acionamentos_assistencia`: ve quem ve a OS,
escreve quem opera a 24h; (C) mesmo TETO DE 10 MB do 0047; (D) o teto passa a valer tambem para
`anexos_evento`, la como **NOT VALID** — foto pesada que subiu antes da compressao continua onde
esta, so o que entrar agora precisa respeitar.)
· `0049_rastreadores` (FASE 1 do modulo de RASTREADORES — o equipamento passa a ter registro:
(A) catalogo `empresas_rastreamento` (a prestadora que rastreia — o "Rastreador por:"; nome unico,
CNPJ, contato/telefone/e-mail, URL da plataforma, ativo; RLS staff-le / `tem_acesso_global`-mantem);
(B) na ficha do veiculo, `rastreador_imei`, `rastreador_chip` e `empresa_rastreamento_id`
(`on delete set null`: apagar a rastreadora nao leva o veiculo junto). Os campos sao OPCIONAIS —
nem todo veiculo tem rastreador, e a regra de cobranca continua em `tipos_veiculo.exige_rastreador`;
(C) o formato vale NO BANCO, nao so na tela: CHECK de IMEI (14-17 digitos) e de chip (8-22), e
UNIQUE PARCIAL do IMEI entre veiculos nao excluidos — um equipamento nao pode estar em dois
veiculos ao mesmo tempo, e excluir o veiculo devolve o IMEI para o proximo; (D) seed do alerta
reutilizavel "Rastreador pendente". Logica pura espelhada em `src/lib/rastreador.ts`.)
· `0050_rastreadores_modulo` (FASE 2 — o EQUIPAMENTO vira entidade: (A) `rastreadores` (um por
IMEI: estoque, chip/ICCID, operadora, modelo, aquisicao, plataforma, unidade, veiculo e associado)
com unique parcial `(veiculo_id) where status = 'ATIVO'` — um carro, um equipamento ativo;
(B) enum `status_rastreador` com os 11 status do sistema antigo e `numero_status_rastreador()`
preservando a numeracao que a equipe fala ("2 - Ativo"); (C) `rastreador_eventos` append-only
escrito por TRIGGER (a aplicacao esquece, a trigger nao) e `status_desde` carimbado no BEFORE —
e ele que sustenta os prazos; (D) `rastreador_manutencoes` com uma ordem aberta por equipamento;
(E) **a ficha do veiculo (0049) vira ESPELHO**: instalar/desinstalar escreve
`rastreador_imei`/`rastreador_chip`/`empresa_rastreamento_id` por trigger, entao o SAC continua
funcionando sem saber do modulo; (F) maquina de estados no banco
(`transicao_rastreador_valida`) + RPCs `instalar_rastreador`, `desinstalar_rastreador`,
`mover_status_rastreador`, `transferir_rastreador_regional` e as duas de manutencao;
(G) consulta: `rastreadores_listar` (paginada), `rastreador_ficha`, `rastreador_historico`,
`rastreadores_resumo` (dashboard + custo por plataforma), `rastreadores_a_recuperar`,
`rastreadores_movimentacao`, `rastreadores_giro_estoque`; (H) **`rastreadores_divergencias`** — o
cruzamento com o cadastro de veiculos, que e o valor do modulo; (I) `planos_protecao.exige_rastreador`,
somado a regra por tipo de veiculo que ja existia.)
· `0051_fornecedores_unificados` (UM CADASTRO SO: prestador da 24h, rastreadora e fornecedor de
pecas sao a mesma coisa — uma empresa que presta servico. (A) `fornecedores` ganha
`empresa_rastreamento` (mesmo padrao do `prestador_assistencia` de 0026) + `contato`,
`plataforma_url`, `custo_mensal_equipamento` e `api_config`; (B) `documento` deixa de ser
OBRIGATORIO (o CHECK segue valendo para o que for preenchido) — o cadastro de rastreadora que
foi absorvido nao exigia CNPJ; (C) MIGRA as linhas de `empresas_rastreamento` para
`fornecedores` (casando por CNPJ quando ha), reaponta `veiculos.empresa_rastreamento_id` e
`rastreadores.empresa_rastreamento_id` e SO ENTAO faz `drop table empresas_rastreamento`;
(D) as funcoes do modulo (0050) passam a ler `fornecedores`; (E) `pode_cadastrar_fornecedor()`
inclui o `gestor_regional` — quem contrata guincho e rastreadora na ponta e a unidade, e o
cadastro nao podia depender de admin.)
· `0052_seguranca_rpc` (AUDITORIA DE FIM DE PROJETO — a camada de RPC estava aberta:
(A) no Postgres o `execute` de funcao e concedido a `public` POR PADRAO, e o PostgREST publica
toda funcao do schema como RPC — ou seja, TODAS as nossas funcoes eram chamaveis com a chave
`anon`, a que vai no bundle do navegador. Revogado de `public`/`anon` e concedido explicitamente
a `authenticated` e `service_role`; as paginas publicas nao perdem nada porque rodam com
`service_role` no servidor; (B) `authenticated` NAO e so a equipe — o associado do /portal tem
login desde a 0044. Entao entrou trava DENTRO das funcoes que liam ou escreviam sem checar quem
chama, com destaque para `gerar_dre` e `resumo_por_centro_custo`, que devolviam o resultado
inteiro da empresa para qualquer usuario logado (agora exigem `is_staff()` e passam pelo
`escopo_regional`); tambem `classificar_captura`, `cliente_da_pessoa`, `lead_da_pessoa`,
`checklist_lead`/`fotos_vistoria_lead`, `interacoes_protocolo` e `liberar_leads_sem_contato`
(esta ultima so para a gestao); (C) a policy de insert de `lead_atribuicoes` aceitava qualquer
logado — agora exige staff.)
· `0056_memos_diretoria` (O MURAL VIRA MAO DUPLA: (A) a franquia so publicava para a PROPRIA
unidade — agora tem DOIS destinos e so dois: **minha equipe** (`regional_id` = a unidade dele) e
**diretoria** (`regional_id` nulo + `papeis` dentro de `papeis_diretoria()` = {admin, financeiro}).
Continua barrado publicar para a unidade vizinha ou soltar aviso geral, que e da matriz;
(B) `memos_do_usuario` perdeu o `or tem_acesso_global()`: com nove franquias publicando aviso
interno, a diretoria abriria o SAC com dezenas de recados que nao sao dela. O mural pessoal e o que
foi ENDEREÇADO a pessoa; para acompanhar tudo existe a tela da gestao; (C) `memos_gestao` ganhou
escopo (a matriz ve tudo; o gestor ve o da unidade dele + o que ele enviou) e a coluna `meu` —
muda a lista de OUT, entao foi drop + create.)
· `0057_memos_autor_ve` (QUEM PUBLICA PRECISA VER O QUE PUBLICOU — a 0056 acertou ao tirar o
`or tem_acesso_global()` do mural, mas a regra passou a valer tambem para o AUTOR: a matriz que
endereça um aviso a UMA unidade, ou a um papel que nao e o dela, publicava e nao via nada em tela
alguma; o gestor que manda recado a diretoria, idem. Sem retorno na tela a unica leitura possivel e
"o sistema quebrou". `memos_do_usuario` **recriada** (entram `papeis` e `meu` na lista de OUT, entao
drop + create) com `or m.publicado_por = eu.id`: o autor sempre ve o proprio comunicado, marcado
como **"voce publicou"** e com o DESTINO ao lado ("Para Cuiaba · Sinistro") — ver o aviso sem saber
para quem ele foi seria trocar uma duvida por outra. O mural de quem NAO publicou nao mudou. A tela
da gestao passa a avisar em vermelho quando o endereço escolhido **nao tem nenhum usuario ativo**
(`destinatarios = 0`), que e o outro jeito de um comunicado nao chegar a ninguem.)
· `0058_memos_respostas` (O COMUNICADO VIRA CONVERSA — o mural so ia de ida: publicava, a pessoa
lia, dava ciencia, e a devolutiva saia do sistema para o WhatsApp. `memo_respostas` guarda o papo,
e a decisao que importa e o RECORTE: um comunicado pode ir para dezenas de pessoas, e um mural
unico de respostas faria o desabafo do gestor de Cuiaba ser lido pelas outras oito unidades — entao
cada destinatario tem a SUA conversa com quem publicou (`com_usuario_id`, fixo na linha do papo).
O destinatario ve so a dele; quem publicou (e a matriz) ve todas e responde em cada uma.
`memo_visivel_para()` passa a ser a UNICA definicao de endereçamento — a que o mural usa e a que
autoriza responder — e de proposito NAO olha `publicado`/`expira_em`: a conversa nao pode sumir no
meio so porque o aviso venceu. RPCs `responder_memo`, `memo_conversas`, `memo_mensagens` e
`marcar_conversa_lida`; `memos_do_usuario` e `memos_gestao` **recriadas** com o contador de
respostas e o que falta ler.)
· `0059_protocolo_evento_pareceres` (O EVENTO TRAMITA DE VERDADE E PEDE PARECER — (A) o card
"Tramitar Protocolo" do sinistro mandava como destino o operador que JA estava com o evento (ou
string vazia): nunca transferiu para ninguem, so trocava o status e guardava um parecer solto — e a
funcao aceitava calada, sem checar staff nem se o destino existia. `transferir_protocolo` recriada
com destinatario validado e recusa de tramitacao vazia; (B) o MECANISMO JA EXISTIA e nao estava
ligado: `atendimentos.evento_id` esta na tabela desde a 0022 sem ninguem escrever nele. Agora
`protocolo_do_evento()` cria/reaproveita o protocolo do evento (herdando associado, veiculo e
unidade), e tramitar o evento vira transferir o protocolo — ele aparece na Central, em "Meus
protocolos" e na Central do Atendente. O `historico_protocolo` continua sendo escrito: e dele que
a linha do tempo do sinistro e o Kanban vivem; (C) PARECER — sinistro vai para o juridico, para a
vistoria, para a diretoria, cada um opina e volta. Isso e um PEDIDO COM RESPOSTA, nao um
comentario: duas interacoes novas (`PARECER_SOLICITADO` -> `PARECER`) ligadas por
`protocolo_interacoes.responde_a`; enquanto nao ha resposta o pedido esta PENDENTE. RPCs
`solicitar_parecer` (varias pessoas de uma vez, sem duplicar pedido em aberto), `responder_parecer`
(so de quem foi chamado — a matriz destrava quem saiu de ferias), `pareceres_protocolo` e
`meus_pareceres_pendentes`; `listar_protocolos` **recriada** com `evento_id` e
`pareceres_pendentes`.)
· `0055_memos_comunicados` (MURAL INTERNO — a tela do SAC nascia vazia ate alguem ser buscado, e
e justamente ai que a equipe precisa de tres respostas: o que esta na MINHA mao, o que a gestao
MANDOU e o que esta pegando fogo. (A) `memos` — comunicado publicado pela gestao, ENDEREÇAVEL por
unidade (`regional_id` nulo = todas) e por papel (`papeis` nulo/vazio = todos), com `categoria`
(COMUNICADO/SCRIPT/URGENTE), `prioridade`, `exige_leitura` e `expira_em`. Categoria e prioridade
sao TEXTO com CHECK, nao enum (a lista cresce e enum novo nao pode ser usado na mesma transacao);
(B) `memo_leituras` — a ciencia de cada um, sem update nem delete; (C) RPCs `memos_do_usuario()`
(mural ja com o `lido` e a ordem: ciencia pendente > prioridade > data), `marcar_memo_lido()`,
`salvar_memo()`, `memos_gestao()` (com quantos leram de quantos) e `arquivar_memo()`;
(D) `pode_publicar_memo()` = matriz publica para qualquer unidade, gestor regional so para a
propria.)
· `0054_usuarios_protecao_admin` (A EQUIPE VIRA EDITAVEL — e o banco fecha duas portas:
(A) ESCALADA DE PRIVILEGIO: a policy `usuarios_update_self` (0003) libera update na PROPRIA linha
e RLS **nao restringe coluna** — qualquer usuario da equipe podia rodar
`update usuarios set papel = 'admin' where id = auth.uid()` e virar administrador sozinho. Trigger
`fn_usuarios_campos_sensiveis`: papel, unidade e ativacao so mudam por admin (ou pelo servidor,
que roda sem sessao com service_role). Corrigir o proprio nome continua liberado;
(B) `fn_usuarios_protege_ultimo_admin` recusa rebaixar, desativar ou apagar o ULTIMO admin ativo —
a trava vive no banco porque a rota de edicao usa service_role, que ignora RLS.)
· `0053_rastreador_ciclo_financeiro` (O EQUIPAMENTO OBEDECE AO CADASTRO E AO FINANCEIRO:
(A) trigger `fn_veiculo_move_rastreador` — veiculo que vai para inativo/suspenso/baixado/excluido
manda o rastreador instalado para "4 - Inativo (pedir devolucao)" na hora;
(B) `sincronizar_rastreadores_inadimplencia(dias, regional)` marca "3 - Inadimplente" quem passou
do prazo e DEVOLVE para "2 - Ativo" quem pagou, pela mesma leitura de atraso da 24h
(`dias_atraso_cliente`), com o motivo no historico do aparelho; botao "Aplicar inadimplencia" na
tela de divergencias; (C) `instalar_rastreador` recusa associado com mais de 35 dias de atraso —
a matriz (`tem_acesso_global`) libera, a ponta nao; (D) `cobrar_rastreador(rastreador, valor,
vencimento)` gera o titulo a receber do equipamento nao devolvido e move para "7 - Boleto gerado",
fechando o buraco dos status 6 e 7; (E) `situacao_rastreamento_veiculo(veiculo)` — o que o SAC
mostra: tem equipamento? esta suspenso por debito? ha quantos dias de atraso?)

· `0060_limpeza_atendimentos_orfaos` (CORRETIVA: desfaz a `0025_assistencia_24h` orfa que uma
sessao aplicou em producao vinda do branch parado — restaura `abrir_atendimento` e
`opcionais_elegibilidade` as versoes de 0021/0022 ANTES de dropar as 12 colunas mortas de
`atendimentos`, o trigger `trg_atendimento_conclusao` e as 11 RPCs que liam fonte vazia.
Idempotente e no-op em base limpa. A suite 0060 prova que o SAC continua abrindo protocolo
depois da limpeza e que as colunas da Central de Protocolos (0029) ficam de pe).
· `0061_assistencia_painel` (PAINEL GERENCIAL da Assistencia 24h, so LEITURA, sobre
`acionamentos_assistencia`: `assist_painel_movimentos` (fonte unica — CANCELADO nunca entra e a
praca cai no endereco do associado quando a OS nao tem origem), `_resumo` (frota + volume +
indice + SLA + custo + **custo por veiculo ativo** + reincidentes), `_por_servico` (com a regra de
limite do catalogo e QUANTOS VEICULOS JA ESTAO NO TETO), `_por_praca` (traz a frota da praca junto:
a **taxa** e que aponta o alvo, nao o volume), `_serie`, `_reincidencia` e `_frota_situacao`;
helper `norm_cidade`. Todas SECURITY DEFINER + `escopo_regional` + o rito de revoke da 0052).
· `0064_mutual_dia_vencimento_contrato` (CORRETIVA: o dia de vencimento EXISTE no Mutual — esta na
"Configuracao da cobranca" do CONTRATO, nao no objeto. O diagnostico acusava centenas de
"Faturavel sem dia de vencimento" com o dado existindo, so noutro endpoint. `mutual_diagnostico` e
`mutual_quarentena` passam a resolver `due_day` e `regional` pelo `/contract/` (objeto como
fallback); enquanto ninguem puxou os contratos, o indicador vira ATENCAO e a tela diz "puxe
/contract/" em vez de acusar o dado. Entram tambem "Contratos capturados", "Objeto sem contrato
correspondente" e "Faturavel em contrato NAO mensal". `mutual_periodicidade()` mostra periodo x
parcelas x valor mediano/min/max do objeto — e a consulta que responde se `final_total_value` e a
PARCELA ou o TOTAL, porque `valor_mensalidade` (0024) e MENSAL e a tela do Mutual mostrou contrato
semestral com 6 parcelas de R$ 120 e total R$ 720. `mutual_meses_periodo` espelha
`mesesDoPeriodoMutual`, devolvendo null para periodo desconhecido em vez de assumir mensal).
· `0065_mutual_inspecionar_campos` (a carga completa respondeu a pergunta do valor —
`final_total_value` e a PARCELA (semestral mediana R$ 164 x mensal R$ 204,50; fosse o total seria
~6x) — e abriu outra: a UNIDADE nao esta em `regional` nem no objeto nem no contrato, 3.527 de
3.527 faturaveis sem ela. Em vez de chutar um terceiro lugar, entrou `mutual_campos(entidade,
caminho, amostra)`: lista as chaves do payload capturado, quantas vem preenchidas e um exemplo,
inclusive dentro de objeto aninhado. Junto, duas grafias novas do MESMO vocabulario
(`INDENIZACAO`/`INDENIZAÇAO` -> em_evento, ao lado de `INDENIZADO`; `INATIVO/PAGO` -> inativo);
`DIFICULDADE FINANCEIRA` fica DE FORA de proposito — sem par obvio, mapear no escuro manda boleto
para quem nao devia ou tira da base quem ainda paga).
· `0066_mutual_indenizado_nao_fatura` (DECISAO DO USUARIO: "quem esta em Indenizado, Indenizacao,
Inativo/pago nao vamos gerar mensalidades". Muda o de-para, e nao e cosmetico: `em_evento` E
FATURAVEL (esta em `veiculo_faturavel`, 0024, ao lado de ativo e vistoria_pendente), entao os 26
veiculos ja indenizados receberiam boleto todo mes. Foram para `inativo`. `SINISTRADO` CONTINUA
`em_evento` de proposito — sinistro em andamento e associado ativo que segue pagando; indenizado ja
recebeu e saiu. `DIFICULDADE FINANCEIRA` segue sem mapeamento (o usuario nomeou tres status, e esse
nao estava). Junto, `mutual_por_status` parou de rotular vocabulario desconhecido como "funil de
venda": funil e decisao TOMADA, desconhecido e decisao PENDENTE, e juntar os dois escondia o que
falta responder).
· `0067_regional_completa` (CONTROLE TOTAL DA REGIONAL: a unidade ganha `telefone`, `email`,
`ativo` e `inativada_em` (carimbada por trigger). (A) unidade INATIVA sai de circulacao — nao
recebe vendedor novo (`fn_vendedor_regional_ativa`), nao resolve hotlink (`resolver_hotlink`
recriada exigindo `regional_ativa`, inclusive para o vendedor DELA) e some das listas de escolha;
o que ela ja produziu continua inteiro nos relatorios e no DRE; (B) **EXCLUIR unidade com
movimento passa a ser RECUSADO pelo banco** (`fn_regional_bloqueia_exclusao`) — as ~20 FKs que
apontam para `regionais` sao `on delete set null` e neste sistema `regional_id is null` significa
MATRIZ, entao apagar uma franquia moveria a carteira dela para o escopo da matriz em silencio;
o erro nomeia o que esta pendurado; (C) `regionais_listar(p_incluir_inativas)` devolve a unidade
com equipe, carteira, lancamentos e `pode_excluir` — e a tela de controle total. Espelho puro em
`src/lib/regional.ts`).
· `0068_usuarios_ficha` (O USUARIO VIRA CADASTRO DE RESPONSABILIDADE — e a `ativo` passa a
valer: (A) `telefone`, `documento` (CPF validado, unique PARCIAL porque o campo e opcional),
`cargo` (funcao na empresa, NAO confundir com `papel`, que e permissao), `data_inicio`,
`data_desligamento` (carimbada por trigger ao desativar, limpa ao reativar) e `observacoes`;
(B) **`is_staff()`, `auth_papel()` e `auth_regional_id()` passam a exigir `and ativo`** — ate aqui
desmarcar "Usuario ativo" mudava um checkbox e nada mais, com a tela prometendo o contrario.
Sao os tres helpers-raiz, entao `is_admin`, `tem_acesso_global`, `pode_regional`, `pode_auditar` e
`pode_liberar_assistencia` caem junto sem tocar em mais nada; `vendedor_atual()` (0038) tambem foi
recriada para o portal do vendedor cair junto; (C) `usuario_acesso_ativo()` para a TELA explicar o
corte e `usuarios_listar(p_incluir_inativos)` com unidade, vinculo de vendedor e por quantas
unidades a pessoa responde. Espelho puro em `src/lib/usuario.ts`).
· `0069_vendedores_importacao` (CARGA DA EQUIPE DE VENDAS POR PLANILHA: (A) `vendedores.documento`
normalizado para SO DIGITOS + unique PARCIAL — vira a chave de reconciliacao, e parcial porque o
campo e opcional (0035); (B) `importar_vendedores(p_linhas jsonb, p_respeitar_status)` — upsert
re-executavel por documento e, sem ele, por e-mail. ATOMICA de proposito, e a previa da TELA e que
impede a explosao (teto da franquia 0034, unidade ativa 0067, regional mapeada); (C) tres decisoes
no banco: **todos entram INATIVOS** por padrao, **comissao entra ZERADA** e **nunca cria acesso ao
portal**; (D) reimportar NAO apaga o que a planilha nao traz — comissao e banco configurados na tela
sobrevivem. `regional_id` nulo e RECUSADO: aqui nulo significa MATRIZ. Espelho puro em
`src/lib/vendedores-import.ts`).
· `0071_mutual_status_do_objeto` (CORRETIVA — duas leituras que inflavam a quarentena:
(A) `mutual_status_veiculo` lia `contract_status` e so olhava o `status` do objeto no caso
`REMOVIDO`. Mas o contrato guarda VARIOS veiculos, entao ele fala do ASSOCIADO: ativo por causa de
OUTRO carro, com AQUELE veiculo encerrado entrando como faturavel e sendo cobrado por valor e dia
de vencimento que contrato encerrado nao tem. **A regra NAO virou "o objeto vence"** — objeto
"ATIVO" em contrato CANCELADO e veiculo sem cobertura. Vence o **MENOS VIVO dos dois**
(`mutual_vitalidade`), e funil de venda no contrato descarta a linha de qualquer jeito
(`mutual_e_funil_venda`). O vocabulario saiu para `mutual_status_de_texto` (uma palavra -> um
status); (B) `mutual_status_cruzado()` — contrato x objeto com quantos MUDAM de classificacao, o
instrumento que mede a mudanca ANTES da carga; (C) **sem placa deixou de ser dado sujo**: com
chassi e 0 KM (grupo `PLACA PENDENTE (0 KM)`, fora da quarentena por padrao), sem os dois e
`SEM_PLACA_NEM_CHASSI` e continua CRITICO. `mutual_quarentena` recriada com
`p_incluir_placa_pendente` (muda a assinatura) e a situacao passa a mostrar
"INATIVO (associado: ATIVO)"; (D) `mutual_status_nao_mapeados` **recriada** com a coluna `origem`
— o status do OBJETO agora decide carga, entao palavra nova la classifica veiculo errado em
silencio).
· `0072_veiculo_inadimplente` (o status `inadimplente` do VEICULO — a tolerancia entre "a
mensalidade atrasou" e "o contrato acabou": (A) enum `status_veiculo` ganha `inadimplente`;
(B) **o RELOGIO** — `veiculos.status_desde`/`status_motivo` carimbados por trigger BEFORE a cada
troca de status (padrao de `rastreadores.status_desde`, 0050), com `clock_timestamp()` e nao
`now()`, senao duas trocas na mesma transacao nasceriam com o mesmo instante; (C) **o PARAMETRO** —
`empresa.dias_tolerancia_inadimplencia` (20), lido por `tolerancia_inadimplencia()` e por
`situacao_inadimplencia_veiculo()`, a contagem regressiva que a TELA mostra hoje e que o CRON vai
ler amanha; (D) **`veiculo_faturavel` passa a INCLUIR `inadimplente`** — ver a secao propria, e a
decisao mais perigosa da migration ao contrario do que parece; (E) `ordem_status_veiculo` poe
`inadimplente` antes de `suspenso` (e o unico com prazo correndo); (F)
`situacao_assistencia_veiculo` explica o bloqueio em vez de so recusar; (G) o rastreador segue o
ciclo em DOIS passos — inadimplente suspende (3), sair da base recolhe (4) — e o laco antigo, que
so pegava equipamento em `ATIVO`, deixaria preso em 3 o que a tolerancia acabara de mover;
(H) o painel da 24h conta `inadimplente` como BLOQUEADO, nao como inativo. **Nao ha rotina que
mova ninguem:** nenhum veiculo nasce `inadimplente` hoje, entao tudo isto e no-op ate o CRON).
· `0074_mutual_consultor_sem_duplicar` (CORRETIVA da 0073 — o instrumento estava contando
errado, que e pior que nao existir: ele nao adia a decisao, toma-a com numero falso.
(A) o `left join vendedores` MULTIPLICAVA a linha do VEICULO: `documento` e unique parcial
(0069), mas `email` e `nome` NAO sao, entao dois vendedores com o e-mail da franquia (ou dois
homonimos) faziam cada veiculo daquele consultor virar duas linhas na CTE `passos` — e o funil
inteiro e `count(*)` sobre ela. No cenario do teste: **16 onde existem 5**, e como a inflacao so
acontece nas linhas com colisao, `perdidos` (subtracao entre degraus) virava ruido. A correcao
NAO e `distinct`, que esconderia a colisao: o casamento com o vendedor e propriedade do
CONSULTOR, nao do veiculo, e passa a ser resolvido uma vez por consultor com `lateral ... limit 1`
e ordem estavel — de quebra, centenas de linhas em vez de dezenas de milhares. A ambiguidade
deixa de ser silenciosa: o degrau 5 diz quantos veiculos dependem de um desempate arbitrario;
(B) `mutual_texto_em`/`mutual_chave_em` prometiam PRECEDENCIA (`cpf_cnpj` antes de `cpf` antes de
`document`) e entregavam `limit 1` sobre `unnest` SEM `order by` — ordem por acaso. Agora
`with ordinality` + `order by ord`. So leitura, nenhuma assinatura muda).
· `0073_mutual_consultor_regional` (A UNIDADE PELO CONSULTOR — o instrumento, nao a carga:
`regional` veio vazio em 100%, e a tese que sobrou tem QUATRO saltos
(`objeto.consultant` CODIGO -> `/association/consultant/` -> documento/e-mail -> `vendedores` ->
`regional_id`). Tese de quatro saltos nao se aceita pelo desenho; se mede.
`mutual_cobertura_consultor()` conta quantos veiculos sobrevivem a cada degrau e a quem atribuir
a perda; `mutual_consultores_sem_vendedor()` da a FILA por volume de veiculos, com o motivo de
cada um. Helpers `mutual_texto_em`/`mutual_chave_em` (primeira chave nao vazia entre candidatas —
existem para NAO chutar o nome do campo, licao das duas rodadas perdidas) e
`mutual_consultor_do_objeto` (objeto manda, contrato e reserva — mesma precedencia do `due_day`
na 0064). **A chave de reconciliacao e a MESMA da 0069** (documento so digitos manda, e-mail
minusculo e reserva): medir por chave que a carga nao usa produz numero bonito e falso — por isso
o casamento por NOME entra como informativo, nunca no funil. Sem `CONSULTANT` capturado o degrau
diz "puxe Consultores" em vez de acusar o dado, regra da 0064. So leitura).
· `0062_integracao_mutual` (FASE 1 da integracao com o MUTUAL — espelho de LEITURA e diagnostico:
`mutual_captura` (entidade + id_externo unico, payload jsonb, soft-delete) e `mutual_sincronias`;
os espelhos em SQL da logica de `src/lib/mutual.ts` (`mutual_texto`, `mutual_status_veiculo`,
`mutual_tipo_pessoa`); e as RPCs `mutual_registrar_captura` (upsert re-executavel, so
`tem_acesso_global`), `mutual_diagnostico`, `mutual_por_status`, `mutual_filiais`,
`mutual_quarentena` e `mutual_resumo_capturas`. **Nada escreve na operacao** — ha teste provando
que `clientes`, `veiculos`, `titulos_financeiros` e `faturas` seguem zerados).
· `0063_mutual_diagnostico_faturavel` (CORRETIVA da 0062, escrita a partir da PRIMEIRA LEITURA DA
BASE REAL: (A) o grupo `BLOQUEIO` do diagnostico contava valor/dia/ativacao sobre TODO objeto
importavel, inclusive contrato INATIVO — onde a ausencia e o esperado, porque veiculo inativo nao
passa em `veiculo_faturavel` (0024) e nunca gera boleto. Foram 2.432 falsos CRITICOS afogando os
verdadeiros. Agora a conta e feita sobre a CTE `fat` (os tres status de `veiculo_faturavel`), os
indicadores ganharam o prefixo "Faturavel", entrou o VOLUME "Entrariam FATURAVEIS (a carteira
viva)" e o acervo encerrado virou o grupo informativo `ACERVO INATIVO`; (B) `/contract/` vira
entidade capturavel — `due_day` veio vazio em 2.497 de 2.497 e `regional` em 100% dos objetos, ou
seja os dois moram no CONTRATO; (C) `AGUARDADO A RETIRADA DO RASTREADOR`, ausente do enum do
swagger, entra no de-para como inativo, e a nova `mutual_status_nao_mapeados()` lista todo status
desconhecido que nao seja funil — sem ela, vocabulario novo do Mutual vira veiculo faltando na
carga, em silencio; (D) `mutual_quarentena` recriada com `p_somente_faturaveis` (muda a
assinatura, entao e drop + create) e dois indicadores novos: placa fora do padrao e objeto sem
unidade declarada).
· `0076_vistoria_link_publico` (A VISTORIA PELO CELULAR DO CLIENTE — `vistorias.token_publico` +
`token_expira_em` (unique PARCIAL, porque vistoria de veiculo nao tem token) e
`vistoria_anexos.enviado_pelo_cliente`; `gerar_link_vistoria` (7 dias; reemitir devolve o MESMO
token enquanto vigente, senao quebraria a mensagem ja mandada no WhatsApp),
`vistoria_por_token` (devolve SEMPRE uma linha, com o MOTIVO — a pagina precisa distinguir "link
errado" de "vencido" e de "venda concluida") e `registrar_foto_vistoria_publica` (valida a pose
contra o catalogo, marca a origem e carimba `ultima_interacao_em`). `fotos_vistoria_lead`
**recriada** com `enviado_pelo_cliente` — muda a lista de OUT, entao drop + create, e o
`where is_staff() or auth.uid() is null` da 0052 foi reescrito junto. Ver a secao propria).
· `0077_papeis_cotador_sinistro` (A VARREDURA DOS 8 PAPEIS virou decisao: (A) `cotador`
APOSENTADO — tinha duas ocorrencias no schema inteiro e nenhuma era codigo (a declaracao do enum e
um comentario), entao oferecia na tela um grupo de acesso que o banco ignorava. Enum nao perde
valor, entao a aposentadoria e em tres passos: mover quem esta la para `consultor_vendas` (escolha
NEUTRA em acesso — os dois papeis nao sao citados por helper algum e ficam fora de
`pode_ver_carteira_regional` juntos), RECUSAR por CHECK (`/api/usuarios` escreve com service_role,
que ignora RLS) e sair de `PAPEIS_USUARIO` e da union `PapelUsuario`; `memos.papeis` migra junto,
senao aviso vigente pararia de chegar em silencio; (B) `sinistro` passa a GOVERNAR O EVENTO — ate
aqui ele existia so dentro de `pode_assistencia()`, ou seja destravava a 24h e nao governava evento
nenhum. Novo `pode_tratar_evento(regional)` nas policies de `eventos_sinistro` (update),
`cotacoes_pecas`, `itens_cotacao`, `notas_fiscais_evento` e `anexos_evento` (delete). **Ver e ABRIR
continuam de todo staff da unidade de proposito: nao existe papel `sac` e e o atendente que
registra o evento quando o associado liga.** (C) **policy sozinha seria MEIA PORTA**:
`transferir_protocolo` (0059) e SECURITY DEFINER e nao passa por policy — e e ela que o card
"Tramitar" chama. A trava foi para dentro dela, com corte mais fino (mudar STATUS exige
`pode_tratar_evento`; transferir e opinar seguem no staff da unidade, porque juridico e vistoria
opinam no sinistro sem serem o time dele) e o piso virou `pode_regional` — ate aqui bastava
`is_staff()` e um atendente de Natal tramitava evento de Cuiaba pela RPC; (D) `sinistro` SAI de
`pode_assistencia()`. Espelho puro em `podeTratarEvento` (`src/lib/usuario.ts`) para a tela nao
oferecer o seletor de status a quem o banco recusa).
· `0070_cotacao_troca_plano` (DESCER DE PLANO: `atualizar_cotacao` (0028) resolvia o combo com
`coalesce(p_plano_id, c.plano_id)`, entao NULO era "mantem o que esta" — bom para upgrade e troca
lateral, impossivel para o downgrade ate a base: escolher "Somente cobertura base" salvava calado e
a cotacao seguia cobrando o combo. Novo parametro `p_limpar_plano` (default `false`, entao o
`aplicar_desconto_cotacao`, que chama por posicao, nao muda). A lista de argumentos muda, entao foi
DROP + CREATE — sobrecarga deixaria a chamada ambigua.)
· `0078_regionais_painel` (DASHBOARD EXECUTIVO DAS REGIONAIS — a leitura de CIMA que faltava: o
`/regional` (0036) e a operacao de UMA franquia, e ninguem enxergava quantas unidades existem,
qual cresce, qual perde carteira e qual gasta com evento mais do que arrecada. (A) **O CHURN GANHA
DATA:** `veiculos.data_saida` + trigger `trg_veiculo_marca_saida` (mesmo padrao do
`trg_veiculo_marca_ativacao`, 0025) — antes "cancelados no periodo" so podia ser adivinhado pelo
`updated_at`, que qualquer correcao de ficha mexe. Saida e DEFINITIVA (inativo/baixado/excluido);
**SUSPENSO nao e saida** — devedor continua na carteira, e quem mostra isso e a inadimplencia.
Voltar para a base LIMPA o campo. Backfill do historico pelo `updated_at` (a melhor aproximacao
que existia, e vale so para o passado); (B) **a carteira e lida por DATA, nao por status**:
`frota_na_base(data, regional)` = ja ativado e ainda nao saiu NAQUELE dia — e o que permite
comparar com o periodo anterior, porque `status` sozinho so sabe o agora; (C) **o recorte do plano
de contas e institucional**: `empresa.painel_conta_de/painel_conta_ate` (nao `localStorage` — o
recorte muda o "Valor Recebido" que a diretoria le, e dois gestores nao podem ver numeros
diferentes), com `salvar_intervalo_contas_painel` so para `tem_acesso_global()`,
`intervalo_contas_painel`, `contas_plano_painel` e `codigo_conta_ordenavel`/`conta_no_intervalo` —
comparar codigo de conta como TEXTO mente ('1.10.00' < '1.9.99'), entao cada segmento vai para 4
digitos; (D) as tres RPCs de leitura: `regionais_painel_resumo` (15 indicadores com o periodo
anterior de mesmo tamanho ao lado), `regionais_painel_serie` (granularidade automatica —
dia ate 45 dias, semana ate 200, mes acima; `ativos`/`inadimplentes` sao RETRATO no fim do balde e
`sinistros`/`recebido`/`gasto` sao SOMA do balde) e `regionais_painel_comparativo` (uma linha por
unidade, com sinistralidade = gasto com evento / recebido). Todas SECURITY DEFINER +
`escopo_regional` + o rito de revoke da 0052, e com a trava de **staff** por dentro: `authenticated`
inclui o associado do /portal desde a 0044, entao quem nao e staff recebe o painel VAZIO em vez da
carteira da empresa).

· `0079_busca_leads_sem_acento` (A BUSCA DA LISTA DE `/vendas` PARA DE DEPENDER DA ABA ABERTA:
o Kanban filtra em JS e achava "JOÃO" digitando "joao"; a Lista filtra no banco e nao achava,
porque `ilike` compara byte a byte. **E o acento era a metade menor** — a busca por telefone e CPF
procura por DIGITOS, mas `leads.celular` nem sempre esta em digitos: a captura grava limpo e o
`<FechamentoVenda>` grava MASCARADO (`maskCelular`), entao nesses leads o telefone nao achava nada.
A correcao e a mesma para os dois: normalizar a COLUNA, nao so o termo. Duas colunas GERADAS
(`leads.busca_texto` = nome+marca+modelo+placa sem acento; `leads.busca_digitos` = celular+cpf so
com digito), que nao saem de sincronia porque ninguem as escreve. Coluna gerada exige IMMUTABLE e o
`unaccent` do contrib e STABLE, entao entrou o embrulho `texto_sem_acento(text)` com a forma de
DOIS argumentos (dicionario fixo). Indice GIN/trigrama nas duas. Escolha registrada: coluna gerada
em vez de RPC de busca, para a consulta seguir `select('*')` e a RLS de `leads` (0038) continuar
valendo sem uma segunda copia dentro de um `security definer`. A Lista tambem passou a procurar a
MARCA, que so o Kanban procurava).
· `0080_cores_veiculo` (O CATALOGO DE CORES — `veiculos.cor`/`leads.cor` eram TEXTO LIVRE escrito por
tres caminhos que nunca combinaram (digitacao, consulta por placa 0075, carga do Mutual), e por isso
PRATA/Prata/prata metalico eram quatro cores para o banco: `cores` (as 16 do CRLV, com hex de
amostra) + `cor_apelidos` (unique no APELIDO, para um apelido nao apontar para duas cores);
`cor_normalizada` (reusa o `texto_sem_acento` da 0079) e `cor_do_texto` em QUATRO degraus (nome,
apelido, primeira palavra como nome, primeira palavra como apelido); `veiculos.cor_id`/`leads.cor_id`
opcionais AO LADO do texto (o que `modelo_id` fez na 0016 — trocar a coluna obrigaria a mexer em todo
leitor que ja existe); o trigger `fn_padronizar_cor` canoniza na escrita por QUALQUER caminho e vale
o lado que o chamador MUDOU (texto digitado vence id antigo; id da carga traz o texto do catalogo);
cor desconhecida **ENTRA e e RELATADA** (`cores_nao_reconhecidas`), nunca recusada no balcao; e o
de-para do Mutual (`mutual_cor_do_externo`, `mutual_cores_nao_mapeadas`) resolve pelo payload de
`/vehicle/color/` ja capturado, sem chutar o nome da chave).
· `0083_mutual_equipe_vendas` (A UNIDADE DO SCar E A **EQUIPE DE VENDAS** DO MUTUAL, nao a
filial: o Mutual tem tres niveis (regional -> sale_team -> consultant) e o SCar tem um, e a decisao
do usuario e que `regionais` = equipe de vendas — a macrorregiao NAO vira tabela. (A) `SALE_TEAM`
vira entidade capturavel (`/association/sale_team/`), que nunca foi puxada porque o plano concluiu
"nao existe no SCar"; (B) `mutual_equipe_do_objeto` (o CONTRATO manda: `sales_team_id` em 97,7%
dos contratos e em 3.384 de 3.384 faturaveis com contrato; no objeto a chave existe e vem vazia em
100%) + `mutual_equipe_do_externo` (so o vinculo REGISTRADO); (C) `mutual_equipes_vendas()` — a
tela do agrupamento, com o peso da carteira, a macrorregiao como cabecalho de leitura e a marca
`capturada` para a equipe que tem carteira e nao tem nome; (D) `mutual_regional_do_objeto` — a
EQUIPE manda e a filial do associado e reserva (para os objetos sem contrato); (E)
`mutual_cobertura_unidade` recriada medindo a corrente certa. **Corrige tambem uma medicao errada
da 0082:** `contrato.consultant` nao existe — a chave e `consultant_id`, preenchida em 96,4%)
· `0084_carga_mutual` (A CARGA — Fase 3, por UNIDADE, re-executavel. QUATRO funcoes:
`mutual_carga_linhas` (a LEITURA, uma linha por objeto, ja saneada, com a acao CRIAR/ATUALIZAR/
RECUSADO e o MOTIVO da recusa — e a FONTE UNICA: a previa agrega sobre ela e a execucao percorre
ela, entao nao ha duas leituras para divergir, que foi o preco que a 0082 pagou com quatro lugares
lendo a unidade de formas diferentes), `mutual_carga_previa`, `mutual_executar_carga` (sem
`p_confirmar` nao escreve nada) e `mutual_desfazer_carga` (o caminho de volta pelo vinculo, que
PRESERVA o veiculo com movimento — `veiculo_tem_movimento`). Saneadores `mutual_placa`,
`mutual_chassi`, `mutual_renavam`, `mutual_ano`, `mutual_data`, `mutual_uso_veiculo`; de-para por
vinculo em `mutual_tipo_veiculo_do_externo`/`mutual_plano_do_externo` +
`mutual_tipos_veiculo_externos` (a tela, com o PESO da carteira). Nenhum veiculo e faturado: todos
entram com `cobranca_externa`, e e por ela que passam as 5 rotas de fatura da 0025)
· `0085_mutual_de_para_plano` (o de-para do PLANO que a 0084 deixou faltando: `'PLAN'` entra na
allow-list `chk_mutual_entidade` (0062) — era ela que RECUSAVA `/plan/` e deixava os `plan_id`
como numeros sem nome —, `mutual_planos_externos(regional)` e a tela do de-para **com a COBERTURA
ACUMULADA** (e ela que diz onde parar: 18 dos 42 ids cobrem 90% dos 481 faturaveis da matriz) e
`mutual_tipos_veiculo_externos` recriada trocando `regional_id` por **`destino_id`** — a coluna
guardava um `tipos_veiculo.id` e o nome mentia. So leitura: nao carrega, nao muda preco e nao
toca em `veiculos`. **Duas hipoteses medidas e DESCARTADAS antes:** (1) "o preco identifica o
plano" — a amostra da matriz sugeria `plan_id` = faixa de preco, e a base viva inteira desmente
(a FIPE varia 6x a 14x dentro do MESMO id, 1.111x no id 48; e combo comercial, nao faixa);
(2) "sao 42 decisoes, inviavel" — falso, e e o que torna isto entregavel)
· `0086_mutual_comentario_cobertura` (so o `comment on function mutual_planos_externos`: 18 dos 42
ids cobrem 90% da matriz, nao 17; 29 dos 91 na base viva, nao 26. Nenhuma funcao, tabela, policy ou
permissao muda — a 0085 e append-only e o texto errado saiu aqui)
· `0087_mutual_categoria_veiculo` (o TIPO DE VEICULO sai da CATEGORIA do Mutual, pedido do usuario:
`vehicle_category` vem em 100% dos objetos e `/vehicle/category/` (44 categorias) estava capturada
desde a 0062 sem uso. **A chave e o PAR `'<categoria>/<tipo>'`** porque a categoria 26 "PASSEIO"
junta 1.950 carros e 1.054 motos. Precedencia de `mutual_tipo_veiculo_do_objeto`: o vinculo da
categoria manda, o de `VEHICLE_TYPE` (0084) e reserva, sem os dois e nulo. `mutual_carga_linhas`
recriada trocando so a linha do `tipo_id`; `mutual_categorias_veiculo(regional)` e a tela, com peso
da unidade, cobertura acumulada, destino e reserva. A COTA (V5..V15) que o nome da categoria carrega
so e MOSTRADA — a carga nao grava cota, decisao a parte)
· `0088_plano_sem_casco` (PLANO SEM PROTECAO DE CASCO: `planos_protecao.sem_casco` + `cotar_plano`
recriado com a MESMA assinatura — plano marcado tira do detalhamento e do total o item OBRIGATORIO da
categoria CASCO. Um ponto so, porque `cotar_plano` alimenta a ficha do SAC (`opcionais_veiculo`), os
obrigatorios da cotacao, o snapshot da venda e o hotlink. Casco amarrado ao plano como OPCIONAL fica;
Taxa Adm, 24h e a regra do rastreador ficam; adesao e participacao nao foram tocadas (o que fazer com
a participacao de quem nao tem casco e decisao a parte — o retorno anuncia `sem_casco`). Default
false; override do veiculo continua mandando no boleto)
· `0089_produto_tipo_veiculo` (PRODUTO POR TIPO DE VEICULO: `produto_tipos_veiculo (produto_id,
tipo_veiculo_id)` com FK nas duas pontas — TABELA, nao array, para apagar um tipo nao deixar produto
restrito a ninguem. SEM LINHA = TODOS OS TIPOS (no-op ao aplicar). `produto_atende_tipo` e SECURITY
DEFINER porque o motor tambem roda para o associado do /portal, que a RLS da tabela nao deixa ler.
`calcular_mensalidade` com o corpo da 0081 + UMA condicao no laco: a regra vale NO MOTOR, entao
parabrisa amarrado ao Ouro some do preco e da ficha do SAC da moto no Ouro, e o mesmo plano segue
servindo carro e moto. Boleto: so muda veiculo SEM override (3 na base em 05/10). Espelho puro em
`src/lib/produtos.ts` (`produtoAtendeTipo`, `produtosParaTipo` — que MANTEM na tela o avulso ja
gravado, marcado "nao atende este tipo", para o salvar nao apaga-lo calado)
· `0090_rastreador_opcional` (O RASTREADOR OPCIONAL SO ABAIXO DO MINIMO: `produtos.rastreador_avulso`
marca o rastreador opcional (o produto "Rastreador", R$ 35, ja nasce marcado); `calcular_mensalidade`
decide a regra do tipo ANTES do laco e pula o opcional quando ela ja cobra — avulso ou amarrado a
plano. Antes, carro acima de R$ 60 mil com o opcional pagava R$ 70 por UM equipamento. Marcador e
nao categoria, porque o produto do plano RASTREAMENTO tambem e categoria RASTREADOR e nao pode sumir)
· `0091_mutual_produtos_do_objeto` (O PLANO DA MOTO PELOS PRODUTOS DO VEICULO: `CONTRACT_OBJECT_PRODUCT`
(`/contract/contract_object_product/`) entra na allow-list — a lista INTEIRA, 16, afirmada uma a uma;
leitura por chaves CANDIDATAS (`mutual_chaves_produto_*`, `mutual_produto_da_linha`) porque o payload
ainda nao foi visto, com o nome caindo no catalogo dos planos (`mutual_nome_produto`, product_id global);
`mutual_produto_terceiros` (espelho de `ehProdutoTerceiros`); `mutual_terceiros_por_objeto` (so leitura,
NULL = "nao sei") e `mutual_aplicar_plano_por_terceiros` (simula sem `p_confirmar`; so troca quem esta sem
plano ou em `p_substituir`; a carga preserva pelo coalesce). Por que nao pelo `plan_id`: terceiros e
OPCIONAL dentro do mesmo plano de moto no Mutual)
· `0092_mutual_produtos_aninhados` (CORRETIVA da 0091: o payload real de
`/contract/contract_object_product/` e UMA LINHA POR VEICULO com `products[]` dentro; so
`mutual_terceiros_por_objeto` e recriada, abrindo a lista item a item — linha sem `products` segue
lida como produto avulso. Lista vazia = "nao sei")
· `0093_mutual_nome_plano_legado` (O NOME DO PLANO LEGADO NA TELA DO DE-PARA, pedido do usuario:
"localizo o plano no Mutual pelo nome". `mutual_planos_externos` recriada com a mesma assinatura;
o nome sai de `PLAN` e, na falta, do `plan_name` de CONTRACT_OBJECT_PRODUCT (grafia mais
frequente vence). `capturado` = nome conhecido. So leitura)
· `0094_mutual_carga_em_blocos` (A CARGA CABE NO TETO DE 8 S: `mutual_unidade_dos_objetos()` resolve a
unidade de todos os objetos EM CONJUNTO, espelho exato de `mutual_regional_do_objeto` (suite prova objeto a
objeto); `mutual_carga_linhas`, `mutual_planos_externos` e `mutual_categorias_veiculo` recriadas com ela;
`mutual_carga_fila` (RLS sem policy) + `mutual_executar_carga(regional, inativos, confirmar, p_lote,
p_preparar)` — DROP + CREATE: preparar le UMA vez, cada bloco grava ate p_lote linhas sem cortar CPF,
fila velha (+1 h) ou de outro recorte e recusada; simulacao passou a ler o lote uma vez so)
· `0095_mutual_vendedor_do_consultor` (O VENDEDOR DOS MIGRADOS: trigger `fn_vendedor_documento_digitos`
grava `vendedores.documento` so com digitos por qualquer caminho; `mutual_vendedores_dos_veiculos(regional)`
(contrato -> `consultant_id` -> CONSULTANT -> CPF -> vendedor; e-mail so se unico; motivos LIGAR/JA_LIGADO/
MANTIDO/SEM_CONSULTOR/CONSULTOR_NAO_CAPTURADO/EMAIL_AMBIGUO/CONSULTOR_SEM_VENDEDOR/UNIDADE_DIFERENTE),
`mutual_vendedores_resumo` e `mutual_vincular_vendedores(regional, confirmar)` — so preenche quem esta SEM
vendedor e nao liga vendedor de outra unidade; `fn_calcular_comissao` recriada: veiculo com vinculo
CONTRACT_OBJECT do Mutual nunca e ADESAO. Espelho puro em `src/lib/mutual.ts` (`totaisVendedores`,
`vendedorPendente`, `ROTULO_MOTIVO_VENDEDOR`))
· `0096_mutual_captura_sem_regravar` (upsert da captura so regrava o que mudou; autovacuum de
`mutual_captura` em 2%)
· `0099_historico_financeiro_mutual` (o HISTORICO FINANCEIRO do SAC e do portal passa a ler `boletos_historico`
alem de `titulos_financeiros`, com a data de corte `corte_cobranca_cliente`; linha digitavel e links de
pagamento do Mutual gravados na importacao; `portal_financeiro` soma as duas fontes. Boleto do Mutual e so
consulta. Uniao das listas em `src/lib/historico-financeiro.ts`)
· `0098_cobranca_fila` (COBRANCA, Fase 2: fila operacional por prioridade, contatos IMUTAVEIS por trigger,
promessas (1 parcela) e acordos (2..36) sobre a divida existente com situacao CALCULADA pelos pagamentos —
quebra = vencimento + 3 dias de baixa; taxa de cumprimento = cumpridas / (cumpridas + quebradas).
Espelho puro em `src/lib/cobranca-fila.ts`)
· `0097_cobranca_painel` (INADIMPLENCIA E COBRANCAS, Fase 1: papeis `supervisor`/`cobranca` +
`supervisor_regionais` + `cobranca_escopo()` (o escopo vale DENTRO das RPCs de cobranca; `pode_regional`
NAO foi tocado); `boletos_historico` + `cobranca_importar_historico_mutual` (em blocos por cursor,
re-executavel, so regrava o que mudou; liga pelo CONTRATO -> PERSON); `mutual_dia` (data so-dia sem
deslocar fuso); `dia_util_seguinte` + `cobranca_feriados`; `ciclo_vencimento` (5/10/15/20/25/30);
`cobranca_boletos_base` (SCar + Mutual ate a data de corte do associado, com a situacao do documento);
`cobranca_recortes`/`_indicadores`/`_carteira`/`_calendario`/`_por_regional`/`_serie_mensal`/
`_boletos_lista`; meta/limite em `empresa`; `resumo_cobrancas` corrigida. Percentuais no TS:
`src/lib/cobranca-painel.ts`)
· `0100_painel_visao_geral` (A VISAO GERAL DO /dashboard: UMA funcao, `painel_visao_geral(regional,
meses)`, devolve o painel inteiro em jsonb — kpis, distribuicao por unidade/UF/tipo/plano/status, serie
mensal (adesoes, saidas, base no fim do mes, eventos, acionamentos, leads), eventos, 24h, funil de
vendas, contas a pagar e rastreadores. Frota lida por DATA (como `frota_na_base`), carteira pelo
override da ficha (fallback: ultimo titulo), `escopo_regional` e NULL para nao-staff. As MENSALIDADES
nao sao lidas aqui: a tela usa `cobranca_serie_mensal` (0097). So leitura)
· `0101_eventos_historico_mutual` (O HISTORICO DE EVENTOS DO MUTUAL: `eventos_historico` (tabela propria,
NUNCA `eventos_sinistro` — o Mutual manda "ANDAMENTO" em todos, la virariam evento em aberto),
`mutual_eventos_para_importar` (a leitura: veiculo por `objeto.vehicle_id`, contrato do evento vence;
associado pelo vinculo PERSON ou o dono atual do carro), `mutual_importar_eventos_historico(p_confirmar)`
(re-executavel, so regrava o que mudou), `eventos_historico_resumo`, `eventos_mutual_do_cliente` (SAC),
`eventos_historico_listar` (aba Historico de /sinistros, paginada); `veiculos_do_cliente` e
`painel_visao_geral` recriadas contando o historico. Regua em `src/lib/eventos-historico.ts`)
· `0103_eventos_terceiros` (TERCEIROS DO EVENTO + FAVORECIDO NAS COMPRAS: `evento_terceiros` (N por
evento; papel `tipo_envolvimento` com null = a apurar; enum `status_terceiro`; pessoa/condutor/veiculo/
seguro/danos) com FK COMPOSTA `(evento_id, cliente_id) -> eventos_sinistro(id, cliente_id)` = "Terceiro
do Evento X do Associado Y" no banco; trigger `fn_terceiro_vincular` herda associado/unidade do evento,
numera `<protocolo>-T01` e trava troca de evento; historico `TERCEIRO`/`TERCEIRO_STATUS`;
`eventos_sinistro.possui_terceiros`; `evento_terceiro_id` em `lancamentos_financeiros`/`cotacoes_pecas`/
`anexos_evento`; trigger `fn_lanc_evento_favorecido`: DESPESA de evento exige `fornecedor_id` OU
`evento_terceiro_id` (titulo legado sem favorecido segue recebendo baixa). RLS no recorte da 0077:
ver/cadastrar = staff da unidade; alterar = `pode_tratar_evento`; apagar = admin; portal NAO ve
(LGPD). Categorias `3.1.04` reparos de eventos / `3.1.05` indenizacoes. Suite em
`supabase/tests/0103_eventos_terceiros.test.sql`; o fixture da 0078 ganhou fornecedor).
· `0104_provedor_sicredi` (o enum `provedor_banco` ganha `SICREDI`; credenciais seguem nas
`SICREDI_*` do servidor; a remessa escolhe a integracao padrao da unidade ou a global)
· `0105_baixa_banco` (BAIXA AUTOMATICA pelo banco: `cobranca_liquidacoes` + `registrar_liquidacao_banco`;
o casamento exige o mesmo provedor E ambiente da integracao que emitiu; re-executavel; cancelado nao reabre)
· `0107_mutual_sincronia_automatica` (a ROTINA do Mutual: captura, linhas da carga e carga aceitam o
agendador sem sessao; ver a secao propria)
· `0108_rls_initplan` (DESEMPENHO, a regra nao muda: as policies de `veiculos`, `clientes`, `eventos_historico`,
`boletos_historico`, `integracao_vinculos`, `modelos`, `mutual_captura` e `mutual_sincronias` passam a usar
`(select f())` (InitPlan, uma vez por consulta) em vez de `pode_regional(regional_id)` por linha. Medido em
producao: 1.000 veiculos em 1.430 ms -> 4 ms. Suite `0108` prova o mesmo recorte para matriz, gestor, inativo e associado)
· `0109_acionamento_edicao` (o ATENDIMENTO da 24h muda a qualquer momento — desistencia, mudanca de
lugar, remarcacao: `agendado_para` (nulo = imediato), `atualizar_acionamento` recriada com
`p_agendado_para`/`p_limpar_agendamento`/`p_solicitante_nome`/`p_solicitante_telefone` NO FIM (a chamada
posicional da 0027 segue valendo) e `fn_acionamento_auditoria` registrando origem, agendamento (em horario
de Sao Paulo), solicitante, telefone e observacoes. Na tela: barra de acoes no TOPO da OS em qualquer fase
nao finalizada — Editar atendimento · Mudar local/destino · Valores da OS · Trocar prestador · Cancelar
atendimento (antes so apareciam depois da OS gerada); agendamento tambem na abertura e no voucher. O modal
de valores deixou de ter "Destino do reboque" (sobrescrevia o destino geocodificado com so o logradouro).
Datas: `paraCampoDataHora`/`doCampoDataHora`/`rotuloAgendamento` em `src/lib/assistencia.ts`, testadas)
· `0110_permissoes_por_papel` (PERMISSOES EDITAVEIS: `papel_permissoes` + `papel_permissoes_log`, `papel_pode`, `minhas_permissoes`, `salvar_permissao_papel` (so admin), `pode_editar_precos`; os 8 helpers de capacidade leem a tabela; seed = comportamento anterior; admin sempre tudo)
· `0111_permissoes_modulo_acao` (GRADE MODULO x ACAO por perfil: `perfil_permissoes` + `permissao_celula_valida` + `perfil_pode` + `salvar_permissoes_perfil`; helpers de capacidade leem a grade; policies RESTRICTIVE `perfil_excluir`; `papel_permissoes` fica so com as 3 alcadas; `minhas_permissoes` devolve 'modulo.acao')
· `0112_eventos_historico_kanban` (LEVAR AO KANBAN o evento ESCOLHIDO do historico do Mutual:
`eventos_historico.evento_id` (unique, on delete set null), `tipo_evento_do_historico(tipos[])` (palpite por
palavra-chave), `transportar_eventos_historico(ids[])` (sempre ABERTO; uma linha por id com a situacao:
LEVADO/JA_NO_KANBAN/SEM_VEICULO/SEM_DATA/FORA_DA_UNIDADE/NAO_ENCONTRADO; max 200), `eventos_historico_listar`
DROP + CREATE com o evento do Kanban e `p_no_kanban`; `eventos_mutual_do_cliente`, `veiculos_do_cliente` e
`painel_visao_geral` recriadas com `evento_id is null` no historico (o levado nao conta duas vezes))
· `0113_eventos_prazo_regulatorio` (PRAZO DE 90 DIAS do Art. 22, CNSP 491/2026: `evento_documentos_modelo`
(catalogo, Configuracoes -> Documentos do Evento) + `evento_documentos` (PENDENTE/ENTREGUE/DISPENSADO, lista padrao
aplicada na abertura e quando o tipo e definido) + colunas `documentacao_completa_em/_origem/_por`,
`regulacao_encerrada_em`, `recusa_fora_do_prazo` em `eventos_sinistro` + trilha `evento_prazo_historico` + alertas
`evento_prazo_alertas` (unico por marco 30/60/75/85/91) + cache `evento_prazo_situacao`; `eventos_prazos` (calculo
VIVO), `marcar_documentacao_completa`, `reabrir_documentacao_evento` (so diretoria), `aplicar_documentos_padrao_evento`,
`dar_ciencia_prazo_evento`, `atualizar_prazos_eventos` (rotina diaria) e `marcar_alertas_prazo_notificados`; aviso nulo
vira o dia da abertura e o evento trazido do Mutual nasce com aviso = data do evento; NEGADO com prazo vencido so pela
diretoria. Espelho em `src/lib/prazo-regulatorio.ts`)
· `0115_supervisor_regionais_cadastro` (`regionais_do_usuario()` = unidade do cadastro + `supervisor_regionais` para o papel supervisor; `pode_regional`, `escopo_regional` e as policies de `regionais`/`veiculos`/`clientes`/`eventos_historico` passam a usar a lista, em forma InitPlan `= any((select f())::uuid[])` — sem o cast o Postgres trata como subquery e recusa `uuid = uuid[]`. Demais papeis: lista = `{auth_regional_id()}`, nada muda)
· `0117_baixa_banco_mutual` (BAIXA DOS BOLETOS DO MUTUAL PELO BANCO: `boletos_historico.nosso_numero` gerado da linha digitavel, `registrar_liquidacao_banco` casa o boleto do Mutual e cria o recebimento na conta SICREDI desde 13/10/2026, trava contra a importacao desfazer o pago, `reprocessar_liquidacoes_banco`)
· `0118_recebimento_nao_identificado` (pagamento do Sicredi sem titulo nem boleto -> RECEITA 1.9.98 na matriz com baixa na conta SICREDI; convertido em mensalidade quando o boleto aparece, cancelado se era titulo do SCar; `registrar_liquidacao_banco` recriada, mesma assinatura)
· `0123_termos` (TERMOS: `termos_modelos` (rascunho HTML com campos, escopo ASSOCIADO/GERAL, filtros por plano/tipo/uso/unidade, portal, aceite + declaracoes), `termos_versoes` (imutavel, SHA-256 no banco, PDF da versao geral uma vez), `termos_emitidos` (protocolo TRM-, HTML congelado + hash, PDF + hash, situacao), bucket privado `termos`; RPCs `publicar_versao_termo`, `registrar_termo_emitido`, `anexar_pdf_termo`, `anexar_pdf_versao_termo`, `cancelar_termo_emitido`, `portal_termo_emitido`, `pode_ver_termo_emitido`, `portal_documentos`; modulos de permissao `termos_modelos` (so admin + extra) e `termos` (todo staff menos consultor); `empresa.regulamento_url`)
· `0130_perfis_personalizados` (PERFIL CRIADO PELO ADMIN: `perfis_acesso` (nome unico, descricao, `papel_base` = o alcance) + `usuarios.perfil_id` (trigger `fn_usuarios_perfil` mantem `papel` = base; trocar o papel direto sai do perfil); a grade (`perfil_permissoes`/`papel_permissoes`) aceita o id do perfil como chave (CHECK de papel trocado por trigger `perfil_chave_valida`); `auth_perfil_chave()` e `perfil_pode`/`papel_pode` leem a grade do perfil; `salvar_perfil_acesso` (cria copiando a grade da base ou de outro perfil; base travada com usuarios) e `excluir_perfil_acesso` (recusa com usuarios); `usuarios_listar` com `perfil_id`/`perfil_nome`; `copiar_perfil_usuario` copia o perfil; `fn_usuarios_campos_sensiveis` protege `perfil_id`)
· `0134_acionamento_negado_exclusao` (24h: status `NEGADO` + `negado_motivo`/`_observacao`/`_por`/`_em`; `registrar_acionamento_negado` (sem alcada) e `negar_acionamento` (so sem OS); NEGADO imutavel por trigger, sem cotacao, fora do limite e dos paineis; `elegibilidade_assistencia` e `historico_assistencia_veiculo` DROP + CREATE com `negados`/motivo; `excluir_acionamento` com `perfil_pode('assistencia','excluir')` (celula nova, seed financeiro), recusa CONCLUIDA e titulo pago, leva o titulo em aberto junto, trilha em `acionamento_exclusoes`; DELETE direto bloqueado por policy RESTRICTIVE)
· `0135_acionamento_excluir_concluido` (`excluir_acionamento` recriada: OS CONCLUIDA sem pagamento se exclui; titulo pago recusa)
· `0137_revistoria_cobranca` (REVISTORIA DO BOLETO VENCIDO: `empresa.dias_revistoria_boleto` (5) + `dias_revistoria_boleto()`; `revistoria_itens` (REV_FRENTE, REV_TRASEIRA, REV_VIDEO_VOLTA); `vistoria_anexos.duracao_segundos` e teto de 50 MB so para `REV_VIDEO%`; `revistorias_cobranca` (uma viva por veiculo, token 7 dias, situacao AGUARDANDO/EM_ANALISE/APROVADA/DISPENSADA/UTILIZADA/CANCELADA/EXPIRADA, origem MANUAL/ROTINA) + `revistoria_cobranca_historico` por trigger; TRAVA: trigger BEFORE INSERT em `cobranca_renegociacao_origens` exige revistoria APROVADA/DISPENSADA livre para boleto com atraso (do vencimento util) > N e a reserva; AFTER UPDATE em `cobranca_renegociacoes`: EMITIDA consome (UTILIZADA), ERRO devolve; RPCs `revistoria_exigida`, `solicitar_revistoria_cobranca`, `revistoria_por_token`, `revistoria_itens_publica`, `registrar_midia_revistoria_publica`, `concluir_revistoria_publica`, `revistorias_cobranca_listar`, `revistoria_cobranca_midias`, `analisar_revistoria_cobranca`, `dispensar_revistoria_cobranca`, `cancelar_revistoria_cobranca`, `revistorias_a_solicitar`, `rotina_revistorias_cobranca`; modulo de permissao `revistoria` (ver/criar/fechar/cancelar))
· `0138_mutual_carga_transferencia` (`mutual_carga_linhas` recriada: desempate da placa pelo objeto mais vivo; o objeto vencedor assume o veiculo ja ligado a outro objeto do Mutual — a transferencia; veiculo sem vinculo do Mutual segue recusa)
· `0140_boleto_mutual_substituido` (`boletos_historico.referencia_externa/referencia_original/emitido_em/substituido_por` do payload do INVOICE; grupo = mesma `referencia_original` (o `original_reference_id` do Mutual); pago no grupo -> os abertos ficam `cancelado` + `substituido_por`; sem pago -> vale a via mais recente; `recalcular_substituicoes_boletos(raiz)`, gatilhos BEFORE (preenche e protege da importacao) e AFTER (recalcula o grupo); backfill)
· `0141_permissoes_configuracoes_dre` (CONFIGURACOES POR ABA + DRE: `permissao_celula_valida`/`minhas_permissoes` com `financeiro_dre` (ver/exportar) e as 16 abas `cfg_*` (ver/criar/editar/excluir — insert/update/delete de cada tabela); `pode_configurar(modulo, acao)` = global ou a celula; seed: abas negadas (criar/excluir copiam o editar de quem já tinha), DRE = `financeiro.ver`; `pode_ver_dre()` nos `gerar_dre_completo`/`gerar_dre_mensal`/`resumo_por_centro_custo` (este com `escopo_regional`); policies de escrita de plano de contas, centros de custo, marcas/modelos, produtos, planos, tipos de veiculo, cores, cotas, tipos de evento, alertas, documentos do evento, contas bancarias, integracoes (inclusive o select), empresa (+ buckets `empresa`/`empresa-docs`), regionais (insert/update pela aba, delete so admin; select da lista inteira com `cfg_regionais.ver`) e vendedores (a aba vale so em `pode_regional`); `regionais_listar` e `salvar_marcos_prazo_evento` recriadas)
· `0139_regua_cobranca` (REGUA DE COBRANCA: `empresa.dias_bloqueio_inadimplencia` + `chk_empresa_regua_ordem` (bloqueio <= inativacao, revistoria < inativacao) + `dias_bloqueio_inadimplencia()`/`regua_cobranca()`; `vencidos_veiculo(veiculo, min_dias)` (SCar + Mutual antes do corte, boleto sem veiculo vale para os veiculos do associado); `situacao_assistencia_veiculo` recriada lendo ela; `rotina_regua_cobranca()` so em `not cobranca_externa`, motivo 'Regua de cobranca: ...'; `cobranca_fila_base` com situacao `a_inativar` (atraso >= inativacao); `cobranca_fila` DROP + CREATE com `p_ordem` (prioridade|atraso_asc|atraso_desc) e sem os a inativar por padrao; `cobranca_fila_resumo` sem eles nas faixas; `cobranca_carteira` DROP + CREATE com `clientes_a_inativar`/`valor_a_inativar`; `cobranca_inativados(inicio, fim, regional)` sem o acervo que entrou inativo)
· `0142_mutual_carga_cor_uma_vez` (`mutual_carga_linhas` recriada: a cor resolvida uma vez por cor distinta (CTE `cor_map`); RP de 16,7 s para 3,7 s, cabe no teto de 8 s da rotina)
· `0143_mutual_carga_cor_materializada` (corrige a 0142: `cor_map as materialized` — inline-ado, o CTE era recalculado por objeto)
· `0144_cancelamento_pro_rata` (`pro_rata_veiculo(veiculo, ate, desde)` pela data de vencimento, ciclo pos-pago; `veiculos.cancelado_em` + `veiculo_cancelamentos` (trilha; `reativado_em` por trigger ao voltar para a base); `cancelar_veiculo` (`veiculos.cancelar`, so o veiculo, status inativo com motivo, `data_saida` = pedido, faturas abertas futuras do veiculo, lead de retorno); `criar_renegociacao_pro_rata` (tipo PRO_RATA: boleto do pro-rata e/ou baixa dos boletos futuros SO do veiculo; sem cobranca nasce EMITIDA); revistoria nao vale para PRO_RATA; travas de evento (data >= cancelamento) e de acionamento (salvo NEGADO); `mutual_executar_carga` preserva o status do cancelado com o mesmo dono; `cancelamentos_do_veiculo`)
· `0165_api_cadastro_rastreadores` (`api_cadastrar_rastreadores`: a rastreadora cadastra equipamentos por IMEI e instala no veiculo pela API; item a item, re-executavel)
· `0164_proposta_reboque_validade` (`tipos_veiculo.km_reboque_ida/volta` + `empresa.validade_proposta_dias`: a proposta comercial v2)
· `0163_plano_preferencial` (`planos_protecao.preferencial`: no topo da cotacao e ja escolhido; os demais com o valor so no clique)
· `0162_plano_tipo_sugestoes_cota_modelo` (`plano_tipos_veiculo` + `plano_atende_tipo` + trigger na cotação; `plano_sugestoes` (pré-marcados); `modelo_do_catalogo`/`nome_veiculo_normalizado`; `autorizar_entrada_lead` copia os opcionais da cotação para `veiculo_produtos`)
· `0161_adesao_backoffice` (ROTINA DA NOVA ADESAO: status `AGUARDANDO_VISTORIA`, ORCAMENTO_GERADO -> PROPOSTA_ENVIADA, trigger da cotacao nova -> proposta, `mover_lead_status` com `pode_tratar_lead` e checklist completo para APROVADO, aceite -> AGUARDANDO_VISTORIA, `checklist_lead` com Renavam/nascimento/forma da adesao opcionais, `leads.adesao_forma` default VENDEDOR_NA_HORA, `liberar_leads_sem_contato` sem a vistoria, `veiculos.cobertura_desde` + carencia na 24h e no evento, `autorizar_entrada_lead` (carencia, adesao padrao, protocolo do rastreador, sobre a 0158), `gerar_carne_veiculo` com pro-rata pos-pago no 1o boleto)
· `0160_plano_desconto_participacao` (PLANO ECONOMICO: `planos_protecao.desconto_base_percentual`/`multiplicador_participacao`; `cotar_plano` desconta os produtos obrigatorios (item com `valor_tabela`/`desconto_plano`) e multiplica a `franquia_participacao`; `multiplicador_participacao_plano`, `participacao_do_plano`; `calcular_participacao_veiculo` pelo plano do veiculo; `atualizar_cotacao` por troca de literal)
· `0159_comissao_liquidacao_assistencia` (comissao na LIQUIDACAO: renegociacao paga comissiona, repartida pelos veiculos dos originais, avulso nao; comissao OU Assistencia — a unidade que repassa paga a Assistencia no lugar do percentual; qualquer unidade cobra a Assistencia dentro do limite; recria `fn_cotacao_valida_desconto`, `assistencia_profissional_regras`, `fn_calcular_comissao`)
· `0158_assistencia_profissional` (ASSISTENCIA PROFISSIONAL: `regionais.paga_assistencia_profissional` + min/max (1/40); `cotacoes`/`veiculos.valor_assistencia_profissional`; `comissoes_vendas.valor_assistencia_profissional`; `fn_cotacao_valida_desconto` valida (unidade que paga, limite, so quando muda) e soma DEPOIS do desconto; `atualizar_cotacao` DROP + CREATE com `p_valor_assistencia_profissional`; `autorizar_entrada_lead` grava no INSERT do veiculo; `valor_mensalidade_veiculo` soma sem override; `fn_calcular_comissao` da a parte inteira ao vendedor da unidade que paga; `assistencia_profissional_regras`, `regional_assistencia_do_lead`; Mutual: `mutual_valor_assistencia_do_nome`, `mutual_assistencia_profissional_veiculos`/`_configs`, `mutual_definir_valor_assistencia_profissional`, `mutual_aplicar_assistencia_profissional`, tabela `mutual_assistencia_profissional_valores`)
· `0156_evento_indenizacao_associado` (`fn_lanc_evento_favorecido` recriada: na conta a pagar do evento sem fornecedor e sem terceiro, o favorecido pode ser o associado DO EVENTO em `cliente_id`)
· `0155_mutual_carga_inativo_com_evento` (`mutual_carga_linhas` recriada: objeto inativo com EVENT (contrato + veiculo) entra sem `p_incluir_inativos`; sem placa nao; quem perde o desempate some em vez de virar recusa)
· `0154_boleto_mutual_via_sem_vinculo` (`recalcular_substituicoes_boletos` recriada: a mesma mensalidade paga por via sem `original_reference_id` — associado, veículo, competência, tipo e valor iguais, emitida depois — substitui o aberto; o recálculo do grupo olha os grupos do mesmo associado e competência)
· `0153_disponibilidade_por_conta` (cada conta bancária com a sua analítica em 1.1.1.0x.NN, por trigger; grupos 1.1.1.01–04 sintéticos; 1.1.1.99 sem conta; `balancete_partidas` pela conta)
· `0152_plano_contas_padrao` (PLANO DE CONTAS PADRÃO: `categorias_dre` ganha `analitica`/`natureza`/`destino`/`automatica`/`codigo_anterior` e `tipo` nullable; triggers de duplicidade (código ou descrição exata), de exclusão (conta com lançamento/filhas) e de lançamento só em analítica não automática; as 28 contas antigas RECODIFICADAS no lugar + o plano da planilha + analíticas da proteção (trilha em `plano_contas_migracao`); `contas_bancarias.classe_fluxo`; `dre_movimentos` sem contas de balanço e com os códigos novos; as funções com código fixo reescritas por troca de literal; `balancete_partidas`/`balancete_verificacao`; `fluxo_caixa_evolutivo`)
· `0151_api_externa` (API EXTERNA: `api_integracoes` (chave so como SHA-256, escopos, unidades, IPs, validade, revogacao) + `api_requisicoes` (trilha); `api_exigir`, `api_situacao_rastreamento`, `api_veiculos` (cursor alterado_em/id, dado pessoal so com `associados:ler`), `api_rastreadores` (so os do fornecedor da chave), `api_registrar_comunicacoes` (ultima comunicacao/posicao por IMEI, ignora a mais velha); admin: `criar_`/`atualizar_`/`girar_chave_`/`revogar_api_integracao`, `api_integracoes_listar`; `fn_rastreador_espelha_veiculo` so grava a ficha quando muda)
· `0150_boleto_avulso` (BOLETO AVULSO do SAC: `tipos_boleto_avulso` + 3 contas 1.2.03/04/05; `titulos_financeiros.tipo_avulso_id`; renegociacao tipo AVULSO; `criar_boleto_avulso`; `cobranca_boletos_base`/`vencidos_veiculo` sem o avulso; `dre_movimentos` na conta do tipo)
· `0149_extrato_grupo_cobranca` (`extrato_conta` com `grupo` PIX/COMPE_REDE/COBRANCA e os membros juntos no dia; a tela agrupa em uma linha de total que abre os boletos)
· `0148_conciliacao_pix_cobranca` (`conciliar_pix_cobranca`: PIX da cobranca do extrato x baixas PIX do banco, por valor no mesmo dia; classificar chama)
· `0147_conciliacao_lote_cobranca` (CONCILIACAO EM LOTE: `extrato_item_lote` + `lote_cobranca_candidatos`/`lote_cobranca_extrato_item`/`conciliar_lote_extrato_item`/`conciliar_lotes_cobranca`; o credito somado COMPE/REDE do extrato fecha com as baixas creditadas no dia; sugestao/candidatos/desfazer/classificar/fn_baixa_solta_extrato/tesouraria_movimentos recriados sabendo do lote)
· `0146_baixa_banco_data_credito` (BAIXA NA DATA DO CREDITO: feriados bancarios 2026-2027 em `cobranca_feriados`; `data_credito_banco(data, tipo)` PIX = o dia, COMPE/REDE = proximo dia util; `cobranca_liquidacoes.tipo_liquidacao/data_credito`, `titulos_financeiros.data_credito`; `registrar_liquidacao_banco` (mesma assinatura) grava baixa e vencimento no credito e compara o inicio da baixa do Mutual com o credito; `tesouraria_movimentos` com o titulo no credito; baixas nao conciliadas movidas)
· `0145_adesao_carne_comissao` (NOVA ADESAO: `lead_adesao_tabela` + triggers (o valor da adesao e o da cotacao aceita, por qualquer caminho); `titulos_financeiros.adesao_lead_id` (boleto da adesao emitido pela Smart Car, 1.1.01 no DRE); `autorizar_entrada_lead` DROP + CREATE com `p_dia_vencimento`/`p_vencimento_adesao` (BOLETO/PIX = titulo do SCar, sem comissao ate pagar; CARTAO = conta a receber como antes; VENDEDOR_NA_HORA = adesao toda do vendedor); `comissoes_vendas` unique (titulo_id, veiculo_id) + `fn_calcular_comissao` (adesao pelo titulo marcado; fatura AGRUPADA comissiona cada item na proporcao); `dre_movimentos` com o titulo agrupado (antes descartado) e a adesao; `gerar_carne_veiculo(veiculo, meses 0..12)` (veiculo vira INDIVIDUAL, primeiro vencimento >= hoje+2, fatura inviavel anterior sai); remessa (`criar_remessa_cobranca`/`marcar_remessa_enviada`/`registrar_retorno_cobranca`/`finalizar_remessa`) aceita o servidor sem sessao)
· `0136_veiculo_zero_km` (`veiculos.placa` nullable + `veiculos.zero_km` + `chk_veiculo_identidade` (sem placa so com zero_km E chassi) + trigger placa vazia -> NULL; `mutual_carga_linhas`/`mutual_executar_carga` recriadas: sem placa com chassi entra como 0 km, recusa so sem os dois, `rn_placa` nao junta os NULL, re-execucao preserva a placa preenchida aqui)
· `0133_equipe_ativa` (`equipe_ativa()`: a equipe ativa para escolher destinatario de transferencia/parecer, sem abrir a policy de `usuarios`)
· `0131_unidades_atuacao_todos` (`regionais_do_usuario()` soma `supervisor_regionais` para qualquer papel ativo; `usuarios_listar` com `unidades_atuacao`; cobranca e carteira de leads nao mudam)
· `0132_contas_pagar_estorno_exclusao` (`financeiro_auditoria` (trilha com foto jsonb, sobrevive ao titulo); `estornar_baixa(baixa, motivo)` com `perfil_pode('financeiro','estornar')`, apaga a baixa (triggers recalculam; extrato volta a PENDENTE; comprovante fica no titulo); `excluir_lancamento(lancamento, motivo)` com `perfil_pode('financeiro','excluir')`, so sem baixa, recusa OS da 24h e titulo do banco, devolve os arquivos; helpers `lancamento_no_alcance`/`lancamento_do_banco`; `cotacoes_pecas.fornecedor_id`/`lancamento_id`)
· `0129_comunicacao_evento` (COMUNICACAO DE EVENTO ONLINE: `evento_comunicacoes` (um link por envolvido, token 64 hex com prazo, rascunho, verificacao do associado, envios, correcao, conferencia, revogacao) + `evento_declaracoes` (versao IMUTAVEL com origem ENVOLVIDO/EQUIPE, IP, user-agent e SHA-256); `anexos_evento` ganha `comunicacao_id`/`pose`/`enviado_pelo_envolvido`; RPCs da equipe `criar_comunicacao_evento`, `registrar_envio_comunicacao`, `renovar_`/`revogar_comunicacao_evento`, `pedir_correcao_comunicacao`, `conferir_comunicacao`, `registrar_declaracao_equipe`, `salvar_rascunho_comunicacao_equipe`, `comunicacoes_resumo_eventos`; publicas (service_role + token) `comunicacao_publica`, `verificar_comunicacao`, `salvar_rascunho_comunicacao`, `enviar_comunicacao`, `registrar_anexo_comunicacao`, `anexos_comunicacao_publica`, `remover_anexo_comunicacao`; o terceiro que envia cria/preenche `evento_terceiros`)
· `0128_historico_eventos_unidades` (`eventos_historico_listar` filtra por `regionais_do_usuario()` em vez de `escopo_regional(null)`)
· `0127_eventos_unidades_atuacao` (`regionais_do_usuario()` soma `supervisor_regionais` também para o papel `sinistro`; cobrança segue só do supervisor)
· `0126_operador_conta_bancaria` (`conta_bancaria_operadores` + `contas_do_operador`/`pode_conta_bancaria`/`exige_conta_bancaria`/`exige_item_extrato`/`lancamento_visivel_tesouraria`/`minhas_contas_bancarias`/`salvar_operadores_conta`; saldos, saldo, extrato, OFX, conciliação e transferência aceitam o operador NA CONTA DELE; configurar a conta, fluxo diário, demonstrativo e conferência seguem só da matriz)
· `0125_servicos_assistencia_equipe` (insert/update de `servicos_assistencia` = global OU `pode_assistencia`; delete so global)
· `0124_anexos_financeiros_rls` (o anexo do titulo segue quem VE o titulo: EXISTS sob a RLS de `lancamentos_financeiros`, inclusive o caminho da 24h; anexo so da baixa resolve o titulo pela baixa)
· `0122_avisos_banco_pendentes` (aviso do webhook do banco ainda nao confirmado em liquidados/dia: `cobranca_avisos_banco` AGUARDANDO/CONFIRMADO/EXPIRADO; o webhook grava, o agendador reconfere do dia do aviso ate hoje (`diasParaReconferir`, 10 dias) e expira em 15 (`avisoExpirou`); `reconferirAvisosPendentes` em `src/lib/pagamentos/baixa-sicredi.ts`)
· `0121_renegociacao_boleto` (2a via vencida e acordo viram BOLETO NOVO do SCar no Sicredi + baixa dos originais (Mutual/SCar): `cobranca_renegociacoes`/`_origens`, `titulos_financeiros.renegociacao_id`, trigger que impede a importacao do Mutual de reabrir o renegociado, `cobranca_boletos_base` e `cobranca_acordos_situacao` recriadas, comissao nao sai de renegociacao; RPCs `criar_renegociacao`, `finalizar_emissao_renegociacao`, `registrar_baixa_original`, `renegociacoes_do_cliente`)
· `0120_produto_descricao_cobertura` (`produtos.descricao_cobertura`: o texto de cada cobertura, mostrado aberto na ficha do veiculo)
· `0119_tesouraria` (TESOURARIA: saldo inicial + regra do OFX em `contas_bancarias`; `transferencias_bancarias`; `extrato_importacoes`/`extrato_itens` (unique conta+FITID); `tesouraria_movimentos` = fonte unica do caixa; `saldos_contas`, `saldo_consolidado_em`, `extrato_conta`, `fluxo_caixa_diario`, `financeiro_demonstrativo`, `conferencia_caixa_dre`; OFX: `importar_extrato_ofx`, `classificar_extrato_itens`, `sugestao_extrato_item`, `candidatos_extrato_item`, `conciliar_extrato_item`, `confirmar_sugestoes_extrato`, `criar_lancamento_extrato`, `transferencia_extrato_item`, `ignorar/desfazer_extrato_item`, `criar/cancelar_transferencia_bancaria`; tudo da matriz)
· `0116_permissoes_usuario_extras` (PERMISSAO EXTRA POR USUARIO (so soma, motivo, validade) + `copiar_perfil_usuario`; `perfil_pode`/`papel_pode` somam o extra vigente; trilha em `usuario_permissoes_log`)
· `0114_eventos_prazo_marcos` (os 4 MARCOS de alerta do prazo em `empresa` (`prazo_evento_aviso/atencao/urgencia/
critico_dias`, CHECK crescente e <= 90; os 90 dias sao legais e fixos), `configuracao_prazo_evento()`,
`salvar_marcos_prazo_evento` (so admin), `prazo_regulatorio_nivel` STABLE lendo os marcos (mesma assinatura),
`evento_prazo_alertas.nivel` com unique (evento, nivel) no lugar de (evento, marco), e `atualizar_prazos_eventos`
recriada com os marcos configurados)
· `0106_regional_numeros` (OS NUMEROS DO PORTAL DA FRANQUIA, conferidos em producao em 14/10/2026:
(A) o financeiro da franquia passa a ser SO comissao (`lancamento_da_franquia`: 1.3.01/3.2.01) —
a OS da 24h e a nota do evento levam a unidade do VEICULO e apareciam como "a pagar aos vendedores";
os 13 lancamentos com unidade em producao eram TODOS da operacao da matriz, e o gestor podia
baixa-los/cancela-los pelo portal (`regional_titulo_no_escopo` agora recusa); (B) `resultado_periodo`
do painel = o BAIXADO no periodo (era a soma de sempre) e a comissao por vendedor da tela da equipe
= a GERADA no periodo (pendente segue sendo hoje); (C) `data_sp()` — o banco roda em UTC e
`created_at::date` jogava o lead das 21h-24h de SP no dia seguinte. Mesmas assinaturas.
Suite `0106`; a suite `0036` passou a lancar os titulos com as categorias de comissao)
· `0102_portal_regional_equipe` (O PORTAL DA FRANQUIA: (A) `vendedores_write` era `for all` — e
`for all` inclui DELETE, entao o `gestor_regional` apagava vendedor da propria unidade. Vira tres
policies: `insert`/`update` (admin ou gestor da unidade — incluir, editar, ATIVAR e INATIVAR
seguem identicos, porque `ativo` e coluna e inativar e UPDATE) e `delete` so `is_admin()`.
NAO EXISTE papel "master": sao 7 (0077) e o teto e o admin; (B) `regional_painel` DROP + CREATE
com a CARTEIRA — contava so `status = 'ativo'` (lista que o sistema superou: `inadimplente` nasceu
na 0072) e nao dizia que a carteira inteira esta em cobranca externa (0082). `veiculos_ativos` fica
INTACTO; entram `veiculos_carteira`/`_inadimplentes`/`_cobranca_externa`/`_sem_valor`,
`carteira_mensal` (pelo override, sem chamar cotar_plano — escolha da 0078), `associados` e
`vendedores_cadastrados`)
· `0082_carga_mutual_preparacao` (as TRES pecas que faltavam para a carga do Mutual poder rodar,
e nenhuma delas carrega nada — ha teste provando que a operacao segue intacta: (A) **a UNIDADE sai
do ASSOCIADO** — a corrente do consultor (0073/0074) foi medida com a base completa e esta VAZIA
(`consultant` em branco em 0 de 17.675 objetos), enquanto `PERSON.regional_id` vem em 12.628 de
12.628; entra `mutual_regional_externa` (o resolvedor de linha, que a carga vai usar),
`mutual_chaves_regional` (as chaves candidatas em UM lugar), `mutual_cobertura_unidade` (o funil
de 6 degraus que substitui o do consultor) e `mutual_diagnostico`/`mutual_filiais`/
`mutual_quarentena` recriadas lendo o associado — `mutual_filiais` contava ZERO em todas, porque
agrupava por um campo vazio; (B) **`integracao_vinculos`** — a ponte id externo -> registro do
SCar, sem a qual a segunda carga DUPLICA (CPF e corrigido, placa e transferida), com `unique` SO
do lado externo de proposito (dois ids do Mutual podem virar UM cliente) + `vincular_externo`,
`desvincular_externo`, `registro_do_externo`, `vinculos_orfaos` e `mutual_regional_do_externo`,
que resolve a filial SO pelo vinculo REGISTRADO — o palpite por CNPJ/nome fica em
`mutual_filiais.palpite_id`, so para a tela; (C) **`veiculos.cobranca_externa`** — o interruptor
que impede a carga de faturar quem ja paga no outro sistema: uma condicao dentro de
`veiculo_faturavel` fecha os 4 caminhos de fatura da 0025 E o trigger da entrada na base, com
`definir_cobranca_externa_regional` (o cutover) e `cobranca_externa_resumo`)
· `0081_adicional_risco_regional` (ADICIONAL DE RISCO POR REGIONAL — o preco deixa de ser so
nacional SEM duplicar tabela: a matriz continua sendo a UNICA tabela de preco e cada regional
cadastra UM valor em R$ por TIPO DE VEICULO, somado UMA VEZ a mensalidade de qualquer faixa FIPE
daquele tipo. `regional_adicional_risco` (vigencia com EXCLUDE gist, valor >= 0) +
`adicional_risco_regional(regional, tipo, data)`; `calcular_mensalidade` e `cotar_plano` ganham
`p_regional_id` — **DROP + CREATE, nao overload**, porque o ultimo argumento ja tinha default e
duas versoes deixariam a chamada ambigua; a soma acontece DEPOIS do laco de produtos, senao +R$5
viraria +R$10 numa faixa de 2 produtos; SO mensalidade — adesao e participacao INTACTAS; o
snapshot congela a prova (`cotacoes.regional_id/valor_adicional_regional`,
`veiculos.valor_adicional_regional/regional_preco_id`) e `valor_mensalidade_veiculo` soma o valor
CARIMBADO, nunca o cadastro de hoje; quem precifica e o ASSOCIADO (`regional_preco_do_lead`), com
`divergencia_regional_preco` para a tela avisar quando o vendedor e de outra unidade).

## Módulos (status: todos funcionais)
Painel/Visão Geral (`/dashboard`, 2 abas: indicadores da operação + **Assistência 24h** — o painel
gerencial da 0061, ver seção própria)
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
· **Regionais** (menu **Regionais**, com dois sub-itens: **Dashboard** (`/regionais`, o painel
executivo consolidado — ver seção própria) e **Acesso as Regionais** (`/regional`, o portal da
franquia, que é a operação de UMA unidade por vez))
· **Portal do Vendedor** (`/vendedor`: painel, leads, comissões e perfil do próprio vendedor — PWA)
Vendas/CRM (`/vendas` mobile-first: **agenda do dia** no topo (atrasados + retornos de hoje),
**busca por nome/CPF/placa/telefone** e filtro por consultor, Kanban com "parado há N dias",
captura que **começa na placa**, avisa duplicidade (sem travar) e cota **todos os planos de uma
vez** (FIPE por placa/cascata), contatos e retornos registrados na ficha do lead, **aceite
presencial** com o cliente na frente e envio da proposta por WhatsApp, cotação com
link público `/cotacao/[token]` detalhada/consolidada + print-PDF, esteira com trava de
Auditoria — só papel `auditoria`/`admin` clica "Autorizar Entrada" e efetiva cliente+veículo)
· **Vistoria pelo cliente** (`/vistoria/<token>`: as fotos do carro no celular de quem comprou,
sem login, liberadas no proprio aceite do hotlink — 0076)
· Associados (painel `/associados/[id]` com abas) · Veículos/Contratos (situação do contrato com
**Inadimplente** e a contagem regressiva da tolerância (0072); ficha com Plano —
**as coberturas do plano já vêm marcadas** e a troca de categoria mostra o que entra, o que sai e
quanto passa a custar (0071) —, opcionais a parte, alertas e **Rastreamento**: IMEI, Nº do chip e
rastreadora) · Eventos/Sinistros
(protocolo, reparo próprio/terceiro, financeiro do evento) · Precificação (simulador + editor de
tabela FIPE com reajuste % + importação por planilha, uma por tipo de veículo) · Empresa (logo/diretoria/mandatos/documentos) · **Fornecedores** (um cadastro só: peças/serviços,
prestadores da 24h e rastreadoras, com auto CNPJ/CEP) · **Cobrança** (grupo no menu, 0097: **Painel de Inadimplência** `/cobrancas/painel`, **Revistorias** `/cobrancas/revistorias` (0137), **Calendário
de Vencimentos** `/cobrancas/calendario` e **Boletos e Remessas** `/cobrancas/boletos` — o antigo
dashboard + faturas por competência + boletagem em lote + remessas bancárias) · Financeiro (contas a pagar/receber + baixas + DRE)
· Configurações (regionais, usuários,
vendedores, marcas/modelos, **cores do veículo**, tipos de veículo, cotas de participação (V5..V15), tipos de evento,
produtos, planos/combos (Prata/Ouro/Diamante), **comunicados** (mural interno), contas bancárias,
integrações bancárias, plano de contas)
· **Integração Mutual** (`/integracao/mutual`: consulta, diagnóstico, o agrupamento das equipes de
vendas em unidades, o interruptor da cobrança externa, o **de-para de tipo de veículo e de plano**
— 0084/0085, com o peso da carteira e a cobertura acumulada — e a **carga da carteira por
unidade** — 0084, com prévia, fila de trabalho por motivo e desfazer)
· **API e Integrações** (`Configurações → API e Integrações`: chaves para sistemas parceiros e a API `/api/externa/v1` — 0151)
· **Rastreadores** (`/rastreadores`: parque por IMEI, estoque por unidade/plataforma, instalação no
veículo, manutenção, painel de divergências com o cadastro da frota e relatórios de custo,
recuperação e giro).

## FICHAS DO ADMINISTRATIVO — a vida do associado e do veículo (15/10/2026, sem migration)
Pedido do usuário: o SAC é a tela do atendimento, mas o administrativo precisa da mesma vida pelas
categorias **Associados** e **Veículos**.
- **`/associados/[id]`**: abas Dados · Veículos (**linha clicável → ficha do veículo**) · Financeiro ·
  Eventos · **Protocolos** · **Assistência 24h** · Comunicações. O Financeiro lia SÓ
  `titulos_financeiros` (por isso vinha vazio) e os Eventos só `eventos_sinistro` — agora são as
  DUAS fontes, as mesmas do SAC.
- **`/veiculos/[id]`** (nova): Dados (+ alertas) · Financeiro · Eventos · Protocolos · Assistência 24h;
  *Editar cadastro* abre o modal de `/veiculos?editar=<id>&voltar=/veiculos/<id>` e volta para a
  ficha ao fechar (o `voltar` só aceita `/veiculos/<uuid>`). Em `/veiculos` a placa abre a ficha.
- **Componentes únicos:** `src/components/cadastro/vida-cadastro.tsx` (`FinanceiroCadastro`,
  `EventosCadastro`, `ProtocolosCadastro`, `AcionamentosCadastro`, `TabelaEventos` — esta também na
  aba Eventos do SAC); a lista de boletos é `HistoricoFinanceiroLista` (`acoes-veiculo.tsx`, o modal
  do SAC a embrulha). Hooks em `src/hooks/use-vida-cadastro.ts`. Puras testadas:
  `unirEventosCliente` (`eventos-historico.ts`, usada também por `/api/v1/sac/visao-360`) e
  `resumoHistoricoFinanceiro` (`historico-financeiro.ts`). Limite das fichas: 500 por fonte.
- **`/assistencia?acionamento=<id>`** abre direto a OS (atalho das fichas).
- **Limite conhecido:** boleto/evento do Mutual sem `veiculo_id` (≈22% dos boletos, 242 dos 829
  eventos em 15/10) aparece na ficha do ASSOCIADO, não na do veículo; e fatura agrupada do SCar
  (sem veículo) idem. `veiculos.regional_id` e `regional_preco_id` apontam ambos para `regionais`:
  embed tem de ser `regionais!veiculos_regional_id_fkey(...)`.

## EVENTOS (antes "Sinistros") — renomeação e Kanban compacto (17/10/2026, sem migration)
- **O módulo chama-se EVENTOS** em toda a interface. Rotas: `/eventos`, `/eventos/[id]`,
  `/eventos/novo`, `/eventos/[id]/terceiros/...` e `/portal/eventos/novo`; componentes em
  `src/components/eventos/`. **Os links antigos `/sinistros/*` e `/portal/sinistros/*`
  redirecionam (301) em `next.config.mjs`** — não apagar: há link salvo em WhatsApp e favorito.
- **O que NÃO foi renomeado, de propósito:** banco (`eventos_sinistro`, `status_evento`, o papel
  `sinistro` — agora rotulado "Eventos" na tela —, o tipo de protocolo `SINISTRO`, o campo
  `sinistros` das RPCs do painel das regionais), o bucket `sinistros-docs` e a env
  `NEXT_PUBLIC_SUPABASE_BUCKET_SINISTROS`. Renomear isso é migration + troca de bucket, sem ganho
  para quem usa. Ficaram também "Sinistralidade" (termo do indicador) e "Apólice / sinistro" no
  terceiro (é o número do sinistro na seguradora DELE).
- **Kanban compacto:** cada coluna nasce com o total e a contagem por regional; clicar na unidade
  abre só os cards dela, "Ver todos" abre a coluna inteira, "Recolher" volta, e há
  "Expandir/Recolher todas". A coluna aceita o arrasto nos dois modos. Regra pura em
  `src/lib/kanban-eventos.ts` (testada); `useEventos` passou a trazer `regionais(nome)`.
- **Busca no Kanban (28/10/2026, sem migration):** campo acima das colunas procura por associado, placa, nº do
  evento (com ou sem traço), CPF/CNPJ, chassi, tipo e unidade, sem acento; com termo, as colunas mostram só o que
  casa e já ABERTAS ("Recolher" ainda fecha). Busca local (os eventos já vêm todos), regra pura
  `eventoCasaComBusca` (`src/lib/kanban-eventos.ts`, testada); `useEventos` traz `chassi` e `cpf_cnpj`.
- **Limpeza dos testes (17/10/2026):** script em `supabase/limpeza/2026-10-17_eventos_negados.sql`
  (os 6 eventos, todos em NEGADO, + a conta a pagar, as movimentações e os protocolos ligados a
  eles). O `execute_sql` do MCP estourou os 60 s sem gravar nada; **rodado pelo usuário e CONFERIDO
  em 17/10/2026**: `eventos_sinistro` vazia, a conta "OFICINA", as movimentações e os protocolos
  ligados saíram junto. Os 2 arquivos de anexo seguem no bucket (SQL não apaga storage).

## PRAZO REGULATÓRIO DO EVENTO (0113) — Art. 22 da Resolução CNSP 491/2026
Pedido do usuário (17/10/2026), prioridade máxima: 90 dias corridos para regular e liquidar, contados do **aviso** EM
CONJUNTO com a **documentação completa**; estourado, a associação perde o direito de recusa.
- **A régua (uma só, SQL `prazo_regulatorio_nivel` = TS `nivelDoPrazo`):** início = o mais tarde entre aviso
  (`data_comunicacao`) e documentação completa; limite = início + 90; dias = (encerramento ou hoje em SP) − início.
  NO_PRAZO <30 · AVISO 30 · ATENCAO 60 · URGENCIA 75 · CRITICO 85–90 · VENCIDO >90; sem documentação =
  DOCUMENTACAO_PENDENTE (o relógio não corre). Cores: verde até 59, amarelo 60, laranja 75, vermelho 85, vencido cheio.
- **Documentação completa = automática** quando o último OBRIGATÓRIO é entregue ou dispensado, **na data da entrega**
  (não do clique). Sem checklist: *Marcar documentação completa* (com data, nunca futura nem antes do aviso; quem trata
  o evento). **Reabrir só a diretoria** (`tem_acesso_global`), com motivo.
- **🔴 DECISÃO CONSERVADORA (confirmar com o jurídico):** documento pedido DEPOIS do início entra como `complementar`
  e **NÃO para nem reinicia** o relógio. Se o jurídico entender que a norma suspende o prazo nesse caso, a mudança é
  na régua (SQL + TS) e na trilha — não no dado.
- **Encerrar = status CONCLUIDO/NEGADO** (trigger carimba `regulacao_encerrada_em`; voltar o status limpa).
  **NEGADO com prazo vencido é RECUSADO pelo banco para a ponta**; a diretoria pode, e fica `recusa_fora_do_prazo` +
  `RECUSA_FORA_DO_PRAZO` na trilha.
- **Telas:** cartão do prazo no topo da ficha do evento (barra com as marcas, aviso, documentação, dias, limite, ciência
  do alerta) + aba **Documentação** (checklist, entrega com data e anexo, dispensa com motivo, pedido complementar,
  trilha) · **`/eventos?aba=prazos`** (cartões por nível, alertas sem ciência, tabela por gravidade, CSV, *Rodar rotina*)
  · selo no card do Kanban + faixa vermelha com vencidos/críticos · **Configurações → Documentos do Evento**.
- **Rotina diária:** `POST /api/v1/eventos/prazos` (`x-cron-secret` = `COBRANCA_CRON_SECRET`, ou sessão admin/financeiro)
  → `atualizar_prazos_eventos()` (re-executável; alerta uma vez por marco). Marcos 85 e vencido saem por e-mail
  (Resend; um por evento) para admin/financeiro ativos + gestor da unidade; sem `RESEND_API_KEY` ficam só na tela. VPS:
  `5 6 * * * /opt/scar/scripts/eventos-prazos.sh` (log `/var/log/scar-prazos.log`). **A tela NÃO depende da rotina**:
  os dias são calculados ao vivo por `eventos_prazos`; a rotina grava o cache e dispara os alertas.
- **Lista padrão (seed, ajustável):** aviso assinado, CNH, CRLV, fotos (todos) + Boletim de Ocorrência (roubo, furto,
  incêndio). A lista contratual é da associação.
- **Marcos configuráveis (0114):** `Configurações → Prazos e Documentos do Evento` (só admin; link também no painel de
  prazos). Os 90 dias são legais e fixos; os 4 marcos são crescentes e ≤ 90 (CHECK no banco + `validarMarcos` no TS).
  Mudar um marco muda o nível de todo evento na hora (cálculo vivo); alerta é único por NÍVEL, então trocar 60 por 50
  não duplica a "atenção". TS lê os marcos por `useMarcosPrazo()`; `nivelDoPrazo(dias, iniciado, encerrado, marcos)`.
- **Editar o evento (17/10/2026, sem migration):** botão *Editar evento* no cabeçalho da ficha (`<EditarEventoModal>`,
  `src/components/eventos/editar-evento.tsx`, hook `useAtualizarEvento`), só para quem tem `eventos.editar`
  (`<SePode>`); o banco confere por `pode_tratar_evento` (RLS da 0077). Mesmos campos da abertura, menos veículo e
  associado. Mudar o aviso com prazo correndo avisa na tela e entra na trilha (`AVISO_ALTERADO`). Antes não havia como
  completar o evento depois de aberto.
- **Portal do associado SEM tela de evento (decisão do usuário, 17/10/2026):** `/portal/eventos/novo` virou um aviso
  "fale com a central". Ao reabrir, corrigir antes o defeito pré-existente: o trigger da abertura (0002) grava
  `historico_protocolo.usuario_origem_id = auth.uid()`, que não existe em `usuarios` (FK) quando quem abre é o associado
  (usar `usuario_atual_id()`, 0113).

## COMUNICAÇÃO DE EVENTO ONLINE (0129) — um link por envolvido
Pedido do usuário (20/10/2026, prompt do Cowork): recebido o evento, a equipe preenche a primeira tela e manda UM LINK
POR ENVOLVIDO (associado, condutor, terceiro condutor/proprietário, passageiro/vítima, testemunha); cada um preenche os
dados do evento e manda fotos pelo celular, e tudo cai no protocolo EVT-. "Deixar tudo pronto, depois ajustamos."
- **Decisões do usuário:** (1) sem OTP — o associado confirma com os 3 primeiros dígitos do CPF + data de nascimento
  (6 primeiros dígitos se não houver nascimento; 5 tentativas e bloqueia); terceiro/testemunha não veem nada além do
  protocolo; (2) a tela nunca fala de cobertura, prazo ou perda de direito — só "comunique o quanto antes"; a natureza e
  "com o que colidiu" são do envolvido e o analista confere; (3) os textos de privacidade, declaração e "não é
  reconhecimento" entraram como vieram (`TEXTOS` em `src/lib/comunicacao-evento.ts`); **o jurídico revisa depois**.
  Vocabulário proibido nos textos públicos (sinistro, seguro, apólice, indenização, franquia…) — há teste.
- **A EQUIPE PREENCHE PELO ENVOLVIDO** (quem não consegue usar o celular): botão *Preencher pela equipe* no mesmo
  formulário, com anexos; a versão fica com origem EQUIPE e o texto `TEXTOS.equipe`.
- **Telas:** aba **Comunicações** na ficha do evento (`src/components/eventos/comunicacao/comunicacoes-evento.tsx`):
  adicionar envolvido (associado com o cadastro preenchido; terceiro já cadastrado opcional), WhatsApp (wa.me com
  `mensagemComunicacao`) / copiar / **QR** (`qrcode`) / renovar 7 dias / cancelar link, versões com PDF
  (`/api/v1/eventos/comunicacao/pdf?declaracao=`, gerador dos Termos), pedir correção e conferido (`eventos.editar`),
  anexos do envolvido e **comparador** (divergência em amarelo; relato nunca diverge). Selo "Comunicações n/m" no
  Kanban. Abrir evento sem terceiros leva direto à aba (`?aba=comunicacoes`).
- **Página pública `/comunicar/<token>`** (`comunicacao-publica.tsx` + `formulario-comunicacao.tsx`, compartilhado com a
  equipe): privacidade → confirmação (associado) → passos por papel (`SECOES_POR_PAPEL`) com rascunho automático
  (servidor + `localStorage`) → declaração → comprovante (protocolo, versão, SHA-256). Depois de enviado é só leitura;
  correção pedida reabre e a versão nova se soma (as antigas ficam). Rotas: `/api/v1/comunicar` (ler/verificar/
  rascunho/enviar/remover) e `/api/v1/comunicar/anexo` (foto/PDF ≤ 10 MB, pose validada contra `POSES_POR_PAPEL`),
  service_role + token e rate limit. Foto nunca é obrigatória.
- **O token fica em claro** (diferente do prompt, que pedia só o hash): a equipe precisa reenviar o mesmo link.
- **Fase 2 (não feita):** croqui desenhado na tela, ditado por voz, alertas antifraude, ZIP, lembretes automáticos.

## LEVAR EVENTO DO HISTÓRICO AO KANBAN (0112)
Pedido do usuário (17/10/2026): eventos do Mutual "ainda sendo tratados" vão para o Kanban, **sempre em
Aberto**, e **a equipe escolhe quais** (nada vai sozinho: o Mutual manda "ANDAMENTO" em todos e só 8 de
829 têm conclusão).
- **Tela:** `/eventos?aba=historico` — caixa de seleção por linha (+ "marcar a página"), barra
  "Levar ao Kanban (N)", botão "Levar" por linha, filtro *Kanban: ainda não levados / já no Kanban*, e a
  coluna Kanban com o link `EVT-…` do evento criado. Botões só para quem tem `eventos.criar`.
- **O evento criado** leva associado, veículo, data, unidade, envolvimento e o tipo por palpite
  (`tipo_evento_do_historico`, nulo quando não casa); protocolo/tipos/envolvimento/valor do Mutual vão na
  descrição, que começa com "Trazido do historico do Mutual" — é essa frase que põe o selo **Mutual** no
  card (`veioDoMutual`, `src/lib/kanban-eventos.ts`).
- **Não vai:** sem veículo na base (237 em 17/10 — `veiculo_id` é not null), sem data, outra unidade, já
  levado. Regra espelhada em `podeLevarAoKanban`/`resumoTransporte` (`src/lib/eventos-historico.ts`).
- **Apagar o evento no Kanban devolve o histórico** (FK `on delete set null`).
- **O levado conta como evento do SCar**, inclusive nos limites dos opcionais; sai da conta do histórico
  no SAC, no marcador do veículo e no painel. Re-importar o histórico (0101) preserva o elo.

## BAIXA DOS BOLETOS DO MUTUAL PELO BANCO (0117) — o fechamento bancário é do SCar
Fatos e decisões (18/10/2026): o Sicredi confirmou que o contrato de webhook é **UM por beneficiário**;
o do Mutual foi **desligado** para operar aqui, e o **fechamento bancário passa a ser feito pelo SCar**.
Os boletos que o Mutual ainda emite são do mesmo beneficiário, então o pagamento deles só chega aqui.
- **Medido em produção antes da 0117:** a rotina de baixa (produção) já tinha gravado **602 pagamentos
  de 13–16/10 (R$ 125.560,81)** como NAO_ENCONTRADO; **579 casam com UM boleto** do histórico pelo nosso
  número, 23 não casam (provavelmente associados do acervo não carregados).
- **Casamento:** `boletos_historico.nosso_numero` é coluna GERADA da linha digitável Sicredi (748):
  campo livre = tipo(1)+carteira(1)+**nosso número(9)**+coop(4)+posto(2)+beneficiário(5)+…
- **`registrar_liquidacao_banco` (mesma assinatura):** título do SCar primeiro; sem ele, no Sicredi de
  PRODUÇÃO, o boleto do Mutual → marca `pago` (valor/data do banco, `baixa_banco_em`) e, **a partir de
  13/10/2026** (`inicio_baixa_banco_mutual()`, decisão do usuário), cria **UM recebimento por boleto**
  (`lancamentos_financeiros`, 1.1.00, unidade do associado, competência do boleto, `numero_documento =
  SICREDI-<nosso>`) com a **baixa na conta SICREDI** (`contas_bancarias` com "sicredi" no nome/banco),
  `NAO_CONCILIADO`, data = dia do PAGAMENTO (provisória). Boleto já pago pelo Mutual também ganha o
  recebimento (o dinheiro entrou aqui). Re-executável: com recebimento → JA_PAGO.
- **Trava:** trigger `trg_boleto_historico_baixa_banco` — importação do Mutual nunca desfaz pago
  confirmado pelo banco (o Mutual ficou sem webhook e vai atrasar).
- **`reprocessar_liquidacoes_banco(p_desde)`** passa de novo os NAO_ENCONTRADO (boleto importado depois do
  pagamento). Botão *Reprocessar* na bancada do Sicredi.
- **DATA DO CRÉDITO (decisão do usuário: vale a data do crédito, não a do pagamento) — PENDENTE:** vem do
  extrato "Francesinha" (`/cobranca/v1/cobranca-financeiro/movimentacoes`, `gw.movimentacoes`, ação
  `francesinha` da bancada, retorno CRU — formato ainda não visto; data `DD-MM-AAAA` no sandbox e
  `DD/MM/AAAA` em produção). Passo seguinte: puxar um dia real, guardar em `sicredi.test.ts`, mapear e
  trocar a data da baixa para a do crédito + `CONCILIADO_API` + tarifas.
- **Não identificados (0118, decisão do usuário):** viram RECEITA 1.9.98 na matriz, sem associado, com a baixa
  na conta SICREDI; a trilha segue NAO_ENCONTRADO com `lancamento_id`, então *Reprocessar* os converte quando o
  boleto chega (mesmo lançamento → 1.1.00 da unidade) ou os cancela se o pagamento era de título do SCar.
- **DATA DO CRÉDITO (0146) — RESOLVIDO pelo tipo de liquidação, sem a Francesinha:** `liquidados/dia` traz a data do PAGAMENTO e o `tipoLiquidacao` (PIX | COMPE | REDE). PIX credita no próprio dia (inclusive fim de semana); COMPE (outro banco) e REDE (lotérica) creditam no próximo dia útil (`data_credito_banco`, espelho `dataCreditoLiquidacao` em `src/lib/baixa-banco.ts`). Conferido contra o `credit_date` do INVOICE do Mutual: 13/10 → 14/10, 16/10 sexta → 19/10, 09/10 sexta → 13/10 (12/10 feriado). A baixa (`baixas_financeiras.data_pagamento`) e o vencimento do recebimento vão para o crédito; boleto e título guardam o dia do pagamento. O início da baixa do Mutual (13/10) compara o CRÉDITO. Os créditos COMPE/REDE chegam SOMADOS no extrato ("LIQ.COBRANCA SIMPLES-COB000042" = 42 boletos) e seguem IGNORADOS pela regra do OFX; casar o total com as baixas do dia é o próximo passo. **Feriado municipal da cooperativa** precisa ser cadastrado na tela (Cobrança → painel → configuração).
- **Ressalvas:** competência dos boletos antigos pagos depois de 13/10 cai no mês original (regime de
  competência); estorno segue sem
  tratamento.

## RÉGUA DE COBRANÇA (0139) — bloqueio, revistoria, inativação e a fila
Pedido do usuário (22/10/2026): prazos configuráveis da régua, fila só com quem ainda se cobra, ordenação pelo
atraso. Decisões: **(1)** até o corte do Mutual, o veículo migrado (`cobranca_externa`) **NÃO é inativado** —
passado o prazo ele só sai da fila como "a inativar"; a inativação de verdade vale para quem é cobrado pelo SCar;
**(2)** a trava da 24h conta o boleto do Mutual vencido; **(3)** ordem padrão = prioridade e, dentro dela, o
**menor atraso** (maior chance de recuperar), com o cabeçalho "Atraso" clicável; **(4)** inativados ficam numa
métrica própria, "Inativados no período".
- **Os três prazos, em Configurações → Empresa → Régua de cobrança** (`src/lib/regua-cobranca.ts`, testado):
  bloqueio dos benefícios a partir de N dias de vencido (`dias_bloqueio_inadimplencia`, 1) · 2ª via sem
  revistoria até N dias (`dias_revistoria_boleto`, 5 — a partir de N+1 exige revistoria, 0137) · inativação com
  N dias (`dias_tolerancia_inadimplencia`, 20, 0072). O pedido falava em "9 sem vistoria / 10 exige": é UM número
  (9), não dois. Ordem travada no banco (`chk_empresa_regua_ordem`) e na tela (`validarRegua`).
- **24h:** `situacao_assistencia_veiculo` lê `vencidos_veiculo(veic, bloqueio)` — antes só `titulos_financeiros`,
  então a carteira migrada nunca era bloqueada. O motivo diz "boleto(s) em atraso" (sem a palavra "limite", senão
  `motivoNegativaSugerido` sugeriria LIMITE_ATINGIDO).
- **Rotina:** `rotina_regua_cobranca()` roda junto da revistoria (`/api/v1/cobrancas/revistorias/rotina`,
  crontab 06:15 que já existia). Hoje é quase no-op: os veículos cobrados pelo SCar são poucos. No corte de cada
  unidade (`definir_cobranca_externa_regional`), ela passa a valer para ela.
- **Fila:** `a_inativar` (prioridade 9) sai da fila, das faixas e das métricas da carteira; aparece no tile
  "A inativar" (clicar mostra a lista). Painel: tile "A inativar" na carteira e "Inativados no período"
  (`cobranca_inativados`: saída no período, quantos pela régua).
- **⚠️ Achado, não corrigido:** o churn do Dashboard das Regionais conta `data_saida`, e o acervo de RIBEIRÃO PRETO
  (3.760 veículos) entrou JÁ inativo em 14/10 — o painel pode mostrar ~3.786 "cancelados" em outubro.
  `cobranca_inativados` exclui esse caso (`data_saida > data_sp(created_at)`); o painel das regionais ainda não.

## BOLETO DO MUTUAL SUBSTITUÍDO (0140) — a 2ª via paga não deixa o original "vencido"
Visto pelo usuário no Painel de Inadimplência (22/10/2026): o "Inadimplente" parecia sujo. Não entrava boleto a
vencer (a conta já usa só o que venceu) — o que poluía era a **2ª via do Mutual**: o Mutual emite uma via nova e o
ORIGINAL fica "PENDING" para sempre; o associado paga a nova. O histórico tinha os dois e o original contava como
vencido. Medido: 498 abertos (R$ 96,6 mil) com o mês pago por outra via + 163 duplicados por outra via aberta.
- **A ligação é do próprio Mutual:** a 2ª via traz `original_reference_id` = o `reference_id` do original. Grupo =
  mesma `referencia_original`. Pago no grupo → os abertos viram `cancelado` + `substituido_por`; sem pago → vale a via
  mais RECENTE (a que o Mutual mantém viva, com o vencimento novo). Mesma escolha do renegociado (0121): todo leitor já
  trata cancelado como "não é dívida", então nenhuma função de leitura foi recriada.
- **Gatilhos:** BEFORE preenche a referência pelo payload capturado e impede a importação de reabrir o substituído
  (pagamento sempre vence); AFTER recalcula o grupo quando a situação muda. Reversível: cancelada a via nova, a antiga
  volta a `aberto`. `recalcular_substituicoes_boletos(null)` refaz a base inteira (idempotente).
- **Via SEM ligação (0154):** o Mutual às vezes emite a "2ª via" como cobrança NOVA, sem `original_reference_id` (caso
  RQE9F00, agosto: original venc. 10/09 aberto, via de 17/09 paga em outro grupo). Regra somada: aberto de grupo sem
  pagamento é substituído pelo boleto PAGO de outro grupo do mesmo associado, veículo (ou ambos sem), competência, tipo e
  MESMO valor, emitido DEPOIS do aberto. Valor diferente ou emissão anterior não casam (pode ser outra cobrança). O
  recálculo de um grupo inclui os grupos do mesmo associado e competência (senão o pagamento num grupo não alcança o
  aberto do outro). Medido em 27/10: 23 abertos nessa situação (R$ 4,9 mil), 20 casam pela regra.
- **SAC/portal mostram o original como "cancelado"** (`substituido_por` diz qual via vale) — sem rótulo próprio ainda.
- **Depende de `mutual_captura`** para a referência: boleto importado depois do corte sem captura fica sem grupo (não é
  tocado). As colunas guardam a referência, então apagar a captura no corte não desfaz nada.

## CONTAS A PAGAR — ESTORNO, EXCLUSÃO E COTAÇÃO (0132)
Pedido do usuário (21/10/2026): filtro de fornecedor, estornar pagamento já feito (admin/financeiro ou extra),
excluir conta não paga e, nos eventos, ao aprovar a cotação ir direto ao lançamento com o fornecedor escolhido.
- **Ações por linha em Financeiro → Contas a Pagar/Receber** (regra pura `acoesDoTitulo`, `src/lib/financeiro.ts`,
  testada): *Registrar baixa* (em aberto) · **Pagamentos** (ícone de histórico, quando há pagamento: lista as baixas
  com conta e encargos, e **Estornar** com motivo — `<PagamentosModal>`) · Editar · Cancelar (só sem pagamento; fica na
  lista como cancelado) · **Excluir** (só sem pagamento; motivo; tira da carteira e apaga os anexos do storage —
  `<ExcluirLancamentoModal>`). Os dois modais estão em `src/components/financeiro/acoes-titulo.tsx` e também na aba
  Financeiro do evento.
- **Quem pode é o BANCO:** `estornar_baixa` exige `perfil_pode('financeiro','estornar')` e `excluir_lancamento`
  `perfil_pode('financeiro','excluir')` (seed: só financeiro; admin sempre; outros por extra, 0116), mais o alcance do
  título (`lancamento_no_alcance` = o recorte das policies `lanc_all`/`lanc_assistencia`).
- **Recusas:** estorno/exclusão de título do BANCO (`SICREDI-…`, ligado em `cobranca_liquidacoes`/`boletos_historico`
  — o dinheiro entrou; trata-se pela conciliação); exclusão de título com pagamento (estorne antes) e de título da OS da
  24h (o título é da OS, 0027: cancele/troque o prestador lá).
- **Estornar = apagar a baixa**, e os triggers de 0012/0032 recalculam situação e saldo; a baixa conciliada devolve o
  item do extrato a PENDENTE (0119); o comprovante anexado à baixa é preservado no título. A foto do que saiu fica em
  `financeiro_auditoria` (sem FK para o título, de propósito).
- **Filtro de fornecedor** (`<SeletorFornecedor>`, `src/components/fornecedores/seletor-fornecedor.tsx`: busca por
  fantasia/razão/CNPJ, com "+ Cadastrar" para quem tem `fornecedores.criar`) — filtra no banco (`fornecedor_id`) e
  respeita o período escolhido. O mesmo seletor substituiu o `<select>` do fornecedor no lançamento. O cadastro rápido
  abre por PORTAL com os eventos contidos: ele vive dentro do `<form>` do lançamento e o submit borbulharia até ele.
- **Revisão de passagem:** a baixa passou a EXIGIR a conta (sem ela o pagamento não entra no saldo nem na
  conciliação), e o filtro "Em atraso" passou a ser pelo VENCIMENTO (antes só achava o que a rotina tinha marcado).
- **Cotação do evento** (`src/components/eventos/cotacao-pecas.tsx`): nova cotação escolhe o fornecedor CADASTRADO (ou
  só o nome, como antes); cotação sem fornecedor ganha o seletor para vincular. **Aprovar pergunta na hora** "Lançar no
  contas a pagar?" e abre o `<LancamentoModal>` preenchido por `lancamentoDaCotacao` (`src/lib/terceiros.ts`, testada:
  fornecedor, valor, evento, terceiro, unidade, categoria 3.1.04 e as peças na observação); gravado, o título fica em
  `cotacoes_pecas.lancamento_id` (selo "Lançado"). Aprovada sem lançamento mantém o botão; aprovada/rejeitada não edita
  item (Reabrir volta a EM_ABERTO enquanto não houver lançamento). Valor unitário com `MoneyInput`.

## TESOURARIA (0119) — saldos, extrato, OFX e fluxo diário
Pedido do usuário (18/10/2026): o financeiro vira o centro financeiro — extrato por conta, conciliação OFX,
saldo de cada conta e o **saldo total resumido**, fluxo diário (realizado × a realizar) e relatórios.
- **Diagnóstico de partida (produção, 18/10):** todo dinheiro já passava por `baixas_financeiras`, sempre com
  conta (615 baixas, 0 sem conta; SICREDI 606 · INTER 6 · ASAAS 2 · CAIXA 1); `movimentacoes_caixa` vazia;
  `titulos_financeiros` vazia. Não havia saldo inicial, extrato, OFX, transferência nem fluxo diário.
- **🔴 A FONTE ÚNICA DO CAIXA é `tesouraria_movimentos()`**: baixas com conta (`valor_liquido`, como o DRE) +
  títulos do SCar pagos pelo banco (conta = `integracoes_bancarias.conta_bancaria_id`; o título NÃO vira baixa
  porque o DRE já o lê do título) + transferências (duas pernas). Saldo, extrato, fluxo diário, demonstrativo e
  conferência leem dela — **por isso não divergem entre telas**. Função nova que mostra dinheiro: leia dela.
- **Saldo inicial = saldo no FIM do dia `saldo_inicial_em`**; movimento até esse dia não entra (`valido`). Sem
  data, todo movimento entra. Sicredi: usar o saldo de 12/10/2026 (a baixa automática começa em 13/10).
- **🔴 O EXTRATO (OFX) NUNCA MEXE NO SALDO.** Ele é conferência: `extrato_itens` (unique conta + FITID —
  reimportar não duplica) liga a um movimento que já existe (baixa/título/transferência) ou cria o lançamento +
  baixa ali (tarifa, rendimento, pagamento sem título). É isso que garante "sem duplicidade" entre webhook e OFX.
- **Classificação na importação (`classificar_extrato_itens`), nesta ordem:** (1) casa com UM movimento livre
  da mesma conta, mesmo valor e sentido, ±3 dias (desempate: mesmo dia) → SUGERIDO; (2) crédito que sobrou +
  regra da conta (`ofx_mensalidades`: NENHUM | POR_TEXTO com `ofx_textos_mensalidade` (padrão COBRANCA,
  LIQUIDACAO, BOLETO, sem acento) | TODOS_CREDITOS) → IGNORADO "MENSALIDADE"; (3) PENDENTE. Os PIX das
  mensalidades que o webhook baixou um a um casam no passo 1; o crédito SOMADO da liquidação de boletos cai no 2.
- **Conciliar** marca a baixa `CONCILIADO_MANUAL`; desfazer volta `NAO_CONCILIADO` e **não apaga** o lançamento
  criado. Baixa apagada (ex.: 0118 cancelando um não identificado) devolve o item a PENDENTE (trigger).
- **Transferências** mudam o saldo de cada conta, nunca o consolidado nem o DRE; no extrato consolidado ficam
  ocultas por padrão. Cancelar transferência conciliada é recusado.
- **CONCILIAÇÃO EM LOTE DA COBRANÇA (0147):** o Sicredi credita o PIX um a um, mas os boletos COMPE/REDE chegam SOMADOS no extrato ("LIQ.COBRANCA SIMPLES-COB000042" = 42 boletos). O lote de um crédito = as baixas (e títulos do SCar) da mesma conta, liquidados por COMPE/REDE, com crédito (0146) no dia do item, ainda livres; fecha quando a soma bate no centavo (a quantidade do histórico é só conferência). Vínculo em `extrato_item_lote`, baixas `CONCILIADO_API`, item CONCILIADO com motivo "LOTE DA COBRANCA: N boleto(s)…". Roda sozinho na importação do OFX (`classificar_extrato_itens`) e na rotina de baixa (últimos dias); na tela: botão **Conciliar lotes da cobrança** e, por linha, **Lote da cobrança** (prévia com a diferença quando não fecha). Desfazer devolve as baixas; apagar uma baixa do lote solta o lote inteiro. Dois créditos de cobrança no MESMO dia (que se somam) não são separados: a prévia mostra a diferença. **Extrato agrupado (0149):** na aba Extrato, *Agrupar recebimentos da cobrança* (ligado por padrão) junta os boletos pagos pelo banco em UMA linha por dia e tipo ("Recebimentos PIX da cobrança", "Boletos liquidados (COMPE e REDE)") com o total, o saldo real depois do grupo e "n/m" conferidos; clicar abre os boletos (associado, forma, nosso número). O CSV/Excel/PDF exporta como está na tela. Regra pura `agruparExtrato` (`src/lib/tesouraria.ts`, testada). **PIX da cobrança (0148):** o OFX não traz o nosso número; casa por VALOR no mesmo dia com as baixas PIX do banco (qual linha fica com qual baixa de mesmo valor é indiferente para o caixa) — motivo "PIX DA COBRANCA: casado por valor no dia".
- **Fluxo diário:** realizado pela fonte única; a realizar = lançamentos em aberto (`valor_saldo`) por vencimento
  a partir de hoje; vencido e não pago vai na linha de HOJE; boletos previstos (Mutual em aberto + títulos SCar) em
  coluna própria. **Previsão não tem conta**: com conta escolhida só o realizado aparece. Projeção em
  `projetarFluxo` (`src/lib/tesouraria.ts`, testada): passado = realizado, hoje = realizado + previsto (+ vencido
  das saídas por padrão, opção), futuro = previsto; carga do dia (livre/atenção/crítico).
- **Conferência caixa × DRE** (`conferencia_caixa_dre`): variação do saldo consolidado − resultado do DRE caixa, com
  a diferença explicada (antes do saldo inicial, baixa sem conta, título sem conta na integração, avulsas).
- **Telas (`/financeiro`, só admin/financeiro — `temAcessoGlobal`; o banco recusa os demais):** Contas e Saldos
  (`saldos-contas.tsx`: saldo por conta, total, último OFX × sistema, configurar saldo inicial/regra, transferências,
  conferência) · Extrato e Conciliação (`extrato-conciliacao.tsx`: extrato com saldo real por linha mesmo filtrado;
  importar OFX com prévia e checagem da conta; fila PENDENTE/SUGERIDO/CONCILIADO/IGNORADO; modal com candidatos,
  criar lançamento, transferência, ignorar) · Fluxo Diário (`fluxo-diario.tsx`: gráfico + grade com a carga) ·
  Relatórios (`relatorios-financeiros.tsx`: extrato, fluxo, plano × centro; filtros período/conta/centro/plano/status).
  Export CSV/Excel/PDF em `exportar.ts` + `BotoesExportar` (`tesouraria-ui.tsx`).
- **OFX:** `src/lib/ofx.ts` (testado) lê SGML 1.x e XML 2.x, decodifica CHARSET 1252, aceita vírgula decimal,
  separa FITID repetido com conteúdo diferente (`#2`) e monta identidade estável quando falta FITID.
- **OPERADOR DE CONTA (0126):** a conta pode ser liberada a quem não é da matriz (Contas e Saldos → *Configurar* →
  "Quem opera esta conta"). O operador vê as abas Contas e Saldos e Extrato e Conciliação **só das contas dele**
  (seletor, saldo total, extrato, OFX, conciliar, criar lançamento, ignorar, desfazer); transferência exige que UM
  dos lados seja dele; lançamento em aberto que ele concilia segue o alcance dele no financeiro (unidade ou 24h).
  Configurar a conta, Fluxo Diário, Relatórios, DRE e a conferência caixa × DRE continuam da matriz. Caso de uso:
  FRANCIELLI (supervisora) no INTER, a conta exclusiva de pagamento da 24h. A tela decide as abas por
  `minhas_contas_bancarias()`; quem confere é o banco.
- **Saldo inicial e data base (20/10/2026, sem migration):** também no cadastro da conta, em Configurações → Contas Bancárias (`useSaveContaBancaria` grava `saldo_inicial`/`saldo_inicial_em`; o cartão mostra o saldo e a data, ou "sem data base"). Valor diferente de zero exige a data. Em 20/10 as 4 contas (ASAAS, BANCO INTER, CAIXA, SICREDI) estavam com R$ 0 e sem data.
- **Não feito / próximos:** formato real do OFX do Sicredi ainda não visto (guardar um em `ofx.test.ts`); a
  Francesinha (data do crédito, tarifas) segue pendente; títulos do SCar só entram no extrato quando a integração
  SICREDI tiver `conta_bancaria_id` (não há tela — `update integracoes_bancarias set conta_bancaria_id = ...`).

## TERMOS (0123) — documentos da associação com campos do cadastro
Pedido do usuário (19/10/2026): um lugar para os documentos da Smart Car (Termo de Adesão, Regimento, Termo do
rastreador...) e para criar outros, escolhendo os campos do cadastro — como o "Gerenciar Termos" dos outros
sistemas, mas com o campo DENTRO do texto. Decisões do usuário: fica em **Configurações → Termos**; **cria/edita
modelo só o admin, ou quem recebeu o extra** `termos_modelos.*` (0116); **emite** quem atende (todo staff),
**consultor de vendas não**; **PDF gerado no servidor** (Chromium na imagem).
- **Modelo** (`termos_modelos`): nome, tipo, escopo **ASSOCIADO** (preenchido por pessoa/veículo) ou **GERAL** (igual
  para todos — Regimento), filtros planos/tipos/usos/unidades (vazio = todos), *disponível no portal*, *ativo*,
  *exige aceite* + declarações. O texto é HTML do editor (TipTap, `src/components/termos/editor-termo.tsx`): cada campo
  é `<span data-campo="associado.nome">` (bloco: `<div data-campo="coberturas.tabela">`), inserido pelo botão
  **Inserir campo**. **Importar Word** (mammoth, no navegador): tabelas viram tabela; a caixinha do Word (PNG
  minúsculo) e símbolo Wingdings viram ☐ (`limparHtmlDoWord`, `src/lib/termos-word.ts`). Conferido com o Termo de
  Adesão real: a tabela sai igual ao Word.
- **Campos** (`CAMPOS_TERMO`, `src/lib/termos.ts`, testado): associado, veículo, plano e contrato (mensalidade,
  adesão, participação, cota, vencimento, unidade, vendedor), coberturas (tabela, lista e marcas ☒/☐ por grupo),
  empresa (inclui `empresa.regulamento_url`, campo novo em Configurações → Empresa), emissão (data, por extenso,
  cidade e data, protocolo). Campo **novo = só no catálogo** (`CAMPOS_TERMO` + `valoresDoTermo`); o teste exige que
  todo campo tenha valor. Sem dado = linha em branco e entra em **vazios** (avisados ANTES de emitir). Opcional não avisa.
- **Publicar** congela o rascunho em `termos_versoes` (número, SHA-256 calculado no banco, imutável por trigger).
  Termo GERAL gera o PDF da versão na publicação. Emissão usa sempre a versão publicada.
- **Emitir** (`/api/v1/termos` ação `emitir`): lê os dados pela SESSÃO (RLS), preenche, `registrar_termo_emitido`
  confere permissão e unidade, gera o protocolo `TRM-AAAAMMDD-NNNN`, troca a marca `{{PROTOCOLO_DO_TERMO}}` e calcula
  o hash; depois o PDF (rodapé com protocolo, versão e hash) vai ao bucket `termos` pelo service_role e
  `anexar_pdf_termo` grava caminho + SHA-256 (uma vez). PDF que falhou: botão *Gerar PDF*. Cancelar exige motivo e
  tira do portal; conteúdo nunca muda.
- **Onde se emite:** aba **Termos** na ficha do associado e do veículo e cartão **Termos** no SAC
  (`<TermosDoCadastro>`); o termo que serve ao plano/tipo/uso/unidade do veículo vem primeiro (`termoServeParaVeiculo`).
  **Portal:** *Documentos* (`/portal/documentos`, `portal_documentos()`), termos emitidos visíveis + documentos gerais.
  PDF sempre por `/api/v1/termos/pdf` (bucket sem policy para `authenticated`).
- **PDF:** `src/lib/termos-server.ts` (`gerarPdf` com puppeteer-core, sem rede — a logo vai embutida em data URL;
  `CHROMIUM_PATH` ou `/usr/bin/chromium-browser`). `next.config.mjs` marca `puppeteer-core` como externo.
- **Rastreador no termo (20/10/2026, sem migration):** campos `veiculo.rastreador_imei` (parque `rastreadores` vence a ficha), `veiculo.rastreador_status` ("2 - Ativo / Instalado") e `veiculo.rastreador_unidade` — o equipamento ATIVO do veículo, senão o mais recente. Decisão do usuário: o Termo de Comodato só precisa de IMEI, status, veículo/associado e unidade (os demais dados virão por API da rastreadora); valores do rastreador são únicos da empresa e ficam no texto. O prompt do Cowork (`equipamentos_rastreador`, aceite com OTP) NÃO foi implementado: duplicaria `rastreadores` (0050) e depende do aceite.
- **Fora desta fase (próxima):** o ACEITE eletrônico (link com prazo, as 6 declarações, IP/dispositivo/hora do
  servidor, confirmação de identidade). As declarações já ficam no modelo. Perguntas abertas: onde o aceite entra
  na venda, canal do código de confirmação (Resend sem chave; WhatsApp sem API), migrados do Mutual.

## 2ª VIA E BOLETO NEGOCIADO (0121) — na hora, no Sicredi, já enviado
Pedido do usuário (18/10/2026): o atendente negocia o débito / o associado pede a 2ª via, e o boleto tem de sair na
hora e já ir para ele. **Diagnóstico de produção:** 0 títulos do SCar; **7.973 boletos do Mutual em aberto (1.846
vencidos)**, que o SAC só mostrava; o antigo "2a via" (`reemitir_titulo`) só limpava o gateway e esperava a remessa
(que é só admin/financeiro); acordos (0098) não geravam boleto nenhum.
- **✅ DECISÃO DO USUÁRIO: sempre BOLETO NOVO do SCar** para 2ª via vencida e negociação; os originais (Mutual ou
  SCar) recebem **baixa no Sicredi** (mesmo beneficiário) — o associado não consegue pagar os dois.
- **A ordem da rota `POST /api/v1/cobrancas/renegociacao` é a garantia:** (1) `criar_renegociacao` pela SESSÃO
  (escopo `cobranca_pode_cliente`); (2) emite os novos no Sicredi; (3) `finalizar_emissao_renegociacao` — qualquer
  recusa cancela os novos (e pede baixa dos que o banco aceitou) e **não toca nos originais**; (4) só então
  `gateway.cancelar(nossoNumero)` de cada original → `registrar_baixa_original` (BAIXADO / ERRO com motivo /
  SEM_REGISTRO para título do SCar que nunca foi ao banco). Baixa recusada fica na tela com **"Tentar a baixa de novo"**
  (`acao: 'baixar'`). Emissão interrompida há +15 min vira ERRO na próxima tentativa do mesmo associado.
- **Boleto do Mutual só entra com linha do Sicredi (748)** — é dela que sai o `nosso_numero` (0117) para a baixa.
- **Os novos não têm fatura, de propósito:** não mexem no corte da cobrança (0099). Mas entram no painel/fila
  (`cobranca_boletos_base` recriada) e, ligados a um acordo, **cumprem o acordo** (`cobranca_acordos_situacao` recriada).
  Não geram comissão (`fn_calcular_comissao`). Levam o veículo do maior original (DRE/24h leem pelo veículo).
- **A importação do Mutual não reabre o renegociado** (`trg_boleto_historico_renegociado`), salvo pagamento
  confirmado pelo banco (0117 manda).
- **Tela:** Histórico Financeiro (SAC, fichas de associado/veículo — `HistoricoFinanceiroLista`) ganhou seleção
  dos boletos em aberto + "Marcar os vencidos" + **"2a via / negociar"**, e por linha "2a via (novo boleto)"/"Negociar",
  **"PDF (Sicredi)"** (também do boleto do Mutual a vencer: `GET /api/v1/cobrancas/boleto?boleto_historico_id=`) e
  **"Enviar 2a via"** no WhatsApp do mesmo boleto. O modal (`src/components/cobrancas/negociacao-boletos.tsx`):
  boleto único ou parcelado (2–36, mensal), vencimento, acréscimo/desconto, ou **"Gerar os boletos do acordo"** em
  andamento; depois de emitir mostra linha/PIX/PDF e envia por **WhatsApp** (texto com linha + PIX) e **e-mail**
  (`POST /api/v1/cobrancas/boleto`, Resend com PDF anexo). Fila de Cobrança: botão na ficha e "gerar os boletos do
  acordo". "Editar" só para título que ainda não foi ao banco. Regras puras em `src/lib/renegociacao.ts` (testadas).
- **Pendências:** cadastro SICREDI em `producao` + `conta_bancaria_id` (tesouraria); `RESEND_API_KEY` para o e-mail;
  o SAC mostra o original baixado como "cancelado" (não "renegociado").

## INADIMPLÊNCIA E COBRANÇAS (0097) — Fase 1
> Especificação, fórmulas, regras bancárias, permissões e fases em
> **`docs/modulos/cobranca-inadimplencia.md`** — leia antes de mexer.

- **A fonte é UMA:** `cobranca_boletos_base()` — títulos de mensalidade do SCar (ligados a fatura)
  + `boletos_historico` (Mutual) **só antes da data de corte** do associado (o 1º boleto do SCar
  dele). Sem o corte, a mesma competência contaria duas vezes depois do cutover.
- **REGRA ESSENCIAL:** boleto que não venceu não entra em taxa nenhuma. O denominador é sempre o que
  JÁ VENCEU (vencimento efetivo = próximo dia útil; feriados em `cobranca_feriados`).
- **Percentual mora no TS** (`src/lib/cobranca-painel.ts`, testado); o banco devolve contagem e
  soma. Comparativo mostra **p.p. e variação relativa** juntos.
- **O histórico NÃO é título.** `boletos_historico` fica fora de `titulos_financeiros` de propósito
  (DRE e trava da 24h). E fica depois do corte de dezembro: é a história de pagamento.
- **Mas TODA tela que mostra "os boletos do associado" lê as DUAS fontes (0099).** Foi bug real: o
  histórico importado não aparecia no SAC nem no portal, porque eles só liam `titulos_financeiros`.
  Tela nova de boletos do associado: `titulos_*` + `boletos_mutual_do_cliente`/`portal_boletos_mutual`,
  unidas por `src/lib/historico-financeiro.ts`.
- **Escopo** em `cobranca_escopo()` (uma vez por chamada, não por linha). Supervisor e cobrança
  NÃO ganharam nada em `pode_regional()` — decisão de desenho à parte (achado nº 1 da varredura).
- **O ciclo é o dia do vencimento ORIGINAL** (`original_expiration_date` do Mutual); o atraso conta
  do vencimento prorrogado/limite.
- **Datas só-dia do Mutual entram por `mutual_dia()`**, não `mutual_data()`: esta converte fuso e
  um `'2026-09-08'` viraria 07/09 em São Paulo.
- **O dado do Mutual envelhece:** o painel avisa quando a captura de INVOICE tem mais de 7 dias.
- **Fase 2 construída na `0098`** (fila `/cobrancas/fila`, contatos imutáveis, promessas/acordos com
  situação calculada). **Fases 3–5 (qualidade da venda, régua, relatórios) ainda não existem.**

## Catálogo de CORES do veículo (0080) — `Configurações → Cores`
> **Cuidado com o nome:** isto **não é a paleta visual** do sistema (essa vive em `globals.css` /
> `tema.ts` e, no white-label, irá para `empresa`). Aqui é a cor do **carro**.

- **O defeito:** `veiculos.cor` e `leads.cor` eram **texto livre** escrito por três caminhos que
  nunca combinaram entre si — a digitação na ficha, a **consulta por placa** (0075, que traz a cor
  do registro do documento) e, a partir da Fase 3, a **carga do Mutual** (`vehicle_color_id` de
  `/vehicle/color/`). Resultado: `PRATA`, `Prata`, `prata metalico` e `PRATA METÁLICO` são quatro
  cores para o banco, e **todo filtro, contagem e relatório por cor mente**.
- **O vocabulário é o do DOCUMENTO (DENATRAN), não uma paleta comercial.** O CRLV tem **dezesseis**
  cores e só essas — e é do CRLV que a consulta por placa lê. Semear "PRATA PÉROLA" no catálogo
  seria criar vocabulário que o documento não tem.
- **🔴 `cor` CONTINUA SENDO TEXTO, e é ELE que é padronizado.** Trocar a coluna por `cor_id`
  obrigaria a mexer em todo leitor que já existe (`autorizar_entrada_lead` 0034/0075, o SAC, o
  portal, a ficha) por um ganho que o trigger já entrega. `cor_id` entra **ao lado**, opcional —
  exatamente o que `modelos.id` → `veiculos.modelo_id` fez na 0016.
- **🔴 COR DESCONHECIDA ENTRA E É RELATADA, NUNCA RECUSADA.** Recusar no balcão, com o cliente na
  frente, uma cor que o documento traz e o catálogo ainda não conhece é trocar um dado impreciso
  por **nenhuma venda**. Mesma escolha do `numero_motor` (0075): divergência aqui é **relatório**
  (`cores_nao_reconhecidas()`), não constraint. A fila aparece na própria tela, ordenada por
  **volume** — tratar a que mais pesa resolve a maior parte da base com a menor decisão.
- **Apelido é TABELA, não array.** O `unique` é no **apelido**, não no par: é ele que impede
  `GRAFITE` apontar para CINZA e para PRETO ao mesmo tempo. Array em coluna não dá essa garantia.
- **A primeira palavra é fallback deliberado.** `cor_do_texto` tem quatro degraus — nome, apelido,
  primeira palavra como nome, primeira palavra como apelido. "PRATA METALICO", "AZUL ESCURO",
  "BRANCO PÉROLA": a primeira palavra já é uma cor do catálogo. **Não é busca aproximada** — só
  casa quando a palavra É um nome ou apelido cadastrado, então "XPTO" continua desconhecido.
- **O trigger vale para o lado que o chamador MUDOU.** Quem **digitou** a cor manda sobre o `cor_id`
  antigo (é quem está com o documento na mão); quem gravou só o **`cor_id`** (a carga, uma API)
  recebe o texto do catálogo. Sem essa distinção um dos dois caminhos seria desfeito em silêncio —
  e foi exatamente o que a primeira versão do trigger fez, pego pela suíte antes de sair daqui.
- **O que não resolve fica como veio, em caixa alta e COM acento.** A fila de revisão é lida por
  gente; tirar o acento ali não ajudaria ninguém. Vazio vira **NULL, nunca `''`** (a mordida de
  `fornecedores.documento`, 0051).
- **A tela usa SELETOR, e isso não é a trava.** `<CampoCor>` (`src/components/cores/campo-cor.tsx`)
  é compartilhado por `/veiculos` e pelo `<FechamentoVenda>` — evita o erro de digitação. A trava é
  o **trigger**, porque a placa e a carga escrevem por fora de qualquer tela.
- **A cor JÁ GRAVADA que não está no catálogo continua na lista** (`opcoesDeCor`). Sem isso, abrir
  uma ficha antiga mostraria o campo em branco e o primeiro "salvar" apagaria a cor em silêncio —
  a mesma mordida que a 0067 documentou nas unidades inativas.
- **Excluir cor em uso é bloqueado na tela**, porque a FK é `on delete set null`: apagar uma cor
  usada limparia a cor da ficha de todo mundo sem aviso. Quem sai de circulação é **inativada** —
  e cor inativa sai do de-para, mas o vínculo antigo continua de pé.
- **O de-para do MUTUAL já está pronto** (`mutual_cor_do_externo`, `mutual_cores_nao_mapeadas`):
  resolve pelo payload de `/vehicle/color/` **já capturado**, com `mutual_texto_em` (0073) — não se
  chuta o nome da chave, que neste módulo já custou duas rodadas. E vale a regra da 0064:
  **enquanto ninguém puxou a entidade, a tela manda PUXAR em vez de acusar o dado** — lista vazia
  sem captura não prova nada.
- **⚠️ A migration REESCREVE DADO EXISTENTE.** O backfill canoniza o que já está em `veiculos.cor` e
  `leads.cor`. Ele é explícito (não "update cor = cor" deixando o trigger agir: `update of` dispara
  pela **menção** da coluna, então o trigger cairia no ramo do id e o backfill não aconteceria).
  Os triggers de `veiculos` que importam são todos `update of status`, então o UPDATE em massa
  **não acorda** cobrança, ativação nem saída.
- **Lógica pura testada:** `src/lib/cores.ts` — `corNormalizada`, `corDoTexto`,
  `corComoSeraGravada` (o que o banco gravaria, para a tela não prometer diferente), `opcoesDeCor`.
  Suíte de banco em `supabase/tests/0080_cores_veiculo.test.sql`.
- **A suíte da 0034 foi ajustada junto, e isso é sinal, não dano:** ela afirmava
  `rec.cor = 'Prata'` e passou a exigir `'PRATA'` + `cor_id` resolvido. **Se voltar a 'Prata', o
  trigger parou de rodar.**

## USUÁRIOS E GRUPOS DE ACESSO — o mapa (leia antes de mexer em papel)
> Tópico próprio porque "quem pode o quê" está espalhado por 8 papéis, 4 portais, ~15 helpers e
> as policies de toda tabela. **Este é o índice.** A ficha do usuário e o corte do `ativo` estão
> na seção "Usuário da equipe — ficha e ACESSO (0068)"; aqui é o mapa dos GRUPOS.

### Os papéis VIVOS (`papel_usuario`) e o que cada um REALMENTE destrava
`admin` · `gestor_regional` · `consultor_vendas` · `financeiro` · `sinistro` (de `0001`;
**`cotador` saiu na `0077`**) + `auditoria` (`0017`) + `assistencia_24h` (`0026`) + `supervisor` e `cobranca` (`0097`). **São 9.**
O enum do Postgres ainda tem `cotador` — valor de enum não se apaga —, mas um CHECK em
`usuarios.papel` recusa gravá-lo e ele saiu de `PAPEIS_USUARIO` e da union de `PapelUsuario`.

| Papel | O que os helpers concedem hoje |
|---|---|
| `admin` | tudo: `is_admin`, `tem_acesso_global`, audita, libera 24h, aprova desconto, publica memo |
| `financeiro` | `tem_acesso_global` (consolidado da empresa), libera 24h, vê carteira da unidade, publica memo |
| `gestor_regional` | a própria unidade (`pode_regional`), libera 24h, aprova desconto, cadastra fornecedor, publica memo |
| `auditoria` | `pode_auditar` (autoriza a entrada na base) + vê a carteira da unidade |
| `assistencia_24h` | `pode_assistencia` (opera a 24h, cadastra prestador, lança/baixa contas a pagar) |
| `consultor_vendas` | **só a própria carteira** de leads (0038) — não vê a da unidade |
| `sinistro` | **`pode_tratar_evento`** (0077): move o evento e gasta nele, na própria unidade e, desde a **0127**, nas unidades de atuação marcadas (`supervisor_regionais`). **Não opera mais a 24h.** |
| *(qualquer papel sem acesso global)* | desde a **0131** soma as unidades de atuação marcadas pelo admin (`supervisor_regionais`) à unidade do cadastro — Configurações → Usuários → editar → *Unidades de atuação* (tem "Todas as unidades") |
| `supervisor` | (0097) a COBRANÇA das unidades de `supervisor_regionais`; desde a **0115** também o cadastro/operação dessas unidades (como staff de cada uma) |
| `cobranca` | (0097) a COBRANÇA do Brasil (sem unidade) ou da unidade dela; fora dela, staff da unidade do cadastro |

### A TELA: `Configurações → Usuários e Permissões` (13/10/2026)
O usuário não achava onde ajustar permissão — ela existia (o papel na edição), mas sem nome de
permissão nem explicação. Agora: **coluna Papel editável direto na lista** (confirmação diz o que a
pessoa GANHA e PERDE, `diferencaEntrePapeis`), aba **Permissões por papel** (grade papel × o que
libera, com quantos usuários ativos em cada papel) e o resumo do papel embaixo do seletor no
cadastro. A grade é **descrição** dos helpers do banco, não controle: `src/lib/permissoes.ts`
(testado) cita a origem de cada linha — **mexeu num helper `pode_*`, atualize a grade**.
Permissão individual por usuário: ver a 0116 (extras). Perfil novo: ver a 0130.

### A raiz: 3 funções sustentam tudo
`is_staff()` · `auth_papel()` · `auth_regional_id()` — e as três exigem **`and ativo`** desde a
`0068`. Todo o resto deriva delas (`is_admin`, `tem_acesso_global`, `pode_regional`,
`pode_auditar`, `pode_ver_carteira_regional`, `pode_liberar_assistencia`, `pode_assistencia`,
`pode_aprovar_desconto`, `pode_cadastrar_fornecedor`, `pode_publicar_memo`, `pode_tratar_lead`).
**Não crie checagem paralela de `ativo` em RPC nova** — ela já vem de graça.

### O eixo da UNIDADE é `escopo_regional()`, não o parâmetro da tela
Toda RPC de painel é `security definer` e resolve a unidade por `escopo_regional(p_regional_id)`:
quem **não** tem acesso global recebe a própria unidade, independentemente do id que passar.
`regional_id is null` significa **MATRIZ** — nunca "sem unidade" (0067/0069).

### PERMISSÕES POR PERFIL (0110/0111) — grade MÓDULO × AÇÃO, editada pelo admin
Pedido do usuário (15/10/2026): *"igual a da Smart Vida — Módulo, Ver, Criar, Editar, Excluir,
Exportar, Baixar, Estornar, Cancelar, Transferir, Fechar"*. A 0110 (9 chaves soltas) foi o primeiro
passo; a **0111** trouxe a grade.
- **`perfil_permissoes (papel, modulo, acao, concedida)`** — só as 76 células que existem
  (`permissao_celula_valida`, CHECK no banco); o que não se aplica ao módulo nem tem linha. **Admin sem
  linha** (`perfil_pode` sempre true). Escrita só por `salvar_permissoes_perfil(papel, jsonb)` (admin,
  em lote, trilha em `papel_permissoes_log` como `modulo.acao`). As 3 **alçadas** que não são módulo ×
  ação (desconto, liberar_24h, leads) seguem em `papel_permissoes` (0110) e vão no mesmo salvar
  (`modulo: 'alcada'`).
- **O que cada célula faz de verdade:** VER esconde o módulo do menu e barra a tela pela URL
  (`<GuardaModulo>` no layout, lista vinda de `minhas_permissoes()` no servidor). EXCLUIR vale **no
  banco** — policy RESTRICTIVE `perfil_excluir` em clientes, veiculos, leads, eventos_sinistro,
  fornecedores, lancamentos_financeiros e memos (restrictive só estreita; não-staff não é afetado).
  Células ligadas a helpers valem no banco: `vendas.fechar`→`pode_auditar`, `assistencia.criar|editar`
  →`pode_assistencia`, `eventos.editar`→`pode_tratar_evento`, `fornecedores.criar|editar`→
  `pode_cadastrar_fornecedor`, `comunicados.criar`→`pode_publicar_memo`, `precificacao.editar`→
  `pode_editar_precos`. **As demais (criar/editar/baixar/cancelar/exportar...) valem pela TELA**
  (`<SePode chave>` e `usePode('modulo.acao')`; ligado em associados, veículos, fornecedores, eventos,
  vendas e financeiro) — o banco continua pelo `pode_regional` da unidade (achado nº 1).
- **Módulos fixos (cadeado):** Regionais, Integração Mutual, Usuários e Configurações — protegidos por
  papel no banco e nas rotas; a grade só mostra.
- **Seed (decisões registradas):** reproduz o de hoje, menos duas coisas: excluir associado/veículo só
  financeiro+gestor (antes qualquer staff da unidade) e `/financeiro` visível só a financeiro, gestor,
  24h, supervisor e cobrança. `financeiro.estornar` vale no banco desde a 0132 (`estornar_baixa`), assim como `financeiro.excluir` (`excluir_lancamento`).
- **Célula nova = três lugares:** `permissao_celula_valida` + `minhas_permissoes` (SQL) e `MODULOS`/
  `PADRAO` em `src/lib/permissoes.ts` (o teste conta 155 desde a 0141).
- **Tela:** Configurações → Usuários → *Permissões por perfil*: chips por perfil, cartão com a grade
  ✓/—/·, botão **Editar** → marcar/desmarcar → **Salvar** (confirmação lista o que muda e quantos
  usuários afeta).

### CONFIGURAÇÕES POR ABA E DRE (0141)
Pedido do usuário (22/10/2026): liberar como extra a algumas pessoas tópicos das Configurações (plano de contas, marcas e modelos…) e, no Financeiro, separar o DRE do contas a pagar/receber e do extrato. Decisões: **uma linha por aba**; **alcance = só as unidades da pessoa**; **DRE mantido para todos que já tinham o Financeiro** (o admin retira depois).
- **16 abas liberáveis** (`ABAS_CONFIGURACOES_BASE`, `src/lib/permissoes.ts`): Empresa, Regionais, Vendedores, Marcas & Modelos, Tipos de Veículo, Cores, Cotas, Tipos de Evento, Prazos e Documentos do Evento, Alertas, Produtos, Planos, Contas Bancárias, Integrações Bancárias, Plano de Contas, Centros de Custo — cada uma com **Ver / Criar / Editar / Excluir** (criar = incluir, editar = alterar o que existe, excluir = apagar; pedido do usuário em 23/10: "é o financeiro que cria os campos" do plano de contas — a 1ª versão juntava as três em Editar). **Usuários e permissões segue só do admin**; Comunicados e Termos têm módulo próprio. Nascem sem ninguém; libera-se no perfil (grade) ou como extra (0116).
- **Na grade, Criar/Editar/Excluir trazem o Ver e tirar o Ver leva os três** (`coerenciaVerEditar`): a tela e a leitura da lista dependem do Ver (o update também — sem SELECT a linha nem é alcançada).
- **Telas:** o layout de Configurações mostra ao não-admin só as abas liberadas (`abasConfiguracoesPermitidas`), o menu mostra o atalho quando há alguma, `/configuracoes` leva à primeira, e a faixa no topo da aba diz o que a pessoa pode e o que será recusado (`<AbasPermitidas>`, `acoesNaAba`). Os botões Nova/Editar/Excluir já obedecem em **Plano de Contas** e **Centros de Custo** (`useAcoesNaAba('cfg_x')`); ⚠️ nas outras 14 abas os botões continuam na tela e quem recusa é o banco — esconder página a página fica para depois.
- **No banco** a escrita de cada cadastro é `pode_configurar('cfg_<aba>')` = `tem_acesso_global()` ou a célula (as que eram só admin — Planos, Documentos do evento, Regionais — seguem admin + a célula: o financeiro não ganhou). Integrações bancárias: até o VER exige a aba. Join tables (produtos×tipo, plano×produtos, apelidos de cor) aceitam criar OU editar. Regionais: `cfg_regionais.ver` vê a lista inteira; excluir unidade com `cfg_regionais.excluir` (o trigger da 0067 continua recusando unidade com movimento). Storage da Empresa (logo/documentos): o SQL Editor não é dono de `storage.objects`, então segue só da matriz. Vendedores: a aba vale só nas unidades da pessoa (`pode_regional`).
- **DRE:** aba DRE do Financeiro só com `financeiro_dre.ver` (CSV/Imprimir com `financeiro_dre.exportar`); no banco `pode_ver_dre()` esvazia `gerar_dre_completo`, `gerar_dre_resumo_completo`, `gerar_dre_mensal` e `resumo_por_centro_custo` (este passou também a respeitar a unidade — antes lia a empresa inteira).
- **O que segue da matriz (não entra pela aba):** importar vendedores por planilha (`importar_vendedores`), a bancada do Sicredi (rota admin/financeiro), quem opera conta bancária (`salvar_operadores_conta`), Fluxo Diário, Relatórios e a conferência caixa × DRE. Extrato e conciliação para quem não é da matriz continuam pelo OPERADOR DE CONTA (0126).
- **Célula nova = três lugares** (como sempre): `permissao_celula_valida` + `minhas_permissoes` (SQL) e `MODULOS`/`PADRAO` (TS; o teste conta 155).

### PERMISSÃO EXTRA POR USUÁRIO E CÓPIA DE PERFIL (0116)
Pedido do usuário (18/10/2026): conceder a UMA pessoa algo além do papel, e copiar o perfil de um
usuário para outro sem criar perfil novo.
- **`usuario_permissoes (usuario_id, modulo, acao, motivo, expira_em, concedido_por)`** — célula da
  grade (0111) ou alçada (`modulo = 'alcada'`); modulo fixo NÃO entra (`permissao_extra_valida`).
  **Só SOMA** — tirar algo de alguém é trocar o papel (lista de negações faria a grade mentir).
  Motivo obrigatório; validade opcional e INCLUSIVE (`data_sp`); vencido para de valer sozinho.
- **`perfil_pode`/`papel_pode` somam `permissao_extra_vigente`** — então helpers, policies
  RESTRICTIVE de excluir e `minhas_permissoes` (menu/botões) obedecem o extra sem mudar. Inativo
  não tem nada (auth_papel); admin não recebe extra (já tem tudo).
- **`salvar_permissoes_usuario(usuario, extras jsonb, motivo)`** troca a lista inteira (o que não vem
  sai); **`copiar_perfil_usuario(origem, destino, copiar_unidade, motivo)`** dá ao destino papel,
  extras vigentes, `supervisor_regionais` e (opcional) a unidade da origem — os extras do destino são
  SUBSTITUÍDOS. As duas só admin, trilha em `usuario_permissoes_log` (origem EXTRA/COPIA). As travas
  da 0054 seguem: copiar não rebaixa o último admin.
- **Tela:** Configurações → Usuários, na linha: **Extras** (grade com ✓ do papel e "+" do extra) e
  **Copiar perfil** (escolhe a origem; prévia do que GANHA e PERDE). Selo "+N extras" no papel.
  Regras puras em `src/lib/permissoes.ts` (`chavePermiteExtra`, `extraVigente`, `hojeSaoPaulo`,
  `permissoesEfetivas`, `resumoDaCopia`, testadas); componentes em
  `src/components/usuarios/permissoes-usuario.tsx`; suíte `supabase/tests/0116_*`.

### PERFIS PERSONALIZADOS (0130) — o admin cria perfil do zero
Pedido do usuário (20/10/2026): "preciso criar perfis de usuários do zero".
- **Perfil personalizado = NOME + PAPEL DE BASE + GRADE PRÓPRIA.** O papel de base (um dos 8, nunca admin) é o
  ALCANCE — fica gravado em `usuarios.papel`, então `tem_acesso_global`, `pode_regional`, `regionais_do_usuario`,
  `cobranca_escopo` e as ~190 policies não mudam. A grade módulo × ação + as 3 alçadas são do perfil (chave = id
  do perfil em texto, ao lado das chaves dos papéis) e nascem COPIADAS da base ou de outro perfil.
- **O alcance não muda com usuários no perfil** (o deles mudaria junto): cria-se outro perfil. Excluir só sem usuários.
- **Tela:** Configurações → Usuários → *Permissões por perfil* → **+ Novo perfil** (nome, descrição, alcance,
  "começar com a grade de"); o chip ciano é o perfil personalizado, com *Renomear*, *Excluir* e *Editar permissões*.
  No cadastro/edição e na coluna da lista o seletor tem "Perfis do sistema" + "Perfis personalizados"
  (`perfil:<id>`, `valorDoSeletor`/`lerSeletor`). Extras (0116) e Copiar perfil continuam valendo (copiar leva o perfil).
- **TS:** `temPermissao(chave, k, concessoes, bases)` — `bases` = `basesDosPerfis(perfis)`; módulo fixo e padrão
  seguem a base. `chaveDoUsuario(u)` = perfil ou papel. Hook `usePerfisAcesso`.

### (histórico) PERMISSÕES EDITÁVEIS (0110) — o admin concede e retira por papel
Pedido do usuário (15/10/2026): *"libere para que o administrador possa ajustar os perfis"*.
- **`papel_permissoes (papel, permissao, concedida)`** — 8 papéis × 9 chaves. **O admin não tem linha:**
  `papel_pode(chave)` devolve sempre true para ele (ninguém tranca a empresa por clique) e false para
  usuário inativo (vem de `auth_papel`, 0068). Escrita só por `salvar_permissao_papel` (exige
  `is_admin()`), com trilha em `papel_permissoes_log` (de → para, quem, quando).
- **As 9 chaves e os helpers que as leem:** `auditoria`→`pode_auditar` · `assistencia`→`pode_assistencia`
  · `liberar_24h`→`pode_liberar_assistencia` · `desconto`→`pode_aprovar_desconto` · `leads`→
  `pode_ver_carteira_regional` (retirar = vê só os próprios) · `fornecedor`→`pode_cadastrar_fornecedor`
  · `comunicados`→`pode_publicar_memo` · `evento`→`pode_tratar_evento` (continua limitado à unidade) ·
  `precos`→`pode_editar_precos()` (nova; as policies de escrita de `tabela_precos_faixa`,
  `participacao_faixa` e `adesao_faixa` deixaram de ser `tem_acesso_global()`).
- **Fixo, de propósito (cadeado na grade):** alcance da unidade (`pode_regional`, `tem_acesso_global`,
  `escopo_regional` — ~190 policies), Configurações (`is_admin`), Mutual, cobrança, financeiro, franquia.
- **Chave nova = três lugares:** o CHECK `chk_papel_permissoes_chave` + `minhas_permissoes()` (banco) e
  `editavel: true` em `src/lib/permissoes.ts` (o teste confere a lista).
- **Tela:** a grade é editável para o admin (clique concede/retira, com confirmação dizendo quantos
  usuários afeta); `ResumoDoPapel` e a troca de papel já usam as concessões gravadas (`nivelEfetivo`).
  A tela pergunta ao banco com `usePode(chave)` (`minhas_permissoes()`) — `podeTratarEvento` (lista fixa
  em TS) saiu; `/vendas/[id]` usa `usePode('auditoria')`.

### Os 4 portais entram por chaves DIFERENTES
`/dashboard` e `/regional` pelo **papel**; `/vendedor` por `vendedor_atual()` (cadastro em
`vendedores`, **não** por papel); `/portal` por `auth_cliente_id()` (é associado, não equipe).
Consequência que já mordeu: **`authenticated` não é a equipe** — o associado do `/portal` é
`authenticated` como qualquer atendente (ver "Segurança das RPCs (0052)").

**Uma pessoa pode ter DOIS chapéus, e o login precisa saber qual vence.** Como as chaves são
diferentes, um `admin` pode ter ficha em `vendedores` (o dono que vende, o sócio que testa o
hotlink) — e aí ele satisfaz duas portas ao mesmo tempo. A escolha está em
**`destinoAposLogin()` (`src/lib/acesso.ts`, testada)**: vai da MAIOR responsabilidade para a
menor, então **acesso global vence o cadastro de vendedor**. Foi bug real — o admin caía no
`/vendedor` e ficava preso, porque aquele portal não tinha porta de volta. Hoje o `ShellVendedor`
mostra **"Sistema da matriz"** (admin/financeiro) ou **"Portal da franquia"** (gestor regional).

**✅ DECISÃO DO USUÁRIO (10/09/2026): o acúmulo dos dois chapéus é PERMITIDO — não construir
trava.** Foi avaliado bloquear `admin`/`financeiro` vinculado a cadastro de vendedor, e a decisão
foi manter como está. Dois motivos: (1) numa associação de proteção veicular o dono e o sócio
VENDEM, então o arranjo é legítimo, não um erro de cadastro; (2) como `usuarios.email` e
`vendedores.usuario_id` são únicos, a trava obrigaria a MESMA pessoa a ter **dois logins com
e-mails diferentes** — pior de administrar e, de quebra, esconderia da tela de Usuários que é a
mesma pessoa. **Separe os dois problemas:** o desvio de rota era o bug (corrigido em
`destinoAposLogin`); o acúmulo de papéis não é defeito. Com um login só a pessoa alterna pelos
atalhos que já existem — **"Meu Portal de Vendas"** na sidebar da matriz (ida) e **"Sistema da
matriz"** no `ShellVendedor` (volta). A tela de Usuários já marca quem tem cadastro de vendedor
(`usuarios_listar` devolve `vendedor_codigo`), que é a visibilidade de que a gestão precisa.

**Vendedor NÃO é usuário — são três entidades, e só uma dá acesso:** `usuarios` (perfil no
sistema; `is_staff()` = ter linha aqui) · `vendedores` (cadastro comercial — comissão, hotlink,
banco; vive sem login desde a 0035) · `clientes` (associado, só o `/portal`). As três portas de
entrada de `usuarios` estão fechadas e é assim que deve continuar: a importação da 0069 **nunca
cria acesso**, `/api/v1/vendedores/acesso` exige admin/financeiro/gestor e nasce
`consultor_vendas`, e o trigger `fn_handle_new_user` (0002) só provisiona perfil quando o metadata
traz `papel` — é isso que impede o associado do `/portal` de virar equipe. **Consulta em
`vendedores` traz gente que não tem perfil nenhum; a lista de perfis é `usuarios_listar`.**

**ACESSO MISTO (23/10/2026, caso MARIA CAROLINE):** ela é da cobrança e também vende, e entrava no portal do
vendedor **como BIANCA** — o cadastro de vendedor BIANCA2 tinha sido ligado ao login dela em 20/10 pelo seletor
"Ou vincular a um usuário já existente" de Configurações → Vendedores (e o *Redefinir senha* desse vendedor trocaria a
senha DELA). Agora: (1) o login vai para `/vendedor` só para `consultor_vendas` (e gestor sem unidade); qualquer outro
papel de operação com ficha de vendedor entra no sistema, com **Meu Portal de Vendas** no menu (o layout passa
`ehVendedor` por `vendedor_atual()`), e o portal do vendedor ganhou o botão **Sistema** de volta; (2) o cadastro do
vendedor mostra **Login ligado: NOME (e-mail)**, em vermelho quando o primeiro nome não confere
(`vinculoDeOutraPessoa`, `src/lib/acesso.ts`, testada), com **Desvincular login**, e pede confirmação para ligar ou
trocar a senha de login de outra pessoa.

**Ao diagnosticar "fulano não tem o acesso que deveria", olhe nesta ordem:**
`usuarios.ativo` (desde a `0068` derruba TUDO, inclusive o portal do vendedor) → `usuarios.papel`
(o acesso criado por `/api/v1/vendedores/acesso` nasce **`consultor_vendas`**; promover exige
trocar o papel em `Configurações → Usuários`) → só então a rota. **O destino do login nunca foi
controle de acesso.**

### 🔴 A VARREDURA DOS 8 PAPÉIS (feita em 12/09/2026) — o resultado
> Método aplicado: para cada papel, (a) os **helpers** que o citam, (b) as **policies** que o
> citam, (c) as **telas do menu** que ele abre. Tudo conferido em `supabase/schema.sql` e em
> `src/components/layout/sidebar.tsx`. Números abaixo são contagem real, não estimativa.

**Como as policies decidem acesso** — contado sobre os **166 `create policy`** do histórico de
migrations (43 deles depois substituídos por `drop`+`create`, então a leitura é da PROPORÇÃO, não
do total). Um mesmo `create policy` conta mais de uma vez quando cita o helper no `using` e no
`with check`:
`tem_acesso_global` **104** · `pode_regional` **87** · `is_staff()` **51** · `pode_assistencia` **19**
· `pode_auditar` **10** · `is_admin()` **9** · `auth_papel` direto **3** · `pode_ver_carteira_regional` **2**.
Conferido no `schema.sql` já com as migrations `0074`–`0076`: **nenhuma delas mexeu neste quadro.**

#### 🔴 ACHADO nº 1 — `pode_regional()` NÃO LÊ PAPEL. É o achado que explica todos os outros.
```sql
select tem_acesso_global()
    or (is_staff() and p_regional is not null and auth_regional_id() = p_regional);
```
São **87 policies** — o segundo maior bloco do sistema — e nenhuma delas distingue papel algum.
Consequência medida: `gestor_regional`, `consultor_vendas`, `sinistro`, `cotador` e `auditoria`
lotados na mesma unidade têm **exatamente o mesmo poder de leitura E ESCRITA** sobre `clientes`,
`veiculos`, `eventos_sinistro`, `lancamentos_financeiros`, `baixas_financeiras` e
`titulos_financeiros` daquela unidade. Um cotador lança e baixa título no financeiro da unidade.
**Não é bug de implementação — é o desenho declarado**: o comentário da `0003` (schema.sql:763)
diz *"Papeis com acesso REGIONAL: gestor_regional, consultor_vendas, sinistro, cotador"*, e é
isso que está no ar. A pergunta para o usuário é se o desenho ainda vale com 8 papéis.

#### A matriz dos 8
| Papel | (a) helpers que o citam | (b) policies que o citam | (c) telas que só ele abre |
|---|---|---|---|
| `admin` | `is_admin` · `tem_acesso_global` · `pode_auditar` · `pode_assistencia` · `pode_liberar_assistencia` · `pode_aprovar_desconto` · `pode_cadastrar_fornecedor` · `pode_ver_carteira_regional` · `pode_publicar_memo` | 9 diretas (`is_admin`) + os 104 do global | **Configurações** |
| `financeiro` | `tem_acesso_global` · `pode_assistencia` · `pode_liberar_assistencia` · `pode_ver_carteira_regional` · `pode_cadastrar_fornecedor` · `pode_publicar_memo` | os 104 do global | — (divide Mutual e Portal da Franquia) |
| `gestor_regional` | `pode_assistencia` · `pode_liberar_assistencia` · `pode_aprovar_desconto` · `pode_cadastrar_fornecedor` · `pode_ver_carteira_regional` · `pode_publicar_memo` | **2 DIRETAS** (`vendedores_write`) + os 87 regionais | Portal da Franquia |
| `auditoria` | `pode_auditar` · `pode_ver_carteira_regional` | 10 + 2 | — |
| `assistencia_24h` | `pode_assistencia` | 19 | — |
| `sinistro` | **só `pode_assistencia`** | 19 (as MESMAS da 24h) | — |
| `consultor_vendas` | **NENHUM** | só por EXCLUSÃO: fica de fora de `pode_ver_carteira_regional`, o que o limita em `leads_select`/`leads_update` | Meu Portal de Vendas |
| `cotador` | **NENHUM** | **NENHUMA** | — |

> ⬆️ **A tabela acima é o RETRATO DE ANTES.** As duas últimas linhas foram resolvidas pela `0077`
> (logo abaixo); `consultor_vendas` continua como está, e é o único papel com restrição de LINHA.

#### 🔴 ACHADO nº 2 — `cotador` é RÓTULO, não grupo de acesso. Confirmado.
Duas ocorrências em todo o `schema.sql`, e **nenhuma delas é código**: a declaração no enum
(`0001`) e um comentário na `0003`. Zero helpers, zero policies. Quem for cadastrado como cotador recebe **staff genérico da unidade** — ou seja, o mesmo
que o gestor regional nos 87 regionais, menos os seis helpers nomeados. A tela oferece o papel
como se ele significasse algo. **É o gotcha do `usuarios.ativo` (0068) outra vez: opção que a tela
oferece e o banco ignora.**

#### 🔴 ACHADO nº 3 — `sinistro` não governa sinistro. Confirmado.
As policies de `eventos_sinistro` (schema.sql:908-922) são `pode_regional(regional_id)` para
select/insert/update e `is_admin()` para delete — **nenhuma menciona o papel**. O papel `sinistro`
existe em UM lugar só: dentro de `pode_assistencia()`, ao lado de `assistencia_24h`. Traduzindo: o
papel que dá nome ao módulo de eventos **só destrava a Assistência 24h**, e qualquer staff da
unidade já opera evento. Hoje `sinistro` e `assistencia_24h` são o MESMO grupo de acesso.

#### ACHADO nº 4 — o menu promete o que o banco recusa (3 telas)
`OPERACAO` e `GESTAO` no `sidebar.tsx` **não são filtradas por papel**: só `Configurações` (admin),
`Integração Mutual` (admin/financeiro) e os dois portais têm porteiro. Todo o resto aparece para
todo staff — cotador e consultor de vendas inclusive. Onde isso vira promessa falsa:
- **`/precificacao`** — `precos_select` é `is_staff()` (abre e lê), `precos_write` é
  `tem_acesso_global()` (**salvar falha**). O editor de tabela de preços abre para todo mundo e
  recusa a gravação de quem não é admin/financeiro.
- **`/rastreadores`** — `rast_select` é `is_staff()`; a baixa de patrimônio exige
  `tem_acesso_global()`.
- **`/financeiro` e `/cobrancas`** — o inverso, e é o mais sério: **não há promessa falsa, há
  acesso real**. `lanc_all` é `pode_regional`, então cotador/consultor/sinistro com unidade
  definida lançam e baixam de verdade.

#### ✅ O QUE O USUÁRIO DECIDIU (12/09/2026) — construído na `0077`
**(1) `cotador` APOSENTADO.** **(2) `sinistro` passa a GOVERNAR O EVENTO** — ver a seção própria
logo abaixo.
**(3) Continua em aberto:** o financeiro da unidade segue aberto a qualquer staff com regional
(achado nº 1). Mexer nisso é mexer em `pode_regional()`, ou seja em 87 policies de uma vez — é
decisão de desenho, não limpeza, e não foi tocado.

## Papéis: `cotador` aposentado e `sinistro` no EVENTO (0077)
> Decisão do usuário depois da varredura. **Muda acesso em produção** — leia antes de rodar.

### O recorte que sustenta tudo: ABRIR evento é atendimento, TRATAR evento é do time
Foi o risco real desta migration e é o que decidiu cada linha dela. **Não existe papel `sac`:**
quem registra o evento quando o associado liga é o atendente, por qualquer papel, pelo VCard
*Evento* (`/sinistros/novo?placa=`). Restringir o **INSERT** quebraria o caminho mais comum do
módulo, e restringir o **SELECT** quebraria a lista do SAC, que marca quais veículos já tiveram
evento. Então o corte ficou onde significa alguma coisa:

| Ação | Quem |
|---|---|
| **Ver** e **abrir** evento · anexar · escrever no histórico | staff da unidade (inalterado) |
| **Mudar a fase** do evento · cotação de peças · itens · **nota fiscal** · apagar anexo | `pode_tratar_evento()` |

`pode_tratar_evento(regional)` = `tem_acesso_global()` **ou** (`sinistro`/`gestor_regional` **e**
`pode_regional`). `financeiro` entra pelo global — a NF do evento é dinheiro e já vai ao DRE.
**`auditoria` não entra** (ela autoriza a entrada na base, outro assunto) e **`assistencia_24h`
também não** — guincho não é sinistro.

### 🔴 POLICY SOZINHA AQUI SERIA MEIA PORTA — e meia porta é pior que nenhuma
`transferir_protocolo` (0059) é **SECURITY DEFINER**: roda como dona da tabela e **não passa por
policy nenhuma**. E é ela que o card *Tramitar* chama. Fechar só o `update` direto
(`use-eventos.ts:198`) deixaria o caminho principal escancarado — uma regra que a própria tela
contorna sem ninguém notar. A trava foi para **dentro** dela (regra da 0052), e ali o corte é mais
fino porque o parecer não pode morrer junto:
- **mudar o status** → `pode_tratar_evento()`;
- **transferir** e **registrar parecer** → staff da unidade. Jurídico, vistoria e diretoria opinam
  no sinistro sem serem o time dele, e o evento precisa **voltar** da mão de quem opinou.

**Bônus que caiu junto:** a função só exigia `is_staff()`, então um atendente de Natal tramitava
evento de Cuiabá pela RPC — a policy da tabela impedia, a RPC não. O piso virou `pode_regional`.

### A tela não oferece o que o banco recusa
`<TramitacaoEvento>` esconde o seletor *Novo status* para quem não trata, e explica em uma linha o
que a pessoa ainda pode fazer. Espelho puro em `podeTratarEvento()` (`src/lib/usuario.ts`, testado)
— **não é controle de acesso**, é para não repetir o defeito que a varredura nomeou em
`/precificacao` (abre, deixa editar e recusa o salvar).

### `sinistro` saiu da Assistência 24h — e é a outra metade da decisão
Ele destravava a 24h inteira (abrir acionamento, cadastrar prestador, **lançar e baixar contas a
pagar** pela policy `lanc_assistencia`) sem nunca ter governado um evento.
**⚠️ CONFIRA ANTES DO DEPLOY:** quem hoje opera guincho com papel `sinistro` perde o acionamento —
o papel dessa pessoa é `assistencia_24h` ou `gestor_regional`. Quem tem unidade continua lançando
no financeiro pela `lanc_all` (`pode_regional`); quem está na **matriz sem unidade**, não — e era
exatamente esse o alcance largo demais.

### `cotador`: aposentar é TRÊS passos, não um
Enum no Postgres não perde valor (`alter type ... drop value` não existe). Então:
1. **mover quem está lá** → `consultor_vendas`;
2. **o banco RECUSA** o valor (CHECK `chk_papel_vigente`) — tirar só da tela repetiria o defeito,
   porque `/api/usuarios` escreve com **service_role**, que ignora RLS;
3. **sair da tela** (`PAPEIS_USUARIO`) **e da union `PapelUsuario`** — aí o TS recusa junto, em
   tempo de compilação. *Isso não é teoria: ao escrever o teste, o `tsc` barrou uma comparação com
   `'cotador'` — a trava funcionou antes mesmo de rodar.*

**O destino não é palpite, é NEUTRO em acesso:** nenhum dos dois papéis é citado por helper algum,
e nas policies os dois se distinguem só por ficarem FORA de `pode_ver_carteira_regional()` —
juntos. Quem era cotador via os leads que criou; como `consultor_vendas` vê exatamente os mesmos.
E é o default da coluna desde a `0001`.

**O mural segue as pessoas:** `memos.papeis` com `cotador` viraria ZERO destinatário — a tela da
gestão marca isso em vermelho (0057), mas um aviso vigente deixaria de chegar a quem continua na
casa, só com outro rótulo. A troca preserva os demais papéis do endereço e **não duplica** quando
os dois já estavam lá (por isso o `distinct`; há teste).

### O que a `0077` NÃO fez
O achado nº 1 da varredura continua de pé: **`pode_regional()` não lê papel**, e são 87 policies.
Um `consultor_vendas` com unidade segue lançando e baixando no financeiro dela. Mexer ali é
decisão de desenho sobre 87 policies de uma vez, não limpeza de passagem.

## A UNIDADE É A EQUIPE DE VENDAS (0083) — o de-para no nível certo
> **Decisão do usuário (20/09/2026):** *"o Mutual separa como regionais e equipe de vendas… o que
> precisamos agrupar são as equipes de vendas, que a partir de agora serão as regionais… por isso
> já fizemos o software só considerando regionais, que nada mais é do que o que no Mutual chama de
> equipe de vendas."*

### Os três níveis deles, o único nível nosso
```
Mutual:  regional (macro)  →  sale_team (equipe de vendas)  →  consultant (vendedor)
SCar:                          regionais                    →  vendedores
```
**Achatar foi ESCOLHA, não esquecimento** — "seria muita escrita para fazer a rota como estava".
A macrorregião (SUDESTE, NORDESTE) vira **cabeçalho de leitura** na tela, nunca tabela.

### 🔴 A 0082 mapeava a camada de CIMA — e ela é larga demais
`mutual_regional_do_externo` resolve a **filial**, que é a macrorregião. Um único "SUDESTE" junta
**Ribeirão Preto e a capital**, que são *duas* unidades aqui — então o de-para por filial não
consegue decidir de quem é a carteira. Medido em 20/09/2026: **7 equipes** no Sudeste, **6** em
Cuiabá, **3** no Nordeste. Quadriplicado, como o usuário descreveu.

### A corrente: UM salto, por id
`objeto.contract_id` → `CONTRACT.sales_team_id` → equipe → de-para. No contrato:

| Campo | Preenchido |
|---|---|
| `regional_id` | 17.616 de 17.616 (100%) |
| **`sales_team_id`** | **17.213 de 17.616 (97,7%)** |
| `consultant_id` | 16.988 de 17.616 (96,4%) |
| `due_day` | 17.147 de 17.616 |

Na carteira viva: 3.384 dos 3.440 faturáveis têm contrato, e **3.384 desses têm equipe — 100%**.

### 🔴 A CORREÇÃO QUE ESTA MIGRATION CARREGA
A 0082 registrou como fato medido que `consultant` vinha vazio em *"0 de 17.675 objetos **e 0 de
17.616 contratos**"*. A metade do objeto está certa. **A do contrato estava errada:** a chave lá
chama-se **`consultant_id`** (96,4%). `mutual_consultor_do_objeto` (0073) já lê as duas, então o
funil sempre teria resolvido — quem errou foi a consulta avulsa.

**É a mesma lição que a 0082 escreveu no próprio cabeçalho, aplicada ao contrário:** procurei o
campo com o nome errado, na entidade certa. A regra fica mais dura: **ausência de chave só vira
conclusão depois de `mutual_campos` NA ENTIDADE** — consulta avulsa com o nome chutado não conta.

### 🔴 VÁRIAS EQUIPES VIRAM UMA REGIONAL — e é para isso que o `unique` é só externo
Agrupar é escolher a mesma unidade em várias equipes. A tabela de vínculo (0082) permite isso por
construção: o `unique` é `(sistema, entidade, id_externo)`, sem nada do lado de cá. **Foi essa
decisão que tornou o agrupamento uma escolha de tela e não uma migration.**

### A precedência de `mutual_regional_do_objeto`
1. **A EQUIPE vinculada** — manda sempre.
2. **A filial do associado** (0082) — só reserva, para os 56 objetos sem contrato. Sem ela eles
   ficariam sem unidade nenhuma; com ela entram na macrorregião, que é impreciso mas não é vazio.

**A reserva NUNCA vence a equipe.** Há teste com um objeto cuja filial aponta para uma unidade e a
equipe para outra — quem decide é a equipe.

### A tela (`/integracao/mutual` → "Equipes de vendas")
- As equipes vêm **agrupadas pela macrorregião**, ordenadas por carteira: é o que torna a
  duplicação legível ("estas sete são todas do Sudeste").
- O seletor grava `integracao_vinculos('SALE_TEAM', …)` na hora. Escolher a mesma unidade em duas
  equipes **é** a consolidação — a faixa no topo conta "N equipes consolidadas em M unidades".
- **Equipe que aparece só no CONTRATO entra na lista marcada como não capturada**, com o peso e
  sem o nome. Ela não pode sumir: é justamente uma das que falta agrupar. O `full join` em
  `mutual_equipes_vendas` existe para isso.
- `consultores` é coluna porque **equipe sem vendedor é equipe morta** — é o que separa a duplicata
  viva da que só tem histórico.

### ⚠️ A entidade nova precisa ser PUXADA
`/association/sale_team/` **nunca foi capturada** — o plano a descartou com "não existe no SCar",
e o CHECK de `mutual_captura` a recusava. Depois de aplicar a `0083`, puxe **Equipes de vendas**
na tela; até lá as equipes aparecem com carteira e sem nome.
**Repare no singular:** o endpoint é `sale_team`, mas o campo do contrato é `sales_team_id`.
**Mas o AGRUPAMENTO não depende dela:** `integracao_vinculos` guarda o **id** da equipe e não tem
FK para `mutual_captura`, então o de-para vale com a entidade ainda não puxada — capturar depois só
preenche o NOME na tela. Foi assim que as 19 foram registradas antes do deploy.

### ✅ O AGRUPAMENTO JÁ ESTÁ REGISTRADO (21/09/2026) — 19 equipes → 4 unidades
**A unidade deixou de ser bloqueio: `mutual_regional_do_objeto` resolve 3.463 de 3.463 faturáveis,
100%, sem nenhum "sem unidade".** As 19 linhas estão em `integracao_vinculos` (ids 1..19), gravadas
por `vincular_externo` — dado, não schema, então **não há migration para rodar**.

| Unidade | Equipes do Mutual | Veículos |
|---|---|---:|
| **RIBEIRÃO PRETO** | 4 · 21 · 10 | 1.669 |
| **SÃO PAULO 1** | 3 · 23 · 11 | 852 |
| **SMART CAR MATRIZ** | 2 · 15 · 6 · 16 · 47 · 1 · 25 · 19 · 38 · 33 | 493 |
| **GRANDE NATAL** | 5 · 17 · 24 | 449 |

**Como a divisão do Sudeste foi decidida — e ela NÃO foi palpite.** As quatro equipes que pesam
(4, 21, 3, 23) estavam todas sob rótulos genéricos ("Regional Sudeste" × "SUDESTE"), que não
separam interior de capital. A prova saiu da **cidade do ASSOCIADO**
(`objeto.person_data.person_id → PERSON → address_id → ADDRESS.city`):

- equipe **4** → Ribeirão Preto **689**, Serrana 23, Sertãozinho 11
- equipe **21** → Ribeirão Preto **590**, Barrinha 24, Sertãozinho 16
- equipe **3** → São Paulo **245**, Guarulhos 68, Santo André 32
- equipe **23** → São Paulo **179**, Guarulhos 43, Campinas 32

**`ADDRESS` é a entidade que responde "de quem é a carteira".** Ela estava capturada (44.935
linhas, `city` em 41.296) e nunca tinha sido usada para nada — é a mesma lição da 0082 escrita de
novo: **o dado que decide costuma estar na entidade VIZINHA**, não na que se está olhando.

**Onde a evidência era fraca, está dito:** as equipes 1, 10, 11, 19, 24, 25, 33 e 38 têm de 1 a 2
veículos cada. Foram para o destino que a cidade indicava e, na dúvida, para a matriz. Trocar
qualquer uma é **uma linha** — pela tela ou por `vincular_externo`, e a carteira inteira segue
junto na próxima leitura.

## A CARGA DO MUTUAL (0084) — o piloto da MATRIZ, e as decisões que moram nela
> **Primeira migration que escreve em `clientes` e `veiculos`.** A Fase 1 leu e diagnosticou
> (0062..0066, 0071); a 0082/0083 prepararam (o vínculo, o interruptor e a unidade pela equipe de
> vendas). Esta é a Fase 3. **Rodar a migration é seguro:** ela cria o instrumento, não carrega
> nada — quem carrega é o botão, por unidade e com confirmação.

### ✅ DECISÃO DO USUÁRIO (30/09/2026): o piloto é SMART CAR MATRIZ, e só ela
*"Vamos fazer uma migração de um conjunto de bases pequenas da Smart Car Brasil, que é justamente
a matriz… trabalharmos Outubro todo com essa base migrada e ver se tudo funciona ok para então em
Dezembro migrarmos toda a base."*

**O tamanho, medido em 30/09/2026 por `mutual_regional_do_objeto` (a equipe de vendas, 0083):**

| Unidade | Objetos que entram | **Faturáveis** | Associados |
|---|---:|---:|---:|
| RIBEIRÃO PRETO | 5.099 | 1.187 | 1.012 |
| SÃO PAULO 1 | 2.195 | 839 | 775 |
| **SMART CAR MATRIZ** | **5.245** | **481** | **436** |
| GRANDE NATAL | 2.592 | 443 | 385 |
| *(sem equipe agrupada)* | 2.526 | 92 | 84 |

### 🔴 "E SE SUBIRMOS TUDO, TEREMOS PROBLEMAS?" — a resposta medida
**Cobrança em dobro: NÃO, em nenhum dos dois casos.** `veiculo_faturavel` lê
`not v.cobranca_externa` (0082) e `gerar_primeira_cobranca_veiculo` retorna cedo quando ela é
falsa — então as 5 rotas de fatura da 0025 estão fechadas por construção. **Há teste.**
Mas há quatro riscos que **escalam com o volume**, e são eles que respondem à pergunta:

1. **DERIVA — o maior, e ele não tem conserto automático hoje.** O Mutual continua sendo o
   sistema que manda por meses. Toda venda, cancelamento, troca de placa e indenização feita lá
   depois da carga **só chega aqui quando alguém recapturar e rodar a carga de novo** — e essa
   rotina não está agendada. Com 481 veículos é um piloto que todo mundo sabe que é cópia; com
   3.042 vira "a base", e as pessoas passam a confiar num retrato que envelhece em silêncio.
2. **Os 92 faturáveis SEM EQUIPE AGRUPADA cairiam na MATRIZ.** Aqui `regional_id is null`
   significa matriz (0067/0069): carregar tudo jogaria a carteira de unidades desconhecidas dentro
   do escopo da matriz, atravessando RLS, `escopo_regional()` e todos os painéis. No piloto por
   unidade eles simplesmente não entram. **É por isto que `p_regional_id` é obrigatório.**
3. **CUSTO DE DESFAZER.** `mutual_desfazer_carga` preserva quem já tem movimento — e em outubro
   vai ter. Desfazer 481 é uma decisão; desfazer 3.042 veículos + 3.700 associados depois de dois
   meses de atendimento é uma reconciliação manual. E `clientes.matricula` é sequence: número
   queimado não volta.
4. **O piloto não ganha nada com volume.** O objetivo é VERIFICAR o sistema — SAC, portal, 24h,
   evento, cobrança. 481 veículos exercitam exatamente as mesmas telas que 3.042. Os 2.561 a mais
   não acrescentam cobertura de teste nenhuma e acrescentam os três riscos acima.

**Conclusão: matriz só, como planejado.** E o desenho não cobra nada por isso — a carga é por
unidade e re-executável, então acrescentar Ribeirão Preto em dezembro é **escolher outra unidade
no seletor**, não outra migration.

### O lote da matriz, medido antes de escrever uma linha (e ele está LIMPO)
| | |
|---|---:|
| Faturáveis | **481** |
| Placa repetida · chassi repetido | **0** · **0** *(depois do saneamento)* |
| CPF/CNPJ inválido ou ausente | **0** |
| Colisão com a base atual (placa/chassi/CPF) | **0** |
| Sem placa (0 km) | **8** *(2 deles sem chassi também)* |
| Sem valor de mensalidade | **3** |
| Sem dia de vencimento | **0** |
| Sem `first_activation_date` (cai no `created_at`) | **15** |
| Cor resolvida no catálogo · endereço capturado | 478/481 · 480/481 |

**O saneamento é o que torna esse lote limpo.** Sem ele há **4 grupos de renavam repetido** — e
eles não são dados: são `"0"`, `"000000000000"`, `"00000000000000"` e `"2012"` (o ano no campo
errado). **Placeholder não é dado: é ausência escrita com confiança**, e como `renavam` é `unique`
e nulável, as três primeiras colidiriam entre si e a carga pararia no meio.

### As decisões que moram na migration
1. **`cobranca_externa = true` SEMPRE, e não é parâmetro.** É o que desarma a mina nº 1 **no
   DADO**, não na sessão (a GUC `scar.importacao` é local à transação e não protegeria o lote
   rodado três meses depois). Ligar a cobrança aqui é o cutover, e ele tem função própria
   (`definir_cobranca_externa_regional`, 0082). **Por isso a RE-EXECUÇÃO NÃO MEXE nesse campo:**
   depois do cutover, rodar a carga de novo não pode desligar o faturamento em silêncio. Há teste.
2. **`data_ativacao` NUNCA é "hoje".** Escada `first_activation_date` → `contrato.created_at` →
   `objeto.created_at`; sem nenhuma das três, **recusa**. `trg_veiculo_marca_ativacao` (0025)
   carimba `current_date` no nulo, e isso contaminaria `veiculo_faturavel`, o tempo de casa e o
   painel da 24h. Quando vem do fallback a linha **anuncia** (`ativacao_estimada`) — mesma postura
   do backfill da 0078 com o `updated_at`.
3. **Sem placa é RECUSA, não invenção**, e a recusa **nomeia o chassi** para a operação cobrar a
   placa. Fabricar placa cria registro que ninguém acha e que colide no dia em que a real chegar.
4. **Valor zero vira NULL, nunca zero.** `valor_mensalidade_veiculo` (0024) só respeita o override
   quando `> 0`, então zero **vaza** para o `cotar_plano`. Null é a verdade ("não sei"); zero é
   mentira ("é de graça").
5. **O de-para de tipo de veículo e de plano sai do VÍNCULO REGISTRADO**, nunca de palpite (mesma
   postura da 0082 com as filiais e da 0081 com o preço). O Mutual tem **3** tipos (CARRO, MOTO,
   CAMINHÃO) e o SCar tem **7**: *"CARRO"* não decide entre Passeio e Pick-up/Van. Os dois são
   nuláveis e **não bloqueiam** — com a cobrança externa ligada o preço não é recalculado aqui.
6. **`p_incluir_inativos` nasce FALSE.** O acervo histórico da matriz são mais 4.764 veículos e
   3.165 associados que nunca apareceriam numa tela. Ele entra depois, pela mesma função.
7. **A re-execução atualiza o que o MUTUAL é dono e não toca no que o SCar preencheu.** Status,
   valor, dia, ativação e a ficha vêm de lá a cada rodada (é o que *"quem manda é o Mutual"*
   significa); `plano_protecao_id`, rastreador, `alienado`, `tipo_faturamento`, cota, km, vendedor
   e `cobranca_externa` são daqui. Há teste dos dois lados.
8. **`sexo` NÃO é importado.** O Mutual manda `gender` "1"/"2" e não diz qual é qual. Adivinhar o
   sexo de 436 pessoas para preencher campo que nenhuma tela usa é o registro que mente com
   confiança.

### 🔴 O DEFEITO DE DESENHO QUE O TESTE PEGOU: o que já foi carregado NUNCA sai do lote
A primeira versão filtrava o lote só pelo status (`p_incluir_inativos`), e aí um veículo que
virasse **SUSPENSO ou INATIVO no Mutual depois da carga** saía do filtro — e a ficha daqui ficaria
`ativo` **para sempre**. Numa convivência em que quem manda é o outro sistema, isso é a base
mentindo em silêncio, que é o pior desfecho possível. **`p_incluir_inativos` governa o que ENTRA,
não o que continua sendo MANTIDO:** objeto com vínculo fica no lote em qualquer status, e é por
ele que **o cancelamento feito no Mutual chega aqui** na rodada seguinte. Há teste do ciclo
inteiro (ativo → suspenso → inativo com `data_saida` → ativo).

### As outras duas mordidas, para não repetir
- **`cliente_id` da leitura é um RETRATO de antes do laço.** No segundo veículo do mesmo associado
  ele ainda vinha nulo e o insert estourava no `unique` de `cpf_cnpj`. O vínculo é **re-resolvido
  a cada volta**, e o laço é ordenado por documento para o cliente ser tratado uma vez por pessoa.
- **Associado se conta por PESSOA, não por linha.** A simulação previa 2 associados para 2
  veículos do mesmo dono. Vale para o SQL e para o `resumoDaCarga` do TS — os dois com teste.
- **Nada de `create temp table` dentro de plpgsql.** `on commit drop` destrói o OID que o plano em
  cache guardou, e a **segunda** chamada na mesma sessão morre com *"relation with OID … does not
  exist"*. O desfazer usa CTEs. (Foi a mordida da primeira versão da 0078.)

### O caminho de volta existe, e ele PARA no que já tem trabalho em cima
`mutual_desfazer_carga(regional, confirmar)` remove pelo **vínculo**, nunca por "tudo que foi
criado hoje". `veiculo_tem_movimento()` preserva o veículo com protocolo, evento, acionamento,
rastreador, vistoria, item de fatura ou título: dali em diante a linha deixou de ser só uma cópia
do Mutual. **Piloto sem desfazer não é piloto — é produção sem plano.**

### Onde fica e como se usa
`/integracao/mutual` → seção **Carga da carteira — por unidade**
(`src/components/integracao/carga-mutual.tsx`). A ordem da tela é a ordem da decisão:
o **de-para do tipo de veículo** (3 escolhas, com o peso da carteira ao lado) → a **unidade** →
os **4 indicadores** → a **fila de trabalho agrupada por MOTIVO** (motivo junto é fila que ninguém
trabalha: "8 sem placa" e "3 com CPF inválido" são duas tarefas de duas pessoas) → **o que falta
para o CUTOVER, não para a carga** → o botão.

- **A fila do cutover é separada da recusa de propósito.** Valor, dia e plano **não impedem** o
  veículo de entrar — ficar fora da base seria pior (não apareceria no SAC, no portal nem na 24h).
  Mas no dia do cutover mensalidade nula cai no `cotar_plano` e, sem plano, dá R$ 0,00.
  `cutoverLiberado()` diz quando essa fila está vazia.
- **Lógica pura testada:** `src/lib/mutual.ts` — `placaMutual`, `chassiMutual`, `renavamMutual`
  (espelhos exatos do SQL: **mexeu num lado, mexa no outro e nos dois testes**), `resumoDaCarga`,
  `recusasPorMotivo`, `familiaDaRecusa`, `filaAntesDoCutover`, `cutoverLiberado`, `tiposPendentes`.
  Suíte de banco em `supabase/tests/0084_carga_mutual.test.sql`.

### 🔴 CONFERIDO EM PRODUÇÃO (01/10/2026) — e o de-para do PLANO é impraticável hoje
A migration passou e o lote está como medido. Mas a conferência achou duas coisas:

**1. `PLAN` NÃO É ENTIDADE CAPTURÁVEL — e são 42 ids distintos só na matriz.**
A 0084 criou `mutual_plano_do_externo` e o de-para por vínculo, mas **não criou a tela nem abriu
a entidade**: `chk_mutual_entidade` (0062) não aceita `'PLAN'`, então `/plan/` não pode ser puxado
e os 42 ids **não têm nome** — são números (`48`=114 veículos, `88`=110, `41`=44, e uma cauda de
39 valores com 1 a 21 cada). Contra **5 planos** no SCar (Essencial, Prata, Ouro, Diamante, Roubo
e Furto). **Mapear 42 números sem nome não é uma decisão, é um palpite** — exatamente o que a
postura da 0082 (só a decisão REGISTRADA carrega dado) manda não fazer.
**✅ RESOLVIDO PELA `0085`** — e ao escrevê-la a frase acima virou meia verdade: **18 dos 42 ids
cobrem 90%** da carteira faturável da matriz. Ver a seção própria.

**2. 🔴 CORREÇÃO DE UM TEXTO MEU: o plano NÃO bloqueia o cutover do boleto.**
A tela e a seção acima diziam *"no dia do cutover mensalidade nula cai no `cotar_plano` e, sem
plano, dá R$ 0,00"*. Isso vale **só para quem está sem `valor_mensalidade`** — e a carga grava o
override em todos, exceto 3. `valor_mensalidade_veiculo` (0024) prefere o override e **nunca chama
o `cotar_plano`**, então 470 dos 473 são faturados pelo valor carimbado, com ou sem plano.
**`cutoverLiberado()` já estava certo** (olha valor e dia, não plano); o texto é que exagerava.
O que o plano realmente custa: **a ficha do SAC mostra cobertura incompleta** (`opcionais_veiculo`,
0029, chama `cotar_plano` e com plano nulo devolve só a base + avulsos), então o atendente não vê
o que o associado tem direito. Isso é motivo para resolver o plano **antes de outubro virar
atendimento real**, não antes de carregar.

### O que a 0084 NÃO faz (e é decisão sua)
- **Não agenda a re-execução.** Durante a convivência a deriva só é corrigida por
  *recapturar + rodar de novo*. Rodando manualmente uma vez por semana em outubro, o piloto se
  mantém; para virar rotina precisa de agendamento no Supabase (mesma pendência da devolução de
  lead ao pool).
- **Não traz financeiro nem evento.** `INVOICE` (205.752 linhas) e `EVENT` (2.885) estão
  capturados e **fora da carga**: histórico pago reescreve DRE de mês fechado e, na convivência,
  faz os dois sistemas contarem a mesma receita. **A data de corte do financeiro continua em
  aberto** — e enquanto o cutover não acontece, ela não é urgente.
- **Não resolve os 8 veículos 0 km da matriz.** `veiculos.placa` é `not null`; eles entram quando
  a placa chegar. A cobrança da placa é operacional.
- **`DIFICULDADE FINANCEIRA`** (11 objetos na base toda) segue sem de-para: o usuário nomeou três
  status e esse não estava. Os objetos ficam de fora, contados.

## 🔴 PLANO DO MUTUAL SE CITA PELO NOME, NUNCA SÓ PELO NÚMERO (pedido do usuário, 07/10/2026)
> *"Para eu localizar os planos no Mutual, não é por número ou código, é pelo nome."* O `plan_id`
> não aparece na tela do Mutual — quem faz o vínculo procura pelo NOME. **Ao falar com o usuário,
> escreva sempre o nome do Mutual** (o número pode ir entre parênteses, só para referência nossa).

- **Fonte do nome:** `CONTRACT_OBJECT_PRODUCT.payload->>'plan_name'` (cobre TODOS os planos legados,
  capturado em 07/10) e, na falta, `PLAN.payload->>'name'`. O sufixo **"MIG"** colado no fim
  ("V5 AUTOMOVEL COMUMMIG") faz parte do nome como o Mutual devolve — são os planos migrados.
- **✅ A tela do de-para mostra o nome dos legados desde a `0093`**: `mutual_planos_externos` lê
  `PLAN` e, na falta, o `plan_name` dos produtos (vence a grafia mais frequente). A linha mostra
  **nome + (id N)**. Limite: só há `plan_name` para veículos cujos produtos foram puxados — ao
  carregar outra unidade, puxar *Produtos dos veículos* dela traz os nomes junto.

**Planos da carteira da MATRIZ (467 veículos carregados), por volume — medido em 07/10/2026:**

| Nome no Mutual | (id) | Veíc. | Tipo | Vínculo no SCar |
|---|---:|---:|---|---|
| V5 AUTOMOVEL COMUMMIG | 48 | 112 | Passeio | DIESEL MIGRADO MUTUAL ⚠️ |
| Plano V6- Automóvel MT | 88 | 107 | Passeio | PLANO OURO - VEÍCULOS |
| Plano Moto MT | 41 | 41 | Moto | PLANO PRATA ⚠️ (motos já reclassificadas) |
| MOTOCICLETAS /SP/CAPITALMIG | 57 | 20 | Moto | — (reclassificadas por terceiros) |
| Plano V7 - Automóvel Especial MT | 104 | 17 | Passeio | — |
| Plano V7 para pickups, vans e utilitários MT | 116 | 16 | Pick-up/Van | — |
| Plano V10 para pickups, vans e utilitários MT | 120 | 15 | Pick-up/Van | — |
| V6 PICKUPS/VANS/UTILITáRIOSMIG | 54 | 15 | Pick-up/Van | — |
| ESPECIAL V10 PICKUPS/VANS/UTILITáRIOSMIG | 49 | 13 | Pick-up/Van | — |
| Plano V7 - Automóvel MT | 92 | 12 | Passeio | — |
| Plano V10 para pickups_vans_ e utilitários especiais MT | 128 | 11 | Pick-up/Van | — |
| Plano V6 - Automóvel Especial MT | 100 | 9 | Passeio | — |
| ESPECIAL V6 /AUTOMóVEISMIG | 52 | 9 | Passeio | — |
| V6 AUTOMOVEL COMUMMIG | 56 | 8 | Passeio | — |
| Plano V5 - Automóvel | 22 | 6 | Passeio | — |
| Caminhões MT | 140 | 6 | Caminhão/Diesel | sem plano (decisão) |
| CAMINHõES-LEVE-VANSMIG | 53 | 5 | Caminhão | sem plano (decisão) |
| V10 PICKUPS/VANS/UTILITáRIOSMIG | 61 | 4 | Pick-up/Van | — |
| Plano Moto SP/ Riberão Preto | 43 | 4 | Moto | PLANO PRATA ⚠️ |
| ESPECIAL V6 PICKUPS/VANS/UTILITáRIOSMIG | 62 | 4 | Pick-up/Van | — |
| ESPECIAL V5 /AUTOMóVEISMIG | 55 | 4 | Passeio | — |
| ESPECIAL V10 AUTOMOVELMIG | 58 | 3 | Passeio | — |
| Rastreador e Assistência | 46 | 3 | vários | RASTREAMENTO |
| Plano V6 - Automóvel SP/SP | 87 | 3 | Passeio | — |
| Cauda de 1–2 veículos | — | 17 | — | Plano V7 para pickups_vans_ e utilitários especiais. MT (124) · MOTOCICLETA RN ESPECIALMIG (63) · ESPECIAL V12 /AUTOMÓVEISMIG (59) · V10 /AUTOMóVEIS COMUMMIG (51) · Roubo/Furto (45 → Roubo e Furto) · MOTOCICLETA R.PMIG (64) · VANS - CAMINHAO 3/4MIG (66) · CAMINHõES-V-PESADOSMIG (70) · Plano V6 - Automóvel RBP/SP (86 → Ouro) · Plano Moto SP/SP (42 → Prata ⚠️) · Plano V10 - Automóvel Especial MT (108) · Plano - V10 Automóvel MT (96) · Plano V6 - Automóvel Especial RBP/SP (98 → Ouro) · Plano V15 para pickups_vans_ e utilitários especiais MT (136) · MOTOCICLETAS / MATO GROSSOMIG (50) · Plano V10 para pickups_vans_ e utilitários especiais (38) |

## NOVA ADESÃO, CARNÊ E COMISSÃO (0145)
Pedido do usuário (23/10/2026, "fase crucial"): adesão pela tabela, boleto da adesão pela Smart Car, carnê no ato da
aprovação da Qualidade com N meses, comissão de adesão e recorrência pelo cadastro do vendedor. Decisões do usuário:
**adesão = valor da cotação aceita** (tabela já com o desconto da alçada); **vendedor que recebe na hora fica com a adesão
toda** (como era); **cartão recorrente fica para depois** (Asaas). As seções 3 e 4 do mesmo pedido (pró-rata e cancelamento
no SAC) já estavam na 0144.
- **Adesão:** o campo do fechamento virou leitura ("Valor da adesão (tabela)", `useAdesaoTabela`); o banco força o valor
  por trigger (lead e cotação) e `autorizar_entrada_lead` recusa sem cotação. Formas: *Vendedor recebeu na hora* ·
  *Boleto/PIX emitido pela Smart Car* (vira título do SCar marcado `adesao_lead_id`, emitido no Sicredi com o carnê) ·
  *Cartão (maquininha ou link)* (conta a receber, baixa manual — como antes).
- **Aprovação (`/vendas/[id]`, caixa da Auditoria):** dia de vencimento (5/10/15/20/25/30), carnê de 0–12 meses
  (padrão 6; 0 = só a adesão) e vencimento do boleto da adesão. Autorizou → abre o `ModalCarne` já emitindo
  (`/api/v1/vendas/carne`: `gerar_carne_veiculo` pela sessão + remessa ao Sicredi pelo servidor). Resultado: lista com
  linha digitável/PIX/PDF, **Imprimir carnê**, e-mail e WhatsApp; boleto recusado pelo banco → *Tentar de novo*
  (re-executável). Também em `/veiculos/[id]` → **Carnê / boletos** (`cobranca.criar` ou `vendas.fechar`; nunca para
  veículo com `cobranca_externa`). Regras puras em `src/lib/carne.ts` (testado).
- **O carnê é do veículo:** ele passa a `INDIVIDUAL_VEICULO` (gerar uma agrupada só com ele faria o lote mensal pular
  os outros carros do associado). O primeiro boleto é o primeiro vencimento a ≥ 2 dias; a fatura que a entrada na base
  gerou com vencimento já passado (sem boleto) é cancelada/sai da agrupada.
- **Comissão:** adesão paga pela Smart Car gera a comissão de adesão **quando o boleto é pago** (antes nascia pendente na
  aprovação); mensalidade paga gera recorrência; **corrigido**: boleto de fatura AGRUPADA (o padrão) nunca gerava
  comissão (o título não tem veículo) — agora cada item da fatura comissiona o vendedor dele, na proporção. Unique da
  comissão passou a (título, veículo).
- **DRE corrigido:** o título de fatura agrupada era descartado do DRE (join com `veiculos`); agora entra, e o boleto da
  adesão vai para 1.1.01.
- **Regimento (analisado com o usuário):** 4.2 "até o dia de seu desligamento" → o dia do cancelamento CONTA no pró-rata
  (0144 já faz). 4.5 sem ressarcimento → já respeitado (ciclo pago não gera crédito). **Não implementados (decisão
  pendente):** 4.3 (pedido com menos de 24 dias do vencimento → responde pelo rateio do mês seguinte) e 4.4 (multa de
  fidelização; o prazo de fidelização não está no texto recebido).
- **Fora desta fase:** cartão recorrente e a troca automática cartão → boleto/PIX (precisa do Asaas: `AsaasGateway` é
  esqueleto); pró-rata do primeiro mês da adesão.

## PLANOS POR TIPO, PRÉ-MARCADOS E COTA DO MODELO (0162)
Pedido do usuário (30/10/2026), na nova cotação. Os planos Ouro/Prata/Diamante já tinham sido excluídos pelo usuário.
- **Plano por tipo de veículo:** `plano_tipos_veiculo` (sem linha = todos, mesma regra de `produto_tipos_veiculo`);
  Configurações → Planos → *Oferecido para*. A cotação (CRM, portal do vendedor, edição da cotação, hotlink, simulador,
  ficha do veículo e fechamento) só oferece o plano do tipo; o plano já gravado continua na lista. O banco recusa a
  cotação com plano de outro tipo (`trg_cotacao_plano_do_tipo`, só quando plano/tipo MUDA). Puro: `src/lib/planos-oferta.ts`.
- **✅ Tipos gravados em produção (30/10/2026, autorizado):** nenhum plano tinha *Oferecido para* marcado e o Onix via
  plano de moto e de pesado. Gravado: ESSENCIAL - VEÍCULOS, ECONÔMICO e Roubo e Furto → Passeio, Pick-up/Van, Utilitário ·
  MOTOCICLETA ESSENCIAL → Moto · PESADOS BÁSICO e DIESEL MIGRADO MUTUAL → Caminhão Pesado, Diesel Leve · RASTREAMENTO →
  RASTREAMENTO SEM PROTEÇÃO. Plano sem tipo aparece em âmbar em Configurações → Planos (vale para todos).
- **Benefícios pré-marcados:** `plano_sugestoes` — opcionais que já vêm MARCADOS (como avulso) ao escolher o plano;
  Configurações → Planos, coluna *Pré-marcado* (ao lado de *Incluso*, que é item do plano). Na cotação, o plano escolhido
  leva o que o consultor marcou e os outros cards mostram o preço com os pré-marcados deles; trocar de plano recomeça dos
  pré-marcados. Grupos exclusivos (`GRUPOS_EXCLUSIVOS`: vidros, terceiros, carro reserva): marcar o parabrisa troca o
  vidros completo (`alternarOpcional`). O hotlink leva o pacote pré-marcado (não deixa trocar; o consultor ajusta depois).
- **Cota pelo modelo:** `modelo_do_catalogo(marca, modelo)` acha o modelo do catálogo (nomes do SGA, não os da FIPE) por
  semelhança (pg_trgm, ≥ 0,3) dentro da marca ("GM - Chevrolet" casa CHEVROLET) e devolve a cota. A captura preenche a
  cota sozinha e diz de qual modelo veio (escolher na mão desliga o automático); grava `leads.modelo_id`. Em 30/10 só
  3.117 de 8.822 modelos têm cota — os outros caem na faixa (a tela avisa).
- **Defeito corrigido junto:** os opcionais da cotação aceita nunca chegavam ao veículo — `autorizar_entrada_lead` agora
  copia `cotacoes.opcionais_ids` para `veiculo_produtos` (troca de literal sobre a versão em vigor).

## PROPOSTA COMERCIAL v2 (0164) — 3 folhas A4, tela e PDF
Pedido do usuário (30/10/2026), com o layout preparado no Cowork (referência em 3 HTMLs; cores/fontes trocadas pelas da marca).
- **Rota única:** `/cotacao/<token>` (não há rota paralela). Mostra as 3 folhas de 794×1123 escaladas na largura
  (`<VisorProposta>`, sem rolagem horizontal) + barra fixa **Aceitar proposta · WhatsApp · PDF**. PDF:
  `GET /api/v1/cotacoes/pdf?token=` (público por token, `no-store`, 20/10 min por IP), mesmo componente via
  `renderToStaticMarkup` + `gerarPdf(html, { rodape: false })` (o parâmetro novo não muda os termos). O Chromium roda sem
  rede: fontes da marca (`public/fontes-proposta/*.woff2`, lidas do disco), logo (`logoComoDataUrl`, reserva = SVG) e QR
  (`qrcode`) vão em data URL. Não guarda o PDF (a cotação é editável).
- **Dados:** `montarProposta` (`src/lib/proposta.ts`, testado) a partir de `carregarProposta` (`src/lib/proposta-server.ts`,
  service_role restrito ao token, nada de `select *` repassado). Total = `totalDoCliente`; itens por `itensParaCliente` (a
  Assistência Profissional nunca vira linha); CONSOLIDADA não mostra valor por item. Página 2: valores logo abaixo do
  veículo (mensal, adesão, rastreador — item da cotação, senão a regra do tipo, senão "Não exigido" —, cota % + R$),
  tiles de cobertura (casco aberto em `CASCO_INCLUI`, terceiros com o limite do nome, carro reserva com os dias, vidros
  pelo nível + descrição do produto; o rastreador não vira tile) e a tabela fixa `ASSISTENCIA_24H_PROPOSTA` — só o
  reboque muda, pelo **km do tipo de veículo** (Configurações → Tipos de Veículo, 0164). Página 3: regras (rastreador lido
  de `tipos_veiculo`, vidros só se houver), regras e exclusões da 24h, termo = resumo + `empresa.regulamento_url`
  (o texto integral espera a Fase 2 do aceite), consultor (vendedor do lead; sem ele o usuário consultor; sem os dois a
  central), QR e CNPJ de `empresa`. Validade = data da cotação + `empresa.validade_proposta_dias` (Configurações → Empresa).
- **Decisões do usuário (30/10):** km do reboque por tipo de veículo; hospedagem "2 diárias de até R$ 100,00 cada";
  manter "Cadastrada junto à SUSEP"; validade configurável em Empresa.
- **Aceite:** `POST /api/v1/cotacoes/aceite` chama a MESMA `registrar_aceite_venda` (sem sessão, IP/UA) para ESTA cotação
  e gera o link da vistoria (0076). Só a cotação mais recente do lead aceita (a antiga mostra "proposta atualizada").
- **Cores:** constantes `COR`/`FONTE` em `src/components/proposta/documento.tsx` (único lugar com hex; documento sempre claro).
  Textos sem vocabulário de seguradora (há teste: "local seguro" virou "local adequado").
- **Pendente:** preencher o km do reboque de cada tipo (sem ele a proposta diz "conforme o tipo"); conferir a tabela da 24h
  com o manual; logo transparente (a capa usa a logo numa placa branca).

## PLANO PREFERENCIAL E EDIÇÃO DA PROPOSTA (0163)
Pedido do usuário (30/10/2026).
- **Preferencial:** Configurações → Planos → *Plano preferencial* (selo no cartão). Na cotação do CRM, do portal do
  vendedor e do hotlink ele vem no TOPO e já escolhido; os demais aparecem com "Ver valor"/"Toque para ver o valor" até
  o clique. Sem preferencial entre os oferecidos para o tipo, nada se esconde e a escolha inicial é a antiga (o do meio).
  Pode marcar mais de um (um por tipo de veículo); vence o primeiro na ordem. Regras puras `ordenarPorPreferencia`,
  `planoInicial`, `valorVisivel` (`src/lib/planos-oferta.ts`, testadas).
- **Editar cotação** (`editar-cotacao.tsx`): a "Composição da mensalidade" mostra cada item com o valor (base, no plano,
  opcional; o desconto do plano riscado) e o total de tabela de AGORA (`useCotacaoAoVivo`: o mesmo `cotar_plano` que grava,
  com a unidade da cotação); cada opcional mostra "+ R$" antes de marcar (cotação com todos os oferecidos). Desconto em %
  OU pelo valor final em R$ (`percentualParaValorFinal`, `src/lib/crm.ts`). Antes só os obrigatórios tinham valor e o
  total era o da cotação já salva.

## NOVA ADESÃO COM BACK-OFFICE (0161) — a rotina revista com o usuário (30/10/2026)
Decisões do usuário, uma por uma:
- **Esteira:** Novo → Proposta enviada → Em negociação → **Aguardando vistoria** → Em auditoria (APROVADO vira
  EM_AUDITORIA pelo trigger da 0017) → Ativo, + Perdido. **"Cotação criada" saiu** (o enum não perde valor; o funil
  recusa e os leads antigos foram para Proposta enviada). **Toda cotação nova leva o lead de Novo para Proposta
  enviada** por trigger (`trg_cotacao_lead_proposta`) — CRM, portal do vendedor e hotlink.
- **Papéis:** o CONSULTOR faz placa, nome, contato, documento, e-mail, endereço (`<DadosBasicosLead>` no portal do
  vendedor) e o aceite, e passa adiante com **"Cotação aprovada"** (portal do vendedor e a ação da ficha no CRM). O
  aceite (do cliente ou presencial) também leva para **Aguardando vistoria**. Dali o **BACK-OFFICE** completa a ficha,
  manda links de vistoria e **envia para a Auditoria — o banco recusa sem o checklist 100%** (`mover_lead_status`).
  O **auditor corrige e aprova**; reprovado fica parado. Lead em Aguardando vistoria NÃO volta ao pool do vendedor.
  `mover_lead_status` agora exige `pode_tratar_lead` (antes bastava ser staff).
- **Checklist:** Renavam e data de nascimento viram **opcionais** (aparecem, não travam; Renavam informado errado
  trava). A **forma da adesão não trava**: padrão = recebida pelo consultor (`VENDEDOR_NA_HORA`, default da coluna),
  sem boleto. RG e e-mail continuam obrigatórios.
- **Fotos da vistoria:** `Configurações → Fotos da Vistoria` (`vistoria_fotos_modelo`; admin/financeiro gravam). O
  código da pose nasce do nome (`codigoDaPose`) e não muda (liga as fotos já enviadas); tirar = desativar.
- **Carência de 24h:** `veiculos.cobertura_desde` = autorização + 24h (só a entrada pela venda; nulo = sem carência,
  toda a base existente e o Mutual). A 24h mostra "Carencia: ..." e exige liberação de superior; evento com
  ocorrência antes do dia do início é recusado, e no próprio dia só a matriz registra (a data não tem hora).
- **Pró-rata PÓS-PAGO no 1º boleto do carnê** (decisão: coerente com o cancelamento da 0144): `gerar_carne_veiculo`
  troca o valor da 1ª fatura (ainda sem título) pelos dias desde a ativação até a véspera do vencimento ÷ dias do
  ciclo; ativado antes do ciclo paga cheio. Os demais boletos, cheios.
- **Na ativação:** pedido de instalação do rastreador = protocolo OUTROS "Instalacao de rastreador - PLACA",
  prioridade alta, sem responsável (fila da unidade), quando a cotação aceita cobra rastreador ou o plano exige. NÃO
  é alerta (alerta ativo bloqueia a 24h). **Boas-vindas:** o modal do carnê abre sempre depois da autorização no modo
  boas-vindas — *Boas-vindas por e-mail* (`/api/v1/vendas/boas-vindas`: login/senha do portal, documentos visíveis no
  portal, boletos com PDF; sem `RESEND_API_KEY` devolve o texto e avisa) e *WhatsApp* (link wa.me). Textos em
  `src/lib/boas-vindas.ts` (testado).
- **⏳ Fase 2 (não feita):** o TERMO DE ADESÃO com aceite eletrônico no MESMO link da vistoria ("Concluir minha
  adesão": termo + declarações + fotos) e o item "Termo de adesão aceito" no checklist. Até lá o checklist não exige o termo.

## ASSISTÊNCIA PROFISSIONAL (0158 + 0159) — o valor do consultor embutido na mensalidade
Pedido do usuário (28/10/2026): no mercado é comum embutir na mensalidade um valor que remunera o consultor; o nome
"Assistência Profissional"/"Honorários" gera atrito quando o associado vê a composição. Decisões do usuário: o campo
aparece para quem cota e **nunca para o cliente**; limite configurável (padrão R$ 1,00 a R$ 40,00); **o valor inteiro
é do consultor**; **fica fora do desconto**; **no hotlink entra R$ 0,00**; só as **unidades marcadas** pagam.
- **Configuração:** Configurações → Regionais → *Assistência Profissional* (checkbox + mínimo/máximo; a lista mostra
  "Assist. prof. R$ x–R$ y"). Nenhuma unidade nasce pagando.
- **A unidade que paga é a do VENDEDOR** do lead (`regional_assistencia_do_lead`: vendedor → lead → consultor); na
  captura, antes do lead, a de quem cota (`assistencia_profissional_regras(null)`: vendedor_atual → auth_regional_id).
- **Na cotação:** `<CampoAssistenciaProfissional>` (`src/components/vendas/campo-assistencia-profissional.tsx`) na
  captura (`novo-lead-cotacao.tsx`, CRM e portal do vendedor) e na edição (`editar-cotacao.tsx`); some quando a unidade
  não paga. A trava é do banco (`fn_cotacao_valida_desconto`, por qualquer caminho, só quando o valor MUDA — reconfigurar
  a unidade não trava a cotação antiga). `total_mensalidade` continua sendo a TABELA (o desconto corre sobre ela);
  `total_com_desconto` = tabela − desconto + Assistência. O card da cotação (CRM e portal do vendedor) diz "Inclui R$ X
  de Assistência Profissional (o cliente não vê)".
- **O cliente não vê:** a proposta pública (`/cotacao/<token>`) mostra `totalDoCliente` e, no modo detalhado,
  `itensParaCliente` soma o valor à **Taxa Administrativa** (sem ela, ao 1º obrigatório) para os itens baterem com o
  total — nunca uma linha própria. Regras puras em `src/lib/assistencia-profissional.ts` (testadas). Junto: a proposta
  pública passou a mostrar o total COM desconto (antes mostrava a tabela cheia).
- **No veículo:** `autorizar_entrada_lead` grava o valor da cotação aceita no INSERT (a primeira cobrança nasce no
  insert, 0025). `valor_mensalidade_veiculo` soma o valor quando não há override; **o override já o inclui**. A ficha de
  `/veiculos` tem o campo "Assistência Profissional (uso interno)" e o *Calcular* soma-o (o SAC → Alterar opcionais
  também).
- **Comissão** (`fn_calcular_comissao`): na mensalidade paga (nunca no boleto da adesão), com a unidade do vendedor
  pagando, `valor_comissao = (parte paga − AP) × taxa + AP`, e a parte da AP fica em
  `comissoes_vendas.valor_assistencia_profissional`. Unidade que deixou de pagar: só o percentual sobre o todo.
  Título de renegociação segue sem comissão (0121) — a AP daquele mês não volta ao vendedor.
- **Migrados do Mutual (medido em 28/10/2026):** no Mutual ela é PRODUTO do veículo (`CONTRACT_OBJECT_PRODUCT`), sem
  preço na lista. **Legado** "N ASSISTENCIA PROFISSIONAL VVMIG" (~424 veículos na base) traz o valor no nome (1→4, 2→8 …
  7→28); **novo** "Assistência Profissional" (product_id 53, ~444 veículos) só pela `subproduct_config_id` (~60
  configurações; as 7 maiores cobrem ~2/3). Tela: `/integracao/mutual` → seção da carga → *Assistência Profissional
  dos migrados* (por unidade): informar o valor de cada configuração (vê-se no Mutual) e *Gravar*. **O boleto do migrado
  não muda** (override do Mutual): gravar só separa a comissão. Valor já gravado e diferente não é trocado.
- **Não feito:** extrato de comissão mostrando a parte da AP separada (o valor já está somado em `valor_comissao`);
  descobrir pela API do Mutual o preço de cada configuração (hoje é digitado).

- **🔴 CORRIGIDO NA 0159 (decisões do usuário, 28/10/2026) — vale sobre o texto acima:**
  **qualquer unidade cobra** a Assistência (o banco só confere o mínimo/máximo da unidade; o campo aparece para todos);
  `paga_assistencia_profissional` passou a significar **"repassa a Assistência ao consultor NO LUGAR da comissão
  recorrente"** — comissão OU Assistência, nunca as duas. Repassa + veículo com Assistência: `valor_comissao` = a parte
  da Assistência (proporcional ao que o pagamento cobre de `valor_mensalidade_veiculo`; juros não aumentam; acordo de 3
  meses paga 3×; pró-rata paga a fração). Não repassa (ou veículo sem Assistência): percentual sobre o valor CHEIO.
  Adesão não muda. **A comissão sai da LIQUIDAÇÃO:** título de renegociação pago (SEGUNDA_VIA/ACORDO/PRO_RATA)
  comissiona — 2ª via/acordo repartidos pelos veículos dos originais (`cobranca_renegociacao_origens`), cada parte ao
  vendedor do veículo; AVULSO segue sem comissão. Espelho puro `comissaoDoPagamento` (`src/lib/assistencia-profissional.ts`).

## PLANO COM DESCONTO NA BASE E PARTICIPAÇÃO MULTIPLICADA (0160) — o Plano Econômico
Pedido do usuário (28/10/2026): o PLANO ECONÔMICO tem 30% de desconto na Taxa Administrativa, Assistência 24h e
Proteção do Casco, não tem terceiros nem vidros, e a participação é o DOBRO da do veículo (cota 5% → 10%).
- **Dois campos no plano, para qualquer plano:** `desconto_base_percentual` (0..90) e `multiplicador_participacao`
  (0,5..5). Default 0 e 1: nenhum plano mudou. Tela: Configurações → Planos → "Desconto e participação do plano";
  o cartão mostra os selos (`selosDoPlano`, `src/lib/planos.ts`, testado).
- **O desconto vale só para PRODUTO obrigatório** (item com `produto_id` e `obrigatorio` — hoje exatamente os 3);
  a regra do rastreador, o adicional da unidade e os opcionais/avulsos saem cheios. Cada item descontado leva
  `valor_tabela`/`desconto_plano` no detalhamento e no snapshot; `cotar_plano` devolve `desconto_base_valor`.
  A captura da venda e o hotlink mostram "Desconto do plano já aplicado". O desconto de venda (alçada da 0028)
  continua valendo e corre sobre o total já com o desconto do plano.
- **Participação:** `cotar_plano.franquia_participacao`, `participacao_do_plano(fipe, tipo, cota, plano)` (simulador,
  cotação do CRM, hotlink), `calcular_participacao_veiculo` (ficha/SAC/Termos: plano do veículo) e o snapshot de
  `atualizar_cotacao`. Base: cota do veículo > cota do modelo > faixa da tabela; vezes o multiplicador.
- **Terceiros/vidros:** o plano não tem esses produtos amarrados; continuam oferecidos como opcional avulso (sem
  desconto). Migrados não mudam de boleto (override).

## CANCELAMENTO DE BOLETO(S) COM MOTIVO (0157) — ⏳ ESCRITA, AINDA NÃO APLICADA
Pedido do usuário (28/10/2026): cancelar um ou vários boletos, com motivo, liberado por perfil ou extra.
- **Permissão = a célula `cobranca.cancelar`**, que existia desde a 0111 e nada usava (seed: financeiro; admin
  sempre; os demais pela grade do perfil ou como extra da 0116). **Nenhuma estrutura de permissão nova.**
- **Sem caminho paralelo: é a máquina da 2ª via (0121).** `criar_cancelamento_boletos(cliente, origens, motivo)`
  cria uma `cobranca_renegociacoes` tipo **CANCELAMENTO** já EMITIDA, sem boleto novo; a rota
  `POST /api/v1/cobrancas/renegociacao` `acao: 'cancelar'` pede a **baixa no Sicredi** de cada original
  (`baixarOriginais`); título que nunca foi ao banco vira SEM_REGISTRO e cancela; baixa recusada fica no cartão com
  "Tentar a baixa de novo" — e o boleto continua pagável até lá. Mutual sem nosso número: cancela no Mutual.
  Escopo `cobranca_pode_cliente`; motivo ≥ 5 caracteres; boleto pago/parcial ou já em outra negociação é recusado.
- **O motivo fica gravado:** na renegociação (`observacao`, com `criado_por`) e, no título do SCar, como
  "Cancelado: <motivo>" na observação, que o Histórico Financeiro mostra. Cancelamento NÃO exige revistoria.
- **`cancelar_fatura(uuid, text)`** (DROP + CREATE): mesma célula + motivo + escopo; recusa fatura cujo boleto já
  está no banco (vai pelo Histórico, que dá baixa).
- **Telas:** Histórico Financeiro (SAC e fichas): seleção serve para negociar OU cancelar, botão "Cancelar" na barra
  e por linha (`ModalCancelarBoletos`, `src/components/cobrancas/cancelar-boletos.tsx`); Faturas por Competência pede o
  motivo e some o botão para quem não tem a célula. Regras puras `motivoNaoCancelavel`/`validarMotivoCancelamento`
  (`src/lib/renegociacao.ts`). Suíte `supabase/tests/0157_*`.

## BOLETO AVULSO NO SAC (0150)
Pedido do usuário (25/10/2026): emitir pelo SAC boleto do que NÃO é mensalidade, no banco padrão (hoje o Sicredi;
link de pagamento quando o Asaas entrar). Lista inicial: Adesão, Vistoria, Re-vistoria, Avulso, Instalação de
Equipamentos, Manutenção de equipamentos, Monitoramento/rastreador, Cancelamento, Acordo Financeiro, Reativação,
Venda de Rastreador.
- **Card "Emitir boleto avulso"** no menu do veículo do SAC (`modo: 'avulso'`, `<ModalBoletoAvulso>`,
  `src/components/cobrancas/boleto-avulso.tsx`): tipo, referente ao veículo ou só ao associado, valor, vencimento
  (hoje..90 dias), descrição (≤ 200, vai ao boleto e ao histórico). Emitido, mostra o MESMO cartão da 2ª via
  (`ResultadoEmissao`: linha, PIX, PDF, WhatsApp, e-mail). Regras puras em `src/lib/boleto-avulso.ts` (testadas).
- **Quem emite:** `cobranca.criar` (seed: só financeiro; admin sempre — liberar por perfil/extra) + o associado no
  escopo da cobrança (`cobranca_pode_cliente`, o mesmo do PDF/2ª via). A tela só mostra o card a quem tem a célula.
- **Mesma máquina da 2ª via (0121), sem caminho paralelo:** `criar_boleto_avulso` cria uma `cobranca_renegociacoes`
  tipo **AVULSO** sem origens + 1 título com `tipo_avulso_id`; a rota `POST /api/v1/cobrancas/avulso` resolve o banco
  padrão ANTES, cria pela sessão e emite com `emitirRenegociacao` (`finalizar_emissao_renegociacao`; recusa do banco
  cancela o título). O título leva `observacao = 'Boleto avulso — <Tipo>: <descrição>'` (`ehBoletoAvulso`).
- **Não é mensalidade:** fora de `cobranca_boletos_base` (painel/fila de inadimplência) e de `vencidos_veiculo`
  (não bloqueia a 24h); não gera comissão (título de renegociação já não gerava); não entra em 2ª via/negociação
  na tela (`motivoNaoNegociavel` — o banco não trava isso). DRE (`dre_movimentos`): na conta do tipo, com ou sem
  veículo (Adesão 1.1.01 · Vistorias 1.2.03 · Rastreamento 1.2.04 · Venda de Rastreadores 1.2.05 · Acordo 1.1.00 ·
  demais 1.2.01).
- **Catálogo:** `tipos_boleto_avulso` (nome, conta do DRE, exige veículo, ativo, ordem) em **Configurações → Boletos
  Avulsos** (admin; escrita `tem_acesso_global`). Tipo usado não se apaga (FK restrict): inativa.

## CANCELAMENTO DO VEÍCULO E PRÓ-RATA (0144)
Pedido do usuário (23/10/2026): o card do SAC "Cancelamento" só abria um protocolo. Agora é **Cancelamento de Proteção
Veicular** e cancela de verdade — **SÓ o veículo escolhido** (os outros do associado e o cadastro dele não mudam).
Decisões do usuário: **ciclo PÓS-PAGO** (o boleto de 20/10 cobre 20/09–19/10); **boletos futuros do veículo BAIXADOS,
com opção de desmarcar**; **retorno previsto vira lead no CRM** com o retorno agendado.
- **Pró-rata reutilizável:** `pro_rata_veiculo(veiculo, ate, desde?)` — sempre pela data de vencimento do veículo
  (`dia_vencimento`, padrão 10; dia 31 vira o último dia do mês, como `calcular_vencimento`). Ciclo = último vencimento
  ≤ `ate` até a véspera do próximo; dias contam os dois extremos; valor = mensalidade (`valor_mensalidade_veiculo`) ×
  dias usados / dias do ciclo, em centavos, nunca acima da mensalidade. Espelho em `src/lib/pro-rata.ts` (testado,
  mesmos casos da suíte). **O valor cobrado é o do banco** — a tela mostra o que a RPC devolve.
- **O modal** (`ModalCancelamentoVeiculo`, `src/components/veiculos/cancelamento-veiculo.tsx`; SAC e botão *Cancelar
  proteção* na ficha `/veiculos/[id]`): motivo (obrigatório), data do pedido (até 60 dias para trás, nunca futura, nunca
  antes da ativação), previsão de retorno Sim/Não + data, a conta do pró-rata escrita, gerar o boleto (desligado por
  padrão quando o boleto do ciclo já foi pago — `cicloJaPago`), os boletos futuros do veículo com checkbox (do Mutual
  sem linha do Sicredi não dá baixa) e o resumo "o que vai acontecer". Veículo do Mutual: aviso para cancelar também lá.
- **Rota `POST /api/v1/veiculos/cancelamento`**: gateway resolvido ANTES; `cancelar_veiculo` pela sessão; protocolo
  CANCELAMENTO aberto e encerrado (não bloqueia); depois `criar_renegociacao_pro_rata` + emissão/baixa pela máquina da 0121
  (`src/lib/pagamentos/renegociacao-server.ts`, agora compartilhado com `/api/v1/cobrancas/renegociacao`). Se o banco
  recusar, o cancelamento FICA e a tela oferece *Tentar a cobrança de novo* (`acao: 'cobrar'`).
- **O que o cancelamento faz no banco:** status `inativo` com motivo (`status_motivo`), `cancelado_em` e `data_saida` = a
  data do pedido, rastreador para devolução (trigger da 0053), faturas ABERTAS sem título do veículo com vencimento depois
  do pedido (individual cancelada; na agrupada sai só o item dele). Quem pode: **`veiculos.cancelar`** (seed: financeiro,
  gestor; admin; outros pela grade/extra) na unidade. Sem a permissão o modal explica e manda abrir protocolo.
- **Travas a partir da data do pedido:** evento com `data_ocorrencia` ≥ cancelamento é recusado (antes dela tinha
  cobertura e entra); acionamento da 24h é recusado (o pedido NEGADO continua sendo registrado). Reativar o veículo
  (status de volta à base) limpa `cancelado_em` e marca `reativado_em` na trilha.
- **Carga do Mutual:** não reativa o veículo cancelado aqui enquanto o dono for o mesmo (troca de dono, revenda da 0138,
  segue o Mutual).
- **Boleto pró-rata avulso (seção 2 do pedido):** botão **Boleto pró-rata** no Histórico Financeiro de um VEÍCULO (SAC e
  ficha; quem tem `cobranca.ver`) → `ModalBoletoProRata`: do dia (vazio = início do ciclo) até o dia, vencimento até 60
  dias; emite via `acao: 'pro_rata'` da rota de renegociação (escopo `cobranca_pode_cliente`).
- **Limites conhecidos:** o lead de retorno não pode ser "autorizado" como venda nova (a placa já existe na base) — o texto
  do lead manda REATIVAR o cadastro; na ficha do ASSOCIADO (sem veículo) não há botão de pró-rata; o Mutual segue
  emitindo boletos do veículo até ser cancelado lá.

## REVISTORIA DO BOLETO VENCIDO (0137) — a 2ª via só sai com o carro conferido
Pedido do usuário (22/10/2026): associado que não pagou no vencimento, passado um número de dias (padrão 5,
configurável), só ganha boleto novo depois de uma REVISTORIA (foto da frente, da traseira e um vídeo dando a volta no
carro) aprovada pela equipe; "o mais automático possível" — quando o robô de cobrança existir, ele detecta o atraso e
manda o link sozinho. Decisões do usuário: a equipe pode **liberar sem revistoria, com justificativa** (permissão
`revistoria.cancelar`); **reprovada pede nova revistoria** (o mesmo link reabre, com o motivo); **vídeo de até 30 s**;
**nunca reaproveita** — cada 2ª via/negociação consome uma revistoria.
- **A TRAVA É DO BANCO, não da tela.** Trigger BEFORE INSERT em `cobranca_renegociacao_origens` (a 0121 não foi
  reescrita): se o boleto tem atraso (contado do próximo dia útil do vencimento, `dia_util_seguinte`) maior que
  `dias_revistoria_boleto()`, exige uma revistoria APROVADA ou DISPENSADA, ainda livre, para o veículo — e a RESERVA
  (`renegociacao_id`). Sem ela: `check_violation` "REVISTORIA PENDENTE: …". Boleto sem veículo (agrupado) cobre todos
  os veículos do associado ainda na base. Emitida a renegociação → UTILIZADA; ERRO → a reserva volta.
- **Configuração:** Configurações → Empresa → Política de cobrança → "Revistoria para a 2ª via (dias de atraso)",
  0..90 (0 = todo vencido exige).
- **O link público `/revistoria/<token>`** (7 dias; pedir de novo devolve o MESMO enquanto vale; vencido renova):
  passos com foto (comprimida no navegador) e o vídeo gravado na própria página (MediaRecorder, 720p, sem áudio,
  ~1,2 Mbps, para sozinho em 30 s; sem câmera, escolhe o arquivo e a duração é conferida). Rota
  `/api/v1/revistoria` (service_role + token, rate limit) sobe no bucket `vendas` (`revistorias/<id>/…`) e grava em
  `vistorias`/`vistoria_anexos` (tipo `revistoria_cobranca`). Banco: vídeo ≤ 50 MB e ≤ 32 s. Ao concluir → EM_ANALISE.
- **Telas da equipe:** `/cobrancas/revistorias` (menu Cobrança → Revistorias): abas Para analisar · Com o associado ·
  Precisam de revistoria (a lista de quem tem boleto vencido acima do limite e nenhum pedido — `revistorias_a_solicitar`,
  a entrada do robô) · Aprovadas/liberadas · Histórico. A análise mostra a mídia ATUAL ao lado da revistoria ANTERIOR do
  mesmo veículo; reprovar exige motivo (rápidos + texto). No modal da 2ª via/negociação (`negociacao-boletos.tsx`), o
  painel `<RevistoriaNecessaria>` diz qual veículo precisa, gera o link, manda no WhatsApp, renova e libera com
  justificativa — o botão de emitir fica travado até liberar.
- **NO SAC (22/10/2026, pedido do usuário):** o cabeçalho do associado mostra "Inadimplente há N dias · X vencido(s) ·
  R$ em aberto" (`resumoFinanceiro().diasAtraso`, do vencido MAIS ANTIGO; `textoAtraso`). Com boleto acima do limite, o
  `<PainelRevistoriaSac>` (`src/components/revistoria/painel-revistoria-sac.tsx`) aparece logo abaixo e já pergunta
  *"Sim, gerar o link da revistoria"* → WhatsApp/copiar; enviada, *"analisar agora"*; liberada, **"Gerar a 2ª via
  agora"** (`<ModalBoletoAposRevistoria>`: os vencidos negociáveis do veículo + os sem veículo, `boletosParaSegundaVia`,
  e o MESMO `ModalNegociarBoletos`). **Aprovar na fila também pergunta na hora** "Gerar a 2ª via agora?". **Menu:**
  número vermelho em *Cobrança → Revistorias* com as EM_ANÁLISE (sobe para o grupo quando ele está fechado;
  `useRevistoriasEmAnaliseContagem`, 60 s). **O card "2a via de Boleto" do SAC SAIU:** duplicava o Histórico
  Financeiro e ainda GERAVA as faturas da competência pelo motor antigo (`/api/v1/sac/boleto`); o card de histórico
  virou **"Boletos e 2ª via"**.
- **Rotina diária:** `POST /api/v1/cobrancas/revistorias/rotina` (`x-cron-secret` = `COBRANCA_CRON_SECRET`, ou sessão
  admin/financeiro) → `rotina_revistorias_cobranca()`: cancela o pedido de quem não tem mais nada vencido acima do limite
  e expira aprovada/liberada não usada em 10 dias; devolve também quantos estão "a pedir". VPS:
  `15 6 * * * /opt/scar/scripts/revistorias-rotina.sh` (log `/var/log/scar-revistorias.log`).
- **Permissões (grade, módulo `revistoria`):** ver/criar = todo staff · fechar (aprovar/reprovar) = financeiro, gestor,
  supervisor, cobrança · cancelar (liberar sem revistoria) = financeiro, gestor. Admin sempre; extras (0116) valem.
- **Regras puras:** `src/lib/revistoria.ts` (testado). Suíte `supabase/tests/0137_revistoria_cobranca.test.sql`; a suíte
  0121 desliga o trigger novo (os boletos dela têm 40–70 dias de atraso).
- **Não feito:** o ROBÔ que manda o link sozinho (falta decidir o canal — WhatsApp não tem API ligada; e-mail depende do
  `RESEND_API_KEY`). Quando existir, ele lê `revistorias_a_solicitar`, chama `solicitar_revistoria_cobranca` (origem
  ROTINA) e envia `mensagemRevistoria`.

## VEÍCULO 0 KM (0136) — placa pendente, identificado pelo chassi
- **O defeito (21/10/2026):** TULIO ROCHA LOPES (NMAX 160, contrato 15296, RIBEIRÃO PRETO) não existia
  no SCar — a placa veio em branco do Mutual, a carga recusava sem placa, e como era o único veículo
  dele o ASSOCIADO também não entrou (associado entra pelo veículo). Medido: na carteira viva, 22 sem
  placa COM chassi (19 motos) e 5 sem os dois; no acervo inativo, 261 com chassi.
- **A regra mora no banco:** `chk_veiculo_identidade` = placa preenchida **ou** (`zero_km` **e** chassi).
  Placa **nunca** é inventada (placeholder colide no dia em que a real chega). O `unique` da placa
  ficou: dois NULL não colidem. Placa em branco vira NULL (`trg_veiculo_placa_vazia`).
- **A carga:** sem placa com chassi → CRIAR como 0 km; recusa só "SEM PLACA E SEM CHASSI".
  `rn_placa` não particiona os NULL (senão o 2º 0 km do lote virava "duplicata"). Na re-execução,
  `placa = coalesce(r.placa, v.placa)` — a placa digitada aqui não some enquanto o Mutual segue sem
  ela — e o chassi idem (sem ele o 0 km perderia a identidade e a constraint derrubaria o bloco).
- **Telas:** checkbox *Veículo 0 km (placa pendente)* no cadastro de `/veiculos` (o chassi completo
  vira obrigatório; *Consultar* placa fica desligado sem placa — use a cascata FIPE); filtro
  **Placa pendente (0 km)** na lista; busca por **chassi** (lista de veículos e SAC, 4+ caracteres —
  normalmente o final do chassi); onde a placa aparece, `identificacaoVeiculo()` mostra
  "0 KM · CHASSI …028234". Regras puras em `src/lib/placa.ts` (`identificacaoVeiculo`,
  `placaPendente`, `validarIdentidadeVeiculo`, testadas).
- **Fora desta entrega (decisão a parte):** a VENDA de 0 km pelo CRM/hotlink — `checklist_lead` exige
  placa e a captura começa pela placa; `autorizar_entrada_lead` monta a descrição da adesão com a
  placa. O cobrança da placa pendente (aviso automático) também não existe: hoje é a fila do filtro.

## SINCRONIA AUTOMÁTICA DO MUTUAL (0107) — a venda nova do Mutual chega sozinha
- **O defeito (14/10/2026):** a placa LVA7H55, vendida no Mutual em 25/09, não existia no SCar.
  CONTRACT e PERSON tinham sido capturados em 09/09; **161 veículos ativos** vendidos depois disso
  estavam fora da carga (sem contrato não há unidade; sem associado não há cadastro). Durante a
  convivência (até dezembro) isso se repete a cada venda — então virou rotina, não clique.
- **Rota:** `POST /api/v1/mutual/sincronizar` (só `x-cron-secret` = `COBRANCA_CRON_SECRET`, o mesmo
  da baixa; segredo errado = 404). Faz: (1) recaptura `ENTIDADES_DA_SINCRONIA` (SALE_TEAM, CONTRACT,
  PERSON, ADDRESS, CONTRACT_OBJECT, EVENT — `src/lib/mutual-sincronia.ts`; EVENT desde 23/10); (2) carga de cada unidade com
  equipe ligada, em blocos de 100 (`LOTE_CARGA_AGENDADOR`: o service_role herda os 8 s do
  `authenticator`); (3) `mutual_vincular_vendedores`; (4) devolve `equipes_sem_unidade` — equipe
  NOVA sem de-para não carrega e a rotina NÃO decide: vincular na tela. Captura que falha não
  impede a carga. `{ "sem_captura": true }` roda só a carga.
- **Laço de captura num lugar só:** `src/lib/mutual-captura-server.ts` (`capturarEntidade`), usado
  pela tela (`/api/v1/mutual`) e pela rotina.
- **A 0107 só troca a trava** de `mutual_registrar_captura`, `mutual_carga_linhas` e
  `mutual_executar_carga` para aceitar o caminho sem sessão (`... or auth.uid() is null`, padrão da
  0052). Corpos conferidos idênticos aos de produção (md5) em 14/10/2026.
- **VPS:** `crontab -e` → `20 3 * * * /opt/scar/scripts/mutual-sincronizar.sh` (log em
  `/var/log/scar-mutual.log`). Rodar à mão a primeira vez e conferir o log. Depois da carga e dos
  vendedores, importa o histórico de eventos (0101) — passo `historico de eventos` no log.
  **Boletos na rotina (23/10/2026):** depois das entidades, captura INVOICE **incremental**
  (`updated_at__gte` = início da última captura completa DA ROTINA − 3 dias; `modoCapturaInvoice`,
  `src/lib/mutual-sincronia.ts`, testada) com **passada completa aos domingos**, na primeira rodada e se
  a marca tiver mais de 8 dias — o filtro do Mutual nunca foi provado com o payload, a semanal corrige.
  A marca é `mutual_sincronias` da rotina (`executada_por` nulo, sem erro); captura que para no teto
  (700 páginas) é gravada com erro e não vira marca. Depois das cargas, importa o histórico de
  boletos inteiro em blocos de 2.000 (`cobranca_importar_historico_mutual`, ~1,3 s por 4.000) — passo
  `historico de boletos` no log. A 1ª rodada após o deploy é a completa (~420 páginas, ~15 min).
  **🔴 O INCREMENTAL DO INVOICE FALHOU DE 26 A 29/10/2026** (HTTP 400 "updated_at__gte: Informe uma
  data/hora válida"): o filtro ia só com a DATA (`2026-10-22`) e o Mutual exige data E hora. Nesses dias a
  rotina não trouxe boleto nenhum (achado pelo caso AMARILDO GRACIANO: 2ª via paga em 28/10 pelo BRADESCO,
  fora do Sicredi, sem baixa no SCar). Corrigido em 29/10: `desde` em ISO com hora (`2026-10-19T06:20:00Z`)
  e, se o incremental falhar, a rotina faz a passada completa na mesma rodada. **Ainda não provado contra o
  Mutual** — conferir o log da próxima rotina (`captura INVOICE incremental desde ...`).
  **A 2ª via do Mutual pode sair por OUTRO BANCO** (bank_id 15 = Bradesco, linha 237): essa não passa pelo
  Sicredi, então a baixa dela só chega pela captura do INVOICE + importação (e a 0140 cancela o original).
  **✅ Reposto pelo agente em 29/10/2026 (autorizado):** depois de uma captura manual de INVOICE, a importação
  não tinha alcançado 113 boletos de associados carregados (67 ausentes + 46 com situação velha, AMARILDO
  incluído). Importados um a um pela própria `cobranca_importar_historico_mutual(<id anterior>, 1, true)`;
  conferido: 0 ausentes, 0 divergentes; 21 originais viraram cancelado/substituído pela 0140. **Para importar
  só uma lista de ids** sem a passada inteira: cursor = o `id_externo` de INVOICE imediatamente anterior
  (`max(id_externo) where id_externo < alvo`) e lote 1. **Dois casos para a equipe** (VICTOR HUGO PORFIRO DA
  SILVA, R$ 248; ERICA FILOMENA DOS SANTOS, R$ 193,75): pagaram a 2ª via do SCar em 28/10 e a via do Mutual
  (Bradesco) aparece paga em 29/10 com `last_change_type: MANUAL` e crédito 28/10 — provável baixa manual no
  Mutual espelhando o pagamento do SCar, não pagamento em dobro; confirmar no extrato do Bradesco
  (nosso número 02153107806 e 02153091938).
  **ADDRESS ignora a paginação** (`/core/address/` devolve os ~45 mil endereços inteiros em toda página,
  array cru sem `next`): de 14 a 23/10 a rotina regravou o mesmo conjunto por até 17 min, todo dia, até o
  Mutual derrubar a conexão ("fetch failed"/502). Corrigido em `temProximaPagina` (página cheia = EXATAMENTE
  o tamanho pedido; lista maior = acabou). O dado não se perdeu: a 1ª página já trazia tudo (45.696).
- **Queda do Mutual no meio da captura (23/10/2026):** PERSON e INVOICE pararam em "fetch failed" (24.500 boletos
  e a captura completa perdida). Agora cada PÁGINA é tentada de novo até 3 vezes (espera 2 s, 5 s, 15 s) em queda de
  rede, 5xx, 429 ou corpo cortado — `lerPaginaMutual` (`src/lib/mutual-captura-server.ts`), regra pura
  `deveRetentarMutual` (`src/lib/mutual.ts`, testada). 4xx não repete (é recusa). Vale para a tela e para a rotina.
- **No corte de dezembro: tirar a linha do crontab** (item do checklist pós-corte).

## A CARGA EM BLOCOS (0094) e as MOTOS pela tela — leia antes de carregar outra unidade
- **O botão "Carregar" agora grava em blocos** (`useExecutarCarga`, `LOTE_CARGA` = 200 em
  `src/lib/mutual.ts`): "Lendo o lote…" → "Gravando N de M…". Cada bloco é uma transação; falhar no
  meio deixa o que já entrou, e o próximo clique refaz a fila (o carregado vira ATUALIZAR).
- **O seletor "Unidade a carregar" subiu para o TOPO da seção** — é ele que filtra os de-paras de
  categoria e de plano. Embaixo, o usuário não achava onde corrigir o plano: sem unidade a lista lia a
  base inteira.
- **🔴 PLANO DE MOTO NÃO TEM DE-PARA FIXO.** "Plano Moto MT" (41), "Plano Moto SP/SP" (42) e
  "Plano Moto SP/ Riberão Preto" (43) estão ligados a **PLANO PRATA** (plano de CARRO). Medido em
  08/10: **SP 1 tem 300 motos no 42 e Ribeirão Preto 192 no 43** — carregar assim põe 492 motos no
  Prata. O certo: deixar esses três **"— sem de-para —"** e, depois de carregar e puxar *Produtos
  dos veículos*, usar o quadro **"Motos — o plano pelos produtos"** (novo, mesma seção): simula e
  aplica `mutual_aplicar_plano_por_terceiros` (terceiros → MOTOCICLETAS - OURO, sem → MOTOCICLETA
  ESSENCIAL, reclassificando quem está em PRATA). A linha de plano de moto (`tipos = '2'`) avisa isso.
- **🔴 A CARGA NÃO TRAZ O CONSULTOR (medido 08/10).** `mutual_executar_carga` nunca grava
  `veiculos.vendedor_id` (0084: "vendedor é daqui"). Na matriz, a corrente
  `objeto.contract_id → CONTRACT.consultant_id → CONSULTANT.cpf_cnpj → vendedores.documento` resolve
  **431 de 467** (29 vendedores, todos da mesma unidade do veículo); 2 contratos sem consultor
  (HNC4288, NAU8B54); os outros 34 eram de 8 consultores ausentes do cadastro (o Mutual tem 379, o
  cadastro casa 302). **Os 34 foram ligados ao CLAYTON R CARNIEL** por SQL do usuário em 08/10 (12 deles
  são de outros consultores no Mutual — decisão do usuário), e o CPF dele foi gravado só com dígitos.
  **→ Resolvido pela `0095`** (decisão do usuário: ligar para carteira/relatórios e migrado nunca
  paga adesão): a carga liga o vendedor no fim (só quem está SEM), o quadro **"Vendedor dos
  veículos"** mostra quem fica sem e por quê, `fn_calcular_comissao` deixa de tratar o 1º título do
  migrado como ADESÃO, e o CPF do vendedor passa a ser gravado só com dígitos por trigger.
- **Números das 3 unidades que faltam (08/10):** RIBEIRÃO PRETO 1.182 no lote (11 recusados, 483 sem
  plano) · SÃO PAULO 1 837 (13, 420) · GRANDE NATAL 433 (1, 350).

## O DE-PARA DO PLANO (0085) — `/integracao/mutual` → *Plano / cobertura*
> Só leitura. **Não carrega, não muda preço, não toca em `veiculos`.** Ela abre a entidade,
> cria a tela do de-para e conserta um nome de coluna que mentia.

### 🔴 O QUE O PLANO CUSTA — e NÃO é o boleto
`valor_mensalidade_veiculo` (0024) prefere o **override** e **nunca chama o `cotar_plano`** nesse
ramo. A carga grava `final_total_value` em todos menos 3, então **470 dos 473 são faturados pelo
valor carimbado, com ou sem plano**. O que o plano decide é a **cobertura que a ficha do SAC
mostra** (`opcionais_veiculo`, 0029, chama o `cotar_plano` e com plano nulo devolve só a base +
avulsos): sem ele o atendente não vê a que o associado tem direito. **Logo: resolver antes de
outubro virar atendimento real, não antes de carregar.** `cutoverLiberado()` já estava certo em
olhar valor e dia, não plano.

### 🔴 DUAS HIPÓTESES MEDIDAS E DESCARTADAS — as duas quase viraram afirmação
1. **"O preço identifica o plano, então o nome é dispensável."** Na amostra da MATRIZ a
   mensalidade mediana separava os ids limpo (48 → R$ 196 · 88 → R$ 213 · 41 → R$ 120) e a FIPE
   mediana acompanhava — o que sugeria `plan_id` = **faixa de preço**, equivalente à nossa
   `tabela_precos_faixa`. **A base viva inteira desmente:** dentro do MESMO `plan_id` a FIPE varia
   de **6× a 14×** (e **1.111×** no id 48). O id é **combo comercial**, e a mensalidade varia com a
   FIPE dentro dele — então ela não o identifica. *É a lição do módulo repetida: amostra pequena
   sugeriu padrão que a base inteira nega.*
2. **"São 42 decisões, inviável."** Falso, e é o que torna isto entregável: **18 ids cobrem 90%**
   dos 481 faturáveis da matriz (na base viva inteira, **29 de 91** cobrem 90% dos 3.041). Por
   isso a RPC devolve **`cobertura_acumulada`**: a tela diz **onde parar**. Sem essa coluna a tela
   é uma lista de 42 números de peso aparentemente igual, e a resposta natural é "inviável" — a
   conclusão errada que esta migration existe para desfazer.

### O perfil é PERFIL, nunca identificação
`mensalidade_mediana`, `fipe_min` e `fipe_max` entram para **reconhecer** ("este é de moto") e para
**desconfiar**: faixa larga é plano genérico — o id 48 vai de R$ 100 a R$ 111.140 de FIPE.
`amplitudeFipe()` é esse quociente, e a tela marca "genérico" a partir de 6×.
**A mediana é `percentile_cont`, que INTERPOLA** (mesma escolha da 0064): a mediana de
200/210/220/240 é 215, um valor que não existe na amostra. Serve para perfil; não é um preço real.

### 🔴 O ENDPOINT É `/quotation/plan/` — e ele ESTAVA NO REPOSITÓRIO (corrigido em 05/10/2026)
O texto abaixo é o registro do erro. O swagger foi lido inteiro em 09/09 e
`docs/modulos/integracao-mutual.md` lista `/quotation/plan/` entre "as tabelas de domínio". A 0085
palpitou sem consultar o próprio `docs/`, e custou uma semana: 4 capturas com 404, um provador de
8 candidatas — todas 404. **Antes de chutar caminho do Mutual, `grep` em `docs/`.**
Ao capturar, conferir que os `plan_id` do contrato casam com os ids de `/quotation/plan/`
(`capturado` em `mutual_planos_externos`): se não casarem, é outro catálogo com o mesmo nome.

### (histórico) ⚠️ O ENDPOINT `/plan/` NÃO FOI CONFIRMADO NO SWAGGER
O swagger do Mutual não é alcançável do ambiente onde a 0085 foi escrita. O caminho em
`ENTIDADES_MUTUAL.PLAN` (`/contract/plan/`) segue o padrão das outras entidades de contrato e
**a tela diz que é um palpite** — puxar é um clique e um 404 responde em dois segundos. Trocar o
caminho é **uma linha** em `src/lib/mutual.ts`: nada de schema depende dele.
**E o de-para NÃO depende da captura.** `integracao_vinculos` (0082) guarda o id e não tem FK para
`mutual_captura`, então os 42 ids aparecem na tela **com o peso da carteira mesmo sem nome** —
exatamente como as 19 equipes de vendas foram agrupadas antes de `SALE_TEAM` ser puxada (0083).
Capturar depois só preenche o NOME.

### O peso é DA UNIDADE escolhida, de propósito
`mutual_planos_externos(p_regional_id)` nulo = a base inteira; com unidade, o peso é o daquela
unidade. Ordenar pelo volume da base toda poria no topo um plano que não pesa nada na unidade que
se está carregando — e a carga roda **por unidade**.

### 🔴 `regional_id` → `destino_id`: o nome mentia
A 0084 devolvia o de-para do TIPO DE VEÍCULO numa coluna chamada **`regional_id`** que guarda um
`tipos_veiculo.id`. Nome que mente é a família de erro que este projeto já pagou caro (o branch
"espelhado", a `schema_migrations` vazia): a próxima sessão lê `regional_id`, conclui unidade e
constrói em cima. Muda a lista de OUT, então é **DROP + CREATE**, e o rename foi junto em
`src/lib/mutual.ts`, `database.types.ts` e na tela.

### 🔴 A ALLOW-LIST TEM TRÊS CÓPIAS — e redigitar derruba em silêncio o que esquecer
`chk_mutual_entidade` (banco) · `EntidadeMutual` (`database.types.ts`) · `ENTIDADES_MUTUAL`
(`src/lib/mutual.ts`, que tem o caminho de cada uma). **A primeira versão desta migration omitiu
`'CONTRACT'`** ao reescrever o CHECK — e o contrato é justamente quem guarda o dia de vencimento
(0064) e a `sales_team_id` (0083): a captura dele pararia de funcionar e o sintoma apareceria dias
depois, na carga. **A suíte pegou.** Desde então existem duas guardas, e elas são a entrega:
- a suíte `0085` insere **uma linha por entidade**, afirmando a lista INTEIRA, não só a nova;
- `src/lib/mutual.ts` tem uma **afirmação de COMPILAÇÃO** (`_entidadesSincronizadas`) de que as
  duas cópias do cliente são iguais nos dois sentidos — divergir **quebra o `tsc`**, não a tela.
**Mexeu numa, mexa nas três.**

### Lógica pura testada
`src/lib/mutual.ts` — `planosPendentes`, **`idsPara90Pct`** (quantas decisões cobrem o alvo; conta
sobre os faturáveis, não sobre `cobertura_acumulada`, para não depender da ordenação da RPC),
`amplitudeFipe`. Suíte de banco em `supabase/tests/0085_mutual_de_para_plano.test.sql`.

### ✅ CONFERIDA EM PRODUÇÃO (01/10/2026) — e um número meu estava errado
O banco está como esperado: as 7 funções do módulo existem como `security definer` com
`search_path` fixo, a allow-list tem as **15 entidades** (conferidas **uma a uma** pela guarda da
suíte — `CONTRACT` inclusive), as duas RPCs devolvem **`destino_id`**, e o rito da 0052 se manteve:
**0 RPCs nossas abertas ao `anon`**; as 223 são de extensão.

**🔴 CORREÇÃO DE UM NÚMERO MEU: são 18 ids, não 17 — e 29 na base inteira, não 26.**
Medido na carteira real com a regra certa (*a primeira posição cujo acumulado alcança o alvo*):
a posição 17 cobre **89,81%** e a 18 cobre **90,64%**. Não é arredondamento — conferi a fração
exata, sem `numeric(5,1)`. O erro foi meu, numa consulta avulsa anterior à migration, com uma
contagem acumulada frouxa (`count(cob <= 90) + 1`).
**A conclusão não muda** ("é entregável, e a tela diz onde parar"), mas o número mudou — e número
errado escrito com confiança é justamente a família de erro que este arquivo persegue.
**`idsPara90Pct` sempre esteve certa:** ela é a régua, e foi contra ela que o SQL foi conferido.

⚠️ **O cabeçalho da migration e o `comment on function` dela ainda dizem 17/26.** A `0085` já está
aplicada e **migration é append-only** — não foi reescrita de propósito, porque o arquivo é o
registro do que rodou. O texto do comentário no banco sai **na próxima migration**, de passagem;
está anotado na caixa de estado do topo.

**→ Corrigido pela `0086`** (só o comentário; nenhuma função muda).

### 🔴 A TELA ESTAVA MENTINDO (02/10/2026) — erro de leitura nunca vira estado vazio
`/integracao/mutual` disparava ~18 leituras pesadas ao abrir (2,4–4,4 s cada, sozinhas). Juntas,
passavam do `statement_timeout` de **8 s** do `authenticated`, o PostgREST devolvia 500, o hook
dava erro e a seção desenhava o estado VAZIO — inclusive *"Nenhuma equipe ainda. Puxe Equipes de
vendas"* ao lado de *"52 capturados"*, e seis seções que simplesmente sumiam (foi o "não estão sendo
listadas as filiais" de semanas antes). O banco estava são o tempo todo.
- **`<ErroLeitura q={query}>`** (`src/components/integracao/erro-leitura.tsx`) + 
  `mensagemDeFalhaDeLeitura` (`src/lib/mutual.ts`, testada). **Regra: toda seção que lê o banco
  mostra o erro antes do vazio.** O supabase-js devolve `{code, message}`, não `Error` — tratar só
  `instanceof Error` faz tudo virar "[object Object]" (o teste pegou).
- **As seções de diagnóstico nascem FECHADAS** (`<Secao aberta onAlternar>`) e só consultam ao
  abrir — os hooks ganharam `ativo` → `enabled`.
- **✅ A FILA (10/10/2026): toda leitura de `use-mutual.ts` passa por `naFila`** (`criarFila(1)`,
  `src/lib/fila.ts`, testada). Mesmo com as seções de diagnóstico fechadas, escolher uma unidade
  disparava ~9 leituras eager JUNTAS (capturas, equipes, cutover, tipos, planos, categorias,
  prévia, linhas, vendedores) — sozinhas cada uma cabe nos 8 s, juntas estouravam. Agora vão
  **uma por vez, na ordem em que a tela pede**: enche mais devagar e não falha. A leitura de
  unidade que ficou para trás (trocou o seletor) é **descartada antes de chegar ao banco** (o
  `signal` do TanStack). Mutações não entram na fila. **Hook novo de leitura neste módulo:
  `queryFn: ({ signal }) => naFila(async () => {...}, signal)`** — sem isso ele volta a disputar.
- **`alter function … set statement_timeout` NÃO resolve:** o timer é armado no início do
  statement; mudá-lo dentro da função não o rearma (medido). O alívio real seria o de-para como
  TABELA/join (**75 ms × 1.235 ms** de `mutual_status_veiculo`), ~13 funções — decisão à parte.
- **O sondador de caminho** (`action: 'sondar'` em `/api/v1/mutual`, `CANDIDATAS_PLANO`) testa
  candidatos com `page_size=1`, sem gravar e sem seguir redirect. É ele que acha o `/plan/` real;
  trocar `ENTIDADES_MUTUAL.PLAN` é **uma linha**.

### O que falta CLICAR (medido em 05/10/2026)
- **`PLAN`: `/quotation/plan/` exige `vehicle_id` e devolve só os planos VENDÁVEIS HOJE** para
  aquele veículo. Medido em 05/10/2026 após a 1ª captura: **13 planos**, 11 casam com os 109
  `plan_id` dos contratos (1.784 de 17.358 objetos). Na matriz, dos grandes só o **88**
  ("Plano V6- Automóvel MT", 108 faturáveis) veio; **48 (112) e 41 (44) são legados** e nenhum
  veículo os contrata mais. `capturarPlanos` (em `/api/v1/mutual`) roda em duas passadas: **por id**
  (`/quotation/plan/{id}/`) **só se o swagger declarar** (`caminhoDeDetalhe`), depois **por veículo**
  (`veiculosPorPlano`: titular + 2 reservas, porque o Mutual responde *"Veículo não encontrado"*
  para veículo antigo). O diagnóstico lista os caminhos do swagger que falam de plano
  (`caminhosDoSwagger`). **Se não houver detalhe por id, o nome do legado sai da TELA do Mutual**
  (abrir um contrato daquele plano) — o de-para não depende do nome capturado.
  **Regra: erro do Mutual sempre leva o corpo da recusa** — "HTTP 400" sozinho manda chutar.
- **1 vínculo de `PLAN` (05/10/2026):** `48` → **DIESEL MIGRADO MUTUAL** (plano-balde criado pelo
  usuário, 0 produtos, para ajustar caso a caso). ⚠️ Apesar do nome, os 112 da matriz no 48 são
  **todos `vehicle_type` 1 (CARRO)** — Onix, HB20, Strada, Gol; na base viva o 48 tem 544 faturáveis.
  **Caminhões da matriz (13, nos planos 140/53/66/70) ficam SEM plano por decisão do usuário.**
  Faltam `88` (108), `41` (44) e a cauda — as 18 decisões que cobrem 90% da matriz.
- **O tipo de veículo passou a sair da CATEGORIA (`0087`, pedido do usuário em 05/10/2026).** A
  categoria do Mutual já diz "V6 / pickups/vans" × "V5 / automóvel comum" × "Caminhão Leve" — é
  o mesmo movimento das equipes de vendas (0083): **agrupar várias categorias num tipo do SCar**,
  pela tela, seção *Categoria do veículo*, agrupada pelo tipo do Mutual. **A chave é o PAR
  categoria/tipo** (`26/1` PASSEIO·CARRO × `26/2` PASSEIO·MOTO). Categoria sem vínculo cai no
  de-para por `VEHICLE_TYPE` (reserva) — que segue com 0 vínculos. **Matriz (473 objetos):** V5
  automóvel comum 206 · Motocicleta 63 · PASSEIO 38 · V6 pickups 29 · Especial v6 automóvel 25 ·
  V6 automóvel 22 · Especial v10 pickups 21 · V10 pickups 16 · … · caminhões em 5 categorias
  (Caminhão Leve 4, FRETE 3, CAMINHÕES PESADOS 3, Caminhão Pesado 2, VANS-CAMINHÃO 3/4 1).
- **Nenhum dos dois impede a CARGA** — ver a caixa de estado do topo.

## PREPARAÇÃO DA CARGA DO MUTUAL (0082) — as 3 peças que faltavam
> Nada aqui carrega dado. A regra da Fase 1 continua de pé e **há teste provando** que `clientes`,
> `veiculos`, `titulos_financeiros` e `faturas` seguem intactos.

### (A) 🔴 A UNIDADE MORA NO ASSOCIADO — e a corrente do consultor estava VAZIA
- **O que foi medido**, com tudo capturado, em 20/09/2026:

  | Onde | Preenchido |
  |---|---|
  | `objeto.consultant` | **0 de 17.675** |
  | ~~`contrato.consultant`~~ | ~~0 de 17.616~~ — **a medição estava errada: a chave é `consultant_id`, 96,4% (ver 0083)** |
  | `objeto.regional_id` / `contrato.regional` | **0** |
  | **`PERSON.regional_id`** | **12.628 de 12.628 — 100%** |

- **⚠️ A conclusão "o funil do consultor dá ZERO" era falsa** — ver a `0083`. No OBJETO o campo é
  mesmo vazio, mas no CONTRATO ele existe como `consultant_id` e a função já lia as duas chaves.
  As duas funções seguem no banco. O que continua valendo: **quem decide a unidade hoje é a equipe
  de vendas (0083)**, não o consultor nem a filial.
- **A corrente real tem DOIS saltos, por id:**
  `objeto.person_data.person_id` → `PERSON` → `regional_id` → filial. **Cobertura: 3.409 de 3.440
  = 99,1%** da carteira viva, acima do corte de 95% que o próprio módulo fixou na 0073.
- **🔴 A LIÇÃO, E ELA É NOVA NESTE MÓDULO: o erro não foi chutar o NOME da chave.** Era
  `regional_id` mesmo — ela existe no objeto e no contrato, sempre vazia. Foi procurá-la na
  **ENTIDADE errada**. `mutual_campos` (0065) só responde sobre a entidade que você perguntou:
  **antes de concluir que um dado "não veio", inspecione também as entidades VIZINHAS.**
- **QUATRO lugares leem a unidade** — `mutual_regional_externa` (o resolvedor de linha, que a
  carga vai usar), `mutual_diagnostico`, `mutual_quarentena` e `mutual_filiais` — e a precedência
  (**associado manda; objeto e contrato são reserva**) tem de ser a mesma nos quatro. **Há teste do
  espelho** comparando o resolvedor com o join do diagnóstico objeto a objeto. *Isso não é teoria:
  ao escrever, três dos quatro nasceram divergentes e foram pegos pela suíte.*
- **`mutual_filiais` contava ZERO em todas as 10 filiais**, porque agrupava por `objeto.regional`.
  Agora conta pelo associado e devolve `faturaveis` e `associados` — os números que decidem o
  de-para. `ja_existe_id` virou **`palpite_id`**, e o nome é a entrega.
- **O diagnóstico ganhou o grupo `UNIDADE` com TRÊS motivos separados** (sem unidade · associado
  não capturado · filial sem de-para). Motivo junto é fila que ninguém trabalha: são três tarefas,
  de três pessoas diferentes.
- **A regra da 0064 vale aqui, e eu a esqueci na primeira versão:** enquanto `/person/` ou
  `/regional/` não foram puxados, a quarentena fica **calada** em vez de acusar a carteira inteira
  — quem manda PUXAR é o diagnóstico e o funil. Sem essa trava, toda linha viraria
  `ASSOCIADO_NAO_CAPTURADO`, que é o mesmo falso alarme em massa que já afogou o sinal real duas
  vezes neste módulo (0063 e 0064). **Foi a suíte da 0062 que pegou.**

### (B) `integracao_vinculos` — sem ela a segunda carga DUPLICA
- **Nenhuma tabela da operação guarda id externo:** tudo é chave natural (`cpf_cnpj`, `placa`). E
  "a primeira carga nunca é a definitiva" — CPF é corrigido, placa é transferida, e registro em
  quarentena não tem linha onde pendurar id.
- **🔴 O `unique` é SÓ do lado externo, de propósito.** Um id do Mutual aponta para UM registro;
  mas **dois ids do Mutual podem apontar para o MESMO registro** — é o associado repetido (mesmo
  CPF duas vezes) virando um cliente só, caso que o próprio diagnóstico já conta. Um unique do
  lado de cá recusaria exatamente a reconciliação que a tabela existe para permitir.
- **`registro_id` não tem FK** (aponta para tabelas diferentes conforme `tabela`), então quem
  vigia é `vinculos_orfaos()`. E `tabela` tem **allow-list** por CHECK: sem ela um erro de
  digitação cria vínculo que nunca resolve nada e ninguém descobre.
- **O primeiro uso é HOJE, não na Fase 3:** o de-para das 10 filiais mora aqui, e a tela de
  `/integracao/mutual` grava nele.
- **🔴 SÓ A DECISÃO REGISTRADA CARREGA CARTEIRA.** `mutual_regional_do_externo` lê **apenas** o
  vínculo. O palpite por CNPJ/nome continua em `mutual_filiais.palpite_id`, rotulado, para
  acelerar a escolha de quem olha — e nunca entra na carga: `regional_id` atravessa RLS,
  `escopo_regional()` e todos os painéis, e uma filial de 4.712 associados posta na unidade errada
  por homonímia é um estrago que ninguém vê acontecer. Mesma postura do preço na 0081.

### (C) 🔴 `veiculos.cobranca_externa` — o interruptor que desarma a mina nº 1
- **O risco, intacto até aqui:** `trg_veiculo_primeira_cobranca` (0025) roda `after insert`.
  Carregar 3.440 veículos ativos geraria **3.440 faturas do mês** — cobrar de novo quem já paga
  no Mutual.
- **UMA condição cobre CINCO caminhos.** Os quatro pontos de geração de fatura (0025, linhas
  49/206/237/317) e `gerar_primeira_cobranca_veiculo` passam **todos** por `veiculo_faturavel`
  (0024). A condição vive lá dentro — e virar a flag por unidade **é o cutover**.
- **A GUC `scar.importacao` não resolveria**, e por isso não foi o caminho: ela é **local à
  transação**, então protege a janela da carga e não protege o lote rodado três meses depois. A
  flag protege os dois, porque vive no DADO e não na sessão.
- **🔴 COBRANÇA EXTERNA NÃO É BLOQUEIO.** O associado segue **ativo** e com todos os benefícios —
  24h, evento, carro reserva, portal. Só a mensalidade não é emitida aqui. Quem bloqueia benefício
  é `inadimplente`/`suspenso` (0072), que são outra coisa. Efeito colateral desejado: sem título
  nosso, `dias_atraso_cliente()` dá zero e a 24h não recusa o associado por uma dívida que esta
  base nem enxerga. **Há teste.**
- **Ela NÃO aparece no formulário do veículo**, pela mesma razão que `inadimplente` não aparece
  (0072): é decisão de cutover por unidade, não marcação de atendente. Quem vira é
  `definir_cobranca_externa_regional` — só a matriz, e **trazer a cobrança para cá exige motivo**
  (é o movimento perigoso: a partir dali a unidade passa a emitir boleto aqui).
- **Mas o selo APARECE na lista de `/veiculos`**, porque o veículo fica ativo e sem boleto: sem o
  selo, "cadê a cobrança?" vira chamado.
- **Hoje é no-op:** `default false`, nenhum veículo nasce com ela, e há teste de regressão
  provando que a carteira que já existe continua faturando igual.

### O que a 0082 NÃO faz
Ela prepara; **não carrega**. Continuam em aberto, e são decisões suas: as **9 placas e 9 chassis
repetidos** (as duas colunas são `unique` — a carga para no meio), os **25 veículos 0 km** sem
placa (`veiculos.placa` é `not null`), o status **`DIFICULDADE FINANCEIRA`** (11 objetos, único
sem de-para), a **data de corte do financeiro e dos eventos**, e o de-para de **`VEHICLE_TYPE`**
(3 linhas), **`plan_id`** e das **41 marcas** que não casam por nome.

## A unidade pelo CONSULTOR (0073) — o instrumento, não a carga
> **⚠️ CORREÇÃO (0083): esta corrente NÃO está vazia — a 0082 mediu a chave errada.**
> O que a 0082 escreveu ("`consultant` em branco em 0 de 17.675 objetos **e 0 de 17.616
> contratos**") só vale para o **objeto**. No **contrato** a chave chama-se **`consultant_id`**, e
> ela vem preenchida em **16.988 de 17.616 (96,4%)**. `mutual_consultor_do_objeto` já procura as
> duas chaves, então o funil daqui sempre teria resolvido; quem errou foi a consulta avulsa que
> concluiu o contrário — e errou exatamente como a lição que a própria 0082 escreveu no cabeçalho.
> **Ainda assim, não construa a carga sobre ela:** o caminho em uso é `contract.sales_team_id`
> (0083), que é um salto por id e cai direto no nível de `regionais`. Esta seção continua valendo
> como **método** e as funções seguem no banco.

- **O problema:** `regional` veio vazio em **100%** dos objetos e dos contratos. A unidade é
  bloqueante (`regional_id` atravessa RLS, `escopo_regional()` e todos os painéis).
- **A tese que sobrou**, e ela é boa: o objeto traz **`consultant` como CÓDIGO**, não como nome —
  então o primeiro salto é um **join exato**, não casamento por texto que erra em acento,
  abreviação e homônimo. A corrente é:
  `objeto.consultant` → `/association/consultant/` → documento/e-mail → `vendedores` (os 379 já
  importados, com regional decidida na 0069) → `regional_id`.
- **⚠️ SÃO QUATRO SALTOS, E CADA UM PERDE.** Tese de quatro saltos não se aceita pelo desenho; se
  mede. Por isso a 0073 **não carrega nada**: ela conta quantos veículos sobrevivem a CADA degrau.
  Mesmo papel que `mutual_status_cruzado` (0071) teve para a mudança de leitura do status.
- **O que decide não é o total, é ONDE quebra.** "Faltam 800" não é tarefa; "800 caem porque o
  consultor não tem CPF no cadastro deles" é. `gargaloDoFunil()` nomeia o degrau que mais perde e
  a tela abre por ele.
- **A chave de reconciliação é a MESMA da importação de vendedores (0069):** documento (só
  dígitos) manda, e-mail (minúsculo) é reserva. **Medir por uma chave que a carga não usa produz
  número bonito e falso** — por isso o casamento por NOME aparece como *informativo* ("N casariam
  só por nome"), nunca dentro do funil. Ele responde outra pergunta: vale enriquecer o cadastro?
- **Não se chuta o nome do campo.** `mutual_texto_em(payload, candidatas[])` devolve o primeiro
  valor não vazio entre várias chaves e `mutual_chave_em` diz **qual pegou** — sem isso ninguém
  descobre que o documento veio de `cpf` e não de `cpf_cnpj`, e a próxima sessão chuta de novo.
  Supor onde um campo mora já custou duas rodadas neste módulo (o dia de vencimento e a unidade).
- **Sem `CONSULTANT` capturado o funil manda PUXAR**, não acusa o dado (regra da 0064). Acusar
  ausência de dado que ninguém capturou já gerou centenas de falsos críticos duas vezes aqui.
- **O corte de 95% (`teseDoConsultorSeSustenta`) não é místico:** abaixo disso o resto vira
  trabalho manual por associado, e aí o de-para por NOME de equipe (poucas decisões) custa menos
  que a corrente.
- **⚠️ O FUNIL SÓ VALE COM A `0074` APLICADA.** A `0073` contava o mesmo veículo mais de uma vez
  quando dois vendedores dividiam o **e-mail** (a unidade que cadastrou a equipe com o e-mail da
  franquia) ou o **nome** (homônimos): nenhum dos dois é único em `vendedores`, só `documento`
  (0069), então o `left join` multiplicava a linha do objeto. No cenário do teste da `0074` são
  **16 onde existem 5** — e a inflação acontece só nas linhas com colisão, então `perdidos`, que é
  subtração entre degraus, deixa de significar coisa alguma. **Instrumento que conta errado não
  adia a decisão: toma-a com número falso.** A `0074` resolve o casamento uma vez por CONSULTOR
  (`lateral ... limit 1`), que é de quem ele é propriedade — não do veículo.
- **O desempate da chave ambígua é ANUNCIADO, nunca silencioso (0074).** Quando o e-mail do
  consultor casa com mais de um vendedor, alguém tem de ser escolhido; o degrau 5 passa a dizer
  **quantos veículos dependem dessa escolha**. Decisão em silêncio neste módulo já custou duas
  rodadas (o dia de vencimento e a unidade).
- **A REGRA DA FASE 1 continua:** nada escreve em `clientes`, `veiculos`, `titulos_financeiros`,
  `faturas` ou `eventos_sinistro`. Há teste provando.
- **Onde fica:** `/integracao/mutual`, seção **"A unidade pelo consultor"** — o funil degrau a
  degrau + a fila "quem a corrente perde", ordenada por VOLUME de veículos (tratar o maior
  primeiro resolve a maior parte da carteira com o menor número de decisões).
- **Lógica pura testada:** `src/lib/mutual.ts` — `gargaloDoFunil`, `coberturaDoFunil`,
  `teseDoConsultorSeSustenta`, `CHAVES_DOC_CONSULTOR`/`_EMAIL_`/`_NOME_`.

## Status do veículo e a INADIMPLÊNCIA (0072)
- **O ciclo pedido:** mensalidade em atraso → o veículo vai **imediatamente** para
  `inadimplente`, o que **já bloqueia todos os benefícios** (24h, evento, carro reserva); passados
  **20 dias** (parâmetro) nesse status sem regularizar, ele vira `inativo` e a cobrança encerra.
- **⚠️ O CRON NÃO EXISTE AINDA** (decisão do usuário: "construíremos o Cron depois). A 0072 entrega
  o **estado**, o **relógio** e o **parâmetro**; **nenhum veículo nasce `inadimplente` hoje**, então
  todas as mudanças dela são no-op até a rotina existir. Ao construí-la, ela tem duas passagens e
  as duas já têm onde se apoiar: quem tem título vencido → `inadimplente`; quem tem
  `situacao_inadimplencia_veiculo().tolerancia_vencida` → `inativo`.
- **O RETORNO É O PAGAMENTO (decisão do usuário, arquivada).** Reconhecido o pagamento do boleto,
  o CRON **reativa o veículo na base normalmente** — `inadimplente` → `ativo`, sem etapa manual.
  Duas notas para quem construir a rotina: (1) voltar a `ativo` dispara
  `trg_veiculo_primeira_cobranca` (0025), que é **idempotente por competência** — já existindo item
  de fatura naquele mês, ela retorna sem fazer nada; (2) o gatilho pode ser a **baixa do título**
  (desbloqueio na hora, que é o que importa quando o associado paga e liga pedindo guincho) ou a
  própria varredura diária (mais simples). Os dois caminhos são válidos; escolher ao construir.
- **🔴 A DECISÃO QUE IMPORTA: `inadimplente` CONTINUA FATURÁVEL.** Ele entrou em
  `veiculo_faturavel` (0024) ao lado de `ativo`/`em_evento`/`vistoria_pendente`. Deixá-lo de fora
  **parece** o lado conservador e é o contrário: no dia em que o CRON entrasse, a carteira
  inadimplente **pararia de ser cobrada em silêncio** — a associação deixaria de emitir boleto
  exatamente de quem deve. O associado inadimplente segue **contratado**, só bloqueado; quem
  encerra o contrato é a passagem para `inativo`. **Cobrar quem está na tolerância é o que dá
  sentido à tolerância.** Há teste dos dois lados (`0072` no banco, `inadimplencia.test.ts` no TS).
- **O RELÓGIO é `veiculos.status_desde`**, carimbado por trigger BEFORE a cada troca de status, por
  qualquer caminho — mesma escolha do parque de rastreadores (0050): a aplicação esquece, a trigger
  não. Sem ele não existe "20 dias inadimplente" para contar. **Não derive o prazo de
  `dias_atraso_cliente()`**: aquilo conta do boleto mais antigo em aberto, então quem regularizou e
  recaiu já entraria com o relógio adiantado. Editar a cor do carro **não** reinicia a contagem
  (o trigger é `update of status`). `status_motivo` recebe o texto via
  `set_config('scar.motivo_status_veiculo')`, mesmo mecanismo da auditoria da OS 24h.
- **A TOLERÂNCIA É PARÂMETRO, não número no código:** `empresa.dias_tolerancia_inadimplencia`
  (padrão 20, `0..365`), editável em `Configurações → Empresa → Política de cobrança`. Fica em
  `empresa` porque é termo do contrato de adesão, válido para a associação inteira, e a cobrança é
  toda da matriz (0037), não da franquia. `0` = inativa na primeira passagem. Ela já é **lida hoje**
  pela contagem regressiva na lista de veículos — parâmetro que ninguém lê é promessa falsa (o
  gotcha da 0068).
- **`inadimplente` NÃO aparece no formulário do veículo, de propósito.** Ele é decidido pelos
  TÍTULOS: marcar na mão seria desfeito na passagem seguinte do CRON — ou, pior, inativaria o
  associado em 20 dias por um clique. **Bloqueio manual continua sendo `suspenso`**, que já existe.
  O selo, esse, mostra o status de verdade (ver o gotcha do `statusMeta`).
- **O rastreador acompanha, em DOIS passos:** veículo → `inadimplente` põe o equipamento em
  *3 - Inadimplente* (suspende o rastreamento, **não** pede o aparelho de volta); veículo →
  `inativo`/`suspenso`/`baixado`/`excluido` põe em *4 - Inativo (pedir devolução)*. **O laço antigo
  só pegava equipamento em `ATIVO`**, então o que a tolerância acabara de mover para 3 nunca
  chegaria ao recolhimento — buraco fechado na 0072. `sincronizar_rastreadores_inadimplencia` (0053)
  também passou a devolver a `ATIVO` o equipamento de veículo ainda em `inadimplente` que
  regularizou.
- **O painel da 24h conta `inadimplente` como BLOQUEADO**, não como inativo (`assist_painel_resumo`
  e `grupoSituacao`): juntá-lo aos inativos esconderia justamente a fatia que uma cobrança recupera.
- **O de-para do Mutual NÃO mudou:** `INADIMPLENTE` de lá continua virando `ativo` na importação
  (0062/0071). É a inadimplência apurada sobre os títulos **deles**; importar esse veredito
  bloquearia associados por uma dívida que esta base ainda nem enxerga — e largaria o relógio de 20
  dias correndo no dia da carga. Quem decide `inadimplente` aqui é o CRON, sobre
  `titulos_financeiros` daqui. (O comentário da 0062 dizendo "no SCar a inadimplencia e DERIVADA
  dos titulos" descreve o passado; a decisão de não remapear continua a mesma.)
- **Lógica pura testada:** `src/lib/inadimplencia.ts` — `STATUS_FATURAVEIS`, `STATUS_BLOQUEADOS`,
  `diasNoStatus`, `tolerancia`, `avisoDeTolerancia`, `DIAS_TOLERANCIA_PADRAO`. O aviso fala em dias
  **restantes**, não em dias corridos: o que a operação precisa saber é quanto tempo ainda tem para
  cobrar antes de perder o associado.

## Troca de plano (upgrade / downgrade) — 0070 + `src/lib/planos.ts`
- **O que estava errado:** a ficha do veiculo listava TODO opcional ativo como escolha do
  atendente, inclusive os que o plano ja carrega (`plano_produtos`). Um veiculo no Plano Diamante
  aparecia com as coberturas do proprio Diamante DESMARCADAS — quem abria a ficha nao tinha como
  saber o que o associado ja tem, e remarcar "para garantir" gravava como avulso algo que ja vinha
  no combo. Era o mesmo bug que a `0040` corrigiu na tela de venda, ainda de pe no cadastro.
- **A regra:** `veiculo_produtos` guarda **so o que foi contratado A PARTE**. O que vem no combo e
  resolvido pelo plano e aparece **marcado, travado e com o selo "no plano"**. Ao salvar,
  `avulsosDoVeiculo()` tira os itens do plano da lista — o que tambem **limpa ficha antiga** que os
  gravou junto. O preco nao muda com essa limpeza (`cotar_plano` sempre uniu plano + avulsos); o
  que muda e a ficha passar a dizer a verdade sobre o que e cobrado a parte.
- **Subir e descer de categoria** e o mesmo caminho, na tela de veiculos: trocar o plano no seletor
  dispara `trocarPlano()`, que mostra em uma faixa o que **passa a incluir**, o que **deixa de ser
  cobrado a parte** (avulso que o novo combo absorveu) e a **cobertura que sai** no downgrade.
- **O que se perde no downgrade e ANUNCIADO, nunca recolocado sozinho.** Cada item perdido vira um
  botao "+ manter", que o recontrata como avulso pago. Remarcar muda o preco, e isso e decisao de
  quem atende — nao da tela.
- **A armadilha do preco:** `veiculos.valor_mensalidade` e OVERRIDE — `valor_mensalidade_veiculo`
  (0024) prefere ele ao `cotar_plano`. **Subir de plano sem mexer nesse campo nao muda um centavo
  do que e faturado.** Por isso a troca recotiza sozinha e a tela avisa em ambar quando o valor
  gravado diverge do calculado, com um "Aplicar" ao lado. Quando a tela pode sincronizar sozinha e
  regra pura: `podeSincronizarMensalidade()` — sim com campo vazio ou com valor que bate com a
  ultima cotacao feita ali; **nao** diante de qualquer divergencia ou de ficha recem-aberta.
  Valor negociado nao se sobrescreve em silencio.
- **A troca so vale para o futuro:** `faturas`/`fatura_itens` sao snapshot (0021), entao a
  competencia ja emitida nao muda — o plano novo entra na proxima geracao de cobranca.
- **Na cotacao da venda** (`editar-cotacao.tsx`) o mesmo corte foi aplicado: os opcionais do combo
  aparecem em "Ja incluidos neste plano" e o `p_opcionais_ids` leva so o avulso. E foi la que o
  downgrade estava quebrado — ver a `0070`.
- **Logica pura testada:** `src/lib/planos.ts` (`sentidoDaTroca`, `compararTrocaDePlano`,
  `avulsosDoVeiculo`, `mensalidadeCongelada`, `podeSincronizarMensalidade`). A separacao
  incluso x avulso reusa `separarOpcionais` de `src/lib/vistoria.ts` — a mesma da tela de venda,
  nao uma copia. O mapa plano -> produtos vem de `useProdutosPorPlano()` numa consulta so, porque
  o diff precisa dos itens do plano ANTERIOR e do NOVO no mesmo instante.

## ADICIONAL DE RISCO POR REGIONAL (0081) — `Precificação → Tabela de Preços`
> **Primeira migration que muda PREÇO.** Leia antes de rodar.

- **O problema:** `tabela_precos_faixa`, `participacao_faixa` e `adesao_faixa` são chaveadas só por
  `tipo_veiculo_id` — o preço era nacional. São Paulo e Natal têm risco diferente.
- **A solução:** a tabela da MATRIZ continua sendo a **única tabela de preço do sistema**. Cada
  regional cadastra **um valor em R$ por TIPO DE VEÍCULO**, somado à mensalidade de **qualquer
  faixa FIPE** daquele tipo. *"Natal · Moto · +R$ 5,00"* é **uma linha** que cobre as 46 faixas de
  Moto. Sem linha = preço da matriz, intacto.
- **🔴 ONDE FICA, e por quê:** o painel vive em **Precificação → Tabela de Preços**, ao lado da
  **regra do rastreador** (0019) — não em Configurações → Regionais. É a mesma natureza de coisa:
  uma regra que sobe por cima da matriz inteira de um tipo. E quem decide o preço de Moto está
  olhando a tabela de Moto; mandá-lo ao cadastro de unidades é trocar de assunto no meio.
  **Decisão do usuário (20/09/2026)** — o desenho original pedia Configurações → Regionais.
- **🔴 UMA VEZ, NÃO POR PRODUTO.** A soma acontece **depois** do laço de produtos e da regra do
  rastreador. Dentro do laço, +R$ 5,00 viraria **+R$ 10,00** numa faixa de 2 produtos — e o erro
  passaria despercebido, porque o número continua parecendo plausível. Há teste dos dois lados.
- **🔴 É DROP + CREATE, NÃO OVERLOAD.** `calcular_mensalidade` e `cotar_plano` já tinham DEFAULT no
  último argumento; criar uma versão com um argumento a mais (também com default) faria
  `calcular_mensalidade(fipe, tipo)` casar com as DUAS e o Postgres recusa com *"function is not
  unique"*. Mesma mordida que a 0070 documentou. **As chamadas antigas seguem idênticas** — o
  default `null` significa MATRIZ PURA, e há teste de regressão provando isso.
- **SÓ MENSALIDADE.** `calcular_adesao`, `calcular_participacao`, `adesao_faixa`,
  `participacao_faixa` e `substituir_tabela_precos` **não foram tocados**, e o `taxa_adesao` do
  retorno continua vindo do `calcular_adesao` puro. Há teste.
- **✅ VALOR É SEMPRE >= 0 (decisão do usuário).** O desenho original previa valor negativo com
  piso/teto na matriz; o usuário avaliou e disse que *adicional é adicional*. Com isso caíram o
  piso, o teto e a confirmação de negativo. Liberar depois é trocar **um** CHECK — mas aí a alçada
  volta a ser assunto, porque negativo é desconto.
- **✅ A COMISSÃO NÃO FOI TOCADA (decisão do usuário).** O desenho mandava tirar o adicional da base
  de `regionais.taxa_comissao_recorrente` — mas **essa taxa é só TETO, nunca multiplica valor
  nenhum**. Quem vira dinheiro é `vendedores.taxa_comissao_recorrente`, em `fn_calcular_comissao`
  (0002), sobre o título pago; tirar dali mexeria no bolso do VENDEDOR. O usuário optou por deixar
  a comissão sobre o valor cheio. **Há teste que falha se `fn_calcular_comissao` mudar.**
- **🔴 O VEÍCULO NA BASE NÃO FLUTUA — e o override é o que impede COBRAR DUAS VEZES.**
  `valor_mensalidade_veiculo` (0024) devolve `veiculos.valor_mensalidade` quando ele existe e
  **nunca chama o `cotar_plano`**. São dois nascimentos:
  | Caminho | `valor_mensalidade` | O que acontece |
  |---|---|---|
  | Venda (`autorizar_entrada_lead`) | **não grava** | cai no `cotar_plano` (matriz) **+ o adicional carimbado** |
  | Cadastro manual em `/veiculos` | **grava** o calculado | o override **já inclui** o adicional — somar de novo cobraria em dobro |
  Então o adicional entra **só no caminho sem override**. E a soma usa o valor **gravado no
  veículo**, nunca uma consulta nova: reajustar o cadastro **não retroage** no faturamento de quem
  já está na base. Há teste dos dois.
- **O snapshot é a prova do cálculo.** `cotacoes.regional_id` + `valor_adicional_regional` (gravados
  na cotação do CRM **e** na do hotlink) e `veiculos.valor_adicional_regional` + `regional_preco_id`
  (carimbados por `autorizar_entrada_lead` **a partir da cotação**, não do cadastro de hoje: se a
  unidade reajustou entre o aceite e a auditoria, cobrar o novo quebraria o aceite).
- **QUEM PRECIFICA É O ASSOCIADO** (`regional_preco_do_lead`): `clientes.regional_id` quando ele já
  existe, senão a do próprio lead. **Não existe de-para CEP → regional neste sistema** (conferido:
  nenhuma faixa de CEP, UF ou abrangência por unidade), então inventar um na cotação seria preço
  por palpite. `divergencia_regional_preco` diz quando o vendedor é de outra unidade, e
  `<DivergenciaRegional>` mostra isso no fechamento da venda.
- **⚠️ A ALÇADA BLOQUEANTE DA DIVERGÊNCIA NÃO FOI CONSTRUÍDA.** O desenho pedia exigir a mesma
  alçada do desconto (0028) para prosseguir. Hoje o sistema **avisa e não trava** — e a razão é que
  não há dinheiro se perdendo: o preço segue o do associado, que é o correto para o risco. Travar
  exigiria decidir o que exatamente a alçada gateia (o salvar da ficha? a autorização da
  Auditoria?). Decisão em aberto.
- **O adicional aparece DISCRIMINADO, nunca embutido:** linha própria no `detalhamento_produtos`
  (categoria `ADICIONAL_REGIONAL`, `produto_id` null), então ele já sai na cotação pública
  `/cotacao/<token>` de graça. No simulador há "Tabela da matriz" e "Adicional de risco da unidade"
  em linhas separadas. **`produtos_obrigatorios_cotacao` (0028) já descarta item sem `produto_id`**,
  então o adicional não vira "item obrigatório que sumiu"; e `opcionais_veiculo` (0029) chama o
  `cotar_plano` **sem** regional, então ele não aparece como opcional contratado no SAC.
- **Preço é da MATRIZ:** leitura por `tem_acesso_global() or pode_regional()`, escrita **só admin**.
  O gestor lê o próprio adicional e não edita nem o dele. Há teste.
- **Duas vigências sobrepostas são recusadas pelo BANCO** (`EXCLUDE ... using gist` com
  `daterange` + `btree_gist`): com duas linhas vigentes, o `limit 1` escolheria por acaso — e preço
  decidido por acaso é o pior desfecho possível aqui. Trocar o adicional **encerra** o anterior em
  vez de apagar: histórico de preço é prova.
- **Lógica pura testada:** `src/lib/adicional-risco.ts` — `mensalidadeComAdicional`,
  `adicionalVigente` (meio-aberta `[início, fim)`, igual ao `daterange` do banco),
  `temAdicional` (null ≠ R$ 0,00), `resumoDaGrade`, `avisoDeReajuste`, `textoDaDivergencia`.
  Suíte de banco em `supabase/tests/0081_adicional_risco_regional.test.sql`.

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

## Central do Atendente — o SAC antes da busca (0055)
- **A tela do SAC tem dois estados.** Sem associado selecionado, a área abaixo da busca é a
  **Central do Atendente**; assim que alguém é escolhido, ela sai de cena e a ficha assume — o
  atendimento continua focado na pessoa. Antes esse espaço (o maior da tela) tinha uma frase cinza.
- **Três blocos, na ordem em que a operação precisa deles:** *Meus protocolos* (os que estão com
  quem está logado, só os abertos, clique leva ao atendimento) · *Mural da gestão* (comunicados,
  scripts e avisos) · *Alertas do dia* (24h em aberto, protocolos alta/urgente e parados +7 dias,
  cada número clicável para a tela filtrada).
- **Comunicado é endereçado, não broadcast:** por unidade e por papel. Quem publica é a gestão
  (`pode_publicar_memo()`).
- **O mural tem MÃO DUPLA (0056).** A matriz publica para qualquer unidade; a franquia tem dois
  destinos e só dois: **minha equipe** e **diretoria/administração** (papéis `admin`/`financeiro`,
  sem unidade). Publicar para a unidade vizinha ou soltar aviso geral continua sendo da matriz — a
  regra vive em `salvar_memo`, não na tela.
- **O AUTOR sempre vê o próprio comunicado (0057)**, marcado com "voce publicou" e o destino ao
  lado. Foi bug real: endereçar a uma unidade (ou a um papel que não é o seu) e publicar de dentro
  da matriz fazia o aviso sumir de todas as telas de quem publicou. Na franquia, a aba *Recebidos*
  filtra o que é `meu` — o que ela mandou tem aba própria.
- **Endereço sem ninguém ativo aparece em vermelho** na tela da gestão (`destinatarios = 0`): é o
  outro jeito de um comunicado não chegar a ninguém, e ele não pode ser silencioso.
- **O mural pessoal é o que foi endereçado a VOCÊ.** A versão 0055 mandava todo memo de toda
  unidade para quem tem acesso global; com nove franquias publicando aviso interno, a diretoria
  abriria o SAC com dezenas de recados que não são dela. Para acompanhar tudo existe a tela da
  gestão (`memos_gestao`), que respeita escopo: a matriz vê tudo, o gestor vê o da unidade dele
  mais o que ele enviou.
- **Ciência de leitura:** `exige_leitura` mantém o comunicado em destaque (fundo âmbar, botão
  "Marcar como lido") até a pessoa dar ciência. A gestão acompanha em Configurações → Comunicados
  ("3 de 12 deram ciência"). Ninguém "desl" — `memo_leituras` não tem update nem delete.
- **Onde se publica:** a matriz em `Configurações → Comunicados`; a franquia em
  `/regional/comunicados` (abas *Recebidos* e *Enviados pela unidade*). **Um formulário só** —
  `<ModalMemo escopo="matriz"|"franquia">` (mesma escolha do `<ModalFornecedor>`/`<ModalVendedor>`);
  no escopo franquia ele mostra os dois destinos em vez do seletor de unidade. Arquivar tira
  do mural e preserva a ciência de quem já leu; `expira_em` faz o aviso sumir sozinho no prazo.
- **O comunicado tem RESPOSTA (0058), e ela é privada por destinatário.** Quem recebe devolve o
  recado no próprio mural (`<ConversaMemo modo="minha">`); quem publicou vê **uma conversa por
  pessoa** e responde dentro de cada uma (`modo="autor"`) — em Configurações → Comunicados, na aba
  *Enviados* da franquia e no próprio mural. Um mural único de respostas faria o recado de uma
  unidade ser lido pelas outras, e aí ninguém responde mais nada. Abrir a conversa **já dá ciência**
  do que o outro lado escreveu: pedir mais um clique só faria o contador mentir.
- **Lógica pura testada:** `src/lib/memos.ts` (`ordenarMemos`, `pendenteCiencia`, `memoVigente`,
  `resumoLeitura`, `destinoDoMemo`, `resumoRespostas`, `ordenarConversas`, e os rótulos `PAPEIS_MEMO`/`PAPEIS_DIRETORIA` — que moram aqui,
  não na tela, porque o mural também precisa escrever o destino) — a ordem do mural é a mesma do `order by` da RPC, dos dois lados.

## Tramitação do evento e PARECERES (0059)
- **Tramitar o evento é transferir o protocolo dele.** O evento ganha (sob demanda) um registro em
  `atendimentos` — `protocolo_do_evento()`, com índice único em `evento_id` — herdando associado,
  veículo e unidade. Assim a transferência cai na **Central de Protocolos** de quem recebeu, e não
  só na linha do tempo do sinistro. Não criar tabela paralela: era o que faltava ligar, não criar.
- **O `historico_protocolo` continua sendo escrito.** É dele que a linha do tempo do evento e o
  Kanban vivem; o protocolo acompanha, não substitui. `acao_realizada` agora distingue
  `TRANSFERENCIA` / `MUDANCA_STATUS` / `PARECER`, e a trilha mostra **para quem** foi.
- **Tramitação vazia é recusada** (sem destino, sem status e sem parecer não há o que registrar), e
  destino inexistente/inativo também. Antes a tela mandava o próprio operador atual como destino e
  o banco aceitava calado — a transferência nunca acontecia.
- **Parecer é pedido COM resposta, não comentário.** `solicitar_parecer(protocolo, usuarios[],
  pergunta)` chama várias pessoas de uma vez (pedido pendente não é duplicado); cada uma responde
  com `responder_parecer`, e é a ligação `protocolo_interacoes.responde_a` que fecha o par. Quem
  responde é **quem foi chamado** — a matriz (`tem_acesso_global`) destrava um parecer parado
  (férias, desligamento) e fica registrado quem escreveu.
- **O que trava o processo dos outros aparece:** bloco *"Esperando o seu parecer"* na Central do
  Atendente (fora de "Meus protocolos" de propósito — ali está o que é MEU, aqui o que depende de
  mim) e selo de pareceres pendentes na fila da Central. Régua em `src/lib/protocolos.ts`
  (`situacaoParecer`, `resumoPareceres`, `ordenarPareceres`, testados): 3 dias cobra, 7 atrasa.
- **`?protocolo=<id>` abre o atendimento direto** na Central (o link já existia e não fazia nada).
- **Telas:** `src/components/sinistros/tramitacao-evento.tsx` (substituiu o card antigo em
  `protocolo-detail.tsx`) e o bloco de pareceres em `central-atendente.tsx`.

## FICHA DO VEÍCULO: O QUE O PLANO COBRE (0120)
Pedido do usuário (18/10/2026): o atendente não pode ter de ir consultar os planos — a ficha mostra as
coberturas ABERTAS, sem clique para expandir.
- **Um componente para os dois lugares:** `<CoberturasDetalhadas>` (`src/components/veiculos/coberturas-veiculo.tsx`)
  no SAC (com o botão *Alterar opcionais*) e na aba Dados de `/veiculos/[id]`. Hook `useCoberturasVeiculo`
  (`src/hooks/use-coberturas.ts`, chave sob `['veiculo', id]`, então salvar opcionais/veículo recarrega).
- **O que mostra:** nome do plano + `descricao_comercial`; **participação em evento** (`calcular_participacao_veiculo`);
  as coberturas AGRUPADAS (casco · terceiros · vidros · assistência · carro reserva · vida · rastreamento · outros) com
  o texto de `produtos.descricao_cobertura`, o limite ("2 usos a cada 12 meses · 1 usado") e DISPONÍVEL/LIMITE ATINGIDO;
  opcionais com o selo e o valor; e **"Não inclui"**, só com grupos que a casa VENDE para o tipo do veículo (produto
  ativo que atende o tipo, 0089) — e o casco quando o plano é `sem_casco`.
- **O texto não é inventado:** sai de Configurações → Produtos, campo *O que cobre*. Sem texto, a cobertura aparece só
  com o nome e a ficha avisa onde cadastrar. Em 18/10 NENHUM produto tinha texto — cadastrar os principais.
- **Grupo:** pela categoria (CASCO, RCF, VIDROS, RASTREADOR; ADMIN não é cobertura); BENEFICIO pelo nome. Regras puras
  em `src/lib/coberturas.ts` (testadas). Produto novo de BENEFICIO com nome fora do padrão cai em "Outros benefícios".

## SAC — selo de adimplência com as duas fontes (22/10/2026, sem migration)
- **O defeito (caso JARDEL SILVA DO NASCIMENTO):** o selo "Adimplente" do cabeçalho do SAC e o "Inadimplente" da lista
  de veículos liam SÓ `titulos_financeiros`; a carteira migrada não tem título no SCar, então quem tinha boleto do Mutual
  vencido aparecia ADIMPLENTE enquanto o Histórico Financeiro (que já lia as duas fontes, 0099) mostrava o atraso.
  Medido em 22/10: **871 associados** com boleto do Mutual vencido estavam nessa situação.
- **Correção:** `/api/v1/sac/visao-360` soma `boletos_mutual_do_cliente` (respeita o corte da cobrança) ao resumo e à
  inadimplência por veículo, convertidos por `boletoMutualComoTitulo` (`src/lib/sac.ts`, testada). **Tela nova que diz
  se o associado está em dia: leia as DUAS fontes** — mesma regra do histórico.

## SAC — coberturas e opcionais (15/10/2026, sem migration)
- **A ficha do veículo no SAC mostra só duas listas:** *Coberturas do plano* (o que o `cotar_plano`
  dá: base + combo) e *Opcionais contratados* (`veiculo_produtos`) — a Taxa Administrativa (categoria
  `ADMIN`) é taxa, não cobertura, e saiu. Regra pura `coberturasDoVeiculo` (`src/lib/produtos.ts`); a
  rota `/api/v1/sac/veiculo` anexa a `categoria` de cada item (a RPC `opcionais_veiculo` não devolve).
  Valor por item só no opcional (o do plano já está dentro da mensalidade).
- **"Alterar opcionais" no próprio SAC** (`<ModalOpcionaisVeiculo>`, `src/components/sac/opcionais-veiculo.tsx`):
  oferece `opcionaisOferecidos` — ativo, não obrigatório, **que atende o tipo do veículo (0089)**, fora
  do plano e sem o rastreador opcional quando a regra do tipo já cobra (0090); o já contratado fica
  marcado mesmo fora do tipo. Salva só o diff em `veiculo_produtos` (`useSalvarOpcionaisVeiculo`) e
  mostra a mensalidade recalculada; regrava `valor_mensalidade` só se havia valor gravado e ele estava
  em dia com o motor (`podeSincronizarMensalidade`); com `cobranca_externa` nunca regrava (avisa que o
  valor é do Mutual). **O filtro por tipo depende do cadastro** em Configurações → Produtos: produto
  sem tipo marcado vale para TODOS (em 15/10, "Protecao Parabrisas" e "MOTOCICLETA - TERCEIROS ATÉ
  R$ 20.000,00" estavam assim).

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

## Busca da Lista de vendas — acento e máscara (0079)
- **O defeito não era "o acento não funciona": era a Lista e o Kanban darem RESPOSTAS
  DIFERENTES.** As duas filtram de formas distintas de propósito (a Lista no banco, porque não
  carrega tudo; o Kanban em JS, para responder a cada tecla) — mas isso vazava para o resultado:
  digitando "joao" o Kanban achava "JOÃO" e a Lista não, porque `ilike` compara byte a byte. Quem
  procura o associado não tem como saber que a resposta depende da aba aberta.
- **🔴 E O ACENTO ERA A METADE MENOR.** A mesma consulta procurava telefone e CPF por **dígitos**
  (`celular.ilike.*65999998888*`), mas `leads.celular` nem sempre está em dígitos: a captura grava
  limpo (`replace(/\D/g,'')`) e o **`<FechamentoVenda>` grava MASCARADO** (`maskCelular`, e o
  telefone copiado do cadastro do associado vem como está lá). Nesses leads a busca por telefone
  não achava **nada** — e é o campo que o atendente usa com o cliente na linha.
- **A correção é a mesma para os dois: normalizar a COLUNA, não só o termo.** Duas colunas
  **geradas** (`generated always as … stored`) em `leads`:
  `busca_texto` (nome + marca + modelo + placa, minúsculo e sem acento) e
  `busca_digitos` (celular + cpf_cnpj, só dígito). Elas **não podem sair de sincronia** porque
  ninguém as escreve — o Postgres recalcula a cada gravação. O oposto de um cache que a aplicação
  precisa lembrar de atualizar.
- **Por que coluna gerada e não uma RPC de busca:** manter a consulta como
  `from('leads').select('*')` preserva a **RLS de `leads` (0038)** — o `consultor_vendas` continua
  vendo só a própria carteira sem que nada disso seja reimplementado dentro de um `security
  definer`. Busca que vira RPC vira também uma segunda cópia da regra de visibilidade.
- **⚠️ `unaccent` do contrib é STABLE, e coluna gerada exige IMMUTABLE.** Daí o embrulho
  `texto_sem_acento(text)`, no padrão documentado: usa a forma de **dois argumentos**
  (`'public.unaccent'::regdictionary`), que fixa o dicionário em vez de deixá-lo depender do
  `search_path`. A de um argumento **não serve**. A ressalva real é pequena: se o arquivo de
  dicionário do servidor mudasse, o já gravado não seria recalculado — e ele não muda.
- **A MARCA passou a ser procurável na Lista.** Ela procurava nome/modelo/placa e ignorava marca,
  então "Fiat" achava no Kanban e não na Lista. Juntar tudo em `busca_texto` alinhou o escopo.
- **Índice é GIN/trigrama** (`pg_trgm`), porque a busca é por pedaço (`%termo%`) e btree não serve
  com curinga na frente. Ele **vale a partir de 3 caracteres**; com 2 o planejador cai em
  varredura — e o piso de 2 da tela **fica**, porque recusar 2 caracteres seria trocar uma consulta
  lenta por nenhuma resposta.
- **A placa digitada com separador continua casando:** "ABC-1D23" vira `abc1d23` e entra como
  condição alternativa, mas **só quando difere** do termo — senão a mesma condição iria duas vezes.
- **🔴 O EFEITO COLATERAL QUE QUASE PASSOU: coluna gerada RECUSA escrita, e o
  `<FechamentoVenda>` reenvia a ficha inteira** (`{ id: lead.id, ...form }`, e o form nasce do lead
  recém-lido, que agora traz as duas colunas). Sem limpeza, "Salvar ficha" quebraria — por uma
  coluna que a tela nem sabe que existe. A regra virou `camposGravaveisDoLead()`
  (`src/lib/crm.ts`, testada), usada pelos **dois** hooks que gravam lead. **Ao adicionar coluna
  gerada numa tabela que a UI reenvia inteira, o filtro de escrita faz parte da entrega.**
- **Lógica pura testada:** `semAcento`, `filtroBuscaLeads`, `leadCasaComBusca` e
  `camposGravaveisDoLead` (`src/lib/crm.ts`) — os dois lados usam `semAcento`, então **mexeu num,
  mexa no outro**. Suíte de banco em `supabase/tests/0079_*.test.sql`.

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

## Dashboard executivo das Regionais (0078) — `/regionais`
- **Por que existe:** o `/regional` (0036) é a operação de UMA franquia — a matriz entra nela, uma
  por vez, e isso é de propósito. Faltava a leitura de CIMA: quantas unidades existem, qual cresce,
  qual perde carteira e **qual gasta com evento mais do que arrecada**. Painel consolidado é o
  oposto de "entrar numa unidade", então ele mora no sistema da matriz, não dentro do portal.
- **O menu deixou de ser um link só.** "Portal da Franquia" virou o grupo **Regionais** com
  **Dashboard** (`/regionais`) e **Acesso as Regionais** (`/regional`) — eram duas coisas
  diferentes no mesmo item. O grupo nasce ABERTO quando a pessoa está dentro dele; `NavGrupo`/
  `NavLink`/`Nav` vivem em **escopo de módulo** em `sidebar.tsx`, não dentro do `Sidebar`:
  componente redefinido a cada render é um TIPO novo, e o React remonta a subárvore — o grupo se
  fecharia sozinho a cada re-render.
- **Onde:** `src/app/(dashboard)/regionais/page.tsx` + `src/components/regionais/painel-regionais.tsx`;
  hooks em `src/hooks/use-regionais-painel.ts`; régua pura (testada) em `src/lib/regionais.ts`.
- **Filtros:** período com atalhos **Últimos 7 dias · Últimos 30 dias · Mês atual · Ano atual**
  (padrão: **últimos 30 dias**, que inclui hoje — 29 dias para trás, senão o período teria 31 dias
  e a comparação com o anterior, que o banco monta do mesmo tamanho, ficaria torta) + **unidade** +
  a **engrenagem do plano de contas**. Período invertido não consulta: a tela avisa.
- **Os indicadores, em dois blocos:** *frota* (ativos com variação, inadimplentes com % da
  carteira, cancelados = churn com variação, em evento) e *financeiro* (carteira ativa, recebido
  com variação, inadimplente, a receber, gasto em eventos com variação).
- **O que é do PERÍODO e o que é POSICIONAL** — mesma convenção do `financeiro_resumo`: recebido,
  gasto, churn e novos são do período; **inadimplência e a receber são retrato de hoje**, porque
  dinheiro em atraso não tem período. Está escrito no próprio cartão.
- **A seta de tendência sabe o que é bom.** Carteira subindo é verde; churn, inadimplência e gasto
  com evento subindo são vermelhos (`direcaoVariacao`). E sem período anterior para comparar ela
  diz **"sem base de comparação"** em vez de inventar "+100%".
- **Gráficos:** *frota no período* (área de ativos + linha de inadimplentes + linha de sinistros no
  eixo da direita) e *recebido × gasto em eventos* (barras + linha de resultado). A granularidade é
  do banco (dia/semana/mês pelo tamanho do período), não da tela.
- **Comparativo por regional:** ranking de barras onde a **cor é o risco** (não a unidade) +
  tabela ordenável por qualquer coluna, com CSV. Em *resultado* o **pior vem primeiro** — quem olha
  ranking quer o extremo que precisa de decisão no topo.
- **Risco da unidade** (`riscoRegional`, testado) é a **pior** de duas réguas: sinistralidade acima
  de 100% (gasta com evento mais do que arrecada) ou inadimplência acima de 25% da carteira;
  atenção a partir de 0,7 / 15%. **Unidade sem carteira não é "saudável": é `sem_dados`** — verde
  numa unidade vazia manda a gestão olhar para o lado errado.
- **O rodapé soma o TOTAL, não a média dos percentuais** (`totaisComparativo`): média de percentual
  dá o mesmo peso a uma unidade de 12 veículos e a uma de 3.000.
- **Fonte dos números (se um estiver errado, o erro está no dado, não no painel):** carteira = o
  `valor_mensalidade` da ficha e, na falta dele, o que o ÚLTIMO título cobrou (não chamamos
  `cotar_plano` por veículo — o painel varre a carteira inteira); recebido = `dre_movimentos` em
  regime de CAIXA; **gasto em eventos = a BAIXA** do título ligado a um evento ou ao centro de custo
  `ASSIST24` (guincho) — nota fiscal não entra para não contar duas vezes o que virou título, mesma
  regra do `dre_movimentos`.
- **A engrenagem do plano de contas é institucional**, não do navegador: vive em `empresa`
  (`painel_conta_de`/`painel_conta_ate`), só admin/financeiro alteram, e mudar o recorte invalida
  `['regionais','painel']` inteiro. As RPCs caem no que está salvo quando o parâmetro vem nulo —
  então a tela **não envia** o recorte, e o número é o mesmo para todos.
- **Isolamento:** gestor de unidade pedindo outra recebe a própria (`escopo_regional`), e no ranking
  vê só a própria linha. Há teste cobrindo os dois casos e o do não-staff (painel zerado).

## Visão Geral do /dashboard (0100) — a primeira aba do Painel
- **Por que foi refeita:** a versão do início do projeto contava TÍTULO de mensalidade ("MRR",
  inadimplência = vencidos/títulos do mês) numa base em que **2.889 de 2.898 veículos são cobrados
  pelo Mutual** (`cobranca_externa`) — o MRR dava ~zero com a carteira inteira contratada. Lia as
  tabelas pelo navegador em 4 consultas soltas.
- **Agora são DUAS leituras:** `painel_visao_geral` (jsonb, `useVisaoGeral`) para a operação, e
  **`cobranca_serie_mensal` (0097, `useCobrancaSerie`) para as mensalidades** — ela já junta o SCar e o
  histórico de boletos do Mutual. **Não criar segunda leitura de mensalidade no painel**: divergiria
  do módulo de cobrança.
- **Blocos, na ordem da tela:** 6 KPIs (veículos na base com variação no mês, associados, carteira
  mensal + ticket médio, adesões no mês **com projeção pelo ritmo** — comparar 13 dias com o mês
  anterior inteiro sempre "cai" —, saídas/churn, protocolos) · faixa da **cobrança externa** ·
  **distribuição nacional** (rosca por unidade com carteira R$ + barras por UF do associado) ·
  **evolução 6/12 meses** (adesões × saídas e base no fim de cada mês — dois gráficos, nunca eixo
  duplo) · **composição** (rosca por tipo, barras por plano, barra de situação) · **eventos + 24h +
  rastreadores** · **comercial** (funil na ordem da esteira) · **financeiro** (emitido/recebido no
  mês, inadimplência em VALOR dos meses fechados — ponderada, nunca média de % —, a pagar 7 dias, e o
  gráfico emitido × recebido com a inadimplência de cada mês embaixo).
- **Notas que a tela escreve, de propósito:** a carteira migrada traz a ativação original, mas os
  encerrados antes da migração não vieram (saídas antigas zeradas); eventos e acionamentos são só os
  do SCar.
- **Cor:** paleta categórica validada (CVD/contraste) nos dois temas, em `src/lib/visao-geral.ts`;
  a cor segue a **entidade** (ordem alfabética), nunca a posição no ranking; toda fatia tem nome,
  valor e % escritos na legenda.
- **Unidade:** só admin/financeiro escolhem; o gestor recebe a própria (`escopo_regional`), e quem
  não é staff recebe NULL.
- **Lógica pura testada:** `src/lib/visao-geral.ts` — `coresPorEntidade`, `fatiasComOutros`,
  `rotuloMesCurto`, `variacaoRelativa`, `crescimentoLiquido`, `taxaChurn`, `projecaoDoMes`,
  `funilOrdenado`, `eventosPorEtapa`, `inadimplenciaDoMes`, `inadimplenciaDoPeriodo`, `recebidoDoMes`.
- `kpi-cards.tsx`, `useDashboardKpis` e `useReceitaSerie` **saíram** (só a Visão Geral os usava).

## HISTÓRICO DE EVENTOS DO MUTUAL (0101) — "capturei 2.909 eventos e não vejo nenhum"
- **Por que não aparecia:** a carga (0084) deixou evento de fora por decisão, e a segunda metade
  nunca foi feita. Os 2.909 estavam em `mutual_captura` e em lugar nenhum da operação.
- **A ligação com o veículo é `evento.vehicle_id` = `objeto.vehicle_id`** — NÃO o id do objeto (casa
  1.848 de 2.909 por acaso; pelo `vehicle_id` casa 2.901). O mesmo carro pode ter estado em mais de
  um contrato: vence o objeto do `contract_id` do evento. *Lição de sempre: a chave certa estava na
  entidade, com outro nome; conferir antes de concluir.*
- **Quem entra:** evento de associado JÁ CARREGADO (vínculo PERSON) — 827 de 2.909 em 13/10/2026 —
  ou de veículo na base cujo associado do evento não tem vínculo (carro transferido: fica com o dono
  atual). O resto (acervo encerrado) fica de fora, contado — mesma regra dos boletos (0097).
  Evento de carro antigo do associado (fora da base) entra sem `veiculo_id`, com a placa do objeto.
- **🔴 TABELA PRÓPRIA, NUNCA `eventos_sinistro`.** O `event_status` vem **"ANDAMENTO" em 2.909 de
  2.909** e só 38 têm `conclusion_date`: o status da listagem não informa nada. Na tabela operacional
  cada linha viraria evento EM ABERTO (Kanban, tramitação, painel, status `em_evento`). A tela nunca
  repete esse status como situação: mostra **"Concluído em X"** quando há data de conclusão, senão
  **"Sem encerramento registrado"** (`situacaoHistorico`).
- **Onde aparece:** aba **Eventos do SAC** (selo "Mutual", só consulta, sem "Gerenciar"), o marcador
  de evento na lista de veículos do SAC (`veiculos_do_cliente`), **`/sinistros?aba=historico`**
  (busca por associado/placa/CPF/protocolo, tipo e período, paginada no banco) e a **Visão Geral**
  (eventos no mês e em 12 meses somando as duas fontes, série empilhada SCar × Mutual, tipos dos
  últimos 12 meses com `somarPorTipo`, que casa "COLISÃO" e "Colisao").
- **Importar:** `/integracao/mutual` → *Histórico de eventos* → *Simular* / *Importar*. Re-executável
  (regra 0096: só regrava o que mudou). **Desde 23/10/2026 a rotina diária faz isso sozinha**
  (`/api/v1/mutual/sincronizar`: captura EVENT depois do CONTRACT_OBJECT e importa o histórico depois
  das cargas). O defeito: a importação rodou UMA vez (13/10) e nada a repetia — eventos abertos depois
  e associados carregados depois (acervo de RP em 14/10, 0 km em 21/10) ficaram fora: **502 eventos**
  (MATHEUS CAMPOS OLIVEIRA, LUIS CARLOS ALVES, ROBERTO CARLOS VIEIRA RIOS, PEDRO HENRIQUE APARECIDO
  PEREIRA, ANDRE LUIS DE AQUINO…). Reimportado pelo agente (autorizado) em 23/10: 558 gravados, histórico
  com 1.331 eventos.
- **✅ DECISÃO DO USUÁRIO (13/10/2026): o histórico NÃO consome cota.** Os limites por janela dos
  opcionais (parabrisa 1×/ano etc., `opcionais_elegibilidade`/`opcionais_veiculo`) contam só
  `eventos_sinistro` — *"não conte os eventos de parabrisa, vamos contar daqui pra frente"*. Há 525
  eventos de parabrisa no histórico do Mutual; eles NÃO entram nessa conta. Não mudar sem o usuário.
- **Lógica pura testada:** `src/lib/eventos-historico.ts` (`situacaoHistorico`, `rotuloTipos`,
  `rotuloEnvolvimento`) e `somarPorTipo` em `src/lib/visao-geral.ts`. Suíte `supabase/tests/0101_*`.

## Painel gerencial da Assistência 24h (0061) — a aba da Visão Geral
- **Por que existe:** a `0026` resolveu a OPERAÇÃO (abrir, cotar, autorizar OS, pagar o prestador).
  Faltava a leitura de GESTÃO. Assistência é a maior saída de caixa da proteção veicular e ninguém
  enxergava **quanto consome, por quê e onde**.
- **Onde fica:** `/dashboard` tem 2 abas — **Visão Geral** e **Assistência 24h**.
  Componente: `src/components/dashboard/assistencia-24h.tsx`. A aba tem link para `/assistencia`
  (a operação) — painel é leitura, ação continua lá.
- **Fonte é a OS, não um cadastro novo:** o custo é o `valor_total` que **já virou título no Contas
  a Pagar**, não estimativa digitada; a praça sai do `origem` jsonb que a tela de trajeto preenche.
  Nenhuma captura foi criada para o painel — se um número está errado, o erro está na OS.
- **Regra de ouro:** `assist_painel_movimentos()` é a fonte única. **CANCELADO nunca entra**
  (não consumiu cota nem gerou título) e a praça cai no endereço do associado quando a OS não tem
  origem — só vira "NAO INFORMADO" se nem isso existir.
- **O painel:** período (presets do Financeiro) + unidade · 6 indicadores (acionamentos com
  hoje/média diária, custo, **custo por veículo ativo** — o número que vira preço —, índice de
  acionamento, tempo médio HH:MM, reincidentes) · faixa da frota (Ativos/Inativos/Bloqueados) ·
  **serviço acionado** (barras ranqueadas; fica **vermelho** quando há veículo no teto do limite
  contratado) · **onde acontece** (a barra é a TAXA sobre a frota da praça: 30 acionamentos em 200
  veículos é problema, em 3.000 é ruído) · custo em 12 meses com variação · reincidência. CSV em
  cada bloco.
- **Lógica pura testada:** `src/lib/assistencia.ts` — `agruparSituacao`, `fatiasPorServico`,
  `lerPracas` (a leitura de risco por taxa), `formatarHoras`, `variacao`, `compararUltimosMeses`.
- **Paleta:** um acento só (`#139AD6`) + status (`#12A150`/`#64748B`/`#E5484D`), validada para
  daltonismo e contraste **nos dois temas**; toda barra e faixa carrega rótulo visível — identidade
  nunca depende da cor. Os gráficos usam hex fixo, como os demais do sistema.

## PEDIDO NEGADO E EXCLUSÃO NA 24H (0134)
Pedido do usuário (21/10/2026): registrar o pedido negado (ex.: limite atingido) para controlar quantas vezes o
mesmo veículo aciona, e poder excluir acionamento lançado por engano.
- **O buraco:** `abrir_acionamento` RECUSAVA o veículo bloqueado e nada era gravado — quem ligava cinco vezes
  depois de estourar o limite não deixava rastro.
- **NEGADO é status FINAL** (`status_acionamento`), com motivo do vocabulário fixo (CHECK = `MOTIVOS_NEGATIVA` em
  `src/lib/assistencia.ts`): limite atingido, inadimplência, veículo inativo, pendência cadastral, sem cobertura,
  fora da área, outro (exige descrição). Grava a foto dos bloqueios do momento em `bloqueio_motivos`.
- **Dois caminhos:** *Registrar pedido negado* no quadro do veículo (ou *Registrar como negado* no modal
  bloqueado, com o motivo já sugerido por `motivoNegativaSugerido`) → `registrar_acionamento_negado`, sem alçada
  (negar não gasta nada); e *Negar atendimento* na OS ainda sem OS gerada (ABERTO/EM_COTACAO) → `negar_acionamento`.
  Com OS gerada o caminho é Cancelar.
- **Não consome o limite, não gera título, não entra no volume/custo dos painéis** (`assist_painel_movimentos`,
  `painel_visao_geral`). É contado à parte: `elegibilidade_assistencia.negados` (na janela do serviço — selo
  "N negados em 12 meses" no cartão do serviço) e o motivo no histórico do veículo. Imutável (trigger).
- **Excluir** (`excluir_acionamento`): permissão própria `assistencia.excluir` (seed: financeiro; admin sempre;
  outros por extra). Recusa título com pagamento (estorne antes); título em aberto da OS sai junto. **Desde a 0135
  a OS CONCLUÍDA sem pagamento também se exclui** — medido em 21/10: os 36 acionamentos estavam CONCLUIDO (31) ou
  CANCELADO (5), e 22 dos 31 concluídos em menos de 10 min (a equipe abre e conclui na hora).
- **A OS CONCLUÍDA segue editável na tela** (`acionamentoEditavel`: só CANCELADO e NEGADO são definitivos):
  Editar atendimento, Mudar local/destino, Valores da OS, Trocar prestador e Cancelar. O banco sempre aceitou
  (as RPCs só recusam CANCELADO); a tela é que escondia tudo — era o "não acho onde editar". Título pago não
  muda e a diferença fica na trilha (0027). Foto completa em `acionamento_exclusoes`; os arquivos saem do storage pela tela. DELETE
  direto na tabela é recusado (policy RESTRICTIVE): só a RPC apaga. Excluir devolve a cota; por isso a tela orienta
  a usar Negar/Cancelar quando o pedido foi real.
- **Não feito:** tela que lista a trilha de exclusões; bloco de negados por motivo no painel gerencial da 24h.

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
- **Anexos da OS (0048):** card **"Fotos e documentos"** — foto do veículo, foto do local,
  documento e comprovante, com **miniatura** e visor em tela cheia (PDF vira linha com "Abrir").
  Escolhe-se o **tipo antes do arquivo**: é ele que diz para que a foto serve. A imagem é reduzida
  no navegador pela mesma regra da vistoria (`src/lib/imagem.ts`) e o teto de 10 MB é do banco.
  Bucket privado `assistencia`, caminho `{acionamento_id}/…` — a policy de storage confere o
  acesso pelo prefixo, então arquivo não vaza para quem não vê a OS.
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
- **Quem é cobrado:** `veiculo_faturavel` = status `ativo`/`em_evento`/`vistoria_pendente`/
  **`inadimplente`** (0072 — ele ainda tem contrato, só perdeu os benefícios) **e**
  `data_ativacao <= fim do mês`. Suspenso/inativo/baixado/excluído não geram mensalidade.
- **Idempotência:** rodar o lote de novo na mesma competência não recria nem altera fatura existente
  (histórico imutável; trocar Agrupado↔Individual só afeta competências futuras).
- **UI:** `/financeiro` → aba **Cobranças** (competência/regional/status, KPIs, "Gerar cobranças",
  "Emitir títulos", expandir itens da agrupada, cancelar). Hook `use-cobrancas.ts`; lógica pura
  espelhada em `src/lib/cobranca.ts` (com testes).

## Financeiro e DRE (0032) — arquitetura
- **Centros de custo: `Configurações → Centros de Custo` (16/10/2026, sem migration).** Tabela `centros_custo`
  (0012) não tinha tela — só se escolhia. Agora: criar/editar/inativar com a contagem de lançamentos;
  **excluir só sem lançamento** (FK `on delete set null` apagaria a classificação em silêncio) e o
  **ASSIST24 fica travado** (código e exclusão: `centro_custo_assistencia()` acha pelo código e criaria
  outro). Lançamento novo oferece só os ativos + o já escolhido. Regra pura em `src/lib/centros-custo.ts`.
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

## Tema claro / escuro — arquitetura
- **A cor do sistema mora em `src/app/globals.css`**, como tokens CSS em tripla `R G B`
  (`--slate-500: 65 77 97`). O `tailwind.config.ts` os consome via
  `rgb(var(--slate-500) / <alpha-value>)`, e é o `<alpha-value>` que mantém funcionando os
  modificadores de opacidade que o código já usa (`bg-black/50`, `text-white/70`).
- **O tema escuro não repinta tela por tela: ele troca o VALOR dos mesmos tokens.** Por isso as
  ~800 classes de cor que já existiam viraram tema escuro **sem alterar os call sites**.
  `text-slate-500` continua sendo "texto secundário" nos dois temas — cinza escuro no claro,
  cinza claro no escuro. **A escala inteira inverte de papel:** `50..300` (fundo sutil e borda)
  viram superfícies escuras; `400..900` (texto, do apoio ao título) viram texto claro. O mesmo
  vale para `brand`.
- **O que NÃO inverte** (leva texto branco nos dois temas, então tem token próprio):
  `bg-acao`/`hover:bg-acao-escura` (botão primário — era `bg-brand-600`/`hover:bg-brand-700`) e
  `bg-faixa` (a faixa navy das páginas públicas e do topo do portal — era `bg-brand-700`).
  **Não use `bg-brand-600` para botão nem `bg-brand-700` para faixa**: no escuro eles clareiam e
  o texto branco some.
- **`bg-white` virou `bg-superficie`** (o card) e `bg-[#eef2f8]` virou `bg-fundo` (o ground).
  `bg-white` ficou reservado a quem precisa de branco DE VERDADE — a placa da logo e os **véus
  translúcidos sobre navy** (`bg-white/5`, `bg-white/10`: o hover do menu, o cartão da unidade na
  cabine). Trocar esses por `bg-superficie/5` apaga o realce no tema escuro.
- **REGRA DE OURO — sobre fundo que NÃO inverte, o texto também não pode inverter.** Em cima da
  cabine, da `bg-faixa` e do acento `bg-cyan-500`, use **`text-white/NN`** (55 discreto · 80 item
  de menu · 100 ativo) ou **`text-navy`** quando o fundo é claro-fixo como o ciano. **Nunca a
  escala `slate` nem `brand` ali:** elas invertem, e foi assim que o menu da sidebar caiu para
  **2.07** de contraste no tema escuro (`text-slate-300`, que no claro é cinza-claro e no escuro
  virou borda azul-escura). Com `text-white/80` dá 9.47 no claro e 11.50 no escuro.
- **A logo tem tinta escura**, inclusive a do cliente (`logo_url`), de quem não sabemos a cor:
  `<LogoSmartCar>` põe sozinha uma **placa clara no tema escuro**. Passe `placaNoEscuro={false}`
  só quando ela já estiver dentro de uma placa (é o caso do `LogoNaCabine`).
- **Campo de formulário tem cor na base do CSS** (`@layer base` para `input/select/textarea`):
  sem isso, campo sem `bg-` próprio herda o estilo nativo, e com `color-scheme: dark` o Chrome o
  pinta de um cinza amarronzado fora da paleta. Como boa parte dos campos nunca declarou fundo
  (não precisava no tema claro), a correção certa foi na base, não campo a campo.
- **Overlay de modal usa `bg-black/50`, nunca `bg-slate-900/50`** — a escala inverte e a cortina
  ficaria clara.
- **Estado e persistência:** `src/lib/tema.ts` (puro, testado) + `use-tema.ts` + `<ThemeToggle>`.
  São **três** estados, não dois: `claro`, `escuro` e `sistema`. Quem nunca escolheu segue o
  `prefers-color-scheme`; quem clicou tem a escolha gravada no `localStorage` (`scar:tema`) e ela
  vence o sistema. O botão alterna só entre claro e escuro — um ciclo de três deixaria o usuário
  perdido.
- **O `SCRIPT_TEMA_INICIAL` roda no `<head>`, antes da primeira pintura.** Sem ele a tela nasce
  clara e pisca para escura ao hidratar. Por isso o `<html>` tem `suppressHydrationWarning`: o
  script escreve a classe `dark` antes do React, e sem isso o React acusaria diferença.
- **O padrão do produto é o CLARO** — é sistema de trabalho, usado o dia inteiro, e a marca foi
  desenhada no claro.
- **Ao criar tela nova:** use os tokens (`bg-superficie`, `bg-fundo`, `text-slate-*`, `bg-acao`)
  e **não escreva hex cru** — é o mesmo cuidado que o white-label vai exigir.

## Fechar pelo fundo: o gesto, não o clique (o bug da seleção de texto)
- **O sintoma, relatado em produção:** num cadastro longo, selecionar o texto de um campo com o
  mouse e **soltar o botão fora do modal** fechava tudo, sem salvar, com a ficha inteira
  preenchida. Acontecia em qualquer formulário do sistema.
- **🔴 A CAUSA NÃO ERA UM `onClick` NO LUGAR ERRADO — era o modelo de evento.** O navegador
  dispara o `click` no **ancestral comum** do `mousedown` e do `mouseup`. Quando a seleção começa
  no campo e termina no fundo, esse ancestral **é o próprio fundo**: o evento nasce ali, então o
  `stopPropagation()` do conteúdo nunca roda — ele não é ignorado, ele não é nem visitado.
  Por isso "fechar quando o clique for no fundo" está errado por construção.
- **A regra certa é sobre o GESTO:** só fecha quando o botão **desceu no fundo E subiu no fundo**.
  Arrastar de dentro para fora (selecionar texto) e de fora para dentro deixam de fechar.
- **Não olhe só o fim do gesto.** Numa seleção, o `mouseup` pode ser entregue ao fundo (o cursor
  está lá) **ou** ao campo de origem (quando o navegador captura o ponteiro) — os dois casos
  existem no mundo real e os dois têm de não fechar. Exigir também o **início** cobre os dois.
- **Onde mora:** `deveFecharPeloFundo` (`src/lib/overlay.ts`, com os quatro gestos em teste) +
  `useFecharNoFundo` (`src/hooks/use-fechar-no-fundo.ts`), que devolve as props para espalhar no
  elemento de fundo. **Overlay novo usa o hook e NUNCA `onClick={onClose}` no fundo.**
  Usa eventos de **ponteiro**, então vale para mouse, toque e caneta de uma vez.
- **Aplicado em três lugares**, que é o sistema inteiro: `<Modal>` (`src/components/ui/modal.tsx`
  — 77 usos em 33 arquivos, todo cadastro do sistema), o painel de 2ª via do **portal do associado**
  (`portal/(associado)/financeiro`) e o `<VisorImagens>`. **O drawer do menu no celular já era
  imune** e não foi tocado: o fundo dele é um elemento IRMÃO do painel, então o ancestral comum do
  arrasto é o invólucro, que não tem handler.
- **⚠️ O `stopPropagation()` do conteúdo FICA, e não é ele que conserta isto.** Ele existe por
  outro motivo: o modal é renderizado **dentro da árvore da página**, então sem ele um clique no
  formulário borbulharia até um ancestral clicável (uma linha de tabela, um cartão).
- **O `Esc` continua fechando**, que é o comportamento esperado de um modal. Se um dia isso também
  custar um cadastro, o caminho é o `<Modal>` saber que o formulário está sujo e pedir confirmação
  — mudança maior, em todos os formulários, e não foi feita.

## Largura das telas e dos modais (responsivo de verdade)
- **O sistema é responsivo para o celular, mas no PC ele tem de USAR a largura.** O erro clássico
  aqui foi o contrário dos dois: o modal nascia com 512px (`max-w-lg`) no desktop e as grades de
  campo eram FIXAS (`grid-cols-4`), então o PC ficava com uma coluna estreita e o celular com
  quatro colunas espremidas. Corrigir só a largura resolve metade.
- **`<Modal tamanho>` escolhe pelo TAMANHO DO FORMULÁRIO, não pelo gosto:** `md` (512px, padrão)
  para confirmação/aviso e até ~5 campos; `lg` (768px) para cadastro de 6 a 11 campos; `xl`
  (1024px) para ficha longa (12+ campos ou várias seções) — veículo, associado, fornecedor,
  empresa, painel da 24h, lançamento financeiro. Modal curto em `xl` fica vazio: é o problema
  oposto, não uma melhoria.
- **Toda grade de campo é responsiva:** `grid-cols-1 sm:grid-cols-2/3` para linhas de 2–3 campos e
  `grid-cols-2 sm:grid-cols-4` para linhas de 4 (no celular 2 colunas ainda são legíveis). Lista de
  checkbox (`gap-1`) vai a `grid-cols-2 sm:grid-cols-3`.
- **`col-span-N` tem de acompanhar a grade.** `col-span-3` dentro de uma grade que virou de 1 ou 2
  colunas no celular **cria coluna implícita e estoura a largura** — o campo vaza para fora do
  modal. Use `col-span-2 sm:col-span-3` (ou `sm:col-span-2`), nunca o `col-span` cru.
- **Não é tudo que deve alargar:** `Configurações → Tipos de Veículo` e `Tipos de Evento` são
  listas de um campo só e continuam em `max-w-xl` de propósito — um input sozinho com 1400px é
  pior, não melhor. O layout do dashboard (`(dashboard)/layout.tsx`) não tem teto de largura: a
  tabela usa a tela inteira, então o que precisa de ajuste é o modal, não o shell.

## Convenção de CAIXA ALTA nos formulários
- **Cadastro se escreve em MAIÚSCULAS.** É o que impede a mesma pessoa de virar "Joao da Silva",
  "JOAO DA SILVA" e "joao da silva" em três telas. A regra vale para o sistema inteiro.
- **A transformação é no VALOR, não no CSS.** `text-transform: uppercase` só pinta a tela e
  continuaria gravando no banco o texto bagunçado — que é justamente o problema.
- **Quem decide é `src/lib/texto.ts`** (`valorComCaixaPadrao`, testado): olha o `type` e o `name`
  do próprio campo, então a tela não precisa marcar nada. **Preservam a caixa:** e-mail, senha,
  URL, **chave PIX** (a aleatória é UUID e a de e-mail é um e-mail — caixa alta faz o pagamento
  deixar de casar com o cadastro do banco), token/segredo, e todo input não-textual (number, date,
  checkbox…). Para forçar a exceção numa tela: `<Input caixa="original">`.
- **O ponto de aplicação é o `<Input>` de `@/components/ui/field`** — 78% dos campos do sistema
  passam por ele. Campo cru (`<input>`) numa tela específica precisa chamar `valorComCaixaPadrao`
  na mão, como faz o `Entrada` do `/portal/perfil`.
- **O que vem de fora também entra padronizado:** o retorno do ViaCEP passa por `paraCaixaAlta`
  antes de preencher o endereço, senão o endereço buscado sairia diferente do digitado.
- **Textarea NÃO é transformado** (observação, justificativa, parecer): é texto corrido para
  leitura humana, não campo de cadastro — caixa alta ali atrapalha em vez de padronizar.

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

## Precificação — o componente FORA do tipo (28/10/2026, sem migration)
- **O caso:** a tabela de Moto não tinha coluna de Casco nem na tela nem no modelo — o produto
  "Protecao Casco (RFC)" estava marcado só para Passeio/Pick-up/Diesel/Caminhão (0089), então o
  editor e o importador (que só mostram FAIXA_FIPE obrigatório que atende o tipo) o escondiam calados,
  e a coluna "Casco" da planilha do usuário seria só "ignorada".
- **Agora:** a tela (editor e importação) mostra em âmbar o componente de faixa que ficou de fora por
  não atender o tipo (`<ForaDoTipo>`); a coluna desse produto na planilha **bloqueia** a importação
  (antes gravava a tabela sem ele); o cabeçalho casa também pelo nome sem parênteses e pelo apelido da
  categoria quando ela é única na tabela ("Casco" → CASCO, "Taxa Adm" → ADMIN — `cabecalhosDoProduto`);
  duas colunas do mesmo produto bloqueiam; e componente que fica mais barato numa faixa de FIPE maior
  vira aviso. Regras em `src/lib/precificacao-import.ts` (testadas).
- **O conserto do dado é cadastro:** marcar o tipo no produto em Configurações → Produtos.

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

## Importação de VENDEDORES por planilha (0069)
- **Onde:** `Configurações → Vendedores` → botão **Importar planilha**
  (`src/components/vendedores/importar-vendedores.tsx`). Três passos numa tela: arquivo →
  de-para da unidade → prévia com diff.
- **Por que planilha e não API:** metade do cadastro (comissão, banco, PIX, prazo) **não existe no
  sistema de origem** — é acordo comercial, digitado de qualquer jeito. E são centenas, não
  milhares: não há escala que pague uma integração. Modelo de UX herdado de
  `precificacao-import.ts`, como o CLAUDE.md manda.
- **O de-para é por NOME DISTINTO, não por linha.** O relatório real do Mutual trouxe 379 linhas
  com **8 nomes de regional** — 8 decisões, não 379. A tela mostra cada grupo com a contagem **e as
  cidades**, porque grupo espalhado por 50 cidades de 10 estados não é uma unidade, é um balde
  (foi o caso de "SMART CAR BRASIL APROVES-BR", 152 pessoas).
- **⚠️ Nome sem unidade escolhida BLOQUEIA a linha.** Nunca "cai na matriz": aqui
  `regional_id is null` significa **MATRIZ** (0067), então um de-para silencioso jogaria a equipe
  inteira de uma franquia para dentro do escopo da matriz, atravessando RLS e `escopo_regional()`.
  A RPC recusa `regional_id` nulo mesmo se alguém a chamar direto.
- **TODOS ENTRAM INATIVOS por padrão.** O relatório marcou **363 de 379 como "Ativo"** — mas
  "Ativo" na origem significa "não apagado", não "vendendo hoje". Importar 363 ativos criaria 363
  hotlinks captando lead e 363 comissões para conferir. O checkbox *Respeitar a coluna Status*
  existe, e a tela mostra o número na frente antes de você marcá-lo.
- **Comissão entra ZERADA** quando a planilha não traz: zero não paga ninguém por engano, um
  palpite paga. E **nunca cria acesso ao portal** (`usuario_id` fica nulo) — importar 379 acessos
  é criar 379 senhas que ninguém controla e que, desde a 0068, contam como equipe.
- **A carga é RE-EXECUTÁVEL e não apaga o que a planilha não traz.** Chave: `documento` (só
  dígitos) e, sem ele, `email` em minúsculas. Reimportar corrige o nome e **preserva** comissão,
  banco e PIX configurados na tela — o relatório de origem não tem essas colunas.
- **A RPC é ATÔMICA de propósito** (meia importação de equipe é pior que nenhuma), então a
  validação que evita a explosão vive na PRÉVIA: teto de comissão da franquia (0034), unidade
  inativa recusando vendedor ativo (0067), regional mapeada, repetido dentro da própria planilha.
  Linha barrada vira "estas 3 ficam de fora, e por isto", não "a importação falhou".
- **Erro de fórmula do Excel bloqueia**, como na precificação — célula `#N/D` passando como vazia
  grava lixo em silêncio. Coluna a mais vira **aviso**, nunca erro: relatório de sistema sempre
  traz coluna que o cadastro não usa (o do Mutual trouxe Rua, Nº, Bairro, CEP).
- **CPF inválido é AVISO, não erro** — 30 das 379 linhas vieram com dígito errado, e o documento
  aqui é chave de reconciliação com a origem, não documento fiscal. Entra como veio, marcado.
- **Lógica pura testada:** `src/lib/vendedores-import.ts` —
  `interpretarPlanilhaVendedores`, `agruparRegionais`, `casarRegional`, `montarPrevia`,
  `chaveDoVendedor`, `gerarModeloCsvVendedores`.

## Usuário da equipe — ficha e ACESSO (0068)
- **Onde:** `Configuracoes → Usuarios`. A lista mostra pessoa + cargo, contato, papel, unidade,
  **desde quando** (com o tempo de casa) e o acesso; marca quem também é **vendedor** e quem
  **responde por unidade**. Os dados vêm de `usuarios_listar`.
- **🔴 A CORREÇÃO QUE IMPORTA: `usuarios.ativo` NÃO CORTAVA NADA até a 0068.** `is_staff()` (0003)
  e `auth_papel()` (0002) olhavam só `id = auth.uid()`, sem `and ativo` — desmarcar "Usuario ativo"
  mudava um checkbox e a pessoa continuava logando, lendo a carteira, lançando no financeiro e
  autorizando OS. E a tela **prometia o contrário** ("desmarcar tira o acesso sem apagar o
  histórico"), o que é pior que não ter o campo: a gestão acreditava ter revogado um acesso que
  seguia aberto.
- **A trava está na RAIZ, de propósito.** Os três helpers (`is_staff`, `auth_papel`,
  `auth_regional_id`) sustentam a RLS inteira: exigir `ativo` neles derruba junto `is_admin`,
  `tem_acesso_global`, `pode_regional`, `pode_auditar`, `pode_ver_carteira_regional` e
  `pode_liberar_assistencia`. **Não existe tela para caçar** — e não crie checagem paralela de
  `ativo` em RPC nova; ela já vem de graça.
- **`vendedor_atual()` (0038) foi recriada junto:** ela olhava só `vendedores.ativo`, então o
  desativado perdia o `/dashboard` e continuava entrando no `/vendedor`. A formulação é defensiva —
  recusa quando existe linha INATIVA em `usuarios`, em vez de exigir linha ativa — para o vendedor
  **sem** portal (`usuario_id` nulo, 0035) seguir exatamente como antes.
- **`usuarios_select_self` (0003) NÃO mudou, e isso é deliberado:** a pessoa desativada precisa
  continuar lendo a própria linha, senão a tela não teria como dizer *"seu acesso foi desativado"* —
  mostraria um painel vazio, que se lê como sistema quebrado. Os três layouts (`/dashboard`,
  `/regional`, `/vendedor`) param e explicam, via `usuario_acesso_ativo()`.
- **A trava do ÚLTIMO ADMIN (0054) deixou de ser conveniência e virou carga:** é ela que impede a
  empresa de se trancar para fora desativando o único administrador ativo. Há teste.
- **CARGO ≠ PAPEL, e ficam em campos diferentes.** `papel` é PERMISSÃO (o que o sistema deixa
  fazer); `cargo` é a função na empresa ("Supervisora de Atendimento"). Misturar os dois é o
  caminho para o RH pedir um papel novo só para mudar um título.
- **CPF é opcional mas único** — `unique` PARCIAL (`where documento is not null`), senão o segundo
  cadastro sem CPF colidiria com o primeiro (gotcha de `fornecedores.documento`, 0051). Validado no
  banco por `chk_usuario_documento_valido`.
- **Desativar avisa o que mais cai junto:** a unidade que fica sem responsável e o portal do
  vendedor (`avisoDeDesativacao`). Reativar limpa a data de desligamento.
- **Lógica pura testada:** `src/lib/usuario.ts` — `PAPEIS_USUARIO`, `rotuloPapel`, `exigeUnidade`
  (só o gestor regional), `validarFichaUsuario`, `situacaoUsuario`, `tempoDeCasa`,
  `avisoDeDesativacao`.

## Regional / unidade — cadastro e situacao (0067)
- **Onde:** `Configuracoes → Regionais`. A lista mostra contato, responsavel, **equipe** (vendedores
  ativos), **carteira** (associados e veiculos ativos) e a situacao — os numeros vem de
  `regionais_listar`, nao de contagem na tela.
- **Endereco completo com CEP.** O `endereco` jsonb passou a guardar `cep`, `logradouro`, `numero`,
  `complemento`, `bairro`, `cidade` e `uf`; o CEP busca no ViaCEP no `onBlur` e na lupa, mesmo
  padrao do `<ModalFornecedor>`. Antes a unidade so tinha logradouro/cidade/UF e nenhuma busca.
- **REGRA DE OURO: `ativo` decide onde a unidade e OFERECIDA, nunca o que ela ja produziu.**
  Inativa sai das listas de cadastro (usuario, vendedor, associado, lancamento, comunicado,
  seletor da matriz), para de captar por hotlink e nao entra no rodizio. **Continua inteira nos
  relatorios e no DRE**, marcada com "(inativa)" nos filtros — esconder o passado de uma franquia
  encerrada nao limpa o relatorio, falsifica o resultado da associacao.
- **A inativa selecionada continua na lista de escolha** (`opcoesParaEscolher(regionais, atual)`):
  sem isso, abrir um associado de unidade encerrada mostraria o campo em branco e o primeiro
  "salvar" trocaria a unidade dele em silencio.
- **⚠️ EXCLUIR UNIDADE COM MOVIMENTO E RECUSADO PELO BANCO.** Todas as ~20 FKs que apontam para
  `regionais` sao `on delete set null`, e aqui `regional_id is null` significa **MATRIZ**: apagar
  "Cuiaba" jogaria os associados, veiculos, leads e lancamentos dela no escopo da matriz, sem
  aviso e sem volta. O trigger `fn_regional_bloqueia_exclusao` recusa nomeando o que esta
  pendurado; a lixeira na tela so fica ativa quando `pode_excluir`. **Consolidar unidades e
  MIGRAR primeiro, excluir depois.**
- **NAO existe hotlink DA UNIDADE na tela** (decisao do usuario): quem responde pela franquia entra
  tambem como **vendedor**, com hotlink proprio. A coluna `regionais.codigo` e o `resolver_hotlink`
  ficaram INTACTOS de proposito — ha leads em producao com `origem_hotlink` de codigo de unidade, e
  derrubar isso quebraria links ja distribuidos. O botao "Meu hotlink" saiu da cabine do
  `/regional`.
- **BUG CORRIGIDO JUNTO:** as regras de atribuicao de lead (0041 — protecao, devolucao ao pool,
  rodizio) estavam no formulario desde a 0041 e **nunca chegavam ao banco**: o payload do
  `useSaveRegional` nao as listava. O gestor mudava, salvava, e a unidade seguia no padrao.
- **Logica pura testada:** `src/lib/regional.ts` — `opcoesParaEscolher`, `opcoesParaFiltrar`,
  `pendenciasDaUnidade`, `podeExcluirUnidade`, `avisoDeInativacao`, `rotuloUnidade`.

## Portal da Franquia (0036) — `/regional`
- **No menu ele agora se chama `Regionais > Acesso as Regionais`** (0078). O item antigo "Portal da
  Franquia" era um link só e virou grupo: o irmão dele é o **Dashboard** consolidado (`/regionais`),
  que é outra coisa — ver a seção "Dashboard executivo das Regionais".
- **A MATRIZ ESCOLHE A UNIDADE ao entrar.** O sistema de gestão é a matriz; a franquia se
  administra por este portal — e é por aqui que a matriz entra nela. Quem tem acesso global
  (admin/financeiro) cai numa tela **"Selecione a unidade"** (`<SelecionarUnidade>`) listando as
  regionais com cidade/UF, e entra em **uma por vez**: a tela do portal é a operação de uma
  franquia, não um consolidado. Trocar de unidade é um botão no cartão da cabine.
- **O gestor não escolhe nada:** entra sempre na própria unidade, mesmo que o cookie diga outra.
- **Como a unidade viaja:** cookie `scar_unidade` (12h) lido pelo layout (server component) e
  distribuído às telas pelo `<UnidadeProvider>` / `useUnidadeAtual()`. Regra pura e testada em
  `src/lib/unidade.ts` (`decidirUnidade`, `temAcessoGlobal`, `localDaUnidade`).
  **O cookie NÃO é controle de acesso** — ele é escrito pelo navegador. Quem decide o dado é o
  `escopo_regional()` no banco, que ignora o id pedido por quem não tem acesso global; o cookie
  serve para a TELA não mentir (mostrar "Natal" servindo dados de Cuiabá).
- **Antes desta correção as telas mandavam `regionalId: null`** — para o gestor isso funcionava
  (o banco resolvia pela sessão), mas para a matriz virava "nenhuma unidade" e o portal nascia
  vazio. Toda tela do `/regional` agora tira o id do `useUnidadeAtual()`.
- **Quem entra:** papel `gestor_regional` COM regional no cadastro (admin/financeiro entram para
  visitar qualquer unidade, e o banco continua limitando o que cada um vê). Layout proprio em `src/app/regional/layout.tsx`,
  sidebar cockpit com o hotlink da unidade no topo. Atalho "Portal da Franquia" no menu principal.
- **5 telas:** Painel (indicadores + ranking da equipe) · Minha Equipe (desempenho por vendedor,
  hotlink de cada um e o **cadastro da equipe ali dentro** — o mesmo `<ModalVendedor>` da matriz,
  com `regionalFixa`: a unidade ja vem travada e o gestor nunca sai do portal) · Leads (tudo da unidade, com filtro "somente hotlink" e a origem marcada) ·
  Comissoes (extrato + export CSV) · Financeiro (contas a pagar/receber da unidade).
- **O isolamento nao e visual, e do banco.** As RPCs usam `escopo_regional()`: um gestor que passe o
  id de outra franquia recebe os proprios numeros. No financeiro, a RLS `pode_regional(regional_id)`
  ja impede ver a matriz (`regional_id` nulo) — por isso "nao se mistura" vale mesmo se alguem
  chamar a API direto.
- **O financeiro da unidade e OUTRO** (0037), nao a tela da matriz — ver a secao abaixo.
- **Hotlink da unidade:** `/v/<CODIGO_DA_REGIONAL>` funciona igual ao do vendedor, mas o lead entra
  sem vendedor (fica para a unidade distribuir). `leads.origem_hotlink` permite medir cada link.

## EVENTOS E TERCEIROS (0103) — o associado vincula, cada terceiro tem tela propria
Pedido do usuario (13/10/2026). Decisoes tomadas com ele: papel POR envolvido; aba no evento + pagina
propria do terceiro; cadastro do terceiro POR EVENTO (nao reaproveita entre eventos); associado gravado
no terceiro COM trava; favorecido obrigatorio SO nas contas a pagar do evento.
- **Fluxo:** `/sinistros/novo` pergunta "Ha terceiros envolvidos?" (substitui o antigo "Veiculo
  envolvido", `envolvido_tipo` ficou legado) → se sim, ao abrir o evento vai direto para
  `/sinistros/[id]/terceiros/novo` → salva → `/sinistros/[id]/terceiros/[terceiroId]` (Dados | Reparo |
  Financeiro, faixa fixa `VinculoTerceiro`). No protocolo: aba **Terceiros (N)** e aviso amarelo
  enquanto `possui_terceiros` e nenhum cadastrado. A pagina recusa terceiro de OUTRO evento na URL.
- **Recorte 0077 na tela:** quem nao `podeTratarEvento` ve o terceiro em somente leitura e nao ganha o
  botao "Novo lancamento" do evento. ⚠️ O banco so barra o lancamento pelo `lanc_all`
  (`pode_regional`) — mesmo achado nº 1 da varredura (87 policies), nao mexido aqui.
- **Financeiro do evento** grava em `lancamentos_financeiros` (antes ia para `movimentacoes_caixa`, sem
  fornecedor nem baixa): `EventoFinanceiro` reusa `LancamentoModal` (prop `evento`) e `BaixaModal`.
  Favorecido: fornecedor preenchido manda; sem fornecedor e com terceiro = paga o terceiro
  (indenizacao). As `movimentacoes_caixa` antigas do evento aparecem so leitura. `/financeiro` mostra o
  terceiro como favorecido.
- **Fornecedor novo:** `pode_cadastrar_fornecedor()` NAO inclui `sinistro` — o time de eventos escolhe
  da lista; cadastrar e admin/financeiro/assistencia/gestor. Decisao pendente com o usuario.
- **DRE (regime competencia):** `dre_movimentos` soma `notas_fiscais_evento` E os lancamentos do evento.
  Se a mesma compra for lancada pelos dois caminhos, conta duas vezes.
- **Codigo:** `src/lib/terceiros.ts` (+ `terceiros.test.ts`, 11 testes), `src/hooks/use-terceiros.ts`,
  `src/components/sinistros/terceiro-form.tsx` e `terceiros-evento.tsx`, paginas em
  `src/app/(dashboard)/sinistros/[id]/terceiros/`.
- **Nao feito:** terceiro que tambem e associado da Smart Car fica como terceiro comum (sem ligar ao
  cadastro dele).

## O PORTAL DA FRANQUIA REVISADO (0102) — a equipe e a carteira
> Pedido do usuário (13/10/2026): *"o usuário (regional) tem o poder de incluir e ativar e inativar
> o vendedor, excluir somente admin e master."* Junto veio a revisão do que o portal MOSTRA.

### 🔴 A POLICY ERA `for all` — e `for all` inclui DELETE
`vendedores_write` (0003) dava ao `gestor_regional` todas as operações sobre a própria unidade,
DELETE incluído. **Nenhuma tela do portal oferecia isso** — a UI já estava certa, a policy é que
não estava —, mas `/regional` fala com o PostgREST direto e `useExcluirVendedor` existe no mesmo
hook que a tela usa. Agora são três policies: `insert` e `update` (admin **ou** gestor da unidade)
e **`delete` só `is_admin()`**.

**Incluir, editar, ATIVAR e INATIVAR não mudaram nada para o gestor** — e é essa a distinção que a
policy única não sabia fazer: `ativo` é COLUNA, então inativar é UPDATE, não DELETE.

**⚠️ NÃO EXISTE papel `master` neste sistema.** São 7 (0077) e o teto é o `admin`. Ficou admin, e
só ele; se um dia "master" virar um papel de verdade, é uma linha na policy.

**⚠️ E EXCLUIR VENDEDOR NÃO É BARATO NEM PARA O ADMIN** — isto ficou de fora de propósito, porque
a pergunta era *quem pode*: `leads.vendedor_id`, `veiculos.vendedor_id`,
`lancamentos_financeiros.vendedor_id` e `lead_atribuicoes.vendedor_id` são **`on delete set null`**,
então apagar **desliga a carteira do vendedor em silêncio** (a mordida que a 0067 documentou em
`regionais`). Só `comissoes_vendas` é `on delete restrict`, então quem já gerou comissão o banco já
recusa. **Decisão em aberto:** bloquear a exclusão de vendedor COM MOVIMENTO, como
`fn_regional_bloqueia_exclusao` faz com a unidade.

### O que a TELA da equipe ganhou (`/regional/equipe`)
- **Ativar/inativar em UM clique**, na linha, com confirmação que diz o que para (hotlink, rodízio)
  e o que **não** é apagado. Antes era: abrir o modal → rolar até *Status* → salvar.
- **"66 cadastrados · 2 ativos · 64 aguardando ativação"** + abas *Ativos / Inativos / Todos*.
  **O número sozinho mentia:** a importação de vendedores (0069) entra com **todos INATIVOS de
  propósito**, então Ribeirão Preto — 66 importados — aparecia como uma equipe de dois, e a tela
  não dizia de onde ligar os outros.
- **O hotlink do inativo não é mais oferecido.** `vendedor_por_codigo` (0035) e `resolver_hotlink`
  (0067) ignoram vendedor inativo: copiar era distribuir um link morto.
- **Conversão de quem teve 0 lead mostra "—"**, não "0,0%" em âmbar — acusar quem não teve lead no
  período é a mesma régua torta que o `/regionais` corrigiu com "sem base de comparação".
- Rodapé da tela diz, em uma linha, **quem exclui** — para o gestor não procurar um botão que não
  existe para ele.

### 🔴 O PAINEL MOSTRAVA A UNIDADE VAZIA COM A CARTEIRA DENTRO
Medido em produção em 13/10/2026, já com as **quatro** unidades carregadas (2.898 veículos):

| Unidade | Veículos | Painel dizia | Associados | Vendedores |
|---|---:|---:|---:|---:|
| RIBEIRÃO PRETO | 1.169 (1.149 ativo + 20 vistoria) | "1.149" | 998 | 66 cad. / **2 ativos** |
| SÃO PAULO 1 | 821 (812 + 9) | "812" | 760 | 28 / 1 |
| SMART CAR MATRIZ | 474 (459 + 15) | "459" | 430 | 135 / 3 |
| GRANDE NATAL | 434 (426 + 8) | "426" | 376 | 75 / 1 |

Três defeitos somados, e todos da mesma família:
1. **contava só `status = 'ativo'`** — lista de status que o sistema superou (`inadimplente` nasceu
   na 0072; `em_evento`/`vistoria_pendente` existem desde a 0021). É o gotcha do `statusMeta` e do
   `mutual_filiais` outra vez: **contar por uma lista que envelheceu**;
2. **não dizia que a carteira inteira está em COBRANÇA EXTERNA** (0082) — veículo ativo que não
   emite boleto aqui. Sem isso, *"cadê a cobrança?"* vira chamado (foi por isso que `/veiculos`
   ganhou o selo);
3. **não mostrava ASSOCIADOS nem a carteira em R$** — a unidade com 998 associados tinha a mesma
   cara de uma recém-aberta, porque o painel só sabia falar de lead do período.

**`veiculos_ativos` ficou INTACTO** (continua só `status = 'ativo'`): o que entra são colunas NOVAS
ao lado, e há teste de regressão provando que o número velho não mudou de significado. A carteira
em R$ soma `veiculos.valor_mensalidade` e **não chama `cotar_plano` por veículo** — mesma escolha
do painel das regionais (0078) —, e quem está sem valor aparece contado em `veiculos_sem_valor`,
para a diferença ser visível em vez de virar um total baixo sem explicação.

**A ordem da tela virou: a CARTEIRA (o que a unidade tem) → a VENDA do período → o DINHEIRO da
unidade.** Antes começava pelo lead do período, que numa unidade migrada é zero.

### 🔴 O `Indicador` CRAVAVA "R$" EM TUDO — inclusive no que não é dinheiro
Achado ao revisar: `Indicador` (`ui-financeiro.tsx`) nasceu no Financeiro e escrevia `R$` no valor
sempre. Os dois portais que **contam coisas** usavam o mesmo componente, então estavam no ar
mostrando **"R$ 1.149,00" veículos** e **"R$ 0,00" de taxa de conversão** — no `/regional` **e no
`/vendedor`**. Entrou `formato?: 'moeda' | 'numero' | 'percentual'`, com **`moeda` como padrão**
para nenhuma tela de dinheiro mudar; quem conta passa `numero`, quem mede passa `percentual`.
**Componente compartilhado entre domínios não pode ter a unidade de UM deles cravada.**

### INADIMPLÊNCIA NO PORTAL DA FRANQUIA (14/10/2026) — `/regional/cobranca`
Pedido do usuário: o painel de Inadimplência e Cobranças (0097) dentro do portal, só da unidade.
É o MESMO `<PainelInadimplencia>` com `unidade={{id, nome}}`: unidade travada, sem a tabela
"por regional", sem a configuração de meta/feriados e sem o link de recaptura do Mutual. **Não
precisou de banco:** `cobranca_escopo()` já dava ao `gestor_regional` a própria unidade, e a
matriz que visita uma unidade passa o id dela. O painel `/regional` ganhou a linha de HOJE
(associados inadimplentes, vencido em aberto) com o atalho. Medido em 14/10: GN 129/376 ·
RP 172/998 · SP1 247/760 · MATRIZ 180/430 (associados inadimplentes / com veículo na base).
**FILA DE COBRANÇA NO PORTAL (19/10/2026, sem migration):** `/regional/fila` (menu *Fila de Cobranca*) é a MESMA `<FilaCobranca unidade={{id, nome}}>` da matriz, com a unidade travada. Quem limita é o banco: `cobranca_fila`/`_resumo`/ficha/`registrar_contato_cobranca` passam por `cobranca_escopo()`/`cobranca_pode_cliente` — gestor, cobrança e supervisor só leem e trabalham a própria unidade, peçam o id que pedirem.
**Por que a carteira de veículos (painel) e a de associados (cobrança) diferem por poucos:** a
primeira conta `veiculos.regional_id`, a segunda `clientes.regional_id`; 8 veículos estão numa
unidade diferente da do associado.

### Lógica pura testada
`src/lib/regional.ts` — `resumoDaEquipe`, `filtrarEquipe`, `hotlinkResolve`,
`avisoDeSituacaoVendedor`, `composicaoDaCarteira`, `avisoCobrancaExterna`.
Suíte de banco em `supabase/tests/0102_portal_regional_equipe.test.sql` (inclui o DELETE recusado
ao gestor — RLS de delete **não levanta erro**, ela simplesmente não alcança a linha, então o
teste afirma `row_count = 0` e que a linha continua lá).

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
  tambem na barra do mobile. O atalho **"Sistema da matriz" so aparece para o admin** — o gestor
  da franquia nao tem o que fazer no painel da matriz.
- **Formulario de vendedor unico:** `src/components/vendedores/modal-vendedor.tsx` serve a matriz
  (Configuracoes -> Vendedores) e o portal. Nao ha duas telas de cadastro para manter em sincronia.

## Portal do Vendedor (0038) — `/vendedor`
- **Quem entra:** quem tem cadastro ATIVO em `vendedores` ligado ao proprio login (o acesso e
  criado em `Configuracoes → Vendedores`, secao *Criar acesso*). O layout confere pelo banco
  (`vendedor_perfil`), nao pelo papel — vendedor sem cadastro ve um aviso, nao um erro.
- **A isolacao aqui e mais forte que no portal da franquia.** La o gestor pode passar o id de
  outra unidade e recebe o proprio; aqui **as RPCs nao tem parametro de vendedor**. A identidade
  sai de `vendedor_atual()`. Nao existe o que forjar.
- **A RLS de `leads` mudou junto (0038) e isso e uma mudanca de comportamento:** o
  `consultor_vendas` passou a ver **so a propria carteira**, nao mais a da regional inteira.
  Antes o vendedor nao tinha login e a policy generosa nao doia; com o portal, doeria. Gestor,
  admin, financeiro e auditoria continuam vendo a unidade toda.
- **4 telas, mobile-first** (barra inferior no celular, sidebar cockpit no desktop): Painel
  (hotlink no topo, leads/conversao/comissao/carteira, ultimos leads e o cartao "Meu pagamento"
  com o proximo pagamento calculado) · Meus Leads (filtro por etapa, busca, **WhatsApp e ligar**
  direto do card, e *Novo lead*) · Minhas Comissoes (extrato + CSV) · Meu Perfil (identificacao,
  hotlink, **contato e dados bancarios editaveis** e comissao/prazo em leitura — quem muda e a
  franquia).
- **Vocabulario proprio:** `APROVADO` e `EM_AUDITORIA` viram "Em analise" para o vendedor —
  sao etapas nossas, ele so precisa saber que esta com a empresa. Mapa em
  `src/lib/vendedor.ts` (`etapaDoVendedor`, `SELO_STATUS_LEAD`, `FILTROS_LEAD`), com testes.
- **O vendedor nao ve o teto da franquia** (0039): no perfil aparecem so os percentuais dele. O
  teto e a negociacao entre matriz e franquia — quem precisa dele e o gestor, na hora de cadastrar.
- **Compartilhar o link** usa a Web Share API no celular (abre o menu nativo) e cai no WhatsApp
  Web no desktop.
- **PWA:** `src/app/manifest.ts` + `viewport.themeColor` no layout raiz. O portal instala na tela
  inicial e abre em tela cheia. Icone hoje e o `logo-smartcar.svg`; para um icone melhor no
  Android/iOS, gerar PNGs 192/512 e apontar no manifesto.
- **Adesao recebida na hora nao aparece no extrato** (nao passou pelo nosso financeiro) — o texto
  esta na propria tela para nao virar duvida recorrente.

## A VISTORIA PELO CELULAR DO CLIENTE (0076) — o link publico
- **O buraco que ela fecha, e ele era grande:** o hotlink cotava, o cliente ACEITAVA na hora — e a
  rotina parava. A tela de sucesso dizia *"seu consultor vai combinar a vistoria"*, e o único jeito
  de as fotos existirem era alguém **logado** abrir o lead: `<FotosVistoria>` só vive no CRM e no
  portal do vendedor, a RLS de `vistorias`/`vistoria_anexos` é `to authenticated` e a policy do
  bucket `vendas` exige `is_staff()`. **O cliente literalmente não tinha como mandar foto**, no
  exato momento em que está com o carro na frente e decidido.
- **Onde fica:** `/vistoria/<token>` — pública, no `PUBLIC_PATHS` do middleware, server component
  com `service_role` no mesmo padrão de `/v/<codigo>` e `/cotacao/<token>`.
- **A LOGO SAI DE `empresa.logo_url`, como em toda página pública** — a primeira versão não buscou e
  a tela caiu no `public/logo-smartcar.svg`, que é só o **fallback desenhado**: o cliente via, na
  hora de fotografar, uma marca diferente da que tinha acabado de ver ao contratar. **Tela pública
  nova busca `empresa` no server component e passa `logoUrl` adiante** — o `<CabecalhoMarca>` sem
  `logoUrl` não avisa nada, ele simplesmente desenha o fallback.
- **⚠️ É UM TOKEN NOVO, e não o `leads.token_publico` (0042).** Aquele é a capacidade de COTAR e
  CONTRATAR, e o link da proposta é feito para ser **guardado e reaberto** — vai para o WhatsApp,
  fica no histórico, o cliente reabre meses depois. Pendurar UPLOAD nele transformaria um link de
  leitura, distribuído à vontade, em permissão de ESCRITA no nosso storage, sem prazo. Capacidades
  diferentes, tokens diferentes: este nasce para a vistoria, **expira em 7 dias** e morre com a
  venda.
- **DECISÕES DO USUÁRIO (12/09/2026), arquivadas:** (1) a foto do cliente **VALE** como vistoria —
  completa o `checklist_lead` e o lead segue para a Auditoria, que é quem confere as imagens; a
  trava continua sendo a Auditoria, não uma etapa a mais no vendedor. (2) O link vale **7 dias**.
- **REEMITIR NÃO DERRUBA O LINK QUE O CLIENTE JÁ TEM.** Enquanto o token vigente não venceu,
  `gerar_link_vistoria` devolve **o mesmo** e diz `reaproveitado`. Girar o token a cada clique do
  vendedor quebraria, em silêncio, a mensagem que ele acabou de mandar no WhatsApp — e ninguém
  entenderia por que "o link parou de funcionar". A tela avisa *"este link já estava valendo"*.
- **O link sai NO PRÓPRIO ACEITE.** `/api/v1/hotlink/contratar` chama `gerar_link_vistoria` depois
  de `registrar_aceite_venda` e a tela de sucesso mostra **"Fotografar o meu carro agora"** antes
  do link da proposta — a proposta ele reabre quando quiser; a foto, não. **Falhar ali não derruba
  a venda:** o aceite já está gravado, o vendedor reemite pela ficha.
- **Por isso `gerar_link_vistoria` aceita o caminho público** (`auth.uid() is null`, padrão da
  0052): a rota do hotlink roda com service_role e já provou a posse do atendimento pelo
  `token_publico`. Com sessão, a trava é a de sempre — `pode_tratar_lead()` (0045). O `anon` não
  alcança a função (o revoke da 0052 tira o execute dele).
- **O upload passa pela NOSSA rota, não pelo Storage direto:** `/api/v1/vistoria/foto` sobe com
  service_role **depois** de conferir o token, e a linha do anexo vai pela RPC, que confere de novo
  (prazo, pose, situação do lead). Afrouxar a policy do bucket para aceitar visitante seria abrir
  escrita anônima no storage. Se a RPC recusar, **o arquivo recém-enviado sai do bucket** — nada de
  órfão, mesma regra do resto do sistema.
- **A POSE é validada contra o catálogo** (`vistoria_fotos_modelo`, ativo + tipo do veículo): sem
  isso, `tipo` livre encheria a vistoria de código que nenhuma tela mostra — foto que sobe, não
  aparece e não conta para o checklist.
- **Foto que chega é TRABALHO no lead:** `registrar_foto_vistoria_publica` carimba
  `leads.ultima_interacao_em`. Sem isso o cliente faria a vistoria e o lead voltaria ao pool por
  falta de contato (0041/0045).
- **A ORIGEM aparece para quem audita:** `vistoria_anexos.enviado_pelo_cliente` e
  `fotos_vistoria_lead` **recriada** devolvendo a coluna (muda a lista de OUT ⇒ drop + create), com
  o selo **"do cliente"** na lista de poses. Foto de quem COMPRA o carro se confere diferente da
  foto de quem o VENDE — e guardar o campo sem ninguém lê-lo seria repetir o gotcha do
  `usuarios.ativo` (0068). **Ao recriar a função, o `where is_staff() or auth.uid() is null` da
  0052 foi reescrito junto** — recriar sem ele reabriria o buraco em silêncio.
- **O cliente NÃO apaga foto**, de propósito. Quem errou manda de novo (`fotos_vistoria_lead` fica
  com a mais recente de cada pose). Botão de excluir na mão de quem não vai auditar só cria o caso
  de a vistoria voltar a zero na véspera da entrada na base.
- **Onde a equipe gera o link:** dentro do próprio `<FotosVistoria>` (`<LinkDaVistoria>`), então ele
  aparece **de uma vez** na aba *Documentos e fotos* do `<FechamentoVenda>` e no
  `/vendedor/leads/[id]` — some quando a vistoria completa. O link só é gerado **no clique**: criar
  a vistoria e carimbar o prazo são efeitos, e prazo que começa a correr sozinho vence sem ninguém
  ter mandado nada.
- **Lógica pura testada:** `mensagemDaVistoria` (`src/lib/venda-publica.ts`) — o convite diz o que
  fazer, quanto tempo leva e **até quando vale**; sem o prazo o cliente guarda "para depois" e
  descobre vencido.

## Vistoria por modelo de fotos (0040)
- **A vistoria nao e "mande 4 fotos".** `vistoria_fotos_modelo` define as POSES: cada uma com nome
  e **instrucao de enquadramento** ("de frente, a uns 3 metros, com a placa legivel"). O padrao tem
  6 obrigatorias (frente, traseira, lateral esquerda, lateral direita, chassi, hodometro) e 4
  opcionais (motor, interior, pneus, acessorios). Pose com `tipo_veiculo_id` vale so para aquele
  tipo — e assim que a moto ganha "numero do motor" sem afetar o carro.
- **`checklist_lead` cobra as poses**, nao a quantidade. Quatro fotos da frente nao passam mais.
  Consequencia pratica: foto antiga sem `tipo` nao conta — a vistoria precisa ser refeita pelo app.
- **Um componente para os dois caminhos:** `<FotosVistoria leadId>`
  (`src/components/vistoria/fotos-vistoria.tsx`) e usado no fechamento pelo CRM e no portal do
  vendedor. Barra de progresso pelas obrigatorias, instrucao em cada item e
  `capture="environment"` no input — no celular abre a camera traseira direto.
- **RLS:** `vistorias`/`vistoria_anexos` enxergam o lead tambem por `vendedor_id` (0040). Sem isso o
  lead do hotlink (criado pelo service_role, sem `consultor_id`) tinha dono mas nao tinha vistoria.
- **O CLIENTE tambem fotografa (0076):** o link `/vistoria/<token>` sai no proprio aceite do
  hotlink e vale 7 dias. A foto dele entra na MESMA vistoria, marcada com a origem ("do cliente"),
  e conta no `checklist_lead` — ver a secao propria.
- **A foto aparece na tela (0047):** cada pose mostra miniatura, data do envio e peso, e o clique
  abre o visor em tela cheia (setas, `Esc`, "abrir original"). As URLs assinadas vêm **em lote**
  (`createSignedUrls`, 10 min) — uma chamada, não uma por foto. Miniatura quebrada avisa em
  vermelho: para a Auditoria, "não carregou" e informação, não silêncio.
- **Peso: reduzido no navegador, travado no banco (0047).** `comprimirImagem` (`src/lib/imagem.ts`)
  redimensiona para 1600px no maior lado e recodifica em JPEG antes do upload; o teto de 10 MB é
  uma CHECK em `vistoria_anexos`. Se o insert falhar, o hook remove o arquivo do bucket — nada de
  órfão no storage.
- Espelho puro em `src/lib/vistoria.ts` (`progressoVistoria`, `proximaPose`, `separarOpcionais`,
  `avulsosParaCotacao`) com testes.

## Foto e anexo — UMA regra para o sistema inteiro (`src/lib/imagem.ts`)
- **Todo upload de imagem passa por `comprimirImagem`**: 1600px no maior lado, JPEG 0,82 (segunda
  passada em 0,65 se ainda ficar acima de ~1,5 MB). Ela **nunca falha para quem chama** — formato
  que o navegador não decodifica (HEIC antigo) e imagem que ficaria maior comprimida sobem como
  vieram.
- **`validarArquivo` decide o que entra** antes de gastar rede: imagem sempre passa (vai ser
  reduzida), PDF só onde a tela aceita (`aceitaPdf`), outros formatos por regex (`aceitaOutros`,
  usado pelo XML da nota no evento). Imagem acima de 40 MB é recusada — nem vale tentar reduzir.
- **O teto de 10 MB é do BANCO**, em CHECK: `vistoria_anexos` (0047), `acionamento_anexos` (0048) e
  `anexos_evento` (0048, `not valid` por causa do histórico). Regra que só vive na tela não é regra.
- **Onde já está ligado:** vistoria da venda e CRLV (`use-vendas.ts`), anexos de evento/sinistro
  (`use-eventos.ts`) e anexos da OS da 24h (`use-assistencia.ts`). Ao criar um upload novo, use os
  mesmos dois passos — `validarArquivo` + `comprimirImagem` — e grave `tamanho_bytes`.
- **Se a linha do anexo falhar, o arquivo recém-enviado é removido do bucket** (o teto do banco
  recusa depois do upload). Nada de órfão no storage.
- **Ver a foto é `<VisorImagens>`** (`src/components/ui/visor-imagens.tsx`): miniatura → tela cheia,
  setas, `Esc` e "abrir original". Está fora das telas de propósito — conferir imagem é o mesmo
  gesto na vistoria e na OS da 24h.

## Cotação: o que ja vem no combo (0040)
- **O bug:** a tela listava TODO produto nao-obrigatorio como "adicional avulso", inclusive os que o
  plano ja carrega (`plano_produtos`). O vendedor podia oferecer — e cobrar — algo que o cliente ja
  estava levando dentro do combo.
- **A correcao:** `produtos_do_plano(plano)` alimenta a tela; os itens do combo aparecem
  **marcados, travados e com o selo "no plano"**, e `avulsosParaCotacao()` os remove do payload —
  o snapshot da cotacao passa a dizer a verdade sobre o que foi vendido a parte.
- `produtos_obrigatorios_cotacao` (0028) NAO servia para isso: ela le `obrigatorio` do cadastro do
  produto, e um opcional dentro de um combo continua sendo opcional no cadastro.

## Novo lead + cotação: uma tela, dois lugares (0040)
- `<NovoLeadCotacao>` (`src/components/vendas/novo-lead-cotacao.tsx`) serve `/vendas/novo` (CRM) e
  `/vendedor/leads/novo` (portal). O que muda entre os dois e **como o lead nasce**: no CRM e insert
  direto (staff); no portal passa por `vendedor_criar_lead`, que amarra o lead a quem cadastrou e a
  regional dele — e so depois a ficha do veiculo entra por update (a RLS do 0038 ja reconhece o dono).
- No portal, `/vendedor/leads/[id]` e a ficha de campo: WhatsApp/ligar, dados do veiculo, **a
  vistoria guiada** e o envio do CRLV. O resto do fechamento (associado, adesao) segue com a franquia.

## Atribuição do lead pelo hotlink (0041)
- **Quem captou primeiro fica com o lead.** E a escolha registrada: e a norma do mercado e a unica
  que protege a prospeccao. O contrario ("ultimo clique leva") premiaria quem manda link para a
  base do colega. Quem discordar muda por parametro, nao por codigo.
- **Nada disso esta no codigo:** `regionais.dias_protecao_lead` (padrao 30),
  `dias_sem_contato_lead` (7) e `distribuicao_lead` (MANUAL|RODIZIO) ficam em
  `Configuracoes → Regionais`. `0` desliga a regra correspondente.
- **Quatro desfechos** (`classificar_captura`), decididos por celular, CPF/CNPJ **ou placa**:
  | Situacao | O que acontece |
  |---|---|
  | **CARTEIRA** — ja e associado | Nasce com `carteira = true` e aponta o cliente. Nao e venda nova. |
  | **DUPLICADO** — lead aberto e protegido | **Nao cria outro lead.** Incrementa `recapturas`, anota a passagem e devolve o dono original. |
  | **REATIVACAO** — lead antigo sem protecao | Quem trouxe agora assume (motivo `HOTLINK_REATIVACAO`). |
  | **NOVO** | Nasce com o dono do link; se o link e da UNIDADE, entra no pool ou no rodizio. |
- **O hotlink do vendedor sempre fica com ele**; a distribuicao (manual/rodizio) vale so para o
  link da propria franquia. No rodizio entra quem esta ha mais tempo sem receber lead.
- **Trabalhar o lead renova a protecao:** mudar de etapa (trigger `fn_lead_historico`) ou
  `registrar_contato_lead` carimbam `ultima_interacao_em`. Parar de trabalhar e o que derruba.
- **Pool da unidade** (`/regional/leads`): lista os leads sem dono, com o botao **Devolver parados**
  (`liberar_leads_sem_contato`) e a distribuicao por vendedor. `atribuir_lead` recusa vendedor de
  outra franquia.
- **A rota `/api/v1/hotlink` nao tem regra nenhuma:** ela chama a RPC e devolve ao visitante a
  mensagem que o banco montou — quem ja e associado ouve "voce ja e nosso associado", nao uma
  promessa de cotacao nova.
- Espelho puro em `src/lib/atribuicao.ts` (`protecaoAtiva`, `deveVoltarAoPool`,
  `diasDeProtecaoRestantes`, `ROTULO_CAPTURA`) com testes.

## O ACEITE APONTA PARA UMA COTAÇÃO — e a tela tem de dizer QUAL
- **O defeito, pego num teste real (28/09/2026):** o banner verde de `/vendas/[id]` dizia
  *"Proposta aceita pelo cliente"* com quem, quando e de que IP — **nunca O QUE foi aceito**.
  `leads.aceite_cotacao_id` existe desde a `0042` e **nenhuma tela lia**.
- **Por que isso não é teórico:** a recaptura pelo hotlink (**DUPLICADO**, 0041/0043) continua
  **no mesmo lead**. Um teste feito hoje por `/v/RODNM` caiu num atendimento de 09/09 (mesmo
  celular e placa, 19 dias dentro dos 30 de proteção) e criou ali uma cotação de **R$ 135** — ao
  lado de um aceite de **R$ 153**, de 19 dias antes. O banner afirmava "aceita" logo acima do
  valor que ninguém aceitou. **A data de 09/09 estava certa; o que mentia era o banner.**
- **Mandar assim para a Auditoria é entregar prova de consentimento de OUTRO preço.**
- **A regra pura é `situacaoDoAceite(lead, cotacoes)`** (`src/lib/vendas.ts`, testada): devolve a
  cotação aceita, as **posteriores** a ela e `divergente`. Empate no `created_at` conta como
  posterior — duas cotações gravadas no mesmo instante só se separam pelo id, e o lado seguro é
  avisar (mesmo desempate do `distinct on` da vistoria, 0047).
- **`semVinculo` não é "está tudo certo".** Aceite sem cotação correspondente faz a tela **pedir
  conferência**, não afirmar — e **não** inventa divergência, porque sem a cotação aceita não há
  régua para comparar e qualquer outra seria "posterior" por acaso.
- **O banner fica ÂMBAR quando diverge**, diz o valor aceito, quantas cotações entraram depois, o
  valor da mais recente, e manda colher aceite novo ou voltar à cotação aceita.
- **A página pública PARA quando o atendimento já tem aceite** (`ja_aceito`, resolvido na rota de
  captura por `lead_por_token_publico` com o token recém-emitido — sem migration, sem expor lead
  alheio). **Isso não contradiz o "a cotação nunca é interrompida" da 0043:** lá o motivo de não
  parar era não jogar fora a intenção de compra de quem **ainda não fechou**; quem já fechou tem o
  oposto — cotar de novo é o que fabrica a divergência. Falhar a consulta não derruba a captura.
- **Medido na base antes de entregar:** 11 leads com aceite, **1** com cotação posterior (o próprio
  teste) e **nenhum** já em Auditoria ou na base — o teste pegou antes de custar uma venda.

## Página pública do hotlink (0042) — a vitrine da venda
- **É a tela que o possível associado vê**, então segue o site (www.smartcarbrasil.com.br): logo
  centralizada no branco, faixa navy, hero com o **corte diagonal** da marca, ciano como acento e
  os títulos em caixa-alta leve. Peças em `src/components/hotlink/marca.tsx`.
- **A logo oficial é a cadastrada em `Configurações → Empresa`** (`empresa.logo_url`).
  `<LogoSmartCar url>` é usada na página do hotlink, na cotação pública e na cabine dos dois
  portais (`<LogoNaCabine>` põe a logo numa placa branca, porque a tinta dela é escura).
  `public/logo-smartcar.svg` é só o **fallback** de quando ainda não há arquivo cadastrado —
  trocar a marca é subir o arquivo, não fazer deploy.
- **Três passos numa página** (`<CotacaoPublica>`): Contato → Veículo → Planos → Confirmação.
  O contato é gravado **no primeiro passo** (`registrar_captura_hotlink`): se a pessoa desistir
  no meio, o lead já existe.
- **A cotação nunca é interrompida (0043).** Ser da base ou já estar em atendimento é informação
  para a equipe, não motivo para travar a tela — vira um aviso discreto no topo e o fluxo segue.
  O associado ganha a ficha já preenchida; a recaptura continua no atendimento existente.
- **Quem manda é a PLACA, e o tipo do veículo sai dela.** `/api/v1/hotlink/veiculo` consulta a
  FIPE assim que a placa fica completa (`placaCompleta`), mostra marca/modelo/ano/valor e
  **deduz o tipo** (`tipoVeiculoSugerido` lê o registro bruto da FIPE) já casado com
  `tipos_veiculo`. O visitante confirma ou corrige — não escolhe antes de a gente saber o que é.
  Placa não encontrada não é erro: ele informa o valor de mercado e a cotação segue.
- **A cotação é server-side.** `/api/v1/hotlink/cotar` usa o valor já identificado e devolve
  **um preço por plano ativo** via `cotar_plano`. A consulta à FIPE roda em
  `src/lib/fipe-server.ts` — o proxy `/api/fipe` exige sessão e não serve para o visitante.
- **O aceite fecha a venda, não a cotação (0043).** `/api/v1/hotlink/contratar` grava o snapshot
  e chama `registrar_aceite_venda`, que marca o aceite e deixa o lead em **EM_NEGOCIACAO** — o
  vendedor ainda ajusta opcionais, completa a ficha do associado, o CRLV e a vistoria. Só quando
  isso fecha é que a equipe manda para a Auditoria, e daí segue o fluxo de sempre:
  `autorizar_entrada_lead` → veículo ativo → primeira cobrança. O aceite aparece como faixa verde
  em `/vendas/[id]` e na ficha do portal do vendedor.
- **Quem aceita fica registrado:** `CLIENTE` (no próprio celular) ou `VENDEDOR` (aceite presencial),
  com nome, CPF/CNPJ, data/hora, **IP e user-agent** — é a prova do consentimento.
- **O link da proposta sai na hora.** Fechada a negociação, a tela de sucesso mostra
  `<LinkDaProposta>`: abre `/cotacao/<token>` (a mesma página pública que o CRM já usava), copia o
  link e manda no WhatsApp. O mesmo componente aparece em `/vendedor/leads/[id]`, para o vendedor
  reenviar. O cliente não depende de e-mail para ver o que contratou.
- **Vistoria não aparece aqui.** Ela só faz sentido com a venda fechada: a tela de sucesso avisa que
  o próximo passo é a vistoria, e ela acontece no portal do vendedor (0040).
- **Segurança:** as rotas públicas rodam com service_role e só acham o atendimento por
  `token_publico`. Erro de banco não vai cru para o cliente — `mensagemDeErro`
  (`src/lib/venda-publica.ts`, testado) deixa passar o texto das nossas regras e esconde o técnico.

## Portal do Associado (0044) — `/portal`
- **Estrutura de pastas (não quebrar):** o guard fica em `src/app/portal/(associado)/layout.tsx`
  e as telas protegidas dentro desse route group; **`/portal/login` fica FORA dele**, em
  `src/app/portal/login/`. Ver o gotcha "Tela de login NUNCA pode ficar sob o layout que exige
  sessão" — foi bug real, com o login inalcançável para todo mundo.
- **Não existe "criar acesso" para o associado** (diferente do vendedor): a rota de login cria o
  usuário de auth na hora, e SÓ quando a senha digitada é o documento. O e-mail do auth é interno
  (`<doc>@portal.smartcarbrasil.com.br`), nada é enviado para lá — o contato real é `clientes.email`.
- **"Credenciais inválidas" é a mesma resposta para CPF inexistente e senha errada**, de propósito:
  não confirmamos a quem pergunta se um CPF é associado da casa. Cadastro `cancelado` é o único
  caso com mensagem própria. Depende de `SUPABASE_SERVICE_ROLE_KEY` no VPS (usa o admin client).
- **Quem entra:** quem tem cadastro em `clientes` ligado ao próprio login. Login por **CPF/CNPJ**;
  no primeiro acesso a senha é o próprio documento, e o portal **não mostra nada** antes da troca
  (`<TrocaSenhaObrigatoria>` ocupa a tela inteira).
- **A senha do primeiro acesso é conveniente e fraca ao mesmo tempo** — quem souber o CPF entra.
  Por isso a troca é obrigatória, a nova senha não pode ser só números, e o acesso fica carimbado
  (`portal_primeiro_acesso_em`). Se um dia quiser endurecer: pedir também a data de nascimento ou
  um código por WhatsApp no primeiro acesso.
- **4 telas, mobile-first** (barra inferior no celular, menu navy no desktop): Meus veículos ·
  Financeiro · Pagamento · Meu perfil. Mesma marca da página de venda — quem contratou reconhece.
- **Financeiro mostra TODOS os boletos**, com filtro (a vencer / vencidos / pagos) e a 2ª via
  com linha digitável, PIX copia-e-cola e PDF. Quando o banco ainda não devolveu nada,
  `portal_segunda_via` **diz isso** em vez de exibir um boleto vazio.
- **Cartão de crédito — o número nunca chega ao nosso banco.** O caminho é
  `navegador → rota (memória) → gateway → token`. `cartoes_cobranca` só tem token, bandeira e os
  4 últimos dígitos; `portal_registrar_cartao` não tem parâmetro para o PAN nem para o CVV, então
  não há como gravá-los nem por engano. Guardar PAN exigiria PCI-DSS.
  `PaymentGateway.tokenizarCartao` é o novo ponto do contrato: o `MockGateway` devolve um token
  determinístico (dá para testar a tela hoje) e o `AsaasGateway` tem o esqueleto documentado
  (`POST /creditCard/tokenize` → `creditCardToken`), aguardando a chave.
- Espelho puro em `src/lib/cartao.ts` (Luhn, bandeira pelo BIN, validade, CVV por bandeira) com
  testes — o erro de digitação é pego antes de sair da tela.

## Segurança das RPCs (0052) — o que vale para SEMPRE
- **`execute` em função nasce concedido a `public` no Postgres, e o PostgREST publica toda função
  do schema como RPC.** Ou seja: sem revogar, qualquer função é chamável com a **chave `anon`**,
  que vai no bundle do navegador. Função `security definer` ignora RLS — a proteção tem de estar
  dentro dela.
- **RITO OBRIGATÓRIO: toda migration que cria função termina com este bloco.**
  ```sql
  revoke execute on all functions in schema public from public;
  revoke execute on all functions in schema public from anon;
  grant  execute on all functions in schema public to authenticated;
  grant  execute on all functions in schema public to service_role;
  ```
  `alter default privileges ... revoke execute from public` **NÃO resolve** — testado: a função
  criada em seguida nasce de novo com `=X/` (PUBLIC). Quem esquecer o bloco **não passa no
  `npm run test:db`**: o teste `0052` falha listando as funções que ficaram abertas para o `anon`.
- **`authenticated` NÃO é a equipe.** O associado do `/portal` tem login desde a 0044 e é
  `authenticated` como qualquer atendente. Portanto "estar logado" nunca foi controle de acesso:
  quem lê dado da operação precisa ser **staff** (`is_staff()` = tem linha em `usuarios`).
- **Padrão da trava dentro da função:** `is_staff() or auth.uid() is null`.
  Com sessão → tem de ser staff. Sem sessão → é o caminho público, que roda por `service_role` no
  servidor (hotlink, cotação pública, webhook) e é confiável. O `anon` não chega lá, porque perdeu
  o `execute`.
- **As páginas públicas não dependem de `anon`:** `/v/<codigo>` e `/cotacao/<token>` são server
  components com `service_role`, e as rotas `/api/v1/hotlink/*` também. Por isso o `anon` ficou
  sem nenhuma RPC — e não há caminho público quebrado.
- **Cada rota de API carrega o próprio guard.** O middleware protege as PÁGINAS; para `/api/*` ele
  não redireciona (verificado). Toda rota nova precisa do seu `getUser()` + checagem de papel — as
  que usam `service_role` sem sessão (hotlink, portal/login) são públicas de propósito.
- **RLS não restringe COLUNA.** Policy que libera a própria linha (`id = auth.uid()`) libera a
  linha inteira — foi assim que qualquer usuário podia se promover a admin (0054). Quando só
  alguns campos podem mudar, a trava é **trigger**, não policy.
- **A regra que a service_role tem de respeitar vive no BANCO.** A rota `/api/usuarios` usa
  service_role (para mexer em `auth.users`), e service_role ignora RLS: por isso a trava do último
  admin é trigger, não checagem na rota. A rota só dá a mensagem bonita.
- **⚠️ O TESTE DA 0052 MEDE 0 LOCALMENTE E 223 EM PRODUÇÃO — e os 223 não são nossos.**
  Conferido em 20/09/2026, depois da 0082: as funções expostas ao `anon` em produção são
  **todas de extensão** — `btree_gist` (188, da 0081), `pg_trgm` (31) e `unaccent` (4, da 0079).
  **Zero são nossas:** o ACL de toda RPC do sistema é `{postgres=X, authenticated=X,
  service_role=X}`, sem PUBLIC e sem `anon`. A diferença é de DONO: no harness local quem cria a
  extensão é o mesmo papel que roda o `revoke`, então ele alcança; em produção a extensão pertence
  ao `supabase_admin` e o `revoke` do SQL Editor (rodando como `postgres`) **passa por ela em
  silêncio** — REVOKE em objeto de outro dono avisa e segue, não falha. São funções de suporte de
  operador (`gbt_int_consistent`, `similarity`, `unaccent`), não leem dado nosso e são a interface
  normal das extensões. **A invariante que importa — nenhuma RPC nossa chamável pela chave do
  navegador — vale em produção.** Ao reconferir, não olhe o total: agrupe por extensão
  (`pg_depend`/`pg_extension`) e confira que a linha "(nossa)" não aparece.
- **Login do portal tem freio** (`src/lib/rate-limit.ts`, testado): 5 tentativas por documento e
  30 por IP a cada 10 min; acertar a senha zera o contador do documento. É o alvo óbvio do sistema
  porque a senha do primeiro acesso é o próprio CPF. O contador vive na memória do processo —
  serve para UM container, que é o caso hoje; com mais de uma instância, trocar por Redis/tabela.

## Fornecedores — UM cadastro para quem presta serviço (0051)
- **Prestador da 24h, rastreadora e fornecedor de peças são a mesma entidade:** uma empresa que
  presta serviço para a associação. Tudo vive em **`fornecedores`**; o que muda é a **marcação de
  tipo** (`prestador_assistencia`, `empresa_rastreamento`) e os campos que só aquele tipo usa.
  Uma empresa pode ser as duas coisas — a que reboca às vezes é a que instala o rastreador.
- **Nunca criar tabela nova de "cadastro de empresa".** Foi o erro que a `0051` desfez: a
  `empresas_rastreamento` (0049) era uma tabela paralela para a mesma coisa, e ainda por cima
  morava em **Configurações**, que só admin e financeiro abrem — justamente quem *não* faz esse
  cadastro no dia a dia.
- **Um formulário só:** `<ModalFornecedor>` (`src/components/fornecedores/modal-fornecedor.tsx`),
  usado por `/fornecedores` e pela aba **Prestadores** da Assistência 24h. As seções de 24h e de
  rastreamento aparecem conforme a marcação. Mesma escolha do `<ModalVendedor>`: dois lugares de
  entrada, um formulário para manter.
- **`/fornecedores` tem abas** (Todos · Peças e serviços · Prestadores 24h · Rastreadoras) e aceita
  `?tipo=rastreadora` na URL — é para lá que o módulo de Rastreadores manda quem quer cadastrar.
- **O que fica em cada tela:** o *cadastro da empresa* é sempre em Fornecedores; a
  Assistência 24h cuida do que é dela (**serviços atendidos e valores acordados**), e o módulo de
  Rastreadores, do parque de equipamentos.
- **`documento` é OPCIONAL** desde a `0051` (segue validado quando informado): o cadastro de
  rastreadora absorvido não exigia CNPJ e prestador pequeno às vezes entra sem. Ao salvar, campo
  vazio tem de virar **null** — duas empresas com `''` colidiriam no unique.
- **Consulta de CNPJ com 3 provedores (13/10/2026):** `/api/cnpj` tenta BrasilAPI → CNPJ.ws
  (publica) → ReceitaWS, com User-Agent e 7 s cada; leituras puras em `src/lib/cnpj-provedores.ts`
  (testadas). A BrasilAPI sozinha falhava em produção e a tela só dizia "preencha manualmente";
  agora o erro mostra o que cada provedor respondeu e o servidor loga `[cnpj]`
  (`docker compose logs app | grep cnpj`). Nulo do provedor não apaga o que foi digitado.
- **Busca de fornecedor = `fornecedorCasaComBusca` (`src/lib/fornecedores.ts`, testada):** fantasia,
  razão social, cobertura, contato e CNPJ, sem acento. **O bug que ela corrigiu:** a busca antiga
  fazia `documento.includes(termo sem não-dígitos)` e, para qualquer texto, isso é `includes('')` =
  sempre verdadeiro — a lista nunca filtrava. Vale em `/fornecedores` e na aba Prestadores da 24h;
  os seletores de fornecedor usam `rotuloFornecedor` ("FANTASIA (RAZÃO)"). Ainda mostram só a
  razão: os seletores de prestador do acionamento (`prestadores_do_servico` não devolve fantasia —
  precisa de migration).
- **A cotação do acionamento lista TODO prestador ativo (13/10/2026).** Antes só apareciam os que
  têm o serviço vinculado em `prestador_servicos` (`prestadores_do_servico`), e 10 dos 13 prestadores
  ativos, recém-cadastrados, não tinham nenhum: sumiam da OS e da troca de prestador. Agora
  `opcoesPrestadorDoServico` (`src/lib/fornecedores.ts`, testada) põe os vinculados primeiro (com o
  valor acordado) e os demais no grupo "sem valor acordado". O banco já aceitava: sem acordo, valem o
  valor padrão e o KM do serviço.
- **HISTÓRICO FINANCEIRO DO FORNECEDOR (25/10/2026, sem migration):** aba **Histórico financeiro** em
  `/fornecedores` (e o ícone de recibo em cada linha; URL `?aba=historico&fornecedor=<id>`), só para quem tem
  `financeiro.ver`. Lista todos os títulos a pagar/receber do fornecedor (`useHistoricoFornecedor`, até 1.000,
  RLS do lançamento) com os pagamentos de cada um, totais (pago, a pagar, vencido, recebido) e filtro. **Clicar
  na linha abre a ORIGEM** (`origemDoLancamento`, `src/lib/origem-lancamento.ts`, testada): OS da 24h
  (`/assistencia?acionamento=`, pelo reverso de `acionamentos_assistencia.lancamento_id`) > terceiro do evento
  (`/eventos/<id>/terceiros/<t>?aba=financeiro`) > evento (`/eventos/<id>?aba=financeiro`) > o próprio título
  (`/financeiro?lancamento=<id>`, a carteira mostra só ele com "Ver toda a carteira"). Título antigo de OS que
  trocou de prestador perde o vínculo (a OS aponta para o novo) e cai no Financeiro.
- **A lista de fornecedores passa de 1.000 linhas** (1.253 em 26/10/2026, depois da importação por planilha):
  `useFornecedores`, `usePrestadores` e `useEmpresasRastreamento` leem com `lerTodas`. Antes o corte silencioso
  do PostgREST escondia o que vinha depois da posição 1.000 na ordem alfabética (caso REDE TOP10 CAR,
  CNPJ 23319065000108: não aparecia na lista e o cadastro novo dava "documento já cadastrado"). O erro de
  documento duplicado agora diz o NOME de quem já tem o documento.
- **Quem cadastra:** `pode_cadastrar_fornecedor()` = admin/financeiro + time da 24h + **gestor
  regional**.
- **IMPORTAÇÃO POR PLANILHA (25/10/2026, sem migration):** Fornecedores → **Importar planilha**
  (`<ImportarFornecedores>`, `src/components/fornecedores/importar-fornecedores.tsx`; botão só com
  `fornecedores.criar`). **Baixar modelo** gera o `.xlsx` na hora (`modeloFornecedoresXlsx`,
  `src/lib/planilha-xlsx.ts`: aba Fornecedores com colunas em TEXTO — o Excel não come o zero do
  CNPJ/CEP —, SIM/NAO em lista e a aba Instrucoes). Só RAZAO SOCIAL é obrigatória. **Anti-duplicidade**
  (`montarPreviaFornecedores`, `src/lib/fornecedores-import.ts`, testada): casa pelo CNPJ/CPF; sem ele,
  pelo nome (razão ou fantasia, sem acento, pontuação e LTDA/ME/EIRELI/SA) contra cadastro sem documento
  ou com o mesmo; nome igual com CNPJ diferente entra como NOVO com aviso (filial); repetido na planilha
  e CNPJ/CPF com dígito errado ficam de fora. **Já cadastrado nunca é sobrescrito:** com a opção marcada
  (padrão), só os campos VAZIOS são completados e as marcas 24h/rastreadora só são acrescentadas;
  endereço só entra se o cadastro não tem nenhum. CNPJ que perdeu o zero no Excel é completado. A linha
  de exemplo do modelo é ignorada. Grava pelo cliente (RLS), em blocos de 100; bloco recusado é refeito
  linha a linha e a tela diz qual linha falhou. Leitura de `.xlsx` compartilhada com vendedores
  (`matrizDeXlsx`). Cadastro operacional não pode depender de quem tem acesso a Configurações.

## Rastreadores (0049 + 0050 + 0051) — arquitetura
> A especificação que originou a fase 2 está em `docs/modulos/rastreadores.md`, com um cabeçalho
> dizendo o que foi traduzido para as convenções do SCar (ela foi escrita sem ver o repositório).

**São dois níveis, e a diferença importa:**
- **Ficha do veículo (0049)** — "o que está instalado neste carro": IMEI, Nº do chip e a
  rastreadora, em `veiculos`. É o que o SAC lê no atendimento.
- **Parque de equipamentos (0050)** — "onde estão os meus 2.400 aparelhos": a tabela
  `rastreadores`, um registro por IMEI, com estoque, ciclo de vida e histórico.
- **A ficha virou ESPELHO do parque.** Instalar/desinstalar escreve os três campos do veículo por
  trigger (`fn_rastreador_espelha_veiculo`). Quem digitar o IMEI direto na ficha não quebra nada,
  mas aparece na divergência `FICHA_SEM_EQUIPAMENTO` — é assim que a base antiga vai sendo
  puxada para o módulo.
- **Rastreador COBRADO ≠ rastreador INSTALADO.** O preço continua em
  `tipos_veiculo.exige_rastreador` (0019) e agora também em `planos_protecao.exige_rastreador`;
  o equipamento é outra coisa. As duas flags alimentam a divergência "veículo sem rastreador".

**Mapeamento com o que já existia** (não criar estrutura paralela):
| Conceito do sistema antigo | No SCar |
|---|---|
| Filial (Cuiabá, Grande Natal…) | `regionais` — a unidade já é o eixo de RLS (`pode_regional`) |
| Plataforma (D Traker, Lógica…) | `fornecedores` com `empresa_rastreamento = true` (0051), + `custo_mensal_equipamento` e `api_config` |
| Associado / veículo | `clientes` / `veiculos` |

- **Os 11 status guardam o número que a equipe fala** ("2 - Ativo/Instalado"):
  `numero_status_rastreador()` no banco e `STATUS_RASTREADOR` em `src/lib/rastreador.ts`.
- **Máquina de estados em dois lugares, de propósito:** `transicao_rastreador_valida()` no banco
  (é ela que vale) e `transicoesValidas()` no TS (é ela que monta o menu). Mexeu numa, mexa na
  outra e no teste — há teste dos dois lados. `BAIXADO` é terminal; `BAIXADO`/`DUPLICADO`/
  `COBRAR_RASTREADOR` exigem motivo; **ativar é instalar** (precisa do veículo, então nem aparece
  no menu de status).
- **Prazos contam de `status_desde`,** carimbado pela trigger BEFORE a cada troca de status:
  `A_DEVOLVER` > 5 dias sugere cobrar, `INADIMPLENTE` > 35 sugere pedir de volta, `MANUTENCAO` e
  `BOLETO_GERADO` > 30 destacam. `alertaDePrazo()` (testado) mostra isso na lista e na ficha.
- **Histórico é da TRIGGER, não da aplicação** (`rastreador_eventos`, append-only, sem update nem
  delete para ninguém). O motivo digitado na tela chega por
  `set_config('scar.motivo_rastreador')`, mesmo mecanismo da auditoria da OS 24h.
- **Divergências (`rastreadores_divergencias`) são o coração do módulo** — 9 tipos, uma consulta
  só, com severidade: veículo que exige rastreador e não tem · equipamento ativo sem veículo ·
  equipamento em veículo fora da base · inadimplente com equipamento ativo · dois ativos no mesmo
  veículo · série repetida · status incoerente/prazo estourado · **ficha do veículo com IMEI que
  não existe no parque** · cadastro incompleto.
- **Telas:** `/rastreadores` com 3 abas (Parque · Divergências · Relatórios) + `/rastreadores/[id]`
  (ficha, ações e linha do tempo) + `/rastreadores/divergencias` como rota própria.
  Cadastro **manual** é a única porta de entrada de dados nesta fase.
- **A lista é paginada NO BANCO** (`rastreadores_listar`, 50 por página com `total_registros` na
  própria linha): o parque tem milhares de equipamentos e nunca vem inteiro para a tela.
- **Isolamento:** todas as RPCs são SECURITY DEFINER e resolvem a unidade por `escopo_regional()`
  — passar o id de outra franquia não muda o que volta. Baixa de patrimônio (`BAIXADO`/`DUPLICADO`)
  só com `tem_acesso_global()`.
- **O equipamento obedece ao cadastro e ao financeiro (0053):** veículo que sai da base empurra o
  rastreador para *4 - Inativo* por trigger; `sincronizar_rastreadores_inadimplencia()` marca
  *3 - Inadimplente* quem passou de 35 dias de atraso e devolve para *2 - Ativo* quem pagou (botão
  **Aplicar inadimplência** na aba Divergências); `instalar_rastreador` recusa associado devendo
  (a matriz libera, a ponta não); `cobrar_rastreador()` gera o título do equipamento não devolvido
  e move para *7 - Boleto gerado*. O SAC mostra "rastreamento suspenso" na ficha do veículo
  (`situacao_rastreamento_veiculo`).
- **A leitura de atraso é UMA para o sistema todo:** `dias_atraso_cliente()` — a mesma que a
  Assistência 24h usa. Não criar outra régua de inadimplência.
- **Fora do escopo por decisão (não é esquecimento):** importação em massa do TrackerStock e
  integração por API. A fronteira existe (`api_config`, `ultima_comunicacao`, `ultima_posicao`,
  evento `IMPORTACAO`), sem produtor.

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
  SQL Editor, na ordem; (B) `.\scripts\deploy.ps1` (Windows) ou `npm run deploy` — os dois ja
  levam o `DOCKER_BUILDKIT=0` embutido.
- **MIGRATION: o agente aplica, COM AUTORIZACAO a cada uma** (decisao de 10/10/2026, substitui
  a de 20/09). Caminho: `execute_sql` com o arquivo inteiro (o hook pede a aprovacao); NUNCA
  `apply_migration` (esta em `deny`: a `schema_migrations` nao existe, e criar a tabela com uma
  linha faria o banco jurar que a historia comeca ali). Detalhes em "Qual e o banco".
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

## Consulta por PLACA: são DOIS blocos na mesma resposta (0075)
- **A resposta do `getplacafipe` tem duas partes, e elas respondem perguntas diferentes:**
  `fipe[]` é a **AVALIAÇÃO** (valor, código FIPE, mês de referência, marca/modelo comercial) e
  **`informacoes_veiculo` é o REGISTRO do documento** — `chassi`, `motor`, `cor`, `ano`,
  `municipio`, `uf`, `cilindradas`, `potencia`, `placa_alternativa`.
- **🔴 O BUG QUE ISSO CORRIGIU: o proxy lia só o primeiro bloco e jogava o segundo fora.** O
  sintoma era "a consulta funciona mas o chassi não vem" — e vinha, desde sempre. Três campos
  ficavam vazios **juntos** (chassi, cor e ano de fabricação), porque eram os únicos que não
  tinham fonte no bloco da avaliação. **Quando um subconjunto exato de campos falha e o resto
  passa, procure a FONTE comum deles, não o campo.**
- **`registroDaPlaca()` (`src/lib/fipe.ts`, testada) é quem lê o registro.** Normaliza como o banco
  espera: chassi só alfanumérico em caixa alta (o mesmo `regexp_replace` de
  `autorizar_entrada_lead`, 0034) e o resto em CAIXA ALTA, pela convenção de cadastro — dado de
  fora entra padronizado, como já acontece com o ViaCEP.
- **Bloco ausente devolve `null`, nunca um objeto de campos vazios.** A tela usa
  `reg?.campo ?? f.campo`: consulta sem registro **não pode apagar** o que o atendente já digitou.
- **O payload real está guardado no teste** (`src/lib/fipe.test.ts`, placa OAW0838, 12/09/2026).
  Foi ele que provou onde o chassi mora — sem amostra real no repositório a próxima sessão chuta o
  formato de novo, que é o erro que este módulo já cometeu duas vezes no Mutual.
- **São QUATRO os caminhos que consultam placa, e é preciso mexer nos quatro:**
  `/veiculos` (botão *Consultar*), a captura da venda (`<NovoLeadCotacao>`, que serve o CRM **e** o
  portal do vendedor), a página pública do hotlink (`/api/v1/hotlink/veiculo`) e o
  **`<FechamentoVenda>`**. Na captura os campos não aparecem — a tela é curta de propósito —, mas
  vão gravados no lead e o fechamento abre com eles prontos; o que foi capturado é mostrado em uma
  linha discreta, para não virar mágica invisível.
- **🔴 O FECHAMENTO DA VENDA É O GRANDE VALIDADOR — ele tem consulta PRÓPRIA.** Foi a primeira
  coisa que faltou no teste em produção: consultar só na captura e no hotlink não basta, porque o
  lead chega ao fechamento sem nada em três situações comuns — foi criado antes da consulta
  existir, foi digitado à mão, ou a placa não resolveu na hora. E é ali que chassi, cor e ano de
  fabricação viram **obrigatórios** para entrar na base, com o cliente ainda na linha. Botão de
  lupa ao lado da Placa, na aba *Veículo*.
- **E lá a consulta é CONFERÊNCIA, não sobrescrita** (`conferirRegistroDaPlaca`, em
  `src/lib/vendas.ts`, testada): campo **vazio** é preenchido; campo **igual** não faz nada; campo
  **diferente** vira uma linha de divergência, com o valor da ficha riscado ao lado do valor do
  documento e um botão *usar o do documento*. Quem está fechando leu o CRLV e conversou com o
  cliente — apagar isso em silêncio troca um erro por outro que ninguém vê. A comparação ignora
  acento, pontuação e caixa, senão toda consulta acusaria diferença.
- **O `modelo` é exceção deliberada na comparação:** o comercial da FIPE
  ("COROLLA XEI 2.0 FLEX 16V AUT.") nunca bate com o abreviado do documento ("COROLLA XEI 20FLEX").
  Acusar isso seria ruído em toda consulta — e **ruído constante ensina a ignorar o aviso de
  verdade**. Só diverge quando nem os primeiros caracteres batem (aí é outro carro).
- **`valor_fipe`/`codigo_fipe` ficam FORA da conferência do fechamento, de propósito.** A cotação
  já foi aceita, e é `leads.valor_fipe` que vai para `veiculos` em `autorizar_entrada_lead` (0034):
  atualizar o valor ali mudaria, em silêncio, o FIPE que o associado passa a carregar — sem mudar o
  preço que ele aceitou. Reprecificar é outro ato, na cotação.
- **O NÚMERO DO MOTOR não tinha coluna (0075)** — entrou em `veiculos` e em `leads`. Nas duas
  pontas de propósito: o veículo nasce por dois caminhos (cadastro direto e rota da venda), e uma
  coluna só em `veiculos` faria o motor sumir em toda venda, justamente o caminho em que a placa é
  consultada primeiro. **Ele não é `unique`, e não entra no `checklist_lead`:** motor se troca de
  carro, base legada repete, e nem todo documento traz — duplicidade aqui é relatório (padrão de
  `rastreadores_divergencias`), não constraint que recusa cadastro no balcão.
- **Com o chassi vindo preenchido, a colisão no `unique` deixou de ser hipótese:** `/veiculos`
  passou a traduzir o erro para "Chassi já cadastrado em outro veículo" (e o mesmo para Renavam).
  É o carro já cadastrado com outra placa — transferência, clonagem ou cadastro duplicado —, e o
  texto cru do Postgres não levava ninguém a conferir isso.
- **`/api/placa` é OUTRO provedor, opcional, e nunca foi configurado** (`PLACA_API_URL`). Não
  confundir: ele continua no código como fonte extra, e sem a env devolve `found: false` sem sair
  para a rede.

## Gotchas já resolvidos (não repetir)
- **Lista de pessoas para ESCOLHER não sai de `from('usuarios')`**: a policy só mostra a própria linha a quem não é admin/financeiro/gestor, e o seletor de quem não é da matriz vem só com o próprio nome. Use `useEquipeAtiva()` (0133).
- **Sem `error.tsx` toda falha de tela vira "Application error: a client-side exception has occurred"**,
  sem pista nenhuma. Desde 21/10/2026 há tela de erro (`<TelaErro>`, `src/components/ui/tela-erro.tsx`) em
  `(dashboard)`, `regional`, `vendedor`, `portal/(associado)` e `global-error.tsx`: mostra a mensagem, a tela e
  a hora, com *Copiar detalhes* e *Tentar de novo*. Portal/área nova ganha o seu `error.tsx`.
- **RLS com função POR LINHA trava a tela quando a tabela cresce.** `pode_regional(regional_id)` é SQL
  security definer — o planejador não a abre, então cada linha roda `auth_papel()`, `is_staff()` e
  `auth_regional_id()` (quatro selects em `usuarios`). Com 6.808 veículos, cada página de 1.000 do
  `lerTodas` levava 2,8 s (e o filtro roda na tabela TODA antes do ORDER BY de cada página): `/veiculos`
  passou a ~20 s depois da carga do Mutual. Corrigido na 0108 com `(select tem_acesso_global())` e
  `regional_id = (select auth_regional_id())` (InitPlan: uma vez por consulta) — 1.430 ms → 4 ms.
  **Policy nova em tabela que cresce: nunca função com argumento da linha; embrulhe em `(select ...)`.**
  E lembre que a policy `*_write` (FOR ALL) também entra no SELECT — reescreva as duas.
- **Tela de login NUNCA pode ficar sob o layout que exige sessão.** `/portal/login` nasceu em
  `src/app/portal/login/`, herdando o `layout.tsx` do portal — e ficou inalcançável nos DOIS
  sentidos: sem sessão o layout redirecionava para `/portal/login` (a própria página: loop) e
  com sessão de staff o `portal_perfil()` voltava vazio e jogava para `/dashboard`. Solução:
  o guard vive em `src/app/portal/(associado)/` — route group **não entra na URL** — e o login
  fica em `src/app/portal/`. **Tela nova do portal vai dentro de `(associado)`; o que for
  público fica fora.** Sintoma no build: a página pública sai como `ƒ` (dinâmica) em vez de
  `○` (estática), porque o layout pai chama `getUser()` a cada request.
- **`create trigger` não aceita `if not exists`** — sempre `drop trigger if exists <nome> on
  <tabela>;` antes, senão a migration não é re-executável e re-rodá-la no SQL Editor para com
  `42710: trigger already exists` (mordeu na 0044 e **de novo na 0049**, já no SQL Editor de
  produção; padrão já usado em 0024/0028/0031/0032/0034).
  Vale o mesmo raciocínio de `create policy` (logo abaixo).
- **Chave estrangeira nova pode quebrar um `select` com embed.** `leads.aceite_cotacao_id` (0042)
  criou a SEGUNDA relação entre `cotacoes` e `leads`; o embed `from('cotacoes').select('*, leads(...)')`
  virou ambíguo, o PostgREST passou a devolver erro, `data` ficou nulo e `/cotacao/<token>` caía em
  **404 silencioso**. Em link público, prefira duas consultas a um embed — nenhuma FK futura o quebra.
  Se usar embed, desambigue pelo nome da constraint (`leads!cotacoes_lead_id_fkey(...)`).
- **`create or replace function` recusa mudança nas colunas de OUT** ("cannot change return type of
  existing function"): quando a assinatura de retorno muda, `drop function if exists <nome>(<tipos>)`
  ANTES. Aconteceu com `registrar_captura_hotlink` (0041→0042→0043).
- **`create policy` não tem `if not exists`:** sempre `drop policy if exists` antes, senão a migration
  não é re-executável (0040/0041).
- **Seed idempotente: prefira `insert ... select ... where not exists` a `on conflict`.** O
  `on conflict (col)` depende da INFERÊNCIA do índice único: num banco onde esse índice esteja em
  outra forma (criado à mão, `deferrable`) a cláusula é recusada/ignorada e o insert estoura
  `23505 duplicate key`. Mordeu no seed do alerta "Rastreador pendente" (0049) rodando no SQL
  Editor de produção — e **não reproduzia no harness local**, onde o índice é o do `create table`.
- **Migration que depende de coluna criada em outra** deve garanti-la com `add column if not exists`:
  o corpo de uma função plpgsql só é validado na CHAMADA, então a falta da coluna não aparece na
  aplicação — aparece com o cliente na tela (0043).

- **Redirecionar sem levar os cookies APAGA a limpeza da sessão.** No
  `updateSession` (middleware), o `getUser()` pode escrever cookies em `response` —
  e quando o refresh token é recusado, o que ele escreve é a ORDEM DE APAGAR a
  sessão morta. Devolver um `NextResponse.redirect` novo joga essa limpeza fora:
  o navegador fica com um cookie inválido que ninguém remove, toda rota
  protegida bate no login e o próprio login parte de uma sessão corrompida.
  Sintoma: **"deslogou e não loga mais"**, que só saía limpando os cookies do
  site na mão. Todo `NextResponse.redirect` do middleware tem de copiar
  `response.cookies` antes de retornar.
- **Campo de senha SEM `autocomplete` não é só aviso do Chrome.** Sem
  `autoComplete="username"` no e-mail e `"current-password"` na senha, o
  gerenciador do navegador não preenche nem oferece salvar — e quem dependia do
  preenchimento automático "não consegue mais entrar". O `/login` do staff era o
  único campo de senha do sistema sem isso.
- **`?redirect=` da URL é escrito por quem manda o link, não por nós.** O login
  usava direto no `router.push`, então `/login?redirect=https://site-falso/`
  levava a pessoa para fora do domínio logo depois de digitar a senha (phishing
  com a nossa tela legítima). Passa por `destinoDoLogin` (`src/lib/auth-mensagens.ts`,
  testado), que só aceita caminho interno e barra também `/api/*` — logout durante
  uma chamada de API gravava `redirect=/api/...` e o login terminava numa tela de
  JSON, indistinguível de "não entrou".
- **O PostgREST corta em 1.000 LINHAS, em silêncio.** `select` sem `range` devolve no máximo
  1.000 (max-rows), sem erro nem aviso. Depois da carga do Mutual, `veiculos` (2.898) e `clientes`
  (2.564) passaram disso: **1.898 veículos sumiram de `/veiculos`** — busca, "Editar Veículo" do SAC
  (`?editar=<id>` procura na lista carregada) e os seletores de associado/veículo de outras telas.
  Relatado com a placa QQQ5D49 (posição 2.194) em 12/10/2026. Correção: `lerTodas`
  (`src/lib/paginacao.ts`, testada) em `useVeiculos` e `useAssociados`, com `id` como desempate da
  ordem. **Lista que carrega a tabela inteira para filtrar na tela usa `lerTodas` ou pagina no
  banco** — e RPC que devolve conjunto também é cortada em 1.000.
- **…e `lerTodas` numa LISTA DE TELA virou a "demora extrema" (15/10/2026).** Com 6.807 veículos e
  5.496 associados, `/veiculos` e `/associados` faziam ~13 requisições de 1.000 em sequência (~250 ms
  cada no banco + ~4 MB) e desenhavam milhares de linhas; o modal do veículo e o lançamento
  financeiro montavam `<select>` com 5.500 associados. Agora: `useVeiculosPagina`/`useAssociadosPagina`
  (50 por página, `count: 'exact'`, busca no banco por `src/lib/busca-cadastro.ts`, testada; o nome
  do associado vira lista de ids antes do `or`), `<Paginador>`, filtro de situação em `/veiculos`
  (padrão **Na base**), `?editar=<id>` por `useVeiculo(id)` e **`<SeletorAssociado>`** (digita, até 20)
  no veículo, no lançamento financeiro e na boletagem; instalar rastreador busca por placa
  (`useBuscaVeiculos`). Medido: a página custa 11 ms no banco. **No ar e conferido pelo usuário em 16/10/2026 ("ficou rápido").** **Tela nova de cadastro grande:
  paginar no banco e buscar por digitação — `lerTodas` só para quem precisa mesmo do conjunto.**
- **Campo de "ativo" que nenhuma função de segurança lê é uma promessa falsa.** `usuarios.ativo`
  existia desde a 0001 e só a 0068 fez `is_staff()`/`auth_papel()` olharem para ele — 67 migrations
  construídas sobre um checkbox decorativo, com a tela dizendo que ele revogava acesso.
  **Ao criar flag de situação (`ativo`, `bloqueado`, `suspenso`), escreva no mesmo commit quem a
  LÊ** — e um teste que prove o corte, não só a gravação.
- **Quando um SUBCONJUNTO EXATO de campos vem vazio e o resto vem certo, o problema é a FONTE.**
  A consulta de placa preenchia marca, modelo, ano-modelo e valor, e deixava chassi, cor e ano de
  fabricação em branco — os três, sempre. Não era coincidência nem API incompleta: eram os únicos
  campos cuja única fonte era um bloco da resposta (`informacoes_veiculo`) que o nosso proxy
  descartava. **Antes de culpar o provedor, olhe o que os campos que falham têm em comum** — e
  confira o payload cru, que aqui respondeu em um comando o que tinha virado dois diagnósticos
  plausíveis e opostos.
- **Campo vazio não prova que o dado não existe: pode estar na ENTIDADE vizinha.** A unidade do
  Mutual foi procurada em `objeto.regional_id` e `contrato.regional_id` — as duas existem, as duas
  vêm vazias em 100% — e a conclusão foi "o dado não veio", que custou a corrente inventada do
  consultor (0073/0074, quatro saltos por texto) e duas sessões. Ela estava em
  **`PERSON.regional_id`, preenchida em 100%**, a uma chave estrangeira de distância. **O nome da
  chave estava certo o tempo todo; o lugar é que não.** `mutual_campos` (0065) só responde sobre a
  entidade que você perguntou — quando um campo vem vazio em toda a base, **inspecione as
  entidades vizinhas antes de concluir**, e prefira uma corrente de dois saltos por id a uma de
  quatro por texto.
- **`left join` por coluna NÃO ÚNICA multiplica a linha — e um `count(*)` depois dele mente.**
  O funil do consultor (0073) juntava `vendedores` por `email` e por `nome`, que não têm unique
  (só `documento` tem, 0069): cada veículo de um consultor com e-mail repetido virava duas linhas
  e o instrumento de medida passou a contar **16 onde existiam 5**. O pior não é o total inflado,
  é que a inflação acontece **só nas linhas com colisão** — então toda diferença entre etapas vira
  ruído. **Antes de contar sobre um join, pergunte se o lado direito é único**; e quando não for,
  resolva com `lateral ... limit 1` (guardando o fato de haver empate), nunca com `distinct`, que
  faz a colisão sumir da vista. Melhor ainda: resolva o join no nível de quem ele é propriedade —
  o vendedor é atributo do CONSULTOR, não do veículo, e uma vez por consultor são centenas de
  linhas em vez de dezenas de milhares.
- **Status de PAI e status de FILHO não são a mesma coisa.** `contract_status` do Mutual fala do
  ASSOCIADO (um contrato guarda vários veículos); o veículo encerrado de um associado ativo entrava
  como faturável e ia inflar a quarentena com "sem valor" e "sem vencimento" que contrato encerrado
  não tem por que ter (0071). **Ao ler status de uma origem hierárquica, pergunte de QUEM ele
  fala** — e, ao combinar dois, defina explicitamente qual pode PIORAR e qual pode MELHORAR: aqui
  o filho só estreita, nunca ressuscita.
- **`docker compose up -d --build` SEM `DOCKER_BUILDKIT=0` nao publica neste VPS.** O daemon do
  Docker le o `/etc/resolv.conf` cru e consulta o stub `127.0.0.53:53`, que aqui ja ficou **no ar e
  mudo** — o BuildKit para em `failed to resolve source metadata` / `i/o timeout` sem baixar nada.
  **`getent` respondendo NAO prova que o Docker resolve** (ele passa pelo `systemd-resolved` por
  D-Bus, outro caminho), e foi essa pista falsa que fez a investigacao render um dia inteiro.
  Com `DOCKER_BUILDKIT=0` o builder classico usa a imagem do cache local e o deploy passa; o
  `npm ci` roda dentro do contêiner, que recebe DNS proprio do Docker. Conserto definitivo (apontar
  o `/etc/resolv.conf` para o uplink do systemd) e o diagnostico completo estao em `DEPLOY.md`.
- **Lista de status incompleta na tela vira MENTIRA, não vira erro.** Em `/veiculos`,
  `statusMeta` caía no PRIMEIRO item do array quando não encontrava o status — e o primeiro é
  "Ativo". Resultado: `em_evento` e `vistoria_pendente` (que nunca entraram na lista) eram
  desenhados como **Ativo**, e a 0072 teria feito o mesmo com um veículo bloqueado por
  inadimplência. Corrigido na 0072: o array é **completo** e ganhou `manual`, que decide o que o
  FORMULÁRIO oferece — as duas perguntas são diferentes e estavam sendo respondidas pelo mesmo
  array. **Fallback de rótulo nunca deve escolher um valor plausível; deve mostrar o valor cru.**
- **Coluna que o banco preenche e nenhuma tela lê é o mesmo gotcha do `usuarios.ativo`, do outro
  lado.** `leads.aceite_cotacao_id` era gravado corretamente pela `0042` e ficou 34 migrations sem
  nenhum leitor — então o banner do aceite afirmava "proposta aceita" sem saber de QUAL proposta
  falava, e só apareceu quando um lead teve duas cotações. **Ao gravar uma referência (`*_id` para
  o registro que originou o fato), escreva no mesmo commit a tela que a MOSTRA** — senão o dado
  certo fica no banco enquanto a tela conta outra história.
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
- **Para qualquer coisa de VENDA**, comece pelo diagrama "A ROTA DA VENDA, ponta a ponta"
  no topo: ele diz em que arquivo/função cada etapa mora, do hotlink à primeira cobrança.
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

## ESCALA PARA DESKTOP E COTAÇÃO DE APRESENTAÇÃO (31/10/2026, só visual — sem migration)
Pedido do usuário: no PC sobrava espaço, a letra era pequena e a tela de cotação era estreita e sem presença.
- **Causa da letra pequena:** ~900 classes `text-[11px]`/`text-[12px]`… em PIXEL (130 arquivos), iguais em qualquer monitor. Viraram
  `text-[0.6875rem]` etc. (rem). **Classe nova de texto: use `text-xs`/`text-sm`/rem, nunca `text-[Npx]`.**
- **`globals.css` (bloco "ESCALA PARA DESKTOP")**, um lugar só: raiz 17px ≥1280, 18px ≥1536, 20px ≥1920 (só `screen`; PDF/impressão
  intactos) e, de 1024px para cima, o texto miúdo sobe um degrau (10→12px, 11→13px, 12→14px, 13→15px). Abaixo de 1024px nada mudou.
  Para desfazer: apagar o bloco.
- **Cotação (`/vendas/novo` e `/vendedor/leads/novo`, mesmo `<NovoLeadCotacao>`):** largura até 1500px, 2 colunas no PC (veículo e
  dados do lead à esquerda, planos à direita; no celular segue 1-2-3), barra de ação que acompanha a rolagem. Planos num painel
  **escuro nos dois temas** (`bg-faixa`) com `<CartaoDoPlano>` (`src/components/vendas/cartao-plano.tsx`): ícone, nome, preço grande,
  botão, itens ao selecionar. Botão **"Apresentar ao cliente"** esconde o formulário e a barra (nada interno aparece: Assistência
  Profissional continua só no formulário). Lógica de preço/preferencial/valor oculto **não mudou**.
- `/vendas/[id]` passou de `max-w-5xl` para `max-w-7xl`.
