-- Teste funcional do ADICIONAL DE RISCO POR REGIONAL (0081): o preco passa a
-- variar por unidade sem duplicar tabela, e NADA mais se move junto.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_ges uuid := gen_random_uuid();
  r_sp uuid; r_nat uuid; tv uuid; cli uuid; veic uuid;
  base jsonb; com_ad jsonb; sem_ad jsonb;
  l_div uuid; l_ok uuid; cot uuid; v_reg uuid; v_div boolean;
  n_prod int; v_num numeric; v_ades numeric; v_part numeric; n int;
begin
  -- ===================================================== setup
  insert into auth.users (id, email) values (u_adm, 'adm81@t.com'), (u_ges, 'ges81@t.com');
  insert into regionais (nome) values ('Sao Paulo 81') returning id into r_sp;
  insert into regionais (nome) values ('Natal 81')     returning id into r_nat;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm, 'Admin', 'adm81@t.com', 'admin', null),
           (u_ges, 'Gestor', 'ges81@t.com', 'gestor_regional', r_nat);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;

  -- ==========================================================================
  -- (A) A REGRESSAO QUE IMPORTA: sem regional, NADA muda
  -- ==========================================================================
  base   := cotar_plano(50000, tv, null, '{}'::uuid[]);
  sem_ad := cotar_plano(50000, tv, null, '{}'::uuid[], null);
  assert (base->>'valor_total_mensalidade')::numeric
       = (sem_ad->>'valor_total_mensalidade')::numeric,
    'chamada antiga (4 args) e nova com regional NULA tem de dar o MESMO valor';
  assert (base->>'adicional_regional')::numeric = 0, 'sem regional o adicional e zero';

  -- A regional SEM adicional cadastrado tambem nao muda nada.
  sem_ad := cotar_plano(50000, tv, null, '{}'::uuid[], r_sp);
  assert (sem_ad->>'valor_total_mensalidade')::numeric
       = (base->>'valor_total_mensalidade')::numeric,
    'regional sem adicional cadastrado = preco da matriz, intacto';

  -- ==========================================================================
  -- (B) 🔴 UMA VEZ, NAO UMA POR PRODUTO — o coracao da entrega
  -- ==========================================================================
  select count(*) into n_prod
    from jsonb_array_elements(base->'detalhamento_produtos');
  assert n_prod >= 2,
    format('a faixa precisa ter 2+ itens para o teste valer; veio %s', n_prod);

  perform salvar_adicional_risco(r_sp, tv, 5.00, 'Roubo e furto acima da media');
  com_ad := cotar_plano(50000, tv, null, '{}'::uuid[], r_sp);

  assert (com_ad->>'valor_total_mensalidade')::numeric
       = (base->>'valor_total_mensalidade')::numeric + 5.00,
    format('+R$5,00 com %s itens tinha de somar 5,00 e nao %s',
           n_prod,
           (com_ad->>'valor_total_mensalidade')::numeric - (base->>'valor_total_mensalidade')::numeric);
  assert (com_ad->>'adicional_regional')::numeric = 5.00, 'o adicional vem DISCRIMINADO no retorno';

  -- E ele aparece como UMA linha propria, nunca embutido num produto.
  select count(*) into n from jsonb_array_elements(com_ad->'detalhamento_produtos') i
   where i->>'categoria' = 'ADICIONAL_REGIONAL';
  assert n = 1, format('o adicional tem de ser UMA linha discriminada; vieram %s', n);

  -- Vale para QUALQUER faixa FIPE do tipo — e o sentido de "uma linha cobre a tabela".
  assert (cotar_plano(150000, tv, null, '{}'::uuid[], r_sp)->>'valor_total_mensalidade')::numeric
       = (cotar_plano(150000, tv, null, '{}'::uuid[])->>'valor_total_mensalidade')::numeric + 5.00,
    'o adicional vale na faixa de 150k igual a de 50k';

  -- A unidade vizinha continua no preco da matriz.
  assert (cotar_plano(50000, tv, null, '{}'::uuid[], r_nat)->>'valor_total_mensalidade')::numeric
       = (base->>'valor_total_mensalidade')::numeric,
    'adicional de Sao Paulo nao pode vazar para Natal';

  -- ==========================================================================
  -- (C) SO MENSALIDADE: adesao e participacao NAO se movem
  -- ==========================================================================
  assert (com_ad->>'taxa_adesao')::numeric = (base->>'taxa_adesao')::numeric,
    'a adesao NAO recebe adicional';
  assert (com_ad->>'franquia_participacao')::numeric = (base->>'franquia_participacao')::numeric,
    'a participacao/franquia NAO recebe adicional';
  select calcular_adesao(50000, tv), calcular_participacao(50000, tv) into v_ades, v_part;
  assert v_ades = (com_ad->>'taxa_adesao')::numeric, 'calcular_adesao segue intacta';
  assert v_part = (com_ad->>'franquia_participacao')::numeric, 'calcular_participacao segue intacta';

  -- ==========================================================================
  -- (D) VIGENCIA: linha do futuro nao afeta a cotacao de hoje
  -- ==========================================================================
  update regional_adicional_risco
     set vigencia_inicio = current_date + 30
   where regional_id = r_sp and tipo_veiculo_id = tv and status;
  assert (cotar_plano(50000, tv, null, '{}'::uuid[], r_sp)->>'valor_total_mensalidade')::numeric
       = (base->>'valor_total_mensalidade')::numeric,
    'adicional que so comeca daqui a 30 dias NAO pode entrar na cotacao de hoje';
  assert adicional_risco_regional(r_sp, tv, current_date + 31) = 5.00,
    'mas consultando a data futura ele aparece';
  update regional_adicional_risco
     set vigencia_inicio = current_date
   where regional_id = r_sp and tipo_veiculo_id = tv and status;

  -- ==========================================================================
  -- (E) O VEICULO NA BASE NAO FLUTUA
  -- ==========================================================================
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','ASSOCIADO SP','52998224725', r_sp) returning id into cli;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, valor_fipe,
                        status, data_ativacao, valor_adicional_regional, regional_preco_id)
    values (cli, 'ADC1A23', r_sp, tv, 50000, 'ativo', current_date,
            5.00, r_sp)
    returning id into veic;

  v_num := valor_mensalidade_veiculo(veic);
  assert v_num = (base->>'valor_total_mensalidade')::numeric + 5.00,
    format('o faturamento tinha de somar o adicional carimbado; veio %s', v_num);

  -- A unidade reajusta o adicional HOJE: o veiculo que ja esta na base NAO muda.
  perform salvar_adicional_risco(r_sp, tv, 40.00, 'Reajuste de risco');
  assert valor_mensalidade_veiculo(veic) = v_num,
    'mudar o cadastro NAO pode retroagir no faturamento de quem ja esta na base';
  -- Mas a venda NOVA ja sai com o valor novo.
  assert (cotar_plano(50000, tv, null, '{}'::uuid[], r_sp)->>'adicional_regional')::numeric = 40.00,
    'venda nova usa o adicional vigente';
  perform salvar_adicional_risco(r_sp, tv, 5.00, 'volta ao original');

  -- ==========================================================================
  -- (F) 🔴 OVERRIDE NAO COBRA DUAS VEZES
  -- ==========================================================================
  -- `veiculos.valor_mensalidade` e preco final negociado e JA inclui o adicional
  -- (a tela que o grava cotou com a regional). Somar de novo cobraria em dobro.
  update veiculos set valor_mensalidade = 199.00 where id = veic;
  assert valor_mensalidade_veiculo(veic) = 199.00,
    format('override e final: nao pode virar 204,00; veio %s', valor_mensalidade_veiculo(veic));
  update veiculos set valor_mensalidade = null where id = veic;

  -- ==========================================================================
  -- (G) A COMISSAO NAO FOI TOCADA (decisao do usuario, 20/09/2026)
  -- ==========================================================================
  -- `regionais.taxa_comissao_recorrente` e TETO: ela nao multiplica valor nenhum.
  -- Quem vira dinheiro e a do VENDEDOR, em fn_calcular_comissao, sobre o titulo
  -- cheio — e essa funcao ficou intacta de proposito.
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'fn_calcular_comissao'
     and p.prosrc like '%coalesce(new.valor_pago, new.valor)%';
  assert n = 1,
    'fn_calcular_comissao tem de seguir comissionando sobre o valor CHEIO do titulo';

  -- ==========================================================================
  -- (H) O BANCO RECUSA DUAS VIGENCIAS SOBREPOSTAS NO MESMO PAR
  -- ==========================================================================
  begin
    insert into regional_adicional_risco (regional_id, tipo_veiculo_id, valor)
    values (r_sp, tv, 9.00);
    assert false, 'duas linhas vigentes para o mesmo par tinham de ser recusadas';
  exception when exclusion_violation then null;
  end;

  -- Valor negativo e recusado (decisao do usuario: adicional e adicional).
  begin
    insert into regional_adicional_risco (regional_id, tipo_veiculo_id, valor)
    values (r_nat, tv, -3.00);
    assert false, 'valor negativo tinha de ser recusado pelo check';
  exception when check_violation then null;
  end;

  -- ==========================================================================
  -- (I) PRECO E DA MATRIZ: o gestor regional LE o proprio e NAO escreve
  -- ==========================================================================
  perform set_config('request.jwt.claim.sub', u_ges::text, false);
  select count(*) into n from adicionais_risco_do_tipo(tv);
  assert n = 1, format('o gestor ve SO a propria unidade na grade; veio %s', n);

  begin
    perform salvar_adicional_risco(r_nat, tv, 7.00, 'tentativa');
    assert false, 'gestor regional NAO cadastra adicional — preco e da matriz';
  exception when others then
    if sqlstate = 'P0004' then raise; end if;   -- deixa o assert falhar de verdade
  end;
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  -- E a grade da matriz mostra as duas unidades, com "sem adicional" distinto de zero.
  select count(*) into n from adicionais_risco_do_tipo(tv);
  assert n = 2, format('a matriz ve as duas unidades; veio %s', n);
  select count(*) into n from adicionais_risco_do_tipo(tv) where valor is null;
  assert n = 1, 'unidade sem adicional vem com valor NULL, nao com zero';

  -- ==========================================================================
  -- (J) QUAL REGIONAL PRECIFICA — e o snapshot chegando na cotacao
  -- ==========================================================================
  -- Lead da unidade de NATAL, mas o associado ja existe e e de SAO PAULO:
  -- quem precifica e o ASSOCIADO (decisao 7), e isso e uma DIVERGENCIA.
  insert into leads (nome, celular, regional_id, tipo_veiculo_id, valor_fipe, cliente_existente_id)
    values ('LEAD DIVERGENTE', '84999990000', r_nat, tv, 50000, cli)
    returning id into l_div;

  assert regional_preco_do_lead(l_div) = r_sp,
    'o associado e de Sao Paulo: e ELE que precifica, nao a unidade que vendeu';
  select divergente into v_div from divergencia_regional_preco(l_div);
  assert v_div, 'vendeu Natal, associado de Sao Paulo: tem de acusar divergencia';

  -- Sem associado, vale a regional do proprio lead e nao ha divergencia.
  insert into leads (nome, celular, regional_id, tipo_veiculo_id, valor_fipe)
    values ('LEAD SIMPLES', '84999991111', r_nat, tv, 50000)
    returning id into l_ok;
  assert regional_preco_do_lead(l_ok) = r_nat, 'sem associado, precifica a unidade do lead';
  select divergente into v_div from divergencia_regional_preco(l_ok);
  assert not v_div, 'mesma unidade dos dois lados: nao ha divergencia';

  -- E a cotacao GRAVA o snapshot (sem ele as colunas seriam decoracao).
  insert into cotacoes (lead_id, fipe, tipo_veiculo_id, itens, total_mensalidade)
    values (l_div, 50000, tv, '[]'::jsonb, 0) returning id into cot;
  perform atualizar_cotacao(cot, 50000, tv);

  select regional_id, valor_adicional_regional into v_reg, v_num from cotacoes where id = cot;
  assert v_reg = r_sp, 'a cotacao tem de carimbar a unidade que precificou';
  assert v_num = 5.00, format('a cotacao tem de congelar o adicional; veio %s', v_num);
  assert (select total_mensalidade from cotacoes where id = cot)
       = (base->>'valor_total_mensalidade')::numeric + 5.00,
    'o total da cotacao ja sai com o adicional dentro';

  -- Reajustar o cadastro NAO mexe na cotacao ja gravada — ela e a prova do aceite.
  perform salvar_adicional_risco(r_sp, tv, 40.00, 'reajuste depois da cotacao');
  assert (select valor_adicional_regional from cotacoes where id = cot) = 5.00,
    'cotacao ja gravada nao pode ser reescrita por reajuste posterior';
  perform salvar_adicional_risco(r_sp, tv, 5.00, 'volta');

  raise notice '=== TESTES 0081 (adicional de risco por regional) PASSARAM ===';
end $$;
