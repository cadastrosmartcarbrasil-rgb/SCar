-- 0132: CONTAS A PAGAR — estorno de pagamento, exclusao de conta em aberto e o
-- fornecedor na cotacao do evento.
--
-- Pedido do usuario (21/10/2026): "estornar pagamentos ja efetuados (admin e
-- financeiro ou extras aprovados)", "excluir contas a pagar nao pagas" e, nos
-- eventos, ao aprovar a cotacao ir direto para o lancamento com o fornecedor
-- escolhido (a cotacao so guardava um NOME digitado).
--
-- (A) financeiro_auditoria — a trilha do que foi ESTORNADO ou EXCLUIDO, com a
--     foto do registro (jsonb), motivo, quem e quando. Sem FK para o titulo de
--     proposito: a linha sobrevive a exclusao do lancamento.
-- (B) estornar_baixa(baixa, motivo) — perfil_pode('financeiro','estornar')
--     (admin sempre; seed: financeiro; outros so por extra, 0116). Apaga a
--     baixa e os triggers de 0012/0032 recalculam saldo e situacao; o item do
--     extrato conciliado volta a PENDENTE (0119). O comprovante anexado a baixa
--     NAO e apagado: fica no titulo. Recusa pagamento confirmado pelo BANCO
--     (boleto do Mutual 0117, nao identificado 0118): o dinheiro entrou de
--     verdade e estornar so faria o titulo mentir.
-- (C) excluir_lancamento(lancamento, motivo) — perfil_pode('financeiro',
--     'excluir'). So titulo SEM baixa. Recusa o que tem dono em outro modulo:
--     a OS da 24h (o titulo e sincronizado pela OS, 0027 — cancele/troque la)
--     e o que veio do banco. Devolve os arquivos anexados para a tela tirar do
--     storage (SQL nao apaga arquivo).
-- (D) cotacoes_pecas.fornecedor_id e .lancamento_id — o fornecedor cadastrado
--     da cotacao e o titulo gerado quando ela foi aprovada e lancada.

