-- ============================================================================
-- 0195 - O CONSULTOR DE CADA VEICULO, para quem atende
-- Pedido do usuario (09/11/2026): na Fila de Cobranca, ao abrir o atendimento,
-- e na identificacao da ficha do veiculo, mostrar o nome do consultor daquele
-- veiculo (veiculos.vendedor_id).
--
-- Por que uma RPC e nao um embed: a RLS de `vendedores` (0003) e
-- pode_regional(regional_id) — o atendente da cobranca do Brasil (papel
-- `cobranca` sem unidade) e quem ve a carteira por `cobranca_escopo()` nao
-- enxergariam o vendedor, e o consultor de OUTRA unidade (o veiculo pode ter
-- sido vendido por alguem de fora) sumiria em silencio. Aqui o acesso e o do
-- associado: cobranca_pode_cliente (0097) ou a unidade do associado/veiculo
-- (pode_regional, que ja inclui as unidades de atuacao, 0115/0131).
-- So leitura; nenhuma tabela muda.
-- ============================================================================

create or replace function consultores_do_cliente(p_cliente_id uuid, p_veiculo_id uuid default null)
returns table (
  veiculo_id         uuid,
  placa              text,
  chassi             text,
  status             text,
  vendedor_id        uuid,
  consultor          text,
  consultor_telefone text,
  consultor_email    text,
  consultor_ativo    boolean,
  consultor_regional text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cli clientes%rowtype;
begin
  select * into v_cli from clientes where id = p_cliente_id;
  if not found then
    return;
  end if;

  if auth.uid() is not null then
    if not is_staff() then
      return;
    end if;
    if not (
         cobranca_pode_cliente(p_cliente_id)
      or pode_regional(v_cli.regional_id)
      or exists (select 1 from veiculos vx
                  where vx.cliente_id = p_cliente_id
                    and (p_veiculo_id is null or vx.id = p_veiculo_id)
                    and pode_regional(vx.regional_id))
    ) then
      return;
    end if;
  end if;

  return query
  select v.id,
         v.placa::text,
         v.chassi::text,
         v.status::text,
         v.vendedor_id,
         coalesce(nullif(trim(vd.nome), ''), u.nome)::text,
         coalesce(nullif(trim(vd.telefone), ''), nullif(trim(u.telefone), ''))::text,
         coalesce(nullif(trim(vd.email), ''), u.email)::text,
         vd.ativo,
         r.nome::text
    from veiculos v
    left join vendedores vd on vd.id = v.vendedor_id
    left join usuarios   u  on u.id  = vd.usuario_id
    left join regionais  r  on r.id  = vd.regional_id
   where v.cliente_id = p_cliente_id
     and (p_veiculo_id is null or v.id = p_veiculo_id)
   order by ordem_status_veiculo(v.status), v.placa nulls last;
end;
$$;

comment on function consultores_do_cliente(uuid, uuid) is
  '0195: o consultor (veiculos.vendedor_id) de cada veiculo do associado, para a fila de cobranca e a ficha do veiculo. Acesso: cobranca_pode_cliente ou a unidade (pode_regional).';

revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
