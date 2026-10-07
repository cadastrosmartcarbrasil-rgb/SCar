-- ============================================================================
-- 0091 — O PLANO DA MOTO SAI DOS PRODUTOS DO VEICULO (terceiros ou nao)
-- ============================================================================
-- Regra do usuario (07/10/2026): "a alteracao principal entre ser essencial e
-- ouro e o fato de ter cobertura para TERCEIROS, se nao tem e essencial se tem
-- e OURO". No SCar: MOTOCICLETAS - OURO (terceiros ate R$ 20 mil + APP) x
-- MOTOCICLETA ESSENCIAL (so a base).
--
-- 🔴 POR QUE ISTO NAO PODE SER FEITO PELO `plan_id`, e foi medido antes:
-- nos 4 planos de moto capturados de `/quotation/plan/` (41 MT, 42 SP/SP,
-- 43 Ribeirao Preto, 44 RN), "Protecao a terceiros" (product_id 41) vem com
-- `required: false` — e OPCIONAL DENTRO DO MESMO PLANO. Dois associados no
-- plano 41 podem ter um com terceiros e outro sem. Os planos 57, 63, 64 e 50
-- (25 motos da matriz) nem foram devolvidos pelo endpoint. Classificar por
-- plano seria o palpite que a 0082 manda nao fazer.
--
-- A FONTE CERTA e `/contract/contract_object_product/` — o que cada OBJETO
-- (veiculo) contratou. Ela esta no swagger desde 09/09 (docs/modulos/
-- integracao-mutual.md: "contract_object_product ≈ veiculo_produtos") e nunca
-- foi capturada. Medido: CONTRACT_OBJECT, CONTRACT e INVOICE NAO trazem lista
-- de produtos por veiculo.
--
-- O QUE ENTRA:
-- (A) `CONTRACT_OBJECT_PRODUCT` na allow-list `chk_mutual_entidade` — a lista
--     INTEIRA redigitada, com as 16 (a suite afirma uma por uma: a 0085 quase
--     perdeu `CONTRACT` assim).
-- (B) Leitura com chaves CANDIDATAS (`mutual_texto_em`), porque o payload deste
--     endpoint ainda nao foi visto: o elo com o objeto, o id do produto e o
--     nome. Sem nome no payload, o nome sai do CATALOGO dos planos ja
--     capturados (`products[].product_id -> product_name`, global no Mutual:
--     a Taxa Administrativa e o 56 em todos os planos). As funcoes devolvem
--     QUAL chave pegou — se nenhuma pegar, a tela diz isso em vez de concluir
--     "nao tem terceiros".
-- (C) `mutual_terceiros_por_objeto(regional, tipo)` — so leitura: um veiculo
--     carregado por linha, com os produtos que o Mutual diz que ele tem e o
--     veredito `tem_terceiros` (NULL = nenhum produto capturado para ele, que e
--     "nao sei", nunca "nao tem").
-- (D) `mutual_aplicar_plano_por_terceiros(...)` — grava `plano_protecao_id`.
--     Sem `p_confirmar` so simula. So troca quem esta SEM plano ou num plano
--     listado em `p_substituir` (hoje as motos da matriz cairam em PRATA pelo
--     de-para do 41, que e plano de carro; a moto do RASTREAMENTO fica). Veiculo
--     sem produto capturado NAO e tocado. A re-execucao da carga preserva o que
--     foi gravado: `mutual_executar_carga` faz coalesce(v.plano_protecao_id, ...).
--
-- NAO muda preco nem boleto: os migrados tem override (`valor_mensalidade`) e
-- `cobranca_externa`. Muda o que a ficha do SAC mostra — que e o motivo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (A) A allow-list — INTEIRA
-- ----------------------------------------------------------------------------
alter table mutual_captura drop constraint if exists chk_mutual_entidade;
alter table mutual_captura add constraint chk_mutual_entidade check (entidade in (
  'CONTRACT_OBJECT','CONTRACT','PERSON','ADDRESS','INVOICE','EVENT',
  'REGIONAL','SALE_TEAM','CONSULTANT','PLAN',
  'VEHICLE_TYPE','VEHICLE_COLOR','VEHICLE_CATEGORY','VEHICLE_USE_TYPE','EVENT_TYPE',
  'CONTRACT_OBJECT_PRODUCT'
));

-- ----------------------------------------------------------------------------
-- (B) Leitura de uma linha de produto
-- ----------------------------------------------------------------------------
-- As chaves candidatas moram em UM lugar (licao da 0082: quatro leitores,
-- quatro precedencias).
create or replace function mutual_chaves_produto_objeto()
returns text[] language sql immutable as $$
  select array['contract_object_id','contract_object','object_id','contract_object_vehicle_id','object']
