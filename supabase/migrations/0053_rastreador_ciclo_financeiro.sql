-- ============================================================================
-- SCar :: 0053_rastreador_ciclo_financeiro.sql
--
-- O EQUIPAMENTO PASSA A OBEDECER AO CADASTRO E AO FINANCEIRO.
--
-- Ate aqui o modulo (0050) sabia CRUZAR — a tela de divergencias mostrava
-- "inadimplente com equipamento ativo" e "equipamento em veiculo fora da
-- base". Mas era so um relatorio: alguem tinha de ler e agir. Agora as duas
-- pontas se movem sozinhas, que e o que o parque de 2.400 aparelhos exige:
--
--   (A) VEICULO SAI DA BASE -> o equipamento instalado nele vai para
--       "4 - Inativo (pedir devolucao)" na hora, por trigger. Cancelou o
--       contrato, o aparelho entra na fila de recolhimento sem ninguem pedir.
--   (B) ASSOCIADO INADIMPLENTE -> `sincronizar_rastreadores_inadimplencia()`
--       marca "3 - Inadimplente" quem passou do prazo e DEVOLVE para
--       "2 - Ativo" quem regularizou. E a mesma leitura de atraso que a
--       Assistencia 24h usa (0026), para o sistema falar uma lingua so.
--   (C) NAO SE INSTALA EQUIPAMENTO PARA QUEM ESTA DEVENDO: `instalar_rastreador`
--       recusa associado com atraso acima do prazo — a matriz pode passar por
--       cima (`tem_acesso_global`), a ponta nao.
--   (D) EQUIPAMENTO NAO DEVOLVIDO VIRA DINHEIRO: `cobrar_rastreador()` gera o
--       titulo a receber e move o aparelho para "7 - Boleto gerado", fechando
--       o buraco que os status 6 e 7 tinham (eram manuais, sem contrapartida
--       no financeiro).
--   (E) `situacao_rastreamento_veiculo()` — o que o SAC mostra ao atendente:
--       este veiculo tem rastreador? esta suspenso por inadimplencia?
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Dias de atraso do associado (mesma regra da 24h: titulo do veiculo ou do
-- associado no faturamento agrupado, vencido e nao pago).
-- ----------------------------------------------------------------------------
create or replace function dias_atraso_cliente(p_cliente_id uuid)
returns integer
language sql
stable
as $$
  select coalesce(max(current_date - t.data_vencimento), 0)::int
    from titulos_financeiros t
   where t.cliente_id = p_cliente_id
     and t.status::text in ('pendente', 'vencido')
     and t.data_vencimento < current_date;
$$;

comment on function dias_atraso_cliente(uuid) is
  'Maior atraso em dias entre os titulos em aberto do associado. 0 = em dia.';

-- ----------------------------------------------------------------------------
-- (A) Veiculo que sai da base leva o equipamento para a fila de recolhimento
-- ----------------------------------------------------------------------------
create or replace function fn_veiculo_move_rastreador()
returns trigger
language plpgsql
as $$
declare r record;
begin
  if new.status::text = old.status::text then return new; end if;
  if new.status::text not in ('inativo', 'suspenso', 'baixado', 'excluido') then return new; end if;

  for r in select * from rastreadores
            where veiculo_id = new.id and status::text = 'ATIVO' loop
    perform set_config('scar.motivo_rastreador',
      format('Veiculo %s passou para %s — equipamento vai para recolhimento', new.placa, new.status), true);
    update rastreadores
       set status = 'INATIVO',            -- 4: pedir devolucao
           data_desinstalacao = coalesce(data_desinstalacao, now())
     where id = r.id;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_veiculo_move_rastreador on veiculos;
create trigger trg_veiculo_move_rastreador after update of status on veiculos
  for each row execute function fn_veiculo_move_rastreador();

comment on function fn_veiculo_move_rastreador() is
  'Cancelou/suspendeu o veiculo, o rastreador instalado entra na fila de recolhimento (status 4).';

