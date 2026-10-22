-- 0139 — A REGUA DE COBRANCA: bloqueio, revistoria e inativacao como parametros
--
-- Pedido do usuario (22/10/2026), com as decisoes tomadas na analise:
--   1. Ate o desligamento do Mutual, o veiculo MIGRADO (`cobranca_externa`) NAO e
--      inativado pela regua: quem passa do prazo so sai da fila e fica "a
--      inativar". A sincronia noturna regrava o status do Mutual, entao inativar
--      aqui seria desfeito toda noite. A inativacao de verdade vale para quem e
--      cobrado pelo SCar (e, depois do corte, para todos — o corte desliga a
--      `cobranca_externa`).
--   2. O bloqueio da 24h passa a contar os boletos vencidos do MUTUAL. Ate aqui
--      `situacao_assistencia_veiculo` lia so `titulos_financeiros`, e nenhum
--      migrado era bloqueado por atraso (a carteira inteira e cobrada no Mutual).
--   3. A fila ordena por prioridade e depois pelo MENOR atraso (a maior chance de
--      recuperar), com o cabecalho de atraso clicavel.
--   4. Inativado sai das metricas da fila/carteira e aparece em "Inativados no
--      periodo".
--
-- (A) `empresa.dias_bloqueio_inadimplencia` (1) + a ORDEM dos tres prazos por
--     CHECK: bloqueio <= inativacao e revistoria < inativacao. A revistoria segue
--     a regra da 0137 ("atraso acima de N exige") — o "sem vistoria ate 9 / exige
--     a partir de 10" do pedido e UM numero (N = 9), nao dois.
-- (B) `vencidos_veiculo(veiculo, min_dias)` — boletos vencidos do veiculo nas
--     duas fontes, com o maior atraso. Mutual: so antes do corte do associado
--     (0099) e sem veiculo = vale para todos os veiculos dele (como o agrupado).
-- (C) `situacao_assistencia_veiculo` recriada (mesma assinatura) lendo (B).
-- (D) `rotina_regua_cobranca()` — a rotina que a 0072 deixou para depois, so
--     para quem e cobrado pelo SCar: vence -> inadimplente; passou do prazo ->
--     inativo; pagou -> ativo. O motivo vai para `status_motivo`.
-- (E) `cobranca_fila_base` recriada: situacao `a_inativar` (prioridade 9) para
--     quem passou do prazo de inativacao; `cobranca_fila` DROP + CREATE com
--     `p_ordem` e sem os "a inativar" (salvo pedidos); `cobranca_fila_resumo`
--     tira os "a inativar" das faixas.
-- (F) `cobranca_carteira` DROP + CREATE: ativos/inadimplentes/vencido sem os
--     "a inativar", que ganham colunas proprias.
-- (G) `cobranca_inativados(inicio, fim, regional)` — os veiculos que SAIRAM da
--     base no periodo. Conta so quem saiu DEPOIS de entrar: o acervo inativo da
--     carga do Mutual (3.760 veiculos, 14/10) nasceu inativo e a data de saida
--     dele e a da carga — contar pela data pura diria 3.786 inativacoes em outubro.
-- (H) `regua_cobranca()` — os tres prazos, para as telas.

-- ============================================================================
-- (A) os parametros
-- ============================================================================
alter table empresa add column if not exists dias_bloqueio_inadimplencia integer not null default 1;
alter table empresa drop constraint if exists chk_empresa_dias_bloqueio;
alter table empresa add constraint chk_empresa_dias_bloqueio
  check (dias_bloqueio_inadimplencia between 1 and 90);
alter table empresa drop constraint if exists chk_empresa_regua_ordem;
alter table empresa add constraint chk_empresa_regua_ordem
  check (dias_bloqueio_inadimplencia <= dias_tolerancia_inadimplencia
         and dias_revistoria_boleto < dias_tolerancia_inadimplencia);

