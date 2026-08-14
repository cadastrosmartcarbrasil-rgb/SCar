-- ============================================================================
-- SCar :: 0018_passeio_padrao_adesao.sql
-- Padroniza a precificacao de Passeio conforme a planilha "Veiculos Passeio":
--   * BASICOS (mensalidade): Taxa Administrativa + Assistencia 24h + Protecao
--     Casco + Rastreador -> a soma e a mensalidade base do plano.
--   * PART. DE EVENTOS -> participacao_faixa (1500 ate 35k, 1800 ate 40k, 4% FIPE).
--   * TAXA DE ADESAO (cobranca unica por faixa FIPE) -> NOVO: adesao_faixa.
-- Rebuild completo das 46 faixas (0 a 250000) do tipo Passeio.
-- Append-only: nao reescreve migrations anteriores.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Taxa de adesao por faixa FIPE (cobranca unica, NAO entra na mensalidade)
-- ----------------------------------------------------------------------------
create table if not exists adesao_faixa (
  id              uuid primary key default gen_random_uuid(),
  tipo_veiculo_id uuid not null references tipos_veiculo(id) on delete cascade,
  fipe_minimo     numeric(12,2) not null,
  fipe_maximo     numeric(12,2) not null,
  valor           numeric(12,2) not null,
  unique (tipo_veiculo_id, fipe_minimo, fipe_maximo),
  check (fipe_maximo >= fipe_minimo)
);
create index if not exists idx_adesao_lookup on adesao_faixa (tipo_veiculo_id, fipe_minimo, fipe_maximo);

-- Cotacao guarda o snapshot da adesao vigente.
alter table cotacoes add column if not exists taxa_adesao numeric(12,2) not null default 0;

-- ----------------------------------------------------------------------------
-- Motor: taxa de adesao para um FIPE/tipo de veiculo.
-- ----------------------------------------------------------------------------
create or replace function calcular_adesao(p_fipe numeric, p_tipo_veiculo_id uuid)
returns numeric
language plpgsql stable
as $$
declare a adesao_faixa;
begin
  select * into a from adesao_faixa
   where tipo_veiculo_id = p_tipo_veiculo_id
     and p_fipe >= fipe_minimo and p_fipe <= fipe_maximo
   order by fipe_minimo desc limit 1;
  if not found then return 0; end if;
  return a.valor;
end;
$$;

-- ----------------------------------------------------------------------------
-- Motor principal: mensalidade composta + taxa de adesao (campo a parte).
-- A adesao NAO e somada na mensalidade (cobranca unica).
-- ----------------------------------------------------------------------------
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
    'valor_total_mensalidade', total,
    'taxa_adesao', calcular_adesao(p_fipe, p_tipo_veiculo_id)
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- Editor: substituicao atomica agora tambem cobre a adesao (4o argumento).
-- A versao de 3 argumentos (0013) segue intacta para compatibilidade.
-- ----------------------------------------------------------------------------
create or replace function substituir_tabela_precos(
  p_tipo_veiculo   uuid,
  p_faixas         jsonb,
  p_participacoes  jsonb,
  p_adesoes        jsonb
)
returns void
language plpgsql
as $$
begin
  delete from tabela_precos_faixa where tipo_veiculo_id = p_tipo_veiculo;
  delete from participacao_faixa   where tipo_veiculo_id = p_tipo_veiculo;
  delete from adesao_faixa         where tipo_veiculo_id = p_tipo_veiculo;

  insert into tabela_precos_faixa
    (tipo_veiculo_id, produto_id, fipe_minimo, fipe_maximo, valor_mensal, tipo_valor)
  select p_tipo_veiculo,
         (e->>'produto_id')::uuid,
         (e->>'fipe_minimo')::numeric,
         (e->>'fipe_maximo')::numeric,
         (e->>'valor_mensal')::numeric,
         coalesce(e->>'tipo_valor', 'VALOR')::tipo_valor_faixa
    from jsonb_array_elements(coalesce(p_faixas, '[]'::jsonb)) e;

  insert into participacao_faixa
    (tipo_veiculo_id, fipe_minimo, fipe_maximo, tipo_valor, valor)
  select p_tipo_veiculo,
         (e->>'fipe_minimo')::numeric,
         (e->>'fipe_maximo')::numeric,
         coalesce(e->>'tipo_valor', 'VALOR')::tipo_valor_faixa,
         (e->>'valor')::numeric
    from jsonb_array_elements(coalesce(p_participacoes, '[]'::jsonb)) e;

  insert into adesao_faixa
    (tipo_veiculo_id, fipe_minimo, fipe_maximo, valor)
  select p_tipo_veiculo,
         (e->>'fipe_minimo')::numeric,
         (e->>'fipe_maximo')::numeric,
         (e->>'valor')::numeric
    from jsonb_array_elements(coalesce(p_adesoes, '[]'::jsonb)) e;
end;
$$;

-- ----------------------------------------------------------------------------
-- RLS (catalogo: leitura staff, escrita global)
-- ----------------------------------------------------------------------------
alter table adesao_faixa enable row level security;
create policy adesao_select on adesao_faixa for select to authenticated using (is_staff());
create policy adesao_write  on adesao_faixa for all to authenticated using (tem_acesso_global()) with check (tem_acesso_global());
grant select, insert, update, delete on adesao_faixa to authenticated;
grant execute on function calcular_adesao(numeric, uuid) to authenticated;
grant execute on function substituir_tabela_precos(uuid, jsonb, jsonb, jsonb) to authenticated;

