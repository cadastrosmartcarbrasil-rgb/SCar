-- =============================================================================
-- 0153_disponibilidade_por_conta
-- CADA CONTA BANCARIA TEM A SUA CONTA EM DISPONIBILIDADES (pedido do usuario,
-- 27/10/2026: "colocou em disponibilidade em 1.1.1.02 somente um banco, e os
-- demais?").
--
-- Na 0152 todas as contas correntes caiam numa analitica so (1.1.1.02), e o
-- balancete nao separava o saldo do SICREDI do saldo do INTER. Agora:
--   * 1.1.1.01 Caixas, 1.1.1.02 Bancos Conta Corrente, 1.1.1.03 Aplicacoes e
--     1.1.1.04 Outras Disponibilidades viram SINTETICAS (grupos);
--   * cada conta bancaria ganha UMA analitica automatica dentro do grupo da
--     classe dela (`classe_fluxo`), criada e mantida por trigger: cadastrar a
--     conta cria a analitica (ex.: 1.1.1.02.01 SICREDI); renomear renomeia;
--     trocar a classe RECODIFICA para o grupo novo (mesmo id); inativar inativa;
--   * 1.1.1.99 "Disponibilidades sem conta informada" recebe o dinheiro de
--     baixa antiga sem conta bancaria (a baixa exige conta desde a 0132);
--   * o balancete passa a debitar/creditar a analitica DA CONTA.
-- Nenhum lancamento muda: as contas de disponibilidade sao automaticas (0152) e
-- nao recebem lancamento direto.
-- =============================================================================

alter table contas_bancarias
  add column if not exists conta_contabil_id uuid references categorias_dre(id) on delete set null;
comment on column contas_bancarias.conta_contabil_id is
  'A analitica da conta em Disponibilidades (1.1.1.0x.NN), criada e mantida por trigger (0153).';
create unique index if not exists uq_conta_bancaria_conta_contabil
  on contas_bancarias(conta_contabil_id) where conta_contabil_id is not null;

comment on column contas_bancarias.classe_fluxo is
  'Linha do fluxo de caixa evolutivo e grupo da conta no balancete: CONTA_CORRENTE (1.1.1.02), INVESTIMENTO (1.1.1.03), DINHEIRO (1.1.1.01), OUTROS (1.1.1.04). A analitica da conta fica dentro do grupo (0153).';

create or replace function conta_contabil_da_classe(p_classe text)
returns text language sql immutable parallel safe set search_path = public
as $$
  select case p_classe when 'DINHEIRO' then '1.1.1.01'
                       when 'INVESTIMENTO' then '1.1.1.03'
                       when 'OUTROS' then '1.1.1.04'
                       else '1.1.1.02' end;
$$;

-- Os grupos. 1.1.1.0x so podiam receber o sistema (automaticas): nenhum
-- lancamento aponta para eles, entao viram sinteticas sem trava.
update categorias_dre set analitica = false, automatica = false, nome = 'Caixas'
 where codigo_estruturado = '1.1.1.01' and (analitica or nome <> 'Caixas');
update categorias_dre set analitica = false, automatica = false, nome = 'Bancos Conta Corrente'
 where codigo_estruturado = '1.1.1.02' and (analitica or nome <> 'Bancos Conta Corrente');
update categorias_dre set analitica = false, automatica = false
 where codigo_estruturado = '1.1.1.03' and analitica;

insert into categorias_dre (codigo_estruturado, nome, natureza, analitica, automatica)
select '1.1.1.04', 'Outras Disponibilidades', 'ATIVO', false, false
 where not exists (select 1 from categorias_dre where codigo_estruturado = '1.1.1.04');
insert into categorias_dre (codigo_estruturado, nome, natureza, analitica, automatica)
select '1.1.1.99', 'Disponibilidades sem conta informada', 'ATIVO', true, true
 where not exists (select 1 from categorias_dre where codigo_estruturado = '1.1.1.99');

-- Cria ou ajusta a analitica de UMA conta bancaria. Re-executavel.
create or replace function sincronizar_conta_contabil_banco(p_conta uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  cb record;
  v_grupo text;
  v_atual_id uuid;
  v_atual_codigo text;
  v_codigo text;
  v_nome text;
  v_id uuid;
begin
  select * into cb from contas_bancarias where id = p_conta;
  if not found then
    return null;
  end if;
  v_grupo := conta_contabil_da_classe(cb.classe_fluxo);

  if cb.conta_contabil_id is not null then
    select id, codigo_estruturado into v_atual_id, v_atual_codigo
      from categorias_dre where id = cb.conta_contabil_id;
  end if;

  -- O codigo: o atual se ja esta no grupo certo; senao o proximo livre do grupo.
  if v_atual_id is not null and v_atual_codigo like v_grupo || '.%' then
    v_codigo := v_atual_codigo;
  else
    select v_grupo || '.' || lpad((coalesce(max(split_part(substr(c.codigo_estruturado, length(v_grupo) + 2), '.', 1)::int), 0) + 1)::text, 2, '0')
      into v_codigo
      from categorias_dre c
     where c.codigo_estruturado ~ ('^' || replace(v_grupo, '.', '\.') || '\.[0-9]+$');
  end if;

  -- O nome: o da conta bancaria; se outra conta do plano ja usa a descricao, diferencia.
  v_nome := regexp_replace(trim(cb.nome), '\s+', ' ', 'g');
  if exists (select 1 from categorias_dre c
              where c.id is distinct from v_atual_id
                and nome_conta_normalizado(c.nome) = nome_conta_normalizado(v_nome)) then
    v_nome := v_nome || ' (conta bancaria)';
    if exists (select 1 from categorias_dre c
                where c.id is distinct from v_atual_id
                  and nome_conta_normalizado(c.nome) = nome_conta_normalizado(v_nome)) then
      v_nome := v_nome || ' ' || v_codigo;
    end if;
  end if;

  if v_atual_id is null then
    insert into categorias_dre (codigo_estruturado, nome, natureza, analitica, automatica, ativo)
    values (v_codigo, v_nome, 'ATIVO', true, true, cb.ativo)
    returning id into v_id;
    update contas_bancarias set conta_contabil_id = v_id where id = cb.id;
  else
    v_id := v_atual_id;
    update categorias_dre
       set codigo_estruturado = v_codigo, nome = v_nome, ativo = cb.ativo,
           analitica = true, automatica = true, natureza = 'ATIVO'
     where id = v_id
       and (codigo_estruturado, nome, ativo) is distinct from (v_codigo, v_nome, cb.ativo);
  end if;
  return v_id;
end;
$$;

comment on function sincronizar_conta_contabil_banco(uuid) is
  'Cria ou ajusta a analitica da conta bancaria em Disponibilidades (grupo pela classe_fluxo). Chamada pelo trigger de contas_bancarias (0153).';

create or replace function fn_conta_bancaria_conta_contabil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform sincronizar_conta_contabil_banco(new.id);
  return new;
end;
$$;

drop trigger if exists trg_conta_bancaria_conta_contabil on contas_bancarias;
create trigger trg_conta_bancaria_conta_contabil
  after insert or update of nome, classe_fluxo, ativo on contas_bancarias
  for each row execute function fn_conta_bancaria_conta_contabil();

-- Apagar a conta bancaria leva junto a analitica dela (ela nao recebe
-- lancamento: e so o espelho da conta no plano).
create or replace function fn_conta_bancaria_apaga_conta_contabil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.conta_contabil_id is not null then
    delete from categorias_dre c
     where c.id = old.conta_contabil_id and c.automatica
       and not exists (select 1 from contas_bancarias cb where cb.conta_contabil_id = c.id);
  end if;
  return old;
end;
$$;

drop trigger if exists trg_conta_bancaria_apaga_conta_contabil on contas_bancarias;
create trigger trg_conta_bancaria_apaga_conta_contabil
  after delete on contas_bancarias
  for each row execute function fn_conta_bancaria_apaga_conta_contabil();

-- Backfill: as contas que ja existem, na ordem do cadastro.
do $$
declare r record;
begin
  for r in select id from contas_bancarias order by created_at, nome loop
    perform sincronizar_conta_contabil_banco(r.id);
  end loop;
end;
$$;

-- O codigo da analitica de uma conta bancaria (na falta, o grupo da classe).
create or replace function codigo_contabil_banco(p_conta uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(c.codigo_estruturado, conta_contabil_da_classe(cb.classe_fluxo), '1.1.1.99')
    from (select p_conta as id) x
    left join contas_bancarias cb on cb.id = x.id
    left join categorias_dre c on c.id = cb.conta_contabil_id;
$$;

-- A analitica de uma conta bancaria nao se apaga pelo plano: ela some se a
-- conta bancaria for apagada (ou se inativa junto com ela).
create or replace function fn_categoria_dre_bloqueia_exclusao()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_qtd int;
  v_banco text;
begin
  select count(*) into v_qtd from lancamentos_financeiros where categoria_dre_id = old.id;
  if v_qtd > 0 then
    raise exception 'A conta % tem % lancamento(s). Inative-a em vez de excluir.',
      old.codigo_estruturado, v_qtd using errcode = 'foreign_key_violation';
  end if;
  if exists (select 1 from movimentacoes_caixa where categoria_dre_id = old.id)
     or exists (select 1 from servicos_assistencia where categoria_dre_id = old.id)
     or exists (select 1 from tipos_boleto_avulso where categoria_dre_id = old.id) then
    raise exception 'A conta % esta em uso (movimentacoes, servicos da 24h ou boletos avulsos). Inative-a em vez de excluir.',
      old.codigo_estruturado using errcode = 'foreign_key_violation';
  end if;
  select nome into v_banco from contas_bancarias where conta_contabil_id = old.id limit 1;
  if v_banco is not null then
    raise exception 'A conta % e a da conta bancaria %. Ela acompanha o cadastro da conta bancaria (Configuracoes -> Contas Bancarias).',
      old.codigo_estruturado, v_banco using errcode = 'foreign_key_violation';
  end if;
  if not old.analitica and exists (
       select 1 from categorias_dre c
        where c.id <> old.id and c.codigo_estruturado like old.codigo_estruturado || '.%') then
    raise exception 'A conta sintetica % tem contas abaixo dela. Exclua ou recodifique as filhas antes.',
      old.codigo_estruturado using errcode = 'foreign_key_violation';
  end if;
  return old;
end;
$$;

-- O balancete passa a usar a analitica DA CONTA (mesmo corpo da 0152, so o lado do dinheiro muda).
create or replace function balancete_partidas(p_ate date)
returns table (data date, conta text, debito numeric, credito numeric, origem text, ref_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with lanc as (
    select l.*, cat.codigo_estruturado as cod
      from lancamentos_financeiros l
      left join categorias_dre cat on cat.id = l.categoria_dre_id
     where l.status <> 'cancelado'
  ),
  conta_bx as (
    select b.*, l.tipo as ltipo,
           case when l.forma_pagamento_prevista::text = 'CARTAO' then '1.1.2.02' else '1.1.2.01' end as receber,
           case when cb.id is null then '1.1.1.99'
                when cb.saldo_inicial_em is not null and b.data_pagamento <= cb.saldo_inicial_em then '2.2.2.01'
                else codigo_contabil_banco(cb.id) end as caixa,
           round(b.valor_pago + b.desconto - b.juros_multa, 2) as amortiza
      from baixas_financeiras b
      join lancamentos_financeiros l on l.id = b.lancamento_id and l.status <> 'cancelado'
      left join contas_bancarias cb on cb.id = b.conta_bancaria_id
     where b.data_pagamento <= p_ate
  ),
  tit as (
    select t.*, cb.saldo_inicial_em, cb.classe_fluxo, cb.id as conta_id,
           case when t.adesao_lead_id is not null then '3.1.1.03'
                when t.tipo_avulso_id is not null then coalesce(ca.codigo_estruturado, '3.1.1.02')
                else '3.1.1.01' end as cod
      from titulos_financeiros t
      left join faturas fa on fa.titulo_id = t.id
      left join tipos_boleto_avulso ta on ta.id = t.tipo_avulso_id
      left join categorias_dre ca on ca.id = ta.categoria_dre_id
      left join integracoes_bancarias i on i.id = t.integracao_id
      left join contas_bancarias cb on cb.id = i.conta_bancaria_id
     where (t.veiculo_id is not null or fa.id is not null or t.tipo_avulso_id is not null)
       and not exists (select 1 from movimentacoes_caixa mc where mc.titulo_id = t.id)
  ),
  p as (
    -- lancamento: o fato (competencia; na falta, emissao)
    select coalesce(l.competencia, l.data_emissao) as data,
           case when l.tipo = 'RECEITA'
                then case when l.forma_pagamento_prevista::text = 'CARTAO' then '1.1.2.02' else '1.1.2.01' end
                else coalesce(l.cod, '4.2.1.99') end as deb,
           case when l.tipo = 'RECEITA' then coalesce(l.cod, '3.1.1.99') else '2.1.1.01' end as cred,
           l.valor_original as valor, 'LANCAMENTO'::text as origem, l.id as ref_id
      from lanc l
     where coalesce(l.competencia, l.data_emissao) <= p_ate

    union all
    -- baixa: o dinheiro contra o receber/pagar, ate o menor dos dois valores
    select b.data_pagamento,
           case when b.ltipo = 'RECEITA' then b.caixa else '2.1.1.01' end,
           case when b.ltipo = 'RECEITA' then b.receber else b.caixa end,
           least(b.valor_liquido, b.amortiza), 'BAIXA', b.id
      from conta_bx b
    union all
    -- dinheiro MAIOR que a amortizacao: juros recebidos (receita) ou pagos (despesa)
    select b.data_pagamento,
           case when b.ltipo = 'RECEITA' then b.caixa else '4.3.2.01' end,
           case when b.ltipo = 'RECEITA' then '4.3.1.01' else b.caixa end,
           b.valor_liquido - b.amortiza, 'ENCARGO', b.id
      from conta_bx b
     where b.valor_liquido > b.amortiza
    union all
    -- amortizacao MAIOR que o dinheiro: desconto concedido (receita) ou obtido (despesa)
    select b.data_pagamento,
           case when b.ltipo = 'RECEITA' then '3.2.1.02' else '2.1.1.01' end,
           case when b.ltipo = 'RECEITA' then b.receber else '4.3.1.01' end,
           b.amortiza - b.valor_liquido, 'ENCARGO', b.id
      from conta_bx b
     where b.amortiza > b.valor_liquido

    union all
    -- titulo do SCar: o fato
    select t.data_vencimento, '1.1.2.01', t.cod, t.valor, 'TITULO', t.id
      from tit t
     where t.status::text <> 'cancelado' and t.data_vencimento <= p_ate
    union all
    -- titulo cancelado mas pago (raro): o fato pelo valor pago
    select t.data_vencimento, '1.1.2.01', t.cod, coalesce(t.valor_pago, 0), 'TITULO', t.id
      from tit t
     where t.status::text = 'cancelado' and t.data_pagamento is not null and t.data_vencimento <= p_ate
    union all
    -- titulo do SCar pago: o dinheiro
    select coalesce(t.data_credito, t.data_pagamento),
           case when t.conta_id is null then '1.1.1.99'
                when t.saldo_inicial_em is not null
                     and coalesce(t.data_credito, t.data_pagamento) <= t.saldo_inicial_em then '2.2.2.01'
                else codigo_contabil_banco(t.conta_id) end,
           '1.1.2.01', coalesce(t.valor_pago, t.valor), 'TITULO_PAGO', t.id
      from tit t
     where t.status::text = 'pago' and t.data_pagamento is not null
       and coalesce(t.data_credito, t.data_pagamento) <= p_ate
    union all
    -- pago diferente do valor: juros recebidos ou desconto concedido
    select t.data_vencimento,
           case when coalesce(t.valor_pago, t.valor) > t.valor then '1.1.2.01' else '3.2.1.02' end,
           case when coalesce(t.valor_pago, t.valor) > t.valor then '4.3.1.01' else '1.1.2.01' end,
           abs(coalesce(t.valor_pago, t.valor) - t.valor), 'ENCARGO', t.id
      from tit t
     where t.status::text = 'pago' and coalesce(t.valor_pago, t.valor) <> t.valor
       and t.data_vencimento <= p_ate

    union all
    -- avulsa de caixa (sem titulo): contra o Caixa
    select coalesce(m.data_caixa, m.data_competencia),
           case when m.tipo = 'RECEITA' then '1.1.1.01' else coalesce(cat.codigo_estruturado, '4.2.1.99') end,
           case when m.tipo = 'RECEITA' then coalesce(cat.codigo_estruturado, '3.1.1.99') else '1.1.1.01' end,
           m.valor, 'AVULSA', m.id
      from movimentacoes_caixa m
      left join categorias_dre cat on cat.id = m.categoria_dre_id
     where m.status <> 'cancelado' and m.lancamento_id is null and m.titulo_id is null
       and coalesce(m.data_caixa, m.data_competencia) <= p_ate

    union all
    -- transferencia entre contas
    select tr.data,
           case when cd.saldo_inicial_em is not null and tr.data <= cd.saldo_inicial_em then '2.2.2.01'
                else codigo_contabil_banco(cd.id) end,
           case when co.saldo_inicial_em is not null and tr.data <= co.saldo_inicial_em then '2.2.2.01'
                else codigo_contabil_banco(co.id) end,
           tr.valor, 'TRANSFERENCIA', tr.id
      from transferencias_bancarias tr
      join contas_bancarias co on co.id = tr.conta_origem_id
      join contas_bancarias cd on cd.id = tr.conta_destino_id
     where tr.status = 'ATIVA' and tr.data <= p_ate

    union all
    -- saldo inicial da conta (implantacao)
    select coalesce(cb.saldo_inicial_em, date '1900-01-01'),
           case when cb.saldo_inicial >= 0 then codigo_contabil_banco(cb.id) else '2.2.2.01' end,
           case when cb.saldo_inicial >= 0 then '2.2.2.01' else codigo_contabil_banco(cb.id) end,
           abs(cb.saldo_inicial), 'SALDO_INICIAL', cb.id
      from contas_bancarias cb
     where cb.saldo_inicial <> 0 and coalesce(cb.saldo_inicial_em, date '1900-01-01') <= p_ate
  )
  select p.data, x.conta, x.debito, x.credito, p.origem, p.ref_id
    from p
   cross join lateral (values (p.deb, p.valor, 0::numeric), (p.cred, 0::numeric, p.valor)) as x(conta, debito, credito)
   where p.valor <> 0
     and p.deb <> p.cred
     and (((select tem_acesso_global()) and (select pode_ver_dre())) or auth.uid() is null);
$$;

comment on function balancete_partidas(date) is
  'Partidas dobradas DERIVADAS dos lancamentos, baixas, titulos do SCar, avulsas, transferencias e saldos iniciais (0152). O dinheiro vai para a analitica de cada conta bancaria (0153). Debito = credito em toda partida.';

-- Seguranca das RPCs (rito da 0052)
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
