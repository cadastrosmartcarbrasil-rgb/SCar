# CLAUDE.md — SCar (Proteção Veicular)

> Memória do projeto. Leia isto no início de cada sessão em vez de varrer o repositório inteiro.
> Mantenha este arquivo atualizado ao adicionar módulos/migrations (é barato e faz o projeto andar rápido).

## Estado atual (retomar aqui) — atualizado ao fim da fase 0032→0051

**Um único projeto, um único repositório: `cadastrosmartcarbrasil-rgb/scar`** (no GitHub o nome
aparece como `SCar`). Trabalho e deploy acontecem no branch **`claude/claude-md-opcao-x-98kfj5`**;
o mesmo commit é espelhado em `claude/financial-dre-improvements-6zfj3k` (branch da sessão).
O `claude/scar-project-btasdf` é o branch padrão do GitHub e está **parado em `953c53c`** — não é
outro projeto, é um default morto. *Sugestão pendente: trocar o branch padrão do repositório para
o de trabalho; esse default morto já causou um dia inteiro de trabalho no branch errado.*

- **Produção:** `https://app.smartvidanet.com.br` — VPS KingHost, Docker + Caddy (HTTPS auto),
  pasta `/opt/scar`.
- **Último commit desta fase:** `a468ead`.
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
cadastro (`src/app/(auth)/login/page.tsx` — gestor com regional → `/regional`; `vendedor_atual()`
→ `/vendedor`; senão `/dashboard`). Só o associado tem login próprio, porque a chave é o CPF.
Públicas, sem sessão: **`/v/<CODIGO>`** (hotlink de venda, vendedor ou franquia) e
**`/cotacao/<token>`** (a proposta).
**Todos os portais dividem a sessão do navegador** — logar como associado derruba a de staff;
para testar, aba anônima.

### Comandos que resolvem 90% da sessão
| Objetivo | Comando |
|---|---|
| Validar tudo antes de commitar | `npm run validate` (tipos → Vitest → migrations+testes de banco+schema → build) |
| Só os testes de banco | `npm run test:db` · um módulo: `npm run test:db -- 0043` |
| Regerar o `supabase/schema.sql` | `npm run schema` (rodar SEMPRE após criar/editar migration) |
| Publicar — **de dentro do VPS** (prompt `root@smartvida:~#`) | `cd /opt/scar && git pull origin claude/claude-md-opcao-x-98kfj5 && docker compose up -d --build` |
| Publicar — **do seu computador** (PowerShell/terminal local) | `ssh root@app.smartvidanet.com.br "cd /opt/scar && git pull origin claude/claude-md-opcao-x-98kfj5 && docker compose up -d --build"` |

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

### Estado de validação (fim da fase)
- **Migrations `0001`..`0051`** + `schema.sql` consolidado aplicam limpos no harness local.
- **28 suites** em `supabase/tests/*.test.sql` — todas passando.
- **Vitest: 385 testes**, `npx tsc --noEmit` limpo e build OK.

### Pendências conhecidas (decisões, não bugs)
- **Logo oficial:** subir o arquivo em `Configurações → Empresa`. Todos os portais e páginas
  públicas já leem `empresa.logo_url`; `public/logo-smartcar.svg` é só o fallback desenhado.
- **Gateway bancário mockado:** `MockGateway` gera linha digitável/PIX fictícios. Ligar o real =
  `AsaasGateway.emitir` (esqueleto pronto) + webhook chamando `registrar_retorno_cobranca`.
- **`/api/boletos/emitir-lote` é a rotina ANTIGA** (mock) — usar `/api/v1/cobrancas/*`. Pode sair.
- **Cadastros que nascem em R$ 0 / 0%:** opcionais novos (Configurações → Produtos), desconto
  máximo por regional (Configurações → Regionais). Hoje nenhum desconto passa sem alçada.
- **`RESEND_API_KEY` não configurada no VPS** — boas-vindas ao vendedor e voucher da 24h não
  enviam e-mail (o sistema avisa e devolve o texto, não finge que enviou).
- **`PLACAFIPE_TOKEN`:** sem ele a página pública cai no valor informado pelo visitante.
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
3. **`editar-cotacao.tsx` não separa o que já vem no plano** (o `/vendas/novo` separa, com selo "no
   plano"), e `selecaoValida(opcionais, [])` com lista vazia é um no-op que promete uma trava que
   não existe ali.
4. **Dono do lead na ficha** — não mostra consultor/vendedor nem permite reatribuir
   (`atribuir_lead` só está em `/regional/leads`).
5. **Busca sem acento no banco** — o `ilike` da Lista casa "JOAO" com "JOAO", não com "JOÃO" (o
   Kanban casa, porque filtra em JS). O certo seria a extensão `unaccent` + índice.

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
- **A escala `slate` é NOSSA, não a do Tailwind.** As faixas **400..700** foram escurecidas para
  metade da luminância original, com 15% de navy misturado — o cinza-claro padrão é fraco demais
  para uma marca navy e `text-slate-400` dava **2.56** de contraste no card branco, reprovado no
  WCAG AA (mínimo 4.5); agora dá 5.35. Redefinir a paleta escurece **todas as telas de uma vez**,
  e foi seguro porque essas faixas são usadas só como cor de TEXTO (zero `bg-`/`border-` nelas).
  **50..300 e 800/900 não foram tocados:** são fundo, borda e título.
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
· **Portal do Vendedor** (`/vendedor`: painel, leads, comissões e perfil do próprio vendedor — PWA)
Vendas/CRM (`/vendas` mobile-first: **agenda do dia** no topo (atrasados + retornos de hoje),
**busca por nome/CPF/placa/telefone** e filtro por consultor, Kanban com "parado há N dias",
captura que **começa na placa**, avisa duplicidade (sem travar) e cota **todos os planos de uma
vez** (FIPE por placa/cascata), contatos e retornos registrados na ficha do lead, **aceite
presencial** com o cliente na frente e envio da proposta por WhatsApp, cotação com
link público `/cotacao/[token]` detalhada/consolidada + print-PDF, esteira com trava de
Auditoria — só papel `auditoria`/`admin` clica "Autorizar Entrada" e efetiva cliente+veículo)
· Associados (painel `/associados/[id]` com abas) · Veículos/Contratos (ficha com Plano/Opcionais,
alertas e **Rastreamento**: IMEI, Nº do chip e rastreadora) · Eventos/Sinistros
(protocolo, reparo próprio/terceiro, financeiro do evento) · Precificação (simulador + editor de
tabela FIPE com reajuste % + importação por planilha, uma por tipo de veículo) · Empresa (logo/diretoria/mandatos/documentos) · **Fornecedores** (um cadastro só: peças/serviços,
prestadores da 24h e rastreadoras, com auto CNPJ/CEP) · **Cobrança** (`/cobrancas`: dashboard + faturas por competência + boletagem em lote +
remessas bancárias) · Financeiro (contas a pagar/receber + baixas + DRE)
· Configurações (regionais, usuários,
vendedores, marcas/modelos, tipos de veículo, cotas de participação (V5..V15), tipos de evento,
produtos, planos/combos (Prata/Ouro/Diamante), contas bancárias, integrações bancárias, plano de
contas)
· **Rastreadores** (`/rastreadores`: parque por IMEI, estoque por unidade/plataforma, instalação no
veículo, manutenção, painel de divergências com o cadastro da frota e relatórios de custo,
recuperação e giro).

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
- **Quem cadastra:** `pode_cadastrar_fornecedor()` = admin/financeiro + time da 24h + **gestor
  regional**. Cadastro operacional não pode depender de quem tem acesso a Configurações.

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
