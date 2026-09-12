-- ============================================================================
-- 0074 — CORRETIVA da 0073: o funil do consultor estava CONTANDO DUAS VEZES
-- ============================================================================
-- A 0073 existe para uma coisa so: MEDIR, antes da carga, quantos veiculos
-- sobrevivem a corrente
--
--   objeto.consultant -> /association/consultant/ -> vendedores -> regional_id
--
-- Um instrumento de medida que conta errado e pior que nenhum: ele nao adia a
-- decisao, ele a toma com numero falso. Eram dois defeitos, os dois no lugar
-- onde ninguem olharia — o JOIN, nao a regra.
--
-- (1) O LEFT JOIN COM `vendedores` MULTIPLICAVA A LINHA DO VEICULO.
--     `vendedores.documento` e unique parcial (0069), mas `email` e `nome` NAO
--     sao. Dois vendedores com o mesmo e-mail (unidade que cadastrou a equipe
--     com o e-mail da franquia) ou dois homonimos faziam CADA veiculo daquele
--     consultor virar duas linhas na CTE `passos` — e como o `n_total` e um
--     `count(*)` sobre ela, o funil inteiro inflava. Pior: inflava so nas
--     linhas com colisao, entao `perdidos`, que e subtracao entre degraus,
--     virava ruido. O funil diria "faltam 800" com 400 reais, ou o contrario.
--
--     A correcao nao e `distinct` — isso esconderia a colisao. O casamento com
--     o vendedor e propriedade do CONSULTOR, nao do veiculo: passa a ser
--     resolvido UMA vez por consultor (sao centenas, contra dezenas de milhares
--     de objetos), por `lateral ... limit 1` com ordem estavel. De quebra fica
--     mais barato.
--
--     E a ambiguidade deixa de ser silenciosa: o degrau 5 passa a DIZER quantos
--     veiculos casaram por uma chave que aponta mais de um vendedor. Escolher um
--     no desempate e uma decisao — e neste modulo decisao em silencio ja custou
--     duas rodadas.
--
-- (2) `mutual_texto_em`/`mutual_chave_em` NAO GARANTIAM A PRECEDENCIA.
--     Elas existem justamente para nao chutar o nome do campo: recebem a lista
--     de candidatas em ORDEM (`cpf_cnpj` antes de `cpf` antes de `document`) e
--     devolvem a primeira preenchida. So que `limit 1` sobre `unnest` SEM
--     `order by` nao promete ordem nenhuma — o planejador pode devolver
--     qualquer linha. Hoje sai na ordem do array por acaso, e "por acaso" e o
--     tipo de coisa que muda com um `seq_page_cost` diferente e ninguem liga ao
--     numero que mudou. `with ordinality` + `order by` torna a promessa real.
--
-- A REGRA DA FASE CONTINUA: isto e LEITURA. Nada escreve em `clientes`,
-- `veiculos`, `titulos_financeiros`, `faturas` nem `eventos_sinistro`.
-- Nenhuma assinatura muda, entao tudo aqui e `create or replace`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Os helpers das chaves candidatas — agora com a ordem PROMETIDA
-- ----------------------------------------------------------------------------
create or replace function mutual_texto_em(p_payload jsonb, p_chaves text[])
returns text
language sql
immutable
as $$
  select mutual_texto(x.j #>> '{}')
    from unnest(p_chaves) with ordinality as u(k, ord)
    cross join lateral (select p_payload -> u.k as j) x
   where x.j is not null
     and jsonb_typeof(x.j) not in ('object','array','null')
     and mutual_texto(x.j #>> '{}') is not null
   order by u.ord
   limit 1;
$$;

comment on function mutual_texto_em(jsonb, text[]) is
  'Primeiro valor nao vazio entre chaves candidatas, NA ORDEM dada. Existe para NAO chutar o nome do campo.';

create or replace function mutual_chave_em(p_payload jsonb, p_chaves text[])
returns text
language sql
immutable
as $$
  select u.k
    from unnest(p_chaves) with ordinality as u(k, ord)
    cross join lateral (select p_payload -> u.k as j) x
   where x.j is not null
     and jsonb_typeof(x.j) not in ('object','array','null')
     and mutual_texto(x.j #>> '{}') is not null
   order by u.ord
   limit 1;
$$;

comment on function mutual_chave_em(jsonb, text[]) is
  'Qual chave candidata pegou, NA ORDEM dada — para a tela dizer de onde o dado saiu.';

-- ============================================================================
-- O FUNIL — uma linha por veiculo, sempre
-- ============================================================================
create or replace function mutual_cobertura_consultor(
  p_somente_faturaveis boolean default true,
  p_chaves_doc   text[] default array['cpf_cnpj','cpf','document','documento','doc'],
  p_chaves_email text[] default array['email','e_mail','mail'],
  p_chaves_nome  text[] default array['name','nome','full_name','fantasy_name']
)
returns table (
  passo    integer,
  etapa    text,
  objetos  bigint,
  perdidos bigint,     -- em relacao ao passo anterior
  detalhe  text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consultores bigint;
begin
  if not is_staff() then
    raise exception 'Somente a equipe pode ler o diagnostico da integracao';
  end if;

  select count(*) into v_consultores
    from mutual_captura where entidade = 'CONSULTANT' and not deletado;

  return query
  with ct as (
    select c.id_externo, c.payload
      from mutual_captura c
     where c.entidade = 'CONTRACT' and not c.deletado
  ),
  cons as (
    select c.id_externo,
           mutual_texto_em(c.payload, p_chaves_nome)                                as nome,
           nullif(regexp_replace(coalesce(mutual_texto_em(c.payload, p_chaves_doc), ''),
                                 '\D', '', 'g'), '')                                as doc,
           lower(mutual_texto_em(c.payload, p_chaves_email))                        as email
      from mutual_captura c
     where c.entidade = 'CONSULTANT' and not c.deletado
  ),
  -- O casamento com o vendedor e propriedade do CONSULTOR, nao do veiculo:
  -- resolvido UMA vez aqui, e em UMA linha. Era daqui que vinha a contagem
  -- dobrada — `email` e `nome` nao sao unicos em `vendedores`.
  -- A precedencia da 0069 e preservada exatamente: o documento manda, e o
  -- e-mail so entra quando NAO ha documento (documento que nao casa nao cai
  -- para o e-mail — sao chaves de forca diferente, nao alternativas).
  cons_v as (
    select c.id_externo, c.nome, c.doc, c.email,
           vd.id          as vend_id,
           vd.regional_id as vend_regional,
           coalesce(vd.ambiguo, false) as vend_ambiguo,
           vn.id          as vend_nome
      from cons c
      left join lateral (
        select v.id, v.regional_id, count(*) over () > 1 as ambiguo
          from vendedores v
         where (c.doc is not null and v.documento = c.doc)
            or (c.doc is null and c.email is not null and lower(v.email) = c.email)
         order by v.id       -- desempate ESTAVEL; o ramo do documento e unico (0069)
         limit 1
      ) vd on true
      left join lateral (
        select v.id
          from vendedores v
         where c.nome is not null
           and upper(btrim(v.nome)) = upper(btrim(c.nome))
         order by v.id
         limit 1
      ) vn on true
  ),
  base as (
    select o.id_externo,
           mutual_status_veiculo(o.payload->>'contract_status', o.payload->>'status') as st,
           mutual_consultor_do_objeto(o.payload, ct.payload)                          as cons_id
      from mutual_captura o
      left join ct on ct.id_externo = o.payload->>'contract_id'
     where o.entidade = 'CONTRACT_OBJECT' and not o.deletado
  ),
  alvo as (
    select * from base
     where st is not null
       and (not p_somente_faturaveis or st::text in ('ativo','em_evento','vistoria_pendente'))
  ),
  -- Cada salto e uma coluna booleana sobre a MESMA linha: assim "perdidos" e
  -- subtracao honesta, e nao a diferenca entre duas consultas que filtraram
  -- universos diferentes. `cons_v` e unica por `id_externo`, entao este join
  -- nao multiplica o veiculo — que era o defeito da 0073.
  passos as (
    select a.id_externo,
           a.cons_id is not null                                    as tem_cons,
           c.id_externo is not null                                 as capturado,
           (c.doc is not null or c.email is not null)               as tem_chave,
           c.vend_id is not null                                    as casa_vendedor,
           (c.vend_id is not null and c.vend_regional is not null)  as tem_regional,
           -- informativo: casaria SO pelo nome? (a carga NAO usa nome — 0069)
           (c.vend_id is null and c.vend_nome is not null)          as so_por_nome,
           coalesce(c.vend_ambiguo, false)                          as chave_ambigua
      from alvo a
      left join cons_v c on c.id_externo = a.cons_id
  ),
  t as (
    select count(*)                                        as n_total,
           count(*) filter (where tem_cons)                as n_cons,
           count(*) filter (where tem_cons and capturado)  as n_capt,
           count(*) filter (where capturado and tem_chave) as n_chave,
           count(*) filter (where casa_vendedor)           as n_vend,
           count(*) filter (where tem_regional)            as n_reg,
           count(*) filter (where so_por_nome)             as n_nome,
           count(*) filter (where chave_ambigua)           as n_amb
      from passos
  )
  select 1, 'Objetos considerados', t.n_total, 0::bigint,
         case when p_somente_faturaveis then 'so a carteira viva (faturaveis)'
              else 'todo objeto importavel' end
    from t
  union all
  select 2, 'Com codigo de consultor', t.n_cons, t.n_total - t.n_cons,
         'objeto, com o contrato como reserva' from t
  union all
  select 3, 'Consultor CAPTURADO', t.n_capt, t.n_cons - t.n_capt,
         case when v_consultores = 0
              then 'NENHUM consultor capturado — puxe "Consultores" antes de ler este funil'
              else format('%s consultores no espelho', v_consultores) end from t
  union all
  select 4, 'Consultor com CPF ou e-mail', t.n_chave, t.n_capt - t.n_chave,
         'a chave de reconciliacao da 0069 (documento manda, e-mail e reserva)' from t
  union all
  select 5, 'Casa com vendedor do SCar', t.n_vend, t.n_chave - t.n_vend,
         format('%s casariam SO por nome (a carga nao usa nome)%s', t.n_nome,
                case when t.n_amb > 0
                     then format(' · %s em chave AMBIGUA (casa em mais de um vendedor; '
                                 'desempate arbitrario — confira antes da carga)', t.n_amb)
                     else '' end) from t
  union all
  select 6, 'UNIDADE RESOLVIDA', t.n_reg, t.n_vend - t.n_reg,
         'vendedor importado com regional definida — e este o numero que decide' from t
  order by 1;
end;
$$;

comment on function mutual_cobertura_consultor(boolean, text[], text[], text[]) is
  'Funil objeto -> consultor -> vendedor -> unidade, UMA linha por veiculo. Mede a tese ANTES da carga; nao escreve nada.';

-- ============================================================================
-- QUEM SE PERDE — a fila de trabalho, sem consultor repetido
-- ============================================================================
-- Mesmo defeito, outro sintoma: aqui a multiplicacao nao inflava contagem (o
-- `n` ja vinha agregado), mas repetia o consultor na lista — e uma fila que
-- mostra a mesma pendencia duas vezes faz a equipe trabalhar duas vezes.
create or replace function mutual_consultores_sem_vendedor(
  p_limite             integer default 50,
  p_somente_faturaveis boolean default true,
  p_chaves_doc   text[] default array['cpf_cnpj','cpf','document','documento','doc'],
  p_chaves_email text[] default array['email','e_mail','mail'],
  p_chaves_nome  text[] default array['name','nome','full_name','fantasy_name']
)
returns table (
  consultor_id text,
  nome         text,
  documento    text,
  email        text,
  veiculos     bigint,
  motivo       text
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
    select c.id_externo, c.payload from mutual_captura c
     where c.entidade = 'CONTRACT' and not c.deletado
  ),
  cons as (
    select c.id_externo,
           mutual_texto_em(c.payload, p_chaves_nome) as nome,
           nullif(regexp_replace(coalesce(mutual_texto_em(c.payload, p_chaves_doc), ''),
                                 '\D', '', 'g'), '') as doc,
           lower(mutual_texto_em(c.payload, p_chaves_email)) as email
      from mutual_captura c
     where c.entidade = 'CONSULTANT' and not c.deletado
  ),
  alvo as (
    select mutual_consultor_do_objeto(o.payload, ct.payload) as cons_id,
           mutual_status_veiculo(o.payload->>'contract_status', o.payload->>'status') as st
      from mutual_captura o
      left join ct on ct.id_externo = o.payload->>'contract_id'
     where o.entidade = 'CONTRACT_OBJECT' and not o.deletado
  ),
  agrupado as (
    select a.cons_id, count(*)::bigint as n
      from alvo a
     where a.st is not null
       and (not p_somente_faturaveis or a.st::text in ('ativo','em_evento','vistoria_pendente'))
     group by 1
  )
  select coalesce(g.cons_id, '(sem consultor no objeto)'),
         c.nome, c.doc, c.email, g.n,
         case
           when g.cons_id is null      then 'O objeto nao declara consultor'
           when c.id_externo is null   then 'Codigo nao existe no espelho — puxe "Consultores" ou o cadastro foi apagado la'
           when c.doc is null and c.email is null
                                       then 'Consultor sem CPF nem e-mail: nao ha por onde reconciliar'
           when v.id is null           then 'Nao esta entre os vendedores importados'
           else                             'Vendedor sem unidade definida'
         end
    from agrupado g
    left join cons c on c.id_externo = g.cons_id
    -- `limit 1`: um consultor e UMA linha na fila, mesmo que a chave dele
    -- aponte dois vendedores (e-mail repetido). Ver o cabecalho.
    left join lateral (
      select v.id, v.regional_id
        from vendedores v
       where (c.doc is not null and v.documento = c.doc)
          or (c.doc is null and c.email is not null and lower(v.email) = c.email)
       order by v.id
       limit 1
    ) v on true
   where g.cons_id is null
      or c.id_externo is null
      or (c.doc is null and c.email is null)
      or v.id is null
      or v.regional_id is null
   order by g.n desc
   limit greatest(coalesce(p_limite, 50), 1);
end;
$$;

comment on function mutual_consultores_sem_vendedor(integer, boolean, text[], text[], text[]) is
  'Os consultores que a corrente perde, por VOLUME de veiculos — uma linha por consultor.';

-- ============================================================================
-- RITO DE SEGURANCA (0052)
-- ============================================================================
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
