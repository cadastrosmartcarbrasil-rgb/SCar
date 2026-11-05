-- =====================================================================
-- 0186 — DE-PARA DOS PRODUTOS DO MUTUAL PELO NOME DO BENEFICIO
-- ---------------------------------------------------------------------
-- Conferido em producao (05/11/2026): a chave da 0184 (product_id) nao
-- serve para os beneficios.
--   * Nos planos NOVOS do Mutual um product_id so e generico: "Protecao a
--     terceiros" (41) guarda moto 15 mil, carro 30/50/100/200 mil; "Carros
--     Reserva" (52) guarda 7/10/15 dias; "Vidros" (40) guarda I/II/III;
--     "Fenomeno" (54) guarda auto e moto. O nivel esta no SUBPRODUTO
--     (subproduct_config_id), cuja descricao vem nos planos capturados (PLAN).
--   * Nos planos ANTIGOS ("...MIG") cada plano tem o proprio product_id para o
--     MESMO item ("CHAVEIROMIG" com dez ids): 1.093 chaves para ~60 decisoes.
-- A chave passa a ser o NOME normalizado: a descricao do subproduto quando o
-- catalogo a conhece, senao o nome do produto. Produto generico cujo
-- subproduto nao esta no catalogo (plano ainda nao puxado) fica separado por
-- tipo (MOTO/AUTO) e marcado "nivel nao informado" — puxar Planos de novo
-- resolve sozinho, porque a leitura e feita na hora.
-- So recria mutual_itens_produto_veiculos (mesma assinatura); a tabela de
-- de-para estava vazia em producao, entao nenhuma decisao se perde.
-- =====================================================================

create or replace function mutual_nome_normalizado(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(btrim(regexp_replace(
           regexp_replace(upper(texto_sem_acento(btrim(coalesce(p, '')))), 'MIG$', ''),
           '[^A-Z0-9]+', ' ', 'g')), '')
$$;

-- Os subprodutos que os planos capturados descrevem (id -> descricao).
create or replace function mutual_subprodutos_catalogo()
returns table (subproduto_id text, produto_id text, descricao text, valor numeric)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (s->>'id')
         s->>'id',
         pr->>'product_id',
         nullif(btrim(s->>'subproduct_description'), ''),
         case when (s->>'value') ~ '^-?[0-9]+(\.[0-9]+)?$' then (s->>'value')::numeric end
    from mutual_captura m
    cross join lateral jsonb_array_elements(
           case when jsonb_typeof(m.payload->'products') = 'array' then m.payload->'products' else '[]'::jsonb end) pr
    cross join lateral jsonb_array_elements(
           case when jsonb_typeof(pr->'subproducts') = 'array' then pr->'subproducts' else '[]'::jsonb end) s
   where m.entidade = 'PLAN'
     and not m.deletado
     and nullif(btrim(s->>'id'), '') is not null
   order by s->>'id', m.capturado_em desc
$$;

-- Produtos do Mutual cujo NOME nao diz o nivel (o nivel esta no subproduto).
create or replace function mutual_produto_generico(p_nome text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select mutual_nome_normalizado(p_nome) in ('VIDROS', 'PROTECAO A TERCEIROS', 'CARROS RESERVA', 'FENOMENO')
$$;

create or replace function mutual_itens_produto_veiculos(p_regional_id uuid default null)
returns table (veiculo_id uuid, chave text, nome text)
language sql
stable
security definer
set search_path = public
as $$
  with cat as (select * from mutual_subprodutos_catalogo()),
  it as (
    select v.id vid,
           exists (select 1 from tipos_veiculo t where t.id = v.tipo_veiculo_id and upper(t.nome) like 'MOTO%') moto,
           nullif(btrim(p->>'product_name'), '') pnome,
           nullif(btrim(p->>'subproduct_config_id'), '') sid
      from integracao_vinculos iv
      join veiculos v on v.id = iv.registro_id
      join mutual_captura m
        on m.entidade = 'CONTRACT_OBJECT_PRODUCT'
       and not m.deletado
       and m.payload->>'contract_object_id' = iv.id_externo
      cross join lateral jsonb_array_elements(
             case when jsonb_typeof(m.payload->'products') = 'array'
                  then m.payload->'products' else '[]'::jsonb end) p
     where iv.sistema = 'MUTUAL'
       and iv.entidade = 'CONTRACT_OBJECT'
       and iv.tabela = 'veiculos'
       and (p_regional_id is null or v.regional_id = p_regional_id)
       and (tem_acesso_global() or auth.uid() is null)
  ),
  r as (
    select it.vid, it.moto, it.pnome,
           -- descricao do subproduto so vale quando diz alguma coisa (a Taxa vem ".")
           case when length(coalesce(mutual_nome_normalizado(c.descricao), '')) >= 4 then c.descricao end descr
      from it left join cat c on c.subproduto_id = it.sid
     where it.pnome is not null or it.sid is not null
  )
  select distinct
         r.vid,
         case
           when r.descr is not null then 'nome:' || mutual_nome_normalizado(r.descr)
           when mutual_produto_generico(r.pnome)
             then 'sem_nivel:' || mutual_nome_normalizado(r.pnome) || ':' || case when r.moto then 'MOTO' else 'AUTO' end
           else 'nome:' || mutual_nome_normalizado(r.pnome)
         end,
         case
           when r.descr is not null then btrim(r.descr)
           when mutual_produto_generico(r.pnome)
             then r.pnome || ' — nível não informado (' || case when r.moto then 'moto' else 'carro' end || ')'
           else r.pnome
         end
    from r
   where coalesce(mutual_nome_normalizado(coalesce(r.descr, r.pnome)), '') <> ''
$$;

comment on function mutual_itens_produto_veiculos(uuid) is
  '0186: itens de produto dos veiculos migrados, com a chave pelo NOME do beneficio (descricao do subproduto do plano, senao o nome do produto). Produto generico sem subproduto no catalogo: sem_nivel:<produto>:<MOTO|AUTO>.';

-- Rito da 0052.
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
