-- =====================================================================
-- 0093_mutual_nome_plano_legado
-- O DE-PARA DO PLANO PASSA A MOSTRAR O NOME DOS PLANOS LEGADOS.
--
-- Pedido do usuario (07/10/2026): "para eu localizar os planos no Mutual, nao
-- e por numero ou codigo, e pelo nome". A tela do de-para
-- (`mutual_planos_externos`, 0085) so conhecia o nome pela entidade `PLAN`, que
-- o Mutual devolve apenas para os planos VENDAVEIS HOJE (18). Os legados
-- ("V5 AUTOMOVEL COMUMMIG", "Plano Moto MT"...) apareciam como "(id 48)" — e
-- sao exatamente os que pesam na carteira migrada.
--
-- A fonte que faltava ja estava capturada: cada linha de
-- CONTRACT_OBJECT_PRODUCT (0091/0092) traz `plan_name`. A funcao e recriada com
-- a MESMA assinatura e o mesmo corpo da 0085, trocando so a CTE do nome:
-- PLAN manda, o `plan_name` do produto e reserva.
--
-- `capturado` passa a significar "o nome e conhecido" (por qualquer das duas
-- fontes) — e o que a tela usa para marcar "sem nome".
--
-- Limite conhecido: o `plan_name` so existe para os veiculos cujos produtos
-- foram puxados (hoje, os 467 da matriz). Ao carregar outra unidade e puxar os
-- produtos dela, os nomes dela aparecem sozinhos.
--
-- So leitura: nao carrega, nao muda preco, nao toca em `veiculos` nem em
-- vinculo algum.
-- =====================================================================

