-- ============================================================================
-- SCar :: 0010_precificacao.sql
-- Modulo de Precificacao (baseado na TABELA_SMART_CAR_2026).
-- Cadastros base (tipos de veiculo, produtos), matriz de precos por faixa FIPE,
-- participacao/franquia por faixa, composicao de planos e motor de calculo.
-- ============================================================================

create type metodo_preco     as enum ('FAIXA_FIPE', 'FIXO', 'PERCENTUAL_FIPE');
create type tipo_valor_faixa as enum ('VALOR', 'PERCENTUAL');

-- ----------------------------------------------------------------------------
-- 1.1 Tipos de veiculo (categoria de risco)
-- ----------------------------------------------------------------------------
create table tipos_veiculo (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null unique,
  status     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 1.3 Produtos / beneficios (componentes da mensalidade)
-- ----------------------------------------------------------------------------
create table produtos (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null unique,
  fornecedor_nome  text not null default 'Interno',
  tipo_evento_id   uuid references tipos_evento(id) on delete set null,
  metodo_preco     metodo_preco not null default 'FIXO',
  valor_fixo       numeric(12,2),        -- metodo FIXO
  percentual       numeric(8,5),         -- metodo PERCENTUAL_FIPE (0.04 = 4%)
  obrigatorio      boolean not null default false,
  categoria        text not null default 'BENEFICIO',  -- ADMIN | CASCO | RASTREADOR | BENEFICIO
  dados_adicionais jsonb not null default '{}'::jsonb,
  status           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index idx_produtos_obrig on produtos (obrigatorio) where status;

-- ----------------------------------------------------------------------------
-- 2.1 Matriz de precos por faixa FIPE (por tipo de veiculo e produto)
-- ----------------------------------------------------------------------------
create table tabela_precos_faixa (
  id              uuid primary key default gen_random_uuid(),
  tipo_veiculo_id uuid not null references tipos_veiculo(id) on delete cascade,
  produto_id      uuid not null references produtos(id) on delete cascade,
  fipe_minimo     numeric(12,2) not null,
  fipe_maximo     numeric(12,2) not null,
  valor_mensal    numeric(12,2) not null,     -- R$ (VALOR) ou fracao (PERCENTUAL)
  tipo_valor      tipo_valor_faixa not null default 'VALOR',
  created_at      timestamptz not null default now(),
  unique (tipo_veiculo_id, produto_id, fipe_minimo, fipe_maximo),
  check (fipe_maximo >= fipe_minimo)
);
create index idx_precos_lookup on tabela_precos_faixa (tipo_veiculo_id, produto_id, fipe_minimo, fipe_maximo);

-- ----------------------------------------------------------------------------
-- Participacao (franquia) por faixa FIPE
-- ----------------------------------------------------------------------------
create table participacao_faixa (
  id              uuid primary key default gen_random_uuid(),
  tipo_veiculo_id uuid not null references tipos_veiculo(id) on delete cascade,
  fipe_minimo     numeric(12,2) not null,
  fipe_maximo     numeric(12,2) not null,
  tipo_valor      tipo_valor_faixa not null default 'VALOR',
  valor           numeric(12,2) not null,      -- R$ (VALOR) ou fracao (PERCENTUAL)
  unique (tipo_veiculo_id, fipe_minimo, fipe_maximo)
);

-- ----------------------------------------------------------------------------
-- Composicao de planos (reutiliza planos_protecao) -> produtos
-- ----------------------------------------------------------------------------
create table plano_produtos (
  plano_id   uuid not null references planos_protecao(id) on delete cascade,
  produto_id uuid not null references produtos(id) on delete cascade,
  primary key (plano_id, produto_id)
);

-- Categoria de risco do veiculo (para calculo)
alter table veiculos add column if not exists tipo_veiculo_id uuid references tipos_veiculo(id) on delete set null;

-- ============================================================================
-- 3. MOTOR DE CALCULO
-- ============================================================================

-- Valor de um produto para um dado FIPE/tipo de veiculo.
create or replace function calcular_valor_produto(
  p_produto_id uuid, p_fipe numeric, p_tipo_veiculo_id uuid
)
returns numeric
language plpgsql stable
as $$
declare
  prod  produtos;
  faixa tabela_precos_faixa;
begin
  select * into prod from produtos where id = p_produto_id;
  if not found then return 0; end if;

  if prod.metodo_preco = 'FIXO' then
    return coalesce(prod.valor_fixo, 0);
  elsif prod.metodo_preco = 'PERCENTUAL_FIPE' then
    return round(p_fipe * coalesce(prod.percentual, 0), 2);
  else -- FAIXA_FIPE
    select * into faixa
      from tabela_precos_faixa
     where tipo_veiculo_id = p_tipo_veiculo_id
       and produto_id = p_produto_id
       and p_fipe >= fipe_minimo and p_fipe <= fipe_maximo
     order by fipe_minimo desc
     limit 1;
    if not found then return 0; end if;
    if faixa.tipo_valor = 'PERCENTUAL' then
      return round(p_fipe * faixa.valor_mensal, 2);
    end if;
    return faixa.valor_mensal;
  end if;
end;
$$;

-- Motor principal: mensalidade composta (obrigatorios + selecionados).
create or replace function calcular_mensalidade(
  p_fipe numeric,
  p_tipo_veiculo_id uuid,
  p_produtos_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql stable
as $$
declare
  rec record;
  v numeric;
  detalhe jsonb := '[]'::jsonb;
  total numeric := 0;
  sub_admin numeric := 0;
  sub_parceiros numeric := 0;
begin
  for rec in
    select * from produtos p
     where p.status = true
       and (p.obrigatorio = true or p.id = any(p_produtos_ids))
     order by p.categoria, p.nome
  loop
    v := calcular_valor_produto(rec.id, p_fipe, p_tipo_veiculo_id);
    detalhe := detalhe || jsonb_build_object(
      'produto_id', rec.id, 'nome', rec.nome, 'valor', v,
      'fornecedor', rec.fornecedor_nome, 'categoria', rec.categoria,
      'obrigatorio', rec.obrigatorio
    );
    total := total + v;
    if rec.categoria = 'ADMIN' then sub_admin := sub_admin + v; end if;
    if rec.fornecedor_nome is distinct from 'Interno' then sub_parceiros := sub_parceiros + v; end if;
  end loop;

  return jsonb_build_object(
    'valor_fipe', p_fipe,
    'detalhamento_produtos', detalhe,
    'subtotal_taxa_admin', sub_admin,
    'subtotal_beneficios_parceiros', sub_parceiros,
    'valor_total_mensalidade', total
  );
end;
$$;

-- Participacao (franquia) para um FIPE/tipo de veiculo.
create or replace function calcular_participacao(p_fipe numeric, p_tipo_veiculo_id uuid)
returns numeric
language plpgsql stable
as $$
declare f participacao_faixa;
begin
  select * into f from participacao_faixa
   where tipo_veiculo_id = p_tipo_veiculo_id
     and p_fipe >= fipe_minimo and p_fipe <= fipe_maximo
   order by fipe_minimo desc limit 1;
  if not found then return 0; end if;
  if f.tipo_valor = 'PERCENTUAL' then return round(p_fipe * f.valor, 2); end if;
  return f.valor;
end;
$$;

-- ============================================================================
-- RLS (catalogos: leitura staff, escrita global)
-- ============================================================================
alter table tipos_veiculo        enable row level security;
alter table produtos             enable row level security;
alter table tabela_precos_faixa  enable row level security;
alter table participacao_faixa   enable row level security;
alter table plano_produtos       enable row level security;

create policy tv_select on tipos_veiculo for select to authenticated using (is_staff());
create policy tv_write  on tipos_veiculo for all to authenticated using (tem_acesso_global()) with check (tem_acesso_global());
create policy prod_select on produtos for select to authenticated using (is_staff());
create policy prod_write  on produtos for all to authenticated using (tem_acesso_global()) with check (tem_acesso_global());
create policy precos_select on tabela_precos_faixa for select to authenticated using (is_staff());
create policy precos_write  on tabela_precos_faixa for all to authenticated using (tem_acesso_global()) with check (tem_acesso_global());
create policy part_select on participacao_faixa for select to authenticated using (is_staff());
create policy part_write  on participacao_faixa for all to authenticated using (tem_acesso_global()) with check (tem_acesso_global());
create policy pp_select on plano_produtos for select to authenticated using (is_staff());
create policy pp_write  on plano_produtos for all to authenticated using (tem_acesso_global()) with check (tem_acesso_global());

grant select, insert, update, delete on tipos_veiculo, produtos, tabela_precos_faixa, participacao_faixa, plano_produtos to authenticated;

-- ============================================================================
-- SEED: tipos de veiculo e produtos (baseado na planilha)
-- ============================================================================
insert into tipos_veiculo (nome) values
  ('Passeio'), ('Moto'), ('Pick-up / Van'), ('Diesel Leve'),
  ('Utilitario'), ('Caminhao Pesado'), ('Reboque')
on conflict (nome) do nothing;

insert into produtos (nome, fornecedor_nome, metodo_preco, valor_fixo, percentual, obrigatorio, categoria) values
  ('Taxa Administrativa', 'Interno',            'FAIXA_FIPE',      null,  null,  true,  'ADMIN'),
  ('Protecao Casco',      'Interno',            'FAIXA_FIPE',      null,  null,  true,  'CASCO'),
  ('RCF - Terceiros 30mil','Interno',           'FIXO',           10.00,  null,  true,  'BENEFICIO'),
  ('Assistencia 24h',     'Europ Assistance',   'FIXO',           20.00,  null,  true,  'BENEFICIO'),
  ('Rastreador',          'Interno',            'FAIXA_FIPE',      null,  null,  true,  'RASTREADOR'),
  ('Carro Reserva 7 dias','Interno',            'FIXO',           10.50,  null,  false, 'BENEFICIO'),
  ('Carro Reserva 15 dias','Interno',           'FIXO',           18.50,  null,  false, 'BENEFICIO'),
  ('Protecao Parabrisas', 'Interno',            'FIXO',           13.50,  null,  false, 'BENEFICIO'),
  ('Vidros Basicos',      'Interno',            'FIXO',           18.50,  null,  false, 'BENEFICIO'),
  ('Kit Total Vidros',    'Interno',            'FIXO',           23.50,  null,  false, 'BENEFICIO'),
  ('Seguro de Vida',      'MetLife',            'FIXO',            9.90,  null,  false, 'BENEFICIO')
on conflict (nome) do nothing;

-- Vincula Assistencia 24h e RCF a tipos de evento, quando existirem.
update produtos p set tipo_evento_id = t.id
  from tipos_evento t where p.nome = 'Assistencia 24h' and t.nome = 'Guincho / Assistencia';
update produtos p set tipo_evento_id = t.id
  from tipos_evento t where p.nome = 'RCF - Terceiros 30mil' and t.nome = 'Danos a Terceiros';

-- ============================================================================
-- SEED: matriz de precos e participacao (Passeio) extraida da planilha 2026
-- ============================================================================
-- Faixas de preco (Passeio) geradas da planilha TABELA_SMART_CAR_2026
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),0.0,20000.0,35.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),0.0,20000.0,35.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),0.0,20000.0,0.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),0.0,20000.0,'VALOR',1500.0);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),20001.0,25000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),20001.0,25000.0,55.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),20001.0,25000.0,0.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),20001.0,25000.0,'VALOR',1500.0);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),25001.0,30000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),25001.0,30000.0,60.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),25001.0,30000.0,0.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),25001.0,30000.0,'VALOR',1500.0);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),30001.0,35000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),30001.0,35000.0,65.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),30001.0,35000.0,0.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),30001.0,35000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),35001.0,40000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),35001.0,40000.0,75.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),35001.0,40000.0,0.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),35001.0,40000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),40001.0,45000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),40001.0,45000.0,80.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),40001.0,45000.0,0.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),40001.0,45000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),45001.0,50000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),45001.0,50000.0,90.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),45001.0,50000.0,0.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),45001.0,50000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),50001.0,55000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),50001.0,55000.0,110.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),50001.0,55000.0,0.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),50001.0,55000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),55001.0,60000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),55001.0,60000.0,115.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),55001.0,60000.0,0.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),55001.0,60000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),60001.0,65000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),60001.0,65000.0,120.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),60001.0,65000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),60001.0,65000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),65001.0,70000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),65001.0,70000.0,125.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),65001.0,70000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),65001.0,70000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),70001.0,75000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),70001.0,75000.0,130.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),70001.0,75000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),70001.0,75000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),75001.0,80000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),75001.0,80000.0,135.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),75001.0,80000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),75001.0,80000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),80001.0,85000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),80001.0,85000.0,140.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),80001.0,85000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),80001.0,85000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),85001.0,90000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),85001.0,90000.0,155.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),85001.0,90000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),85001.0,90000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),90001.0,95000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),90001.0,95000.0,160.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),90001.0,95000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),90001.0,95000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),95001.0,100000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),95001.0,100000.0,165.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),95001.0,100000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),95001.0,100000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),100001.0,105000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),100001.0,105000.0,175.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),100001.0,105000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),100001.0,105000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),105001.0,110000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),105001.0,110000.0,185.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),105001.0,110000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),105001.0,110000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),110001.0,115000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),110001.0,115000.0,195.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),110001.0,115000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),110001.0,115000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),115001.0,120000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),115001.0,120000.0,205.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),115001.0,120000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),115001.0,120000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),120001.0,125000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),120001.0,125000.0,215.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),120001.0,125000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),120001.0,125000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),125000.0,130000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),125000.0,130000.0,225.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),125000.0,130000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),125000.0,130000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),130001.0,135000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),130001.0,135000.0,235.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),130001.0,135000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),130001.0,135000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),135001.0,140000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),135001.0,140000.0,245.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),135001.0,140000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),135001.0,140000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),140000.0,145000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),140000.0,145000.0,265.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),140000.0,145000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),140000.0,145000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),145000.0,150000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),145000.0,150000.0,285.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),145000.0,150000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),145000.0,150000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),150001.0,155000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),150001.0,155000.0,295.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),150001.0,155000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),150001.0,155000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),155001.0,160000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),155001.0,160000.0,305.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),155001.0,160000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),155001.0,160000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),160001.0,165000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),160001.0,165000.0,325.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),160001.0,165000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),160001.0,165000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),165001.0,170000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),165001.0,170000.0,335.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),165001.0,170000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),165001.0,170000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),170001.0,175000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),170001.0,175000.0,345.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),170001.0,175000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),170001.0,175000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),175001.0,180000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),175001.0,180000.0,355.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),175001.0,180000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),175001.0,180000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),180001.0,185000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),180001.0,185000.0,365.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),180001.0,185000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),180001.0,185000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),185001.0,190000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),185001.0,190000.0,375.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),185001.0,190000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),185001.0,190000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),190001.0,200000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),190001.0,200000.0,395.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),190001.0,200000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),190001.0,200000.0,'PERCENTUAL',0.04);
