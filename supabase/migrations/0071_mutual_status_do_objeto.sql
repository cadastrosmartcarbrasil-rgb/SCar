-- ============================================================================
-- SCar :: 0071_mutual_status_do_objeto.sql
-- CORRETIVA — duas leituras erradas que inflavam a quarentena.
--
-- (1) O STATUS QUE MANDAVA ERA O DO ASSOCIADO, NAO O DO VEICULO.
--     `mutual_status_veiculo` lia `contract_status` e so olhava o `status` do
--     objeto para o caso `REMOVIDO`. Mas o contrato do Mutual guarda VARIOS
--     veiculos: o associado fica ATIVO porque tem OUTRO carro, enquanto AQUELE
--     veiculo esta inativo. Lendo o contrato, o veiculo morto entrava como vivo
--     — e ia para os bloqueios de faturamento cobrando valor, dia de vencimento
--     e data de ativacao que um veiculo encerrado nao tem por que ter.
--
--     ⚠️ MAS O OBJETO NAO PODE RESSUSCITAR NADA. Contrato CANCELADO com objeto
--     "ATIVO" e um veiculo sem cobertura, nao um veiculo ativo. Entao a regra
--     NAO e "o objeto vence": e **vence o MENOS VIVO dos dois**. O objeto so
--     consegue puxar para baixo.
--
-- (2) VEICULO SEM PLACA NAO E DADO SUJO — E VEICULO 0 KM.
--     Sao carros novos cuja placa ainda nao foi instalada. Misturar isso com
--     "sem CPF" e "sem nome" (dado que a origem perdeu) esconde os dois: o
--     0 km vira alarme falso e o problema real fica no meio da lista.
--     Agora: sem placa mas COM CHASSI = 0 km identificavel, fila operacional
--     (o SAC cobra a placa; o plano do usuario e exigir em 30 dias por
--     WhatsApp/e-mail). Sem placa E SEM CHASSI = ai sim nao ha o que importar.
--
--     A carga ainda precisa de decisao: `veiculos.placa` e **not null unique**
--     (0001). O 0 km so entra quando essa coluna aceitar a espera — o CHASSI e
--     a identidade natural dele enquanto a placa nao vem.
--
-- (3) `mutual_status_nao_mapeados` passa a olhar TAMBEM o status do objeto:
--     agora ele decide carga, entao vocabulario novo la e veiculo classificado
--     errado — em silencio.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (A) O vocabulario, num lugar so
-- ----------------------------------------------------------------------------

/** UMA palavra de status do Mutual -> status do SCar. Null = nao reconhecida. */
create or replace function mutual_status_de_texto(p_status text)
returns status_veiculo
language sql immutable
as $$
  select case upper(coalesce(trim(p_status), ''))
    when 'ATIVO' then 'ativo'
    -- Inadimplencia no SCar e DERIVADA dos titulos em aberto
    -- (`dias_atraso_cliente`), nao um status de cadastro.
    when 'INADIMPLENTE' then 'ativo'
    when 'SUSPENSO' then 'suspenso'
    when 'PENDENTE_VISTORIA' then 'vistoria_pendente'
    -- Sinistro EM ANDAMENTO: o associado segue na casa e segue pagando.
    when 'SINISTRADO' then 'em_evento'
    when 'INATIVO' then 'inativo'
    when 'CANCELADO' then 'inativo'
    when 'CANCELADO_PENDENCIA' then 'inativo'
    when 'CANCELADO_TROCA_TITULARIDADE' then 'inativo'
    when 'NEGADO' then 'inativo'
    when 'RECUSADO' then 'inativo'
    when 'EXPIRADO' then 'inativo'
    when 'SUBSTITUIDO' then 'inativo'
    when 'REMOVIDO' then 'inativo'
    when 'AGUARDADO A RETIRADA DO RASTREADOR' then 'inativo'
    when 'INATIVO/PAGO' then 'inativo'
    -- Decisao do usuario (0066): indenizado nao gera mensalidade.
    when 'INDENIZADO' then 'inativo'
    when 'INDENIZACAO' then 'inativo'
    when 'INDENIZAÇAO' then 'inativo'
    when 'INDENIZAÇÃO' then 'inativo'
    else null
  end::status_veiculo;
$$;

