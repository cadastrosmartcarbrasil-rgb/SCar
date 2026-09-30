-- =====================================================================
-- 0084_carga_mutual — A CARGA (Fase 3), POR UNIDADE, re-executavel
-- =====================================================================
-- A Fase 1 (0062..0066, 0071) leu e diagnosticou; a 0082/0083 prepararam
-- (o vinculo, o interruptor da cobranca e o de-para da UNIDADE pela
-- EQUIPE DE VENDAS). Esta migration e a primeira que ESCREVE em
-- `clientes` e `veiculos` — e por isso ela e escrita como um
-- instrumento, nao como um script:
--
--   1. `mutual_carga_linhas`  — a LEITURA, uma linha por objeto, com o
--      motivo da recusa quando ha. E a FONTE UNICA: a previa agrega
--      sobre ela e a execucao percorre ela. Nao existem duas leituras
--      para sair de sincronia (a licao que a 0082 pagou com quatro
--      lugares lendo a unidade de formas diferentes).
--   2. `mutual_carga_previa`  — o que aconteceria, em numeros.
--   3. `mutual_executar_carga`— o que acontece, e so com p_confirmar.
--   4. `mutual_desfazer_carga`— o caminho de volta, pelo vinculo.
--
-- ---------------------------------------------------------------------
-- 🔴 AS DECISOES QUE MORAM AQUI (e por que cada uma)
-- ---------------------------------------------------------------------
-- (1) `cobranca_externa = true` SEMPRE, e NAO e parametro.
--     A associacao cobra no Mutual hoje. `veiculo_faturavel` (0024+0082)
--     le `not v.cobranca_externa`, e `gerar_primeira_cobranca_veiculo`
--     passa por ela — entao o veiculo entra ATIVO, no SAC, no portal e
--     na 24h, e NAO gera fatura. E a mina nº 1 desarmada no DADO, nao
--     na sessao (a GUC `scar.importacao` seria local a transacao e nao
--     protegeria o lote rodado tres meses depois).
--     Ligar a cobranca aqui e o CUTOVER, e ele tem funcao propria:
--     `definir_cobranca_externa_regional` (0082). Por isso a
--     RE-EXECUCAO NAO MEXE em `cobranca_externa`: depois do cutover,
--     rodar a carga de novo nao pode desligar o faturamento em silencio.
--
-- (2) A CARGA E POR UNIDADE, e `p_regional_id` e OBRIGATORIO.
--     Neste sistema `regional_id is null` significa MATRIZ (0067/0069),
--     entao "carregar tudo" jogaria no escopo da matriz os 92 faturaveis
--     que ainda nao tem equipe agrupada — atravessando RLS,
--     `escopo_regional()` e todos os paineis, sem aviso.
--     A unidade tambem e o gatilho do cutover: carregar por unidade e
--     virar a cobranca por unidade sao o mesmo recorte.
--
-- (3) `data_ativacao` NUNCA e "hoje". Escada: `first_activation_date` →
--     `contrato.created_at` → `objeto.created_at`. Sem nenhuma das tres,
--     a linha e RECUSADA. `trg_veiculo_marca_ativacao` (0025) carimba
--     `current_date` quando o campo vem nulo, e isso contaminaria
--     `veiculo_faturavel`, o tempo de casa e o painel da 24h. Quando a
--     data vem do fallback, a linha diz isso (`ativacao_estimada`) — a
--     melhor aproximacao que existe, anunciada, e o mesmo que o backfill
--     da 0078 fez com `updated_at`.
--
-- (4) SEM PLACA e RECUSA, nao invencao. `veiculos.placa` e `not null`
--     (0001) e o 0 km e carro real (0071). Fabricar placa cria registro
--     que ninguem acha e que colide no dia em que a placa verdadeira
--     chegar. A recusa nomeia o CHASSI, para a operacao cobrar a placa.
--
-- (5) CPF/CNPJ invalido e RECUSA. `chk_documento_valido` recusaria de
--     qualquer jeito; recusar aqui da a LISTA em vez de um erro no meio
--     da carga. E e reversivel: corrige no Mutual, recaptura, roda de novo.
--
-- (6) VALOR e a PARCELA (`final_total_value`, medido na 0065) e vai
--     DIRETO em `valor_mensalidade`. Valor nulo ou zero entra como
--     **NULL, nunca zero**: `valor_mensalidade_veiculo` (0024) so
--     respeita o override quando `> 0`, entao zero VAZA para o
--     `cotar_plano` — e null e a verdade ("nao sei"), zero e mentira
--     ("e de graca"). A linha fica relatada, e essa fila tem de estar
--     vazia antes do cutover.
--
-- (7) CHASSI e RENAVAM passam por SANEAMENTO, e vazio vira NULL.
--     As duas colunas sao `unique` e NULAVEIS: `''` colidiria (a mordida
--     de `fornecedores.documento`, 0051). E a base real traz PLACEHOLDER
--     — renavam "0", "000000000000", "2012". Medido na matriz: com o
--     saneamento, ZERO duplicata sobra; sem ele, 4 grupos param a carga.
--     Placeholder nao e dado: e a ausencia escrita com confianca.
--
-- (8) O de-para de TIPO DE VEICULO e de PLANO sai do VINCULO REGISTRADO,
--     nunca de palpite (postura da 0082 com as filiais e da 0081 com o
--     preco). Os dois sao nulaveis e NAO bloqueiam: com
--     `cobranca_externa` ligada o preco nao e recalculado aqui, entao a
--     ausencia e fila de trabalho, nao impedimento. A carga conta quantos
--     entram sem eles.
--
-- (9) `p_incluir_inativos` nasce FALSE. A carteira viva da matriz sao 481
--     veiculos; o acervo historico sao mais 4.764, com 3.165 associados
--     que nunca vao aparecer numa tela. Para VERIFICAR o sistema o
--     historico nao acrescenta cobertura nenhuma e enche o SAC de gente
--     que saiu. Ele entra depois, pela mesma funcao.
--
-- (10) A RE-EXECUCAO atualiza o que o MUTUAL e dono e nao toca no que o
--      SCar preencheu. Durante a convivencia quem manda e o Mutual
--      (decisao do usuario, 08/09/2026), entao status, valor, dia,
--      ativacao e a ficha do veiculo vem de la a cada rodada. Mas
--      `plano_protecao_id`, rastreador, `alienado`, `tipo_faturamento`,
--      cota, quilometragem, vendedor e `cobranca_externa` sao daqui —
--      uma rodada nao pode desfazer o trabalho de outubro.
--
-- (11) `sexo` NAO e importado. O Mutual manda `gender` "1"/"2" e nao ha
--      no contrato dele qual e qual. Adivinhar o sexo de 436 pessoas
--      para preencher um campo que nenhuma tela usa e exatamente o
--      registro que mente com confianca. Fica nulo.
--
-- NADA aqui e aplicado por ferramenta: quem roda e o usuario, pelo SQL
-- Editor (decisao de 20/09/2026).
-- =====================================================================


