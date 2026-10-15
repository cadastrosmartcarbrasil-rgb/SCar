-- 0109_acionamento_edicao — o ATENDIMENTO da 24h pode mudar a qualquer momento.
--
-- Pedido do usuario (15/10/2026): "nao vi possibilidade de editar o atendimento
-- ou ate mesmo cancelar, pois o associado podera desistir, mudar de lugar,
-- alterar datas". O banco ja cancelava e editava em qualquer fase (0027), mas a
-- tela so oferecia isso DEPOIS de gerada a OS, e nao existia DATA nenhuma: todo
-- acionamento era "agora". Esta migration:
--   (A) cria `acionamentos_assistencia.agendado_para` (nulo = imediato);
--   (B) recria `atualizar_acionamento` aceitando o agendamento e o solicitante
--       (nome/telefone). DROP + CREATE: os parametros novos tem default e uma
--       sobrecarga deixaria a chamada antiga ambigua (mordida da 0070/0081). Os
--       novos vao NO FIM, entao a chamada posicional antiga continua igual;
--   (C) a auditoria (0027) passa a registrar agendamento, solicitante, telefone,
--       observacoes e ORIGEM — mudar de lugar e exatamente o que se quer rastrear.
-- Nada muda em valor, Contas a Pagar ou permissao (`pode_assistencia`, como antes).

alter table acionamentos_assistencia add column if not exists agendado_para timestamptz;
comment on column acionamentos_assistencia.agendado_para is
  'Data/hora combinada com o associado para o atendimento. Nulo = imediato.';

drop function if exists atualizar_acionamento(uuid, numeric, numeric, numeric, numeric, jsonb, integer, text, text);
create function atualizar_acionamento(
  p_acionamento_id       uuid,
  p_valor_servico        numeric default null,
  p_km_excedente         numeric default null,
  p_valor_km             numeric default null,
  p_km_percorrido        numeric default null,
  p_destino              jsonb   default null,
  p_prazo_min            integer default null,
  p_observacoes          text    default null,
  p_motivo               text    default null,
  p_agendado_para        timestamptz default null,
  p_limpar_agendamento   boolean default false,
  p_solicitante_nome     text    default null,
  p_solicitante_telefone text    default null
)
returns acionamentos_assistencia
language plpgsql
security definer
set search_path = public
as $$
declare
  a        acionamentos_assistencia;
  s        servicos_assistencia;
  v_valor  numeric;
  v_km     numeric;
  v_km_un  numeric;
  v_km_tot numeric;
begin
  if not pode_assistencia() then raise exception 'Sem permissao'; end if;

  select * into a from acionamentos_assistencia where id = p_acionamento_id;
  if a.id is null then raise exception 'Acionamento nao encontrado'; end if;
  if a.status = 'CANCELADO' then raise exception 'Acionamento cancelado nao pode ser editado'; end if;
  if p_limpar_agendamento and p_agendado_para is not null then
    raise exception 'Informe a nova data OU limpe o agendamento, nao os dois';
  end if;
  select * into s from servicos_assistencia where id = a.servico_id;

  perform set_config('scar.motivo_edicao', coalesce(p_motivo, ''), true);

  v_valor := coalesce(p_valor_servico, a.valor_servico);
  v_km    := case when s.cobra_km_excedente then coalesce(p_km_excedente, a.km_excedente) else 0 end;
  v_km_un := coalesce(
    p_valor_km,
    case when a.km_excedente > 0 then a.valor_km_excedente / nullif(a.km_excedente, 0) end,
    (select valor_km from prestador_servicos
      where fornecedor_id = a.prestador_id and servico_id = a.servico_id),
    s.valor_km_excedente
  );
  v_km_tot := round(v_km * coalesce(v_km_un, 0), 2);

  update acionamentos_assistencia
     set valor_servico        = v_valor,
         km_excedente         = v_km,
         valor_km_excedente   = v_km_tot,
         valor_total          = round(v_valor + v_km_tot, 2),
         km_percorrido        = coalesce(p_km_percorrido, km_percorrido),
         destino              = coalesce(p_destino, destino),
         prazo_estimado_min   = coalesce(p_prazo_min, prazo_estimado_min),
         observacoes          = coalesce(p_observacoes, observacoes),
         agendado_para        = case when p_limpar_agendamento then null
                                     else coalesce(p_agendado_para, agendado_para) end,
         solicitante_nome     = coalesce(nullif(btrim(p_solicitante_nome), ''), solicitante_nome),
         solicitante_telefone = coalesce(nullif(btrim(p_solicitante_telefone), ''), solicitante_telefone),
         updated_at           = now()
   where id = p_acionamento_id
   returning * into a;

  perform sincronizar_lancamento_acionamento(a.id);
  perform set_config('scar.motivo_edicao', '', true);
  select * into a from acionamentos_assistencia where id = p_acionamento_id;
  return a;