comment on column empresa.dias_bloqueio_inadimplencia is
  'Regua de cobranca (0139): dias de atraso a partir dos quais a 24h e os beneficios ficam bloqueados.';

create or replace function dias_bloqueio_inadimplencia()
returns integer
language sql
stable
set search_path = public
as $$
  select coalesce((select dias_bloqueio_inadimplencia from empresa limit 1), 1);
$$;

create or replace function regua_cobranca()
returns table (dias_bloqueio integer, dias_revistoria integer, dias_inativacao integer)
language sql
stable
security definer
set search_path = public
as $$
  select dias_bloqueio_inadimplencia(), dias_revistoria_boleto(), tolerancia_inadimplencia()
   where is_staff() or auth.uid() is null;
$$;

-- ============================================================================
-- (B) os vencidos do veiculo, nas duas fontes
-- ============================================================================
create or replace function vencidos_veiculo(p_veiculo_id uuid, p_min_dias integer default 1)
returns table (boletos integer, valor numeric, dias integer)
language sql
stable
security definer
set search_path = public
as $$
  with v as (
    select id, cliente_id, tipo_faturamento from veiculos where id = p_veiculo_id
  ),
  corte as (
    select min(t.data_vencimento) as corte
      from titulos_financeiros t
      join faturas f on f.titulo_id = t.id
      join v on v.cliente_id = t.cliente_id
     where t.status::text <> 'cancelado'
  ),
  b as (
    select t.valor, (current_date - t.data_vencimento) as dias
      from titulos_financeiros t, v
     where t.cliente_id = v.cliente_id
       and t.status::text in ('pendente', 'vencido')
       and t.data_vencimento < current_date
       and (t.veiculo_id = v.id
            or (t.veiculo_id is null and v.tipo_faturamento = 'AGRUPADO_ASSOCIADO'))
    union all
    select h.valor, (current_date - h.vencimento_original)
      from boletos_historico h, v, corte
     where h.cliente_id = v.cliente_id
       and h.situacao = 'aberto'
       and coalesce(h.data_limite, h.data_vencimento) < current_date
       and (h.veiculo_id = v.id or h.veiculo_id is null)
       and (corte.corte is null or h.vencimento_original < corte.corte)
  )
  select count(*)::int, coalesce(round(sum(b.valor), 2), 0), coalesce(max(b.dias), 0)::int
    from b
   where b.dias >= greatest(coalesce(p_min_dias, 1), 1)
     and (is_staff() or auth.uid() is null);
$$;

-- ============================================================================
-- (C) a trava da 24h lendo as duas fontes
-- ============================================================================
create or replace function situacao_assistencia_veiculo(p_veiculo_id uuid)
returns table (
  veiculo_id        uuid,
  placa             text,
  cliente_id        uuid,
  associado         text,
  status_veiculo    status_veiculo,
  veiculo_ativo     boolean,
  inadimplente      boolean,
  titulos_vencidos  integer,
  valor_em_atraso   numeric,
  pendencia_cadastral boolean,
  alertas_ativos    integer,
  pode_acionar      boolean,
  motivos           text[]
)
language plpgsql stable
as $$
declare
  v        veiculos;
  cli      clientes;
  v_venc   integer := 0;
  v_valor  numeric := 0;
  v_alert  integer := 0;
  v_mot    text[] := '{}';
  v_dias   integer;