-- ----------------------------------------------------------------------------
-- (B) Inadimplencia move o equipamento nos dois sentidos
-- ----------------------------------------------------------------------------
create or replace function sincronizar_rastreadores_inadimplencia(
  p_dias        integer default 35,
  p_regional_id uuid default null
)
returns table (marcados integer, regularizados integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  r        record;
  v_marc   integer := 0;
  v_reg    integer := 0;
  v_dias   integer := greatest(coalesce(p_dias, 35), 1);
  v_escopo uuid;
begin
  if not (is_staff() or auth.uid() is null) then
    raise exception 'Sem permissao para sincronizar o parque';
  end if;
  v_escopo := escopo_regional(p_regional_id);

  -- ativos cujo associado passou do prazo -> 3 (Inadimplente)
  for r in
    select ra.id, ra.cliente_id, dias_atraso_cliente(ra.cliente_id) as dias
      from rastreadores ra
     where ra.status::text = 'ATIVO'
       and ra.cliente_id is not null
       and (v_escopo is null or ra.regional_id = v_escopo)
       and dias_atraso_cliente(ra.cliente_id) > v_dias
  loop
    perform set_config('scar.motivo_rastreador',
      format('Associado com %s dias de atraso (limite %s)', r.dias, v_dias), true);
    update rastreadores set status = 'INADIMPLENTE' where id = r.id;
    v_marc := v_marc + 1;
  end loop;

  -- inadimplentes que regularizaram e cujo veiculo continua na base -> 2 (Ativo)
  for r in
    select ra.id
      from rastreadores ra
      join veiculos v on v.id = ra.veiculo_id
     where ra.status::text = 'INADIMPLENTE'
       and ra.cliente_id is not null
       and (v_escopo is null or ra.regional_id = v_escopo)
       and v.status::text in ('ativo', 'em_evento')
       and dias_atraso_cliente(ra.cliente_id) = 0
  loop
    perform set_config('scar.motivo_rastreador', 'Associado regularizou os titulos em aberto', true);
    update rastreadores set status = 'ATIVO' where id = r.id;
    v_reg := v_reg + 1;
  end loop;

  return query select v_marc, v_reg;
end;
$$;

comment on function sincronizar_rastreadores_inadimplencia(integer, uuid) is
  'Marca 3-Inadimplente quem passou do prazo e devolve para 2-Ativo quem pagou. Rodar pelo painel de divergencias.';

-- ----------------------------------------------------------------------------
-- (C) Nao se instala equipamento para quem esta devendo
--     (mesma assinatura de 0050 — so a regra nova entra)
-- ----------------------------------------------------------------------------
create or replace function instalar_rastreador(
  p_rastreador_id uuid,
  p_veiculo_id    uuid,
  p_data          timestamptz default now(),
  p_local         text default null,
  p_instalador    text default null,
  p_observacoes   text default null
)
returns rastreadores
language plpgsql
security definer
set search_path = public
as $$
declare
  r      rastreadores;
  v      veiculos;
  n      integer;
  v_atr  integer;
begin
  select * into r from rastreadores where id = p_rastreador_id;
  if r.id is null then raise exception 'Rastreador nao encontrado'; end if;
  if not pode_mexer_rastreador(r.id) then
    raise exception 'Sem permissao para movimentar este equipamento';
  end if;

  select * into v from veiculos where id = p_veiculo_id;
  if v.id is null then raise exception 'Veiculo nao encontrado'; end if;
  if v.status::text = 'excluido' then raise exception 'Veiculo excluido nao recebe instalacao'; end if;

  if r.status::text <> 'DISPONIVEL' then
    raise exception 'So instala equipamento em estoque (status atual: %)', r.status;
  end if;

  select count(*) into n from rastreadores
   where veiculo_id = p_veiculo_id and status::text = 'ATIVO' and id <> r.id;
  if n > 0 then
    raise exception 'O veiculo % ja tem rastreador ativo. Desinstale o atual antes.', v.placa;
  end if;

  -- Financeiro: equipamento e patrimonio da associacao. Nao sai para a rua
  -- na mao de quem esta devendo — a matriz pode liberar, a ponta nao.
  v_atr := dias_atraso_cliente(v.cliente_id);
  if v_atr > 35 and not tem_acesso_global() then
    raise exception 'Associado com % dias de atraso: instalacao precisa de liberacao da matriz', v_atr;
  end if;

  perform set_config('scar.motivo_rastreador',
                     coalesce(p_observacoes, 'Instalado no veiculo ' || v.placa), true);

  update rastreadores
     set status             = 'ATIVO',
         veiculo_id         = p_veiculo_id,
         cliente_id         = v.cliente_id,
         regional_id        = coalesce(v.regional_id, regional_id),
         data_instalacao    = coalesce(p_data, now()),
         data_desinstalacao = null,
         local_instalacao   = coalesce(p_local, local_instalacao),
         instalador         = coalesce(p_instalador, instalador)
   where id = r.id
   returning * into r;

  return r;
end;
$$;

-- ----------------------------------------------------------------------------
-- (D) Equipamento nao devolvido vira titulo a receber
-- ----------------------------------------------------------------------------
create or replace function cobrar_rastreador(
  p_rastreador_id uuid,
  p_valor         numeric,
  p_vencimento    date default null,
  p_observacao    text default null
)
returns titulos_financeiros
language plpgsql
security definer
set search_path = public
as $$
declare
  r rastreadores;
  t titulos_financeiros;
begin
  select * into r from rastreadores where id = p_rastreador_id;
  if r.id is null then raise exception 'Rastreador nao encontrado'; end if;
  if not pode_mexer_rastreador(r.id) then
    raise exception 'Sem permissao para movimentar este equipamento';
  end if;
  if r.status::text <> 'COBRAR_RASTREADOR' then
    raise exception 'A cobranca sai do status 6 - Cobrar rastreador (atual: %)', r.status;
  end if;
  if r.cliente_id is null then
    raise exception 'Equipamento sem associado vinculado: nao ha quem cobrar';
  end if;
  if coalesce(p_valor, 0) <= 0 then
    raise exception 'Informe o valor a cobrar pelo equipamento';
  end if;

  insert into titulos_financeiros (cliente_id, veiculo_id, valor, valor_original,
                                   data_vencimento, status, observacao)
    values (r.cliente_id, r.veiculo_id, p_valor, p_valor,
            coalesce(p_vencimento, current_date + 10), 'pendente',
            coalesce(p_observacao, 'Equipamento de rastreamento nao devolvido — IMEI ' || r.imei))
    returning * into t;

  perform set_config('scar.motivo_rastreador',
    format('Cobranca gerada: R$ %s, vencimento %s', p_valor,
           to_char(coalesce(p_vencimento, current_date + 10), 'DD/MM/YYYY')), true);
  update rastreadores set status = 'BOLETO_GERADO' where id = r.id;

  insert into rastreador_eventos (rastreador_id, tipo, descricao, payload, usuario_id)
    values (r.id, 'STATUS', 'Titulo de cobranca do equipamento emitido',
            jsonb_build_object('titulo_id', t.id, 'valor', p_valor),
            (select u.id from usuarios u where u.id = auth.uid()));

  return t;
end;
$$;

comment on function cobrar_rastreador(uuid, numeric, date, text) is
  'Gera o titulo a receber do equipamento nao devolvido e move o aparelho para 7 - Boleto gerado.';

-- ----------------------------------------------------------------------------
-- (E) O que o SAC precisa saber ao atender
-- ----------------------------------------------------------------------------
create or replace function situacao_rastreamento_veiculo(p_veiculo_id uuid)
returns table (
  tem_equipamento    boolean,
  rastreador_id      uuid,
  imei               text,
  status             status_rastreador,
  status_numero      smallint,
  rastreadora        text,
  suspenso_por_debito boolean,
  dias_atraso        integer,
  exige_rastreador   boolean,
  situacao           text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id is not null,
    r.id, r.imei, r.status, numero_status_rastreador(r.status::text),
    coalesce(nullif(btrim(f.nome_fantasia), ''), f.razao_social),
    coalesce(r.status::text = 'INADIMPLENTE', false),
    dias_atraso_cliente(v.cliente_id),
    coalesce(tv.exige_rastreador, false) or coalesce(pp.exige_rastreador, false),
    case
      when r.id is null and (coalesce(tv.exige_rastreador, false) or coalesce(pp.exige_rastreador, false))
        then 'A cobertura exige rastreador e o veiculo nao tem equipamento instalado'
      when r.id is null then 'Veiculo sem rastreador'
      when r.status::text = 'ATIVO' then 'Rastreamento ativo'
      when r.status::text = 'INADIMPLENTE'
        then format('Rastreamento suspenso: associado com %s dias de atraso',
                    dias_atraso_cliente(v.cliente_id))
      else 'Equipamento em ' || numero_status_rastreador(r.status::text) || ' - ' || r.status::text
    end
  from veiculos v
  left join rastreadores r on r.veiculo_id = v.id
        and r.status::text in ('ATIVO', 'INADIMPLENTE')
  left join fornecedores f     on f.id  = r.empresa_rastreamento_id
  left join tipos_veiculo tv   on tv.id = v.tipo_veiculo_id
  left join planos_protecao pp on pp.id = v.plano_protecao_id
 where v.id = p_veiculo_id
   and (is_staff() or v.cliente_id = auth_cliente_id());
$$;

grant execute on function dias_atraso_cliente(uuid) to authenticated, service_role;
grant execute on function sincronizar_rastreadores_inadimplencia(integer, uuid) to authenticated, service_role;
grant execute on function cobrar_rastreador(uuid, numeric, date, text) to authenticated, service_role;
grant execute on function situacao_rastreamento_veiculo(uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Rito da 0052: funcao nova nasce com `execute` para PUBLIC (embutido no
-- Postgres). Toda migration que cria funcao fecha a porta no fim do arquivo.
-- ----------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema public to service_role;
