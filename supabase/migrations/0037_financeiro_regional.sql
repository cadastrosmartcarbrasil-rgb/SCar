-- ============================================================================
-- SCar :: 0037_financeiro_regional.sql
-- FINANCEIRO COMPACTO DA FRANQUIA + correcoes do vendedor sem usuario.
--
-- Por que este arquivo existe
-- ---------------------------
-- O portal da franquia (0036) reusava a tela do financeiro da matriz. A tela e
-- boa, mas e a tela ERRADA para uma unidade: ela pede plano de contas, centro
-- de custo e conta bancaria — cadastros que sao da matriz e que a franquia nao
-- deve criar. A operacao toda e da matriz; o financeiro da unidade existe para
-- UMA coisa: receber a comissao da matriz e repassar a comissao dos vendedores.
--
-- Entao o financeiro da unidade passa a ter dois movimentos, so:
--   COMISSAO_RECEBER -> receita, categoria 1.3.01 (repasse que a matriz nos deve)
--   COMISSAO_PAGAR   -> despesa, categoria 3.2.01 (repasse ao vendedor)
-- A classificacao contabil e resolvida pelo BANCO, nao escolhida na tela. Nao
-- ha centro de custo (a dimensao da franquia ja e o proprio `regional_id`) e a
-- baixa registra FORMA DE PAGAMENTO em vez de exigir conta bancaria da matriz.
--
-- (A) `lancamentos_financeiros.vendedor_id` — quem e o favorecido do repasse.
-- (B) `baixas_financeiras.forma_pagamento` + `observacao` — a baixa da unidade
--     nao passa por conciliacao bancaria; ela registra COMO pagou/recebeu.
-- (C) categoria 1.3.01 no plano de contas.
-- (D) CORRECAO: tres funcoes de 0034 usavam `join usuarios` para achar o nome
--     do vendedor. Depois que o 0035 tornou `vendedores.usuario_id` OPCIONAL,
--     o join interno passou a DESCARTAR o vendedor sem acesso ao portal:
--       . `repassar_comissao_vendedor` gerava o titulo com `regional_id` NULO
--         — ou seja, o repasse da franquia caia no financeiro da MATRIZ;
--       . `fn_regional_valida_comissao` deixava de enxergar esse vendedor, e a
--         regra dura "vendedor nunca passa a regional" podia ser furada
--         baixando a comissao da regional;
--       . `checklist_lead` mostrava "nao informado" com o vendedor preenchido.
--     Todas passam a `left join` + `coalesce(v.nome, u.nome)`.
-- (E) RPCs do financeiro da unidade, todas SECURITY DEFINER com
--     `escopo_regional()`: passar o id de outra franquia nao muda nada, e
--     titulo da matriz (`regional_id` nulo) nunca e tocado por um gestor.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (A) Favorecido do titulo
-- ----------------------------------------------------------------------------
alter table lancamentos_financeiros
  add column if not exists vendedor_id uuid references vendedores(id) on delete set null;

create index if not exists idx_lanc_vendedor on lancamentos_financeiros (vendedor_id);

comment on column lancamentos_financeiros.vendedor_id is
  'Favorecido quando o titulo e repasse de comissao (financeiro da franquia).';

-- ----------------------------------------------------------------------------
-- (B) Baixa da unidade: como o dinheiro entrou/saiu
-- ----------------------------------------------------------------------------
alter table baixas_financeiras
  add column if not exists forma_pagamento forma_pagamento,
  add column if not exists observacao      text;

comment on column baixas_financeiras.forma_pagamento is
  'Como foi pago/recebido. A franquia nao concilia banco: registra a forma.';

-- ----------------------------------------------------------------------------
-- (C) Plano de contas: a comissao que a matriz repassa a franquia
-- ----------------------------------------------------------------------------
insert into categorias_dre (codigo_estruturado, nome, tipo) values
  ('1.3.01', 'Comissao de Franquia (repasse da matriz)', 'RECEITA')
on conflict (codigo_estruturado) do nothing;

-- ----------------------------------------------------------------------------
-- (D) Correcoes do vendedor sem usuario de portal (regressao do 0035)
-- ----------------------------------------------------------------------------
create or replace function fn_regional_valida_comissao()
returns trigger language plpgsql as $$
declare
  v_acima text;
