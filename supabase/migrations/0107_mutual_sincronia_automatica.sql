-- =====================================================================
-- 0107_mutual_sincronia_automatica
-- =====================================================================
-- A ROTINA AUTOMATICA da convivencia com o Mutual (pedido do usuario,
-- 14/10/2026). O defeito: a placa LVA7H55, vendida no Mutual em 25/09, nao
-- existia no SCar — CONTRACT e PERSON tinham sido capturados em 09/09, e 161
-- veiculos ativos vendidos depois disso ficaram fora da carga (sem contrato
-- nao ha unidade; sem associado nao ha cadastro).
--
-- A correcao e uma rotina, nao um clique: o crontab do VPS chama
-- /api/v1/mutual/sincronizar (header x-cron-secret), que recaptura e roda a
-- carga de cada unidade. Ela roda SEM SESSAO (service_role), e as tres
-- funcoes abaixo recusavam isso (`tem_acesso_global()`/`is_staff()` sao falsos
-- sem login).
--
-- O UNICO ajuste e a trava: `tem_acesso_global() or auth.uid() is null` —
-- o padrao da 0052 (hotlink, webhook, baixa bancaria). O `anon` continua sem
-- `execute` (rito abaixo), entao o caminho sem sessao so existe para o
-- servidor. Os corpos sao os da 0096 e da 0094 (captura, linhas da carga e
-- carga), conferidos IDENTICOS aos de producao (md5) em 14/10/2026. Nada mais muda.
-- =====================================================================

