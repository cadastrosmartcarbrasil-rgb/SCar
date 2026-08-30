-- ============================================================================
-- SCar :: 0034_vendas_rota_completa.sql
--
-- (A) COMISSAO EM DOIS NIVEIS (regional = franquia -> vendedor)
--     A regional recebe um percentual da associacao (ex.: adesao 100%,
--     recorrencia 15%) e distribui parte dele entre os seus vendedores.
--     REGRA DURA: a comissao do vendedor NUNCA passa a da sua regional.
--
-- (B) ROTA DA VENDA COMPLETA
--     O lead deixa de virar veiculo com apenas o CPF: passa a carregar a ficha
--     cadastral do associado, a ficha completa do veiculo, a vistoria com
--     fotos e o CRLV. `autorizar_entrada_lead` so efetiva com tudo presente.
--
-- (C) ADESAO (1a mensalidade, do vendedor)
--     Recebida PELO VENDEDOR na hora  -> nada entra no financeiro; fica so o
--       registro e a comissao ja quitada (o dinheiro nunca passou na conta).
--     Recebida PELO NOSSO SISTEMA (boleto/PIX/cartao) -> vira titulo a receber
--       e a comissao do vendedor nasce PENDENTE, para ser repassada depois.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (A) Comissao da regional (mesma unidade dos vendedores: fracao, 0.15 = 15%)
-- ----------------------------------------------------------------------------
alter table regionais
  add column if not exists taxa_comissao_adesao     numeric(6,4) not null default 0,
  add column if not exists taxa_comissao_recorrente numeric(6,4) not null default 0;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'chk_regional_comissao') then
    alter table regionais add constraint chk_regional_comissao check (
      taxa_comissao_adesao between 0 and 1 and taxa_comissao_recorrente between 0 and 1
    );
  end if;
end $$;

comment on column regionais.taxa_comissao_adesao is
  'Fracao da taxa de adesao que fica com a regional (1.0 = 100%). Teto do vendedor.';
comment on column regionais.taxa_comissao_recorrente is
  'Fracao da mensalidade recorrente que fica com a regional. Teto do vendedor.';

-- Teto que a regional pode ceder ao vendedor.
create or replace function limite_comissao_regional(p_regional_id uuid)
returns table (adesao numeric, recorrente numeric)
language sql stable security definer set search_path = public as $$
  select coalesce(taxa_comissao_adesao, 0), coalesce(taxa_comissao_recorrente, 0)
    from regionais where id = p_regional_id;
$$;

-- A comissao do vendedor nunca pode passar a da regional a que ele pertence.
create or replace function fn_vendedor_valida_comissao()
returns trigger language plpgsql as $$
declare
  v_lim record;
begin
  if new.regional_id is null then
    if new.taxa_comissao_adesao > 0 or new.taxa_comissao_recorrente > 0 then
      raise exception 'Vendedor sem regional nao pode ter comissao: defina a regional primeiro'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  select * into v_lim from limite_comissao_regional(new.regional_id);

  if new.taxa_comissao_adesao > v_lim.adesao + 0.00005 then
    raise exception 'Comissao de adesao do vendedor (%) nao pode passar a da regional (%)',
      round(new.taxa_comissao_adesao * 100, 2)::text || '%',
      round(v_lim.adesao * 100, 2)::text || '%'
      using errcode = 'check_violation';
  end if;
  if new.taxa_comissao_recorrente > v_lim.recorrente + 0.00005 then
    raise exception 'Comissao recorrente do vendedor (%) nao pode passar a da regional (%)',
      round(new.taxa_comissao_recorrente * 100, 2)::text || '%',
      round(v_lim.recorrente * 100, 2)::text || '%'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vendedor_comissao on vendedores;
create trigger trg_vendedor_comissao
  before insert or update on vendedores
  for each row execute function fn_vendedor_valida_comissao();

-- Baixar a comissao da regional nao pode deixar vendedor acima do novo teto.
create or replace function fn_regional_valida_comissao()
returns trigger language plpgsql as $$
declare
  v_acima text;
begin
  select string_agg(u.nome, ', ') into v_acima
    from vendedores v
    join usuarios u on u.id = v.usuario_id
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

drop trigger if exists trg_regional_comissao on regionais;
create trigger trg_regional_comissao
  before update of taxa_comissao_adesao, taxa_comissao_recorrente on regionais
  for each row execute function fn_regional_valida_comissao();