/** Vocabulario do FUNIL DE VENDA: venda nova nasce no SCar, nao se importa. */
create or replace function mutual_e_funil_venda(p_status text)
returns boolean
language sql immutable
as $$
  select upper(coalesce(trim(p_status), '')) in (
    'CRIADO','GERADO_PENDENCIA','AGUARDANDO_ACEITE','PENDENTE_ANALISE','AUTORIZADO',
    'LINK_PAGAMENTO_ENVIADO','PAGAMENTO_GERADO','PENDENTE','NEGOCIACAO_PERDIDA','REATIVACAO'
  );
$$;

/**
 * Quao VIVO e um status. Maior = mais vivo.
 * E esta escala que decide a disputa contrato x objeto: vence o menor.
 */
create or replace function mutual_vitalidade(p_status status_veiculo)
returns integer
language sql immutable
as $$
  select case p_status
    when 'ativo'             then 4
    when 'em_evento'         then 3
    when 'vistoria_pendente' then 2
    when 'suspenso'          then 1
    when 'inativo'           then 0
    else 0
  end;
$$;

/**
 * O status do VEICULO, e nao o do associado.
 *
 * O contrato do Mutual guarda varios veiculos; o `contract_status` fala do
 * ASSOCIADO. Quando o objeto declara o proprio status, e ele que descreve
 * AQUELE carro — mas so para PIORAR: contrato cancelado com objeto "ativo"
 * continua sendo um veiculo sem cobertura.
 *
 * A ASSIMETRIA E DE PROPOSITO:
 *   . desconhecido no CONTRATO -> null (nao importar). Continua valendo a trava
 *     da 0063: vocabulario novo e DECISAO PENDENTE, e deixar o objeto resgatar
 *     a linha faria o veiculo entrar com classificacao adivinhada, em silencio
 *     — exatamente o que `mutual_status_nao_mapeados()` existe para impedir.
 *   . desconhecido no OBJETO -> sem opiniao, o contrato manda. O status do
 *     objeto e um REFINAMENTO (so estreita); refinamento ilegivel e nenhum.
 *
 * Regra final:
 *   . funil de venda no CONTRATO -> null (decisao ja tomada: nasce no SCar)
 *   . contrato nao reconhecido   -> null (decisao pendente)
 *   . objeto nao reconhecido     -> o do contrato
 *   . os dois reconhecidos       -> o MENOS VIVO
 */
create or replace function mutual_status_veiculo(
  p_contract_status text,
  p_object_status   text default null
)
returns status_veiculo
language sql immutable
as $$
  select case
    when mutual_e_funil_venda(p_contract_status) then null
    when mutual_status_de_texto(p_contract_status) is null then null
    when mutual_status_de_texto(p_object_status) is null
      then mutual_status_de_texto(p_contract_status)
    when mutual_vitalidade(mutual_status_de_texto(p_object_status))
       < mutual_vitalidade(mutual_status_de_texto(p_contract_status))
      then mutual_status_de_texto(p_object_status)
    else mutual_status_de_texto(p_contract_status)
  end::status_veiculo;
$$;

comment on function mutual_status_veiculo(text,text) is
  'Status do VEICULO. O contract_status fala do ASSOCIADO (um contrato tem varios '
  'veiculos); o status do objeto fala daquele carro e vence quando for MENOS VIVO. '
  'Funil de venda no contrato descarta a linha.';

-- ----------------------------------------------------------------------------
-- (B) O instrumento: quanto muda por causa do objeto
--
-- O projeto ja pagou duas rodadas por supor (o dia de vencimento e a unidade).
-- Aqui a mudanca e de LEITURA, entao ela tem de ser mensuravel ANTES da carga:
-- o cruzamento mostra, com os dados reais, quantos veiculos trocam de
-- classificacao — e quais.
-- ----------------------------------------------------------------------------
create or replace function mutual_status_cruzado()
returns table (
  contract_status text,
  object_status   text,
  status_scar     text,
  status_pelo_contrato text,
  mudou           boolean,
  quantidade      bigint
)
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then
    raise exception 'Somente a equipe pode ler o diagnostico da integracao';
  end if;
  return query
  select c.payload->>'contract_status',
         coalesce(mutual_texto(c.payload->>'status'), '(objeto sem status)'),
         coalesce(mutual_status_veiculo(c.payload->>'contract_status',
                                        c.payload->>'status')::text,
                  '(nao importar)'),
         coalesce(case when mutual_e_funil_venda(c.payload->>'contract_status')
                       then null
                       else mutual_status_de_texto(c.payload->>'contract_status') end::text,
                  '(nao importar)'),
         mutual_status_veiculo(c.payload->>'contract_status', c.payload->>'status')
           is distinct from
         (case when mutual_e_funil_venda(c.payload->>'contract_status') then null
               else mutual_status_de_texto(c.payload->>'contract_status') end),
         count(*)::bigint
    from mutual_captura c
   where c.entidade = 'CONTRACT_OBJECT' and not c.deletado
   group by 1, 2, 3, 4, 5
   order by 5 desc, 6 desc;
