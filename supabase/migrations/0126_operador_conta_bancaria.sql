-- 0126: OPERADOR DE CONTA BANCARIA.
--
-- Pedido do usuario (19/10/2026): a supervisora FRANCIELLI concilia a conta do
-- BANCO INTER, que e a conta exclusiva de pagamento da Assistencia 24h. Nao e um
-- financeiro separado: e a mesma tesouraria (0119), com acesso so as contas
-- que a matriz marcar para ela.
--
--  (A) `conta_bancaria_operadores` (conta x usuario). Quem marca e a matriz
--      (`salvar_operadores_conta`, tem_acesso_global). Usuario inativo perde
--      tudo sozinho (`contas_do_operador` exige is_staff, 0068).
--  (B) `contas_do_operador()`, `pode_conta_bancaria(conta)` (matriz/servidor
--      = todas; os demais = as marcadas) e as travas `exige_conta_bancaria` /
--      `exige_item_extrato`.
--  (C) As RPCs de Contas e Saldos e de Extrato/Conciliacao passam a aceitar o
--      operador NA CONTA DELE: saldos, saldo, extrato (via a fonte unica
--      tesouraria_movimentos), importar OFX, classificar, conciliar, criar
--      lancamento, ignorar, desfazer e transferencia (um dos lados tem de ser
--      dele). O lancamento em aberto que ele concilia ou ve como candidato
--      segue o alcance dele no financeiro (`lancamento_visivel_tesouraria` =
--      matriz, a unidade dele ou o caminho da 24h, como a RLS de
--      lancamentos_financeiros).
--  (D) Ficam SO DA MATRIZ: configurar a conta (saldo inicial, regra do OFX),
--      fluxo diario, demonstrativo e conferencia caixa x DRE.
--  (E) As policies de leitura de extrato_importacoes, extrato_itens e
--      transferencias_bancarias aceitam a conta do operador.
-- Mesmas assinaturas: so o corpo muda.

-- (A) ------------------------------------------------------------------------
create table if not exists conta_bancaria_operadores (
  conta_bancaria_id uuid not null references contas_bancarias(id) on delete cascade,
  usuario_id        uuid not null references usuarios(id) on delete cascade,
  created_by        uuid references usuarios(id) on delete set null,
  created_at        timestamptz not null default now(),
  primary key (conta_bancaria_id, usuario_id)
);
create index if not exists idx_conta_operadores_usuario on conta_bancaria_operadores (usuario_id);
alter table conta_bancaria_operadores enable row level security;
drop policy if exists conta_oper_select on conta_bancaria_operadores;
create policy conta_oper_select on conta_bancaria_operadores for select to authenticated
  using ((select tem_acesso_global()) or usuario_id = (select auth.uid()));
grant select on conta_bancaria_operadores to authenticated;
revoke all on conta_bancaria_operadores from anon;

-- (B) ------------------------------------------------------------------------
create or replace function contas_do_operador()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(o.conta_bancaria_id), '{}'::uuid[])
    from conta_bancaria_operadores o
   where o.usuario_id = auth.uid() and is_staff();
$$;