end;
$$;

-- Auditoria (0027) + os campos do ATENDIMENTO.
create or replace function fn_acionamento_auditoria()
returns trigger
language plpgsql
as $$
declare
  v_motivo text := nullif(current_setting('scar.motivo_edicao', true), '');
  v_uid    uuid := auth.uid();
begin
  if new.prestador_id is distinct from old.prestador_id then
    insert into acionamento_edicoes (acionamento_id, campo, valor_anterior, valor_novo, motivo, usuario_id)
      values (new.id, 'prestador',
              (select razao_social from fornecedores where id = old.prestador_id),
              (select razao_social from fornecedores where id = new.prestador_id),
              v_motivo, v_uid);
  end if;
  if new.valor_servico is distinct from old.valor_servico then
    insert into acionamento_edicoes (acionamento_id, campo, valor_anterior, valor_novo, motivo, usuario_id)
      values (new.id, 'valor_servico', old.valor_servico::text, new.valor_servico::text, v_motivo, v_uid);
  end if;
  if new.km_excedente is distinct from old.km_excedente then
    insert into acionamento_edicoes (acionamento_id, campo, valor_anterior, valor_novo, motivo, usuario_id)
      values (new.id, 'km_excedente', old.km_excedente::text, new.km_excedente::text, v_motivo, v_uid);
  end if;
  if new.valor_km_excedente is distinct from old.valor_km_excedente then
    insert into acionamento_edicoes (acionamento_id, campo, valor_anterior, valor_novo, motivo, usuario_id)
      values (new.id, 'valor_km_excedente', old.valor_km_excedente::text, new.valor_km_excedente::text, v_motivo, v_uid);
  end if;
  if new.valor_total is distinct from old.valor_total then
    insert into acionamento_edicoes (acionamento_id, campo, valor_anterior, valor_novo, motivo, usuario_id)
      values (new.id, 'valor_total', old.valor_total::text, new.valor_total::text, v_motivo, v_uid);
  end if;
  if new.origem is distinct from old.origem then
    insert into acionamento_edicoes (acionamento_id, campo, valor_anterior, valor_novo, motivo, usuario_id)
      values (new.id, 'origem', old.origem::text, new.origem::text, v_motivo, v_uid);
  end if;
  if new.destino is distinct from old.destino then
    insert into acionamento_edicoes (acionamento_id, campo, valor_anterior, valor_novo, motivo, usuario_id)
      values (new.id, 'destino', old.destino::text, new.destino::text, v_motivo, v_uid);
  end if;
  if new.km_percorrido is distinct from old.km_percorrido then
    insert into acionamento_edicoes (acionamento_id, campo, valor_anterior, valor_novo, motivo, usuario_id)
      values (new.id, 'km_percorrido', old.km_percorrido::text, new.km_percorrido::text, v_motivo, v_uid);
  end if;
  if new.prazo_estimado_min is distinct from old.prazo_estimado_min then
    insert into acionamento_edicoes (acionamento_id, campo, valor_anterior, valor_novo, motivo, usuario_id)
      values (new.id, 'prazo_estimado_min', old.prazo_estimado_min::text, new.prazo_estimado_min::text, v_motivo, v_uid);
  end if;
  if new.agendado_para is distinct from old.agendado_para then
    insert into acionamento_edicoes (acionamento_id, campo, valor_anterior, valor_novo, motivo, usuario_id)
      values (new.id, 'agendado_para',
              to_char(old.agendado_para at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
              to_char(new.agendado_para at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
              v_motivo, v_uid);
  end if;
  if new.solicitante_nome is distinct from old.solicitante_nome then
    insert into acionamento_edicoes (acionamento_id, campo, valor_anterior, valor_novo, motivo, usuario_id)
      values (new.id, 'solicitante_nome', old.solicitante_nome, new.solicitante_nome, v_motivo, v_uid);
  end if;
  if new.solicitante_telefone is distinct from old.solicitante_telefone then
    insert into acionamento_edicoes (acionamento_id, campo, valor_anterior, valor_novo, motivo, usuario_id)
      values (new.id, 'solicitante_telefone', old.solicitante_telefone, new.solicitante_telefone, v_motivo, v_uid);
  end if;
  if new.observacoes is distinct from old.observacoes then
    insert into acionamento_edicoes (acionamento_id, campo, valor_anterior, valor_novo, motivo, usuario_id)
      values (new.id, 'observacoes', old.observacoes, new.observacoes, v_motivo, v_uid);
  end if;
  if new.status is distinct from old.status then
    insert into acionamento_edicoes (acionamento_id, campo, valor_anterior, valor_novo, motivo, usuario_id)
      values (new.id, 'status', old.status::text, new.status::text,
              coalesce(v_motivo, new.cancelado_motivo), v_uid);
  end if;
  return new;
end;
$$;

-- Rito da 0052.
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