end;
$$;

-- ----------------------------------------------------------------------------
-- (C) Vocabulario desconhecido: agora tambem o do OBJETO
-- ----------------------------------------------------------------------------
-- Ganha a coluna `origem`, entao muda a lista de OUT: `create or replace`
-- recusaria ("cannot change return type"). Gotcha ja documentado no projeto.
drop function if exists mutual_status_nao_mapeados();
create function mutual_status_nao_mapeados()
returns table (origem text, status text, quantidade bigint)
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then
    raise exception 'Somente a equipe pode ler o diagnostico da integracao';
  end if;
  return query
  select 'CONTRATO', c.payload->>'contract_status', count(*)::bigint
    from mutual_captura c
   where c.entidade = 'CONTRACT_OBJECT' and not c.deletado
     and mutual_texto(c.payload->>'contract_status') is not null
     and mutual_status_de_texto(c.payload->>'contract_status') is null
     and not mutual_e_funil_venda(c.payload->>'contract_status')
   group by 1, 2
  union all
  -- O status do objeto passou a DECIDIR carga (0071): vocabulario novo aqui e
  -- veiculo classificado errado, em silencio.
  select 'OBJETO', c.payload->>'status', count(*)::bigint
    from mutual_captura c
   where c.entidade = 'CONTRACT_OBJECT' and not c.deletado
     and mutual_texto(c.payload->>'status') is not null
     and mutual_status_de_texto(c.payload->>'status') is null
     and not mutual_e_funil_venda(c.payload->>'status')
   group by 1, 2
   order by 3 desc;
end;
$$;