create or replace function pode_conta_bancaria(p_conta uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select tem_acesso_global() or auth.uid() is null
      or (p_conta is not null and p_conta = any(contas_do_operador()));
$$;

create or replace function exige_conta_bancaria(p_conta uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not pode_conta_bancaria(p_conta) then
    raise exception 'Esta conta bancaria nao esta liberada para voce (a matriz libera em Contas e Saldos)'
      using errcode = '42501';
  end if;
end;
$$;

create or replace function exige_item_extrato(p_item uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform exige_conta_bancaria((select conta_id from extrato_itens where id = p_item));
end;
$$;

-- O lancamento em aberto que o operador concilia: o mesmo alcance da RLS de
-- lancamentos_financeiros (lanc_all + lanc_assistencia).
create or replace function lancamento_visivel_tesouraria(p_regional uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select tem_acesso_global() or auth.uid() is null or pode_regional(p_regional) or pode_assistencia();
$$;

-- Contas que quem chama opera (a matriz: todas). A tela decide as abas por aqui.
create or replace function minhas_contas_bancarias()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select cb.id from contas_bancarias cb where is_staff() and pode_conta_bancaria(cb.id);
$$;

create or replace function salvar_operadores_conta(p_conta uuid, p_usuarios uuid[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_n int;
begin
  if auth.uid() is not null and not tem_acesso_global() then
    raise exception 'So a matriz (admin ou financeiro) libera conta bancaria' using errcode = '42501';
  end if;
  if not exists (select 1 from contas_bancarias where id = p_conta) then
    raise exception 'Conta bancaria nao encontrada' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(coalesce(p_usuarios, '{}')) u(id)
              where not exists (select 1 from usuarios x where x.id = u.id and x.ativo)) then
    raise exception 'Usuario inexistente ou inativo na lista' using errcode = '22023';
  end if;
  delete from conta_bancaria_operadores
   where conta_bancaria_id = p_conta and not (usuario_id = any(coalesce(p_usuarios, '{}')));
  insert into conta_bancaria_operadores (conta_bancaria_id, usuario_id, created_by)
  select p_conta, u.id, usuario_atual_id() from unnest(coalesce(p_usuarios, '{}')) u(id)
  on conflict do nothing;
  select count(*) into v_n from conta_bancaria_operadores where conta_bancaria_id = p_conta;
  return v_n;
end;
$$;

-- (E) ------------------------------------------------------------------------
drop policy if exists transf_select on transferencias_bancarias;
create policy transf_select on transferencias_bancarias for select to authenticated using (
  (select tem_acesso_global())
  or conta_origem_id = any((select contas_do_operador())::uuid[])
  or conta_destino_id = any((select contas_do_operador())::uuid[]));
drop policy if exists extimp_select on extrato_importacoes;
create policy extimp_select on extrato_importacoes for select to authenticated using (
  (select tem_acesso_global()) or conta_id = any((select contas_do_operador())::uuid[]));
drop policy if exists extitem_select on extrato_itens;
create policy extitem_select on extrato_itens for select to authenticated using (
  (select tem_acesso_global()) or conta_id = any((select contas_do_operador())::uuid[]));

-- (C) ------------------------------------------------------------------------
create or replace function tesouraria_movimentos(p_inicio date default null, p_fim date default null)
returns table (
  data             date,
  conta_id         uuid,
  origem           text,
  ref_id           uuid,
  lancamento_id    uuid,
  valor            numeric,
  descricao        text,
  documento        text,
  contraparte      text,
  categoria_id     uuid,
  centro_custo_id  uuid,
  forma            text,
  conciliado       boolean,
  extrato_item_id  uuid,
  outra_conta_id   uuid,
  valido           boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with m as (
    -- 1) baixas (o webhook, o agendador e a tela gravam aqui)
    select b.data_pagamento as data, b.conta_bancaria_id as conta_id, 'BAIXA'::text as origem,
           b.id as ref_id, l.id as lancamento_id,
           case when l.tipo = 'RECEITA' then b.valor_liquido else -b.valor_liquido end as valor,
           l.descricao,
           coalesce(nullif(l.numero_documento, ''), b.id_transacao_bancaria_externa) as documento,
           coalesce(f.nome_fantasia, f.razao_social, c.nome_razao_social, v.nome) as contraparte,
           l.categoria_dre_id as categoria_id, l.centro_custo_id,
           b.forma_pagamento::text as forma,
           (b.status_conciliacao <> 'NAO_CONCILIADO' or ei.id is not null) as conciliado,
           ei.id as extrato_item_id, null::uuid as outra_conta_id
      from baixas_financeiras b
      join lancamentos_financeiros l on l.id = b.lancamento_id
      left join fornecedores f on f.id = l.fornecedor_id
      left join clientes c on c.id = l.cliente_id
      left join vendedores v on v.id = l.vendedor_id
      left join extrato_itens ei on ei.baixa_id = b.id
     where l.status <> 'cancelado'
       and b.conta_bancaria_id is not null
       and (p_inicio is null or b.data_pagamento >= p_inicio)
       and (p_fim is null or b.data_pagamento <= p_fim)

    union all
    -- 2) titulo do SCar pago pelo banco (nao vira baixa: o DRE ja o le do titulo)
    select t.data_pagamento, i.conta_bancaria_id, 'TITULO', t.id, null::uuid,
           coalesce(t.valor_pago, t.valor),
           'Mensalidade - ' || coalesce(c.nome_razao_social, ''),
           t.nosso_numero, c.nome_razao_social,
           (select id from categorias_dre where codigo_estruturado = '1.1.00'), null::uuid,
           'BOLETO', ei.id is not null, ei.id, null::uuid
      from titulos_financeiros t
      join integracoes_bancarias i on i.id = t.integracao_id and i.conta_bancaria_id is not null
      left join clientes c on c.id = t.cliente_id
      left join extrato_itens ei on ei.titulo_id = t.id
     where t.status = 'pago' and t.data_pagamento is not null
       and (p_inicio is null or t.data_pagamento >= p_inicio)
       and (p_fim is null or t.data_pagamento <= p_fim)

    union all
    -- 3) transferencias: sai da origem ...
    select tr.data, tr.conta_origem_id, 'TRANSFERENCIA', tr.id, null::uuid, -tr.valor,
           coalesce(nullif(tr.descricao, ''), 'Transferencia para ' || cd.nome),
           null::text, cd.nome, null::uuid, null::uuid, 'TRANSFERENCIA',
           ei.id is not null, ei.id, tr.conta_destino_id
      from transferencias_bancarias tr
      join contas_bancarias cd on cd.id = tr.conta_destino_id
      left join extrato_itens ei on ei.transferencia_id = tr.id and ei.conta_id = tr.conta_origem_id
     where tr.status = 'ATIVA'
       and (p_inicio is null or tr.data >= p_inicio)
       and (p_fim is null or tr.data <= p_fim)

    union all
    -- ... e entra no destino
    select tr.data, tr.conta_destino_id, 'TRANSFERENCIA', tr.id, null::uuid, tr.valor,
           coalesce(nullif(tr.descricao, ''), 'Transferencia de ' || co.nome),
           null::text, co.nome, null::uuid, null::uuid, 'TRANSFERENCIA',
           ei.id is not null, ei.id, tr.conta_origem_id
      from transferencias_bancarias tr
      join contas_bancarias co on co.id = tr.conta_origem_id
      left join extrato_itens ei on ei.transferencia_id = tr.id and ei.conta_id = tr.conta_destino_id
     where tr.status = 'ATIVA'
       and (p_inicio is null or tr.data >= p_inicio)
       and (p_fim is null or tr.data <= p_fim)
  )
  select m.data, m.conta_id, m.origem, m.ref_id, m.lancamento_id, m.valor, m.descricao, m.documento,
         m.contraparte, m.categoria_id, m.centro_custo_id, m.forma, m.conciliado, m.extrato_item_id,
         m.outra_conta_id,
         (cb.saldo_inicial_em is null or m.data > cb.saldo_inicial_em) as valido
    from m
    join contas_bancarias cb on cb.id = m.conta_id
   where (select tem_acesso_global()) or auth.uid() is null
      or m.conta_id = any((select contas_do_operador())::uuid[]);
$$;

create or replace function saldo_consolidado_em(p_data date, p_conta uuid default null)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  -- quem opera conta (0126) soma so as contas dele; conta alheia = nulo
  select case
    when p_conta is not null and not pode_conta_bancaria(p_conta) then null
    when p_conta is null and not (tem_acesso_global() or auth.uid() is null)
         and cardinality(contas_do_operador()) = 0 then null
    else
    coalesce((select sum(cb.saldo_inicial) from contas_bancarias cb
               where (p_conta is null or cb.id = p_conta)
                 and pode_conta_bancaria(cb.id)
                 and (cb.saldo_inicial_em is null or cb.saldo_inicial_em <= p_data)), 0)
    + coalesce((select sum(m.valor) from tesouraria_movimentos(null, p_data) m
                 where m.valido and (p_conta is null or m.conta_id = p_conta)), 0)
  end;
$$;

create or replace function saldos_contas(p_data date default null)
returns table (
  conta_id           uuid,
  nome               text,
  banco              text,
  tipo               text,
  ativo              boolean,
  saldo_inicial      numeric,
  saldo_inicial_em   date,
  entradas           numeric,
  saidas             numeric,
  saldo              numeric,
  movimentos         int,
  nao_conciliados    int,
  extrato_saldo      numeric,
  extrato_saldo_em   date,
  saldo_sistema_no_extrato numeric,
  extrato_diferenca  numeric,
  itens_pendentes    int,
  ultima_importacao  timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with dia as (select coalesce(p_data, hoje_sp()) as d),
  mov as (
    select m.conta_id,
           sum(m.valor) filter (where m.valor > 0) as ent,
           -sum(m.valor) filter (where m.valor < 0) as sai,
           sum(m.valor) as liq,
           count(*) as n,
           count(*) filter (where not m.conciliado) as nc
      from tesouraria_movimentos(null, (select d from dia)) m
     where m.valido
     group by m.conta_id
  ),
  ult as (
    select distinct on (ei.conta_id) ei.conta_id, ei.saldo_banco, ei.saldo_banco_em, ei.created_at
      from extrato_importacoes ei
     where ei.saldo_banco is not null and ei.saldo_banco_em is not null
     order by ei.conta_id, ei.saldo_banco_em desc, ei.created_at desc
  ),
  imp as (
    select conta_id, max(created_at) as em from extrato_importacoes group by conta_id
  ),
  pend as (
    select conta_id, count(*) as n from extrato_itens where situacao in ('PENDENTE', 'SUGERIDO') group by conta_id
  )
  select cb.id, cb.nome, cb.banco, cb.tipo, cb.ativo,
         cb.saldo_inicial, cb.saldo_inicial_em,
         coalesce(mov.ent, 0), coalesce(mov.sai, 0),
         cb.saldo_inicial + coalesce(mov.liq, 0),
         coalesce(mov.n, 0)::int, coalesce(mov.nc, 0)::int,
         ult.saldo_banco, ult.saldo_banco_em,
         case when ult.saldo_banco_em is not null then saldo_consolidado_em(ult.saldo_banco_em, cb.id) end,
         case when ult.saldo_banco_em is not null
              then round(ult.saldo_banco - saldo_consolidado_em(ult.saldo_banco_em, cb.id), 2) end,
         coalesce(pend.n, 0)::int, imp.em
    from contas_bancarias cb
    left join mov  on mov.conta_id = cb.id
    left join ult  on ult.conta_id = cb.id
    left join imp  on imp.conta_id = cb.id
    left join pend on pend.conta_id = cb.id
   where pode_conta_bancaria(cb.id)
   order by cb.ativo desc, cb.nome;
$$;

create or replace function sugestao_extrato_item(p_item uuid)
returns table (tipo text, ref_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  it extrato_itens%rowtype;
  v_abs numeric;
  v_n int;
  v_id uuid;
begin
  select * into it from extrato_itens where id = p_item;
  if it.id is null or not pode_conta_bancaria(it.conta_id) then return; end if;
  v_abs := abs(it.valor);

  -- baixas da mesma conta, mesmo valor e sentido, ate 3 dias de distancia, livres
  select count(*), min(b.id::text)::uuid into v_n, v_id
    from baixas_financeiras b join lancamentos_financeiros l on l.id = b.lancamento_id
   where b.conta_bancaria_id = it.conta_id and l.status <> 'cancelado'
     and b.valor_liquido = v_abs
     and l.tipo = case when it.valor > 0 then 'RECEITA' else 'DESPESA' end::tipo_movimentacao
     and b.data_pagamento between it.data - 3 and it.data + 3
     and not exists (select 1 from extrato_itens x where x.baixa_id = b.id)
     and not exists (select 1 from extrato_itens x where x.sugestao_tipo = 'BAIXA' and x.sugestao_id = b.id
                       and x.situacao = 'SUGERIDO' and x.id <> it.id);
  if v_n > 1 then
    -- desempate: o do mesmo dia, se for um so
    select count(*), min(b.id::text)::uuid into v_n, v_id
      from baixas_financeiras b join lancamentos_financeiros l on l.id = b.lancamento_id
     where b.conta_bancaria_id = it.conta_id and l.status <> 'cancelado'
       and b.valor_liquido = v_abs
       and l.tipo = case when it.valor > 0 then 'RECEITA' else 'DESPESA' end::tipo_movimentacao
       and b.data_pagamento = it.data
       and not exists (select 1 from extrato_itens x where x.baixa_id = b.id)
       and not exists (select 1 from extrato_itens x where x.sugestao_tipo = 'BAIXA' and x.sugestao_id = b.id
                         and x.situacao = 'SUGERIDO' and x.id <> it.id);
  end if;
  if v_n = 1 then tipo := 'BAIXA'; ref_id := v_id; return next; return; end if;

  if it.valor > 0 then
    select count(*), min(t.id::text)::uuid into v_n, v_id
      from titulos_financeiros t
      join integracoes_bancarias i on i.id = t.integracao_id and i.conta_bancaria_id = it.conta_id
     where t.status = 'pago' and coalesce(t.valor_pago, t.valor) = v_abs
       and t.data_pagamento between it.data - 3 and it.data + 3
       and not exists (select 1 from extrato_itens x where x.titulo_id = t.id)
       and not exists (select 1 from extrato_itens x where x.sugestao_tipo = 'TITULO' and x.sugestao_id = t.id
                         and x.situacao = 'SUGERIDO' and x.id <> it.id);
    if v_n = 1 then tipo := 'TITULO'; ref_id := v_id; return next; return; end if;
  end if;

  select count(*), min(tr.id::text)::uuid into v_n, v_id
    from transferencias_bancarias tr
   where tr.status = 'ATIVA' and tr.valor = v_abs
     and ((it.valor < 0 and tr.conta_origem_id = it.conta_id) or (it.valor > 0 and tr.conta_destino_id = it.conta_id))
     and tr.data between it.data - 3 and it.data + 3
     and not exists (select 1 from extrato_itens x where x.transferencia_id = tr.id and x.conta_id = it.conta_id)
     and not exists (select 1 from extrato_itens x where x.sugestao_tipo = 'TRANSFERENCIA' and x.sugestao_id = tr.id
                       and x.conta_id = it.conta_id and x.situacao = 'SUGERIDO' and x.id <> it.id);
  if v_n = 1 then tipo := 'TRANSFERENCIA'; ref_id := v_id; return next; end if;
end;
$$;

create or replace function classificar_extrato_itens(p_conta uuid, p_importacao uuid default null)
returns table (sugeridos int, ignorados int)
language plpgsql
security definer
set search_path = public
as $$
declare
  r extrato_itens%rowtype;
  cb contas_bancarias%rowtype;
  s record;
  v_sug int := 0;
  v_ign int := 0;
  v_txt text;
begin
  perform exige_conta_bancaria(p_conta);
  select * into cb from contas_bancarias where id = p_conta;
  for r in
    select * from extrato_itens
     where conta_id = p_conta and situacao = 'PENDENTE'
       and (p_importacao is null or importacao_id = p_importacao)
     order by data, valor, fitid
  loop
    select * into s from sugestao_extrato_item(r.id) limit 1;
    if s.ref_id is not null then
      update extrato_itens set situacao = 'SUGERIDO', sugestao_tipo = s.tipo, sugestao_id = s.ref_id, motivo = null
       where id = r.id;
      v_sug := v_sug + 1;
      continue;
    end if;
    if r.valor > 0 and cb.ofx_mensalidades = 'TODOS_CREDITOS' then
      update extrato_itens set situacao = 'IGNORADO', motivo = 'MENSALIDADE: a conta ignora todo credito do OFX (a baixa vem pelo banco)'
       where id = r.id;
      v_ign := v_ign + 1;
    elsif r.valor > 0 and cb.ofx_mensalidades = 'POR_TEXTO' then
      select t into v_txt
        from unnest(cb.ofx_textos_mensalidade) t
       where nullif(trim(t), '') is not null
         and position(texto_extrato(t) in texto_extrato(r.historico)) > 0
       limit 1;
      if v_txt is not null then
        update extrato_itens set situacao = 'IGNORADO',
               motivo = 'MENSALIDADE: historico contem "' || v_txt || '" (a baixa vem pelo banco)'
         where id = r.id;
        v_ign := v_ign + 1;
      end if;
    end if;
    v_txt := null;
  end loop;
  sugeridos := v_sug; ignorados := v_ign;
  return next;
end;
$$;

create or replace function importar_extrato_ofx(
  p_conta        uuid,
  p_arquivo      text,
  p_hash         text,
  p_data_inicio  date,
  p_data_fim     date,
  p_saldo_banco  numeric,
  p_saldo_em     date,
  p_itens        jsonb      -- [{fitid, data, valor, tipo, historico, documento}]
)
returns table (importacao_id uuid, itens int, novos int, repetidos int, sugeridos int, ignorados int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_imp uuid;
  v_total int;
  v_novos int;
  c record;
begin
  perform exige_conta_bancaria(p_conta);
  if not exists (select 1 from contas_bancarias where id = p_conta) then
    raise exception 'Conta bancaria nao encontrada' using errcode = '22023';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then
    raise exception 'Arquivo sem lancamentos' using errcode = '22023';
  end if;
  v_total := jsonb_array_length(p_itens);
  if v_total > 20000 then
    raise exception 'Arquivo grande demais (% lancamentos). Divida o periodo.', v_total using errcode = '22023';
  end if;

  insert into extrato_importacoes (conta_id, arquivo_nome, arquivo_hash, data_inicio, data_fim,
                                   saldo_banco, saldo_banco_em, itens, created_by)
  values (p_conta, p_arquivo, p_hash, p_data_inicio, p_data_fim, p_saldo_banco, p_saldo_em, v_total,
          usuario_atual_id())
  returning id into v_imp;

  with ins as (
    insert into extrato_itens (conta_id, importacao_id, fitid, data, valor, tipo_ofx, historico, documento)
    select p_conta, v_imp, x.fitid, x.data, round(x.valor, 2), x.tipo, x.historico, x.documento
      from jsonb_to_recordset(p_itens) as x(fitid text, data date, valor numeric, tipo text, historico text, documento text)
     where nullif(trim(x.fitid), '') is not null and x.data is not null and x.valor is not null and x.valor <> 0
    on conflict on constraint uq_extrato_item do nothing
    returning 1
  )
  select count(*) into v_novos from ins;

  select * into c from classificar_extrato_itens(p_conta, v_imp);

  update extrato_importacoes
     set novos = v_novos, repetidos = v_total - v_novos,
         sugeridos = coalesce(c.sugeridos, 0), ignorados = coalesce(c.ignorados, 0)
   where id = v_imp;

  importacao_id := v_imp; itens := v_total; novos := v_novos; repetidos := v_total - v_novos;
  sugeridos := coalesce(c.sugeridos, 0); ignorados := coalesce(c.ignorados, 0);
  return next;
end;
$$;

create or replace function conciliar_extrato_item(p_item uuid, p_tipo text, p_ref uuid)
returns extrato_itens
language plpgsql
security definer
set search_path = public
as $$
declare
  it extrato_itens%rowtype;
  v_abs numeric;
  b baixas_financeiras%rowtype;
  l lancamentos_financeiros%rowtype;
  t titulos_financeiros%rowtype;
  tr transferencias_bancarias%rowtype;
  v_baixa uuid;
begin
  perform exige_item_extrato(p_item);
  select * into it from extrato_itens where id = p_item for update;
  if it.id is null then raise exception 'Item do extrato nao encontrado' using errcode = '22023'; end if;
  if it.situacao = 'CONCILIADO' then raise exception 'Este item ja esta conciliado' using errcode = '22023'; end if;
  v_abs := abs(it.valor);

  if p_tipo = 'BAIXA' then
    select * into b from baixas_financeiras where id = p_ref;
    select * into l from lancamentos_financeiros where id = b.lancamento_id;
    if b.id is null or l.status = 'cancelado' then raise exception 'Baixa nao encontrada' using errcode = '22023'; end if;
    if b.conta_bancaria_id is distinct from it.conta_id then
      raise exception 'A baixa e de outra conta bancaria' using errcode = '22023';
    end if;
    if (it.valor > 0) <> (l.tipo = 'RECEITA') then
      raise exception 'Sentido diferente: o extrato e % e o lancamento e %',
        case when it.valor > 0 then 'credito' else 'debito' end, lower(l.tipo::text) using errcode = '22023';
    end if;
    if abs(b.valor_liquido - v_abs) >= 0.01 then
      raise exception 'Valores diferentes: extrato % x baixa %', v_abs, b.valor_liquido using errcode = '22023';
    end if;
    if exists (select 1 from extrato_itens x where x.baixa_id = b.id) then
      raise exception 'Esta baixa ja esta conciliada com outro item' using errcode = '22023';
    end if;
    update baixas_financeiras set status_conciliacao = 'CONCILIADO_MANUAL' where id = b.id;
    update extrato_itens set situacao = 'CONCILIADO', baixa_id = b.id, sugestao_tipo = null, sugestao_id = null,
           motivo = null, conciliado_por = usuario_atual_id(), conciliado_em = now()
     where id = it.id;

  elsif p_tipo = 'TITULO' then
    select * into t from titulos_financeiros where id = p_ref;
    if t.id is null or t.status <> 'pago' then raise exception 'Titulo pago nao encontrado' using errcode = '22023'; end if;
    if it.valor < 0 then raise exception 'Titulo so concilia com credito' using errcode = '22023'; end if;
    if abs(coalesce(t.valor_pago, t.valor) - v_abs) >= 0.01 then
      raise exception 'Valores diferentes: extrato % x titulo %', v_abs, coalesce(t.valor_pago, t.valor) using errcode = '22023';
    end if;
    update extrato_itens set situacao = 'CONCILIADO', titulo_id = t.id, sugestao_tipo = null, sugestao_id = null,
           motivo = null, conciliado_por = usuario_atual_id(), conciliado_em = now()
     where id = it.id;

  elsif p_tipo = 'TRANSFERENCIA' then
    select * into tr from transferencias_bancarias where id = p_ref and status = 'ATIVA';
    if tr.id is null then raise exception 'Transferencia nao encontrada' using errcode = '22023'; end if;
    if not ((it.valor < 0 and tr.conta_origem_id = it.conta_id) or (it.valor > 0 and tr.conta_destino_id = it.conta_id)) then
      raise exception 'A transferencia nao passa por esta conta neste sentido' using errcode = '22023';
    end if;
    if abs(tr.valor - v_abs) >= 0.01 then
      raise exception 'Valores diferentes: extrato % x transferencia %', v_abs, tr.valor using errcode = '22023';
    end if;
    update extrato_itens set situacao = 'CONCILIADO', transferencia_id = tr.id, sugestao_tipo = null, sugestao_id = null,
           motivo = null, conciliado_por = usuario_atual_id(), conciliado_em = now()
     where id = it.id;

  elsif p_tipo = 'LANCAMENTO' then
    select * into l from lancamentos_financeiros where id = p_ref for update;
    if l.id is null or l.status in ('cancelado', 'quitado') then
      raise exception 'Lancamento em aberto nao encontrado' using errcode = '22023';
    end if;
    if not lancamento_visivel_tesouraria(l.regional_id) then
      raise exception 'Este lancamento nao esta no seu alcance' using errcode = '42501';
    end if;
    if (it.valor > 0) <> (l.tipo = 'RECEITA') then
      raise exception 'Sentido diferente: o extrato e % e o lancamento e %',
        case when it.valor > 0 then 'credito' else 'debito' end, lower(l.tipo::text) using errcode = '22023';
    end if;
    insert into baixas_financeiras (lancamento_id, data_pagamento, valor_pago, valor_liquido, conta_bancaria_id,
                                    id_transacao_bancaria_externa, status_conciliacao, observacao)
    values (l.id, it.data, v_abs, v_abs, it.conta_id, it.fitid, 'CONCILIADO_MANUAL',
            'Baixa pela conciliacao do extrato')
    returning id into v_baixa;
    update extrato_itens set situacao = 'CONCILIADO', baixa_id = v_baixa, sugestao_tipo = null, sugestao_id = null,
           motivo = null, conciliado_por = usuario_atual_id(), conciliado_em = now()
     where id = it.id;
  else
    raise exception 'Tipo de conciliacao desconhecido: %', p_tipo using errcode = '22023';
  end if;

  select * into it from extrato_itens where id = p_item;
  return it;
end;
$$;

create or replace function confirmar_sugestoes_extrato(p_conta uuid, p_itens uuid[] default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r extrato_itens%rowtype;
  v_n int := 0;
begin
  perform exige_conta_bancaria(p_conta);
  for r in
    select * from extrato_itens
     where conta_id = p_conta and situacao = 'SUGERIDO'
       and (p_itens is null or id = any(p_itens))
     order by data, fitid
  loop
    perform conciliar_extrato_item(r.id, r.sugestao_tipo, r.sugestao_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

create or replace function criar_lancamento_extrato(
  p_item        uuid,
  p_descricao   text,
  p_categoria   uuid,
  p_centro      uuid default null,
  p_fornecedor  uuid default null,
  p_cliente     uuid default null,
  p_regional    uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  it extrato_itens%rowtype;
  v_lanc uuid;
  v_baixa uuid;
begin
  perform exige_item_extrato(p_item);
  select * into it from extrato_itens where id = p_item for update;
  if it.id is null then raise exception 'Item do extrato nao encontrado' using errcode = '22023'; end if;
  if it.situacao = 'CONCILIADO' then raise exception 'Este item ja esta conciliado' using errcode = '22023'; end if;
  if nullif(trim(p_descricao), '') is null then raise exception 'Informe a descricao' using errcode = '22023'; end if;
  if p_categoria is null then raise exception 'Informe o plano de contas' using errcode = '22023'; end if;
  if p_regional is not null and not lancamento_visivel_tesouraria(p_regional) then
    raise exception 'Unidade fora do seu alcance' using errcode = '42501';
  end if;

  insert into lancamentos_financeiros (tipo, fornecedor_id, cliente_id, descricao, categoria_dre_id, centro_custo_id,
                                       regional_id, valor_original, data_emissao, data_vencimento, competencia,
                                       numero_documento, observacoes)
  values (case when it.valor > 0 then 'RECEITA' else 'DESPESA' end::tipo_movimentacao,
          p_fornecedor, p_cliente, trim(p_descricao), p_categoria, p_centro, p_regional, abs(it.valor),
          it.data, it.data, date_trunc('month', it.data)::date,
          nullif(coalesce(nullif(it.documento, ''), 'OFX-' || it.fitid), ''),
          'Criado pela conciliacao do extrato: ' || coalesce(it.historico, ''))
  returning id into v_lanc;

  insert into baixas_financeiras (lancamento_id, data_pagamento, valor_pago, valor_liquido, conta_bancaria_id,
                                  id_transacao_bancaria_externa, status_conciliacao, observacao)
  values (v_lanc, it.data, abs(it.valor), abs(it.valor), it.conta_id, it.fitid, 'CONCILIADO_MANUAL',
          'Baixa pela conciliacao do extrato')
  returning id into v_baixa;

  update extrato_itens set situacao = 'CONCILIADO', baixa_id = v_baixa, sugestao_tipo = null, sugestao_id = null,
         motivo = null, conciliado_por = usuario_atual_id(), conciliado_em = now()
   where id = it.id;
  return v_lanc;
end;
$$;

create or replace function criar_transferencia_bancaria(
  p_origem uuid, p_destino uuid, p_valor numeric, p_data date, p_descricao text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if p_origem is null or p_destino is null or p_origem = p_destino then
    raise exception 'Escolha duas contas diferentes' using errcode = '22023';
  end if;
  -- quem opera conta (0126) transfere de/para uma conta dele
  if not (pode_conta_bancaria(p_origem) or pode_conta_bancaria(p_destino)) then
    raise exception 'Nenhuma das duas contas esta no seu alcance' using errcode = '42501';
  end if;
  if coalesce(p_valor, 0) <= 0 then raise exception 'Valor tem de ser maior que zero' using errcode = '22023'; end if;
  if p_data is null then raise exception 'Informe a data' using errcode = '22023'; end if;
  insert into transferencias_bancarias (conta_origem_id, conta_destino_id, valor, data, descricao, created_by)
  values (p_origem, p_destino, round(p_valor, 2), p_data, nullif(trim(p_descricao), ''), usuario_atual_id())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function transferencia_extrato_item(p_item uuid, p_outra_conta uuid, p_descricao text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  it extrato_itens%rowtype;
  v_id uuid;
  r extrato_itens%rowtype;
begin
  perform exige_item_extrato(p_item);
  select * into it from extrato_itens where id = p_item for update;
  if it.id is null then raise exception 'Item do extrato nao encontrado' using errcode = '22023'; end if;
  if it.situacao = 'CONCILIADO' then raise exception 'Este item ja esta conciliado' using errcode = '22023'; end if;
  v_id := criar_transferencia_bancaria(
    case when it.valor < 0 then it.conta_id else p_outra_conta end,
    case when it.valor < 0 then p_outra_conta else it.conta_id end,
    abs(it.valor), it.data, coalesce(nullif(trim(p_descricao), ''), it.historico));
  perform conciliar_extrato_item(it.id, 'TRANSFERENCIA', v_id);
  for r in select * from extrato_itens where conta_id = p_outra_conta and situacao = 'PENDENTE'
             and abs(valor) = abs(it.valor) and data between it.data - 3 and it.data + 3
             and sign(valor) = -sign(it.valor)
           order by abs(data - it.data), fitid limit 1
  loop
    update extrato_itens set situacao = 'SUGERIDO', sugestao_tipo = 'TRANSFERENCIA', sugestao_id = v_id where id = r.id;
  end loop;
  return v_id;
end;
$$;

create or replace function cancelar_transferencia_bancaria(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from transferencias_bancarias t where t.id = p_id
                   and (pode_conta_bancaria(t.conta_origem_id) or pode_conta_bancaria(t.conta_destino_id))) then
    raise exception 'Transferencia fora do seu alcance' using errcode = '42501';
  end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'Informe o motivo' using errcode = '22023'; end if;
  if exists (select 1 from extrato_itens where transferencia_id = p_id) then
    raise exception 'A transferencia esta conciliada com o extrato: desfaca a conciliacao antes' using errcode = '22023';
  end if;
  update transferencias_bancarias set status = 'CANCELADA', cancelada_motivo = trim(p_motivo)
   where id = p_id and status = 'ATIVA';
  update extrato_itens set situacao = 'PENDENTE', sugestao_tipo = null, sugestao_id = null
   where sugestao_tipo = 'TRANSFERENCIA' and sugestao_id = p_id and situacao = 'SUGERIDO';
end;
$$;

create or replace function ignorar_extrato_item(p_item uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform exige_item_extrato(p_item);
  if nullif(trim(p_motivo), '') is null then raise exception 'Informe o motivo' using errcode = '22023'; end if;
  update extrato_itens
     set situacao = 'IGNORADO', motivo = trim(p_motivo), sugestao_tipo = null, sugestao_id = null,
         conciliado_por = usuario_atual_id(), conciliado_em = now()
   where id = p_item and situacao in ('PENDENTE', 'SUGERIDO');
  if not found then raise exception 'So item pendente ou sugerido pode ser ignorado' using errcode = '22023'; end if;
end;
$$;

create or replace function desfazer_extrato_item(p_item uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare it extrato_itens%rowtype;
begin
  perform exige_item_extrato(p_item);
  select * into it from extrato_itens where id = p_item for update;
  if it.id is null then raise exception 'Item do extrato nao encontrado' using errcode = '22023'; end if;
  if it.baixa_id is not null then
    update baixas_financeiras set status_conciliacao = 'NAO_CONCILIADO'
     where id = it.baixa_id and status_conciliacao = 'CONCILIADO_MANUAL';
  end if;
  update extrato_itens
     set situacao = 'PENDENTE', motivo = null, sugestao_tipo = null, sugestao_id = null,
         baixa_id = null, titulo_id = null, transferencia_id = null, conciliado_por = null, conciliado_em = null
   where id = p_item;
end;
$$;

create or replace function candidatos_extrato_item(p_item uuid, p_dias int default 5)
returns table (tipo text, ref_id uuid, data date, valor numeric, descricao text, contraparte text,
               valor_igual boolean, dias int)
language sql
stable
security definer
set search_path = public
as $$
  with it as (select * from extrato_itens where id = p_item)
  select * from (
    select 'BAIXA'::text, b.id, b.data_pagamento, b.valor_liquido, l.descricao,
           coalesce(f.nome_fantasia, f.razao_social, c.nome_razao_social),
           abs(b.valor_liquido - abs(it.valor)) < 0.01, abs(b.data_pagamento - it.data)
      from it
      join baixas_financeiras b on b.conta_bancaria_id = it.conta_id
      join lancamentos_financeiros l on l.id = b.lancamento_id and l.status <> 'cancelado'
           and l.tipo = case when it.valor > 0 then 'RECEITA' else 'DESPESA' end::tipo_movimentacao
      left join fornecedores f on f.id = l.fornecedor_id
      left join clientes c on c.id = l.cliente_id
     where b.data_pagamento between it.data - p_dias and it.data + p_dias
       and not exists (select 1 from extrato_itens x where x.baixa_id = b.id)
    union all
    select 'LANCAMENTO', l.id, l.data_vencimento, coalesce(l.valor_saldo, l.valor_original), l.descricao,
           coalesce(f.nome_fantasia, f.razao_social, c.nome_razao_social),
           abs(coalesce(l.valor_saldo, l.valor_original) - abs(it.valor)) < 0.01, abs(l.data_vencimento - it.data)
      from it
      join lancamentos_financeiros l on l.status in ('pendente', 'atrasado', 'pago_parcial')
           and l.tipo = case when it.valor > 0 then 'RECEITA' else 'DESPESA' end::tipo_movimentacao
      left join fornecedores f on f.id = l.fornecedor_id
      left join clientes c on c.id = l.cliente_id
     where l.data_vencimento between it.data - (p_dias * 6) and it.data + (p_dias * 6)
       and lancamento_visivel_tesouraria(l.regional_id)
    union all
    select 'TRANSFERENCIA', tr.id, tr.data, tr.valor,
           coalesce(tr.descricao, 'Transferencia'), co.nome || ' -> ' || cd.nome,
           abs(tr.valor - abs(it.valor)) < 0.01, abs(tr.data - it.data)
      from it
      join transferencias_bancarias tr on tr.status = 'ATIVA'
           and ((it.valor < 0 and tr.conta_origem_id = it.conta_id) or (it.valor > 0 and tr.conta_destino_id = it.conta_id))
      join contas_bancarias co on co.id = tr.conta_origem_id
      join contas_bancarias cd on cd.id = tr.conta_destino_id
     where tr.data between it.data - p_dias and it.data + p_dias
       and not exists (select 1 from extrato_itens x where x.transferencia_id = tr.id and x.conta_id = it.conta_id)
  ) c(tipo, ref_id, data, valor, descricao, contraparte, valor_igual, dias)
  where pode_conta_bancaria((select conta_id from extrato_itens where id = p_item))
  order by valor_igual desc, dias, tipo
  limit 40;
$$;

-- Rito da 0052
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