create or replace function mutual_planos_externos(p_regional_id uuid default null)
returns table (
  id_externo            text,
  nome                  text,
  capturado             boolean,
  veiculos              bigint,
  faturaveis            bigint,
  cobertura_acumulada   numeric,
  mensalidade_mediana   numeric,
  fipe_min              numeric,
  fipe_max              numeric,
  tipos                 text,
  destino_id            uuid,
  plano_nome            text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_staff() then
    raise exception 'Somente a equipe pode ler o de-para de planos';
  end if;

  return query
  with
  -- O NOME vem de DUAS fontes (0093). `PLAN` so traz os planos VENDAVEIS HOJE
  -- (18), e os legados ("...MIG") ficavam sem nome na tela — justamente os que
  -- pesam na carteira migrada. O `plan_name` dos PRODUTOS DOS VEICULOS
  -- (CONTRACT_OBJECT_PRODUCT, 0091/0092) traz o nome de TODO plano que tem
  -- veiculo carregado. Precedencia: PLAN manda; o do produto e reserva, e entre
  -- grafias diferentes do mesmo id vence a mais frequente.
  plan_cap as (
    select c.id_externo,
           mutual_texto_em(c.payload, array['name','nome','description','descricao']) as nome
      from mutual_captura c
     where c.entidade = 'PLAN' and not c.deletado
  ),
  prod_nome as (
    select distinct on (x.id_externo) x.id_externo, x.nome
      from (select mutual_texto(c.payload->>'plan_id')   as id_externo,
                   mutual_texto(c.payload->>'plan_name') as nome,
                   count(*)                              as n
              from mutual_captura c
             where c.entidade = 'CONTRACT_OBJECT_PRODUCT' and not c.deletado
             group by 1, 2) x
     where x.id_externo is not null and x.nome is not null
     order by x.id_externo, x.n desc, x.nome
  ),
  cap as (
    select coalesce(pc.id_externo, pn.id_externo)                  as id_externo,
           coalesce(nullif(pc.nome, ''), pn.nome)                  as nome
      from plan_cap pc
      full join prod_nome pn on pn.id_externo = pc.id_externo
  ),
  ct as (
    select c.id_externo, c.payload from mutual_captura c
     where c.entidade = 'CONTRACT' and not c.deletado
  ),
  obj as (
    select mutual_texto(o.payload->>'plan_id')                          as id_externo,
           mutual_status_veiculo(o.payload->>'contract_status',
                                 o.payload->>'status')                  as st,
           mutual_regional_do_objeto(o.payload, ct.payload)             as reg,
           nullif(nullif(o.payload->>'final_total_value','')::numeric,0) as valor,
           nullif(o.payload#>>'{vehicle_data,vehicle_price}','')::numeric as fipe,
           mutual_texto(o.payload#>>'{vehicle_data,vehicle_type}')      as tipo
      from mutual_captura o
      left join ct on ct.id_externo = o.payload->>'contract_id'
     where o.entidade = 'CONTRACT_OBJECT' and not o.deletado
  ),
  -- 🔴 TODA coluna aqui vai QUALIFICADA: `id_externo`, `nome`, `veiculos` e
  -- `faturaveis` sao tambem colunas de OUT desta funcao, e plpgsql nao
  -- desambigua — `where id_externo is not null` cru derruba a funcao inteira
  -- com "column reference is ambiguous" (pego pela suite).
  escopo as (
    select * from obj o2
     where o2.id_externo is not null
       and (p_regional_id is null or o2.reg = p_regional_id)
  ),
  peso as (
    select e.id_externo,
           count(*) filter (where e.st is not null)                      as veiculos,
           count(*) filter (where e.st::text in ('ativo','em_evento',
                              'vistoria_pendente','inadimplente'))        as faturaveis,
           (percentile_cont(0.5) within group (order by e.valor))::numeric(12,2) as mediana,
           min(e.fipe)::numeric(14,2)                                     as fipe_min,
           max(e.fipe)::numeric(14,2)                                     as fipe_max,
           string_agg(distinct e.tipo, '/' order by e.tipo)               as tipos
      from escopo e group by e.id_externo
  ),
  -- A cobertura acumulada e o que diz ONDE PARAR: tratar os ids do topo
  -- ate a linha que cruza 90% resolve a carteira com o menor numero de
  -- decisoes. Sem ela a tela viraria uma lista de 42 numeros iguais.
  acum as (
    select p.*,
           case when sum(p.faturaveis) over () > 0
                then (sum(p.faturaveis) over (order by p.faturaveis desc, p.id_externo)
                      * 100.0 / sum(p.faturaveis) over ())::numeric(5,1) end as cobertura
      from peso p
  )
  select coalesce(cap.id_externo, a.id_externo),
         cap.nome,
         cap.nome is not null,
         coalesce(a.veiculos, 0),
         coalesce(a.faturaveis, 0),
         a.cobertura,
         a.mediana,
         a.fipe_min,
         a.fipe_max,
         a.tipos,
         mutual_plano_do_externo(coalesce(cap.id_externo, a.id_externo)),
         pp.nome
    from cap
    full join acum a on a.id_externo = cap.id_externo
    left join planos_protecao pp
           on pp.id = mutual_plano_do_externo(coalesce(cap.id_externo, a.id_externo))
   order by coalesce(a.faturaveis, 0) desc, coalesce(a.veiculos, 0) desc,
            coalesce(cap.id_externo, a.id_externo);
end;
$$;

comment on function mutual_planos_externos(uuid) is
  'O de-para do PLANO: um `plan_id` do Mutual -> um `planos_protecao` do SCar, com o PESO da '
  'carteira e a COBERTURA ACUMULADA. E a cobertura que diz onde parar: medido em 01/10/2026, '
  '18 dos 42 ids cobrem 90% dos 481 faturaveis da SMART CAR MATRIZ, e 29 dos 91 cobrem 90% dos '
  '3.041 da base viva inteira. `p_regional_id` nulo = a base toda; com unidade, o peso e o '
  'daquela unidade, porque a carga roda POR UNIDADE. '
  'O NOME sai de `PLAN` e, na falta, do `plan_name` dos produtos dos veiculos (0093) — o usuario '
  'localiza o plano no Mutual pelo nome, nunca pelo id. '
  'O perfil (`mensalidade_mediana`, `fipe_min`, `fipe_max`) serve para RECONHECER e para '
  'DESCONFIAR, nunca para identificar. So leitura: nao carrega, nao muda preco e nao toca em '
  '`veiculos`.';

-- ===================================================== rito da 0052
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