begin
  -- left join: o vendedor sem acesso ao portal TAMBEM conta para o teto.
  select string_agg(coalesce(v.nome, u.nome, 'vendedor'), ', ') into v_acima
    from vendedores v
    left join usuarios u on u.id = v.usuario_id
   where v.regional_id = new.id
     and (v.taxa_comissao_adesao > new.taxa_comissao_adesao + 0.00005
       or v.taxa_comissao_recorrente > new.taxa_comissao_recorrente + 0.00005);

  if v_acima is not null then
    raise exception 'Nao da para reduzir a comissao da regional: % ficaria(m) acima do novo teto. Ajuste o(s) vendedor(es) primeiro.', v_acima
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create or replace function repassar_comissao_vendedor(p_comissao_id uuid)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  c        comissoes_vendas;
  v_nome   text;
  v_reg    uuid;
  v_cat    uuid;
  v_lanc   uuid;
begin
  select * into c from comissoes_vendas where id = p_comissao_id for update;
  if not found then raise exception 'Comissao nao encontrada'; end if;
  if c.status_pagamento = 'pago' then
    raise exception 'Comissao ja repassada' using errcode = 'check_violation';
  end if;
  if coalesce(c.valor_comissao, 0) <= 0 then
    raise exception 'Comissao sem valor a repassar' using errcode = 'check_violation';
  end if;

  -- left join: sem isto o vendedor sem usuario de portal nao era encontrado e
  -- o titulo nascia com regional NULA, caindo no financeiro da matriz.
  select coalesce(v.nome, u.nome), v.regional_id into v_nome, v_reg
    from vendedores v
    left join usuarios u on u.id = v.usuario_id
   where v.id = c.vendedor_id;

  select id into v_cat from categorias_dre where codigo_estruturado = '3.2.01';

  insert into lancamentos_financeiros
    (tipo, descricao, categoria_dre_id, regional_id, vendedor_id, valor_original,
     data_emissao, data_vencimento, competencia, observacoes)
  values ('DESPESA',
          'Repasse de comissao - ' || coalesce(v_nome, 'vendedor'),
          v_cat, v_reg, c.vendedor_id, c.valor_comissao,
          current_date, current_date, current_date,
          'Comissao ' || p_comissao_id::text)
  returning id into v_lanc;

  update comissoes_vendas set status_pagamento = 'pago' where id = p_comissao_id;
  return v_lanc;
end;
$$;

