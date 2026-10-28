-- ============================================================================
-- 0157 — CANCELAR BOLETO(S) COM MOTIVO, liberado por PERFIL ou EXTRA
-- ============================================================================
-- Pedido do usuario (28/10/2026): "precisamos ter possibilidade de cancelar os
-- boletos, solicitar o motivo do cancelamento, do(s) boletos, essa
-- funcionalidade e liberada via perfil ou extras."
--
-- O que havia: a celula `cobranca.cancelar` existe na grade desde a 0111
-- (seed: financeiro; admin sempre; extras pela 0116) e NADA a usava. O unico
-- cancelamento de boleto era `cancelar_fatura` (0024): qualquer staff, sem
-- motivo — e sem baixa no banco, entao o boleto registrado no Sicredi seguia
-- pagavel.
--
-- O que entra (sem caminho paralelo — e a maquina da 2a via, 0121):
--   (A) renegociacao tipo CANCELAMENTO: SO baixa, sem boleto novo. Nasce
--       EMITIDA, a rota pede a baixa de cada original no banco e
--       `registrar_baixa_original` marca cancelado. Boleto que nunca foi ao
--       banco (titulo do SCar sem nosso numero) vira SEM_REGISTRO e cancela.
--       Baixa recusada fica no cartao com "Tentar a baixa de novo".
--   (B) `criar_cancelamento_boletos(cliente, origens, motivo)` — um ou varios
--       boletos do MESMO associado; motivo obrigatorio; `cobranca.cancelar`
--       + escopo da cobranca (`cobranca_pode_cliente`).
--   (C) o motivo fica gravado: na renegociacao (observacao) e, no titulo do
--       SCar, na observacao ("Cancelado: <motivo>"), que o historico mostra.
--   (D) cancelamento nao e 2a via: nao exige revistoria.
--   (E) `cancelar_fatura` passa a exigir a mesma celula e o motivo, e recusa
--       fatura cujo boleto ja esta no banco (essa vai pelo historico, que da
--       baixa) — DROP + CREATE, a assinatura muda.
-- ============================================================================

-- (A) ------------------------------------------------------------------------
alter table cobranca_renegociacoes drop constraint if exists chk_reneg_tipo;
alter table cobranca_renegociacoes add constraint chk_reneg_tipo
  check (tipo in ('SEGUNDA_VIA', 'ACORDO', 'PRO_RATA', 'AVULSO', 'CANCELAMENTO'));

-- (D) ------------------------------------------------------------------------
create or replace function fn_reneg_origem_exige_revistoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cli   uuid;
  v_veic  uuid;
  v_corte integer := dias_revistoria_boleto();
  v_dias  integer;
  r       record;
begin
  -- 0144/0157: cancelamento e pro-rata nao sao 2a via.
  if exists (select 1 from cobranca_renegociacoes x
              where x.id = new.renegociacao_id and x.tipo in ('PRO_RATA', 'CANCELAMENTO')) then
    return new;
  end if;

  v_dias := revistoria_hoje() - dia_util_seguinte(new.vencimento);
  if v_dias <= v_corte then
    return new;
  end if;

  select cliente_id into v_cli from cobranca_renegociacoes where id = new.renegociacao_id;
  if new.origem = 'MUTUAL' then
    select veiculo_id into v_veic from boletos_historico where id = new.boleto_historico_id;
  else
    select veiculo_id into v_veic from titulos_financeiros where id = new.titulo_id;
  end if;

  for r in
    select v.id, v.placa, v.chassi from veiculos v
     where (v.id = v_veic or (v_veic is null and v.cliente_id = v_cli))
       and revistoria_veiculo_na_base(v.status::text)
  loop
    update revistorias_cobranca rc set renegociacao_id = new.renegociacao_id
     where rc.veiculo_id = r.id
       and revistoria_libera(rc, new.renegociacao_id);
    if not found then
      raise exception 'REVISTORIA PENDENTE: o veiculo % tem boleto vencido ha % dias (o limite e %). A 2a via so sai com a revistoria aprovada — ou liberada com justificativa.',
        coalesce(r.placa, '0 KM chassi ' || right(coalesce(r.chassi, ''), 6)), v_dias, v_corte
        using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end;
$$;

-- (B) ------------------------------------------------------------------------
/**
 * Cancela um ou varios boletos EM ABERTO do associado, com motivo.
 * `p_origens` = [{"origem":"MUTUAL"|"SCAR","id"}]. Devolve o id da
 * renegociacao (tipo CANCELAMENTO, ja EMITIDA): a rota pede a baixa no banco.
 */