-- ============================================================================
-- REBUILD: matriz de precos, participacao e adesao do tipo Passeio
-- ============================================================================
delete from tabela_precos_faixa where tipo_veiculo_id = (select id from tipos_veiculo where nome='Passeio');
delete from participacao_faixa   where tipo_veiculo_id = (select id from tipos_veiculo where nome='Passeio');
delete from adesao_faixa         where tipo_veiculo_id = (select id from tipos_veiculo where nome='Passeio');

-- Faixas (Taxa Administrativa, Protecao Casco, Rastreador), participacao e adesao
-- extraidos da planilha Veiculos Passeio (46 faixas FIPE, 0 a 250000).
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),0,20000,35,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),0,20000,35,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),0,20000,0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),0,20000,'VALOR',1500);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),0,20000,250);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),20001,25000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),20001,25000,55,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),20001,25000,0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),20001,25000,'VALOR',1500);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),20001,25000,250);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),25001,30000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),25001,30000,60,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),25001,30000,0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),25001,30000,'VALOR',1500);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),25001,30000,250);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),30001,35000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),30001,35000,65,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),30001,35000,0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),30001,35000,'VALOR',1500);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),30001,35000,250);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),35001,40000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),35001,40000,75,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),35001,40000,0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),35001,40000,'VALOR',1800);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),35001,40000,250);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),40001,45000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),40001,45000,80,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),40001,45000,0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),40001,45000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),40001,45000,250);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),45001,50000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),45001,50000,90,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),45001,50000,0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),45001,50000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),45001,50000,250);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),50001,55000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),50001,55000,110,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),50001,55000,0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),50001,55000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),50001,55000,250);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),55001,60000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),55001,60000,115,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),55001,60000,0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),55001,60000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),55001,60000,250);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),60001,65000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),60001,65000,120,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),60001,65000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),60001,65000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),60001,65000,250);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),65001,70000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),65001,70000,125,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),65001,70000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),65001,70000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),65001,70000,250);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),70001,75000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),70001,75000,130,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),70001,75000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),70001,75000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),70001,75000,250);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),75001,80000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),75001,80000,135,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),75001,80000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),75001,80000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),75001,80000,250);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),80001,85000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),80001,85000,140,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),80001,85000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),80001,85000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),80001,85000,250);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),85001,90000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),85001,90000,155,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),85001,90000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),85001,90000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),85001,90000,250);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),90001,95000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),90001,95000,160,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),90001,95000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),90001,95000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),90001,95000,250);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),95001,100000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),95001,100000,165,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),95001,100000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),95001,100000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),95001,100000,250);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),100001,105000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),100001,105000,175,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),100001,105000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),100001,105000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),100001,105000,350);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),105001,110000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),105001,110000,185,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),105001,110000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),105001,110000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),105001,110000,350);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),110001,115000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),110001,115000,195,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),110001,115000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),110001,115000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),110001,115000,350);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),115001,120000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),115001,120000,205,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),115001,120000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),115001,120000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),115001,120000,350);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),120001,125000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),120001,125000,215,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),120001,125000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),120001,125000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),120001,125000,350);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),125001,130000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),125001,130000,225,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),125001,130000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),125001,130000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),125001,130000,350);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),130001,135000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),130001,135000,235,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),130001,135000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),130001,135000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),130001,135000,350);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),135001,140000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),135001,140000,245,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),135001,140000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),135001,140000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),135001,140000,350);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),140001,145000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),140001,145000,265,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),140001,145000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),140001,145000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),140001,145000,350);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),145001,150000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),145001,150000,285,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),145001,150000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),145001,150000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),145001,150000,350);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),150001,155000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),150001,155000,295,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),150001,155000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),150001,155000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),150001,155000,350);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),155001,160000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),155001,160000,305,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),155001,160000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),155001,160000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),155001,160000,350);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),160001,165000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),160001,165000,325,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),160001,165000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),160001,165000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),160001,165000,350);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),165001,170000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),165001,170000,335,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),165001,170000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),165001,170000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),165001,170000,350);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),170001,175000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),170001,175000,345,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),170001,175000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),170001,175000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),170001,175000,350);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),175001,180000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),175001,180000,355,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),175001,180000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),175001,180000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),175001,180000,350);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),180001,185000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),180001,185000,365,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),180001,185000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),180001,185000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),180001,185000,350);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),185001,190000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),185001,190000,375,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),185001,190000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),185001,190000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),185001,190000,350);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),190001,200000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),190001,200000,385,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),190001,200000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),190001,200000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),190001,200000,350);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),200001,205000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),200001,205000,405,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),200001,205000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),200001,205000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),200001,205000,500);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),205001,210000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),205001,210000,415,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),205001,210000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),205001,210000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),205001,210000,500);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),210001,215000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),210001,215000,425,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),210001,215000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),210001,215000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),210001,215000,500);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),215001,220000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),215001,220000,435,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),215001,220000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),215001,220000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),215001,220000,500);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),220001,225000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),220001,225000,445,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),220001,225000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),220001,225000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),220001,225000,500);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),225001,230000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),225001,230000,455,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),225001,230000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),225001,230000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),225001,230000,500);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),230001,235000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),230001,235000,465,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),230001,235000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),230001,235000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),230001,235000,500);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),235001,240000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),235001,240000,475,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),235001,240000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),235001,240000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),235001,240000,500);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),240001,245000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),240001,245000,490,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),240001,245000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),240001,245000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),240001,245000,500);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),245001,250000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),245001,250000,510,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),245001,250000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),245001,250000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),245001,250000,500);
