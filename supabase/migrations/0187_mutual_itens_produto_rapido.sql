-- =====================================================================
-- 0187 — OS ITENS DE PRODUTO DOS MIGRADOS SEM RECALCULAR POR LINHA
-- ---------------------------------------------------------------------
-- Medido em producao (05/11/2026): mutual_itens_produto_veiculos da 0186
-- levava 28 s (a simulacao dos opcionais 45 s, acima do teto da tela e da
-- rotina). O custo era normalizar o nome (texto_sem_acento + regex) em cada um
-- dos ~83 mil itens e o catalogo dos subprodutos inline-ado. Agora o catalogo e
-- os nomes sao MATERIALIZADOS e normalizados UMA vez por valor distinto
-- (~185 subprodutos, ~311 nomes): ~3 s. Mesma assinatura, mesmo resultado.
-- Licao da 0142/0143: CTE referenciado uma vez e inline-ado; "as materialized".
-- =====================================================================

create or replace function mutual_itens_produto_veiculos(p_regional_id uuid default null)
returns table (veiculo_id uuid, chave text, nome text)
language sql
stable
security definer
set search_path = public
as $$
  with cat as materialized (
    select c.subproduto_id,
           btrim(c.descricao) descr,
           mutual_nome_normalizado(c.descricao) n
      from mutual_subprodutos_catalogo() c
     where length(coalesce(mutual_nome_normalizado(c.descricao), '')) >= 4
  ),
  it as materialized (
    select v.id vid,
           exists (select 1 from tipos_veiculo t where t.id = v.tipo_veiculo_id and upper(t.nome) like 'MOTO%') moto,
           coalesce(nullif(btrim(p->>'product_name'), ''), '') pnome,
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
  nomes as materialized (
    select x.pnome, mutual_nome_normalizado(x.pnome) n, mutual_produto_generico(x.pnome) g
      from (select distinct pnome from it) x
  )
  select distinct
         it.vid,
         case
           when c.descr is not null then 'nome:' || c.n
           when nm.g then 'sem_nivel:' || nm.n || ':' || case when it.moto then 'MOTO' else 'AUTO' end
           else 'nome:' || nm.n
         end,
         case
           when c.descr is not null then c.descr
           when nm.g then it.pnome || ' — nível não informado (' || case when it.moto then 'moto' else 'carro' end || ')'
           else it.pnome
         end
    from it
    left join cat c on c.subproduto_id = it.sid
    join nomes nm on nm.pnome = it.pnome
   where coalesce(c.n, nm.n, '') <> ''
$$;

comment on function mutual_itens_produto_veiculos(uuid) is
  '0187 (regra da 0186): itens de produto dos migrados com a chave pelo NOME do beneficio (descricao do subproduto do plano, senao o nome do produto); generico sem subproduto: sem_nivel:<produto>:<MOTO|AUTO>. Catalogo e nomes materializados e normalizados uma vez por valor.';

-- Rito da 0052.
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
