-- =============================================================================
-- 0165_api_cadastro_rastreadores
-- A RASTREADORA CADASTRA OS EQUIPAMENTOS PELA API (pedido do usuario, 31/10/2026).
--
-- O caso: a New Tracker conectou (0151), leu os veiculos 181 vezes e nada
-- apareceu em Rastreadores — o parque estava VAZIO e a API so sabia receber a
-- comunicacao de IMEI ja cadastrado. Esta chamada e a porta de entrada do parque:
--
--   POST /api/externa/v1/rastreadores  (escopo rastreadores:escrever)
--   { "equipamentos": [ { imei, numero_serie?, iccid?, linha?, operadora?,
--       modelo?, fabricante?, placa? | chassi? | veiculo_id?, data_instalacao?,
--       observacoes? } ] }   — ate 500 por chamada
--
-- Regras (uma linha de resultado por item; um item ruim NAO derruba o lote):
--   * a chave TEM de estar ligada a uma rastreadora (fornecedor): o equipamento
--     nasce dela. Sem isso a chamada inteira e recusada;
--   * IMEI ja cadastrado de OUTRA plataforma -> OUTRA_PLATAFORMA (nao toca);
--   * IMEI novo -> cria em estoque (DISPONIVEL); IMEI existente -> completa os
--     dados que vierem (o que nao vier fica como esta);
--   * com veiculo (placa, chassi ou id) -> instala: ATIVO, ligado ao veiculo e ao
--     associado, unidade do veiculo, data de instalacao. A ficha do veiculo
--     e atualizada pelo espelho da 0050;
--   * equipamento ATIVO em outro veiculo -> e movido (sai do antigo, entra no novo);
--   * o veiculo ja tem OUTRO equipamento ativo: da mesma plataforma, o antigo
--     volta ao estoque (troca de aparelho); de outra plataforma -> RECUSADO;
--   * equipamento fora de estoque/ativo (inativo, a devolver, manutencao,
--     baixado...) nao e instalado pela API -> RECUSADO (a equipe resolve na tela);
--   * a trava de inadimplencia de `instalar_rastreador` (35 dias) NAO se aplica:
--     aqui a rastreadora informa um fato ja ocorrido na rua, nao pede licenca;
--   * instalacao recusada ou veiculo nao achado: o equipamento NOVO fica em estoque;
--   * nao desinstala nem baixa: isso continua na tela do modulo.
-- Resultados: CRIADO, CRIADO_INSTALADO, ATUALIZADO, INSTALADO, JA_INSTALADO,
--   VEICULO_NAO_ENCONTRADO (o equipamento entra/fica em estoque), OUTRA_PLATAFORMA,
--   RECUSADO, INVALIDO, ERRO.
-- =============================================================================