-- ----------------------------------------------------------------------------
-- (B) Ficha completa no lead (staging da venda, antes de virar base)
-- ----------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'forma_recebimento_adesao') then
    create type forma_recebimento_adesao as enum ('VENDEDOR_NA_HORA', 'BOLETO', 'PIX', 'CARTAO');
  end if;
end $$;

alter table leads
  -- associado
  add column if not exists tipo_pessoa          tipo_pessoa,
  add column if not exists rg_ie                text,
  add column if not exists data_nascimento      date,
  add column if not exists endereco             jsonb not null default '{}'::jsonb,
  add column if not exists cliente_existente_id uuid references clientes(id) on delete set null,
  -- veiculo
  add column if not exists chassi               text,
  add column if not exists renavam              text,
  add column if not exists cor                  text,
  add column if not exists ano_fabricacao       smallint,
  add column if not exists crlv_qrcode          text,
  add column if not exists crlv_url             text,
  -- venda
  add column if not exists vendedor_id          uuid references vendedores(id) on delete set null,
  add column if not exists plano_id             uuid references planos_protecao(id) on delete set null,
  add column if not exists adesao_forma         forma_recebimento_adesao,
  add column if not exists adesao_valor         numeric(12,2),
  add column if not exists adesao_recebida_em   date,
  add column if not exists adesao_comprovante_url text;

create index if not exists idx_leads_vendedor on leads (vendedor_id);
create index if not exists idx_leads_cliente_existente on leads (cliente_existente_id);

-- ----------------------------------------------------------------------------
-- (C) Vistoria pode nascer no LEAD (antes do veiculo existir)
-- ----------------------------------------------------------------------------
alter table vistorias alter column veiculo_id drop not null;
alter table vistorias add column if not exists lead_id uuid references leads(id) on delete cascade;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'chk_vistoria_origem') then
    alter table vistorias add constraint chk_vistoria_origem
      check (veiculo_id is not null or lead_id is not null);
  end if;
end $$;
create index if not exists idx_vistorias_lead on vistorias (lead_id);

-- ----------------------------------------------------------------------------
-- (D) Checklist de entrada na base
--     Uma fonte unica: a tela mostra o que falta e a autorizacao usa o mesmo
--     criterio, entao nao existe "passou na tela e o banco recusou".
-- ----------------------------------------------------------------------------
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
    coalesce((select u.nome from vendedores v join usuarios u on u.id = v.usuario_id
               where v.id = l.vendedor_id), 'nao informado');

  return query select 'Forma de recebimento da adesao', 'Venda',
    (l.adesao_forma is not null and coalesce(l.adesao_valor, 0) > 0),
    coalesce(l.adesao_forma::text, 'nao informada');
end;
$$;

