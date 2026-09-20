-- =====================================================================
-- SCar :: 0083_mutual_equipe_vendas.sql
--
-- A UNIDADE DO SCar E A **EQUIPE DE VENDAS** DO MUTUAL, nao a filial.
--
-- ---------------------------------------------------------------------
-- 🔴 O NIVEL ESTAVA ERRADO — e a 0082 mapeava a camada de cima
-- ---------------------------------------------------------------------
-- O Mutual tem TRES niveis: regional (macro) -> sale_team (equipe de
-- vendas) -> consultant (vendedor). O SCar tem UM: `regionais`. A decisao
-- do usuario (20/09/2026) e que **`regionais` = equipe de vendas**, e que
-- a macrorregiao NAO vira tabela — achatar foi escolha, nao esquecimento:
-- "sera muita escrita para fazer a rota como estava".
--
-- Consequencia: o de-para que importa e `sale_team -> regionais`. A
-- `mutual_regional_do_externo` (0082) continua valendo para a FILIAL, mas
-- ela resolve a macrorregiao — bom para agrupar relatorio, largo demais
-- para decidir de quem e a carteira.
--
-- ---------------------------------------------------------------------
-- 🔴 E A CORRENTE DO CONSULTOR NAO ESTAVA VAZIA — eu medi a chave errada
-- ---------------------------------------------------------------------
-- A 0082 registrou, como fato medido, que `consultant` vinha em branco em
-- "0 de 17.675 objetos e 0 de 17.616 contratos". A metade do OBJETO esta
-- certa. A do CONTRATO estava ERRADA: no contrato a chave chama-se
-- **`consultant_id`**, e ela vem preenchida em **16.988 de 17.616 (96,4%)**.
--
-- `mutual_consultor_do_objeto` (0073) ja procura as DUAS chaves, entao o
-- funil da 0073/0074 sempre teria resolvido — quem errou foi a consulta
-- avulsa que concluiu o contrario. E o mais duro: e exatamente a licao que
-- a 0082 escreveu no proprio cabecalho (procurar o campo na entidade
-- vizinha), aplicada ao contrario. **Chave ausente so vira conclusao
-- depois de `mutual_campos` na entidade certa.**
--
-- O que o contrato guarda, medido em 20/09/2026:
--     regional_id      17.616 de 17.616   (100%)
--     sales_team_id    17.213 de 17.616   ( 97,7%)
--     consultant_id    16.988 de 17.616   ( 96,4%)
--     due_day          17.147 de 17.616
--
-- Sobre a carteira VIVA: 3.384 dos 3.440 faturaveis tem contrato, e desses
-- **3.384 tem equipe de vendas** — 100%. A corrente e de UM salto, por id.
--
-- ---------------------------------------------------------------------
-- O QUE ESTA MIGRATION FAZ
-- ---------------------------------------------------------------------
-- (A) `SALE_TEAM` vira entidade capturavel (`/association/sale_team/`).
--     Ela nunca foi capturada porque o plano concluiu "nao existe no
--     SCar" — conclusao que a decisao do usuario inverteu.
-- (B) `mutual_equipe_do_objeto` — o id da equipe (contrato manda).
-- (C) `mutual_equipes_vendas()` — a TELA do agrupamento: cada equipe com
--     o peso da carteira, a macrorregiao a que pertence e o de-para.
-- (D) `mutual_regional_do_objeto` — a unidade do SCar, pela EQUIPE, com a
--     filial do associado como reserva.
-- (E) `mutual_cobertura_unidade` recriada para medir a corrente CERTA.
--
-- Continua valendo a regra da Fase 1: nada escreve em `clientes`,
-- `veiculos`, `titulos_financeiros`, `faturas` nem `eventos_sinistro`.
-- =====================================================================


-- =====================================================================
-- (A) A entidade nova
-- =====================================================================
alter table mutual_captura drop constraint if exists chk_mutual_entidade;
alter table mutual_captura add constraint chk_mutual_entidade check (entidade in (
  'CONTRACT_OBJECT','CONTRACT','PERSON','ADDRESS','INVOICE','EVENT','REGIONAL','CONSULTANT',
  'SALE_TEAM',
  'VEHICLE_TYPE','VEHICLE_COLOR','VEHICLE_CATEGORY','VEHICLE_USE_TYPE','EVENT_TYPE'
));


-- As chaves candidatas da equipe, em UM lugar (padrao da 0082).
create or replace function mutual_chaves_equipe()
returns text[]
language sql
immutable
as $$
  select array['sales_team_id', 'sale_team_id', 'sales_team', 'sale_team'];
$$;

comment on function mutual_chaves_equipe() is
  'Chaves candidatas da equipe de vendas. Medido em 20/09/2026: o CONTRATO traz '
  '`sales_team_id` (97,7%); o objeto tem a chave e ela vem VAZIA em 100%.';


