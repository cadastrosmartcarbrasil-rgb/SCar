-- Teste funcional da agenda de vendas (0045)
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_out uuid := gen_random_uuid();
  r1 uuid; r2 uuid; l_id uuid; l leads;
  n int; rec record;
begin
  insert into auth.users (id, email) values (u_adm, 'adm@t.com'), (u_out, 'outro@t.com');
  insert into regionais (nome, dias_sem_contato_lead) values ('Smart Centro', 5) returning id into r1;
  insert into regionais (nome) values ('Smart Litoral') returning id into r2;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm, 'Admin', 'adm@t.com', 'admin', null),
           (u_out, 'Consultor de fora', 'outro@t.com', 'consultor_vendas', r2);

  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  insert into leads (nome, celular, regional_id, consultor_id, created_by)
    values ('Joao da Silva', '11988887777', r1, u_adm, u_adm)
    returning id into l_id;

  -- ------------------------------------------------------- contato simples
  l := registrar_interacao_lead(l_id, 'LIGACAO', 'NAO_ATENDEU', 'caixa postal');
  assert l.ultima_interacao_em is not null, 'o contato tem de carimbar ultima_interacao_em';
  assert l.proximo_contato_em is null, 'contato sem agendamento nao inventa retorno';

  select count(*) into n from lead_interacoes where lead_id = l_id;
  assert n = 1, 'a interacao tem de ficar na trilha, veio ' || n;
  raise notice 'OK contato registrado carimba a ultima interacao';

  -- ------------------------------------------------------- validacoes
  begin
    perform registrar_interacao_lead(l_id, 'LIGACAO', 'AGENDOU', 'volto depois');
    assert false, 'agendamento sem data deveria ser recusado';
  exception when raise_exception then null; end;

  begin
    perform registrar_interacao_lead(l_id, 'LIGACAO', 'FALOU', null, now() - interval '2 days');
    assert false, 'retorno no passado deveria ser recusado';
  exception when raise_exception then null; end;

  begin
    perform registrar_interacao_lead(l_id, 'POMBO_CORREIO', 'FALOU');
    assert false, 'tipo desconhecido deveria ser recusado';
  exception when raise_exception then null; end;

  begin
    perform registrar_interacao_lead(l_id, 'LIGACAO', 'FALOU', null,
                                     now() + interval '1 day', null, true);
    assert false, 'limpar a agenda e marcar retorno ao mesmo tempo e contraditorio';
  exception when raise_exception then null; end;
  raise notice 'OK a RPC recusa agendamento vazio, data no passado, tipo invalido e ordem contraditoria';

  -- ------------------------------------------------------- agendamento
  l := registrar_interacao_lead(l_id, 'WHATSAPP', 'AGENDOU', 'mandou o print da concorrencia',
                                now() + interval '2 hours', 'levar comparativo Ouro x Diamante');
  assert l.proximo_contato_em is not null, 'o retorno combinado fica no lead';
  assert l.proximo_contato_nota = 'levar comparativo Ouro x Diamante', 'a nota do retorno acompanha';

  select count(*) into n from lead_interacoes
   where lead_id = l_id and proximo_contato_em is not null;
  assert n = 1, 'a interacao guarda o que foi combinado nela, veio ' || n;

  -- um contato depois, sem nova data, NAO apaga o compromisso vigente
  l := registrar_interacao_lead(l_id, 'LIGACAO', 'NAO_ATENDEU');
  assert l.proximo_contato_em is not null, 'contato sem data nova preserva a agenda';
  raise notice 'OK o retorno combinado fica no lead e sobrevive a um contato sem data';

  -- ------------------------------------------------------- agenda do dia
  select count(*) into n from agenda_vendas();
  assert n = 1, 'o retorno de hoje tem de estar na agenda, veio ' || n;

  select * into rec from agenda_vendas();
  assert rec.id = l_id, 'a agenda traz o lead certo';
  assert rec.dias_parado = 0, 'lead contatado hoje esta parado ha 0 dias, veio ' || rec.dias_parado;

  -- retorno para semana que vem sai da lista de hoje
  perform registrar_interacao_lead(l_id, 'LIGACAO', 'AGENDOU', null, now() + interval '8 days');
  select count(*) into n from agenda_vendas();
  assert n = 0, 'retorno futuro nao entra na lista de hoje, veio ' || n;

  select count(*) into n from agenda_vendas(now() + interval '30 days');
  assert n = 1, 'com a janela aberta o retorno futuro aparece, veio ' || n;
  raise notice 'OK a agenda separa o que vence hoje do que ainda vai vencer';

  -- lead perdido some da agenda mesmo com retorno marcado
  perform mover_lead_status(l_id, 'PERDIDO', 'fechou com concorrente');
  select count(*) into n from agenda_vendas(now() + interval '30 days');
  assert n = 0, 'lead perdido nao ocupa a agenda, veio ' || n;
  update leads set status = 'NOVO' where id = l_id;
  raise notice 'OK lead perdido sai da agenda';

  -- ------------------------------------------------------- parado ha N dias
  update leads set ultima_interacao_em = now() - interval '11 days' where id = l_id;

  select * into rec from leads_kanban();
  assert rec.dias_parado = 11, 'o Kanban conta os dias sem contato, veio ' || rec.dias_parado;
  assert rec.limite_sem_contato = 5, 'o limite vem da franquia (5), veio ' || rec.limite_sem_contato;
  assert rec.proximo_contato_em is not null, 'o card conhece o retorno combinado';

  -- mexer no cadastro NAO conta como trabalhar o lead
  update leads set valor_fipe = 55000 where id = l_id;
  select * into rec from leads_kanban();
  assert rec.dias_parado = 11, 'editar a FIPE nao zera o contador, veio ' || rec.dias_parado;
  raise notice 'OK "parado ha N dias" conta contato, nao edicao de cadastro';

  -- ------------------------------------------------------- limpar a agenda
  l := registrar_interacao_lead(l_id, 'OBSERVACAO', 'SEM_INTERESSE', 'pediu para nao insistir',
                                null, null, true);
  assert l.proximo_contato_em is null, 'a agenda foi limpa';
  assert l.proximo_contato_nota is null, 'a nota do retorno saiu junto';
  raise notice 'OK da para tirar o lead da agenda sem apagar o historico';

  -- ------------------------------------------------------- permissao
  perform set_config('request.jwt.claim.sub', u_out::text, false);
  assert not pode_tratar_lead(l_id), 'consultor de outra regional nao trata este lead';
  begin
    perform registrar_interacao_lead(l_id, 'LIGACAO', 'FALOU', 'nao deveria entrar');
    assert false, 'consultor de outra regional nao pode registrar contato';
  exception when raise_exception then null; end;

  select count(*) into n from agenda_vendas(now() + interval '30 days');
  assert n = 0, 'a agenda so mostra o que o usuario enxerga, veio ' || n;
  raise notice 'OK a trava de propriedade vale para contato e agenda';

  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  select count(*) into n from lead_interacoes where lead_id = l_id;
  assert n = 5, 'o historico de contatos e imutavel e completo, veio ' || n;

  raise notice '=== TESTES 0045 (agenda de vendas) PASSARAM ===';
end $$;
