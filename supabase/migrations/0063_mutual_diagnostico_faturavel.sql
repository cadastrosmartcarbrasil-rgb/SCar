-- ============================================================================
-- SCar :: 0063_mutual_diagnostico_faturavel.sql
-- CORRETIVA da 0062, a partir da PRIMEIRA LEITURA DA BASE REAL (09/09/2026).
--
-- O que a amostra de 2.500 objetos (de 17.610) mostrou:
--   . 2.438 INATIVO x 35 ATIVO — a API devolve os mais antigos primeiro, entao
--     os bloqueios estavam sendo contados quase todos sobre contrato ENCERRADO;
--   . `due_day` veio vazio em 2.497 de 2.497 e `regional` em 100% dos objetos:
--     os dois campos vivem no CONTRATO, nao no objeto do contrato;
--   . apareceu `AGUARDADO A RETIRADA DO RASTREADOR`, que NAO existe no enum do
--     swagger — o vocabulario deles nao e exaustivo.
--
-- O ERRO DE LEITURA que isto conserta: "sem valor cobrado" num contrato INATIVO
-- nao e impedimento nenhum. Veiculo inativo nao passa em `veiculo_faturavel`
-- (0024), nunca gera fatura e nunca vira boleto. Contar esses 2.432 como
-- CRITICO afogava o numero que importa — quantos dos veiculos que entrariam
-- FATURAVEIS estao sem valor. O diagnostico passa a separar as duas contas.
-- ============================================================================

-- (A) `/contract/` vira entidade capturavel (due_day e regional_id moram la).
alter table mutual_captura drop constraint if exists chk_mutual_entidade;
alter table mutual_captura add constraint chk_mutual_entidade check (entidade in (
  'CONTRACT_OBJECT','CONTRACT','PERSON','ADDRESS','INVOICE','EVENT','REGIONAL','CONSULTANT',
  'VEHICLE_TYPE','VEHICLE_COLOR','VEHICLE_CATEGORY','VEHICLE_USE_TYPE','EVENT_TYPE'
));

-- (B) O status visto na base real e ausente do enum do swagger.
create or replace function mutual_status_veiculo(
  p_contract_status text,
  p_object_status   text default null
)
returns status_veiculo
language sql immutable
as $$
  select case
    when upper(coalesce(p_object_status, '')) = 'REMOVIDO' then 'inativo'
    when upper(coalesce(p_contract_status, '')) in ('ATIVO','INADIMPLENTE') then 'ativo'
    when upper(coalesce(p_contract_status, '')) = 'SUSPENSO' then 'suspenso'
    when upper(coalesce(p_contract_status, '')) = 'PENDENTE_VISTORIA' then 'vistoria_pendente'
    when upper(coalesce(p_contract_status, '')) in ('SINISTRADO','INDENIZADO') then 'em_evento'
    when upper(coalesce(p_contract_status, '')) in (
      'INATIVO','CANCELADO','CANCELADO_PENDENCIA','CANCELADO_TROCA_TITULARIDADE',
      'NEGADO','RECUSADO','EXPIRADO','SUBSTITUIDO','REMOVIDO',
      -- Visto em producao, fora do enum do swagger: contrato encerrando com
      -- equipamento a recolher.
      'AGUARDADO A RETIRADA DO RASTREADOR'
    ) then 'inativo'
    else null   -- funil de venda OU vocabulario que ainda nao conhecemos
  end::status_veiculo;
$$;