-- =====================================================================
-- (B) A equipe de um objeto — o CONTRATO manda
-- =====================================================================
-- Ao contrario da unidade (0082), aqui a precedencia e invertida de
-- proposito: `objeto.sales_team_id` existe e vem vazio em 17.675 de
-- 17.675, enquanto o contrato preenche. Objeto entra so como reserva
-- para o dia em que o Mutual passar a preencher.
create or replace function mutual_equipe_do_objeto(p_objeto jsonb, p_contrato jsonb default null)
returns text
language sql
immutable
as $$
  select coalesce(
    mutual_texto_em(p_contrato, mutual_chaves_equipe()),
    mutual_texto_em(p_objeto,   mutual_chaves_equipe())
  );
$$;

comment on function mutual_equipe_do_objeto(jsonb, jsonb) is
  'O id EXTERNO da equipe de vendas de um objeto. O CONTRATO manda (97,7% preenchido); '
  'o objeto e reserva e hoje vem vazio.';


-- A equipe de vendas -> a regional do SCar, SO pelo vinculo registrado.
-- Mesma postura da filial (0082): palpite nao carrega carteira.
create or replace function mutual_equipe_do_externo(p_id_externo text)
returns uuid
language sql
stable
set search_path = public
as $$
  select v.registro_id
    from integracao_vinculos v
   where v.sistema    = 'MUTUAL'
     and v.entidade   = 'SALE_TEAM'
     and v.tabela     = 'regionais'
     and v.id_externo = mutual_texto(p_id_externo);
$$;


-- =====================================================================
-- (D) A UNIDADE DO SCar de um objeto
-- =====================================================================
-- 🔴 A EQUIPE manda; a FILIAL do associado e reserva. As duas sao
-- de-para REGISTRADO — nunca palpite.
--
-- Por que a filial fica como reserva em vez de sair: ela resolve a
-- macrorregiao, que e larga demais (o "SUDESTE" junta Ribeirao Preto e a
-- capital, que sao DUAS unidades aqui). Serve para o objeto que ficou sem
-- contrato (56 dos 3.440), onde a alternativa seria nenhuma unidade.
create or replace function mutual_regional_do_objeto(p_objeto jsonb, p_contrato jsonb default null)
returns uuid
language sql
stable
set search_path = public
as $$
  select coalesce(
    mutual_equipe_do_externo(mutual_equipe_do_objeto(p_objeto, p_contrato)),
    mutual_regional_do_externo(mutual_regional_externa(p_objeto, p_contrato))
  );
$$;

comment on function mutual_regional_do_objeto(jsonb, jsonb) is
  'A regional do SCar de um objeto do Mutual. A EQUIPE DE VENDAS manda (e o nivel que '
  'corresponde a `regionais`); a filial do associado e reserva para o objeto sem contrato.';