-- (A) -----------------------------------------------------------------------
create table if not exists financeiro_auditoria (
  id            uuid primary key default gen_random_uuid(),
  acao          text not null check (acao in ('ESTORNO_BAIXA', 'EXCLUSAO_LANCAMENTO')),
  lancamento_id uuid,
  baixa_id      uuid,
  descricao     text,
  valor         numeric(12,2),
  regional_id   uuid,
  dados         jsonb not null,
  motivo        text not null,
  usuario_id    uuid references usuarios(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_fin_auditoria_lanc on financeiro_auditoria (lancamento_id);
create index if not exists idx_fin_auditoria_data on financeiro_auditoria (created_at desc);

alter table financeiro_auditoria enable row level security;
drop policy if exists fin_auditoria_select on financeiro_auditoria;
create policy fin_auditoria_select on financeiro_auditoria for select to authenticated
  using ((select tem_acesso_global())
         or regional_id = any((select regionais_do_usuario())::uuid[]));
grant select on financeiro_auditoria to authenticated;
revoke all on financeiro_auditoria from anon;

comment on table financeiro_auditoria is
  'Trilha do estorno de baixa e da exclusao de lancamento (0132). Escrita so pelas RPCs; a linha sobrevive ao titulo.';

-- Titulo que o caller enxerga (o mesmo recorte das policies lanc_all/lanc_assistencia).
create or replace function lancamento_no_alcance(p_lancamento_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from lancamentos_financeiros l
     where l.id = p_lancamento_id
       and (tem_acesso_global() or pode_regional(l.regional_id) or pode_assistencia())
  );
$$;

-- Pagamento que veio do BANCO (0117/0118): nao se estorna nem se exclui na mao.
create or replace function lancamento_do_banco(p_lancamento_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from lancamentos_financeiros l
                  where l.id = p_lancamento_id and l.numero_documento like 'SICREDI-%')
      or exists (select 1 from cobranca_liquidacoes c where c.lancamento_id = p_lancamento_id)
      or exists (select 1 from boletos_historico b where b.lancamento_id = p_lancamento_id);
$$;

-- (B) -----------------------------------------------------------------------
create or replace function estornar_baixa(p_baixa_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b baixas_financeiras%rowtype;
  l lancamentos_financeiros%rowtype;
  v_extrato boolean;
begin
  if not is_staff() or not perfil_pode('financeiro', 'estornar') then
    raise exception 'Sem permissao para estornar pagamento (Financeiro > Estornar)'
      using errcode = 'insufficient_privilege';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Informe o motivo do estorno' using errcode = 'check_violation';
  end if;

  select * into b from baixas_financeiras where id = p_baixa_id for update;
  if not found then
    raise exception 'Pagamento nao encontrado' using errcode = 'no_data_found';
  end if;
  if not lancamento_no_alcance(b.lancamento_id) then
    raise exception 'Este titulo nao esta no seu alcance' using errcode = 'insufficient_privilege';
  end if;
  select * into l from lancamentos_financeiros where id = b.lancamento_id;
  if l.status = 'cancelado' then
    raise exception 'Titulo cancelado nao tem pagamento a estornar' using errcode = 'check_violation';
  end if;
  if lancamento_do_banco(l.id) then
    raise exception 'Pagamento confirmado pelo banco (Sicredi): o dinheiro entrou na conta. Nao se estorna pela tela — trate pela conciliacao.'
      using errcode = 'check_violation';
  end if;

  v_extrato := exists (select 1 from extrato_itens where baixa_id = b.id);

  insert into financeiro_auditoria (acao, lancamento_id, baixa_id, descricao, valor, regional_id, dados, motivo, usuario_id)
  values ('ESTORNO_BAIXA', l.id, b.id, l.descricao, b.valor_pago, l.regional_id,
          jsonb_build_object('baixa', to_jsonb(b), 'status_antes', l.status, 'saldo_antes', l.valor_saldo,
                             'extrato_conciliado', v_extrato),
          trim(p_motivo), usuario_atual_id());

  -- O comprovante da baixa continua no titulo (a FK de anexos e cascade).
  update anexos_financeiros set baixa_id = null, lancamento_id = coalesce(lancamento_id, b.lancamento_id)
   where baixa_id = b.id;

  delete from baixas_financeiras where id = b.id;
  -- Os triggers de 0012 recalculam status; o de 0032 recalcula o saldo no update.
  update lancamentos_financeiros set updated_at = now() where id = l.id;

  select * into l from lancamentos_financeiros where id = l.id;
  return jsonb_build_object(
    'lancamento_id', l.id, 'status', l.status, 'valor_saldo', l.valor_saldo,
    'extrato_reaberto', v_extrato);
end;
$$;

-- (C) -----------------------------------------------------------------------
create or replace function excluir_lancamento(p_lancamento_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  l lancamentos_financeiros%rowtype;
  v_os text;
  v_arquivos text[];
begin
  if not is_staff() or not perfil_pode('financeiro', 'excluir') then
    raise exception 'Sem permissao para excluir lancamento (Financeiro > Excluir)'
      using errcode = 'insufficient_privilege';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Informe o motivo da exclusao' using errcode = 'check_violation';
  end if;

  select * into l from lancamentos_financeiros where id = p_lancamento_id for update;
  if not found then
    raise exception 'Lancamento nao encontrado' using errcode = 'no_data_found';
  end if;
  if not lancamento_no_alcance(l.id) then
    raise exception 'Este titulo nao esta no seu alcance' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from baixas_financeiras where lancamento_id = l.id) then
    raise exception 'Titulo com pagamento registrado nao pode ser excluido. Estorne o pagamento antes.'
      using errcode = 'check_violation';
  end if;
  select coalesce(codigo_os, protocolo) into v_os
    from acionamentos_assistencia where lancamento_id = l.id limit 1;
  if v_os is not null then
    raise exception 'Este titulo pertence a OS % da Assistencia 24h. Cancele ou troque o prestador pela OS.', v_os
      using errcode = 'check_violation';
  end if;
  if lancamento_do_banco(l.id) then
    raise exception 'Lancamento gerado pelo pagamento no banco (Sicredi) nao pode ser excluido.'
      using errcode = 'check_violation';
  end if;

  select coalesce(array_agg(url_storage), '{}') into v_arquivos
    from anexos_financeiros where lancamento_id = l.id;

  insert into financeiro_auditoria (acao, lancamento_id, descricao, valor, regional_id, dados, motivo, usuario_id)
  values ('EXCLUSAO_LANCAMENTO', l.id, l.descricao, l.valor_original, l.regional_id,
          jsonb_build_object('lancamento', to_jsonb(l), 'anexos', to_jsonb(v_arquivos)),
          trim(p_motivo), usuario_atual_id());

  update cotacoes_pecas set lancamento_id = null where lancamento_id = l.id;
  delete from lancamentos_financeiros where id = l.id;

  return jsonb_build_object('lancamento_id', l.id, 'arquivos', to_jsonb(v_arquivos));
end;
$$;

-- (D) -----------------------------------------------------------------------
alter table cotacoes_pecas
  add column if not exists fornecedor_id uuid references fornecedores(id) on delete set null,
  add column if not exists lancamento_id uuid references lancamentos_financeiros(id) on delete set null;
create index if not exists idx_cotacoes_fornecedor on cotacoes_pecas (fornecedor_id);
create index if not exists idx_cotacoes_lancamento on cotacoes_pecas (lancamento_id);

comment on column cotacoes_pecas.fornecedor_id is
  'Fornecedor cadastrado da cotacao (0132). fornecedor_nome segue como o nome mostrado (e o de quem nao esta cadastrado).';
comment on column cotacoes_pecas.lancamento_id is
  'Conta a pagar/receber gerada quando a cotacao aprovada foi lancada (0132).';

-- Rito da 0052
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
