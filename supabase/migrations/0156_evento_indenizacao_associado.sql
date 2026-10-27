-- 0156 — INDENIZACAO AO PROPRIO ASSOCIADO NAS CONTAS A PAGAR DO EVENTO
--
-- Pedido do usuario (27/10/2026): a conta a pagar lancada pelo evento so
-- aceitava como favorecido um fornecedor cadastrado ou um terceiro do evento
-- (0103). Na indenizacao paga ao PROPRIO associado (o beneficiario do evento)
-- nao havia como dizer isso: o financeiro via a conta sem nome na lista.
--
-- Agora o favorecido pode ser o associado DO EVENTO, em `cliente_id`. So ele:
-- outro associado e recusado, para a conta nao sair em nome de quem nao tem
-- nada com o evento. Fornecedor e terceiro continuam como antes (fornecedor
-- manda; sem fornecedor, o terceiro).
--
-- So recria `fn_lanc_evento_favorecido` (o trigger da 0103 segue o mesmo).

create or replace function fn_lanc_evento_favorecido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_evento  uuid;
  v_cliente uuid;
begin
  -- Terceiro manda no evento: o lancamento fica no mesmo evento do terceiro.
  if new.evento_terceiro_id is not null then
    select evento_id into v_evento from evento_terceiros where id = new.evento_terceiro_id;
    if not found then
      raise exception 'Terceiro do evento nao encontrado';
    end if;
    if new.evento_id is not null and new.evento_id <> v_evento then
      raise exception 'O terceiro informado nao pertence ao evento do lancamento';
    end if;
    new.evento_id := v_evento;
  end if;

  -- 0156: indenizacao ao associado. Na conta a pagar do evento sem fornecedor
  -- e sem terceiro, o associado informado tem de ser o do evento.
  if new.tipo = 'DESPESA' and new.evento_id is not null
     and new.fornecedor_id is null and new.evento_terceiro_id is null
     and new.cliente_id is not null then
    select cliente_id into v_cliente from eventos_sinistro where id = new.evento_id;
    if v_cliente is distinct from new.cliente_id then
      raise exception 'A indenizacao so pode ser paga ao associado do proprio evento';
    end if;
  end if;

  -- Despesa de evento sem favorecido e barrada. Em UPDATE so barra quem tinha
  -- favorecido e perdeu: titulos legados (pre-0025) continuam podendo receber
  -- baixa/cancelamento sem exigir cadastro retroativo.
  if new.tipo = 'DESPESA' and new.evento_id is not null
     and new.fornecedor_id is null and new.evento_terceiro_id is null
     and new.cliente_id is null then
    if tg_op = 'INSERT'
       or old.fornecedor_id is not null or old.evento_terceiro_id is not null
       or old.cliente_id is not null or old.evento_id is null then
      raise exception 'Conta a pagar do evento exige favorecido: informe o fornecedor, o terceiro ou o associado (indenizacao)';
    end if;
  end if;
  return new;
end;
$$;

-- Rito da 0052.
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
