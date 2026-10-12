# Módulo de Inadimplência e Cobranças

> Origem: *"Módulo de Inadimplência e Cobranças"* (documento 2, Smartcar Brasil, 30/09/2026,
> responsável Rodrigo Medeiros). Decisões do usuário em 12/10/2026: **caminho B** (importar o
> histórico de boletos do Mutual), **criar os perfis Supervisor e Cobrança**, **começar pela Fase 1**.
>
> O documento pede, antes de programar: (1) mapa de telas, (2) modelo de dados, (3) fórmulas,
> (4) regras bancárias, (5) permissões, (6) protótipo, (7) automações e (8) plano de testes.
> As seções abaixo seguem essa ordem. **Fase 1 está construída na migration `0097`.**

## Fases

| Fase | Entrega | Estado |
|---|---|---|
| **1** | Painel de inadimplência + Calendário dos 6 ciclos + histórico do Mutual + perfis | ✅ `0097` |
| 2 | Fila operacional de cobrança, histórico de contato imutável, promessas e acordos | a fazer |
| 3 | Qualidade das vendas: coorte por mês de venda, 1º boleto por vendedor/regional/origem, índice de qualidade | a fazer |
| 4 | Régua configurável (D-x … D+15), tarefas e alertas automáticos | a fazer — depende de agendamento (CRON) e, para WhatsApp/e-mail, de `RESEND_API_KEY` |
| 5 | Relatórios e exportação PDF/Excel com filtros, data/hora e usuário | parcial (CSV em todo bloco) |

## 1. Mapa de telas

Menu **Cobrança** (grupo):

| Tela | Rota | O que faz |
|---|---|---|
| Painel de Inadimplência | `/cobrancas/painel` | Carteira (hoje), financeiro do período, recuperação e qualidade do pagador, leitura automática, comparativos (mês anterior, média de 3, ano anterior), 12 meses e regional × média |
| Calendário de Vencimentos | `/cobrancas/calendario` | Os 6 ciclos do mês com semáforo; cada valor abre os boletos |
| Boletos e Remessas | `/cobrancas/boletos` | O que já existia (0024/0025): resumo, faturas por competência, boletagem em lote, remessas |
| (Integração Mutual) | `/integracao/mutual` → *Histórico de boletos* | Importa/atualiza o histórico de boletos do Mutual |
| (Configurações) | `Configurações → Usuários` | Papéis Supervisor e Cobrança; unidades do supervisor |

**Todo número abre os boletos que o compõem** (`<ModalBoletos>`), com quantidade e soma do filtro
e exportação CSV.

## 2. Modelo de dados

- **`boletos_historico`** — boletos de MENSALIDADE de outro sistema (hoje o Mutual) dos associados
  já carregados. Chave `(origem, id_externo)`; liga ao associado pelo contrato
  (`contract_id → CONTRACT.person_id → vínculo PERSON`) e ao veículo quando o contrato tem um objeto
  só. **Não é `titulos_financeiros` de propósito:** lá entraria no DRE (receita contada duas vezes)
  e em `dias_atraso_cliente()` (a 24h recusaria por dívida que quem cobra é o outro sistema).
  **Fica depois do corte de dezembro** — é a história de pagamento.
- **`supervisor_regionais`** — `(usuario_id, regional_id)`.
- **`cobranca_feriados`** — feriados bancários.
- **`empresa.cobranca_meta_inadimplencia` / `cobranca_limite_inadimplencia`** — o semáforo.
- **Fonte única:** `cobranca_boletos_base()` = títulos do SCar ligados a fatura (mensalidade) +
  histórico do Mutual **antes da data de corte** de cada associado (o 1º boleto do SCar dele).

## 3. Fórmulas (em `src/lib/cobranca-painel.ts`, com teste)

| Indicador | Fórmula |
|---|---|
| Inadimplência financeira | vencido não pago ÷ valor que **já venceu** no período |
| Inadimplência por clientes | clientes com boleto vencido em aberto ÷ clientes com boleto vencido no período |
| Taxa de recuperação | pago em atraso ÷ (pago em atraso + ainda em aberto) |
| Pagamento no prazo | pago até o vencimento efetivo ÷ valor que já venceu |
| Inadimplência inicial | associados cujo **1º boleto** venceu e não foi pago ÷ 1ºs boletos vencidos |
| Reincidentes | inadimplentes do período com atraso (pago em atraso ou em aberto) nos 12 meses anteriores |
| Regularizados | associados que pagaram atrasado **dentro** do período (pela data de pagamento) |
| Comparativo | sempre **pontos percentuais** e **variação relativa** (6% → 8% = +2,0 p.p. e +33,3%) |
| Média 3 meses | média simples das 3 taxas mensais anteriores (recorte sem base não entra como 0) |

