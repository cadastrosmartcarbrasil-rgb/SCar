-- ============================================================================
-- 0070_cotacao_troca_plano
--
-- DESCER DE PLANO ATE A COBERTURA BASE.
--
-- `atualizar_cotacao` (0028) resolvia o combo com
-- `coalesce(p_plano_id, c.plano_id)`: passar NULO significava "mantem o que
-- esta". Isso cobre upgrade e troca lateral, mas torna o DOWNGRADE ate a
-- cobertura base impossivel — escolher "Somente cobertura base" na tela
-- salvava calado e a cotacao continuava com o plano anterior, cobrando por
-- ele. Erro pior que recusa: a tela dizia que tinha dado certo.
--
-- Agora existe um parametro para dizer explicitamente "sem plano". O default
-- e `false`, entao todo chamador de hoje (inclusive o
-- `aplicar_desconto_cotacao`, que chama por posicao) continua igual.
--
-- A lista de argumentos muda, entao e DROP + CREATE (uma sobrecarga faria a
-- chamada virar ambigua — gotcha ja registrado no CLAUDE.md).
-- ============================================================================

drop function if exists atualizar_cotacao(uuid, numeric, uuid, uuid, uuid, uuid[], text, numeric, text);

create or replace function atualizar_cotacao(
  p_cotacao_id      uuid,
  p_fipe            numeric default null,
  p_tipo_veiculo_id uuid default null,
  p_cota_id         uuid default null,
  p_plano_id        uuid default null,
  p_opcionais_ids   uuid[] default null,
  p_modo_envio      text default null,
  p_desconto_percentual numeric default null,
  p_desconto_justificativa text default null,
  p_limpar_plano    boolean default false
)
returns cotacoes
language plpgsql
security definer
set search_path = public
as $$
declare
  c        cotacoes;
  v_lead   leads;
  v_calc   jsonb;
  v_itens  jsonb;
  v_fipe   numeric;
  v_tipo   uuid;
  v_plano  uuid;
  v_opc    uuid[];
  v_desc   numeric;
  v_reg    uuid;
  v_limite numeric;
  v_aprov  uuid;
  v_aprov_em timestamptz;
begin
  if not is_staff() then raise exception 'Sem permissao'; end if;

  select * into c from cotacoes where id = p_cotacao_id;
  if c.id is null then raise exception 'Cotacao nao encontrada'; end if;
  select * into v_lead from leads where id = c.lead_id;

  if not lead_em_negociacao(c.lead_id) then
    raise exception 'Cotacao bloqueada: o lead ja foi enviado para auditoria (status %)', v_lead.status;
  end if;

  v_fipe  := coalesce(p_fipe, c.fipe);
  v_tipo  := coalesce(p_tipo_veiculo_id, c.tipo_veiculo_id);
  -- Descer ate a base e uma escolha, nao um esquecimento: so limpa quem pediu.
  v_plano := case when p_limpar_plano then null else coalesce(p_plano_id, c.plano_id) end;
  v_opc   := coalesce(p_opcionais_ids, c.opcionais_ids, '{}'::uuid[]);
  if v_tipo is null then raise exception 'Informe o tipo de veiculo da cotacao'; end if;

  -- Motor de precos: base obrigatoria + itens do plano + opcionais escolhidos.
  v_calc := cotar_plano(v_fipe, v_tipo, v_plano, v_opc);
  v_itens := coalesce(v_calc->'detalhamento_produtos', '[]'::jsonb);

  -- Seguranca: nenhum item obrigatorio pode ficar de fora do snapshot.
  if exists (
    select 1 from produtos_obrigatorios_cotacao(v_tipo, v_plano, v_fipe) o
     where not exists (
       select 1 from jsonb_array_elements(v_itens) i
        where (i->>'produto_id')::uuid = o.produto_id
     )
  ) then
    raise exception 'A edicao removeria itens obrigatorios do plano';
  end if;

  -- Desconto: mantem o atual quando nao informado.
  v_desc     := coalesce(p_desconto_percentual, c.desconto_percentual, 0);
  v_aprov    := c.desconto_aprovado_por;
  v_aprov_em := c.desconto_aprovado_em;

  if p_desconto_percentual is not null and p_desconto_percentual <> c.desconto_percentual then
    select coalesce(l.regional_id, u.regional_id) into v_reg
      from leads l left join usuarios u on u.id = l.consultor_id
     where l.id = c.lead_id;
    v_limite := limite_desconto_regional(v_reg);

    if v_desc > v_limite then
      -- Acima do limite: exige alcada + justificativa (a trava do trigger
      -- continua valendo para qualquer outro caminho).
      if not pode_aprovar_desconto() then
        raise exception 'DESCONTO_ACIMA_DO_LIMITE: % %% excede o limite de % %% da regional — necessaria aprovacao de gestor',
          v_desc, v_limite;
      end if;
      if p_desconto_justificativa is null or btrim(p_desconto_justificativa) = '' then
        raise exception 'Informe a justificativa da excecao de desconto';
      end if;
      v_aprov := auth.uid();
      v_aprov_em := now();
    else
      -- Dentro do limite: nao precisa de aprovacao.
      v_aprov := null;
      v_aprov_em := null;
    end if;
  end if;

  update cotacoes
     set fipe                 = v_fipe,
         tipo_veiculo_id      = v_tipo,
         cota_participacao_id = coalesce(p_cota_id, cota_participacao_id),
         plano_id             = v_plano,
         opcionais_ids        = v_opc,
         itens                = v_itens,
         total_mensalidade    = (v_calc->>'valor_total_mensalidade')::numeric,
         taxa_adesao          = coalesce((v_calc->>'taxa_adesao')::numeric, 0),
         participacao         = calcular_participacao(v_fipe, v_tipo, coalesce(p_cota_id, cota_participacao_id)),
         modo_envio           = coalesce(p_modo_envio, modo_envio),
         desconto_percentual  = v_desc,
         desconto_aprovado_por = v_aprov,
         desconto_aprovado_em  = v_aprov_em,
         desconto_justificativa = case when v_aprov is null then null
                                       else coalesce(p_desconto_justificativa, desconto_justificativa) end,
         atualizada_em        = now(),
         atualizada_por       = auth.uid()
   where id = p_cotacao_id
   returning * into c;

  return c;
end;
$$;

-- ----------------------------------------------------------------------------
-- Rito de seguranca (0052): funcao nasce com EXECUTE para PUBLIC.
-- ----------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