create or replace function checklist_lead(p_lead_id uuid)
returns table (
  item     text,
  grupo    text,
  ok       boolean,
  detalhe  text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  l        leads;
  v_doc    text;
  v_tipo   tipo_pessoa;
  v_fotos  int;
  v_vist   int;
begin
  select * into l from leads where id = p_lead_id;
  if not found then
    return query select 'Lead'::text, 'Geral'::text, false, 'Lead nao encontrado'::text;
    return;
  end if;

  v_doc  := regexp_replace(coalesce(l.cpf_cnpj, ''), '[^0-9]', '', 'g');
  v_tipo := coalesce(l.tipo_pessoa, (case when length(v_doc) > 11 then 'PJ' else 'PF' end)::tipo_pessoa);

  select count(*) into v_vist from vistorias where lead_id = p_lead_id;
  select count(*) into v_fotos
    from vistoria_anexos a join vistorias vi on vi.id = a.vistoria_id
   where vi.lead_id = p_lead_id;

  -- Associado -------------------------------------------------------------
  return query select 'CPF/CNPJ valido', 'Associado',
    (v_doc <> '' and validar_documento(v_doc, v_tipo)),
    coalesce(nullif(v_doc, ''), 'nao informado');

  return query select 'Nome completo', 'Associado',
    (coalesce(trim(l.nome), '') <> '' and position(' ' in trim(l.nome)) > 0),
    coalesce(nullif(l.nome, ''), 'nao informado');

  return query select 'Celular', 'Associado',
    (length(regexp_replace(coalesce(l.celular, ''), '[^0-9]', '', 'g')) >= 10),
    coalesce(nullif(l.celular, ''), 'nao informado');

  return query select 'E-mail', 'Associado',
    (coalesce(l.email, '') ~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$'),
    coalesce(nullif(l.email, ''), 'nao informado');

  return query select 'Endereco completo', 'Associado',
    (coalesce(l.endereco->>'cep', '') <> '' and coalesce(l.endereco->>'logradouro', '') <> ''
     and coalesce(l.endereco->>'numero', '') <> '' and coalesce(l.endereco->>'cidade', '') <> ''
     and coalesce(l.endereco->>'uf', '') <> ''),
    coalesce(nullif(concat_ws(', ', l.endereco->>'logradouro', l.endereco->>'numero',
                              l.endereco->>'cidade', l.endereco->>'uf'), ''), 'nao informado');

  return query select
    (case when v_tipo = 'PJ' then 'Inscricao estadual / RG' else 'RG' end), 'Associado',
    (coalesce(l.rg_ie, '') <> ''), coalesce(nullif(l.rg_ie, ''), 'nao informado');

  return query select 'Data de nascimento / fundacao', 'Associado',
    (l.data_nascimento is not null),
    coalesce(to_char(l.data_nascimento, 'DD/MM/YYYY'), 'nao informada');

  -- Veiculo ---------------------------------------------------------------
  return query select 'Placa', 'Veiculo',
    (coalesce(l.placa, '') <> ''), coalesce(nullif(l.placa, ''), 'nao informada');

  return query select 'Chassi', 'Veiculo',
    (length(regexp_replace(coalesce(l.chassi, ''), '[^0-9A-Za-z]', '', 'g')) = 17),
    coalesce(nullif(l.chassi, ''), 'nao informado');

  return query select 'Renavam', 'Veiculo',
    (length(regexp_replace(coalesce(l.renavam, ''), '[^0-9]', '', 'g')) between 9 and 11),
    coalesce(nullif(l.renavam, ''), 'nao informado');

  return query select 'Marca e modelo', 'Veiculo',
    (coalesce(l.marca, '') <> '' and coalesce(l.modelo, '') <> ''),
    coalesce(nullif(concat_ws(' ', l.marca, l.modelo), ''), 'nao informado');

  return query select 'Ano fabricacao / modelo', 'Veiculo',
    (l.ano_fabricacao is not null and l.ano_modelo is not null),
    coalesce(concat_ws('/', l.ano_fabricacao::text, l.ano_modelo::text), 'nao informado');

  return query select 'Cor', 'Veiculo',
    (coalesce(l.cor, '') <> ''), coalesce(nullif(l.cor, ''), 'nao informada');

  return query select 'Valor FIPE', 'Veiculo',
    (coalesce(l.valor_fipe, 0) > 0),
    coalesce(to_char(l.valor_fipe, 'FM999G999D00'), 'nao informado');

  return query select 'Tipo de veiculo (precificacao)', 'Veiculo',
    (l.tipo_veiculo_id is not null),
    coalesce((select nome from tipos_veiculo where id = l.tipo_veiculo_id), 'nao informado');

  -- Documentos ------------------------------------------------------------
  return query select 'CRLV do veiculo', 'Documentos',
    (coalesce(l.crlv_url, '') <> '' or coalesce(l.crlv_qrcode, '') <> ''),
    (case when coalesce(l.crlv_qrcode, '') <> '' then 'QR Code lido'
          when coalesce(l.crlv_url, '') <> '' then 'arquivo anexado'
          else 'nao anexado' end);

  return query select 'Vistoria registrada', 'Documentos',
    (v_vist > 0), (v_vist || ' vistoria(s)')::text;

  return query select 'Fotos da vistoria (min. 4)', 'Documentos',
    (v_fotos >= 4), (v_fotos || ' foto(s))')::text;

  -- Venda -----------------------------------------------------------------
  return query select 'Plano contratado', 'Venda',
    (l.plano_id is not null),
    coalesce((select nome from planos_protecao where id = l.plano_id), 'nao informado');

  return query select 'Vendedor responsavel', 'Venda',
    (l.vendedor_id is not null),
    -- left join + v.nome: o vendedor sem usuario de portal (0035) continua
    -- sendo vendedor valido; o join interno o descartava.
    coalesce((select coalesce(v.nome, u.nome) from vendedores v
               left join usuarios u on u.id = v.usuario_id
               where v.id = l.vendedor_id), 'nao informado');

  return query select 'Forma de recebimento da adesao', 'Venda',
    (l.adesao_forma is not null and coalesce(l.adesao_valor, 0) > 0),
    coalesce(l.adesao_forma::text, 'nao informada');
end;
$$;

-- ============================================================================
-- (E) FINANCEIRO DA UNIDADE
-- ============================================================================

-- Classificacao contabil resolvida pelo banco: a franquia nao escolhe conta.
create or replace function regional_categoria_movimento(p_tipo text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from categorias_dre
   where codigo_estruturado = case upper(p_tipo)
                                when 'COMISSAO_RECEBER' then '1.3.01'
                                when 'COMISSAO_PAGAR'   then '3.2.01'
                              end;
$$;

-- ----------------------------------------------------------------------------
-- Guarda comum das escritas: o titulo tem de ser DESTA unidade.
-- `escopo_regional(x)` devolve x para admin/financeiro e a propria regional
-- para o gestor — entao a comparacao abaixo barra tanto a franquia vizinha
-- quanto o titulo da matriz (regional nula).
-- ----------------------------------------------------------------------------
create or replace function regional_titulo_no_escopo(p_lancamento_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from lancamentos_financeiros l
     where l.id = p_lancamento_id
       and l.regional_id is not distinct from escopo_regional(l.regional_id)
  );
$$;

-- ----------------------------------------------------------------------------
-- Indicadores da unidade (compactos: a receber, a pagar e o que ja liquidou)
-- ----------------------------------------------------------------------------
create or replace function regional_financeiro_resumo(
  p_regional_id uuid,
  p_inicio      date,
  p_fim         date
)
returns table (
  a_receber_aberto  numeric,
  a_receber_vencido numeric,
  a_pagar_aberto    numeric,
  a_pagar_vencido   numeric,
  recebido_periodo  numeric,
  pago_periodo      numeric,
  saldo_periodo     numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with reg as (select escopo_regional(p_regional_id) as id),
  aberto as (
    select l.tipo,
           coalesce(l.valor_saldo, l.valor_original) as saldo,
           l.data_vencimento
      from lancamentos_financeiros l
     where l.regional_id = (select id from reg)
       and l.status not in ('quitado', 'cancelado')
  ),
  baixado as (
    select l.tipo, b.valor_pago
      from baixas_financeiras b
      join lancamentos_financeiros l on l.id = b.lancamento_id
     where l.regional_id = (select id from reg)
       and l.status <> 'cancelado'
       and b.data_pagamento between p_inicio and p_fim
  )
  select
    coalesce((select sum(saldo) from aberto where tipo = 'RECEITA'), 0),
    coalesce((select sum(saldo) from aberto where tipo = 'RECEITA' and data_vencimento < current_date), 0),
    coalesce((select sum(saldo) from aberto where tipo = 'DESPESA'), 0),
    coalesce((select sum(saldo) from aberto where tipo = 'DESPESA' and data_vencimento < current_date), 0),
    coalesce((select sum(valor_pago) from baixado where tipo = 'RECEITA'), 0),
    coalesce((select sum(valor_pago) from baixado where tipo = 'DESPESA'), 0),
    coalesce((select sum(valor_pago) from baixado where tipo = 'RECEITA'), 0)
      - coalesce((select sum(valor_pago) from baixado where tipo = 'DESPESA'), 0);
$$;

-- ----------------------------------------------------------------------------
-- Fila de titulos da unidade. `situacao` ja vem efetiva (vencido pela data).
-- ----------------------------------------------------------------------------
create or replace function regional_financeiro_titulos(
  p_regional_id uuid,
  p_inicio      date default null,
  p_fim         date default null,
  p_tipo        text default null,   -- RECEITA | DESPESA
  p_situacao    text default null    -- aberto | vencido | quitado | cancelado
)
returns table (
  id              uuid,
  tipo            text,
  descricao       text,
  favorecido      text,
  categoria       text,
  data_vencimento date,
  valor_original  numeric,
  valor_pago      numeric,
  valor_saldo     numeric,
  status          text,
  situacao        text,
  observacoes     text
)
language sql
stable
security definer
set search_path = public
as $$
  with reg as (select escopo_regional(p_regional_id) as id)
  select l.id,
         l.tipo::text,
         l.descricao,
         coalesce(ve.nome, u.nome, f.razao_social, c.nome_razao_social),
         cat.nome,
         l.data_vencimento,
         l.valor_original,
         coalesce(l.valor_pago, 0),
         coalesce(l.valor_saldo, l.valor_original),
         l.status::text,
         case
           when l.status = 'cancelado' then 'cancelado'
           when l.status = 'quitado'   then 'quitado'
           when l.data_vencimento < current_date then 'vencido'
           when coalesce(l.valor_pago, 0) > 0 then 'parcial'
           else 'aberto'
         end,
         l.observacoes
    from lancamentos_financeiros l
    left join vendedores    ve  on ve.id  = l.vendedor_id
    left join usuarios      u   on u.id   = ve.usuario_id
    left join fornecedores  f   on f.id   = l.fornecedor_id
    left join clientes      c   on c.id   = l.cliente_id
    left join categorias_dre cat on cat.id = l.categoria_dre_id
   where l.regional_id = (select id from reg)
     and (p_inicio is null or l.data_vencimento >= p_inicio)
     and (p_fim    is null or l.data_vencimento <= p_fim)
     and (p_tipo   is null or l.tipo::text = upper(p_tipo))
     and (p_situacao is null or p_situacao = case
           when l.status = 'cancelado' then 'cancelado'
           when l.status = 'quitado'   then 'quitado'
           when l.data_vencimento < current_date then 'vencido'
           when coalesce(l.valor_pago, 0) > 0 then 'parcial'
           else 'aberto'
         end)
   order by l.data_vencimento, l.created_at;
$$;

-- ----------------------------------------------------------------------------
-- Lancar um titulo da unidade. So os dois movimentos de comissao.
-- A regional gravada e SEMPRE a de quem chama (escopo_regional).
-- ----------------------------------------------------------------------------
create or replace function regional_lancar_titulo(
  p_regional_id uuid,
  p_tipo        text,           -- COMISSAO_RECEBER | COMISSAO_PAGAR
  p_descricao   text,
  p_valor       numeric,
  p_vencimento  date,
  p_vendedor_id uuid default null,
  p_observacoes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reg  uuid := escopo_regional(p_regional_id);
  v_tipo text := upper(coalesce(p_tipo, ''));
  v_cat  uuid;
  v_id   uuid;
begin
  if not is_staff() then
    raise exception 'Sem permissao para lancar no financeiro da unidade'
      using errcode = 'insufficient_privilege';
  end if;
  if v_reg is null then
    raise exception 'Informe a unidade do lancamento' using errcode = 'check_violation';
  end if;
  if v_tipo not in ('COMISSAO_RECEBER', 'COMISSAO_PAGAR') then
    raise exception 'Movimento invalido: o financeiro da franquia trata comissao a receber e a pagar'
      using errcode = 'check_violation';
  end if;
  if coalesce(trim(p_descricao), '') = '' then
    raise exception 'Descreva o lancamento' using errcode = 'check_violation';
  end if;
  if coalesce(p_valor, 0) <= 0 then
    raise exception 'Informe um valor maior que zero' using errcode = 'check_violation';
  end if;
  if p_vencimento is null then
    raise exception 'Informe o vencimento' using errcode = 'check_violation';
  end if;

  -- O vendedor tem de ser da propria unidade.
  if p_vendedor_id is not null
     and not exists (select 1 from vendedores where id = p_vendedor_id and regional_id = v_reg) then
    raise exception 'Este vendedor nao pertence a sua unidade' using errcode = 'check_violation';
  end if;

  v_cat := regional_categoria_movimento(v_tipo);

  insert into lancamentos_financeiros
    (tipo, descricao, categoria_dre_id, regional_id, vendedor_id, valor_original,
     data_emissao, data_vencimento, competencia, observacoes)
  values (case when v_tipo = 'COMISSAO_RECEBER' then 'RECEITA' else 'DESPESA' end::tipo_movimentacao,
          trim(p_descricao), v_cat, v_reg, p_vendedor_id, round(p_valor, 2),
          current_date, p_vencimento, date_trunc('month', p_vencimento)::date,
          nullif(trim(coalesce(p_observacoes, '')), ''))
  returning id into v_id;

  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Baixa da unidade: data, valor e COMO pagou/recebeu (sem conta da matriz).
-- ----------------------------------------------------------------------------
create or replace function regional_baixar_titulo(
  p_lancamento_id uuid,
  p_data          date,
  p_valor         numeric,
  p_forma         text default null,
  p_observacao    text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not is_staff() then
    raise exception 'Sem permissao para baixar titulo da unidade'
      using errcode = 'insufficient_privilege';
  end if;
  if not regional_titulo_no_escopo(p_lancamento_id) then
    raise exception 'Titulo nao encontrado nesta unidade' using errcode = 'check_violation';
  end if;
  if coalesce(p_valor, 0) <= 0 then
    raise exception 'Informe o valor pago' using errcode = 'check_violation';
  end if;

  -- O trigger fn_recalcular_lancamento (0012) barra baixa a maior e atualiza
  -- status; o fn_lanc_calcular_saldo (0032) atualiza o saldo em cache.
  insert into baixas_financeiras
    (lancamento_id, data_pagamento, valor_pago, valor_liquido, forma_pagamento, observacao)
  values (p_lancamento_id, coalesce(p_data, current_date), round(p_valor, 2), round(p_valor, 2),
          case when coalesce(trim(p_forma), '') = '' then null
               else upper(trim(p_forma))::forma_pagamento end,
          nullif(trim(coalesce(p_observacao, '')), ''))
  returning id into v_id;

  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Cancelar (o historico e imutavel: muda o status, nao apaga)
-- ----------------------------------------------------------------------------
create or replace function regional_cancelar_titulo(
  p_lancamento_id uuid,
  p_motivo        text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago numeric;
begin
  if not is_staff() then
    raise exception 'Sem permissao' using errcode = 'insufficient_privilege';
  end if;
  if not regional_titulo_no_escopo(p_lancamento_id) then
    raise exception 'Titulo nao encontrado nesta unidade' using errcode = 'check_violation';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Informe o motivo do cancelamento' using errcode = 'check_violation';
  end if;

  select coalesce(valor_pago, 0) into v_pago
    from lancamentos_financeiros where id = p_lancamento_id;
  if v_pago > 0 then
    raise exception 'Titulo com baixa registrada nao pode ser cancelado' using errcode = 'check_violation';
  end if;

  update lancamentos_financeiros
     set status = 'cancelado',
         observacoes = trim(coalesce(observacoes || ' | ', '') || 'Cancelado: ' || trim(p_motivo))
   where id = p_lancamento_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Repassar a comissao do vendedor pelo portal da franquia.
-- Wrapper com escopo: o gestor so repassa comissao de vendedor da SUA unidade.
-- ----------------------------------------------------------------------------
create or replace function regional_repassar_comissao(p_comissao_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reg uuid;
begin
  if not is_staff() then
    raise exception 'Sem permissao' using errcode = 'insufficient_privilege';
  end if;

  select v.regional_id into v_reg
    from comissoes_vendas c join vendedores v on v.id = c.vendedor_id
   where c.id = p_comissao_id;

  if v_reg is null or v_reg is distinct from escopo_regional(v_reg) then
    raise exception 'Comissao nao encontrada nesta unidade' using errcode = 'check_violation';
  end if;

  return repassar_comissao_vendedor(p_comissao_id);
end;
$$;

grant execute on function regional_categoria_movimento(text) to authenticated;
grant execute on function regional_titulo_no_escopo(uuid) to authenticated;
grant execute on function regional_financeiro_resumo(uuid, date, date) to authenticated;
grant execute on function regional_financeiro_titulos(uuid, date, date, text, text) to authenticated;
grant execute on function regional_lancar_titulo(uuid, text, text, numeric, date, uuid, text) to authenticated;
grant execute on function regional_baixar_titulo(uuid, date, numeric, text, text) to authenticated;
grant execute on function regional_cancelar_titulo(uuid, text) to authenticated;
grant execute on function regional_repassar_comissao(uuid) to authenticated;