begin
  select * into v from veiculos where id = p_veiculo_id;
  if v.id is null then return; end if;
  select * into cli from clientes where id = v.cliente_id;

  -- 0139: as DUAS fontes (titulos do SCar + boletos do Mutual) e so o que
  -- passou do prazo de BLOQUEIO da regua (`dias_bloqueio_inadimplencia`).
  select x.boletos, x.valor into v_venc, v_valor
    from vencidos_veiculo(v.id, dias_bloqueio_inadimplencia()) x;

  select count(*)::int into v_alert
    from veiculo_alertas al where al.veiculo_id = v.id and al.ativo;

  if v.status::text = 'inadimplente' then
    v_dias := dias_no_status_veiculo(v.id);
    v_mot := v_mot || format(
      'Veiculo INADIMPLENTE ha %s dia(s) — beneficios bloqueados ate a regularizacao (inativa em %s dia(s))',
      v_dias, greatest(0, tolerancia_inadimplencia() - v_dias));
  elsif v.status::text <> 'ativo' then
    v_mot := v_mot || format('Veiculo com status %s (necessario ATIVO)', v.status);
  end if;
  if v_venc > 0 then
    -- Sem a palavra "limite": `motivoNegativaSugerido` (TS) a le como limite de uso.
    v_mot := v_mot || format('%s boleto(s) em atraso — %s (bloqueio a partir de %s dia(s) de vencido)',
                             v_venc, to_char(v_valor, 'FM999G999D00'), dias_bloqueio_inadimplencia());
  end if;
  if cli.status::text = 'inadimplente' then
    v_mot := v_mot || 'Associado marcado como inadimplente';
  end if;
  if v_alert > 0 then
    v_mot := v_mot || format('%s alerta(s) cadastral(is) ativo(s)', v_alert);
  end if;

  veiculo_id := v.id;
  placa := v.placa;
  cliente_id := v.cliente_id;
  associado := cli.nome_razao_social;
  status_veiculo := v.status;
  veiculo_ativo := (v.status::text = 'ativo');
  inadimplente := (v_venc > 0 or cli.status::text = 'inadimplente' or v.status::text = 'inadimplente');
  titulos_vencidos := v_venc;
  valor_em_atraso := round(v_valor, 2);
  pendencia_cadastral := (v_alert > 0);
  alertas_ativos := v_alert;
  pode_acionar := (array_length(v_mot, 1) is null);
  motivos := v_mot;
  return next;
end;
$$;

