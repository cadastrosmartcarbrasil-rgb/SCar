-- =====================================================================
-- 0085_mutual_de_para_plano — o de-para do PLANO que a 0084 deixou faltando
-- =====================================================================
-- A 0084 criou `mutual_plano_do_externo` e o de-para por vinculo, mas NAO
-- criou a tela nem abriu a entidade: `chk_mutual_entidade` (0062) nao
-- aceitava `'PLAN'`, entao `/plan/` nao podia ser puxado e os `plan_id`
-- ficavam sendo NUMEROS SEM NOME. Resultado medido em 01/10/2026: a carga
-- da matriz entraria com 481 de 481 veiculos SEM plano.
--
-- ---------------------------------------------------------------------
-- 🔴 DUAS HIPOTESES MEDIDAS E DESCARTADAS ANTES DE ESCREVER ISTO
-- ---------------------------------------------------------------------
-- (1) "O preco identifica o plano, entao o nome e dispensavel."
--     FALSO. Na amostra da MATRIZ a mensalidade mediana parecia separar os
--     ids limpo (48 → R$ 196 · 88 → R$ 213 · 41 → R$ 120) e a FIPE mediana
--     acompanhava — o que sugeria `plan_id` = FAIXA DE PRECO, equivalente a
--     nossa `tabela_precos_faixa`. **A base viva inteira desmente:** dentro
--     do MESMO `plan_id` a FIPE varia de **6x a 14x** (e 1.111x no id 48).
--     Ou seja o id e COMBO COMERCIAL, nao faixa — e a mensalidade varia com
--     a FIPE dentro dele, entao ela nao o identifica.
--     *Isto e a licao do modulo repetida: amostra pequena sugeriu padrao que
--     a base inteira nega. Quase virou afirmacao.*
-- (2) "Sao 42 decisoes, inviavel."
--     FALSO TAMBEM, e e o que torna isto entregavel: **17 ids cobrem 90%**
--     dos 481 faturaveis da matriz (na base viva inteira, 26 de 91 cobrem
--     90% dos 3.041). Por isso `mutual_planos_externos` devolve a
--     **cobertura acumulada**: a tela diz onde parar.
--
-- ---------------------------------------------------------------------
-- ⚠️ O ENDPOINT `/plan/` NAO FOI CONFIRMADO NO SWAGGER
-- ---------------------------------------------------------------------
-- O swagger do Mutual nao e alcancavel do ambiente onde esta migration foi
-- escrita. O caminho posto em `ENTIDADES_MUTUAL` segue o padrao das outras
-- entidades de contrato (`/contract/`, `/contract/contract_object/nested/`),
-- e a TELA DIZ que ele e um palpite: puxar e um clique e um 404 responde a
-- pergunta em dois segundos. **Trocar o caminho e UMA LINHA** em
-- `src/lib/mutual.ts` — nao ha schema preso a ele.
--
-- 🔴 E O DE-PARA NAO DEPENDE DA CAPTURA. `integracao_vinculos` (0082) guarda
-- o ID e nao tem FK para `mutual_captura`, entao os 42 ids aparecem na tela
-- COM o peso da carteira mesmo sem nome — exatamente como as 19 equipes de
-- vendas foram agrupadas antes de `SALE_TEAM` ser puxada (0083). Capturar
-- depois so preenche o NOME.
--
-- ---------------------------------------------------------------------
-- O QUE O PLANO CUSTA — e nao e o boleto
-- ---------------------------------------------------------------------
-- `valor_mensalidade_veiculo` (0024) prefere o OVERRIDE e **nunca chama o
-- `cotar_plano`**: a carga grava `final_total_value` em todos menos 3, logo
-- 470 dos 473 sao faturados pelo valor carimbado, com ou sem plano. O que o
-- plano decide e a **COBERTURA que a ficha do SAC mostra**
-- (`opcionais_veiculo`, 0029, que chama `cotar_plano` e com plano nulo
-- devolve so a base + avulsos). Sem ele o atendente nao ve a que o associado
-- tem direito — e isso pesa quando outubro virar atendimento real, nao na
-- hora de carregar.
-- =====================================================================


-- =====================================================================
-- (A) `PLAN` VIRA ENTIDADE CAPTURAVEL
-- =====================================================================
-- `chk_mutual_entidade` e uma allow-list de propósito (0062): sem ela um
-- erro de digitação cria captura que nenhuma função lê. Mas ela também é o
-- que RECUSAVA `/plan/` — e o plano é a última entidade de domínio que a
-- carga precisa.
--
-- 🔴 REDIGITAR UMA ALLOW-LIST DERRUBA O QUE VOCE ESQUECER — e em silencio.
-- A primeira versao desta migration omitiu `'CONTRACT'` ao reescrever a lista,
-- e o CONTRATO e justamente a entidade que guarda o dia de vencimento (0064) e
-- a `sales_team_id` (0083): a captura dele pararia de funcionar e o sintoma
-- apareceria dias depois, na carga. **A suite pegou** — e por isso ela passou a
-- afirmar a lista INTEIRA, uma insercao por entidade, em vez de so a nova.
alter table mutual_captura drop constraint if exists chk_mutual_entidade;
alter table mutual_captura add constraint chk_mutual_entidade check (entidade in (
  'CONTRACT_OBJECT','CONTRACT','PERSON','ADDRESS','INVOICE','EVENT',
  'REGIONAL','SALE_TEAM','CONSULTANT','PLAN',
  'VEHICLE_TYPE','VEHICLE_COLOR','VEHICLE_CATEGORY','VEHICLE_USE_TYPE','EVENT_TYPE'
));