create or replace function api_cadastrar_rastreadores(p_integracao_id uuid, p_itens jsonb)
returns table (
  imei text, resultado text, motivo text, rastreador_id uuid,
  veiculo_id uuid, placa text, situacao_rastreamento text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v        api_integracoes := api_exigir(p_integracao_id, 'rastreadores:escrever');
  it       jsonb;
  v_imei   text;
  v_placa  text;
  v_chas   text;
  v_vid    uuid;
  v_ref    boolean;
  v_iccid  text;
  v_linha  text;
  v_data   timestamptz;
  v_obs    text;
  r        rastreadores;
  ve       veiculos;
  outro    rastreadores;
  v_novo   boolean;
  v_aviso  text;
begin
  if v.fornecedor_id is null then
    raise exception 'A chave nao esta ligada a uma rastreadora: peca a Smart Car para vincular'
      using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_itens) is distinct from 'array' then
    raise exception 'Envie uma lista de equipamentos' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(p_itens) > 500 then
    raise exception 'No maximo 500 equipamentos por chamada' using errcode = 'check_violation';
  end if;

  for it in select * from jsonb_array_elements(p_itens) loop
    imei := null; resultado := null; motivo := null; rastreador_id := null;
    veiculo_id := null; placa := null; situacao_rastreamento := null;
    v_aviso := null;

    if jsonb_typeof(it) is distinct from 'object' then
      resultado := 'INVALIDO'; motivo := 'Item nao e um objeto';
      return next; continue;
    end if;

    v_imei := regexp_replace(coalesce(it->>'imei', ''), '\D', '', 'g');
    imei := v_imei;
    if v_imei !~ '^[0-9]{14,17}$' then
      resultado := 'INVALIDO'; motivo := 'IMEI deve ter de 14 a 17 digitos';
      return next; continue;
    end if;

    v_iccid := nullif(regexp_replace(coalesce(it->>'iccid', ''), '\D', '', 'g'), '');
    if v_iccid is not null and v_iccid !~ '^[0-9]{8,22}$' then
      v_iccid := null; v_aviso := 'ICCID ignorado (formato invalido)';
    end if;
    v_linha := nullif(regexp_replace(coalesce(it->>'linha', ''), '\D', '', 'g'), '');
    v_obs := nullif(left(btrim(coalesce(it->>'observacoes', '')), 500), '');

    v_data := null;
    if nullif(btrim(coalesce(it->>'data_instalacao', '')), '') is not null then
      begin
        v_data := (it->>'data_instalacao')::timestamptz;
      exception when others then
        v_data := null;
      end;
      if v_data is null or v_data > now() + interval '1 day' then
        resultado := 'INVALIDO'; motivo := 'data_instalacao invalida (ISO 8601, nao pode ser futura)';
        return next; continue;
      end if;
    end if;

    -- o veiculo (opcional): id > chassi > placa, sempre dentro das unidades da chave
    v_placa := nullif(upper(regexp_replace(coalesce(it->>'placa', ''), '[^A-Za-z0-9]', '', 'g')), '');
    v_chas  := nullif(upper(regexp_replace(coalesce(it->>'chassi', ''), '[^A-Za-z0-9]', '', 'g')), '');
    v_vid   := null;
    if coalesce(it->>'veiculo_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_vid := (it->>'veiculo_id')::uuid;
    end if;
    v_ref := v_vid is not null or v_chas is not null or v_placa is not null;
    ve := null;
    if v_ref then
      select x.* into ve from veiculos x
       where x.status::text <> 'excluido'
         and (v.regional_ids is null or x.regional_id = any(v.regional_ids))
         and ((v_vid is not null and x.id = v_vid)
              or (v_vid is null and v_chas is not null and x.chassi = v_chas)
              or (v_vid is null and v_chas is null and x.placa = v_placa))
       order by (x.status::text in ('ativo','em_evento','vistoria_pendente','inadimplente','suspenso')) desc,
                x.updated_at desc
       limit 1;
    end if;

    begin
      perform set_config('scar.motivo_rastreador',
        'API ' || v.nome || coalesce(': ' || v_obs, ''), true);

      select x.* into r from rastreadores x where x.imei = v_imei;
      v_novo := r.id is null;

      if not v_novo and r.empresa_rastreamento_id is distinct from v.fornecedor_id then
        resultado := 'OUTRA_PLATAFORMA'; motivo := 'IMEI cadastrado para outra rastreadora';
        return next; continue;
      end if;

      if v_novo then
        insert into rastreadores (imei, numero_serie, iccid, linha, operadora, modelo, fabricante,
                                  empresa_rastreamento_id, regional_id, status, observacoes)
        values (v_imei,
                nullif(left(btrim(coalesce(it->>'numero_serie', '')), 60), ''),
                v_iccid, v_linha,
                nullif(upper(left(btrim(coalesce(it->>'operadora', '')), 40)), ''),
                nullif(upper(left(btrim(coalesce(it->>'modelo', '')), 60)), ''),
                nullif(upper(left(btrim(coalesce(it->>'fabricante', '')), 60)), ''),
                v.fornecedor_id, ve.regional_id, 'DISPONIVEL', v_obs)
        returning * into r;
      else
        update rastreadores x
           set numero_serie = coalesce(nullif(left(btrim(coalesce(it->>'numero_serie', '')), 60), ''), x.numero_serie),
               iccid        = coalesce(v_iccid, x.iccid),
               linha        = coalesce(v_linha, x.linha),
               operadora    = coalesce(nullif(upper(left(btrim(coalesce(it->>'operadora', '')), 40)), ''), x.operadora),
               modelo       = coalesce(nullif(upper(left(btrim(coalesce(it->>'modelo', '')), 60)), ''), x.modelo),
               fabricante   = coalesce(nullif(upper(left(btrim(coalesce(it->>'fabricante', '')), 60)), ''), x.fabricante)
         where x.id = r.id
           and (x.numero_serie, x.iccid, x.linha, x.operadora, x.modelo, x.fabricante)
               is distinct from
               (coalesce(nullif(left(btrim(coalesce(it->>'numero_serie', '')), 60), ''), x.numero_serie),
                coalesce(v_iccid, x.iccid), coalesce(v_linha, x.linha),
                coalesce(nullif(upper(left(btrim(coalesce(it->>'operadora', '')), 40)), ''), x.operadora),
                coalesce(nullif(upper(left(btrim(coalesce(it->>'modelo', '')), 60)), ''), x.modelo),
                coalesce(nullif(upper(left(btrim(coalesce(it->>'fabricante', '')), 60)), ''), x.fabricante))
        returning * into r;
        if r.id is null then
          select x.* into r from rastreadores x where x.imei = v_imei;
        end if;
      end if;
      rastreador_id := r.id;

      -- sem veiculo pedido: so o cadastro
      if not v_ref then
        resultado := case when v_novo then 'CRIADO' else 'ATUALIZADO' end;
        motivo := v_aviso;
        if r.veiculo_id is not null then
          select x.id, x.placa, api_situacao_rastreamento(x.status::text)
            into veiculo_id, placa, situacao_rastreamento
            from veiculos x where x.id = r.veiculo_id;
        end if;
        return next; continue;
      end if;

      if ve.id is null then
        resultado := 'VEICULO_NAO_ENCONTRADO';
        motivo := concat_ws(' · ',
          'Veiculo ' || coalesce(v_placa, v_chas, it->>'veiculo_id') || ' nao encontrado na Smart Car'
            || case when v_novo then '; equipamento cadastrado em estoque' else '' end,
          v_aviso);
        return next; continue;
      end if;

      veiculo_id := ve.id; placa := ve.placa;
      situacao_rastreamento := api_situacao_rastreamento(ve.status::text);

      if r.status::text = 'ATIVO' and r.veiculo_id = ve.id then
        resultado := case when v_novo then 'CRIADO_INSTALADO' else 'JA_INSTALADO' end;
        motivo := v_aviso;
        return next; continue;
      end if;

      if r.status::text not in ('DISPONIVEL', 'ATIVO') then
        resultado := 'RECUSADO';
        motivo := 'Equipamento em ' || numero_status_rastreador(r.status::text) || ' - ' || r.status::text
                  || ': a instalacao precisa ser liberada pela Smart Car';  -- (equipamento existente)
        return next; continue;
      end if;

      -- o veiculo ja tem outro equipamento ativo?
      select x.* into outro from rastreadores x
       where x.veiculo_id = ve.id and x.status::text = 'ATIVO' and x.id <> r.id;
      if outro.id is not null then
        if outro.empresa_rastreamento_id is distinct from v.fornecedor_id then
          resultado := 'RECUSADO';
          motivo := 'O veiculo ja tem rastreador ativo de outra rastreadora (IMEI ' || outro.imei || ')'
                    || case when v_novo then '; equipamento cadastrado em estoque' else '' end;
          return next; continue;
        end if;
        perform set_config('scar.motivo_rastreador',
          'API ' || v.nome || ': substituido pelo IMEI ' || v_imei, true);
        update rastreadores x
           set status = 'DISPONIVEL', veiculo_id = null, cliente_id = null,
               data_desinstalacao = coalesce(v_data, now())
         where x.id = outro.id;
        v_aviso := concat_ws(' · ', v_aviso, 'IMEI ' || outro.imei || ' voltou ao estoque (troca)');
        perform set_config('scar.motivo_rastreador',
          'API ' || v.nome || coalesce(': ' || v_obs, ''), true);
      end if;

      -- ativo em outro veiculo: sai de la antes (mantem o historico em dois passos)
      if r.status::text = 'ATIVO' and r.veiculo_id is distinct from ve.id then
        update rastreadores x
           set status = 'DISPONIVEL', veiculo_id = null, cliente_id = null,
               data_desinstalacao = coalesce(v_data, now())
         where x.id = r.id;
        v_aviso := concat_ws(' · ', v_aviso, 'movido de outro veiculo');
      end if;

      update rastreadores x
         set status             = 'ATIVO',
             veiculo_id         = ve.id,
             cliente_id         = ve.cliente_id,
             regional_id        = coalesce(ve.regional_id, x.regional_id),
             data_instalacao    = coalesce(v_data, now()),
             data_desinstalacao = null
       where x.id = r.id;

      resultado := case when v_novo then 'CRIADO_INSTALADO' else 'INSTALADO' end;
      motivo := v_aviso;
      return next;
    exception when others then
      resultado := 'ERRO';
      motivo := left(sqlerrm, 300);
      return next;
    end;
  end loop;
end;
$$;

comment on function api_cadastrar_rastreadores(uuid, jsonb) is
  'API externa (0165): a rastreadora cadastra/atualiza equipamentos por IMEI e instala no veiculo (placa/chassi/id). Ate 500 por chamada; resultado por item.';

-- Rito da 0052
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