-- ============================================================================
-- (D) a rotina diaria — so para quem e cobrado pelo SCar
-- ============================================================================
create or replace function rotina_regua_cobranca()
returns table (para_inadimplente integer, para_ativo integer, inativados integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  r       record;
  v_bloq  integer := dias_bloqueio_inadimplencia();
  v_inat  integer := tolerancia_inadimplencia();
  v_dias  integer;
  n_inad  integer := 0;
  n_atv   integer := 0;
  n_inat  integer := 0;
begin
  if not (tem_acesso_global() or auth.uid() is null) then
    raise exception 'Somente a matriz roda a regua de cobranca';
  end if;

  for r in
    select v.id, v.status::text as st
      from veiculos v
     where not v.cobranca_externa
       and v.status::text in ('ativo', 'inadimplente')
  loop
    select x.dias into v_dias from vencidos_veiculo(r.id, 1) x;
    v_dias := coalesce(v_dias, 0);

    if v_dias >= v_inat then
      perform set_config('scar.motivo_status_veiculo',
        format('Regua de cobranca: %s dia(s) de atraso — inativado (prazo de %s dia(s))', v_dias, v_inat), true);
      update veiculos set status = 'inativo' where id = r.id;
      n_inat := n_inat + 1;
    elsif v_dias >= v_bloq and r.st = 'ativo' then
      perform set_config('scar.motivo_status_veiculo',
        format('Regua de cobranca: %s dia(s) de atraso — beneficios bloqueados', v_dias), true);
      update veiculos set status = 'inadimplente' where id = r.id;
      n_inad := n_inad + 1;
    elsif v_dias < v_bloq and r.st = 'inadimplente' then
      perform set_config('scar.motivo_status_veiculo', 'Regua de cobranca: regularizado', true);
      update veiculos set status = 'ativo' where id = r.id;
      n_atv := n_atv + 1;
    end if;
  end loop;
  perform set_config('scar.motivo_status_veiculo', '', true);

  return query select n_inad, n_atv, n_inat;
end;
$$;

-- ============================================================================
-- (E) a fila: "a inativar" fora da lista de trabalho, e a ordenacao
-- ============================================================================
create or replace function cobranca_fila_base(p_regional_id uuid default null)
returns table (
  cliente_id          uuid,
  associado           text,
  cpf_cnpj            text,
  telefone            text,
  celular             text,
  regional_id         uuid,
  regional            text,
  placas              text,
  boletos_vencidos    bigint,
  valor_vencido       numeric,
  dias_atraso         integer,
  faixa               text,
  vencido_desde       date,
  ultimo_contato_em   timestamptz,
  ultimo_canal        text,
  ultimo_resultado    text,
  ultimo_usuario      text,
  ultima_observacao   text,
  retorno_em          date,
  proxima_acao        text,
  contatos            bigint,
  acordo_id           uuid,
  acordo_tipo         text,
  acordo_status       text,
  proxima_parcela_em  date,
  proxima_parcela_valor numeric,
  situacao_fila       text,
  prioridade          integer
)
language sql
stable
security definer
set search_path = public
as $$
  with venc as (
    select * from cobranca_boletos_base(null, null, p_regional_id) where situacao = 'vencido'
  ),
  ativos as (
    select distinct v.cliente_id from veiculos v
     where v.status::text in ('ativo', 'em_evento', 'vistoria_pendente', 'inadimplente')
  ),
  d as (
    select venc.cliente_id, count(*) as n, sum(venc.valor) as valor,
           max(venc.dias_atraso) as atraso, min(venc.vencimento) as desde
      from venc
      join ativos on ativos.cliente_id = venc.cliente_id
     group by venc.cliente_id
  ),
  uc as (
    select distinct on (c.cliente_id) c.*, u.nome as usuario_nome
      from cobranca_contatos c
      left join usuarios u on u.id = c.usuario_id
     where c.cliente_id in (select d.cliente_id from d)
     order by c.cliente_id, c.created_at desc, c.id desc
  ),
  nc as (
    select c.cliente_id, count(*) as n from cobranca_contatos c
     where c.cliente_id in (select d.cliente_id from d) group by 1
  ),
  ac as (
    select distinct on (s.cliente_id) s.*
      from cobranca_acordos_situacao(p_regional_id, null) s
      join d on d.cliente_id = s.cliente_id
     where s.status in ('EM_ANDAMENTO', 'QUEBRADO')
       and s.data_base >= d.desde
     order by s.cliente_id, s.created_at desc
  ),
  l as (
    select d.*, uc.id as contato_id, uc.created_at as contato_em, uc.canal, uc.resultado,
           uc.usuario_nome, uc.observacao, uc.proxima_acao,
           case when uc.id is null then null
                else coalesce(uc.proxima_acao_em, (uc.created_at)::date + 2) end as retorno,
           ac.acordo_id, ac.tipo, ac.status as acordo_status, ac.quebra_em,
           ac.proxima_parcela_em, ac.proxima_parcela_valor,
           coalesce(nc.n, 0) as contatos
      from d
      left join uc on uc.cliente_id = d.cliente_id
      left join nc on nc.cliente_id = d.cliente_id
      left join ac on ac.cliente_id = d.cliente_id
  ),
  s as (
    select l.*,
           case
             -- 0139: passou do prazo de inativacao da regua — sai da fila de
             -- trabalho (fica numa lista propria) e nao entra nas metricas dela.
             when l.atraso >= tolerancia_inadimplencia() then 'a_inativar'
             when l.acordo_status = 'QUEBRADO'
                  and (l.contato_em is null or (l.contato_em)::date < l.quebra_em) then 'promessa_quebrada'
             when l.acordo_status = 'EM_ANDAMENTO' then 'promessa_em_dia'
             when l.contato_em is null or (l.contato_em)::date < l.desde then 'sem_contato'
             when l.retorno < current_date then 'retorno_atrasado'
             when l.retorno = current_date then 'retorno_hoje'
             else 'aguardando'
           end as situacao
      from l
  )
  select s.cliente_id, cl.nome_razao_social, cl.cpf_cnpj, cl.telefone, cl.celular,
         cl.regional_id, coalesce(g.nome, 'MATRIZ'),
         (select string_agg(v.placa, ', ' order by v.placa) from veiculos v
           where v.cliente_id = s.cliente_id
             and v.status::text in ('ativo', 'em_evento', 'vistoria_pendente', 'inadimplente')),
         s.n, s.valor, s.atraso, cobranca_faixa_atraso(s.atraso), s.desde,
         s.contato_em, s.canal, s.resultado, s.usuario_nome, s.observacao,
         s.retorno, s.proxima_acao, s.contatos,
         s.acordo_id, s.tipo, s.acordo_status, s.proxima_parcela_em, s.proxima_parcela_valor,
         s.situacao,
         case s.situacao
           when 'promessa_quebrada' then 1 when 'retorno_atrasado' then 2
           when 'retorno_hoje' then 3 when 'sem_contato' then 4
           when 'aguardando' then 5 when 'a_inativar' then 9 else 6 end
    from s
    join clientes cl on cl.id = s.cliente_id
    left join regionais g on g.id = cl.regional_id;
$$;

drop function if exists cobranca_fila(uuid, text, text, text, integer, integer);
create or replace function cobranca_fila(
  p_regional_id uuid default null,
  p_situacao    text default null,
  p_faixa       text default null,
  p_busca       text default null,
  p_limite      integer default 100,
  p_offset      integer default 0,
  p_ordem       text default 'prioridade'
)
returns table (
  cliente_id          uuid,
  associado           text,
  cpf_cnpj            text,
  telefone            text,
  celular             text,
  regional_id         uuid,
  regional            text,
  placas              text,
  boletos_vencidos    bigint,
  valor_vencido       numeric,
  dias_atraso         integer,
  faixa               text,
  vencido_desde       date,
  ultimo_contato_em   timestamptz,
  ultimo_canal        text,
  ultimo_resultado    text,
  ultimo_usuario      text,
  ultima_observacao   text,
  retorno_em          date,
  proxima_acao        text,
  contatos            bigint,
  acordo_id           uuid,
  acordo_tipo         text,
  acordo_status       text,
  proxima_parcela_em  date,
  proxima_parcela_valor numeric,
  situacao_fila       text,
  prioridade          integer,
  total_registros     bigint,
  total_valor         numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with f as (
    select b.* from cobranca_fila_base(p_regional_id) b
     where (case when p_situacao is null then b.situacao_fila <> 'a_inativar'
                 else b.situacao_fila = p_situacao end)
       and (p_faixa is null or b.faixa = p_faixa)
       and (nullif(btrim(coalesce(p_busca, '')), '') is null
            or texto_sem_acento(b.associado) ilike '%' || texto_sem_acento(btrim(p_busca)) || '%'
            or (length(regexp_replace(p_busca, '\D', '', 'g')) >= 3
                and regexp_replace(coalesce(b.cpf_cnpj, '') || ' ' || coalesce(b.telefone, '') || ' ' ||
                                   coalesce(b.celular, ''), '\D', '', 'g')
                    like '%' || regexp_replace(p_busca, '\D', '', 'g') || '%')
            or upper(coalesce(b.placas, '')) like '%' || upper(regexp_replace(p_busca, '[^A-Za-z0-9]', '', 'g')) || '%')
  )
  select f.*, count(*) over (), sum(f.valor_vencido) over ()
    from f
   -- 0139: prioridade e depois o MENOR atraso (decisao do usuario: a maior
   -- chance de recuperar vem primeiro); o cabecalho troca para atraso puro.
   order by case when coalesce(p_ordem, 'prioridade') = 'prioridade' then f.prioridade end,
            case when p_ordem = 'atraso_desc' then f.dias_atraso end desc nulls last,
            f.dias_atraso, f.valor_vencido desc, f.cliente_id
   limit greatest(1, least(coalesce(p_limite, 100), 500))
  offset greatest(0, coalesce(p_offset, 0));
$$;

/** Os tiles da fila. "A inativar" aparece so na contagem por situacao. */
create or replace function cobranca_fila_resumo(p_regional_id uuid default null)
returns table (grupo text, chave text, clientes bigint, valor numeric)
language sql
stable
security definer
set search_path = public
as $$
  with b as (select * from cobranca_fila_base(p_regional_id))
  select 'situacao', b.situacao_fila, count(*), sum(b.valor_vencido) from b group by 2
  union all
  select 'faixa', b.faixa, count(*), sum(b.valor_vencido) from b
   where b.situacao_fila <> 'a_inativar' group by 2;
$$;

-- ============================================================================
-- (F) a carteira de hoje sem os "a inativar"
-- ============================================================================
drop function if exists cobranca_carteira(uuid);
create or replace function cobranca_carteira(p_regional_id uuid default null)
returns table (
  clientes_ativos        bigint,
  clientes_inadimplentes bigint,
  boletos_vencidos       bigint,
  valor_vencido          numeric,
  ultima_captura_mutual  timestamptz,
  ultima_importacao      timestamptz,
  clientes_a_inativar    bigint,
  valor_a_inativar       numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with esc as (select * from cobranca_escopo()),
  ativos as (
    select distinct cl.id
      from clientes cl
      join veiculos v on v.cliente_id = cl.id
     cross join esc
     where v.status::text in ('ativo', 'em_evento', 'vistoria_pendente', 'inadimplente')
       and (esc.global or cl.regional_id = any (esc.regionais))
       and (p_regional_id is null or cl.regional_id = p_regional_id)
  ),
  venc as (
    select * from cobranca_boletos_base(null, null, p_regional_id) where situacao = 'vencido'
  ),
  por_cliente as (
    select v.cliente_id, count(*) as n, sum(v.valor) as valor, max(v.dias_atraso) as atraso
      from venc v join ativos a on a.id = v.cliente_id
     group by v.cliente_id
  ),
  lim as (select tolerancia_inadimplencia() as dias)
  select (select count(*) from ativos)
           - (select count(*) from por_cliente, lim where por_cliente.atraso >= lim.dias),
         (select count(*) from por_cliente, lim where por_cliente.atraso < lim.dias),
         (select coalesce(sum(n), 0) from por_cliente, lim where por_cliente.atraso < lim.dias),
         (select coalesce(sum(valor), 0) from por_cliente, lim where por_cliente.atraso < lim.dias),
         (select max(capturado_em) from mutual_captura where entidade = 'INVOICE'),
         (select max(atualizado_em) from boletos_historico),
         (select count(*) from por_cliente, lim where por_cliente.atraso >= lim.dias),
         (select coalesce(sum(valor), 0) from por_cliente, lim where por_cliente.atraso >= lim.dias);
$$;

-- ============================================================================
-- (G) inativados no periodo
-- ============================================================================
create or replace function cobranca_inativados(
  p_inicio      date,
  p_fim         date,
  p_regional_id uuid default null
)
returns table (veiculos bigint, clientes bigint, pela_regua bigint)
language sql
stable
security definer
set search_path = public
as $$
  with esc as (select * from cobranca_escopo())
  select count(*),
         count(distinct v.cliente_id),
         count(*) filter (where v.status_motivo like 'Regua de cobranca:%')
    from veiculos v
    left join clientes cl on cl.id = v.cliente_id
   cross join esc
   where v.status::text in ('inativo', 'baixado', 'excluido')
     and v.data_saida between p_inicio and p_fim
     -- Saiu DEPOIS de entrar: o acervo carregado ja inativo nao e inativacao.
     and v.data_saida > data_sp(v.created_at)
     and (esc.global or coalesce(v.regional_id, cl.regional_id) = any (esc.regionais))
     and (p_regional_id is null or coalesce(v.regional_id, cl.regional_id) = p_regional_id);
$$;

-- Rito da 0052.
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
