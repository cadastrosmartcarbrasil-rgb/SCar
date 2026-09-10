-- Teste funcional da 0072 — o status `inadimplente` do veiculo.
--
-- O que esta suite prova, e que nenhuma outra provava:
--   (A) o relogio existe e reinicia a cada troca de status — sem ele nao ha
--       "20 dias inadimplente" para o CRON contar;
--   (B) inadimplente CONTINUA FATURAVEL. E a decisao mais perigosa da
--       migration ao contrario do que parece: deixa-lo de fora faria a
--       carteira inadimplente parar de ser cobrada em silencio no dia em que o
--       CRON entrasse;
--   (C) os beneficios ficam BLOQUEADOS, com motivo que diz o que resolver;
--   (D) o rastreador segue o ciclo em DOIS passos e nao fica preso no meio;
--   (E) a tolerancia e parametro, e a contagem regressiva le esse parametro.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  r1 uuid; cli uuid; tv uuid; pl uuid;
  v_ativo uuid; v_inad uuid; v_inat uuid; eq uuid;
  n int; txt text; ok boolean; d1 timestamptz; d2 timestamptz;
  rec record; sit record;
begin
  insert into auth.users (id, email) values (u_adm,'adm72@t.com');
  insert into regionais (nome) values ('Cuiaba 72') returning id into r1;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm,'Admin','adm72@t.com','admin', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  select id into tv from tipos_veiculo where nome = 'Passeio';
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','MARIA INADIMPLENTE','52998224725', r1) returning id into cli;

  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao)
    values (cli,'INA1A23', r1, tv, 'ativo', current_date - 400) returning id into v_ativo;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao)
    values (cli,'INA2B34', r1, tv, 'ativo', current_date - 400) returning id into v_inad;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao)
    values (cli,'INA3C45', r1, tv, 'ativo', current_date - 400) returning id into v_inat;

  -- ==========================================================================
  -- (A) O RELOGIO
  -- ==========================================================================
  assert (select status_desde is not null from veiculos where id = v_inad),
    'veiculo nasce com status_desde — sem isso o CRON nao teria de onde contar';

  select status_desde into d1 from veiculos where id = v_inad;
  perform pg_sleep(0.01);
  perform set_config('scar.motivo_status_veiculo', 'Mensalidade 02/2026 em atraso', true);
  update veiculos set status = 'inadimplente' where id = v_inad;
  select status_desde, status_motivo into d2, txt from veiculos where id = v_inad;

  assert d2 > d1, 'trocar de status reinicia o relogio';
  assert txt = 'Mensalidade 02/2026 em atraso',
    'o motivo digitado chega ao banco pela GUC, como na auditoria da OS 24h';

  -- Editar OUTRA coluna nao pode mexer no relogio: corrigir a cor do carro nao
  -- e um evento de status, e reiniciar a contagem daria sobrevida a quem deve.
  select status_desde into d1 from veiculos where id = v_inad;
  update veiculos set cor = 'PRATA' where id = v_inad;
  select status_desde into d2 from veiculos where id = v_inad;
  assert d1 = d2, 'mexer em campo que nao e status NAO reinicia a tolerancia';

  -- ==========================================================================
  -- (B) FATURAMENTO — inadimplente CONTINUA sendo cobrado
  -- ==========================================================================
  assert veiculo_faturavel(v_inad, date_trunc('month', current_date)::date),
    'INADIMPLENTE FATURA: ele ainda tem contrato, so perdeu os beneficios. '
    'Tira-lo daqui faria a associacao parar de cobrar justamente quem deve.';

  update veiculos set status = 'inativo' where id = v_inat;
  assert not veiculo_faturavel(v_inat, date_trunc('month', current_date)::date),
    'INATIVO nao fatura — e a passagem para ca que encerra a cobranca';

  assert veiculo_faturavel(v_ativo, date_trunc('month', current_date)::date),
    'ativo segue faturando (a 0024 nao foi quebrada)';

  -- ==========================================================================
  -- (C) BENEFICIOS BLOQUEADOS, e o motivo diz o que resolver
  -- ==========================================================================
  select * into sit from situacao_assistencia_veiculo(v_inad);
  assert not sit.pode_acionar,
    'inadimplente NAO aciona a assistencia 24h';
  assert sit.inadimplente,
    'a ficha marca o veiculo como inadimplente';
  assert exists (select 1 from unnest(sit.motivos) m where m like '%INADIMPLENTE%'),
    'o motivo nomeia a inadimplencia';
  assert exists (select 1 from unnest(sit.motivos) m where m like '%regulariza%'),
    'o motivo diz o que resolver, nao apenas "necessario ATIVO"';

  select * into sit from situacao_assistencia_veiculo(v_ativo);
  assert sit.pode_acionar, 'veiculo ativo e adimplente continua acionando';

  -- ==========================================================================
  -- (D) O RASTREADOR EM DOIS PASSOS — e sem ficar preso no meio
  -- ==========================================================================
  insert into fornecedores (tipo_pessoa, documento, razao_social, empresa_rastreamento)
    values ('PJ','11222333000181','D TRAKER LTDA', true) returning id into pl;
  insert into rastreadores (imei, empresa_rastreamento_id, regional_id, linha)
    values ('860123456789099', pl, r1, '65999998888') returning id into eq;
  perform instalar_rastreador(eq, v_ativo);
  select status into txt from rastreadores where id = eq;
  assert txt = 'ATIVO', 'equipamento instalado';

  -- passo 1: tolerancia — suspende, NAO pede o aparelho de volta
  update veiculos set status = 'inadimplente' where id = v_ativo;
  select status, data_desinstalacao into txt, d1 from rastreadores where id = eq;
  assert txt = 'INADIMPLENTE',
    'a tolerancia suspende o rastreamento (3), nao manda recolher';
  assert d1 is null,
    'durante a tolerancia o equipamento NAO e dado como desinstalado';

  -- passo 2: fim da tolerancia — recolhe, mesmo vindo de INADIMPLENTE
  update veiculos set status = 'inativo' where id = v_ativo;
  select status, data_desinstalacao into txt, d1 from rastreadores where id = eq;
  assert txt = 'INATIVO',
    'ESTE e o buraco que a 0072 fecha: o laco antigo so pegava equipamento '
    'em ATIVO, entao o que a tolerancia deixou em INADIMPLENTE nunca chegaria '
    'ao recolhimento quando o veiculo saisse da base';
  assert d1 is not null, 'agora sim, desinstalado';

  -- ==========================================================================
  -- (E) A TOLERANCIA E PARAMETRO, e a contagem le o parametro
  -- ==========================================================================
  assert tolerancia_inadimplencia() = 20,
    'sem empresa cadastrada, o padrao pedido e 20 dias';

  insert into empresa (razao_social) values ('SMART CAR BRASIL');
  assert tolerancia_inadimplencia() = 20, 'empresa nova nasce com os 20 dias';

  update empresa set dias_tolerancia_inadimplencia = 30;
  assert tolerancia_inadimplencia() = 30, 'mudar a regra e cadastro, nao deploy';

  begin
    update empresa set dias_tolerancia_inadimplencia = 400;
    assert false, 'tolerancia absurda deveria ser recusada pelo banco';
  exception when check_violation then null;
  end;
  update empresa set dias_tolerancia_inadimplencia = 20;

  -- a contagem regressiva
  update veiculos set status = 'inadimplente' where id = v_inad;
  update veiculos set status_desde = now() - interval '12 days' where id = v_inad;

  select * into rec from situacao_inadimplencia_veiculo(v_inad);
  assert rec.inadimplente, 'esta inadimplente';
  assert rec.dias_no_status = 12, format('12 dias no status, veio %s', rec.dias_no_status);
  assert rec.dias_restantes = 8, format('faltam 8 dias, veio %s', rec.dias_restantes);
  assert not rec.tolerancia_vencida, 'ainda dentro da tolerancia';

  update veiculos set status_desde = now() - interval '20 days' where id = v_inad;
  select * into rec from situacao_inadimplencia_veiculo(v_inad);
  assert rec.tolerancia_vencida,
    'no 20o dia a tolerancia vence — e este o gatilho que o CRON vai ler';
  assert rec.dias_restantes = 0, 'nao ha dias negativos na tela';

  -- veiculo que nao esta inadimplente nao tem contagem nenhuma
  select * into rec from situacao_inadimplencia_veiculo(v_ativo);
  assert not rec.inadimplente and rec.dias_restantes is null and not rec.tolerancia_vencida,
    'quem nao esta inadimplente nao tem prazo correndo';

  -- ==========================================================================
  -- (F) ORDENACAO — o que tem relogio correndo aparece antes
  -- ==========================================================================
  assert ordem_status_veiculo('ativo') < ordem_status_veiculo('inadimplente'),
    'ativo primeiro';
  assert ordem_status_veiculo('inadimplente') < ordem_status_veiculo('suspenso'),
    'inadimplente antes de suspenso: e o unico com prazo correndo';
  assert ordem_status_veiculo('suspenso') < ordem_status_veiculo('inativo'),
    'a ordem que ja existia (0030) continua de pe';
  assert ordem_status_veiculo('inativo') < ordem_status_veiculo('baixado'),
    'a ordem que ja existia (0030) continua de pe';

  -- ==========================================================================
  -- (G) PAINEL DA 24H — inadimplente e BLOQUEADO, nao inativo
  -- ==========================================================================
  select veiculos_bloqueados into n
    from assist_painel_resumo(current_date - 30, current_date, r1);
  assert n >= 1,
    'inadimplente conta como BLOQUEADO — junta-lo aos inativos esconderia '
    'justamente a fatia recuperavel com uma cobranca';

  raise notice '=== TESTES 0072 (veiculo inadimplente) PASSARAM ===';
end $$;
