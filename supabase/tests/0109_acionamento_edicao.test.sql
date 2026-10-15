-- Teste funcional da 0109: o atendimento da 24h e editavel e cancelavel ANTES
-- da OS (agendamento, solicitante), tudo auditado; a chamada antiga segue valendo.
\set ON_ERROR_STOP on
do $$
declare
  u uuid := gen_random_uuid();
  r_id uuid; c_id uuid; tv uuid; v1 uuid; s_reboque uuid;
  a acionamentos_assistencia; n int; ok boolean;
begin
  insert into auth.users (id, email) values (u, 'op109@teste.com');
  insert into regionais (nome) values ('Regional 109') returning id into r_id;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u, 'Operador', 'op109@teste.com', 'admin', r_id);
  perform set_config('request.jwt.claim.sub', u::text, false);

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF', 'Assistido 109', '11144477735', r_id) returning id into c_id;
  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;
  insert into veiculos (cliente_id, placa, modelo, regional_id, tipo_veiculo_id, status)
    values (c_id, 'AGD1A09', 'Onix', r_id, tv, 'ativo') returning id into v1;
  select id into s_reboque from servicos_assistencia where descricao = 'Reboque Passeio';

  select * into a from abrir_acionamento(v1, s_reboque, 'Assistido', '11999998888');
  assert a.agendado_para is null, 'acionamento nasce imediato';

  -- agenda, troca o solicitante, antes de qualquer OS
  select * into a from atualizar_acionamento(
    a.id, p_agendado_para := '2026-10-20 14:30:00-03', p_solicitante_nome := 'Filha do associado',
    p_solicitante_telefone := '11988887777', p_motivo := 'Associado pediu para amanha a tarde');
  assert a.agendado_para = '2026-10-20 14:30:00-03'::timestamptz, 'agendamento gravado';
  assert a.solicitante_nome = 'Filha do associado' and a.solicitante_telefone = '11988887777', 'solicitante trocado';
  assert a.codigo_os is null, 'editar nao gera OS';

  select count(*) into n from acionamento_edicoes
   where acionamento_id = a.id and campo = 'agendado_para' and valor_novo = '20/10/2026 14:30'
     and motivo = 'Associado pediu para amanha a tarde';
  assert n = 1, 'agendamento auditado em horario de Sao Paulo com motivo';
  select count(*) into n from acionamento_edicoes where acionamento_id = a.id and campo in ('solicitante_nome','solicitante_telefone');
  assert n = 2, 'solicitante auditado';

  -- remarca e depois limpa
  select * into a from atualizar_acionamento(a.id, p_agendado_para := '2026-10-21 09:00:00-03', p_motivo := 'Remarcado');
  assert a.agendado_para = '2026-10-21 09:00:00-03'::timestamptz, 'remarcado';
  select * into a from atualizar_acionamento(a.id, p_limpar_agendamento := true, p_motivo := 'Virou imediato');
  assert a.agendado_para is null, 'agendamento limpo';
  assert a.solicitante_nome = 'Filha do associado', 'texto vazio/nulo nao apaga o solicitante';

  ok := false;
  begin
    perform atualizar_acionamento(a.id, p_agendado_para := now(), p_limpar_agendamento := true);
  exception when others then ok := true;
  end;
  assert ok, 'data nova + limpar ao mesmo tempo e recusado';

  -- chamada posicional antiga (0027) continua valendo
  select * into a from atualizar_acionamento(a.id, null, null, null, null, null, 45, 'obs nova', 'Ajuste');
  assert a.prazo_estimado_min = 45 and a.observacoes = 'obs nova', 'chamada antiga intacta';
  select count(*) into n from acionamento_edicoes where acionamento_id = a.id and campo = 'observacoes';
  assert n = 1, 'observacoes auditadas';

  -- desistencia ANTES da OS
  select * into a from cancelar_acionamento(a.id, 'Associado desistiu');
  assert a.status = 'CANCELADO' and a.cancelado_motivo = 'Associado desistiu', 'cancelado antes da OS';
  ok := false;
  begin
    perform atualizar_acionamento(a.id, p_agendado_para := now());
  exception when others then ok := true;
  end;
  assert ok, 'cancelado nao se edita';

  assert (select count(*) from pg_proc where proname = 'atualizar_acionamento') = 1, 'uma versao so (sem sobrecarga)';

  perform set_config('request.jwt.claim.sub', '', false);
  raise notice '=== TESTES DA 0109 PASSARAM ===';
end $$;
