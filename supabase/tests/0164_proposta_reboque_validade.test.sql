-- 0164 — km do reboque por tipo e validade da proposta.
do $$
declare v_tipo uuid; v_ok boolean;
begin
  insert into tipos_veiculo (nome) values ('TIPO 0164') returning id into v_tipo;
  assert (select km_reboque_ida is null and km_reboque_volta is null from tipos_veiculo where id = v_tipo),
    'km nasce nulo (nao informado)';
  update tipos_veiculo set km_reboque_ida = 500, km_reboque_volta = 500 where id = v_tipo;

  v_ok := false;
  begin
    update tipos_veiculo set km_reboque_ida = -1 where id = v_tipo;
  exception when check_violation then v_ok := true;
  end;
  assert v_ok, 'km negativo deveria ser recusado';

  assert exists (select 1 from information_schema.columns where table_name = 'empresa'
                   and column_name = 'validade_proposta_dias' and column_default = '30'),
    'validade padrao 30';
  if not exists (select 1 from empresa) then insert into empresa (razao_social) values ('EMPRESA 0164'); end if;
  v_ok := false;
  begin
    update empresa set validade_proposta_dias = 0;
  exception when check_violation then v_ok := true;
  end;
  assert v_ok, 'validade 0 deveria ser recusada';

  raise notice '=== TESTES 0164 (proposta: reboque e validade) PASSARAM ===';
end $$;