-- =====================================================================
-- (C) A TELA DO AGRUPAMENTO
-- =====================================================================
-- Uma linha por equipe, com o peso da carteira e a macrorregiao a que ela
-- pertence — e a macrorregiao que torna o agrupamento legivel ("estas
-- quatro sao todas do Sudeste").
--
-- `consultores` entra porque equipe sem vendedor e equipe morta: e o que
-- distingue a duplicata viva da que so tem historico.
create or replace function mutual_equipes_vendas()
returns table (
  id_externo    text,
  nome          text,
  macrorregiao  text,
  filial_id     text,
  objetos       bigint,
  faturaveis    bigint,
  consultores   bigint,
  regional_id   uuid,     -- o de-para REGISTRADO
  capturada     boolean   -- false = o id aparece no contrato mas /sale_team/ nao foi puxado
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_staff() then
    raise exception 'Somente a equipe pode ler o diagnostico da integracao';
  end if;

  return query
  with ct as (
    select c.id_externo,
           mutual_texto_em(c.payload, mutual_chaves_equipe())   as equipe,
           mutual_texto_em(c.payload, mutual_chaves_regional()) as filial
      from mutual_captura c
     where c.entidade = 'CONTRACT' and not c.deletado
  ),
  obj as (
    select ct.equipe, ct.filial,
           mutual_status_veiculo(o.payload->>'contract_status', o.payload->>'status') as st
      from mutual_captura o
      join ct on ct.id_externo = o.payload->>'contract_id'
     where o.entidade = 'CONTRACT_OBJECT' and not o.deletado
  ),
  uso as (
    select obj.equipe,
           -- A macrorregiao de uma equipe e a que MAIS aparece nos contratos
           -- dela: equipe transferida de regional (previous_regional existe
           -- no contrato) deixa rastro nas duas, e a moda e o que descreve
           -- onde ela esta HOJE.
           (array_agg(obj.filial order by obj.filial))[1]               as filial_qualquer,
           mode() within group (order by obj.filial)                    as filial,
           count(*) filter (where obj.st is not null)::bigint           as n_obj,
           count(*) filter (where obj.st::text
                 in ('ativo','em_evento','vistoria_pendente'))::bigint  as n_fat
      from obj where obj.equipe is not null
     group by 1
  ),
  cons as (
    select mutual_texto_em(c.payload, mutual_chaves_equipe()) as equipe,
           count(*)::bigint as n
      from mutual_captura c
     where c.entidade = 'CONSULTANT' and not c.deletado
     group by 1
  ),
  -- A equipe pode aparecer SO no contrato (quando /sale_team/ ainda nao foi
  -- puxado) ou SO no cadastro (equipe nova, sem contrato). O full join e o
  -- que impede qualquer um dos dois lados de sumir da tela.
  eq as (
    select t.id_externo, mutual_texto(t.payload->>'name') as nome
      from mutual_captura t
     where t.entidade = 'SALE_TEAM' and not t.deletado
  )
  select coalesce(eq.id_externo, uso.equipe, cons.equipe),
         eq.nome,
         mutual_texto(r.payload->>'name'),
         uso.filial,
         coalesce(uso.n_obj, 0),
         coalesce(uso.n_fat, 0),
         coalesce(cons.n, 0),
         mutual_equipe_do_externo(coalesce(eq.id_externo, uso.equipe, cons.equipe)),
         eq.id_externo is not null
    from eq
    full join uso  on uso.equipe  = eq.id_externo
    full join cons on cons.equipe = coalesce(eq.id_externo, uso.equipe)
    left join mutual_captura r
      on r.entidade = 'REGIONAL' and not r.deletado and r.id_externo = uso.filial
   order by 6 desc, 5 desc, 2;
end;
$$;

comment on function mutual_equipes_vendas() is
  'As equipes de vendas do Mutual — o nivel que corresponde a `regionais` do SCar. '
  '`capturada` = false quando o id so aparece no contrato e /association/sale_team/ ainda '
  'nao foi puxado: ai a linha tem peso mas nao tem nome.';


-- =====================================================================
-- (E) O FUNIL passa a medir a corrente CERTA
-- =====================================================================
-- Mesma forma de OUT (a tela e o tipo do TS nao mudam). O que muda e a
-- corrente: objeto -> contrato -> equipe -> de-para.
create or replace function mutual_cobertura_unidade(
  p_somente_faturaveis boolean default true
)
returns table (
  passo    integer,
  etapa    text,
  objetos  bigint,
  perdidos bigint,
  detalhe  text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_equipes bigint;
begin
  if not is_staff() then
    raise exception 'Somente a equipe pode ler o diagnostico da integracao';
  end if;

  select count(*) into v_equipes
    from mutual_captura where entidade = 'SALE_TEAM' and not deletado;

  return query
  with ct as (
    select c.id_externo, c.payload from mutual_captura c
     where c.entidade = 'CONTRACT' and not c.deletado
  ),
  base as (
    select mutual_status_veiculo(o.payload->>'contract_status', o.payload->>'status') as st,
           ct.id_externo                                          as contrato,
           mutual_equipe_do_objeto(o.payload, ct.payload)         as equipe
      from mutual_captura o
      left join ct on ct.id_externo = o.payload->>'contract_id'
     where o.entidade = 'CONTRACT_OBJECT' and not o.deletado
  ),
  alvo as (
    select * from base
     where st is not null
       and (not p_somente_faturaveis
            or st::text in ('ativo', 'em_evento', 'vistoria_pendente'))
  ),
  passos as (
    select a.contrato is not null                          as tem_contrato,
           a.equipe is not null                            as tem_equipe,
           (a.equipe is not null
            and exists (select 1 from mutual_captura t
                         where t.entidade = 'SALE_TEAM' and not t.deletado
                           and t.id_externo = a.equipe))   as equipe_existe,
           mutual_equipe_do_externo(a.equipe) is not null   as tem_depara
      from alvo a
  ),
  t as (
    select count(*)                                  as n_total,
           count(*) filter (where tem_contrato)      as n_ct,
           count(*) filter (where tem_equipe)        as n_eq,
           count(*) filter (where equipe_existe)     as n_cad,
           count(*) filter (where tem_depara)        as n_dep
      from passos
  )
  select 1, 'Objetos considerados', t.n_total, 0::bigint,
         case when p_somente_faturaveis then 'so a carteira viva (faturaveis)'
              else 'todo objeto importavel' end
    from t
  union all
  select 2, 'Com contrato capturado', t.n_ct, t.n_total - t.n_ct,
         'a equipe mora no /contract/, nao no objeto' from t
  union all
  select 3, 'Com equipe de vendas', t.n_eq, t.n_ct - t.n_eq,
         'contract.sales_team_id — o nivel que corresponde a `regionais`' from t
  union all
  select 4, 'Equipe no cadastro (/sale_team/)', t.n_cad, t.n_eq - t.n_cad,
         case when v_equipes = 0
              then 'PUXE AS EQUIPES DE VENDAS: sem elas a equipe tem peso e nao tem nome'
              else 'o id da equipe existe em /association/sale_team/' end
    from t
  union all
  select 5, 'Equipe JA agrupada numa regional do SCar', t.n_dep, t.n_cad - t.n_dep,
         'de-para REGISTRADO. As equipes do Mutual estao duplicadas — varias viram UMA unidade'
    from t
  order by 1;
end;
$$;

comment on function mutual_cobertura_unidade(boolean) is
  'O funil da UNIDADE pela EQUIPE DE VENDAS (0083). A 0082 media pela filial do associado, '
  'que e a MACRORREGIAO — larga demais para decidir de quem e a carteira.';


-- =====================================================================
-- Rito de seguranca (0052).
-- =====================================================================
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