-- (A) a captura (corpo da 0096)
create or replace function mutual_registrar_captura(p_entidade text, p_registros jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 0107: o AGENDADOR do VPS roda sem sessao (service_role) — o mesmo caminho
  -- publico da 0052. O `anon` nao chega aqui: nao tem execute.
  if not (tem_acesso_global() or auth.uid() is null) then
    raise exception 'Somente a matriz (admin/financeiro) pode puxar dados do Mutual';
  end if;
  if jsonb_typeof(p_registros) <> 'array' then
    raise exception 'p_registros precisa ser um array json';
  end if;

  insert into mutual_captura (entidade, id_externo, uuid_externo, payload, deletado, capturado_por)
  select p_entidade,
         coalesce(r->>'id', r->>'uuid', md5(r::text)),
         case when r->>'uuid' ~ '^[0-9a-fA-F-]{36}$' then (r->>'uuid')::uuid end,
         r,
         coalesce((r->>'deleted')::boolean, false),
         auth.uid()
    from jsonb_array_elements(p_registros) r
  on conflict (entidade, id_externo) do update
    set payload      = excluded.payload,
        -- COALESCE de proposito (0062): uma recaptura com payload parcial (ou de
        -- um endpoint que nao devolve `uuid`) NAO pode apagar a chave externa
        -- estavel que ja tinhamos. O payload e substituido; a identidade, nao.
        uuid_externo = coalesce(excluded.uuid_externo, mutual_captura.uuid_externo),
        deletado     = excluded.deletado,
        capturado_em = now(),
        capturado_por = excluded.capturado_por
    -- 0096: linha identica NAO e regravada. `is distinct from` porque o jsonb
    -- compara por valor (ordem de chave e espaco nao contam) e trata nulo.
    where mutual_captura.payload  is distinct from excluded.payload
       or mutual_captura.deletado is distinct from excluded.deletado
       or (excluded.uuid_externo is not null
           and mutual_captura.uuid_externo is distinct from excluded.uuid_externo);

  -- Quantos a chamada RECEBEU (ver (A) no cabecalho), nao quantos regravou.
  return jsonb_array_length(p_registros);
end;
$$;

-- (B) a leitura da carga (corpo da 0094)
create or replace function mutual_carga_linhas(
  p_regional_id       uuid,
  p_incluir_inativos  boolean default false,
  p_somente_problemas boolean default false,
  p_limite            integer default null
)
returns table (
  id_objeto          text,
  id_pessoa          text,
  acao               text,
  problema           text,
  status             status_veiculo,
  placa              text,
  chassi             text,
  renavam            text,
  marca              text,
  modelo             text,
  ano_fabricacao     smallint,
  ano_modelo         smallint,
  cor_id             uuid,
  cor                text,
  uso                uso_veiculo,
  valor_fipe         numeric,
  codigo_fipe        text,
  valor_mensalidade  numeric,
  dia_vencimento     smallint,
  data_ativacao      date,
  ativacao_estimada  boolean,
  tipo_veiculo_id    uuid,
  plano_id           uuid,
  nome               text,
  cpf_cnpj           text,
  tipo_pessoa        tipo_pessoa,
  email              text,
  telefone           text,
  data_nascimento    date,
  nome_mae           text,
  endereco           jsonb,
  cliente_id         uuid,
  veiculo_id         uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- 0107: a leitura da carga roda tambem no agendador (sem sessao).
  if not (is_staff() or auth.uid() is null) then
    raise exception 'Somente a equipe pode ler a previa da carga';
  end if;

  if p_regional_id is null then
    -- Aqui `null` significaria MATRIZ (0067/0069), nao "todas".
    raise exception 'A carga e POR UNIDADE: informe a regional';
  end if;

  return query
  with ct as (
    select c.id_externo, c.payload from mutual_captura c
     where c.entidade = 'CONTRACT' and not c.deletado
  ),
  pe as (
    select p.id_externo, p.payload from mutual_captura p
     where p.entidade = 'PERSON' and not p.deletado
  ),
  ad as (
    select a.id_externo, a.payload from mutual_captura a
     where a.entidade = 'ADDRESS' and not a.deletado
  ),
  -- O universo: objetos da unidade pedida, com status que entra na base.
  bruto as (
    select o.id_externo                                                as id_objeto,
           -- O desempate da duplicata e "o mais recente NO MUTUAL", entao
           -- vale o `updated_at` do payload; `capturado_em` e so a reserva.
           coalesce(mutual_texto(o.payload->>'updated_at')::timestamptz,
                    o.capturado_em)                                     as updated_at,
           mutual_texto(o.payload#>>'{person_data,person_id}')          as id_pessoa,
           mutual_status_veiculo(o.payload->>'contract_status',
                                 o.payload->>'status')                  as st,
           mutual_placa(o.payload#>>'{vehicle_data,vehicle_plate}')     as placa,
           mutual_chassi(o.payload#>>'{vehicle_data,vehicle_chassi}')   as chassi,
           mutual_renavam(o.payload#>>'{vehicle_data,vehicle_renavam}') as renavam,
           upper(mutual_texto(o.payload#>>'{vehicle_data,vehicle_assembler}')) as marca,
           upper(mutual_texto(o.payload#>>'{vehicle_data,vehicle_model}'))     as modelo,
           mutual_ano(o.payload#>>'{vehicle_data,vehicle_fabrication_year}')   as ano_fab,
           mutual_ano(o.payload#>>'{vehicle_data,vehicle_model_year}')         as ano_mod,
           mutual_cor_do_externo(o.payload#>>'{vehicle_data,vehicle_color}')   as cor_id,
           mutual_uso_veiculo(o.payload#>>'{vehicle_data,vehicle_use_type}')   as uso,
           nullif(o.payload#>>'{vehicle_data,vehicle_price}','')::numeric      as fipe,
           mutual_texto(o.payload#>>'{vehicle_data,vehicle_cod_fipe}')         as cod_fipe,
           -- 0065: `final_total_value` e a PARCELA MENSAL, nao o total.
           -- Zero/vazio vira NULL de proposito — ver a decisao (6).
           nullif(nullif(o.payload->>'final_total_value','')::numeric, 0)      as valor,
           coalesce(mutual_texto(ct.payload->>'due_day'),
                    mutual_texto(o.payload->>'due_day'))                       as dia_txt,
           -- (3) A escada da ativacao. NUNCA "hoje".
           coalesce(mutual_data(o.payload->>'first_activation_date'),
                    mutual_data(ct.payload->>'created_at'),
                    mutual_data(o.payload->>'created_at'))                     as ativacao,
           mutual_data(o.payload->>'first_activation_date') is null            as ativ_estimada,
           mutual_tipo_veiculo_do_objeto(o.payload#>>'{vehicle_data,vehicle_category}',
                                         o.payload#>>'{vehicle_data,vehicle_type}') as tipo_id,
           mutual_plano_do_externo(o.payload->>'plan_id')                      as plano,
           upper(mutual_texto(coalesce(pe.payload->>'name',
                              o.payload#>>'{person_data,person_name}')))       as nome,
           regexp_replace(coalesce(mutual_texto(coalesce(
              pe.payload->>'cpf_cnpj',
              o.payload#>>'{person_data,person_cpf_cnpj}')), ''), '\D','','g') as cpf,
           mutual_tipo_pessoa(pe.payload->>'person_type')                      as tp_declarado,
           lower(mutual_texto(pe.payload->>'email'))                           as email,
           mutual_texto(pe.payload->>'phone')                                  as telefone,
           mutual_data(pe.payload->>'birthdate')                               as nascimento,
           upper(mutual_texto(pe.payload->>'mother_name'))                     as nome_mae,
           ad.payload                                                          as endereco_bruto,
           registro_do_externo('CONTRACT_OBJECT', o.id_externo, 'MUTUAL')       as vinc_veiculo
      from mutual_captura o
      left join ct on ct.id_externo = o.payload->>'contract_id'
      left join pe on pe.id_externo = o.payload #>> '{person_data,person_id}'
      left join ad on ad.id_externo = pe.payload ->> 'address_id'
     where o.entidade = 'CONTRACT_OBJECT' and not o.deletado
       -- 0094: o recorte da unidade em CONJUNTO (mutual_unidade_dos_objetos),
       -- e nao linha a linha sobre os 17,7 mil objetos.
       and o.id_externo in (select u.id_externo from mutual_unidade_dos_objetos() u
                             where u.regional_id = p_regional_id)
  ),
  -- O recorte da carteira viva x acervo historico — decisao (9).
  --
  -- 🔴 MAS O QUE JA FOI CARREGADO NUNCA SAI DO LOTE. `p_incluir_inativos`
  -- governa o que ENTRA na base, nao o que continua sendo MANTIDO: um
  -- veiculo que virou SUSPENSO ou INATIVO no Mutual depois da carga sairia
  -- do filtro e a ficha daqui ficaria `ativo` para sempre — a base mentindo
  -- em silencio, que e o pior desfecho possivel numa convivencia em que
  -- quem manda e o outro sistema. Com o vinculo no lote, o cancelamento
  -- feito no Mutual CHEGA aqui na proxima rodada.
  escopo as (
    select * from bruto
     where st is not null
       and (p_incluir_inativos
            or st::text in ('ativo','em_evento','vistoria_pendente','inadimplente')
            or vinc_veiculo is not null)
  ),
  -- Duplicata DENTRO do lote: fica a linha mais recentemente atualizada.
  -- Sem isto a carga estouraria no unique no meio do caminho, e o que
  -- deveria ser uma lista viraria um erro.
  rank as (
    select e.*,
           row_number() over (partition by e.placa
                              order by e.updated_at desc, e.id_objeto desc) as rn_placa,
           case when e.chassi is null then 1
                else row_number() over (partition by e.chassi
                              order by e.updated_at desc, e.id_objeto desc) end as rn_chassi,
           case when e.renavam is null then 1
                else row_number() over (partition by e.renavam
                              order by e.updated_at desc, e.id_objeto desc) end as rn_renavam
      from escopo e
  ),
  resolvido as (
    select r.*,
           coalesce(
             registro_do_externo('PERSON', r.id_pessoa, 'MUTUAL'),
             (select c.id from clientes c where c.cpf_cnpj = r.cpf limit 1)
           )                                                              as vinc_cliente,
           -- O tipo de pessoa que o BANCO valida e o do documento; o
           -- `person_type` do Mutual entra so como reserva.
           coalesce(
             case when length(r.cpf) = 14 then 'PJ'
                  when length(r.cpf) = 11 then 'PF' end::tipo_pessoa,
             r.tp_declarado)                                              as tp
      from rank r
  ),
  julgado as (
    select d.*,
      case
        when d.placa is null then
          'SEM PLACA (0 km ou placa fora do padrao). veiculos.placa e obrigatorio. '
          || 'Chassi: ' || coalesce(d.chassi, '(sem chassi tambem)')
        when d.cpf = '' or d.tp is null then
          'Associado sem CPF/CNPJ'
        when not validar_documento(d.cpf, d.tp) then
          'CPF/CNPJ invalido (' || d.cpf || ') — o banco recusa'
        when d.nome is null then
          'Associado sem nome'
        when d.ativacao is null then
          'Sem data de ativacao em nenhuma das tres fontes — entraria "ativado hoje"'
        when d.rn_placa > 1 then
          'Placa ' || d.placa || ' repetida no lote; fica o objeto mais recente'
        when d.rn_chassi > 1 then
          'Chassi ' || d.chassi || ' repetido no lote; fica o objeto mais recente'
        when d.rn_renavam > 1 then
          'Renavam ' || d.renavam || ' repetido no lote; fica o objeto mais recente'
        when exists (select 1 from veiculos v
                      where v.placa = d.placa
                        and (d.vinc_veiculo is null or v.id <> d.vinc_veiculo)) then
          'Placa ' || d.placa || ' ja cadastrada em outro veiculo do SCar'
        when d.chassi is not null
         and exists (select 1 from veiculos v
                      where v.chassi = d.chassi
                        and (d.vinc_veiculo is null or v.id <> d.vinc_veiculo)) then
          'Chassi ' || d.chassi || ' ja cadastrado em outro veiculo do SCar'
        when d.renavam is not null
         and exists (select 1 from veiculos v
                      where v.renavam = d.renavam
                        and (d.vinc_veiculo is null or v.id <> d.vinc_veiculo)) then
          'Renavam ' || d.renavam || ' ja cadastrado em outro veiculo do SCar'
      end as problema
      from resolvido d
  )
  select j.id_objeto,
         j.id_pessoa,
         case when j.problema is not null   then 'RECUSADO'
              when j.vinc_veiculo is not null then 'ATUALIZAR'
              else 'CRIAR' end,
         j.problema,
         j.st,
         j.placa, j.chassi, j.renavam, j.marca, j.modelo, j.ano_fab, j.ano_mod,
         j.cor_id,
         (select c.nome from cores c where c.id = j.cor_id),
         j.uso,
         j.fipe, j.cod_fipe,
         j.valor,
         -- `calcular_vencimento` (0024) clampa dia 31 ao fim do mes; o que
         -- nao serve e dia fora de 1..31, que a coluna recusaria.
         (case when j.dia_txt ~ '^[0-9]{1,2}$'
                and j.dia_txt::int between 1 and 31
               then j.dia_txt::smallint end),
         j.ativacao,
         j.ativ_estimada,
         j.tipo_id,
         j.plano,
         j.nome, j.cpf, j.tp, j.email, j.telefone, j.nascimento, j.nome_mae,
         case when j.endereco_bruto is null then '{}'::jsonb else jsonb_strip_nulls(jsonb_build_object(
           'cep',         regexp_replace(coalesce(j.endereco_bruto->>'post_code',''), '\D','','g'),
           'logradouro',  upper(mutual_texto(j.endereco_bruto->>'street')),
           'numero',      mutual_texto(j.endereco_bruto->>'number'),
           'complemento', upper(mutual_texto(j.endereco_bruto->>'complement')),
           'bairro',      upper(mutual_texto(j.endereco_bruto->>'district')),
           'cidade',      upper(mutual_texto(j.endereco_bruto->>'city')),
           'uf',          upper(mutual_texto(j.endereco_bruto->>'state'))
         )) end,
         j.vinc_cliente,
         j.vinc_veiculo
    from julgado j
   where not p_somente_problemas or j.problema is not null
   order by (j.problema is null), j.placa nulls first, j.id_objeto
   limit p_limite;
end;
$$;

-- (C) a carga (corpo da 0094)
create or replace function mutual_executar_carga(
  p_regional_id      uuid,
  p_incluir_inativos boolean default false,
  p_confirmar        boolean default false,
  p_lote             integer default null,
  p_preparar         boolean default true
)
returns table (
  clientes_criados     bigint,
  clientes_atualizados bigint,
  veiculos_criados     bigint,
  veiculos_atualizados bigint,
  recusados            bigint,
  restantes            bigint,
  mensagem             text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  r          record;
  v_cliente  uuid;
  v_veiculo  uuid;
  v_doc_ant  text;
  c_cria     bigint := 0;
  c_atu      bigint := 0;
  v_cria     bigint := 0;
  v_atu      bigint := 0;
  v_rec      bigint := 0;
  v_rest     bigint := 0;
  v_nome     text;
  v_ate      integer;
  v_doc_fim  text;
  v_quando   timestamptz;
  v_inat     boolean;
begin
  -- A carga escreve na operacao inteira: e da matriz, nunca da unidade.
  -- 0107: idem — o agendador recarrega as unidades sem sessao.
  if not (tem_acesso_global() or auth.uid() is null) then
    raise exception 'Somente a matriz pode executar a carga do Mutual';
  end if;

  if p_regional_id is null then
    raise exception 'A carga e POR UNIDADE: informe a regional';
  end if;

  if p_lote is not null and p_lote < 1 then
    raise exception 'O bloco tem de ter ao menos 1 linha';
  end if;

  select rg.nome into v_nome from regionais rg where rg.id = p_regional_id;
  if v_nome is null then
    raise exception 'Regional % nao existe', p_regional_id;
  end if;

  ---------------------------------------------------------------- simulacao
  if not p_confirmar then
    -- UMA leitura so (a 0084 lia duas vezes). Associado se conta por PESSOA.
    select count(distinct l.id_pessoa) filter (where l.problema is null and l.cliente_id is null),
           count(distinct l.id_pessoa) filter (where l.problema is null and l.cliente_id is not null),
           count(*)                    filter (where l.problema is null and l.acao = 'CRIAR'),
           count(*)                    filter (where l.problema is null and l.acao = 'ATUALIZAR'),
           count(*)                    filter (where l.problema is not null)
      into c_cria, c_atu, v_cria, v_atu, v_rec
      from mutual_carga_linhas(p_regional_id, p_incluir_inativos, false, null) l;

    return query select c_cria, c_atu, v_cria, v_atu, v_rec, 0::bigint,
      'SIMULACAO (p_confirmar = false): nada foi gravado em ' || v_nome;
    return;
  end if;

  -- Duas abas carregando a mesma unidade ao mesmo tempo disputariam a fila:
  -- a trava e da transacao, entao a segunda espera a primeira terminar.
  perform pg_advisory_xact_lock(hashtext('mutual_carga:' || p_regional_id::text));

  ------------------------------------------------------------------ preparo
  if p_preparar then
    delete from mutual_carga_fila f where f.regional_id = p_regional_id;

    with l as materialized (
      select * from mutual_carga_linhas(p_regional_id, p_incluir_inativos, false, null)
    ),
    ins as (
      insert into mutual_carga_fila
      select p_regional_id,
             (row_number() over (order by l.cpf_cnpj, l.id_objeto))::integer,
             p_incluir_inativos,
             now(),
             l.*
        from l
       where l.problema is null
      returning 1
    )
    select (select count(*) from ins), count(*) filter (where l.problema is not null)
      into v_rest, v_rec
      from l;

    -- Com bloco, a chamada que prepara so prepara: a leitura ja gastou o
    -- tempo dela. Quem grava sao as chamadas seguintes.
    if p_lote is not null then
      return query select 0::bigint, 0::bigint, 0::bigint, 0::bigint, v_rec, v_rest,
        'Fila preparada em ' || v_nome || ': ' || v_rest || ' veiculo(s) a gravar, '
        || v_rec || ' recusado(s).';
      return;
    end if;
  else
    -- Continuar uma fila: ela tem de existir, ser do MESMO recorte e ser recente.
    select min(f.preparada_em), bool_and(f.incluir_inativos)
      into v_quando, v_inat
      from mutual_carga_fila f where f.regional_id = p_regional_id;

    if v_quando is null then
      return query select 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint,
        'Nada na fila de ' || v_nome || ': a carga ja terminou (ou nao foi preparada).';
      return;
    end if;
    if v_inat is distinct from p_incluir_inativos then
      raise exception 'A fila de % foi preparada com outro recorte (acervo historico). Prepare de novo.', v_nome;
    end if;
    if v_quando < now() - interval '1 hour' then
      raise exception 'A fila de % foi preparada ha mais de 1 hora; o Mutual pode ter mudado. Prepare de novo.', v_nome;
    end if;
  end if;

  ----------------------------------------------------------- o bloco da vez
  -- Ate a linha `p_lote` da fila, ESTENDIDO ate o fim do associado: o mesmo
  -- CPF nunca fica dividido entre dois blocos.
  if p_lote is null then
    v_ate := null;
  else
    select f.ordem, f.cpf_cnpj into v_ate, v_doc_fim
      from mutual_carga_fila f
     where f.regional_id = p_regional_id
     order by f.ordem
     offset p_lote - 1 limit 1;

    if v_ate is not null then
      select max(f.ordem) into v_ate
        from mutual_carga_fila f
       where f.regional_id = p_regional_id
         and f.cpf_cnpj is not distinct from v_doc_fim;
    end if;
  end if;

  for r in
    select * from mutual_carga_fila f
     where f.regional_id = p_regional_id
       and (v_ate is null or f.ordem <= v_ate)
     order by f.ordem
  loop
    -- ================================================================
    -- Daqui ate o fim do laco o corpo e o da 0084, sem mudanca.
    -- ================================================================
    ------------------------------------------------------------------ cliente
    -- 🔴 O `cliente_id` da leitura e um RETRATO de antes do laco: no segundo
    -- veiculo do mesmo associado ele ainda viria nulo e o insert estouraria
    -- no unique de `cpf_cnpj`. Por isso o vinculo e re-resolvido A CADA
    -- volta, e o agrupamento acima e que evita o UPDATE repetido.
    if r.cpf_cnpj is distinct from v_doc_ant then
      v_doc_ant := r.cpf_cnpj;

      select coalesce(
               registro_do_externo('PERSON', r.id_pessoa, 'MUTUAL'),
               (select c.id from clientes c where c.cpf_cnpj = r.cpf_cnpj limit 1))
        into v_cliente;

      if v_cliente is null then
        insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, email, telefone,
                              celular, endereco, status, regional_id, data_nascimento,
                              nome_mae)
        values (r.tipo_pessoa, r.nome, r.cpf_cnpj, r.email, r.telefone,
                r.telefone, r.endereco, 'ativo', p_regional_id, r.data_nascimento,
                r.nome_mae)
        returning id into v_cliente;

        c_cria := c_cria + 1;
      else
        update clientes c
           set nome_razao_social = r.nome,
               email             = coalesce(r.email, c.email),
               telefone          = coalesce(r.telefone, c.telefone),
               endereco          = case when r.endereco = '{}'::jsonb
                                        then c.endereco else r.endereco end,
               data_nascimento   = coalesce(r.data_nascimento, c.data_nascimento),
               nome_mae          = coalesce(r.nome_mae, c.nome_mae),
               regional_id       = coalesce(c.regional_id, p_regional_id)
         where c.id = v_cliente;

        c_atu := c_atu + 1;
      end if;

      if r.id_pessoa is not null then
        perform vincular_externo('PERSON', r.id_pessoa, 'clientes', v_cliente,
                                 'MUTUAL', 'Carga ' || v_nome);
      end if;
    end if;

    ------------------------------------------------------------------ veiculo
    -- O vinculo e re-lido aqui (e nao tirado da fila): entre o preparo e
    -- este bloco, outro bloco pode ter criado o veiculo.
    v_veiculo := coalesce(r.veiculo_id,
                          registro_do_externo('CONTRACT_OBJECT', r.id_objeto, 'MUTUAL'));

    if v_veiculo is null then
      insert into veiculos (
        cliente_id, placa, chassi, renavam, marca, modelo,
        ano_fabricacao, ano_modelo, cor_id, cor, uso, valor_fipe, codigo_fipe,
        regional_id, plano_protecao_id, tipo_veiculo_id, status,
        data_ativacao, valor_mensalidade, dia_vencimento,
        -- (1) O interruptor. E ele que faz `veiculo_faturavel` devolver
        -- false, e com isso `gerar_primeira_cobranca_veiculo` (chamada
        -- pelo trigger AFTER INSERT) retorna sem gerar nada.
        cobranca_externa, cobranca_externa_desde
      )
      values (
        v_cliente, r.placa, r.chassi, r.renavam, r.marca, r.modelo,
        r.ano_fabricacao, r.ano_modelo, r.cor_id, r.cor, r.uso, r.valor_fipe, r.codigo_fipe,
        p_regional_id, r.plano_id, r.tipo_veiculo_id, r.status,
        r.data_ativacao, r.valor_mensalidade, r.dia_vencimento,
        true, r.data_ativacao
      )
      returning id into v_veiculo;

      v_cria := v_cria + 1;
    else
      -- (10) Atualiza o que o Mutual e dono. NAO mexe em
      -- `cobranca_externa` (o cutover ja pode ter sido virado), nem em
      -- plano quando alguem escolheu um aqui, nem em rastreador,
      -- alienacao, tipo de faturamento, cota, km ou vendedor.
      update veiculos v
         set placa             = r.placa,
             chassi            = r.chassi,
             renavam           = r.renavam,
             marca             = coalesce(r.marca, v.marca),
             modelo            = coalesce(r.modelo, v.modelo),
             ano_fabricacao    = coalesce(r.ano_fabricacao, v.ano_fabricacao),
             ano_modelo        = coalesce(r.ano_modelo, v.ano_modelo),
             cor               = coalesce(r.cor, v.cor),
             cor_id            = coalesce(r.cor_id, v.cor_id),
             valor_fipe        = coalesce(r.valor_fipe, v.valor_fipe),
             codigo_fipe       = coalesce(r.codigo_fipe, v.codigo_fipe),
             tipo_veiculo_id   = coalesce(v.tipo_veiculo_id, r.tipo_veiculo_id),
             plano_protecao_id = coalesce(v.plano_protecao_id, r.plano_id),
             status            = r.status,
             data_ativacao     = coalesce(r.data_ativacao, v.data_ativacao),
             valor_mensalidade = coalesce(r.valor_mensalidade, v.valor_mensalidade),
             dia_vencimento    = coalesce(r.dia_vencimento, v.dia_vencimento),
             cliente_id        = v_cliente,
             regional_id       = p_regional_id
       where v.id = v_veiculo;

      v_atu := v_atu + 1;
    end if;

    perform vincular_externo('CONTRACT_OBJECT', r.id_objeto, 'veiculos', v_veiculo,
                             'MUTUAL', 'Carga ' || v_nome);

    -- Gravou: sai da fila. Se o bloco falhar no meio, a transacao inteira
    -- volta — e a fila volta junto, intacta, para tentar de novo.
    delete from mutual_carga_fila f
     where f.regional_id = p_regional_id and f.ordem = r.ordem;
  end loop;

  select count(*) into v_rest
    from mutual_carga_fila f where f.regional_id = p_regional_id;

  return query select c_cria, c_atu, v_cria, v_atu, v_rec, v_rest,
    case when v_rest > 0
         then 'Bloco gravado em ' || v_nome || '. Faltam ' || v_rest || ' veiculo(s) na fila.'
         else 'Carga de ' || v_nome || ' concluida. Os veiculos entraram com '
              || 'cobranca_externa: nenhuma fatura foi gerada. O cutover e '
              || 'definir_cobranca_externa_regional.'
    end;
end;
$$;

-- Rito da 0052.
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