-- =====================================================================
-- (A) SANEAMENTO — o que o banco aceita, e vazio vira NULL
-- =====================================================================

-- Placa: so alfanumerico, caixa alta. 7 caracteres no padrao brasileiro
-- (ABC1234 e ABC1D23). Fora disso devolve NULL — e ai a linha e recusada,
-- porque a coluna e `not null`.
create or replace function mutual_placa(p_valor text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(
    case when upper(regexp_replace(coalesce(p_valor, ''), '[^A-Za-z0-9]', '', 'g'))
              ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'
         then upper(regexp_replace(p_valor, '[^A-Za-z0-9]', '', 'g'))
         else '' end, '');
$$;

comment on function mutual_placa(text) is
  'A placa como o SCar guarda: alfanumerico em caixa alta, no padrao de 7 '
  '(ABC1234 ou ABC1D23 Mercosul). Fora do padrao devolve NULL — e melhor '
  'recusar a linha e cobrar a placa que gravar lixo numa coluna not null unique.';


-- Chassi: 17 alfanumericos (VIN). O resto e placeholder da base legada.
-- Vazio vira NULL de proposito: a coluna e unique e NULAVEL, entao duas
-- linhas com '' colidiriam (mordida de `fornecedores.documento`, 0051).
create or replace function mutual_chassi(p_valor text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(
    case when upper(regexp_replace(coalesce(p_valor, ''), '[^A-Za-z0-9]', '', 'g'))
              ~ '^[A-Z0-9]{17}$'
         then upper(regexp_replace(p_valor, '[^A-Za-z0-9]', '', 'g'))
         else '' end, '');
$$;

comment on function mutual_chassi(text) is
  'Chassi com 17 alfanumericos ou NULL. Medido na base real: 16 dos 481 '
  'faturaveis da matriz tem chassi fora do padrao, e sem este corte eles '
  'entrariam como identidade falsa.';


-- Renavam: 9 a 11 digitos e nao pode ser so zero. A base real traz
-- "0", "000000000000" e ate "2012" (o ano no campo errado) — e os tres
-- COLIDEM entre si num unique. Com este corte, zero duplicata sobra.
create or replace function mutual_renavam(p_valor text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(
    case when regexp_replace(coalesce(p_valor, ''), '\D', '', 'g') ~ '^[0-9]{9,11}$'
          and regexp_replace(coalesce(p_valor, ''), '\D', '', 'g') !~ '^0+$'
         then regexp_replace(p_valor, '\D', '', 'g')
         else '' end, '');
$$;

comment on function mutual_renavam(text) is
  'Renavam com 9 a 11 digitos, nunca so zeros, ou NULL. O placeholder da '
  'base legada ("0", "000000000000", "2012") e o que criava as 4 colisoes '
  'de unique medidas na matriz — placeholder nao e dado, e ausencia.';


-- O ano que vem como texto ("2012") e pode vir sujo. Fora de 1900..(ano+2)
-- devolve NULL: ano impossivel numa ficha e pior que ano ausente.
create or replace function mutual_ano(p_valor text)
returns smallint
language sql
immutable
set search_path = public
as $$
  select case
    when regexp_replace(coalesce(p_valor, ''), '\D', '', 'g') ~ '^[0-9]{4}$'
     and regexp_replace(p_valor, '\D', '', 'g')::int
         between 1900 and (extract(year from current_date)::int + 2)
    then regexp_replace(p_valor, '\D', '', 'g')::smallint
    else null end;
$$;


-- `uso_veiculo` a partir de /vehicle/use_type/ (4 valores, nomes sem
-- ambiguidade: Particular, Motorista de Aplicativo, Taxi, Aluguel).
-- Desconhecido cai no default `passeio`, que e o mesmo que a ficha faz.
create or replace function mutual_uso_veiculo(p_id_externo text)
returns uso_veiculo
language sql
stable
set search_path = public
as $$
  select case mutual_texto(p_id_externo)
           when '1' then 'passeio'
           when '2' then 'app'
           when '3' then 'comercial'
           when '4' then 'comercial'
           else 'passeio' end::uso_veiculo;
$$;

comment on function mutual_uso_veiculo(text) is
  'O uso do veiculo pelo /vehicle/use_type/ do Mutual. Nao e de-para por '
  'vinculo porque sao quatro valores de nome inequivoco; desconhecido cai '
  'no default da ficha (passeio).';


-- A data que o Mutual manda em ISO com fuso. `dataLocalDeIso` (src/lib)
-- e o espelho: converte o fuso ANTES de cortar a hora, senao contrato
-- ativado as 21h nasce um dia depois.
create or replace function mutual_data(p_valor text)
returns date
language sql
immutable
set search_path = public
as $$
  select case when mutual_texto(p_valor) is null then null
              else (mutual_texto(p_valor)::timestamptz at time zone 'America/Sao_Paulo')::date
         end;
$$;

comment on function mutual_data(text) is
  'A data local (America/Sao_Paulo) de um timestamp ISO do Mutual. Converte '
  'o fuso ANTES de cortar a hora — espelho de dataLocalDeIso (src/lib/mutual.ts).';


-- =====================================================================
-- (B) O DE-PARA POR VINCULO — tipo de veiculo e plano
-- =====================================================================
-- So a DECISAO REGISTRADA carrega dado (postura da 0082 com as filiais).
-- `/vehicle/type/` tem TRES valores (CARRO, MOTO, CAMINHAO) e o SCar tem
-- SETE tipos (Passeio, Moto, Pick-up/Van, Utilitario, Diesel Leve,
-- Caminhao Pesado, Reboque): "CARRO" nao decide entre Passeio e
-- Pick-up/Van, entao nao ha palpite honesto — ha escolha de quem conhece
-- a carteira. Sao TRES decisoes, uma vez.

create or replace function mutual_tipo_veiculo_do_externo(p_id_externo text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select v.registro_id
    from integracao_vinculos v
   where v.sistema = 'MUTUAL' and v.entidade = 'VEHICLE_TYPE'
     and v.tabela = 'tipos_veiculo'
     and v.id_externo = mutual_texto(p_id_externo)
   limit 1;
$$;

create or replace function mutual_plano_do_externo(p_id_externo text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select v.registro_id
    from integracao_vinculos v
   where v.sistema = 'MUTUAL' and v.entidade = 'PLAN'
     and v.tabela = 'planos_protecao'
     and v.id_externo = mutual_texto(p_id_externo)
   limit 1;
$$;


-- A TELA do de-para do tipo de veiculo: os valores do Mutual com o PESO
-- da carteira ao lado, para a decisao sair do volume e nao da ordem
-- alfabetica. `capturado` marca o tipo que aparece no objeto e nunca foi
-- puxado de `/vehicle/type/` — ele nao pode sumir da lista, e justamente
-- um que falta mapear (o `full join` da 0083, mesma razao).
create or replace function mutual_tipos_veiculo_externos()
returns table (
  id_externo   text,
  nome         text,
  capturado    boolean,
  veiculos     bigint,
  faturaveis   bigint,
  regional_id  uuid,
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
                                  'vistoria_pendente','inadimplente')) as faturaveis
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
  'O de-para de /vehicle/type/ com o PESO da carteira. O Mutual tem 3 tipos '
  'e o SCar tem 7 — "CARRO" nao decide entre Passeio e Pick-up/Van, entao a '
  'escolha e de quem conhece a carteira, nunca palpite da carga.';


-- =====================================================================
-- (C) A LEITURA — uma linha por objeto, com o motivo da recusa
-- =====================================================================
-- FONTE UNICA: a previa agrega sobre esta funcao e a execucao percorre
-- ela. A 0082 pagou o preco de ter quatro lugares lendo a unidade de
-- formas diferentes (tres nasceram divergentes); aqui nao ha um segundo
-- lugar para divergir.
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
           mutual_tipo_veiculo_do_externo(o.payload#>>'{vehicle_data,vehicle_type}') as tipo_id,
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
-- (D) A PREVIA — o que aconteceria, em numeros
-- =====================================================================
create or replace function mutual_carga_previa(
  p_regional_id      uuid,
  p_incluir_inativos boolean default false
)
returns table (
  grupo      text,
  indicador  text,
  valor      bigint,
  detalhe    text,
  severidade text
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

  return query
  with l as (
    select * from mutual_carga_linhas(p_regional_id, p_incluir_inativos, false, null)
  )
  select 'ENTRA', 'Associados a criar', count(distinct l.id_pessoa)::bigint,
         'Um cliente por pessoa do Mutual, mesmo com varios veiculos', 'OK'
    from l where l.problema is null and l.cliente_id is null
  union all
  select 'ENTRA', 'Associados ja vinculados', count(distinct l.id_pessoa)::bigint,
         'Reaproveitados pelo vinculo ou pelo CPF — a carga nunca duplica', 'OK'
    from l where l.problema is null and l.cliente_id is not null
  union all
  select 'ENTRA', 'Veiculos a criar', count(*)::bigint,
         'Entram ATIVOS e com cobranca_externa: nenhuma fatura e gerada aqui', 'OK'
    from l where l.problema is null and l.acao = 'CRIAR'
  union all
  select 'ENTRA', 'Veiculos a atualizar', count(*)::bigint,
         'Ja carregados antes. A re-execucao atualiza o que o Mutual e dono', 'OK'
    from l where l.problema is null and l.acao = 'ATUALIZAR'
  -- recusas ----------------------------------------------------------------
  union all
  select 'RECUSA', 'Linhas recusadas', count(*)::bigint,
         case when count(*) = 0 then 'Nenhuma: o lote entra inteiro'
              else 'Cada uma com o motivo em mutual_carga_linhas(..., true)' end,
         case when count(*) = 0 then 'OK' else 'ATENCAO' end
    from l where l.problema is not null
  union all
  select 'RECUSA', 'Sem placa (0 km)', count(*)::bigint,
         'veiculos.placa e not null. Cobre a placa, recapture e rode de novo', 'ATENCAO'
    from l where l.problema like 'SEM PLACA%'
  union all
  select 'RECUSA', 'CPF/CNPJ ausente ou invalido', count(*)::bigint,
         'chk_documento_valido recusaria de qualquer jeito', 'ATENCAO'
    from l where l.problema like 'CPF/CNPJ%' or l.problema like 'Associado sem CPF%'
  union all
  select 'RECUSA', 'Colisao de placa/chassi/renavam', count(*)::bigint,
         'As tres colunas sao unique: a carga pararia no meio', 'ATENCAO'
    from l where l.problema like '%repetid%' or l.problema like '%ja cadastrad%'
  union all
  select 'RECUSA', 'Sem data de ativacao', count(*)::bigint,
         'Nem first_activation_date nem created_at: entraria "ativado hoje"', 'ATENCAO'
    from l where l.problema like 'Sem data de ativacao%'
  -- fila de trabalho (entra, mas incompleto) --------------------------------
  union all
  select 'FILA', 'Entram SEM valor de mensalidade', count(*)::bigint,
         'Entra NULL, nunca zero (zero vaza para o cotar_plano). '
         || 'Esta fila tem de estar vazia ANTES do cutover', 'ATENCAO'
    from l where l.problema is null and l.valor_mensalidade is null
  union all
  select 'FILA', 'Entram SEM dia de vencimento', count(*)::bigint,
         'Sem ele a cobranca cai no padrao legado (dia 10 do mes seguinte)', 'ATENCAO'
    from l where l.problema is null and l.dia_vencimento is null
  union all
  select 'FILA', 'Entram SEM tipo de veiculo', count(*)::bigint,
         'De-para de /vehicle/type/ nao registrado. Nao afeta a cobranca '
         || 'enquanto cobranca_externa esta ligada', 'ATENCAO'
    from l where l.problema is null and l.tipo_veiculo_id is null
  union all
  select 'FILA', 'Entram SEM plano de protecao', count(*)::bigint,
         'De-para de plan_id nao registrado. E preciso antes do cutover', 'ATENCAO'
    from l where l.problema is null and l.plano_id is null
  union all
  select 'FILA', 'Ativacao ESTIMADA pelo created_at', count(*)::bigint,
         'Sem first_activation_date; a data e a melhor aproximacao que existe', 'ATENCAO'
    from l where l.problema is null and l.ativacao_estimada
  union all
  select 'FILA', 'Entram SEM cor no catalogo', count(*)::bigint,
         'A cor entra como texto e aparece em cores_nao_reconhecidas (0080)', 'OK'
    from l where l.problema is null and l.cor_id is null
  union all
  select 'FILA', 'Entram SEM endereco', count(*)::bigint,
         'O /address/ do associado nao foi capturado ou nao existe', 'OK'
    from l where l.problema is null and l.endereco = '{}'::jsonb
  order by 1, 3 desc;
end;
$$;

comment on function mutual_carga_previa(uuid, boolean) is
  'A previa da carga de UMA unidade: o que entra, o que e recusado e com que '
  'motivo, e a FILA do que entra incompleto. O grupo FILA e o que precisa estar '
  'vazio antes do cutover — nao antes da carga.';


-- =====================================================================
-- (E) A EXECUCAO
-- =====================================================================
-- ATOMICA de proposito (mesma escolha de `importar_vendedores`, 0069):
-- meia carteira carregada e pior que nenhuma. O que impede a explosao e
-- a PREVIA — e as recusas nao abortam, sao relatadas.
create or replace function mutual_executar_carga(
  p_regional_id      uuid,
  p_incluir_inativos boolean default false,
  p_confirmar        boolean default false
)
returns table (
  clientes_criados    bigint,
  clientes_atualizados bigint,
  veiculos_criados    bigint,
  veiculos_atualizados bigint,
  recusados           bigint,
  mensagem            text
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
  v_nome     text;
begin
  -- A carga escreve na operacao inteira: e da matriz, nunca da unidade.
  if not tem_acesso_global() then
    raise exception 'Somente a matriz pode executar a carga do Mutual';
  end if;

  if p_regional_id is null then
    raise exception 'A carga e POR UNIDADE: informe a regional';
  end if;

  select nome into v_nome from regionais where id = p_regional_id;
  if v_nome is null then
    raise exception 'Regional % nao existe', p_regional_id;
  end if;

  select count(*) into v_rec
    from mutual_carga_linhas(p_regional_id, p_incluir_inativos, true, null);

  if not p_confirmar then
    -- Sem confirmacao nao escreve nada. A previa detalhada e
    -- `mutual_carga_previa`; aqui o retorno e so a contagem.
    -- ASSOCIADO se conta por PESSOA, nao por linha: dois veiculos do mesmo
    -- associado sao UM cliente (e foi assim que a primeira versao errou).
    select count(distinct l.id_pessoa) filter (where l.problema is null and l.cliente_id is null),
           count(distinct l.id_pessoa) filter (where l.problema is null and l.cliente_id is not null),
           count(*)                    filter (where l.problema is null and l.acao = 'CRIAR'),
           count(*)                    filter (where l.problema is null and l.acao = 'ATUALIZAR')
      into c_cria, c_atu, v_cria, v_atu
      from mutual_carga_linhas(p_regional_id, p_incluir_inativos, false, null) l;

    return query select c_cria, c_atu, v_cria, v_atu, v_rec,
      'SIMULACAO (p_confirmar = false): nada foi gravado em ' || v_nome;
    return;
  end if;

  c_cria := 0; c_atu := 0;

  for r in
    select * from mutual_carga_linhas(p_regional_id, p_incluir_inativos, false, null)
     where problema is null
     -- Agrupado pelo DOCUMENTO: os veiculos do mesmo associado saem juntos,
     -- e ai o cliente e tratado UMA vez por pessoa.
     order by cpf_cnpj, id_objeto
  loop
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
        -- Quem manda na convivencia e o Mutual (decisao 4), mas so no que
        -- ele e dono: `coalesce` para nao APAGAR o que o SAC preencheu e o
        -- Mutual nao tem.
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
    if r.veiculo_id is null then
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
      v_veiculo := r.veiculo_id;

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
  end loop;

  return query select c_cria, c_atu, v_cria, v_atu, v_rec,
    'Carga de ' || v_nome || ' concluida. Os veiculos entraram com '
    || 'cobranca_externa: nenhuma fatura foi gerada. O cutover e '
    || 'definir_cobranca_externa_regional.';
end;
$$;

comment on function mutual_executar_carga(uuid, boolean, boolean) is
  'A carga de UMA unidade, re-executavel pelo vinculo. Sem p_confirmar nao '
  'escreve nada. Todo veiculo entra com cobranca_externa = true, entao '
  'veiculo_faturavel devolve false e nenhuma das 5 rotas de fatura da 0025 '
  'dispara — a mina nº 1 desarmada no DADO, nao na sessao.';


-- =====================================================================
-- (F) O CAMINHO DE VOLTA
-- =====================================================================
-- Piloto sem desfazer nao e piloto: e producao sem plano. A volta e pelo
-- VINCULO, nunca por "tudo que foi criado hoje" — e ela PARA quando
-- alguem ja trabalhou em cima, porque ai a linha nao e mais so uma copia
-- do Mutual.
create or replace function veiculo_tem_movimento(p_veiculo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from atendimentos a             where a.veiculo_id = p_veiculo_id)
      or exists (select 1 from eventos_sinistro e         where e.veiculo_id = p_veiculo_id)
      or exists (select 1 from acionamentos_assistencia s where s.veiculo_id = p_veiculo_id)
      or exists (select 1 from rastreadores ra            where ra.veiculo_id = p_veiculo_id)
      or exists (select 1 from vistorias vi               where vi.veiculo_id = p_veiculo_id)
      or exists (select 1 from fatura_itens fi            where fi.veiculo_id = p_veiculo_id)
      or exists (select 1 from titulos_financeiros t      where t.veiculo_id = p_veiculo_id);
$$;

comment on function veiculo_tem_movimento(uuid) is
  'O veiculo ja tem trabalho do SCar em cima (protocolo, evento, acionamento, '
  'rastreador, vistoria, item de fatura, titulo)? E o que impede mutual_desfazer_carga '
  'de apagar uma linha que deixou de ser so uma copia do Mutual.';


create or replace function mutual_desfazer_carga(
  p_regional_id uuid,
  p_confirmar   boolean default false
)
returns table (
  veiculos_removidos bigint,
  clientes_removidos bigint,
  preservados        bigint,
  mensagem           text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_veic bigint := 0;
  v_cli  bigint := 0;
  v_pres bigint := 0;
  v_nome text;
begin
  if not tem_acesso_global() then
    raise exception 'Somente a matriz pode desfazer a carga do Mutual';
  end if;

  select nome into v_nome from regionais where id = p_regional_id;
  if v_nome is null then
    raise exception 'Regional % nao existe', p_regional_id;
  end if;

  -- CTE, nao tabela temporaria: `create temp table` dentro de plpgsql
  -- deixa o plano em cache apontando para um OID que o `on commit drop`
  -- destruiu, e a SEGUNDA chamada na mesma sessao morre com "relation
  -- with OID ... does not exist". Foi a mordida da primeira versao da 0078.
  select count(*) into v_pres
    from veiculos v
    join integracao_vinculos iv
      on iv.sistema = 'MUTUAL' and iv.entidade = 'CONTRACT_OBJECT'
     and iv.tabela = 'veiculos' and iv.registro_id = v.id
   where v.regional_id = p_regional_id
     and veiculo_tem_movimento(v.id);

  if not p_confirmar then
    select count(*) into v_veic
      from veiculos v
      join integracao_vinculos iv
        on iv.sistema = 'MUTUAL' and iv.entidade = 'CONTRACT_OBJECT'
       and iv.tabela = 'veiculos' and iv.registro_id = v.id
     where v.regional_id = p_regional_id
       and not veiculo_tem_movimento(v.id);

    return query select v_veic, 0::bigint, v_pres,
      'SIMULACAO: nada foi removido de ' || v_nome;
    return;
  end if;

  with alvo as (
    select v.id
      from veiculos v
      join integracao_vinculos iv
        on iv.sistema = 'MUTUAL' and iv.entidade = 'CONTRACT_OBJECT'
       and iv.tabela = 'veiculos' and iv.registro_id = v.id
     where v.regional_id = p_regional_id
       and not veiculo_tem_movimento(v.id)
  )
  delete from veiculos v where v.id in (select id from alvo);
  get diagnostics v_veic = row_count;

  delete from integracao_vinculos iv
   where iv.sistema = 'MUTUAL' and iv.entidade = 'CONTRACT_OBJECT'
     and iv.tabela = 'veiculos'
     and not exists (select 1 from veiculos v where v.id = iv.registro_id);

  -- O associado sai apenas quando nao sobrou veiculo nele E ele veio da
  -- carga (tem vinculo). Cliente com fatura, titulo ou protocolo fica.
  with orfao as (
    select c.id
      from clientes c
      join integracao_vinculos iv
        on iv.sistema = 'MUTUAL' and iv.entidade = 'PERSON'
       and iv.tabela = 'clientes' and iv.registro_id = c.id
     where c.regional_id = p_regional_id
       and not exists (select 1 from veiculos v            where v.cliente_id = c.id)
       and not exists (select 1 from faturas f             where f.cliente_id = c.id)
       and not exists (select 1 from titulos_financeiros t where t.cliente_id = c.id)
       and not exists (select 1 from atendimentos a        where a.cliente_id = c.id)
  )
  delete from clientes c where c.id in (select id from orfao);
  get diagnostics v_cli = row_count;

  delete from integracao_vinculos iv
   where iv.sistema = 'MUTUAL' and iv.entidade = 'PERSON'
     and iv.tabela = 'clientes'
     and not exists (select 1 from clientes c where c.id = iv.registro_id);

  return query select v_veic, v_cli, v_pres,
    'Carga de ' || v_nome || ' desfeita. ' || v_pres
    || ' veiculo(s) PRESERVADO(S) por ja terem movimento no SCar.';
end;
$$;

comment on function mutual_desfazer_carga(uuid, boolean) is
  'O caminho de volta da carga, pelo VINCULO. Veiculo com protocolo, evento, '
  'acionamento, titulo, fatura ou rastreador e PRESERVADO: a partir dali a '
  'linha nao e mais so uma copia do Mutual, e apagar seria perder trabalho.';


-- =====================================================================
-- Rito de seguranca (0052).
-- =====================================================================
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