-- (C) O que o vocabulario deles tem e o nosso de-para ainda nao cobre.
--     Sem isto, status desconhecido some silenciosamente como "funil de venda".
create or replace function mutual_status_nao_mapeados()
returns table (
  contract_status text,
  quantidade      bigint,
  exemplo_placa   text
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
  select c.payload->>'contract_status',
         count(*)::bigint,
         min(mutual_texto(c.payload#>>'{vehicle_data,vehicle_plate}'))
    from mutual_captura c
   where c.entidade = 'CONTRACT_OBJECT'
     and not c.deletado
     and mutual_status_veiculo(c.payload->>'contract_status', c.payload->>'status') is null
     -- os do funil de venda sao conhecidos e nao entram por decisao
     and upper(coalesce(c.payload->>'contract_status','')) not in (
       'CRIADO','GERADO_PENDENCIA','AGUARDANDO_ACEITE','PENDENTE_ANALISE','AUTORIZADO',
       'LINK_PAGAMENTO_ENVIADO','PAGAMENTO_GERADO','PENDENTE','NEGOCIACAO_PERDIDA','REATIVACAO'
     )
   group by 1
   order by 2 desc;
end;
$$;

comment on function mutual_status_nao_mapeados() is
  'Status do Mutual que o de-para nao reconhece. O enum do swagger NAO e exaustivo (AGUARDADO A RETIRADA DO RASTREADOR apareceu so na base real).';

-- (D) O diagnostico, com a conta certa.
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
begin
  if not is_staff() then
    raise exception 'Somente a equipe pode ler o diagnostico da integracao';
  end if;

  return query
  with obj as (
    select mutual_status_veiculo(c.payload->>'contract_status', c.payload->>'status') as st,
           mutual_texto(c.payload#>>'{vehicle_data,vehicle_plate}')   as placa,
           mutual_texto(c.payload#>>'{vehicle_data,vehicle_chassi}')  as chassi,
           mutual_texto(c.payload#>>'{person_data,person_cpf_cnpj}')  as cpf,
           mutual_texto(c.payload#>>'{person_data,person_name}')      as nome,
           mutual_texto(c.payload->>'due_day')                        as dia,
           mutual_texto(c.payload->>'first_activation_date')          as ativacao,
           nullif(c.payload->>'final_total_value','')::numeric        as vlr,
           c.payload->>'contract_id'                                  as contrato
      from mutual_captura c
     where c.entidade = 'CONTRACT_OBJECT' and not c.deletado
  ),
  base as (select * from obj where st is not null),
  -- A CONTA QUE IMPORTA: veiculo que vai NASCER FATURAVEL. Os mesmos tres
  -- status de `veiculo_faturavel` (0024). Inativo/suspenso/baixado nao geram
  -- mensalidade, entao valor e dia de vencimento ali sao irrelevantes.
  fat as (select * from base where st in ('ativo','em_evento','vistoria_pendente'))
  -- volume --------------------------------------------------------------------
  select 'VOLUME', 'Objetos capturados', count(*)::bigint,
         'Tudo que veio da API, inclusive funil de venda e deletados', 'OK'
    from mutual_captura where entidade = 'CONTRACT_OBJECT'
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
         'Cairia no padrao legado (dia 10 do mes seguinte). Conferir /contract/ antes de concluir',
         case when count(*) = 0 then 'OK' else 'ATENCAO' end
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
  select 'ESTRUTURA', 'Objetos SEM unidade declarada', count(*)::bigint,
         'Se for tudo, a unidade vem do CONTRATO — puxe /contract/ e confira',
         case when count(*) = 0 then 'OK' else 'ATENCAO' end
    from mutual_captura c
   where c.entidade = 'CONTRACT_OBJECT' and not c.deletado
     and mutual_texto(c.payload->>'regional') is null
  union all
  select 'ESTRUTURA', 'Registros marcados como deletados', count(*)::bigint,
         'Soft-delete do Mutual: nao importar, e inativar na sincronia',
         case when count(*) = 0 then 'OK' else 'ATENCAO' end
    from mutual_captura where deletado
  order by 1, 2;
end;
$$;

-- (E) A quarentena passa a olhar, por padrao, so a carteira que vai faturar.
drop function if exists mutual_quarentena(integer);
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
  with base as (
    select c.id_externo,
           mutual_status_veiculo(c.payload->>'contract_status', c.payload->>'status') as st,
           mutual_texto(c.payload#>>'{vehicle_data,vehicle_plate}')  as placa,
           mutual_texto(c.payload#>>'{person_data,person_name}')     as nome,
           mutual_texto(c.payload#>>'{person_data,person_cpf_cnpj}') as cpf,
           c.payload->>'contract_status'                             as sit,
           mutual_texto(c.payload->>'due_day')                       as dia,
           mutual_texto(c.payload->>'first_activation_date')         as ativacao,
           nullif(c.payload->>'final_total_value','')::numeric       as valor
      from mutual_captura c
     where c.entidade = 'CONTRACT_OBJECT' and not c.deletado
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
           -- Valor, dia e ativacao so sao impedimento para quem vai FATURAR.
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
