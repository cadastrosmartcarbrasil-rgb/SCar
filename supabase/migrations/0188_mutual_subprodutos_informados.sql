-- =====================================================================
-- 0188 — NIVEL DOS BENEFICIOS DOS PLANOS QUE O MUTUAL NAO DEVOLVE MAIS
-- ---------------------------------------------------------------------
-- A 0186 tira o nivel (terceiros 30/50/100 mil, carro reserva 7/10/15 dias,
-- vidros I/II/III) da descricao do SUBPRODUTO, lida dos planos capturados.
-- Os planos que o Mutual nao vende mais (Plano V6 - Automovel SP/SP (87),
-- Plano V6 - Automovel RN (85), Plano V5 - Automovel (22)...) nao voltam no
-- /quotation/plan/ (conferido em 06/11/2026: 81 recebidos = os mesmos 18), e
-- os itens dos veiculos so trazem o numero da configuracao.
-- Entao o nivel passa a poder ser INFORMADO: a equipe abre um veiculo de cada
-- configuracao no Mutual e diz o que ele tem. A descricao gravada e a mesma
-- grafia de um beneficio que ja tem destino no de-para (0186), entao cai no
-- opcional certo sem decisao nova.
-- So cria a tabela e recria mutual_subprodutos_catalogo (mesma assinatura):
-- o informado vence o capturado.
-- =====================================================================

