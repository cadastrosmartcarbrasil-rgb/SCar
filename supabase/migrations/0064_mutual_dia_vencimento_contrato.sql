-- ============================================================================
-- SCar :: 0064_mutual_dia_vencimento_contrato.sql
--
-- CONFERIDO NA TELA DO MUTUAL (09/09/2026): o dia de vencimento EXISTE — ele
-- esta na "Configuracao da cobranca" do CONTRATO (campo "Dia de vencimento da
-- parcela"), nao no objeto do contrato. Ou seja, as centenas de linhas que o
-- diagnostico marcou como "Faturavel sem dia de vencimento" sao FALSO ALARME:
-- o dado existe, so nao no endpoint que tinhamos capturado.
--
-- Esta migration:
--   (A) faz o diagnostico RESOLVER `due_day` e `regional` pelo CONTRATO
--       (`/contract/`), caindo no objeto so quando o contrato nao tem;
--   (B) diz na propria tela quando `/contract/` ainda NAO foi capturado — sem
--       isso o indicador continuaria acusando ausencia de um dado que ninguem
--       puxou, que e como o falso alarme nasceu;
--   (C) abre `mutual_periodicidade()`, por causa do que a mesma tela revelou:
--       contrato SEMESTRAL, 6 parcelas, parcela R$ 120,00 e total R$ 720,00.
--       `veiculos.valor_mensalidade` (0024) e MENSAL. Se `final_total_value`
--       for o TOTAL e nao a parcela, importar direto cobra 6x a mais do
--       associado. Nao da para decidir isso por suposicao — a funcao mostra a
--       distribuicao real por periodicidade para a resposta sair dos DADOS.
-- ============================================================================

-- Espelho SQL de `mesesDoPeriodoMutual` (src/lib/mutual.ts). O contrato deles
-- usa 12/6/3/1; a tela mostra o rotulo. Aceitamos os dois.
create or replace function mutual_meses_periodo(p_periodo text)
returns integer
language sql immutable
as $$
  select case upper(coalesce(mutual_texto(p_periodo), ''))
           when '1'  then 1  when 'MENSAL'     then 1
           when '3'  then 3  when 'TRIMESTRAL' then 3
           when '6'  then 6  when 'SEMESTRAL'  then 6
           when '12' then 12 when 'ANUAL'      then 12
           else null
         end;
$$;

comment on function mutual_meses_periodo(text) is
  'contract_period do Mutual -> meses. Espelho de mesesDoPeriodoMutual (src/lib/mutual.ts).';

-- ----------------------------------------------------------------------------
-- (C) A periodicidade da cobranca, com o valor ao lado
-- ----------------------------------------------------------------------------
-- Por que o valor entra AQUI: e a comparacao entre periodicidades que responde
-- se `final_total_value` e a PARCELA ou o TOTAL. Se a mediana do semestral for
-- proxima da mensal, e parcela; se for ~6x, e total — e a carga precisa dividir.
create or replace function mutual_periodicidade()
returns table (
  periodo        text,
  meses          integer,
  contratos      bigint,
  objetos        bigint,
  parcelas_media numeric,
  valor_mediano  numeric,
  valor_minimo   numeric,
  valor_maximo   numeric
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
  with contratos as (
    select c.id_externo,
           mutual_texto(c.payload->>'contract_period')        as periodo,
           nullif(c.payload->>'number_installments','')::numeric as parcelas
      from mutual_captura c
     where c.entidade = 'CONTRACT' and not c.deletado
  ),
  objetos as (
    select o.payload->>'contract_id'                          as contrato_id,
           nullif(o.payload->>'final_total_value','')::numeric as vlr
      from mutual_captura o
     where o.entidade = 'CONTRACT_OBJECT' and not o.deletado
       and mutual_status_veiculo(o.payload->>'contract_status', o.payload->>'status')
             in ('ativo','em_evento','vistoria_pendente')
  )
  select coalesce(ct.periodo, '(nao informado)'),
         mutual_meses_periodo(ct.periodo),
         count(distinct ct.id_externo)::bigint,
         count(ob.contrato_id)::bigint,
         round(avg(ct.parcelas), 1),
         round(percentile_cont(0.5) within group (order by ob.vlr)::numeric, 2),
         min(ob.vlr),
         max(ob.vlr)
    from contratos ct
    left join objetos ob on ob.contrato_id = ct.id_externo
   group by 1, 2
   order by 3 desc;
end;
$$;

comment on function mutual_periodicidade() is
  'contract_period x parcelas x valor do objeto. Responde se final_total_value e a PARCELA ou o TOTAL — veiculos.valor_mensalidade (0024) e MENSAL.';

-- ----------------------------------------------------------------------------
-- (A)+(B) O diagnostico, agora lendo o CONTRATO
-- ----------------------------------------------------------------------------
create or replace function mutual_diagnostico()
returns table (
  grupo      text,
  indicador  text,
  valor      bigint,
  detalhe    text,
  severidade text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contratos bigint;
begin
  if not is_staff() then
    raise exception 'Somente a equipe pode ler o diagnostico da integracao';
  end if;

  select count(*) into v_contratos
    from mutual_captura where entidade = 'CONTRACT' and not deletado;

  return query
  with ct as (
    select c.id_externo,
           mutual_texto(c.payload->>'due_day')  as dia,
           mutual_texto(c.payload->>'regional') as unidade
      from mutual_captura c
     where c.entidade = 'CONTRACT' and not c.deletado
  ),
  obj as (
    select mutual_status_veiculo(o.payload->>'contract_status', o.payload->>'status') as st,
           mutual_texto(o.payload#>>'{vehicle_data,vehicle_plate}')   as placa,
           mutual_texto(o.payload#>>'{vehicle_data,vehicle_chassi}')  as chassi,
           mutual_texto(o.payload#>>'{person_data,person_cpf_cnpj}')  as cpf,
           mutual_texto(o.payload#>>'{person_data,person_name}')      as nome,
           -- O CONTRATO manda; o objeto e so o resto. Foi a inversao disso que
           -- produziu centenas de "sem dia de vencimento" com o dado existindo.
           coalesce(ct.dia,     mutual_texto(o.payload->>'due_day'))  as dia,
           coalesce(ct.unidade, mutual_texto(o.payload->>'regional')) as unidade,
           mutual_texto(o.payload->>'first_activation_date')          as ativacao,
           nullif(o.payload->>'final_total_value','')::numeric        as vlr,
           o.payload->>'contract_id'                                  as contrato
      from mutual_captura o
      left join ct on ct.id_externo = o.payload->>'contract_id'
     where o.entidade = 'CONTRACT_OBJECT' and not o.deletado
  ),
  base as (select * from obj where st is not null),
  fat as (select * from base where st in ('ativo','em_evento','vistoria_pendente'))
  -- volume --------------------------------------------------------------------
  select 'VOLUME', 'Objetos capturados', count(*)::bigint,
         'Tudo que veio da API, inclusive funil de venda e deletados', 'OK'
    from mutual_captura where entidade = 'CONTRACT_OBJECT'
  union all
  select 'VOLUME', 'Contratos capturados (/contract/)', v_contratos,
         case when v_contratos = 0
              then 'PUXE OS CONTRATOS: o dia de vencimento e a unidade moram la, nao no objeto'
              else 'Fonte do dia de vencimento e da unidade' end,
         case when v_contratos = 0 then 'ATENCAO' else 'OK' end
  union all
  select 'VOLUME', 'Objetos que entrariam na base', count(*)::bigint,
         'Fora o funil de venda, que nasce no SCar', 'OK' from base
  union all
  select 'VOLUME', 'Entrariam FATURAVEIS (a carteira viva)', count(*)::bigint,
         'E sobre ESTES que os bloqueios abaixo sao contados', 'OK' from fat
  union all
  select 'VOLUME', 'Entrariam inativos/suspensos', count(*)::bigint,
         'Historico: entram na base mas nunca geram fatura', 'OK'
    from base where st not in ('ativo','em_evento','vistoria_pendente')
  union all
  select 'VOLUME', 'Descartados por serem funil de venda', count(*)::bigint,
         'CRIADO, AGUARDANDO_ACEITE, AUTORIZADO e afins', 'OK'
    from obj where st is null
  union all
  select 'VOLUME', 'Status que o de-para NAO reconhece', count(*)::bigint,
         'Vocabulario novo do Mutual — ver a lista e decidir; hoje NAO entram',
         case when count(*) = 0 then 'OK' else 'ATENCAO' end
    from mutual_status_nao_mapeados()
  -- bloqueios: SO sobre a carteira que vai faturar --------------------------
  union all
  select 'BLOQUEIO', 'Faturavel sem data de ativacao', count(*)::bigint,
         'O trigger carimbaria HOJE e contaminaria faturamento e tempo de casa',
         case when count(*) = 0 then 'OK' else 'CRITICO' end
    from fat where ativacao is null
  union all
  select 'BLOQUEIO', 'Faturavel sem valor cobrado (nulo ou zero)', count(*)::bigint,
         'Pararia de faturar EM SILENCIO; cortesia com zero voltaria a ser cobrada',
         case when count(*) = 0 then 'OK' else 'CRITICO' end
    from fat where vlr is null or vlr <= 0
  union all
  select 'BLOQUEIO', 'Faturavel sem dia de vencimento', count(*)::bigint,
         case when v_contratos = 0
              then 'Os contratos ainda NAO foram puxados — o dia mora neles. Puxe /contract/ antes de ler este numero'
              else 'Conferido no contrato E no objeto. Sem os dois, cairia no padrao legado (dia 10)' end,
         case when count(*) = 0 then 'OK'
              when v_contratos = 0 then 'ATENCAO' else 'CRITICO' end
    from fat where dia is null
  union all
  select 'BLOQUEIO', 'Faturavel sem placa', count(*)::bigint,
         'Quarentena: placa e not null unique',
         case when count(*) = 0 then 'OK' else 'CRITICO' end
    from fat where placa is null
  -- informativo: o mesmo, sobre o acervo inativo ----------------------------
  union all
  select 'ACERVO INATIVO', 'Sem valor cobrado', count(*)::bigint,
         'Esperado: contrato encerrado nao tem mensalidade. NAO e impedimento', 'OK'
    from base where st not in ('ativo','em_evento','vistoria_pendente')
     and (vlr is null or vlr <= 0)
  union all
  select 'ACERVO INATIVO', 'Sem unidade', count(*)::bigint,
         'A unidade tambem vale para o historico (regional_id atravessa a RLS de veiculos), mas nao bloqueia a carga',
         case when count(*) = 0 then 'OK' else 'ATENCAO' end
    from base where st not in ('ativo','em_evento','vistoria_pendente') and unidade is null
  union all
  select 'ACERVO INATIVO', 'Sem placa', count(*)::bigint,
         'Entra em quarentena mesmo assim: placa e not null unique',
         case when count(*) = 0 then 'OK' else 'ATENCAO' end
    from base where st not in ('ativo','em_evento','vistoria_pendente') and placa is null
  -- cadastro (vale para tudo que entra) --------------------------------------
  union all
  select 'CADASTRO', 'Sem CPF/CNPJ', count(*)::bigint,
         'Quarentena: cpf_cnpj e not null unique e nao aceita placeholder',
         case when count(*) = 0 then 'OK' else 'CRITICO' end
    from base where cpf is null
  union all
  select 'CADASTRO', 'CPF/CNPJ que REPROVA na validacao', count(*)::bigint,
         'chk_documento_valido recusaria a linha',
         case when count(*) = 0 then 'OK' else 'CRITICO' end
    from base
   where cpf is not null
     and not validar_documento(regexp_replace(cpf, '\D', '', 'g'),
                               (case when length(regexp_replace(cpf,'\D','','g')) > 11
                                     then 'PJ' else 'PF' end)::tipo_pessoa)
  union all
  select 'CADASTRO', 'Sem nome', count(*)::bigint, 'Quarentena',
         case when count(*) = 0 then 'OK' else 'CRITICO' end
    from base where nome is null
  union all
  select 'CADASTRO', 'Placa fora do padrao (minuscula/espaco)', count(*)::bigint,
         'Normalizar para CAIXA ALTA na carga, como manda a convencao do projeto',
         case when count(*) = 0 then 'OK' else 'ATENCAO' end
    from base where placa is not null and placa <> upper(placa)
  -- unicidade ----------------------------------------------------------------
  union all
  select 'UNICIDADE', 'Placas repetidas', count(*)::bigint,
         'Mesma placa em objetos diferentes (transferencia entre associados)',
         case when count(*) = 0 then 'OK' else 'ATENCAO' end
    from (select placa from base where placa is not null
           group by placa having count(*) > 1) x
  union all
  select 'UNICIDADE', 'Chassi repetido', count(*)::bigint, 'chassi e unique nulavel',
         case when count(*) = 0 then 'OK' else 'ATENCAO' end
    from (select chassi from base where chassi is not null
           group by chassi having count(*) > 1) x
  union all
  select 'UNICIDADE', 'Associados repetidos (mesmo CPF)', count(*)::bigint,
         'Viram UM cliente no SCar; a tabela de vinculo guarda os dois ids',
         case when count(*) = 0 then 'OK' else 'ATENCAO' end
    from (select cpf from base where cpf is not null
           group by cpf having count(*) > 1) x
  -- estrutura ----------------------------------------------------------------
  union all
  select 'ESTRUTURA', 'Contratos com 2+ veiculos', count(*)::bigint,
         'E o que decide como tratar o nivel `contract`, que o SCar nao tem',
         case when count(*) = 0 then 'OK' else 'ATENCAO' end
    from (select contrato from base where contrato is not null
           group by contrato having count(*) > 1) x
  union all
  select 'ESTRUTURA', 'Faturavel sem unidade (contrato e objeto)', count(*)::bigint,
         case when v_contratos = 0
              then 'Os contratos ainda NAO foram puxados — a unidade mora neles'
              else 'Sem unidade a carteira nasceria toda na matriz (regional_id atravessa RLS e os paineis)' end,
         case when count(*) = 0 then 'OK' else 'ATENCAO' end
    from fat where unidade is null
  union all
  select 'ESTRUTURA', 'Objeto sem contrato correspondente', count(*)::bigint,
         'O contract_id do objeto nao casou com nenhum /contract/ capturado',
         case when v_contratos = 0 or count(*) = 0 then 'OK' else 'ATENCAO' end
    from fat f
   where v_contratos > 0
     and not exists (select 1 from mutual_captura c
                      where c.entidade = 'CONTRACT' and c.id_externo = f.contrato)
  union all
  select 'ESTRUTURA', 'Faturavel em contrato NAO mensal', count(*)::bigint,
         'valor_mensalidade (0024) e MENSAL. Conferir em mutual_periodicidade se final_total_value e a parcela ou o total',
         case when count(*) = 0 then 'OK' else 'ATENCAO' end
    from fat f
    join mutual_captura c
      on c.entidade = 'CONTRACT' and c.id_externo = f.contrato and not c.deletado
   where coalesce(mutual_meses_periodo(c.payload->>'contract_period'), 1) > 1
  union all
  select 'ESTRUTURA', 'Registros marcados como deletados', count(*)::bigint,
         'Soft-delete do Mutual: nao importar, e inativar na sincronia',
         case when count(*) = 0 then 'OK' else 'ATENCAO' end
    from mutual_captura where deletado
  order by 1, 2;
end;
$$;

-- ----------------------------------------------------------------------------
-- A quarentena tambem passa a olhar o contrato antes de acusar falta
-- ----------------------------------------------------------------------------
create or replace function mutual_quarentena(
  p_limite             integer default 200,
  p_somente_faturaveis boolean default true
)
returns table (
  id_externo text,
  placa      text,
  associado  text,
  cpf_cnpj   text,
  situacao   text,
  motivos    text[]
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
    select c.id_externo, mutual_texto(c.payload->>'due_day') as dia
      from mutual_captura c
     where c.entidade = 'CONTRACT' and not c.deletado
  ),
  base as (
    select o.id_externo,
           mutual_status_veiculo(o.payload->>'contract_status', o.payload->>'status') as st,
           mutual_texto(o.payload#>>'{vehicle_data,vehicle_plate}')  as placa,
           mutual_texto(o.payload#>>'{person_data,person_name}')     as nome,
           mutual_texto(o.payload#>>'{person_data,person_cpf_cnpj}') as cpf,
           o.payload->>'contract_status'                             as sit,
           coalesce(ct.dia, mutual_texto(o.payload->>'due_day'))     as dia,
           mutual_texto(o.payload->>'first_activation_date')         as ativacao,
           nullif(o.payload->>'final_total_value','')::numeric       as valor
      from mutual_captura o
      left join ct on ct.id_externo = o.payload->>'contract_id'
     where o.entidade = 'CONTRACT_OBJECT' and not o.deletado
  ),
  alvo as (
    select * from base
     where st is not null
       and (not p_somente_faturaveis or st in ('ativo','em_evento','vistoria_pendente'))
  )
  select a.id_externo, a.placa, a.nome, a.cpf, a.sit,
         array_remove(array[
           case when a.placa is null then 'SEM_PLACA' end,
           case when a.cpf is null   then 'SEM_CPF' end,
           case when a.nome is null  then 'SEM_NOME' end,
           case when a.st in ('ativo','em_evento','vistoria_pendente')
                 and a.ativacao is null then 'SEM_DATA_ATIVACAO' end,
           case when a.st in ('ativo','em_evento','vistoria_pendente')
                 and (a.valor is null or a.valor <= 0) then 'SEM_VALOR_COBRADO' end,
           case when a.st in ('ativo','em_evento','vistoria_pendente')
                 and a.dia is null then 'SEM_DIA_VENCIMENTO' end
         ], null) as motivos
    from alvo a
   where a.placa is null or a.cpf is null or a.nome is null
      or (a.st in ('ativo','em_evento','vistoria_pendente')
          and (a.ativacao is null or a.valor is null or a.valor <= 0 or a.dia is null))
   order by 1
   limit greatest(coalesce(p_limite, 200), 1);
end;
$$;

-- Rito de seguranca (0052).
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
