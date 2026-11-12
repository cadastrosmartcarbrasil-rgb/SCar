-- =============================================================================
-- 0197 — FRANQUIA DO REBOQUE PELO TIPO DE VEICULO (um lugar so)
--
-- Pedido do usuario (12/11/2026): "moto, o reboque e so de 200 km; carro de
-- passeio, 1000 km" — e ajustar num lugar so. Ate aqui eram dois:
--   . `tipos_veiculo.km_reboque_ida/volta` (0164) — so o texto da proposta;
--   . `servicos_assistencia.km_franquia` (0026) — o que a OS usa para o KM
--     excedente pago ao prestador.
-- Agora o servico marcado `franquia_pelo_tipo` (reboque/guincho) usa como
-- franquia o `km_reboque_ida` do TIPO do veiculo do acionamento. A rota da OS
-- e resgate -> destino (UM sentido), entao vale o km de IDA.
-- Servico nao marcado, ou tipo sem km informado, segue no `km_franquia` do
-- servico (reserva). Valor do km excedente continua no servico/prestador.
-- Default false: nenhuma OS muda ao aplicar. Re-executavel.
-- =============================================================================

alter table servicos_assistencia
  add column if not exists franquia_pelo_tipo boolean not null default false;

comment on column servicos_assistencia.franquia_pelo_tipo is
  '0197: reboque/guincho — a franquia de km sai de tipos_veiculo.km_reboque_ida do veiculo do acionamento (reserva: km_franquia).';

comment on column tipos_veiculo.km_reboque_ida is
  '0164/0197: km do reboque da Assistencia 24h (ida). Mostrado na proposta e usado como franquia da OS nos servicos com franquia_pelo_tipo. Nulo = nao informado.';

-- Franquia efetiva do servico para um veiculo.
create or replace function franquia_km_servico(p_servico_id uuid, p_veiculo_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select case
           when s.franquia_pelo_tipo and t.km_reboque_ida is not null then t.km_reboque_ida::numeric
           else coalesce(s.km_franquia, 0)
         end
    from servicos_assistencia s
    left join veiculos v on v.id = p_veiculo_id
    left join tipos_veiculo t on t.id = v.tipo_veiculo_id
   where s.id = p_servico_id
     and (is_staff() or auth.uid() is null);
$$;

-- KM excedente com o veiculo (a versao de 2 argumentos da 0031 segue igual).
create or replace function km_excedente_servico(p_servico_id uuid, p_distancia_km numeric, p_veiculo_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select case
           when s.cobra_km_excedente is not true then 0
           else greatest(0, round(coalesce(p_distancia_km, 0)
                                  - coalesce(franquia_km_servico(p_servico_id, p_veiculo_id), 0), 2))
         end
    from servicos_assistencia s
   where s.id = p_servico_id
     and (is_staff() or auth.uid() is null);
$$;

-- definir_trajeto_acionamento (corpo da 0031/0027 em producao) passa a usar o veiculo.
create or replace function definir_trajeto_acionamento(
  p_acionamento_id uuid,
  p_origem jsonb default null,
  p_destino jsonb default null,
  p_distancia_km numeric default null,
  p_duracao_min integer default null,
  p_polyline text default null,
  p_km_excedente numeric default null,
  p_motivo text default null
)
returns acionamentos_assistencia
language plpgsql
security definer
set search_path = public
as $$
declare
  a        acionamentos_assistencia;
  s        servicos_assistencia;
  v_dist   numeric;
  v_km     numeric;
  v_km_un  numeric;
  v_km_tot numeric;
begin
  if not pode_assistencia() then raise exception 'Sem permissao'; end if;

  select * into a from acionamentos_assistencia where id = p_acionamento_id;
  if a.id is null then raise exception 'Acionamento nao encontrado'; end if;
  if a.status = 'CANCELADO' then raise exception 'Acionamento cancelado nao pode ser editado'; end if;
  select * into s from servicos_assistencia where id = a.servico_id;

  perform set_config('scar.motivo_edicao', coalesce(p_motivo, 'Atualizacao do trajeto'), true);

  v_dist := coalesce(p_distancia_km, a.distancia_km_calculada);
  -- KM excedente: override manual > calculo pela rota (franquia do tipo, 0197) > o que ja estava.
  v_km := coalesce(
    p_km_excedente,
    case when v_dist is not null then km_excedente_servico(a.servico_id, v_dist, a.veiculo_id) end,
    a.km_excedente
  );
  if s.cobra_km_excedente is not true then v_km := 0; end if;

  v_km_un := coalesce(
    case when a.km_excedente > 0 then a.valor_km_excedente / nullif(a.km_excedente, 0) end,
    (select valor_km from prestador_servicos
      where fornecedor_id = a.prestador_id and servico_id = a.servico_id),
    s.valor_km_excedente
  );
  v_km_tot := round(coalesce(v_km, 0) * coalesce(v_km_un, 0), 2);

  update acionamentos_assistencia
     set origem                 = coalesce(p_origem, origem),
         destino                = coalesce(p_destino, destino),
         distancia_km_calculada = coalesce(p_distancia_km, distancia_km_calculada),
         duracao_minutos        = coalesce(p_duracao_min, duracao_minutos),
         rota_polyline          = coalesce(p_polyline, rota_polyline),
         rota_calculada_em      = case when p_distancia_km is not null then now() else rota_calculada_em end,
         km_previsto            = coalesce(p_distancia_km, km_previsto),
         km_excedente           = coalesce(v_km, 0),
         valor_km_excedente     = v_km_tot,
         valor_total            = round(coalesce(valor_servico, 0) + v_km_tot, 2),
         updated_at             = now()
   where id = p_acionamento_id;

  -- Titulo em Contas a Pagar acompanha o novo valor (0027).
  perform sincronizar_lancamento_acionamento(p_acionamento_id);
  perform set_config('scar.motivo_edicao', '', true);

  -- Re-seleciona: a sincronia acima pode ter mexido na linha (gotcha do 0027).
  select * into a from acionamentos_assistencia where id = p_acionamento_id;
  return a;
end;
$$;

revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
