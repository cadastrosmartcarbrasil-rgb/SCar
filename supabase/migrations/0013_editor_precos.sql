-- ============================================================================
-- SCar :: 0013_editor_precos.sql
-- Substituicao atomica da matriz de precos de um tipo de veiculo (editor).
-- Deleta e reinsere faixas + participacao dentro de uma unica transacao.
-- SECURITY INVOKER: o RLS continua valendo (somente acesso global escreve).
-- ============================================================================

create or replace function substituir_tabela_precos(
  p_tipo_veiculo   uuid,
  p_faixas         jsonb,
  p_participacoes  jsonb
)
returns void
language plpgsql
as $$
begin
  delete from tabela_precos_faixa where tipo_veiculo_id = p_tipo_veiculo;
  delete from participacao_faixa   where tipo_veiculo_id = p_tipo_veiculo;

  insert into tabela_precos_faixa
    (tipo_veiculo_id, produto_id, fipe_minimo, fipe_maximo, valor_mensal, tipo_valor)
  select p_tipo_veiculo,
         (e->>'produto_id')::uuid,
         (e->>'fipe_minimo')::numeric,
         (e->>'fipe_maximo')::numeric,
         (e->>'valor_mensal')::numeric,
         coalesce(e->>'tipo_valor', 'VALOR')::tipo_valor_faixa
    from jsonb_array_elements(coalesce(p_faixas, '[]'::jsonb)) e;

  insert into participacao_faixa
    (tipo_veiculo_id, fipe_minimo, fipe_maximo, tipo_valor, valor)
  select p_tipo_veiculo,
         (e->>'fipe_minimo')::numeric,
         (e->>'fipe_maximo')::numeric,
         coalesce(e->>'tipo_valor', 'VALOR')::tipo_valor_faixa,
         (e->>'valor')::numeric
    from jsonb_array_elements(coalesce(p_participacoes, '[]'::jsonb)) e;
end;
$$;

grant execute on function substituir_tabela_precos(uuid, jsonb, jsonb) to authenticated;
