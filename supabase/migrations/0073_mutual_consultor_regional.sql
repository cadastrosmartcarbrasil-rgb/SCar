-- ============================================================================
-- 0073 — A UNIDADE PELO CONSULTOR: o instrumento que MEDE a corrente
-- ============================================================================
-- A unidade nao esta em `regional` (medido: 3.527 de 3.527 faturaveis sem ela,
-- com os contratos todos capturados). A tese que sobrou e:
--
--   objeto.consultant (CODIGO)  ->  /association/consultant/  (cadastro)
--        ->  documento / e-mail  ->  vendedores do SCar  ->  regional_id
--
-- Ela e boa porque o `consultant` veio como CODIGO, nao como nome: o primeiro
-- salto e um join EXATO, e nao um casamento por texto que erra em acento,
-- abreviacao e homonimo. **Mas sao QUATRO elos, e cada um perde registros.**
-- Uma tese com quatro saltos nao se aceita pelo desenho; se mede.
--
-- Por isso esta migration nao carrega nada e nao decide nada: ela conta quantos
-- veiculos sobrevivem a CADA salto e nomeia quem se perde. E o mesmo papel que
-- `mutual_status_cruzado` (0071) teve para a mudanca de leitura do status —
-- medir ANTES da carga, nao depois do boleto.
--
-- A REGRA DA FASE CONTINUA: nada escreve em `clientes`, `veiculos`,
-- `titulos_financeiros`, `faturas` ou `eventos_sinistro`. Isto e leitura.
--
-- ⚠️ A CHAVE DE RECONCILIACAO E A MESMA DA IMPORTACAO DE VENDEDORES (0069):
-- documento (so digitos) manda, e-mail (minusculo) e a reserva. Medir por uma
-- chave que a carga nao usa produziria um numero bonito e falso.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper: o primeiro valor NAO VAZIO entre varias chaves candidatas
-- ----------------------------------------------------------------------------
-- O nome do campo do documento no cadastro do consultor nao esta medido — e
-- **supor onde um campo mora ja custou duas rodadas neste modulo** (o dia de
-- vencimento e a unidade). Entao aqui nao se chuta UMA chave: passa-se a lista
-- de candidatas e a funcao diz qual pegou. Quem quiser a lista real do payload
-- usa `mutual_campos('CONSULTANT')` (0065), que e o inspetor.
--
-- O `#>> '{}'` importa: sem ele uma string sai com as aspas do JSON e `""`
-- contaria como preenchido (mesmo cuidado da 0065).
create or replace function mutual_texto_em(p_payload jsonb, p_chaves text[])
returns text
language sql
immutable
as $$
  select mutual_texto(x.j #>> '{}')
    from unnest(p_chaves) k
    cross join lateral (select p_payload -> k as j) x
   where x.j is not null
     and jsonb_typeof(x.j) not in ('object','array','null')
     and mutual_texto(x.j #>> '{}') is not null
   limit 1;
$$;

comment on function mutual_texto_em(jsonb, text[]) is
  'Primeiro valor nao vazio entre chaves candidatas. Existe para NAO chutar o nome do campo.';

-- Qual chave pegou (para a tela dizer de onde o dado saiu, em vez de so mostrar
-- o valor): sem isso ninguem descobre que o documento veio de `cpf` e nao de
-- `cpf_cnpj`, e a proxima sessao chuta de novo.
create or replace function mutual_chave_em(p_payload jsonb, p_chaves text[])
returns text
language sql
immutable
as $$
  select k
    from unnest(p_chaves) k
    cross join lateral (select p_payload -> k as j) x
   where x.j is not null
     and jsonb_typeof(x.j) not in ('object','array','null')
     and mutual_texto(x.j #>> '{}') is not null
   limit 1;
$$;

-- ----------------------------------------------------------------------------
-- O CODIGO do consultor de um objeto — objeto primeiro, contrato como reserva
-- ----------------------------------------------------------------------------
-- Mesma precedencia que a 0064 usou para `due_day`: o dado pode morar nos dois
-- lugares, e o mais especifico ganha.
create or replace function mutual_consultor_do_objeto(p_objeto jsonb, p_contrato jsonb)
returns text
language sql
immutable
as $$
  select coalesce(
    mutual_texto_em(p_objeto,  array['consultant','consultant_id']),
    mutual_texto_em(p_contrato, array['consultant','consultant_id'])
  );
$$;

-- ============================================================================
-- O FUNIL — quantos veiculos sobrevivem a cada salto
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
  -- universos diferentes.
  passos as (
    select a.id_externo,
           a.cons_id is not null                                   as tem_cons,
           c.id_externo is not null                                as capturado,
           (c.doc is not null or c.email is not null)              as tem_chave,
           v.id is not null                                        as casa_vendedor,
           (v.id is not null and v.regional_id is not null)        as tem_regional,
           -- informativo: casaria SO pelo nome? (a carga NAO usa nome — 0069)
           (v.id is null and vn.id is not null)                    as so_por_nome
      from alvo a
      left join cons c on c.id_externo = a.cons_id
      left join vendedores v
             on (c.doc   is not null and v.documento = c.doc)
             or (c.doc   is null and c.email is not null and lower(v.email) = c.email)
      left join vendedores vn
             on c.nome is not null
            and upper(btrim(vn.nome)) = upper(btrim(c.nome))
  ),
  t as (
    select count(*)                                        as n_total,
           count(*) filter (where tem_cons)                as n_cons,
           count(*) filter (where tem_cons and capturado)  as n_capt,
           count(*) filter (where capturado and tem_chave) as n_chave,
           count(*) filter (where casa_vendedor)           as n_vend,
           count(*) filter (where tem_regional)            as n_reg,
           count(*) filter (where so_por_nome)             as n_nome
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
         format('%s casariam SO por nome (a carga nao usa nome)', t.n_nome) from t
  union all
  select 6, 'UNIDADE RESOLVIDA', t.n_reg, t.n_vend - t.n_reg,
         'vendedor importado com regional definida — e este o numero que decide' from t
  order by 1;
end;
$$;

comment on function mutual_cobertura_consultor(boolean, text[], text[], text[]) is
  'Funil objeto -> consultor -> vendedor -> unidade. Mede a tese ANTES da carga; nao escreve nada.';

-- ============================================================================
-- QUEM SE PERDE — a lista acionavel, nao so o percentual
-- ============================================================================
-- Um funil que termina em "faltam 800" nao diz o que fazer. Esta consulta diz:
-- sao 12 consultores, estes, respondendo por 800 veiculos — e o que falta em
-- cada um. Aparece ordenada por VOLUME porque tratar o maior primeiro resolve
-- a maior parte da carteira com o menor numero de decisoes.
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
    left join vendedores v
           on (c.doc is not null and v.documento = c.doc)
           or (c.doc is null and c.email is not null and lower(v.email) = c.email)
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
  'Os consultores que a corrente perde, por VOLUME de veiculos — a fila de trabalho, nao o percentual.';

-- ============================================================================
-- RITO DE SEGURANCA (0052)
-- ============================================================================
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