-- =====================================================================
-- (B) A TELA DO DE-PARA DO PLANO
-- =====================================================================
-- Uma linha por `plan_id` que aparece na carteira VIVA, com o peso e a
-- cobertura acumulada. `p_regional_id` nulo = a base inteira; com unidade,
-- o peso é o daquela unidade — porque é por unidade que a carga roda, e
-- ordenar pelo volume da base toda colocaria no topo um plano que não pesa
-- nada na unidade que se está carregando.
--
-- 🔴 `mensalidade_mediana`, `fipe_min` e `fipe_max` entram como PERFIL, não
-- como identificação: foi medido que a FIPE varia de 6x a 14x dentro do
-- mesmo id, então eles NÃO dizem qual combo é qual. Servem para reconhecer
-- "este é de moto" e para desconfiar quando a faixa é absurda (o id 48 vai
-- de R$ 100 a R$ 111.140 de FIPE — isso é um plano genérico, não um combo).
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
  with cap as (
    select c.id_externo,
           mutual_texto_em(c.payload, array['name','nome','description','descricao']) as nome
      from mutual_captura c
     where c.entidade = 'PLAN' and not c.deletado
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
         cap.id_externo is not null,
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
  'O de-para de plan_id -> planos_protecao, ordenado por peso da carteira e com a '
  'COBERTURA ACUMULADA (17 ids cobrem 90% dos 481 da matriz). Medido: a FIPE varia '
  '6x a 14x dentro do mesmo plan_id, entao preco NAO identifica o combo — o nome vem '
  'da captura de /plan/, e o de-para funciona sem ela (padrao da 0083).';


-- =====================================================================
-- (C) `mutual_tipos_veiculo_externos` — o nome da coluna MENTIA
-- =====================================================================
-- A 0084 devolvia o de-para do TIPO DE VEICULO numa coluna chamada
-- `regional_id`, que guarda um `tipos_veiculo.id`. Nome que mente e a
-- familia de erro que este projeto ja pagou caro (o branch "espelhado", a
-- `schema_migrations` vazia): a proxima sessao le `regional_id`, conclui
-- unidade e constroi em cima. Vira `destino_id`, igual ao do plano.
-- Muda a lista de OUT, entao e DROP + CREATE.
drop function if exists mutual_tipos_veiculo_externos();

create or replace function mutual_tipos_veiculo_externos()
returns table (
  id_externo   text,
  nome         text,
  capturado    boolean,
  veiculos     bigint,
  faturaveis   bigint,
  destino_id   uuid,
  tipo_nome    text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_staff() then
    raise exception 'Somente a equipe pode ler o de-para de tipos de veiculo';
  end if;

  return query
  with cap as (
    select c.id_externo, mutual_texto(c.payload->>'name') as nome
      from mutual_captura c
     where c.entidade = 'VEHICLE_TYPE' and not c.deletado
  ),
  ct as (
    select c.id_externo, c.payload from mutual_captura c
     where c.entidade = 'CONTRACT' and not c.deletado
  ),
  uso as (
    select mutual_texto(o.payload#>>'{vehicle_data,vehicle_type}') as id_externo,
           mutual_status_veiculo(o.payload->>'contract_status',
                                 o.payload->>'status')             as st
      from mutual_captura o
      left join ct on ct.id_externo = o.payload->>'contract_id'
     where o.entidade = 'CONTRACT_OBJECT' and not o.deletado
  ),
  peso as (
    select u.id_externo,
           count(*) filter (where u.st is not null)                   as veiculos,
           count(*) filter (where u.st::text in ('ativo','em_evento',
                              'vistoria_pendente','inadimplente'))     as faturaveis
      from uso u where u.id_externo is not null
     group by u.id_externo
  )
  select coalesce(cap.id_externo, peso.id_externo),
         cap.nome,
         cap.id_externo is not null,
         coalesce(peso.veiculos, 0),
         coalesce(peso.faturaveis, 0),
         mutual_tipo_veiculo_do_externo(coalesce(cap.id_externo, peso.id_externo)),
         t.nome
    from cap
    full join peso on peso.id_externo = cap.id_externo
    left join tipos_veiculo t
           on t.id = mutual_tipo_veiculo_do_externo(coalesce(cap.id_externo, peso.id_externo))
   order by coalesce(peso.faturaveis, 0) desc, coalesce(peso.veiculos, 0) desc;
end;
$$;

comment on function mutual_tipos_veiculo_externos() is
  'O de-para de /vehicle/type/ com o PESO da carteira. A coluna do destino chama-se '
  '`destino_id` (na 0084 chamava-se `regional_id` e guardava um tipos_veiculo.id — '
  'nome que mente e a familia de erro mais caro deste projeto).';


-- =====================================================================
-- Rito de seguranca (0052).
-- =====================================================================
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
