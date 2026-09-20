-- =====================================================================
-- SCar :: 0082_carga_mutual_preparacao.sql
--
-- As TRES pecas que faltavam para a carga do Mutual poder rodar. Nenhuma
-- delas carrega coisa alguma: a regra da Fase 1 continua de pe, e ha teste
-- provando que `clientes`, `veiculos`, `titulos_financeiros` e `faturas`
-- seguem intactos depois desta migration.
--
-- ---------------------------------------------------------------------
-- (A) A UNIDADE SAI DO ASSOCIADO — e a corrente do CONSULTOR estava MORTA
-- ---------------------------------------------------------------------
-- A 0073/0074 montaram um funil de quatro saltos
--   objeto.consultant -> /association/consultant/ -> documento/e-mail
--   -> vendedores -> regional_id
-- porque `regional` vinha vazio no objeto e no contrato. Medido na base
-- real em 20/09/2026, com TUDO capturado:
--
--     objeto.consultant    ->  0 de 17.675
--     contrato.consultant  ->  0 de 17.616
--
-- O funil do consultor da ZERO no SEGUNDO degrau. O instrumento esta
-- certo; a corrente que ele mede nao existe nestes dados. E a unidade
-- estava, o tempo todo, no ASSOCIADO:
--
--     PERSON.regional_id   ->  12.628 de 12.628   (100%)
--
-- e os 9 valores distintos casam todos com uma filial capturada.
--
-- 🔴 A LICAO, E ELA E NOVA NESTE MODULO: o erro NAO foi chutar o nome da
--    chave — era `regional_id` mesmo, e ela existe no objeto e no contrato,
--    sempre vazia. Foi procura-la na ENTIDADE errada. `mutual_campos` (0065)
--    so responde sobre a entidade que voce perguntou: antes de concluir que
--    um dado "nao veio", inspecione tambem as entidades VIZINHAS.
--
-- O elo e `objeto.person_data.person_id` -> PERSON -> `regional_id`: DOIS
-- saltos, join exato por id, contra quatro saltos por texto. Cobertura
-- medida na carteira viva: 3.409 de 3.440 = 99,1%, acima do corte de 95%
-- que o proprio modulo fixou na 0073.
--
-- A 0073/0074 NAO sao apagadas. Instrumento que prova que uma corrente
-- esta vazia e resultado, nao lixo — e no dia em que o Mutual passar a
-- preencher `consultant` ele volta a valer. O que muda e quem a TELA usa
-- para decidir.
--
-- ---------------------------------------------------------------------
-- (B) A TABELA DE VINCULO — `integracao_vinculos`
-- ---------------------------------------------------------------------
-- NENHUMA tabela da operacao guarda id externo: tudo e chave natural
-- (`cpf_cnpj`, `placa`). Sem vinculo a segunda carga DUPLICA, porque CPF e
-- corrigido, placa e transferida e registro em quarentena nao tem linha
-- onde pendurar id. E "a primeira carga nunca e a definitiva".
--
-- 🔴 O UNIQUE E SO NO LADO EXTERNO, de proposito. Um id do Mutual aponta
--    para UM registro daqui; mas DOIS ids do Mutual podem apontar para o
--    MESMO registro — e o diagnostico ja conta esse caso ("Associados
--    repetidos (mesmo CPF): viram UM cliente no SCar; a tabela de vinculo
--    guarda os dois ids"). Um unique do lado de ca recusaria exatamente a
--    reconciliacao que a tabela existe para permitir.
--
-- O primeiro uso e HOJE, nao na Fase 3: o de-para das 10 filiais do Mutual
-- para as regionais do SCar mora aqui. Ver a nota do palpite em (A2).
--
-- ---------------------------------------------------------------------
-- (C) O INTERRUPTOR DA COBRANCA — `veiculos.cobranca_externa`
-- ---------------------------------------------------------------------
-- A mina nº 1 do CLAUDE.md, intacta ate aqui: `trg_veiculo_primeira_cobranca`
-- (0025) roda `after insert` e chama `gerar_primeira_cobranca_veiculo`.
-- Carregar 3.440 veiculos ativos geraria 3.440 faturas do mes corrente —
-- cobrar de novo quem ja paga no Mutual.
--
-- 🔴 A GUC `scar.importacao` NAO resolve isto, e por isso nao foi o caminho
--    escolhido: ela e LOCAL A TRANSACAO, entao protege a janela da carga e
--    NAO protege o lote de faturamento rodado tres meses depois. A flag
--    protege os dois, porque vive no DADO e nao na sessao.
--
-- 🔴 UMA CONDICAO COBRE OS CINCO CAMINHOS. Os quatro pontos de geracao de
--    fatura (0025, linhas 49/206/237/317) e o trigger da entrada na base
--    passam TODOS por `veiculo_faturavel` (0024). Uma condicao la dentro
--    fecha todos de uma vez — e virar a flag por regional E o cutover.
--
-- 🔴 COBRANCA EXTERNA NAO E BLOQUEIO. O associado segue ATIVO e com todos
--    os beneficios: 24h, evento, carro reserva, portal. So a MENSALIDADE
--    nao e emitida aqui. Quem bloqueia beneficio e `inadimplente`/`suspenso`
--    (0072), que sao outra coisa. Efeito colateral desejado: sem titulo
--    nosso, `dias_atraso_cliente()` da zero e a 24h nao recusa o associado
--    por uma divida que esta base nem enxerga.
--
-- 🔴 ELA NAO APARECE NO FORMULARIO DO VEICULO, pela mesma razao que
--    `inadimplente` nao aparece (0072): e decisao de CUTOVER por unidade,
--    nao marcacao de atendente. Quem vira e `definir_cobranca_externa_regional`.
--
-- Hoje a flag e no-op: nenhum veiculo nasce com ela, e `default false`
-- preserva a carteira inteira exatamente como esta. Ha teste dos dois lados.
-- =====================================================================


-- =====================================================================
-- (A1) A UNIDADE, PELO ASSOCIADO
-- =====================================================================

-- As chaves candidatas, em UM lugar so. Existem para nao chutar UMA — e
-- para o diagnostico e o resolvedor de linha nao divergirem calados.
-- Ha teste provando que os dois concordam sobre o mesmo objeto.
create or replace function mutual_chaves_regional()
returns text[]
language sql
immutable
as $$
  select array['regional_id', 'regional', 'regional_externo_id'];
$$;

comment on function mutual_chaves_regional() is
  'Chaves candidatas da unidade no payload do Mutual. Medido em 20/09/2026: '
  '`regional_id` vem preenchido em PERSON (100%) e VAZIO no objeto e no contrato.';


-- O resolvedor de UMA linha — e o que a carga (Fase 3) vai usar.
-- Precedencia: ASSOCIADO manda; objeto e contrato sao reserva.
-- Nao e simetrico por acaso: o contrato do Mutual guarda VARIOS veiculos de
-- VARIOS donos, entao a unidade dele (se um dia vier) fala do titular, nao
-- daquele carro — e o dono daquele carro e quem `person_data` aponta.
create or replace function mutual_regional_externa(p_objeto jsonb, p_contrato jsonb default null)
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select mutual_texto_em(p.payload, mutual_chaves_regional())
       from mutual_captura p
      where p.entidade = 'PERSON'
        and not p.deletado
        and p.id_externo = mutual_texto(p_objeto #>> '{person_data,person_id}')),
    mutual_texto_em(p_objeto,   mutual_chaves_regional()),
    mutual_texto_em(p_contrato, mutual_chaves_regional())
  );
$$;

comment on function mutual_regional_externa(jsonb, jsonb) is
  'O id EXTERNO da unidade de um objeto do Mutual. O ASSOCIADO manda '
  '(PERSON.regional_id, 100% preenchido); objeto e contrato sao reserva e hoje '
  'vem vazios. Espelhado no join de mutual_diagnostico — mexeu num, mexa no outro.';


-- =====================================================================
-- (B) A TABELA DE VINCULO
-- =====================================================================
create table if not exists integracao_vinculos (
  id           bigserial primary key,
  sistema      text not null default 'MUTUAL',
  entidade     text not null,          -- PERSON | CONTRACT_OBJECT | REGIONAL | INVOICE | ...
  id_externo   text not null,
  tabela       text not null,          -- a tabela do SCar que recebeu o registro
  registro_id  uuid not null,
  observacao   text,
  criado_por   uuid references usuarios(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- Um id do Mutual aponta para UM registro. O caminho inverso NAO e unico
  -- de proposito — ver a nota (B) no cabecalho.
  constraint uq_vinculo_externo unique (sistema, entidade, id_externo),

  -- Allow-list: `tabela` e texto e vai ser escrito por rotina de carga.
  -- Sem a trava, um erro de digitacao cria vinculo que nunca resolve nada
  -- e ninguem descobre — o registro que mente com confianca de sempre.
  constraint chk_vinculo_tabela check (tabela in (
    'regionais', 'clientes', 'veiculos', 'titulos_financeiros',
    'faturas', 'eventos_sinistro', 'cores', 'tipos_veiculo', 'planos_protecao'
  )),
  constraint chk_vinculo_sistema  check (btrim(sistema)  <> ''),
  constraint chk_vinculo_entidade check (btrim(entidade) <> ''),
  constraint chk_vinculo_externo  check (btrim(id_externo) <> '')
);

create index if not exists idx_vinculo_registro
  on integracao_vinculos (sistema, entidade, tabela, registro_id);

comment on table integracao_vinculos is
  'A ponte entre o id do sistema de origem e o registro do SCar. Nenhuma tabela '
  'da operacao guarda id externo (tudo e chave natural), e sem esta ponte a '
  'segunda carga duplica: CPF e corrigido, placa e transferida.';
comment on column integracao_vinculos.registro_id is
  'Sem FK de proposito: a coluna aponta para tabelas diferentes conforme `tabela`. '
  'A integridade e mantida pela rotina de carga e conferida por vinculos_orfaos().';

drop trigger if exists trg_vinculos_updated on integracao_vinculos;
create trigger trg_vinculos_updated
  before update on integracao_vinculos
  for each row execute function set_updated_at();

-- RLS: a equipe LE o vinculo (a Central precisa mostrar "veio do Mutual");
-- so a MATRIZ escreve, pela mesma razao de `mutual_registrar_captura` (0062)
-- — carga e da matriz.
alter table integracao_vinculos enable row level security;

drop policy if exists vinc_select on integracao_vinculos;
create policy vinc_select on integracao_vinculos
  for select to authenticated using (is_staff());

drop policy if exists vinc_write on integracao_vinculos;
create policy vinc_write on integracao_vinculos
  for all to authenticated
  using (tem_acesso_global()) with check (tem_acesso_global());


-- Grava (ou atualiza) o vinculo. Re-executavel: a carga roda de novo e o
-- upsert reaponta em vez de estourar no unique.
create or replace function vincular_externo(
  p_entidade    text,
  p_id_externo  text,
  p_tabela      text,
  p_registro_id uuid,
  p_sistema     text default 'MUTUAL',
  p_observacao  text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  -- `auth.uid() is null` e o caminho de servidor (service_role), padrao da 0052.
  if auth.uid() is not null and not tem_acesso_global() then
    raise exception 'Somente a matriz pode registrar vinculos de integracao';
  end if;

  if mutual_texto(p_id_externo) is null then
    raise exception 'Vinculo sem id externo';
  end if;

  insert into integracao_vinculos (sistema, entidade, id_externo, tabela, registro_id,
                                   observacao, criado_por)
  values (upper(btrim(p_sistema)), upper(btrim(p_entidade)), mutual_texto(p_id_externo),
          btrim(p_tabela), p_registro_id, mutual_texto(p_observacao), auth.uid())
  on conflict (sistema, entidade, id_externo) do update
     set tabela      = excluded.tabela,
         registro_id = excluded.registro_id,
         observacao  = coalesce(excluded.observacao, integracao_vinculos.observacao),
         updated_at  = now()
  returning id into v_id;

  return v_id;
end;
$$;

comment on function vincular_externo(text, text, text, uuid, text, text) is
  'Registra o de-para id externo -> registro do SCar. Re-executavel (upsert): '
  'a carga NUNCA e definitiva na primeira vez.';


-- Desfaz um vinculo (o de-para de filial escolhido errado, por exemplo).
create or replace function desvincular_externo(
  p_entidade   text,
  p_id_externo text,
  p_sistema    text default 'MUTUAL'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  if auth.uid() is not null and not tem_acesso_global() then
    raise exception 'Somente a matriz pode remover vinculos de integracao';
  end if;

  delete from integracao_vinculos
   where sistema  = upper(btrim(p_sistema))
     and entidade = upper(btrim(p_entidade))
     and id_externo = mutual_texto(p_id_externo);

  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;


-- O registro do SCar de um id externo. E a consulta que a carga faz para
-- decidir entre INSERT e UPDATE.
create or replace function registro_do_externo(
  p_entidade   text,
  p_id_externo text,
  p_sistema    text default 'MUTUAL'
)
returns uuid
language sql
stable
set search_path = public
as $$
  select v.registro_id
    from integracao_vinculos v
   where v.sistema    = upper(btrim(p_sistema))
     and v.entidade   = upper(btrim(p_entidade))
     and v.id_externo = mutual_texto(p_id_externo);
$$;


-- Vinculo que aponta para registro que nao existe mais (alguem apagou o
-- veiculo, a fatura foi cancelada e removida). Sem FK, e isto que vigia.
create or replace function vinculos_orfaos()
returns table (
  sistema     text,
  entidade    text,
  tabela      text,
  quantidade  bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_staff() then
    raise exception 'Somente a equipe pode ler os vinculos da integracao';
  end if;

  return query
  select v.sistema, v.entidade, v.tabela, count(*)::bigint
    from integracao_vinculos v
   where case v.tabela
           when 'regionais'           then not exists (select 1 from regionais           t where t.id = v.registro_id)
           when 'clientes'            then not exists (select 1 from clientes            t where t.id = v.registro_id)
           when 'veiculos'            then not exists (select 1 from veiculos            t where t.id = v.registro_id)
           when 'titulos_financeiros' then not exists (select 1 from titulos_financeiros t where t.id = v.registro_id)
           when 'faturas'             then not exists (select 1 from faturas             t where t.id = v.registro_id)
           when 'eventos_sinistro'    then not exists (select 1 from eventos_sinistro    t where t.id = v.registro_id)
           when 'cores'               then not exists (select 1 from cores               t where t.id = v.registro_id)
           when 'tipos_veiculo'       then not exists (select 1 from tipos_veiculo       t where t.id = v.registro_id)
           when 'planos_protecao'     then not exists (select 1 from planos_protecao     t where t.id = v.registro_id)
           else false
         end
   group by 1, 2, 3
   order by 4 desc;
end;
$$;


-- =====================================================================
-- (A2) A FILIAL DO MUTUAL -> A REGIONAL DO SCar
-- =====================================================================
-- 🔴 SO A DECISAO REGISTRADA VALE. O palpite por CNPJ/nome continua onde
--    sempre esteve — em `mutual_filiais.ja_existe_id`, rotulado como palpite,
--    para ACELERAR a decisao de quem olha. Ele NAO entra aqui: `regional_id`
--    atravessa RLS, `escopo_regional()` e todos os paineis, e uma carteira
--    de 4.712 associados posta na unidade errada por casamento de nome e um
--    estrago que ninguem ve acontecer. Mesma postura do preco na 0081: o que
--    e decidido por acaso e o pior desfecho possivel.
create or replace function mutual_regional_do_externo(p_id_externo text)
returns uuid
language sql
stable
set search_path = public
as $$
  select v.registro_id
    from integracao_vinculos v
   where v.sistema    = 'MUTUAL'
     and v.entidade   = 'REGIONAL'
     and v.tabela     = 'regionais'
     and v.id_externo = mutual_texto(p_id_externo);
$$;

comment on function mutual_regional_do_externo(text) is
  'A regional do SCar de uma filial do Mutual, pelo VINCULO registrado. '
  'Nunca por palpite: o palpite vive em mutual_filiais.ja_existe_id, so para a tela.';


-- =====================================================================
-- (A3) O FUNIL DA UNIDADE — a corrente medida degrau a degrau
-- =====================================================================
-- Mesma forma de OUT do funil do consultor (0073/0074), de proposito: a
-- tela e o tipo do TS sao os mesmos. O que muda e a corrente medida.
--
-- Nao se aceita uma corrente pelo desenho; mede-se. E o que decide nao e o
-- total, e ONDE ela quebra: "faltam 31" nao e tarefa; "31 caem porque o
-- associado nao foi capturado" e.
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
  v_pessoas  bigint;
  v_filiais  bigint;
begin
  if not is_staff() then
    raise exception 'Somente a equipe pode ler o diagnostico da integracao';
  end if;

  select count(*) into v_pessoas
    from mutual_captura where entidade = 'PERSON' and not deletado;
  select count(*) into v_filiais
    from mutual_captura where entidade = 'REGIONAL' and not deletado;

  return query
  with pe as (
    -- Uma linha por associado: `id_externo` e unico em mutual_captura
    -- (0062), entao este join NAO multiplica o objeto — a mordida da 0073.
    select p.id_externo,
           mutual_texto_em(p.payload, mutual_chaves_regional()) as unidade
      from mutual_captura p
     where p.entidade = 'PERSON' and not p.deletado
  ),
  base as (
    select mutual_status_veiculo(o.payload->>'contract_status', o.payload->>'status') as st,
           mutual_texto(o.payload #>> '{person_data,person_id}')                      as pessoa,
           pe.id_externo                                                              as pessoa_capt,
           pe.unidade                                                                 as unidade
      from mutual_captura o
      left join pe on pe.id_externo = o.payload #>> '{person_data,person_id}'
     where o.entidade = 'CONTRACT_OBJECT' and not o.deletado
  ),
  alvo as (
    select * from base
     where st is not null
       and (not p_somente_faturaveis
            or st::text in ('ativo', 'em_evento', 'vistoria_pendente'))
  ),
  -- Cada salto e uma coluna booleana sobre a MESMA linha: assim `perdidos`
  -- e subtracao honesta, e nao a diferenca entre duas consultas que
  -- filtraram universos diferentes (licao da 0074).
  passos as (
    select a.pessoa is not null                                    as tem_pessoa,
           a.pessoa_capt is not null                               as capturada,
           a.unidade is not null                                   as tem_unidade,
           (a.unidade is not null
            and exists (select 1 from mutual_captura f
                         where f.entidade = 'REGIONAL' and not f.deletado
                           and f.id_externo = a.unidade))          as filial_existe,
           mutual_regional_do_externo(a.unidade) is not null       as tem_depara
      from alvo a
  ),
  t as (
    select count(*)                                    as n_total,
           count(*) filter (where tem_pessoa)          as n_pessoa,
           count(*) filter (where capturada)           as n_capt,
           count(*) filter (where tem_unidade)         as n_unid,
           count(*) filter (where filial_existe)       as n_filial,
           count(*) filter (where tem_depara)          as n_dep
      from passos
  )
  select 1, 'Objetos considerados', t.n_total, 0::bigint,
         case when p_somente_faturaveis then 'so a carteira viva (faturaveis)'
              else 'todo objeto importavel' end
    from t
  union all
  select 2, 'Com o associado identificado', t.n_pessoa, t.n_total - t.n_pessoa,
         'person_data.person_id no proprio objeto' from t
  union all
  select 3, 'Associado capturado (/person/)', t.n_capt, t.n_pessoa - t.n_capt,
         case when v_pessoas = 0
              then 'PUXE OS ASSOCIADOS: a unidade mora neles'
              else 'o objeto aponta para um /person/ que esta na area de captura' end
    from t
  union all
  select 4, 'Associado COM unidade declarada', t.n_unid, t.n_capt - t.n_unid,
         'PERSON.regional_id — e aqui que a unidade do Mutual mora' from t
  union all
  select 5, 'Unidade casa com filial capturada', t.n_filial, t.n_unid - t.n_filial,
         case when v_filiais = 0
              then 'PUXE AS FILIAIS (/association/regional/)'
              else 'o regional_id do associado existe em /regional/' end
    from t
  union all
  select 6, 'Filial JA mapeada para uma regional do SCar', t.n_dep, t.n_filial - t.n_dep,
         'de-para REGISTRADO (integracao_vinculos). Palpite por nome NAO conta aqui: '
         'e a decisao que decide de quem e a carteira'
    from t
  order by 1;
end;
$$;

comment on function mutual_cobertura_unidade(boolean) is
  'O funil da UNIDADE pelo associado (0082). Substitui mutual_cobertura_consultor '
  'como instrumento: medido em 20/09/2026, objeto.consultant vem vazio em 100%.';


-- A 0073/0074 continuam de pe — e agora com o resultado da medicao escrito
-- nelas, para a proxima sessao nao repetir a investigacao.
comment on function mutual_cobertura_consultor(boolean, text[], text[], text[]) is
  'O funil da unidade pelo CONSULTOR (0073/0074). MEDIDO EM 20/09/2026 COM A BASE '
  'COMPLETA: `consultant` vem vazio em 0 de 17.675 objetos e 0 de 17.616 contratos, '
  'entao ele da ZERO no degrau 2 — a corrente nao existe NESTES dados. Mantido '
  'porque provar que uma corrente esta vazia e resultado, e porque ele volta a '
  'valer no dia em que o Mutual passar a preencher o campo. A unidade em uso hoje '
  'e mutual_cobertura_unidade() (0082).';


-- =====================================================================
-- (A4) AS FILIAIS — a tela do de-para
-- =====================================================================
-- 🔴 A VERSAO ANTERIOR CONTAVA ZERO EM TODAS. Ela agrupava por
--    `objeto.regional`, que vem vazio em 100%: as 10 filiais apareciam com
--    "0 objetos" e a tela sugeria, sem querer, que nao havia carteira
--    nenhuma para mapear. Agora conta pelo ASSOCIADO.
--
-- Muda a lista de OUT (entram `faturaveis`, `associados` e `regional_id`,
-- e `ja_existe_id` vira `palpite_id`), entao e DROP + CREATE.
drop function if exists mutual_filiais();
create function mutual_filiais()
returns table (
  id_externo   text,
  nome         text,
  cnpj         text,
  objetos      bigint,     -- tudo que entraria na base
  faturaveis   bigint,     -- a carteira viva: e este numero que decide
  associados   bigint,
  regional_id  uuid,       -- o de-para REGISTRADO (integracao_vinculos)
  palpite_id   uuid        -- casamento por CNPJ/nome. SO para a tela decidir.
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
  with reg as (
    select c.id_externo,
           mutual_texto(coalesce(c.payload->>'fantasy_name', c.payload->>'name')) as nome,
           mutual_texto(c.payload->>'cpf_cnpj')                                   as cnpj
      from mutual_captura c
     where c.entidade = 'REGIONAL' and not c.deletado
  ),
  pe as (
    select p.id_externo,
           mutual_texto_em(p.payload, mutual_chaves_regional()) as unidade
      from mutual_captura p
     where p.entidade = 'PERSON' and not p.deletado
  ),
  obj as (
    -- MESMA precedencia do resolvedor, do diagnostico e da quarentena:
    -- associado manda, objeto e reserva. Sao QUATRO lugares que leem a
    -- unidade, e o teste do espelho existe para nenhum andar sozinho.
    select coalesce(pe.unidade,
                    mutual_texto_em(o.payload, mutual_chaves_regional())) as unidade,
           mutual_status_veiculo(o.payload->>'contract_status', o.payload->>'status') as st
      from mutual_captura o
      left join pe on pe.id_externo = o.payload #>> '{person_data,person_id}'
     where o.entidade = 'CONTRACT_OBJECT' and not o.deletado
  ),
  uso as (
    select obj.unidade as id_ext,
           count(*) filter (where obj.st is not null)::bigint as n_obj,
           count(*) filter (where obj.st::text
                 in ('ativo','em_evento','vistoria_pendente'))::bigint as n_fat
      from obj where obj.unidade is not null
     group by 1
  ),
  pessoas as (
    select pe.unidade as id_ext, count(*)::bigint as n
      from pe where pe.unidade is not null group by 1
  )
  select r.id_externo, r.nome, r.cnpj,
         coalesce(u.n_obj, 0), coalesce(u.n_fat, 0), coalesce(q.n, 0),
         mutual_regional_do_externo(r.id_externo),
         (select g.id from regionais g
           where (r.cnpj is not null
                  and regexp_replace(coalesce(g.cnpj, ''), '\D', '', 'g')
                    = regexp_replace(r.cnpj, '\D', '', 'g'))
              or upper(btrim(g.nome)) = upper(btrim(coalesce(r.nome, '')))
           order by g.id      -- desempate ESTAVEL (licao da 0074)
           limit 1)
    from reg r
    left join uso     u on u.id_ext = r.id_externo
    left join pessoas q on q.id_ext = r.id_externo
   order by 5 desc, 4 desc, 2;
end;
$$;

comment on function mutual_filiais() is
  'As filiais do Mutual com o peso da carteira e o de-para. `regional_id` e a '
  'DECISAO registrada; `palpite_id` e casamento por CNPJ/nome e NAO e usado pela '
  'carga — ele existe so para acelerar a escolha de quem olha.';


-- =====================================================================
-- (A5) O DIAGNOSTICO — a unidade passa a sair do associado
-- =====================================================================
-- Mesma lista de OUT, entao `create or replace` basta. O que muda:
--   . `unidade` sai do ASSOCIADO (era `contrato.regional` -> `objeto.regional`,
--     os dois vazios em 100%, e por isso o indicador acusava a carteira inteira);
--   . grupo novo UNIDADE, com os TRES motivos separados — sem unidade, associado
--     nao capturado, filial sem de-para. Motivo junto e fila que ninguem trabalha;
--   . VOLUME ganha "Associados capturados", porque a regra da 0064 vale aqui
--     tambem: enquanto ninguem puxou /person/, o indicador manda PUXAR em vez
--     de acusar o dado.
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
  v_pessoas   bigint;
  v_filiais   bigint;
begin
  if not is_staff() then
    raise exception 'Somente a equipe pode ler o diagnostico da integracao';
  end if;

  select count(*) into v_contratos
    from mutual_captura where entidade = 'CONTRACT' and not deletado;
  select count(*) into v_pessoas
    from mutual_captura where entidade = 'PERSON' and not deletado;
  select count(*) into v_filiais
    from mutual_captura where entidade = 'REGIONAL' and not deletado;

  return query
  with ct as (
    select c.id_externo,
           mutual_texto(c.payload->>'due_day')                  as dia,
           mutual_texto_em(c.payload, mutual_chaves_regional()) as unidade
      from mutual_captura c
     where c.entidade = 'CONTRACT' and not c.deletado
  ),
  -- 0082: a UNIDADE mora no ASSOCIADO (PERSON.regional_id, 100% preenchido).
  -- `id_externo` e unico em mutual_captura, entao este join nao multiplica
  -- o objeto. Espelha a precedencia de `mutual_regional_externa` — ha teste
  -- provando que os dois concordam.
  pe as (
    select p.id_externo,
           mutual_texto_em(p.payload, mutual_chaves_regional()) as unidade
      from mutual_captura p
     where p.entidade = 'PERSON' and not p.deletado
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
           -- 0082: ASSOCIADO manda; objeto e contrato sao reserva (hoje vazios).
           coalesce(pe.unidade, mutual_texto_em(o.payload, mutual_chaves_regional()),
                    ct.unidade)                                       as unidade,
           pe.id_externo is not null                                  as pessoa_capt,
           mutual_texto(o.payload->>'first_activation_date')          as ativacao,
           nullif(o.payload->>'final_total_value','')::numeric        as vlr,
           o.payload->>'contract_id'                                  as contrato
      from mutual_captura o
      left join ct on ct.id_externo = o.payload->>'contract_id'
      left join pe on pe.id_externo = o.payload #>> '{person_data,person_id}'
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
              then 'PUXE OS CONTRATOS: o dia de vencimento mora la, nao no objeto'
              else 'Fonte do dia de vencimento. A UNIDADE nao: ela mora no associado (0082)' end,
         case when v_contratos = 0 then 'ATENCAO' else 'OK' end
  union all
  select 'VOLUME', 'Associados capturados (/person/)', v_pessoas,
         case when v_pessoas = 0
              then 'PUXE OS ASSOCIADOS: e neles que a UNIDADE mora (0082)'
              else 'Fonte da unidade. O objeto e o contrato trazem regional_id VAZIO' end,
         case when v_pessoas = 0 then 'ATENCAO' else 'OK' end
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
         'A unidade tambem vale para o historico (regional_id atravessa a RLS de veiculos), mas nao bloqueia a carga. Fonte: o associado',
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
  select 'UNIDADE', 'Faturavel sem unidade', count(*)::bigint,
         case when v_pessoas = 0
              then 'PUXE OS ASSOCIADOS (/person/): a unidade mora neles, nao no objeto nem no contrato'
              else 'Sem unidade a carteira nasceria toda na MATRIZ — e aqui regional_id nulo '
                   'significa matriz, nao "sem unidade" (0067/0069)' end,
         case when count(*) = 0 then 'OK'
              when v_pessoas = 0 then 'ATENCAO' else 'CRITICO' end
    from fat where unidade is null
  union all
  select 'UNIDADE', 'Faturavel com o associado NAO capturado', count(*)::bigint,
         case when v_pessoas = 0
              then 'Ninguem puxou /person/ ainda — este numero nao prova nada. PUXE OS ASSOCIADOS'
              else 'O objeto aponta para um /person/ que nao esta na area de captura. Recapturar '
                   'os associados resolve; e a causa mais provavel de "faturavel sem unidade"' end,
         case when count(*) = 0 then 'OK' else 'ATENCAO' end
    from fat where not pessoa_capt
  union all
  select 'UNIDADE', 'Faturavel em filial SEM de-para', count(*)::bigint,
         case when v_filiais = 0
              then 'As filiais ainda NAO foram puxadas (/association/regional/) — puxe antes de ler'
              else 'A unidade veio, mas a filial do Mutual ainda nao foi mapeada para uma regional '
                   'do SCar. E a decisao que decide de quem e a carteira — palpite por nome NAO vale' end,
         case when count(*) = 0 then 'OK'
              when v_filiais = 0 then 'ATENCAO' else 'CRITICO' end
    from fat
   where unidade is not null
     and v_filiais > 0
     and mutual_regional_do_externo(unidade) is null
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


-- =====================================================================
-- (A6) A QUARENTENA ganha os motivos da UNIDADE
-- =====================================================================
-- Mesma assinatura e mesma lista de OUT (os motivos sao um text[]), entao
-- basta recriar. Os tres motivos sao SEPARADOS de proposito: "sem unidade"
-- e uma fila que ninguem sabe trabalhar; "o associado nao foi capturado",
-- "a filial nao foi mapeada" e "o Mutual nao preencheu" sao tres tarefas
-- diferentes, de tres pessoas diferentes.
-- A assinatura e a lista de OUT sao as MESMAS da 0071, entao `create or
-- replace` basta — e um `drop` aqui derrubaria a funcao em uso enquanto a
-- migration roda.
create or replace function mutual_quarentena(
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
declare
  v_pessoas bigint;
  v_filiais bigint;
begin
  if not is_staff() then
    raise exception 'Somente a equipe pode ler o diagnostico da integracao';
  end if;

  select count(*) into v_pessoas
    from mutual_captura where entidade = 'PERSON' and not deletado;
  select count(*) into v_filiais
    from mutual_captura where entidade = 'REGIONAL' and not deletado;

  return query
  with ct as (
    select c.id_externo, mutual_texto(c.payload->>'due_day') as dia
      from mutual_captura c
     where c.entidade = 'CONTRACT' and not c.deletado
  ),
  pe as (   -- 0082: a unidade vem do ASSOCIADO
    select p.id_externo,
           mutual_texto_em(p.payload, mutual_chaves_regional()) as unidade
      from mutual_captura p
     where p.entidade = 'PERSON' and not p.deletado
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
           nullif(o.payload->>'final_total_value','')::numeric       as valor,
           -- MESMA precedencia do resolvedor e do diagnostico: associado
           -- manda, objeto e reserva. Ha teste provando que os tres batem.
           coalesce(pe.unidade,
                    mutual_texto_em(o.payload, mutual_chaves_regional())) as unidade,
           pe.id_externo is not null                                 as pessoa_capt
      from mutual_captura o
      left join ct on ct.id_externo = o.payload->>'contract_id'
      left join pe on pe.id_externo = o.payload #>> '{person_data,person_id}'
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
                   and a.dia is null then 'SEM_DIA_VENCIMENTO' end,
             -- 0082: sem unidade a linha entraria na MATRIZ em silencio, e aqui
             -- `regional_id is null` SIGNIFICA matriz (0067/0069). Nao e detalhe
             -- de cadastro: e a carteira de uma franquia mudando de dono.
             -- 🔴 A REGRA DA 0064 VALE AQUI: enquanto a entidade que guarda
             -- o dado NAO foi capturada, a fila fica CALADA em vez de acusar
             -- a carteira inteira. Sem /person/ puxado, TODO objeto seria
             -- ASSOCIADO_NAO_CAPTURADO — e o falso alarme em massa ja afogou
             -- o sinal real duas vezes neste modulo (0063 e 0064). Quem manda
             -- PUXAR e o diagnostico e o funil; a fila e so do que da para
             -- trabalhar hoje.
             case when v_pessoas = 0     then null
                  when not a.pessoa_capt then 'ASSOCIADO_NAO_CAPTURADO'
                  when a.unidade is null then 'SEM_UNIDADE'
                  when v_filiais = 0     then null
                  when mutual_regional_do_externo(a.unidade) is null
                                         then 'FILIAL_SEM_DEPARA' end
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


-- =====================================================================
-- (C) O INTERRUPTOR DA COBRANCA
-- =====================================================================
alter table veiculos
  add column if not exists cobranca_externa       boolean not null default false,
  add column if not exists cobranca_externa_desde date;

comment on column veiculos.cobranca_externa is
  'A mensalidade deste veiculo e cobrada FORA do SCar (hoje: no Mutual). O veiculo '
  'segue ATIVO e com todos os beneficios — so nao gera fatura aqui. Virar para false '
  'por regional E o cutover.';
comment on column veiculos.cobranca_externa_desde is
  'Quando a cobranca passou a ser externa. Carimbado por trigger; serve para explicar '
  'na ficha por que aquele veiculo nao tem boleto.';

-- O relogio, no padrao de `veiculos.status_desde` (0072) e
-- `rastreadores.status_desde` (0050): a aplicacao esquece, a trigger nao.
-- `clock_timestamp()` nao e preciso aqui (e date), mas o gatilho e
-- `update of cobranca_externa` — corrigir a cor do carro nao mexe na data.
create or replace function fn_veiculo_cobranca_externa()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.cobranca_externa then
      new.cobranca_externa_desde := coalesce(new.cobranca_externa_desde, current_date);
    end if;
    return new;
  end if;

  if new.cobranca_externa is distinct from old.cobranca_externa then
    new.cobranca_externa_desde :=
      case when new.cobranca_externa then current_date else null end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_veiculo_cobranca_externa_ins on veiculos;
create trigger trg_veiculo_cobranca_externa_ins
  before insert on veiculos
  for each row execute function fn_veiculo_cobranca_externa();

drop trigger if exists trg_veiculo_cobranca_externa_upd on veiculos;
create trigger trg_veiculo_cobranca_externa_upd
  before update of cobranca_externa on veiculos
  for each row execute function fn_veiculo_cobranca_externa();


-- 🔴 A CONDICAO QUE FECHA OS CINCO CAMINHOS DE UMA VEZ.
-- `veiculo_faturavel` e chamada pelos quatro pontos de geracao de fatura
-- (0025, linhas 49/206/237/317) e por `gerar_primeira_cobranca_veiculo`,
-- que e quem o trigger da entrada na base dispara. Uma condicao aqui
-- protege a janela da carga E o lote rodado meses depois — que e
-- exatamente o que a GUC `scar.importacao` NAO faria, por ser local a
-- transacao.
create or replace function veiculo_faturavel(p_veiculo_id uuid, p_competencia date)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from veiculos v
     where v.id = p_veiculo_id
       -- `inadimplente` esta aqui de PROPOSITO (0072): ele ainda tem
       -- contrato, so perdeu os beneficios. Quem para de gerar mensalidade
       -- e `inativo`.
       and v.status::text in ('ativo', 'em_evento', 'vistoria_pendente', 'inadimplente')
       -- 0082: quem e cobrado por fora nao gera fatura aqui. NAO e bloqueio
       -- de beneficio — e so a mensalidade que sai de outro sistema.
       and not v.cobranca_externa
       and (
         v.data_ativacao is null
         or v.data_ativacao <= (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date
       )
  );
$$;

comment on function veiculo_faturavel(uuid, date) is
  'Quem gera mensalidade NESTE sistema. Inclui `inadimplente` (0072: contrato vivo, '
  'beneficio bloqueado) e EXCLUI `cobranca_externa` (0082: contrato vivo, cobranca '
  'em outro sistema). E o unico interruptor dos 4 caminhos de fatura da 0025.';


-- O CUTOVER: vira a chave de uma unidade inteira. So a matriz, porque
-- ligar isto errado para de cobrar uma franquia em silencio — e desligar
-- errado cobra de novo quem ja pagou no outro sistema.
create or replace function definir_cobranca_externa_regional(
  p_regional_id uuid,
  p_externa     boolean,
  p_motivo      text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  if auth.uid() is not null and not tem_acesso_global() then
    raise exception 'Somente a matriz decide o cutover da cobranca';
  end if;

  if p_externa is null then
    raise exception 'Informe se a cobranca passa a ser externa';
  end if;

  -- Desligar e o movimento perigoso: a partir dai a unidade passa a emitir
  -- boleto aqui. Exigir o motivo e barato e fica na trilha do veiculo.
  if not p_externa and mutual_texto(p_motivo) is null then
    raise exception 'Ao trazer a cobranca para o SCar, informe o motivo (e o cutover da unidade)';
  end if;

  update veiculos v
     set cobranca_externa = p_externa
   where v.cobranca_externa is distinct from p_externa
     and (p_regional_id is null and v.regional_id is null
          or v.regional_id = p_regional_id);

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function definir_cobranca_externa_regional(uuid, boolean, text) is
  'O cutover por unidade. p_regional_id nulo e a MATRIZ (convencao do projeto), '
  'nao "todas as unidades" — ver 0067/0069.';


-- O retrato: quantos veiculos cada unidade ainda cobra por fora.
create or replace function cobranca_externa_resumo()
returns table (
  regional_id   uuid,
  regional      text,
  externos      bigint,
  proprios      bigint,
  total         bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_staff() then
    raise exception 'Somente a equipe pode ler o resumo da cobranca';
  end if;

  return query
  select g.id,
         coalesce(g.nome, 'Matriz'),
         count(*) filter (where v.cobranca_externa)::bigint,
         count(*) filter (where not v.cobranca_externa)::bigint,
         count(*)::bigint
    from veiculos v
    left join regionais g on g.id = v.regional_id
   where v.status::text in ('ativo', 'em_evento', 'vistoria_pendente', 'inadimplente')
     and (tem_acesso_global() or pode_regional(v.regional_id))
   group by g.id, g.nome
   order by 3 desc, 2;
end;
$$;


-- =====================================================================
-- Rito de seguranca (0052).
-- =====================================================================
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