create table if not exists mutual_subprodutos_informados (
  subproduto_id text primary key,
  descricao     text not null,
  plano_mutual  text,
  conferido_em  text,
  informado_por uuid references usuarios(id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint chk_mutual_subproduto_informado check (length(btrim(descricao)) >= 4)
);

comment on table mutual_subprodutos_informados is
  '0188: nivel do subproduto do Mutual informado pela equipe (plano que a API nao devolve mais). Vence o catalogo capturado.';

alter table mutual_subprodutos_informados enable row level security;
drop policy if exists mutual_subprodutos_informados_select on mutual_subprodutos_informados;
create policy mutual_subprodutos_informados_select on mutual_subprodutos_informados
  for select to authenticated using ((select is_staff()));
revoke all on mutual_subprodutos_informados from anon;
grant select on mutual_subprodutos_informados to authenticated;

create or replace function mutual_subprodutos_catalogo()
returns table (subproduto_id text, produto_id text, descricao text, valor numeric)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (x.sid) x.sid, x.pid, x.descr, x.valor
    from (
      select i.subproduto_id sid, null::text pid, btrim(i.descricao) descr, null::numeric valor,
             0 prioridade, now() capturado_em
        from mutual_subprodutos_informados i
      union all
      select s->>'id', pr->>'product_id', nullif(btrim(s->>'subproduct_description'), ''),
             case when (s->>'value') ~ '^-?[0-9]+(\.[0-9]+)?$' then (s->>'value')::numeric end,
             1, m.capturado_em
        from mutual_captura m
        cross join lateral jsonb_array_elements(
               case when jsonb_typeof(m.payload->'products') = 'array' then m.payload->'products' else '[]'::jsonb end) pr
        cross join lateral jsonb_array_elements(
               case when jsonb_typeof(pr->'subproducts') = 'array' then pr->'subproducts' else '[]'::jsonb end) s
       where m.entidade = 'PLAN'
         and not m.deletado
         and nullif(btrim(s->>'id'), '') is not null
    ) x
   order by x.sid, x.prioridade, x.capturado_em desc
$$;

comment on function mutual_subprodutos_catalogo() is
  '0188: subprodutos do Mutual (id -> descricao): o informado pela equipe (mutual_subprodutos_informados) vence o capturado dos planos.';

-- Conferido pela equipe no Mutual em 06/11/2026, placa a placa.
insert into mutual_subprodutos_informados (subproduto_id, descricao, plano_mutual, conferido_em)
select v.sid, v.descr, v.plano, v.placas
  from (values
    -- Plano V6 - Automovel SP/SP (87)
    ('3089', 'B- PROTEÇÃO TERCEIROS BRASIL ATÉ R$ 30.000,00', 'Plano V6 - Automóvel SP/SP (87)', 'BDO3I27, CNB0039, EDV6I55, EWQ9G82'),
    ('3090', 'B-COBERTURA PARA TERCEIROS ATÉ R$ 50.000,00', 'Plano V6 - Automóvel SP/SP (87)', 'EDC6D39'),
    ('4673', 'B-COBERTURA PARA TERCEIROS ATÉ R$ 100.000,00', 'Plano V6 - Automóvel SP/SP (87)', 'BBE2068'),
    ('3094', 'CARRO RESERVA - 7 DIAS', 'Plano V6 - Automóvel SP/SP (87)', 'BBE2068, BDO3I27, CNB0039, EDC6D39, EDV6I55'),
    ('3095', 'CARRO RESERVA I - 10 DIAS', 'Plano V6 - Automóvel SP/SP (87)', 'EWQ9G82'),
    ('3091', 'VIDROS III - PARAB + V LAT + RET+LANT/FARÓIS (AUTO)', 'Plano V6 - Automóvel SP/SP (87)', 'BDO3I27, EWQ9G82'),
    ('3092', 'VIDROS II - PARAB + VIDROS LATERAIS (AUTO)', 'Plano V6 - Automóvel SP/SP (87)', 'CNB0039, EDC6D39'),
    ('3093', 'VIDROS I - PARABRISAS (AUTO)', 'Plano V6 - Automóvel SP/SP (87)', 'EDV6I55'),
    -- Plano V6 - Automovel RN (85)
    ('3025', 'B- PROTEÇÃO TERCEIROS BRASIL ATÉ R$ 30.000,00', 'Plano V6 - Automóvel RN (85)', 'CJB2G83, MZG3J79, PCR9J24'),
    ('3030', 'CARRO RESERVA - 7 DIAS', 'Plano V6 - Automóvel RN (85)', 'CJB2G83, MZG3J79, OJT5F00, PCR9J24'),
    ('3027', 'VIDROS III - PARAB + V LAT + RET+LANT/FARÓIS (AUTO)', 'Plano V6 - Automóvel RN (85)', 'MZG3J79'),
    ('3028', 'VIDROS II - PARAB + VIDROS LATERAIS (AUTO)', 'Plano V6 - Automóvel RN (85)', 'OJT5F00'),
    ('3029', 'VIDROS I - PARABRISAS (AUTO)', 'Plano V6 - Automóvel RN (85)', 'PCR9J24'),
    -- Plano V5 - Automovel (22)
    ('289', 'B- PROTEÇÃO TERCEIROS BRASIL ATÉ R$ 30.000,00', 'Plano V5 - Automóvel (22)', 'DHK9G14, EDI4989, EIF4F91, QBZ0676'),
    ('299', 'CARRO RESERVA - 7 DIAS', 'Plano V5 - Automóvel (22)', 'EDI4989, EIF4F91'),
    ('300', 'CARRO RESERVA I - 10 DIAS', 'Plano V5 - Automóvel (22)', 'QBZ0676'),
    ('301', 'CARRO RESERVA II - 15 DIAS', 'Plano V5 - Automóvel (22)', 'DHK9G14'),
    ('291', 'VIDROS III - PARAB + V LAT + RET+LANT/FARÓIS (AUTO)', 'Plano V5 - Automóvel (22)', 'QBZ0676'),
    ('292', 'VIDROS II - PARAB + VIDROS LATERAIS (AUTO)', 'Plano V5 - Automóvel (22)', 'NRF5I30'),
    ('293', 'VIDROS I - PARABRISAS (AUTO)', 'Plano V5 - Automóvel (22)', 'EDI4989')
  ) as v(sid, descr, plano, placas)
 where not exists (select 1 from mutual_subprodutos_informados i where i.subproduto_id = v.sid);

-- Rito da 0052.
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