$$;

create or replace function mutual_chaves_produto_id()
returns text[] language sql immutable as $$
  select array['product_id','product','product_code']
$$;

create or replace function mutual_chaves_produto_nome()
returns text[] language sql immutable as $$
  select array['product_name','name','product_description','description']
$$;

-- O catalogo de produtos que os planos capturados ja trazem.
create or replace function mutual_nome_produto(p_product_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p->>'product_name'
    from mutual_captura c
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(c.payload->'products') = 'array' then c.payload->'products' else '[]'::jsonb end) p
   where c.entidade = 'PLAN' and not c.deletado
     and p->>'product_id' = mutual_texto(p_product_id)
     and mutual_texto(p->>'product_name') is not null
   limit 1;
$$;

comment on function mutual_nome_produto(text) is
  'Nome de um produto do Mutual pelo id, lido do catalogo que os planos capturados ja trazem (products[]). O id e global la: a Taxa Administrativa e o 56 em todos os planos (0091).';

-- A regra do usuario, em um lugar: produto de TERCEIROS. Espelho de
-- `ehProdutoTerceiros` (src/lib/mutual.ts) — mexeu num lado, mexa no outro.
create or replace function mutual_produto_terceiros(p_nome text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(upper(texto_sem_acento(p_nome)) like '%TERCEIRO%', false);
$$;

-- Uma linha de `/contract/contract_object_product/` lida pelas candidatas.
-- `chave_*` diz de onde saiu; `nome` cai no catalogo dos planos quando a linha
-- so traz o id.
create or replace function mutual_produto_da_linha(p_payload jsonb)
returns table(objeto text, produto_id text, nome text, chave_objeto text, chave_nome text)
language sql
stable
security definer
set search_path = public
as $$
  with b as (
    select coalesce(mutual_texto_em(p_payload, mutual_chaves_produto_objeto()),
                    mutual_texto(p_payload #>> '{contract_object,id}'))            as objeto,
           coalesce(mutual_chave_em(p_payload, mutual_chaves_produto_objeto()),
                    case when mutual_texto(p_payload #>> '{contract_object,id}') is not null
                         then 'contract_object.id' end)                             as chave_objeto,
           coalesce(mutual_texto_em(p_payload, mutual_chaves_produto_id()),
                    mutual_texto(p_payload #>> '{product,id}'))                     as produto_id,
           coalesce(mutual_texto_em(p_payload, mutual_chaves_produto_nome()),
                    mutual_texto(p_payload #>> '{product,product_name}'),
                    mutual_texto(p_payload #>> '{product,name}'))                   as nome_linha,
           coalesce(mutual_chave_em(p_payload, mutual_chaves_produto_nome()),
                    case when mutual_texto(p_payload #>> '{product,product_name}') is not null
                           or mutual_texto(p_payload #>> '{product,name}') is not null
                         then 'product.name' end)                                   as chave_nome
  )
  select b.objeto, b.produto_id,
         coalesce(b.nome_linha, mutual_nome_produto(b.produto_id)),
         b.chave_objeto,
         coalesce(b.chave_nome, case when mutual_nome_produto(b.produto_id) is not null
                                     then 'catalogo dos planos' end)
    from b;
$$;

-- ----------------------------------------------------------------------------
-- (C) O veredito por veiculo — so leitura
-- ----------------------------------------------------------------------------
create or replace function mutual_terceiros_por_objeto(
  p_regional_id     uuid,
  p_tipo_veiculo_id uuid default null
)
returns table(
  veiculo_id     uuid,
  placa          text,
  objeto_id      text,
  plan_id        text,
  plano_atual_id uuid,
  plano_atual    text,
  produtos       int,
  tem_terceiros  boolean,
  nomes          text,
  chave_objeto   text,
  chave_nome     text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_reg uuid;
begin
  if auth.uid() is not null and not is_staff() then
    return;   -- o associado do /portal e `authenticated` tambem (0052)
  end if;
  v_reg := case when auth.uid() is null then p_regional_id else escopo_regional(p_regional_id) end;

  return query
  with veic as (
    select v.id, v.placa::text as placa, v.plano_protecao_id, iv.id_externo
      from veiculos v
      join integracao_vinculos iv
        on iv.sistema = 'MUTUAL' and iv.entidade = 'CONTRACT_OBJECT'
       and iv.tabela = 'veiculos' and iv.registro_id = v.id
     where (v_reg is null or v.regional_id = v_reg)
       and (p_tipo_veiculo_id is null or v.tipo_veiculo_id = p_tipo_veiculo_id)
  ),
  linhas as (
    select l.*
      from mutual_captura c
      cross join lateral mutual_produto_da_linha(c.payload) l
     where c.entidade = 'CONTRACT_OBJECT_PRODUCT'
       and not c.deletado
       and coalesce(lower(c.payload->>'selected'), 'true') <> 'false'
  ),
  por_obj as (
    select l.objeto,
           count(*)::int                                   as n,
           bool_or(mutual_produto_terceiros(l.nome))       as terceiros,
           bool_or(l.nome is not null)                     as algum_nome,
           string_agg(distinct coalesce(l.nome, '#' || l.produto_id), ' · ') as nomes,
           min(l.chave_objeto)                             as chave_objeto,
           min(l.chave_nome)                               as chave_nome
      from linhas l
     where l.objeto is not null
     group by l.objeto
  )
  select ve.id, ve.placa, ve.id_externo,
         mutual_texto(o.payload->>'plan_id'),
         ve.plano_protecao_id, pp.nome::text,
         coalesce(po.n, 0),
         -- sem produto capturado, ou sem NENHUM nome legivel: "nao sei", nunca "nao tem"
         case when po.n is null or not po.algum_nome then null else po.terceiros end,
         po.nomes, po.chave_objeto, po.chave_nome
    from veic ve
    left join mutual_captura o
      on o.entidade = 'CONTRACT_OBJECT' and o.id_externo = ve.id_externo
    left join planos_protecao pp on pp.id = ve.plano_protecao_id
    left join por_obj po on po.objeto = ve.id_externo
   order by ve.placa;
end;
$$;

comment on function mutual_terceiros_por_objeto(uuid, uuid) is
  'Um veiculo carregado do Mutual por linha, com os produtos que ele contratou la (/contract/contract_object_product/) e se tem TERCEIROS. NULL = nenhum produto capturado: "nao sei", nunca "nao tem" (0091).';

-- ----------------------------------------------------------------------------
-- (D) Aplicar: com terceiros -> um plano, sem -> outro. Sem confirmar, simula.
-- ----------------------------------------------------------------------------
create or replace function mutual_aplicar_plano_por_terceiros(
  p_regional_id     uuid,
  p_tipo_veiculo_id uuid,
  p_plano_com       uuid,
  p_plano_sem       uuid,
  p_substituir      uuid[]  default '{}',
  p_confirmar       boolean default false
)
returns table(acao text, quantidade int)
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not tem_acesso_global() then
    raise exception 'Somente a matriz aplica o de-para de plano' using errcode = '42501';
  end if;
  if p_regional_id is null or p_tipo_veiculo_id is null then
    raise exception 'Informe a unidade e o tipo de veiculo' using errcode = '22023';
  end if;
  if not exists (select 1 from planos_protecao where id = p_plano_com)
     or not exists (select 1 from planos_protecao where id = p_plano_sem) then
    raise exception 'Plano de destino inexistente' using errcode = '22023';
  end if;

  return query
  with alvo as (
    select t.veiculo_id, t.plano_atual_id,
           case when t.tem_terceiros then p_plano_com else p_plano_sem end as destino,
           case
             when t.tem_terceiros is null then 'SEM_DADOS'
             when (case when t.tem_terceiros then p_plano_com else p_plano_sem end)
                  is not distinct from t.plano_atual_id then 'JA_CERTO'
             when t.plano_atual_id is not null
                  and not (t.plano_atual_id = any(coalesce(p_substituir, '{}'))) then 'MANTIDO'
             when t.tem_terceiros then 'COM_TERCEIROS'
             else 'SEM_TERCEIROS'
           end as acao
      from mutual_terceiros_por_objeto(p_regional_id, p_tipo_veiculo_id) t
  ),
  feito as (
    update veiculos v
       set plano_protecao_id = a.destino
      from alvo a
     where p_confirmar
       and v.id = a.veiculo_id
       and a.acao in ('COM_TERCEIROS', 'SEM_TERCEIROS')
    returning v.id
  )
  select a.acao, count(*)::int
    from alvo a
   where (select count(*) from feito) >= 0   -- forca a execucao do update antes do retorno
   group by a.acao
   order by a.acao;
end;
$$;

comment on function mutual_aplicar_plano_por_terceiros(uuid, uuid, uuid, uuid, uuid[], boolean) is
  'Regra do usuario (07/10/2026): com TERCEIROS no Mutual -> p_plano_com, sem -> p_plano_sem. So troca quem esta sem plano ou num plano de p_substituir; SEM_DADOS nao e tocado. Sem p_confirmar so simula (0091).';

-- ----------------------------------------------------------------------------
-- Rito de seguranca da 0052 (toda migration que cria/recria funcao)
-- ----------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
