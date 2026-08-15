-- Teste funcional do REFINO DO CRM (0028): pipeline/Kanban, cotacao editavel
-- com trava de itens obrigatorios e politica de desconto por regional.
\set ON_ERROR_STOP on
do $$
declare
  u_vend uuid := gen_random_uuid();
  u_gest uuid := gen_random_uuid();
  r_id uuid; tv uuid; plano uuid; lead uuid;
  c cotacoes; l leads; rec record; n int;
  p_obrig uuid; p_opc1 uuid; p_opc2 uuid;
begin
  -- setup -------------------------------------------------------------------
  insert into auth.users (id, email) values (u_vend, 'vend@teste.com'), (u_gest, 'gestor@teste.com');
  insert into regionais (nome, percentual_maximo_desconto_venda)
    values ('Franquia Campinas', 5) returning id into r_id;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_vend, 'Vendedor', 'vend@teste.com', 'consultor_vendas', r_id),
           (u_gest, 'Gestor Regional', 'gestor@teste.com', 'gestor_regional', r_id);
  perform set_config('request.jwt.claim.sub', u_vend::text, false);

  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;
  if tv is null then insert into tipos_veiculo (nome) values ('Passeio') returning id into tv; end if;
  select id into plano from planos_protecao where ativo order by nivel limit 1;

  -- lead do vendedor
  insert into leads (nome, celular, marca, modelo, valor_fipe, tipo_veiculo_id, consultor_id, regional_id)
    values ('Cliente Kanban', '11999990000', 'Chevrolet', 'Onix', 50000, tv, u_vend, r_id)
    returning id into lead;

  -- ------------------------------------------------------------ A) pipeline
  assert (select status::text from leads where id = lead) = 'NOVO', 'lead nasce em NOVO';

  perform mover_lead_status(lead, 'ORCAMENTO_GERADO');
  perform mover_lead_status(lead, 'PROPOSTA_ENVIADA');
  select * into l from mover_lead_status(lead, 'EM_NEGOCIACAO');
  assert l.status::text = 'EM_NEGOCIACAO', format('status = %s', l.status);

  -- trilha do funil registrada
  select count(*) into n from lead_historico where lead_id = lead;
  assert n >= 4, format('historico do funil = %s', n);

  -- status invalido e perda sem motivo sao bloqueados
  begin
    perform mover_lead_status(lead, 'ATIVO');
    raise exception 'nao pode mover para ATIVO pelo funil';
  exception when others then
    assert sqlerrm like '%invalido%', format('mensagem inesperada: %s', sqlerrm);
  end;
  begin
    perform mover_lead_status(lead, 'PERDIDO');
    raise exception 'perda sem motivo deveria falhar';
  exception when others then
    assert sqlerrm like '%motivo da perda%', format('mensagem inesperada: %s', sqlerrm);
  end;
  raise notice 'OK pipeline (mover_lead_status + trilha)';

  -- --------------------------------------------------------- B) cotacao
  -- cria a cotacao base (como o app faz no /vendas/novo)
  insert into cotacoes (lead_id, fipe, tipo_veiculo_id, plano_id, itens, total_mensalidade, taxa_adesao, participacao, created_by)
    select lead, 50000, tv, plano,
           coalesce(calc->'detalhamento_produtos', '[]'::jsonb),
           (calc->>'valor_total_mensalidade')::numeric,
           coalesce((calc->>'taxa_adesao')::numeric, 0),
           coalesce((calc->>'franquia_participacao')::numeric, 0),
           u_vend
      from (select cotar_plano(50000, tv, plano) as calc) x
    returning * into c;
  assert c.total_mensalidade > 0, format('mensalidade inicial = %s', c.total_mensalidade);
  assert c.total_com_desconto = c.total_mensalidade, 'sem desconto, total espelha a mensalidade';

  -- opcionais: pega um produto opcional ativo para incluir
  select id into p_opc1 from produtos where status and not obrigatorio
    and id not in (select produto_id from produtos_obrigatorios_cotacao(tv, plano, 50000)) limit 1;

  if p_opc1 is not null then
    select * into c from atualizar_cotacao(c.id, null, null, null, null, array[p_opc1]);
    assert c.opcionais_ids = array[p_opc1], 'opcional gravado na cotacao';
    assert exists (
      select 1 from jsonb_array_elements(c.itens) i where (i->>'produto_id')::uuid = p_opc1
    ), 'opcional entrou no snapshot';
    -- e os obrigatorios continuam la
    assert not exists (
      select 1 from produtos_obrigatorios_cotacao(tv, plano, 50000) o
       where not exists (select 1 from jsonb_array_elements(c.itens) i where (i->>'produto_id')::uuid = o.produto_id)
    ), 'itens obrigatorios preservados';

    -- remover o opcional volta ao pacote do plano (obrigatorios intactos)
    select * into c from atualizar_cotacao(c.id, null, null, null, null, '{}'::uuid[]);
    assert not exists (
      select 1 from jsonb_array_elements(c.itens) i where (i->>'produto_id')::uuid = p_opc1
    ), 'opcional removido';
    assert not exists (
      select 1 from produtos_obrigatorios_cotacao(tv, plano, 50000) o
       where not exists (select 1 from jsonb_array_elements(c.itens) i where (i->>'produto_id')::uuid = o.produto_id)
    ), 'obrigatorios continuam apos remover opcional';
  end if;

  -- trocar a FIPE recalcula o snapshot
  select * into c from atualizar_cotacao(c.id, 80000);
  assert c.fipe = 80000, 'fipe atualizada';
  raise notice 'OK cotacao editavel (opcionais livres, obrigatorios travados)';

  -- ---------------------------------------------------------- C) desconto
  -- dentro do limite da franquia (5%)
  select * into c from atualizar_cotacao(c.id, null, null, null, null, null, null, 5);
  assert c.desconto_percentual = 5, 'desconto aplicado';
  assert c.desconto_aprovado_por is null, 'dentro do limite nao precisa de aprovacao';
  assert c.total_com_desconto = round(c.total_mensalidade * 0.95, 2),
    format('mensalidade com desconto = %s', c.total_com_desconto);
  assert c.adesao_com_desconto = round(c.taxa_adesao * 0.95, 2), 'adesao com desconto';

  -- acima do limite pelo vendedor: bloqueia
  begin
    perform atualizar_cotacao(c.id, null, null, null, null, null, null, 12);
    raise exception 'desconto acima do limite deveria bloquear';
  exception when others then
    assert sqlerrm like 'DESCONTO_ACIMA_DO_LIMITE%', format('mensagem inesperada: %s', sqlerrm);
  end;

  -- gestor tambem precisa de justificativa
  perform set_config('request.jwt.claim.sub', u_gest::text, false);
  assert pode_aprovar_desconto(), 'gestor regional tem alcada';
  begin
    perform aplicar_desconto_cotacao(c.id, 12, null);
    raise exception 'excecao sem justificativa deveria falhar';
  exception when others then
    assert sqlerrm like '%justificativa%', format('mensagem inesperada: %s', sqlerrm);
  end;

  -- gestor libera a excecao
  select * into c from aplicar_desconto_cotacao(c.id, 12, 'Cliente com 3 veiculos na concorrencia');
  assert c.desconto_percentual = 12, 'desconto de excecao aplicado';
  assert c.desconto_aprovado_por = u_gest, 'aprovador registrado';
  assert c.desconto_justificativa is not null, 'justificativa gravada';
  assert c.total_com_desconto = round(c.total_mensalidade * 0.88, 2), 'mensalidade com 12%';

  -- voltar para dentro do limite limpa a aprovacao
  perform set_config('request.jwt.claim.sub', u_vend::text, false);
  select * into c from atualizar_cotacao(c.id, null, null, null, null, null, null, 3);
  assert c.desconto_aprovado_por is null and c.desconto_justificativa is null,
    'desconto dentro do limite dispensa (e limpa) a aprovacao';

  -- a trava tambem vale para insert direto (sem passar pela funcao)
  begin
    insert into cotacoes (lead_id, fipe, tipo_veiculo_id, total_mensalidade, desconto_percentual)
      values (lead, 50000, tv, 200, 30);
    raise exception 'insert direto com desconto alto deveria falhar';
  exception when others then
    assert sqlerrm like 'DESCONTO_ACIMA_DO_LIMITE%', format('mensagem inesperada: %s', sqlerrm);
  end;

  -- simulacao usada pela UI
  select * into rec from simular_desconto_cotacao(c.id, 8);
  assert rec.limite_regional = 5, format('limite = %s', rec.limite_regional);
  assert not rec.dentro_do_limite and rec.exige_aprovacao, 'simulacao acusa a necessidade de alcada';
  assert rec.mensalidade_final = round(rec.mensalidade_original * 0.92, 2), 'simulacao calcula o final';
  raise notice 'OK desconto por regional + alcada de excecao';

  -- ------------------------------------------------- cotacao apos auditoria
  perform mover_lead_status(lead, 'APROVADO');
  assert (select status::text from leads where id = lead) = 'EM_AUDITORIA', 'aprovar manda para auditoria';
  begin
    perform atualizar_cotacao(c.id, 90000);
    raise exception 'cotacao nao pode ser editada apos a auditoria';
  exception when others then
    assert sqlerrm like '%auditoria%', format('mensagem inesperada: %s', sqlerrm);
  end;
  assert not lead_em_negociacao(lead), 'lead fora da fase de negociacao';
  raise notice 'OK trava de edicao apos envio para auditoria';

  -- ------------------------------------------------------------- kanban
  select count(*) into n from leads_kanban();
  assert n >= 1, 'kanban lista os leads';
  select * into rec from leads_kanban() where id = lead;
  assert rec.cotacao_id = c.id, 'kanban traz a ultima cotacao';
  assert rec.total_com_desconto = c.total_com_desconto, 'kanban mostra o valor com desconto';
  assert rec.consultor = 'Vendedor', 'kanban traz o consultor';
  raise notice 'OK leads_kanban';

  raise notice '=== REFINO DO CRM: TODOS OS TESTES PASSARAM ===';
end $$;