create or replace function criar_cancelamento_boletos(
  p_cliente_id uuid,
  p_origens    jsonb,
  p_motivo     text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cli    clientes%rowtype;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_n      integer := jsonb_array_length(coalesce(p_origens, '[]'::jsonb));
  v_id     uuid;
  v_o      jsonb;
  v_orig   text;
  v_ref    uuid;
  v_h      boletos_historico%rowtype;
  v_t      titulos_financeiros%rowtype;
  v_soma   numeric := 0;
begin
  if auth.uid() is not null and not perfil_pode('cobranca', 'cancelar') then
    raise exception 'Sem permissao (Cobranca: Cancelar) — libere no perfil ou como permissao extra.'
      using errcode = 'insufficient_privilege';
  end if;
  select * into v_cli from clientes where id = p_cliente_id;
  if not found then
    raise exception 'Associado nao encontrado.' using errcode = 'no_data_found';
  end if;
  if auth.uid() is not null and not cobranca_pode_cliente(p_cliente_id) then
    raise exception 'Fora do seu escopo de cobranca.' using errcode = 'insufficient_privilege';
  end if;
  if length(v_motivo) < 5 then
    raise exception 'Informe o motivo do cancelamento (minimo 5 caracteres).' using errcode = 'check_violation';
  end if;
  if v_n = 0 then
    raise exception 'Escolha ao menos um boleto.' using errcode = 'check_violation';
  end if;
  if v_n > 200 then
    raise exception 'No maximo 200 boletos por vez.' using errcode = 'check_violation';
  end if;

  insert into cobranca_renegociacoes (cliente_id, regional_id, tipo, valor_original, valor_total,
                                      observacao, situacao, emitida_em, criado_por)
  values (p_cliente_id, v_cli.regional_id, 'CANCELAMENTO', 0, 0, v_motivo, 'EMITIDA', now(),
          (select id from usuarios where id = auth.uid()))
  returning id into v_id;

  for v_o in select * from jsonb_array_elements(p_origens) loop
    v_orig := upper(coalesce(v_o->>'origem', ''));
    begin
      v_ref := (v_o->>'id')::uuid;
    exception when others then
      raise exception 'Boleto ilegivel.' using errcode = 'check_violation';
    end;

    if v_orig = 'MUTUAL' then
      select * into v_h from boletos_historico where id = v_ref for update;
      if not found or v_h.cliente_id is distinct from p_cliente_id then
        raise exception 'Boleto do Mutual nao e deste associado.' using errcode = 'check_violation';
      end if;
      if v_h.situacao <> 'aberto' or v_h.baixa_banco_em is not null then
        raise exception 'O boleto do Mutual de % nao esta em aberto.',
          to_char(v_h.data_vencimento, 'DD/MM/YYYY') using errcode = 'check_violation';
      end if;
      if v_h.nosso_numero is null then
        raise exception 'O boleto do Mutual de % nao tem nosso numero: sem ele nao ha baixa no Sicredi. Cancele no Mutual.',
          to_char(v_h.data_vencimento, 'DD/MM/YYYY') using errcode = 'check_violation';
      end if;
      if exists (select 1 from cobranca_renegociacao_origens o
                   join cobranca_renegociacoes r on r.id = o.renegociacao_id
                  where o.boleto_historico_id = v_ref and r.situacao <> 'ERRO' and r.id <> v_id) then
        raise exception 'O boleto do Mutual de % ja esta em outra negociacao ou cancelamento.',
          to_char(v_h.data_vencimento, 'DD/MM/YYYY') using errcode = 'unique_violation';
      end if;
      insert into cobranca_renegociacao_origens (renegociacao_id, origem, boleto_historico_id, valor, vencimento, nosso_numero)
      values (v_id, 'MUTUAL', v_ref, v_h.valor, v_h.data_vencimento, v_h.nosso_numero);
      v_soma := v_soma + v_h.valor;

    elsif v_orig = 'SCAR' then
      select * into v_t from titulos_financeiros where id = v_ref for update;
      if not found or v_t.cliente_id is distinct from p_cliente_id then
        raise exception 'Boleto do SCar nao e deste associado.' using errcode = 'check_violation';
      end if;
      if v_t.status::text not in ('pendente', 'vencido') or coalesce(v_t.valor_pago, 0) > 0 then
        raise exception 'O boleto de % nao esta em aberto (pago ou cancelado nao se cancela).',
          to_char(v_t.data_vencimento, 'DD/MM/YYYY') using errcode = 'check_violation';
      end if;
      if exists (select 1 from cobranca_renegociacao_origens o
                   join cobranca_renegociacoes r on r.id = o.renegociacao_id
                  where o.titulo_id = v_ref and r.situacao <> 'ERRO' and r.id <> v_id) then
        raise exception 'O boleto de % ja esta em outra negociacao ou cancelamento.',
          to_char(v_t.data_vencimento, 'DD/MM/YYYY') using errcode = 'unique_violation';
      end if;
      insert into cobranca_renegociacao_origens (renegociacao_id, origem, titulo_id, valor, vencimento, nosso_numero)
      values (v_id, 'SCAR', v_ref, v_t.valor, v_t.data_vencimento, v_t.nosso_numero);
      v_soma := v_soma + v_t.valor;
    else
      raise exception 'Origem invalida: use MUTUAL ou SCAR.' using errcode = 'check_violation';
    end if;
  end loop;

  update cobranca_renegociacoes set valor_original = v_soma where id = v_id;
  return v_id;
end;
$$;

-- (C) ------------------------------------------------------------------------
create or replace function registrar_baixa_original(
  p_origem_id uuid,
  p_status    text,
  p_erro      text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_o cobranca_renegociacao_origens%rowtype;
  v_r cobranca_renegociacoes%rowtype;
  v_s text := upper(coalesce(p_status, ''));
begin
  select * into v_o from cobranca_renegociacao_origens where id = p_origem_id for update;
  if not found then raise exception 'Origem nao encontrada.' using errcode = 'no_data_found'; end if;
  select * into v_r from cobranca_renegociacoes where id = v_o.renegociacao_id;
  if auth.uid() is not null and not cobranca_pode_cliente(v_r.cliente_id) then
    raise exception 'Sem permissao.' using errcode = 'insufficient_privilege';
  end if;
  if v_r.situacao <> 'EMITIDA' then
    raise exception 'So se baixa o original depois que o boleto novo foi emitido.' using errcode = 'check_violation';
  end if;
  if v_s not in ('BAIXADO', 'ERRO', 'SEM_REGISTRO') then
    raise exception 'Status de baixa invalido.' using errcode = 'check_violation';
  end if;
  if v_o.baixa_status in ('BAIXADO', 'SEM_REGISTRO') then
    return v_o.baixa_status;   -- re-executavel
  end if;

  update cobranca_renegociacao_origens
     set baixa_status = v_s,
         baixa_erro   = case when v_s = 'ERRO' then nullif(btrim(coalesce(p_erro, '')), '') end,
         baixado_em   = case when v_s = 'ERRO' then null else now() end
   where id = p_origem_id;

  if v_s <> 'ERRO' then
    if v_o.origem = 'MUTUAL' then
      update boletos_historico
         set situacao = 'cancelado', renegociacao_id = v_r.id, atualizado_em = now()
       where id = v_o.boleto_historico_id and baixa_banco_em is null;
    else
      update titulos_financeiros
         set status = 'cancelado',
             observacao = coalesce(observacao || ' · ', '')
                          || case when v_r.tipo = 'CANCELAMENTO'
                                  then 'Cancelado: ' || coalesce(v_r.observacao, '')
                                  else 'renegociado' end
       where id = v_o.titulo_id and status::text in ('pendente', 'vencido');
    end if;
  end if;
  return v_s;
end;
$$;

-- (E) ------------------------------------------------------------------------
drop function if exists cancelar_fatura(uuid);
create or replace function cancelar_fatura(p_fatura_id uuid, p_motivo text)
returns faturas
language plpgsql
security definer
set search_path = public
as $$
declare
  f        faturas;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_nn     text;
begin
  if not is_staff() then raise exception 'Sem permissao'; end if;
  if not perfil_pode('cobranca', 'cancelar') then
    raise exception 'Sem permissao (Cobranca: Cancelar) — libere no perfil ou como permissao extra.'
      using errcode = 'insufficient_privilege';
  end if;
  if length(v_motivo) < 5 then
    raise exception 'Informe o motivo do cancelamento (minimo 5 caracteres).' using errcode = 'check_violation';
  end if;

  select * into f from faturas where id = p_fatura_id;
  if f.id is null then raise exception 'Fatura nao encontrada'; end if;
  if not cobranca_pode_cliente(f.cliente_id) then
    raise exception 'Fora do seu escopo de cobranca.' using errcode = 'insufficient_privilege';
  end if;
  if f.status = 'PAGA' then raise exception 'Fatura ja paga'; end if;

  if f.titulo_id is not null then
    select nosso_numero into v_nn from titulos_financeiros where id = f.titulo_id;
    if v_nn is not null then
      raise exception 'O boleto desta fatura ja esta registrado no banco: cancele pelo Historico financeiro do associado, que da a baixa no banco.'
        using errcode = 'check_violation';
    end if;
    update titulos_financeiros
       set status = 'cancelado',
           observacao = coalesce(observacao || ' · ', '') || 'Cancelado: ' || v_motivo,
           updated_at = now()
     where id = f.titulo_id and status not in ('pago', 'cancelado');
  end if;

  update faturas set status = 'CANCELADA', updated_at = now()
   where id = f.id
   returning * into f;
  return f;
end;
$$;

-- Rito da 0052 ----------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
