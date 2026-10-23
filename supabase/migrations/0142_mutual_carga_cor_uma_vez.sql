-- 0142 — A LEITURA DA CARGA CABE NO TETO DA ROTINA
--
-- Achado em 23/10/2026 conferindo a sincronia automatica (0107): a carga de
-- RIBEIRAO PRETO falhava TODO DIA com "canceling statement due to statement
-- timeout". Desde 14/10 o acervo inativo da unidade (3.766 veiculos) esta na
-- base, e o que ja foi carregado nunca sai do lote (0084) — a leitura passou de
-- ~1.200 para ~5.000 linhas e levava 16,7 s, acima dos 8 s do service_role.
--
-- Metade do tempo era UMA chamada: `mutual_cor_do_externo` por linha (5.213
-- vezes para 20 cores distintas). Agora a cor e resolvida uma vez por cor, num
-- CTE, e casada pelo id. Medido em producao com a mesma leitura: 3,7 s.
--
-- So `mutual_carga_linhas` e recriada, MESMA assinatura e mesmo resultado
-- (`mutual_cor_do_externo` ja aplica `mutual_texto` no id: casar pelo id
-- normalizado da o mesmo cor_id). Nada de dado muda.

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
           mutual_texto(o.payload#>>'{vehicle_data,vehicle_color}')         as cor_ext,
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
  -- 0142: a COR resolvida UMA vez por cor distinta (eram ~20 cores para
  -- 5 mil objetos em Ribeirao Preto, e a consulta por linha custava 8 s).
  cor_map as (
    select x.cor_ext, mutual_cor_do_externo(x.cor_ext) as cor_id
      from (select distinct b.cor_ext from bruto b where b.cor_ext is not null) x
  ),
  escopo as (
    select bb.*, cm.cor_id from bruto bb
      left join cor_map cm on cm.cor_ext = bb.cor_ext
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
           -- 0136: sem placa (0 km) NAO e duplicata de outro sem placa — a
           -- particao por NULL juntaria todos os 0 km do lote e recusaria do
           -- segundo em diante. A identidade dele e o chassi (rn_chassi).
           -- 0138: fica o objeto MAIS VIVO e, entre iguais, o mais recente.
           -- So "o mais recente" deixava o contrato ATIVO de fora quando o
           -- contrato mais novo daquela placa era um INATIVO de outra pessoa.
           case when e.placa is null then 1
                else row_number() over (partition by e.placa
                              order by mutual_vitalidade(e.st) desc, e.updated_at desc,
                                       e.id_objeto desc) end as rn_placa,
           case when e.chassi is null then 1
                else row_number() over (partition by e.chassi
                              order by mutual_vitalidade(e.st) desc, e.updated_at desc,
                                       e.id_objeto desc) end as rn_chassi,
           case when e.renavam is null then 1
                else row_number() over (partition by e.renavam
                              order by mutual_vitalidade(e.st) desc, e.updated_at desc,
                                       e.id_objeto desc) end as rn_renavam
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
  -- 0138: A TRANSFERENCIA. O carro trocou de contrato no Mutual (outro dono,
  -- ou o mesmo dono com contrato novo) e a placa ja esta num veiculo daqui,
  -- ligado ao objeto ANTIGO. Antes isso era recusa ("placa ja cadastrada"),
  -- e pior: o objeto antigo perdia o desempate e tambem nao atualizava nada,
  -- entao o veiculo ficava ATIVO com o dono antigo para sempre. Agora o
  -- objeto que vence assume o veiculo existente — desde que (a) o veiculo
  -- tenha vindo do Mutual (veiculo cadastrado a mao aqui segue sendo recusa:
  -- e decisao de gente) e (b) nenhum objeto ja ligado a ele seja mais vivo
  -- ou, empatado, mais recente.
  assume as (
    select d.*,
      case when d.vinc_veiculo is null
            and d.rn_placa = 1 and d.rn_chassi = 1 and d.rn_renavam = 1 then
        (select v.id
           from veiculos v
          where ((d.placa is not null and v.placa = d.placa)
              or (d.chassi is not null and v.chassi = d.chassi))
            and exists (select 1 from integracao_vinculos iv
                         where iv.sistema = 'MUTUAL' and iv.entidade = 'CONTRACT_OBJECT'
                           and iv.registro_id = v.id)
            and not exists (
              select 1
                from integracao_vinculos iv
                join mutual_captura o2 on o2.entidade = 'CONTRACT_OBJECT'
                                      and o2.id_externo = iv.id_externo
               where iv.sistema = 'MUTUAL' and iv.entidade = 'CONTRACT_OBJECT'
                 and iv.registro_id = v.id
                 and iv.id_externo <> d.id_objeto
                 and not o2.deletado
                 and (mutual_vitalidade(mutual_status_veiculo(o2.payload->>'contract_status',
                                                              o2.payload->>'status')),
                      coalesce(mutual_texto(o2.payload->>'updated_at')::timestamptz,
                               o2.capturado_em),
                      o2.id_externo)
                     > (mutual_vitalidade(d.st), d.updated_at, d.id_objeto))
          -- A placa manda sobre o chassi quando apontam veiculos diferentes;
          -- o outro continua barrando pela checagem de chassi abaixo.
          order by (d.placa is not null and v.placa = d.placa) desc, v.id
          limit 1)
      end as veiculo_assumido
      from resolvido d
  ),
  julgado as (
    select d.*,
      case
        -- 0136: sem placa ENTRA como 0 km (placa pendente) quando tem
        -- chassi. Recusa so quando nao ha identidade nenhuma.
        when d.placa is null and d.chassi is null then
          'SEM PLACA E SEM CHASSI: nao ha como identificar o veiculo. '
          || 'Corrigir o cadastro no Mutual (placa ou chassi).'
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
        when d.placa is not null
         and exists (select 1 from veiculos v
                      where v.placa = d.placa
                        and v.id is distinct from coalesce(d.vinc_veiculo, d.veiculo_assumido)) then
          'Placa ' || d.placa || ' ja cadastrada em outro veiculo do SCar'
        when d.chassi is not null
         and exists (select 1 from veiculos v
                      where v.chassi = d.chassi
                        and v.id is distinct from coalesce(d.vinc_veiculo, d.veiculo_assumido)) then
          'Chassi ' || d.chassi || ' ja cadastrado em outro veiculo do SCar'
        when d.renavam is not null
         and exists (select 1 from veiculos v
                      where v.renavam = d.renavam
                        and v.id is distinct from coalesce(d.vinc_veiculo, d.veiculo_assumido)) then
          'Renavam ' || d.renavam || ' ja cadastrado em outro veiculo do SCar'
      end as problema
      from assume d
  )
  select j.id_objeto,
         j.id_pessoa,
         case when j.problema is not null   then 'RECUSADO'
              when coalesce(j.vinc_veiculo, j.veiculo_assumido) is not null then 'ATUALIZAR'
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
         coalesce(j.vinc_veiculo, j.veiculo_assumido)
    from julgado j
   where not p_somente_problemas or j.problema is not null
   order by (j.problema is null), j.placa nulls first, j.id_objeto
   limit p_limite;
end;
$$;

-- Rito da 0052.
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