-- ----------------------------------------------------------------------------
-- (D) O diagnostico: a placa deixa de ser "dado sujo"
--
-- O que muda em relacao a 0064: os dois indicadores "sem placa" viram TRES, e
-- separam o que e fila operacional do que e impedimento de verdade.
-- O resto e identico — a correcao do status (A) ja atravessa tudo sozinha,
-- porque `st` sai de `mutual_status_veiculo`.
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
    -- 0071: o status do OBJETO entra na conta. O contrato fala do ASSOCIADO,
    -- que pode estar ativo por causa de OUTRO veiculo.
    select mutual_status_veiculo(o.payload->>'contract_status', o.payload->>'status') as st,
           mutual_texto(o.payload#>>'{vehicle_data,vehicle_plate}')   as placa,
           mutual_texto(o.payload#>>'{vehicle_data,vehicle_chassi}')  as chassi,
           mutual_texto(o.payload#>>'{person_data,person_cpf_cnpj}')  as cpf,
           mutual_texto(o.payload#>>'{person_data,person_name}')      as nome,
           -- O CONTRATO manda no dia e na unidade; o objeto e so o resto.
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
  select 'VOLUME', 'Inativados pelo STATUS DO PROPRIO VEICULO', count(*)::bigint,
         'O associado segue ativo (tem outro carro), mas ESTE veiculo nao. Antes da 0071 entravam como faturaveis',
         'OK'
    from mutual_captura c
   where c.entidade = 'CONTRACT_OBJECT' and not c.deletado
     and mutual_status_veiculo(c.payload->>'contract_status', c.payload->>'status')
         is distinct from
         (case when mutual_e_funil_venda(c.payload->>'contract_status') then null
               else mutual_status_de_texto(c.payload->>'contract_status') end)
  union all
  select 'VOLUME', 'Descartados por serem funil de venda', count(*)::bigint,
         'CRIADO, AGUARDANDO_ACEITE, AUTORIZADO e afins', 'OK'
    from obj where st is null
  union all
  select 'VOLUME', 'Status que o de-para NAO reconhece', count(*)::bigint,
         'Vocabulario novo do Mutual (contrato OU objeto) — ver a lista e decidir; hoje NAO entram',
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
  -- 0071: sem placa E sem chassi e o unico caso realmente sem saida.
  select 'BLOQUEIO', 'Faturavel sem placa E sem chassi', count(*)::bigint,
         'Nao ha como identificar o veiculo: nem a placa, nem a identidade que sobra no 0 km',
         case when count(*) = 0 then 'OK' else 'CRITICO' end
    from fat where placa is null and chassi is null
  -- 0 km: fila operacional, nao dado sujo -------------------------------------
  union all
  select 'PLACA PENDENTE (0 KM)', 'Faturavel sem placa, COM chassi', count(*)::bigint,
         'Carro novo esperando emplacamento. Nao e dado sujo: e fila de cobranca da placa (SAC / aviso em 30 dias). '
         'A CARGA ainda depende de decisao: veiculos.placa e not null unique',
         case when count(*) = 0 then 'OK' else 'ATENCAO' end
    from fat where placa is null and chassi is not null
  union all
  select 'PLACA PENDENTE (0 KM)', 'Inativo sem placa, COM chassi', count(*)::bigint,
         'Mesmo caso, no acervo encerrado: nao gera cobranca de placa nenhuma', 'OK'
    from base where st not in ('ativo','em_evento','vistoria_pendente')
     and placa is null and chassi is not null
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
  select 'ACERVO INATIVO', 'Sem placa E sem chassi', count(*)::bigint,
         'Sem identidade nenhuma: nao ha o que importar deste historico',
         case when count(*) = 0 then 'OK' else 'ATENCAO' end
    from base where st not in ('ativo','em_evento','vistoria_pendente')
     and placa is null and chassi is null
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
         'E o que decide como tratar o nivel `contract`, que o SCar nao tem — e por que o status do OBJETO manda',
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
-- (E) A quarentena para de acusar o 0 km
--
-- Muda a assinatura (entra `p_incluir_placa_pendente`), entao e drop + create.
-- O padrao e FALSE: o 0 km sai da lista de problemas e vira fila propria, que
-- e o que faz a quarentena encolher para o que realmente precisa de correcao.
-- ----------------------------------------------------------------------------
drop function if exists mutual_quarentena(integer, boolean);
create function mutual_quarentena(
  p_limite                 integer default 200,
  p_somente_faturaveis     boolean default true,
  p_incluir_placa_pendente boolean default false
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
           mutual_texto(o.payload#>>'{vehicle_data,vehicle_chassi}') as chassi,
           mutual_texto(o.payload#>>'{person_data,person_name}')     as nome,
           mutual_texto(o.payload#>>'{person_data,person_cpf_cnpj}') as cpf,
           -- A situacao mostrada e a do VEICULO; o status do contrato entra
           -- entre parenteses so quando difere, para a tela explicar por que
           -- um associado "ativo" tem veiculo inativo.
           coalesce(mutual_texto(o.payload->>'status'),
                    o.payload->>'contract_status')                   as sit_obj,
           o.payload->>'contract_status'                             as sit_contrato,
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
  ),
  marcado as (
    select a.*,
           array_remove(array[
             -- 0 km: identificavel pelo chassi, e fila operacional
             case when a.placa is null and a.chassi is not null
                  then 'PLACA_PENDENTE_0KM' end,
             case when a.placa is null and a.chassi is null
                  then 'SEM_PLACA_NEM_CHASSI' end,
             case when a.cpf is null  then 'SEM_CPF' end,
             case when a.nome is null then 'SEM_NOME' end,
             case when a.st in ('ativo','em_evento','vistoria_pendente')
                   and a.ativacao is null then 'SEM_DATA_ATIVACAO' end,
             case when a.st in ('ativo','em_evento','vistoria_pendente')
                   and (a.valor is null or a.valor <= 0) then 'SEM_VALOR_COBRADO' end,
             case when a.st in ('ativo','em_evento','vistoria_pendente')
                   and a.dia is null then 'SEM_DIA_VENCIMENTO' end
           ], null) as motivos
      from alvo a
  )
  select m.id_externo, m.placa, m.nome, m.cpf,
         case when m.sit_obj is distinct from m.sit_contrato
              then m.sit_obj || ' (associado: ' || coalesce(m.sit_contrato, '-') || ')'
              else m.sit_obj end,
         m.motivos
    from marcado m
   where cardinality(m.motivos) > 0
     and (p_incluir_placa_pendente
          or m.motivos <> array['PLACA_PENDENTE_0KM'])
   order by 1
   limit greatest(coalesce(p_limite, 200), 1);
end;
$$;

-- Rito de seguranca (0052).
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
