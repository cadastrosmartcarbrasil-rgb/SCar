-- =====================================================================
-- 0087_mutual_categoria_veiculo — o TIPO DE VEICULO sai da CATEGORIA
-- =====================================================================
-- Pedido do usuario (05/10/2026): "a classificacao e mais precisa se
-- utilizar os campos em Categorias de veiculos... a exemplo do que fizemos
-- na regional, poderemos agrupar."
--
-- O de-para da 0084 era por `vehicle_type`, e o Mutual tem TRES (CARRO,
-- MOTO, CAMINHAO) contra SETE tipos do SCar: "CARRO" nao decide entre
-- Passeio e Pick-up / Van. Mas o objeto traz tambem `vehicle_category`,
-- preenchida em 17.730 de 17.730 (100%), com 44 categorias ja capturadas
-- desde a 0062 (`/vehicle/category/`) e nunca usadas: "V5 / automovel
-- comum", "V6 / pickups/vans/utilitarios", "Caminhao Leve", "CAMINHOES
-- PESADOS", "Motocicleta"... E o mesmo movimento da 0083 com as equipes de
-- vendas: o dado que decide estava numa entidade VIZINHA, ja capturada.
--
-- 🔴 A CHAVE E O PAR (categoria, tipo), NAO a categoria sozinha.
-- Medido na base: a categoria 26 "PASSEIO" junta 1.950 CARROS e 1.054 MOTOS
-- (282 e 374 ativos). Vincular "26" a Passeio poria as motos no tipo de carro
-- — e o tipo decide a tabela de preco, a regra do rastreador e a cota. Entao a
-- chave do vinculo e '<categoria>/<tipo>' ('26/1' e '26/2'). Para as
-- categorias de um tipo so, e uma linha por categoria, igual.
--
-- A PRECEDENCIA (mesma postura da 0083: o mais especifico manda, o generico
-- e reserva):
--   1. o vinculo do PAR categoria/tipo  (entidade 'VEHICLE_CATEGORY')
--   2. o vinculo do TIPO                 (entidade 'VEHICLE_TYPE', 0084)
--   3. nulo — o veiculo entra sem tipo, que NAO afeta a cobranca enquanto a
--      cobranca externa estiver ligada (0082).
--
-- O que muda na operacao: NADA ate alguem vincular uma categoria. Sem
-- vinculo de categoria, `mutual_tipo_veiculo_do_objeto` devolve exatamente o
-- que `mutual_tipo_veiculo_do_externo` devolvia — ha teste.
--
-- O que esta migration NAO faz: a categoria carrega tambem a COTA DE
-- PARTICIPACAO (V5..V15, "Especial"), no formato que o parser da 0016 ja le.
-- A carga NAO grava a cota: e decisao a parte (ela mexe no rateio do evento),
-- e a tela so a MOSTRA, para quem decide o tipo ver o que vem junto.
-- =====================================================================


-- =====================================================================
-- (A) A chave e o resolvedor
-- =====================================================================
create or replace function mutual_chave_categoria(p_categoria text, p_tipo text)
returns text
language sql
immutable
set search_path = public
as $$
  select case when mutual_texto(p_categoria) is null then null
              else mutual_texto(p_categoria) || '/' || coalesce(mutual_texto(p_tipo), '?')
         end;
$$;

comment on function mutual_chave_categoria(text, text) is
  'A chave do de-para por categoria: ''<categoria>/<tipo>''. E o PAR porque a '
  'categoria 26 "PASSEIO" do Mutual junta carros e motos (0087).';