/** true quando o lead pode entrar na base. */
create or replace function lead_pronto_para_base(p_lead_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(bool_and(ok), false) from checklist_lead(p_lead_id);
$$;

-- ----------------------------------------------------------------------------
-- (E) Entrada na base: agora exige a ficha inteira e trata a adesao
-- ----------------------------------------------------------------------------
create or replace function autorizar_entrada_lead(p_lead_id uuid, p_cpf_cnpj text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  l           leads;
  v_doc       text;
  v_tipo      tipo_pessoa;
  v_cliente   uuid;
  v_veiculo   uuid;
  v_pendente  text;
  v_vend      vendedores;
  v_comissao  numeric := 0;
  v_lanc      uuid;
  v_cat       uuid;
begin
  if not pode_auditar() then
    raise exception 'Sem permissao: apenas a Auditoria pode autorizar a entrada na base';
  end if;

  select * into l from leads where id = p_lead_id for update;
  if not found then raise exception 'Lead nao encontrado'; end if;
  if l.status <> 'EM_AUDITORIA' then
    raise exception 'Lead nao esta Em Auditoria (status atual: %)', l.status;
  end if;
  if l.veiculo_id is not null then raise exception 'Lead ja foi convertido'; end if;

  if p_cpf_cnpj is not null then
    update leads set cpf_cnpj = regexp_replace(p_cpf_cnpj, '[^0-9]', '', 'g')
     where id = p_lead_id;
    select * into l from leads where id = p_lead_id;
  end if;

  -- TRAVA: o veiculo so entra na base com a ficha completa.
  select string_agg(item, '; ') into v_pendente
    from checklist_lead(p_lead_id) where not ok;
  if v_pendente is not null then
    raise exception 'Cadastro incompleto - falta: %', v_pendente
      using errcode = 'check_violation';
  end if;

  v_doc  := regexp_replace(coalesce(l.cpf_cnpj, ''), '[^0-9]', '', 'g');
  v_tipo := coalesce(l.tipo_pessoa, (case when length(v_doc) > 11 then 'PJ' else 'PF' end)::tipo_pessoa);

  -- Associado: reaproveita pelo documento (atualizando a ficha) ou cria.
  select id into v_cliente from clientes where cpf_cnpj = v_doc;
  if v_cliente is null then
    insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, rg_ie, email, telefone,
                          endereco, regional_id)
    values (v_tipo, l.nome, v_doc, l.rg_ie, l.email, l.celular, l.endereco, l.regional_id)
    returning id into v_cliente;
  else
    update clientes set
      nome_razao_social = coalesce(nullif(l.nome, ''), nome_razao_social),
      rg_ie             = coalesce(nullif(l.rg_ie, ''), rg_ie),
      email             = coalesce(nullif(l.email, ''), email),
      telefone          = coalesce(nullif(l.celular, ''), telefone),
      endereco          = case when l.endereco = '{}'::jsonb then endereco else l.endereco end
    where id = v_cliente;
  end if;

  -- Veiculo oficial, agora com a ficha completa.
  insert into veiculos (cliente_id, placa, chassi, renavam, marca, modelo, ano_fabricacao,
                        ano_modelo, cor, valor_fipe, codigo_fipe, combustivel, uso,
                        tipo_veiculo_id, cota_participacao_id, modelo_id, regional_id,
                        vendedor_id, plano_protecao_id, status)
  values (v_cliente, upper(l.placa),
          nullif(upper(regexp_replace(coalesce(l.chassi, ''), '[^0-9A-Za-z]', '', 'g')), ''),
          nullif(regexp_replace(coalesce(l.renavam, ''), '[^0-9]', '', 'g'), ''),
          l.marca, l.modelo, l.ano_fabricacao, l.ano_modelo, l.cor, l.valor_fipe, l.codigo_fipe,
          l.combustivel, l.uso, l.tipo_veiculo_id, l.cota_participacao_id, l.modelo_id,
          l.regional_id, l.vendedor_id, l.plano_id, 'ativo')
  returning id into v_veiculo;

  -- A vistoria feita na venda passa a ser a vistoria do veiculo.
  update vistorias set veiculo_id = v_veiculo, status = 'APROVADA'
   where lead_id = p_lead_id and veiculo_id is null;

  -- ---------------------------------------------------------------- adesao
  select * into v_vend from vendedores where id = l.vendedor_id;
  v_comissao := round(coalesce(l.adesao_valor, 0) * coalesce(v_vend.taxa_comissao_adesao, 0), 2);

  if l.adesao_forma::text = 'VENDEDOR_NA_HORA' then
    -- O dinheiro nunca passou pela associacao: NADA entra no financeiro.
    -- Fica so o registro da comissao, ja quitada na origem.
    insert into comissoes_vendas (vendedor_id, veiculo_id, valor_comissao, is_adesao, status_pagamento)
    values (l.vendedor_id, v_veiculo, coalesce(l.adesao_valor, 0), true, 'pago');
  else
    -- Recebido pelo nosso sistema: vira titulo a receber e a comissao do
    -- vendedor nasce PENDENTE (sai depois, no repasse).
    select id into v_cat from categorias_dre where codigo_estruturado = '1.1.01';
    insert into lancamentos_financeiros
      (tipo, cliente_id, descricao, categoria_dre_id, regional_id, valor_original,
       data_emissao, data_vencimento, competencia, forma_pagamento_prevista, observacoes)
    values ('RECEITA', v_cliente,
            'Taxa de adesao - ' || upper(l.placa),
            v_cat, l.regional_id, l.adesao_valor,
            current_date, coalesce(l.adesao_recebida_em, current_date), current_date,
            (case l.adesao_forma::text when 'BOLETO' then 'BOLETO'
                                       when 'PIX' then 'PIX'
                                       else 'CARTAO' end)::forma_pagamento,
            'Adesao da venda ' || p_lead_id::text)
    returning id into v_lanc;

    insert into comissoes_vendas (vendedor_id, veiculo_id, valor_comissao, is_adesao, status_pagamento)
    values (l.vendedor_id, v_veiculo, v_comissao, true, 'pendente');
  end if;

  update leads set
    status = 'ATIVO', cliente_id = v_cliente, veiculo_id = v_veiculo,
    cpf_cnpj = v_doc, auditado_em = now(), auditado_por = auth.uid()
  where id = p_lead_id;

  return v_veiculo;
end;
$$;

-- Repasse da comissao ao vendedor: vira contas a pagar (o dinheiro sai daqui).
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

  select u.nome, v.regional_id into v_nome, v_reg
    from vendedores v join usuarios u on u.id = v.usuario_id
   where v.id = c.vendedor_id;

  select id into v_cat from categorias_dre where codigo_estruturado = '3.2.01';

  insert into lancamentos_financeiros
    (tipo, descricao, categoria_dre_id, regional_id, valor_original,
     data_emissao, data_vencimento, competencia, observacoes)
  values ('DESPESA',
          'Repasse de comissao - ' || coalesce(v_nome, 'vendedor'),
          v_cat, v_reg, c.valor_comissao,
          current_date, current_date, current_date,
          'Comissao ' || p_comissao_id::text)
  returning id into v_lanc;

  update comissoes_vendas set status_pagamento = 'pago' where id = p_comissao_id;
  return v_lanc;
end;
$$;

grant execute on function limite_comissao_regional(uuid) to authenticated;
grant execute on function checklist_lead(uuid) to authenticated;
grant execute on function lead_pronto_para_base(uuid) to authenticated;
grant execute on function repassar_comissao_vendedor(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- (F) RLS da vistoria: agora ela tambem pode pertencer a um LEAD.
--     Sem isto a vistoria feita na venda (ainda sem veiculo) ficaria invisivel
--     e ninguem conseguiria anexar as fotos.
-- ----------------------------------------------------------------------------
drop policy if exists vist_select on vistorias;
drop policy if exists vist_write  on vistorias;

create policy vist_select on vistorias for select to authenticated using (
  exists (select 1 from veiculos v where v.id = veiculo_id
           and (pode_regional(v.regional_id) or v.cliente_id = auth_cliente_id()))
  or exists (select 1 from leads l where l.id = lead_id
           and (tem_acesso_global() or pode_auditar() or pode_regional(l.regional_id)
                or l.consultor_id = auth.uid() or l.created_by = auth.uid()))
);
create policy vist_write on vistorias for all to authenticated using (
  exists (select 1 from veiculos v where v.id = veiculo_id and pode_regional(v.regional_id))
  or exists (select 1 from leads l where l.id = lead_id
           and (tem_acesso_global() or pode_auditar() or pode_regional(l.regional_id)
                or l.consultor_id = auth.uid() or l.created_by = auth.uid()))
) with check (
  exists (select 1 from veiculos v where v.id = veiculo_id and pode_regional(v.regional_id))
  or exists (select 1 from leads l where l.id = lead_id
           and (tem_acesso_global() or pode_auditar() or pode_regional(l.regional_id)
                or l.consultor_id = auth.uid() or l.created_by = auth.uid()))
);

drop policy if exists vanx_select on vistoria_anexos;
drop policy if exists vanx_write  on vistoria_anexos;

create policy vanx_select on vistoria_anexos for select to authenticated using (
  exists (select 1 from vistorias vs where vs.id = vistoria_id)
);
create policy vanx_write on vistoria_anexos for all to authenticated using (
  exists (select 1 from vistorias vs where vs.id = vistoria_id)
) with check (
  exists (select 1 from vistorias vs where vs.id = vistoria_id)
);

-- ----------------------------------------------------------------------------
-- (G) Bucket das fotos da vistoria e do CRLV (privado)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('vendas', 'vendas', false)
on conflict (id) do nothing;

drop policy if exists storage_vendas_all on storage.objects;
create policy storage_vendas_all on storage.objects for all to authenticated
  using (bucket_id = 'vendas' and is_staff())
  with check (bucket_id = 'vendas' and is_staff());