**Regra essencial:** boleto que ainda não venceu não entra em taxa nenhuma (o denominador é sempre o
que já venceu). **A situação é a de hoje:** um mês passado mostra quanto dele continua em aberto agora.

**Correção junto:** `resumo_cobrancas` (0025) dividia o vencido por **tudo o que foi emitido**,
incluindo o "a vencer" — a inadimplência ficava menor do que era. Agora: vencido ÷ já vencido.

## 4. Regras bancárias

- **Situação do boleto:** a vencer · vence hoje · vencido · pago no prazo · pago em atraso · cancelado.
- **Vencimento efetivo** = próximo dia útil (fim de semana e `cobranca_feriados`); no Mutual,
  a `payment_limit_date` quando veio. "Vence hoje" não é atraso.
- **Ciclo** = dia do vencimento **original**: 5/10/15/20/25/30; dias fora do padrão vão ao ciclo mais
  próximo, 28-31 e 1-2 ao 30 (mês sem dia 30 vence no último dia).
- **Mutual → situação:** `SUCCEEDED`, `PAGO`, `SUCCEEDED_PENDING`, `SUCCEEDED_DUPLICITY` = pago ·
  `PENDING`, `OVERDUE` = aberto · `CANCELED*`, `CANCEL_ERROR`, `REFUNDED` = cancelado ·
  desconhecido **não entra** e é contado na importação.
- Pago sem data de pagamento (0,6% do histórico) conta como no prazo — não há como provar atraso.
- Datas só-dia do Mutual entram por `mutual_dia()` (sem deslocar fuso).

## 5. Permissões (`cobranca_escopo()`)

| Perfil | Vê |
|---|---|
| Admin / Financeiro | Brasil inteiro + configurações (meta, feriados, importação) |
| Cobrança sem unidade | Brasil inteiro (leitura) |
| Cobrança com unidade | a unidade dela |
| Supervisor | as unidades de `supervisor_regionais` (+ a própria) |
| Gestor regional | a própria unidade |
| Consultor, sinistro, auditoria, 24h, associado | nada (painel diz "sem acesso") |

O escopo vale **dentro das RPCs de cobrança**. `pode_regional()` (as 87 policies) **não** foi tocado:
nos outros módulos o supervisor e a cobrança são staff da unidade do próprio cadastro.

## 6. Protótipo

As telas acima são o protótipo navegável (desktop e celular, tema claro/escuro).

## 7. Automações (fases 2 e 4)

Régua D-x … D+15, tarefa automática em D+1, escalonamento em D+10, alertas (promessa vencida,
inadimplência acima do limite, aumento contra a média, vendedor/campanha com 1º boleto acima da
referência, divergência boleto × pagamento). Dependem de agendamento — o mesmo CRON pendente da
inadimplência do veículo (0072).

## 8. Plano de testes

- Banco: `supabase/tests/0097_cobranca_painel.test.sql` — dia útil e feriado, ciclos, recortes,
  cada situação, indicadores, escopo dos 6 perfis, detalhamento com total, data de corte, fórmula
  corrigida, importação simulada × confirmada, em blocos, re-executável (só regrava o que mudou).
- TS: `src/lib/cobranca-painel.test.ts` — fórmulas, p.p. × relativa, semáforo, leitura automática,
  períodos.
- Critérios de aceite do documento: Vencimento ✅ · Inadimplência (só vencido) ✅ · Pagamento sem
  duplicidade ✅ (fonte única + corte) · Permissão ✅ · Comparativo ✅ · Detalhamento ✅ ·
  Cobrança (contato/promessa) e Qualidade (venda) → Fases 2 e 3.

## Operação

1. Aplicar a `0097`.
2. Em `/integracao/mutual`: **Puxar dados → Faturas (INVOICE)** (a captura atual é de 10/09).
3. Seção **Histórico de boletos** → *Importar / atualizar histórico*. Repetir após cada recaptura e
   cada carga de unidade.
4. `Configurações → Usuários`: criar Supervisor/Cobrança; no supervisor, marcar as unidades.
5. No painel (engrenagem *Meta e feriados*): ajustar meta/limite e cadastrar os feriados bancários.
