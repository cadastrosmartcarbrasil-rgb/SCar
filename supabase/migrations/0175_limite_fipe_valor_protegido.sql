-- ============================================================================
-- 0175 — FIPE ACIMA DA TABELA: o limite do tipo e o VALOR PROTEGIDO
-- ============================================================================
-- O defeito (03/11/2026, pedido do usuario): acima da ULTIMA faixa da tabela
-- do tipo, `calcular_valor_produto` devolve 0 para todo produto FAIXA_FIPE —
-- a Protecao do Casco e a Taxa Administrativa somem e a cotacao sai barata e
-- calada. Medido em producao: Passeio com FIPE de R$ 300 mil = R$ 55,00
-- (so 24h + rastreador), contra R$ 590,00 no limite de R$ 250 mil.
--
-- Decisao do usuario: acima do limite a cotacao NAO segue sozinha. Quem cota
-- e avisado e escolhe: (1) proteger PELO LIMITE, digitando o valor protegido
-- (que vira a base do calculo), (2) so o rastreamento sem protecao (o tipo
-- "RASTREAMENTO SEM PROTECAO", sem tabela) ou (3) recusar.
--
-- (A) `limite_fipe_tipo(tipo)` — o maior FIPE que a tabela do tipo cobre: o
--     MENOR teto entre os produtos obrigatorios de FAIXA_FIPE que atendem o
--     tipo e tem faixa cadastrada. Sem tabela (rastreamento) = null = sem limite.
-- (B) `valor_fipe_mercado` em leads, cotacoes e veiculos: a FIPE de verdade
--     quando a protecao e LIMITADA. A coluna de calculo de sempre
--     (`leads.valor_fipe`, `cotacoes.fipe`, `veiculos.valor_fipe`) passa a
--     guardar o VALOR PROTEGIDO — assim o motor, a participacao, o rastreador,
--     a proposta e o boleto seguem lendo o mesmo campo, sem caminho paralelo.
--     Nulo = protecao pela FIPE inteira (todo o legado).
-- (C) Trigger em `cotacoes`: cotacao NOVA (ou com FIPE/tipo alterados) acima do
--     limite e RECUSADA; valor protegido maior que a FIPE tambem. Cotacao
--     antiga que ninguem mexe nao e tocada.
-- (D) O veiculo herda a FIPE de mercado do lead quando a venda entra na base
--     (`leads.veiculo_id` e preenchido por `autorizar_entrada_lead`).
-- Nenhum preco muda: o limite so recusa o que hoje sairia com R$ 0,00 no casco.
-- ============================================================================

create or replace function limite_fipe_tipo(p_tipo_veiculo_id uuid)
returns numeric
language sql stable security definer
set search_path = public
as $$
  select min(x.teto)
    from (
      select f.produto_id, max(f.fipe_maximo) as teto
        from tabela_precos_faixa f
        join produtos p on p.id = f.produto_id
       where f.tipo_veiculo_id = p_tipo_veiculo_id
         and p.status and p.obrigatorio
         and p.metodo_preco = 'FAIXA_FIPE'
         and produto_atende_tipo(p.id, p_tipo_veiculo_id)
       group by f.produto_id
    ) x
$$;

comment on function limite_fipe_tipo(uuid) is
  '0175: o maior FIPE que a tabela do tipo cobre (menor teto entre os obrigatorios de FAIXA_FIPE com faixa). Null = tipo sem tabela, sem limite.';

-- ----------------------------------------------------------------------------
-- (B) A FIPE de mercado ao lado do valor protegido
-- ----------------------------------------------------------------------------
alter table leads    add column if not exists valor_fipe_mercado numeric(14,2);
alter table cotacoes add column if not exists valor_fipe_mercado numeric(14,2);
alter table veiculos add column if not exists valor_fipe_mercado numeric(14,2);

alter table leads    drop constraint if exists chk_lead_fipe_mercado;
alter table leads    add  constraint chk_lead_fipe_mercado check (valor_fipe_mercado is null or valor_fipe_mercado > 0);
alter table cotacoes drop constraint if exists chk_cotacao_fipe_mercado;
alter table cotacoes add  constraint chk_cotacao_fipe_mercado check (valor_fipe_mercado is null or valor_fipe_mercado > 0);
alter table veiculos drop constraint if exists chk_veiculo_fipe_mercado;
alter table veiculos add  constraint chk_veiculo_fipe_mercado check (valor_fipe_mercado is null or valor_fipe_mercado > 0);

comment on column leads.valor_fipe_mercado is
  '0175: FIPE de mercado quando a protecao e LIMITADA; valor_fipe guarda o valor protegido. Nulo = protecao pela FIPE.';
comment on column cotacoes.valor_fipe_mercado is
  '0175: FIPE de mercado quando a protecao e LIMITADA; fipe guarda o valor protegido (base do calculo). Nulo = protecao pela FIPE.';
comment on column veiculos.valor_fipe_mercado is
  '0175: FIPE de mercado quando a protecao e LIMITADA; valor_fipe guarda o valor protegido. Nulo = protecao pela FIPE.';

create or replace function moeda_br(p numeric)
returns text language sql immutable as $$
  select 'R$ ' || translate(to_char(round(p, 2), 'FM999,999,999,990.00'), ',.', '.,')
$$;

-- ----------------------------------------------------------------------------
-- (C) A trava da cotacao
-- ----------------------------------------------------------------------------
create or replace function fn_cotacao_limite_fipe()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_lim  numeric;
  v_tipo text;
begin
  if tg_op = 'UPDATE'
     and new.fipe is not distinct from old.fipe
     and new.tipo_veiculo_id is not distinct from old.tipo_veiculo_id
     and new.valor_fipe_mercado is not distinct from old.valor_fipe_mercado then
    return new;
  end if;

  if new.valor_fipe_mercado is not null and new.fipe > new.valor_fipe_mercado then
    raise exception 'VALOR PROTEGIDO MAIOR QUE A FIPE: o valor protegido (%) nao pode passar a FIPE do veiculo (%).',
      moeda_br(new.fipe), moeda_br(new.valor_fipe_mercado) using errcode = 'check_violation';
  end if;

  v_lim := limite_fipe_tipo(new.tipo_veiculo_id);
  if v_lim is not null and new.fipe > v_lim then
    select nome into v_tipo from tipos_veiculo where id = new.tipo_veiculo_id;
    raise exception 'FIPE ACIMA DO LIMITE: a tabela de % vai ate %. Proteja pelo limite (informe o valor protegido) ou cote o rastreamento sem protecao.',
      coalesce(v_tipo, 'este tipo'), moeda_br(v_lim) using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cotacao_limite_fipe on cotacoes;
create trigger trg_cotacao_limite_fipe
  before insert or update of fipe, tipo_veiculo_id, valor_fipe_mercado on cotacoes
  for each row execute function fn_cotacao_limite_fipe();

-- ----------------------------------------------------------------------------
-- (D) O veiculo herda a FIPE de mercado do lead
-- ----------------------------------------------------------------------------
create or replace function fn_lead_fipe_mercado_veiculo()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.veiculo_id is not null and new.valor_fipe_mercado is not null
     and new.veiculo_id is distinct from old.veiculo_id then
    update veiculos set valor_fipe_mercado = new.valor_fipe_mercado
     where id = new.veiculo_id and valor_fipe_mercado is null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lead_fipe_mercado_veiculo on leads;
create trigger trg_lead_fipe_mercado_veiculo
  after update of veiculo_id on leads
  for each row execute function fn_lead_fipe_mercado_veiculo();

-- ----------------------------------------------------------------------------
-- Rito de seguranca da 0052
-- ----------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