create or replace function mutual_tipo_veiculo_da_categoria(p_categoria text, p_tipo text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select v.registro_id
    from integracao_vinculos v
   where v.sistema = 'MUTUAL' and v.entidade = 'VEHICLE_CATEGORY'
     and v.tabela = 'tipos_veiculo'
     and v.id_externo = mutual_chave_categoria(p_categoria, p_tipo)
   limit 1;
$$;

create or replace function mutual_tipo_veiculo_do_objeto(p_categoria text, p_tipo text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  -- A categoria (o par) manda; o tipo e reserva. Nunca palpite: sem vinculo
  -- registrado nos dois niveis, nulo.
  select coalesce(mutual_tipo_veiculo_da_categoria(p_categoria, p_tipo),
                  mutual_tipo_veiculo_do_externo(p_tipo));
$$;

comment on function mutual_tipo_veiculo_do_objeto(text, text) is
  'O tipo de veiculo do objeto do Mutual: o vinculo do PAR categoria/tipo manda, '
  'o vinculo do tipo (0084) e reserva. Sem nenhum dos dois, nulo (0087).';


-- =====================================================================
-- (B) A tela: as categorias com o PESO da unidade
-- =====================================================================
create or replace function mutual_categorias_veiculo(p_regional_id uuid default null)
returns table (
  chave                text,
  categoria_id         text,
  categoria_nome       text,
  tipo_id              text,
  tipo_mutual          text,
  capturada            boolean,
  veiculos             bigint,
  faturaveis           bigint,
  cobertura_acumulada  numeric,
  destino_id           uuid,
  destino_nome         text,
  reserva_id           uuid,
  reserva_nome         text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_staff() then
    raise exception 'Somente a equipe pode ler o de-para de categorias de veiculo';
  end if;

  return query
  with cat as (
    select c.id_externo, mutual_texto_em(c.payload, array['name','nome','description']) as nome
      from mutual_captura c
     where c.entidade = 'VEHICLE_CATEGORY' and not c.deletado
  ),
  tip as (
    select c.id_externo, mutual_texto_em(c.payload, array['name','nome','description']) as nome
      from mutual_captura c
     where c.entidade = 'VEHICLE_TYPE' and not c.deletado
  ),
  ct as (
    select c.id_externo, c.payload from mutual_captura c
     where c.entidade = 'CONTRACT' and not c.deletado
  ),
  -- Toda coluna QUALIFICADA: `chave`, `veiculos`, `faturaveis` sao tambem
  -- colunas de OUT, e plpgsql nao desambigua (a mordida da 0085).
  obj as (
    select mutual_texto(o.payload#>>'{vehicle_data,vehicle_category}') as cat,
           mutual_texto(o.payload#>>'{vehicle_data,vehicle_type}')     as tipo,
           mutual_status_veiculo(o.payload->>'contract_status',
                                 o.payload->>'status')                 as st,
           mutual_regional_do_objeto(o.payload, ct.payload)            as reg
      from mutual_captura o
      left join ct on ct.id_externo = o.payload->>'contract_id'
     where o.entidade = 'CONTRACT_OBJECT' and not o.deletado
  ),
  escopo as (
    select o2.* from obj o2
     where o2.cat is not null
       and (p_regional_id is null or o2.reg = p_regional_id)
  ),
  peso as (
    select e.cat, e.tipo,
           count(*) filter (where e.st is not null)                 as n_veic,
           count(*) filter (where e.st::text in ('ativo','em_evento',
                              'vistoria_pendente','inadimplente'))   as n_fat
      from escopo e group by e.cat, e.tipo
  ),
  acum as (
    select p.*,
           case when sum(p.n_fat) over () > 0
                then (sum(p.n_fat) over (order by p.n_fat desc, p.n_veic desc, p.cat, p.tipo)
                      * 100.0 / sum(p.n_fat) over ())::numeric(5,1) end as cob
      from peso p
  )
  select mutual_chave_categoria(a.cat, a.tipo),
         a.cat,
         cat.nome,
         a.tipo,
         tip.nome,
         cat.id_externo is not null,
         a.n_veic,
         a.n_fat,
         a.cob,
         mutual_tipo_veiculo_da_categoria(a.cat, a.tipo),
         td.nome,
         mutual_tipo_veiculo_do_externo(a.tipo),
         tr.nome
    from acum a
    left join cat on cat.id_externo = a.cat
    left join tip on tip.id_externo = a.tipo
    left join tipos_veiculo td on td.id = mutual_tipo_veiculo_da_categoria(a.cat, a.tipo)
    left join tipos_veiculo tr on tr.id = mutual_tipo_veiculo_do_externo(a.tipo)
   order by a.n_fat desc, a.n_veic desc, a.cat, a.tipo;
end;
$$;

comment on function mutual_categorias_veiculo(uuid) is
  'O de-para de /vehicle/category/ por PAR categoria/tipo, com o PESO da unidade e a '
  'cobertura acumulada. `destino_*` e o vinculo da categoria; `reserva_*` e o que o '
  'vinculo do tipo daria sem ele (0087).';


-- =====================================================================
-- (C) A CARGA passa a ler a categoria
-- =====================================================================
-- `mutual_carga_linhas` recriada IDENTICA a da 0084, salvo a linha do
-- `tipo_id` — que passa de `mutual_tipo_veiculo_do_externo(tipo)` para
-- `mutual_tipo_veiculo_do_objeto(categoria, tipo)`. Mesma assinatura, entao
-- `create or replace`; a previa e a execucao leem por ela e herdam a mudanca.
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
  if not is_staff() then
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
       and mutual_regional_do_objeto(o.payload, ct.payload) = p_regional_id
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

comment on function mutual_carga_linhas(uuid, boolean, boolean, integer) is
  'A LEITURA da carga: uma linha por objeto do Mutual, ja saneada, com a acao '
  '(CRIAR/ATUALIZAR/RECUSADO) e o MOTIVO da recusa. E a fonte unica — a previa '
  'agrega sobre ela e a execucao percorre ela, entao nao existem duas leituras '
  'para sair de sincronia (a licao da 0082).';



-- =====================================================================
-- Rito de seguranca (0052).
-- =====================================================================
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
