-- =============================================================================
-- 0152_plano_contas_padrao
-- O PLANO DE CONTAS PADRAO (EPP/ME), a DRE GERENCIAL, o BALANCETE DE
-- VERIFICACAO e o FLUXO DE CAIXA EVOLUTIVO (pedido do usuario, 26/10/2026,
-- com a planilha "Plano_de_Contas_e_Fluxo_Modelo.xlsx").
--
-- Decisoes do usuario:
--   * as contas antigas MIGRAM para o plano novo. Elas sao RECODIFICADAS NO
--     LUGAR (mesmo id): os ~1.500 lancamentos, os servicos da 24h e os tipos de
--     boleto avulso que apontam para elas seguem apontando, agora com o codigo
--     novo. O de-para fica em `plano_contas_migracao`.
--   * as contas proprias da protecao veicular (adesao, assistencia 24h, reparos
--     de eventos, indenizacoes, rastreamento, comissao de franquia...) entram
--     como ANALITICAS dentro dos grupos do plano, sem mudar a estrutura.
--   * duplicidade: antes de inserir, procura a conta pelo CODIGO ou pela
--     DESCRICAO exata (sem acento e sem caixa); achando, usa a existente. E a
--     regra passa a valer no banco para qualquer conta nova (trigger).
--
-- O sistema NAO e de partidas dobradas: o balancete e montado por partidas
-- DERIVADAS (balancete_partidas) dos lancamentos, das baixas, dos titulos do
-- SCar, das transferencias e dos saldos iniciais das contas bancarias. Toda
-- partida tem debito = credito, entao o balancete fecha por construcao.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A) As colunas do plano
-- -----------------------------------------------------------------------------
alter table categorias_dre
  add column if not exists analitica       boolean not null default true,
  add column if not exists natureza        text,
  add column if not exists destino         text,
  add column if not exists automatica      boolean not null default false,
  add column if not exists codigo_anterior text;

alter table categorias_dre alter column tipo drop not null;

alter table categorias_dre drop constraint if exists chk_categoria_natureza;
alter table categorias_dre add constraint chk_categoria_natureza check (
  natureza is null or natureza in (
    'ATIVO', 'PASSIVO', 'PATRIMONIO_LIQUIDO', 'RECEITA', 'DEDUCAO', 'CUSTO', 'DESPESA',
    'RESULTADO_FINANCEIRO', 'RECEITA_FINANCEIRA', 'DESPESA_FINANCEIRA'
  )
);

comment on column categorias_dre.analitica is
  'Analitica = recebe lancamento. Sintetica = so agrupa (soma as filhas pelo prefixo do codigo).';
comment on column categorias_dre.natureza is
  'ATIVO/PASSIVO/PATRIMONIO_LIQUIDO (balanco) ou RECEITA/DEDUCAO/CUSTO/DESPESA/RECEITA_FINANCEIRA/DESPESA_FINANCEIRA (DRE). Decide onde a conta aparece.';
comment on column categorias_dre.automatica is
  'Conta alimentada pelo sistema (disponibilidades, contas a receber, fornecedores a pagar, lucros acumulados): nao aceita lancamento direto.';
comment on column categorias_dre.codigo_anterior is
  'Codigo da conta antes da migracao para o plano padrao (0152).';

-- Nivel pelo numero de segmentos do codigo (1 = "3", 4 = "3.1.1.01").
create or replace function nivel_conta(p_codigo text)
returns int language sql immutable parallel safe set search_path = public
as $$ select coalesce(array_length(string_to_array(trim(p_codigo), '.'), 1), 0); $$;

-- Natureza pelo codigo do plano padrao (so para codigos no formato do plano).
create or replace function natureza_por_codigo(p_codigo text)
returns text language sql immutable parallel safe set search_path = public
as $$
  select case
           when p_codigo ~ '^1(\.|$)' then 'ATIVO'
           when p_codigo ~ '^2\.2(\.|$)' then 'PATRIMONIO_LIQUIDO'
           when p_codigo ~ '^2(\.|$)' then 'PASSIVO'
           when p_codigo ~ '^3\.2(\.|$)' then 'DEDUCAO'
           when p_codigo ~ '^3(\.|$)' then 'RECEITA'
           when p_codigo ~ '^4\.1(\.|$)' then 'CUSTO'
           when p_codigo ~ '^4\.3\.1(\.|$)' then 'RECEITA_FINANCEIRA'
           when p_codigo ~ '^4\.3\.2(\.|$)' then 'DESPESA_FINANCEIRA'
           when p_codigo ~ '^4\.3$' then 'RESULTADO_FINANCEIRO'
           when p_codigo ~ '^4(\.|$)' then 'DESPESA'
         end;
$$;

-- O `tipo` antigo (RECEITA/CUSTO_VARIAVEL/DESPESA_FIXA) segue alimentado para
-- quem ainda le por ele (resumo do DRE, painel das regionais). Balanco = nulo.
create or replace function tipo_por_natureza(p_natureza text)
returns tipo_categoria_dre language sql immutable parallel safe set search_path = public
as $$
  select (case p_natureza
            when 'RECEITA' then 'RECEITA'
            when 'RECEITA_FINANCEIRA' then 'RECEITA'
            when 'DEDUCAO' then 'CUSTO_VARIAVEL'
            when 'CUSTO' then 'CUSTO_VARIAVEL'
            when 'DESPESA' then 'DESPESA_FIXA'
            when 'DESPESA_FINANCEIRA' then 'DESPESA_FIXA'
            when 'RESULTADO_FINANCEIRO' then 'DESPESA_FIXA'
          end)::tipo_categoria_dre;
$$;

-- Descricao normalizada: a "descricao exata" sem caixa, acento nem espaco duplo.
create or replace function nome_conta_normalizado(p_nome text)
returns text language sql immutable parallel safe set search_path = public
as $$ select regexp_replace(texto_sem_acento(trim(coalesce(p_nome, ''))), '\s+', ' ', 'g'); $$;

-- -----------------------------------------------------------------------------
-- B) A trava do plano: duplicidade, formato e coerencia
-- -----------------------------------------------------------------------------
create or replace function fn_categoria_dre_plano()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_outro text;
begin
  new.codigo_estruturado := trim(new.codigo_estruturado);
  new.nome := regexp_replace(trim(new.nome), '\s+', ' ', 'g');

  if new.codigo_estruturado !~ '^[0-9]+(\.[0-9]+)*$' then
    raise exception 'Codigo de conta invalido: "%". Use numeros separados por ponto (ex.: 4.2.1.01).',
      new.codigo_estruturado using errcode = 'check_violation';
  end if;
  if new.nome = '' then
    raise exception 'Informe a descricao da conta.' using errcode = 'check_violation';
  end if;

  -- Duplicidade: codigo OU descricao exata ja cadastrados em outra conta.
  select c.codigo_estruturado || ' ' || c.nome into v_outro
    from categorias_dre c
   where c.id <> new.id and c.codigo_estruturado = new.codigo_estruturado
   limit 1;
  if v_outro is not null then
    raise exception 'Ja existe uma conta com o codigo %: %. Use a conta existente.',
      new.codigo_estruturado, v_outro using errcode = 'unique_violation';
  end if;

  select c.codigo_estruturado || ' ' || c.nome into v_outro
    from categorias_dre c
   where c.id <> new.id and nome_conta_normalizado(c.nome) = nome_conta_normalizado(new.nome)
   limit 1;
  if v_outro is not null then
    raise exception 'Ja existe uma conta com a descricao "%": %. Use a conta existente.',
      new.nome, v_outro using errcode = 'unique_violation';
  end if;

  if new.natureza is null then
    -- Codigo no formato do plano decide; codigo antigo (x.y.zz) segue o `tipo`.
    new.natureza := coalesce(
      case when new.codigo_estruturado !~ '^[1-4]\.[0-9]\.[0-9]{2}$'
           then natureza_por_codigo(new.codigo_estruturado) end,
      case new.tipo when 'RECEITA' then 'RECEITA'
                    when 'CUSTO_VARIAVEL' then 'CUSTO'
                    when 'DESPESA_FIXA' then 'DESPESA' end);
  end if;
  if new.natureza is not null then
    new.tipo := tipo_por_natureza(new.natureza);
  end if;
  if new.natureza is null and new.tipo is null then
    raise exception 'Informe a natureza da conta (ativo, passivo, receita, custo, despesa...).'
      using errcode = 'check_violation';
  end if;

  -- Conta que ja recebeu lancamento nao vira sintetica.
  if tg_op = 'UPDATE' and old.analitica and not new.analitica
     and exists (select 1 from lancamentos_financeiros l where l.categoria_dre_id = new.id) then
    raise exception 'A conta % ja tem lancamentos e nao pode virar sintetica.', new.codigo_estruturado
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_categoria_dre_plano on categorias_dre;
create trigger trg_categoria_dre_plano
  before insert or update on categorias_dre
  for each row execute function fn_categoria_dre_plano();

-- Apagar conta com movimento ou com filhas e recusado: a FK e `on delete set
-- null`, entao apagar desclassificaria os lancamentos em silencio.
create or replace function fn_categoria_dre_bloqueia_exclusao()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_qtd int;
begin
  select count(*) into v_qtd from lancamentos_financeiros where categoria_dre_id = old.id;
  if v_qtd > 0 then
    raise exception 'A conta % tem % lancamento(s). Inative-a em vez de excluir.',
      old.codigo_estruturado, v_qtd using errcode = 'foreign_key_violation';
  end if;
  if exists (select 1 from movimentacoes_caixa where categoria_dre_id = old.id)
     or exists (select 1 from servicos_assistencia where categoria_dre_id = old.id)
     or exists (select 1 from tipos_boleto_avulso where categoria_dre_id = old.id) then
    raise exception 'A conta % esta em uso (movimentacoes, servicos da 24h ou boletos avulsos). Inative-a em vez de excluir.',
      old.codigo_estruturado using errcode = 'foreign_key_violation';
  end if;
  if not old.analitica and exists (
       select 1 from categorias_dre c
        where c.id <> old.id and c.codigo_estruturado like old.codigo_estruturado || '.%') then
    raise exception 'A conta sintetica % tem contas abaixo dela. Exclua ou recodifique as filhas antes.',
      old.codigo_estruturado using errcode = 'foreign_key_violation';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_categoria_dre_bloqueia_exclusao on categorias_dre;
create trigger trg_categoria_dre_bloqueia_exclusao
  before delete on categorias_dre
  for each row execute function fn_categoria_dre_bloqueia_exclusao();

-- Lancamento so em conta ANALITICA e que nao seja alimentada pelo sistema.
create or replace function fn_lancamento_conta_analitica()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  c record;
begin
  if new.categoria_dre_id is null then
    return new;
  end if;
  select codigo_estruturado, nome, analitica, automatica into c
    from categorias_dre where id = new.categoria_dre_id;
  if found and not c.analitica then
    raise exception 'A conta % % e sintetica (so agrupa). Escolha uma conta analitica abaixo dela.',
      c.codigo_estruturado, c.nome using errcode = 'check_violation';
  end if;
  if found and c.automatica then
    raise exception 'A conta % % e alimentada pelo sistema e nao recebe lancamento direto.',
      c.codigo_estruturado, c.nome using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lancamento_conta_analitica on lancamentos_financeiros;
create trigger trg_lancamento_conta_analitica
  before insert or update of categoria_dre_id on lancamentos_financeiros
  for each row execute function fn_lancamento_conta_analitica();

drop trigger if exists trg_movimentacao_conta_analitica on movimentacoes_caixa;
create trigger trg_movimentacao_conta_analitica
  before insert or update of categoria_dre_id on movimentacoes_caixa
  for each row execute function fn_lancamento_conta_analitica();

-- -----------------------------------------------------------------------------
-- C) A migracao: recodifica as contas antigas e completa o plano padrao
-- -----------------------------------------------------------------------------
create table if not exists plano_contas_migracao (
  id               bigserial primary key,
  categoria_id     uuid references categorias_dre(id) on delete set null,
  codigo_antigo    text,
  nome_antigo      text,
  codigo_novo      text,
  nome_novo        text,
  acao             text not null,   -- RECODIFICADA | CRIADA | JA_EXISTIA | SEM_CORRESPONDENCIA
  lancamentos      int not null default 0,
  created_at       timestamptz not null default now()
);
alter table plano_contas_migracao enable row level security;
drop policy if exists plano_migracao_select on plano_contas_migracao;
create policy plano_migracao_select on plano_contas_migracao
  for select to authenticated using ((select tem_acesso_global()));

do $$
declare
  r record;
  v_id uuid;
  v_codigo text;
  v_nome text;
begin
  for r in
    select * from (values
      -- codigo,      descricao,                                                        analitica, automatica, destino,                                  antigo
      (1,  '1',        'ATIVO',                                                          false, false, 'Balanço Patrimonial',                     null),
      (2,  '1.1',      'ATIVO CIRCULANTE',                                               false, false, 'Balanço Patrimonial',                     null),
      (3,  '1.1.1',    'Disponibilidades',                                               false, false, 'Balanço Patrimonial / Fluxo de Caixa',    null),
      (4,  '1.1.1.01', 'Caixas / Caixinha Interno',                                      true,  true,  'Saldos Iniciais / Caixa',                 null),
      (5,  '1.1.1.02', 'Banco Conta Corrente - Banco A',                                 true,  true,  'Saldos Iniciais / Banco',                 null),
      (6,  '1.1.1.03', 'Aplicações Financeiras de Liquidez Imediata',                    true,  true,  'Saldos Iniciais / Investimentos',         null),
      (7,  '1.1.2',    'Contas a Receber',                                               false, false, 'Balanço Patrimonial',                     null),
      (8,  '1.1.2.01', 'Clientes / Mensalidades a Receber',                              true,  true,  'Operacional',                             null),
      (9,  '1.1.2.02', 'Recebíveis de Cartão de Crédito/Débito',                         true,  true,  'Operacional',                             null),
      (10, '1.1.3',    'Estoques / Mercadorias',                                         false, false, 'Balanço Patrimonial',                     null),
      (11, '1.1.3.01', 'Estoque de Produtos para Revenda',                               true,  false, 'Operacional',                             null),
      (12, '1.1.3.02', 'Estoque de Materiais de Consumo/Insumos',                        true,  false, 'Operacional',                             null),
      (13, '1.2',      'ATIVO NÃO CIRCULANTE',                                           false, false, 'Balanço Patrimonial',                     null),
      (14, '1.2.1',    'Imobilizado',                                                    false, false, 'Balanço Patrimonial',                     null),
      (15, '1.2.1.01', 'Equipamentos de TI e Informática',                               true,  false, 'Imobilizado',                             null),
      (16, '1.2.1.02', 'Móveis e Utensílios',                                            true,  false, 'Imobilizado',                             null),
      (17, '2',        'PASSIVO E PATRIMÔNIO LÍQUIDO',                                   false, false, 'Balanço Patrimonial',                     null),
      (18, '2.1',      'PASSIVO CIRCULANTE',                                             false, false, 'Balanço Patrimonial',                     null),
      (19, '2.1.1',    'Obrigações Comerciais',                                          false, false, 'Balanço Patrimonial',                     null),
      (20, '2.1.1.01', 'Fornecedores a Pagar',                                           true,  true,  'Passivo Operacional',                     null),
      (21, '2.1.2',    'Obrigações Trabalhistas e Sociais',                              false, false, 'Balanço Patrimonial',                     null),
      (22, '2.1.2.01', 'Salários e Ordenados a Pagar',                                   true,  false, 'Passivo Trabalhista',                     null),
      (23, '2.1.2.02', 'FGTS e INSS a Recolher',                                         true,  false, 'Passivo Trabalhista',                     null),
      (24, '2.1.3',    'Obrigações Fiscais e Tributárias',                               false, false, 'Balanço Patrimonial',                     null),
      (25, '2.1.3.01', 'Simples Nacional / Impostos a Pagar',                            true,  false, 'Passivo Tributário',                      null),
      (26, '2.2',      'PATRIMÔNIO LÍQUIDO',                                             false, false, 'Balanço Patrimonial',                     null),
      (27, '2.2.1.01', 'Capital Social Realizado',                                       true,  false, 'Patrimônio Líquido',                      null),
      (28, '2.2.2.01', 'Lucros / Prejuízos Acumulados',                                  true,  true,  'Patrimônio Líquido',                      null),
      (29, '3',        'RECEITAS',                                                       false, false, 'DRE - Receita Bruta',                     null),
      (30, '3.1',      'RECEITA OPERACIONAL BRUTA',                                      false, false, 'DRE - Receita Bruta',                     null),
      (31, '3.1.1',    'Receita com Serviços / Mensalidades',                            false, false, 'DRE - Receita de Serviços',               null),
      (32, '3.1.1.01', 'Recebimentos Mensalidade',                                       true,  false, 'Fluxo de Caixa / Entradas',               '1.1.00'),
      (33, '3.1.1.02', 'Receita por Serviços Avulsos / Projetos',                        true,  false, 'Fluxo de Caixa / Entradas',               '1.2.01'),
      (34, '3.1.1.03', 'Receita de Adesão',                                              true,  false, 'Fluxo de Caixa / Entradas',               '1.1.01'),
      (35, '3.1.1.04', 'Receita de Vistorias',                                           true,  false, 'Fluxo de Caixa / Entradas',               '1.2.03'),
      (36, '3.1.1.05', 'Receita de Serviços de Rastreamento',                            true,  false, 'Fluxo de Caixa / Entradas',               '1.2.04'),
      (37, '3.1.1.06', 'Comissão de Franquia (Repasse da Matriz)',                       true,  false, 'Fluxo de Caixa / Entradas',               '1.3.01'),
      (38, '3.1.1.07', 'Adiantamento de Clientes 24h',                                   true,  false, 'Fluxo de Caixa / Entradas',               '1.4.00'),
      (39, '3.1.1.98', 'Recebimentos Não Identificados',                                 true,  false, 'Fluxo de Caixa / Entradas',               '1.9.98'),
      (40, '3.1.1.99', 'Receitas Não Classificadas',                                     true,  false, 'Fluxo de Caixa / Entradas',               '1.9.99'),
      (41, '3.1.2',    'Receita com Vendas de Produtos',                                 false, false, 'DRE - Receita de Vendas',                 null),
      (42, '3.1.2.01', 'Venda de Mercadorias / Produtos',                                true,  false, 'Fluxo de Caixa / Entradas',               '1.2.05'),
      (43, '3.2',      'DEDUÇÕES DA RECEITA BRUTA',                                      false, false, 'DRE - Deduções',                          null),
      (44, '3.2.1.01', 'Impostos sobre Vendas (DAS / Simples Nacional)',                 true,  false, 'Fluxo de Caixa / Saídas Fiscais',         null),
      (45, '3.2.1.02', 'Descontos Concedidos / Cancelamentos',                           true,  false, 'DRE - Deduções',                          null),
      (46, '4',        'CUSTOS E DESPESAS',                                              false, false, 'DRE - Custos e Despesas',                 null),
      (47, '4.1',      'CUSTOS OPERACIONAIS / DIRETOS (CPV/CSV)',                        false, false, 'DRE - Custos Operacionais',               null),
      (48, '4.1.1.01', 'Custo de Mercadorias/Produtos Vendidos',                         true,  false, 'Fluxo de Caixa / Saídas Operacionais',    null),
      (49, '4.1.2.01', 'Comissões Diretas sobre Vendas',                                 true,  false, 'Fluxo de Caixa / Saídas Operacionais',    '3.2.01'),
      (50, '4.1.3.01', 'Taxas de Adquirente / Cartão de Crédito',                        true,  false, 'Fluxo de Caixa / Saídas Operacionais',    '3.2.02'),
      (51, '4.1.4',    'Custos com Eventos e Assistência 24h',                           false, false, 'DRE - Custos Operacionais',               null),
      (52, '4.1.4.01', 'Custo com Assistência 24 Horas',                                 true,  false, 'Fluxo de Caixa / Saídas Operacionais',    '3.1.02'),
      (53, '4.1.4.02', 'Reparos de Eventos (Peças e Mão de Obra)',                       true,  false, 'Fluxo de Caixa / Saídas Operacionais',    '3.1.04'),
      (54, '4.1.4.03', 'Indenizações a Terceiros',                                       true,  false, 'Fluxo de Caixa / Saídas Operacionais',    '3.1.05'),
      (55, '4.1.4.04', 'Custo com Eventos (Notas Fiscais)',                              true,  false, 'DRE - Custos Operacionais',               '3.1.00'),
      (56, '4.1.4.05', 'Custo de Vistoria e Rastreamento',                               true,  false, 'Fluxo de Caixa / Saídas Operacionais',    '3.1.03'),
      (57, '4.2',      'DESPESAS OPERACIONAIS',                                          false, false, 'DRE - Despesas Operacionais',             null),
      (58, '4.2.1',    'Despesas Administrativas e Ocupação',                            false, false, 'DRE - Despesas Adm',                      null),
      (59, '4.2.1.01', 'Aluguel e Condomínio',                                           true,  false, 'Fluxo de Caixa / Saídas Adm',             '4.1.02'),
      (60, '4.2.1.02', 'Energia Elétrica, Água e Internet',                              true,  false, 'Fluxo de Caixa / Saídas Adm',             null),
      (61, '4.2.1.03', 'Serviços Contábeis e Jurídicos',                                 true,  false, 'Fluxo de Caixa / Saídas Adm',             '4.1.05'),
      (62, '4.2.1.04', 'Softwares, Licenças e Ferramentas SaaS',                         true,  false, 'Fluxo de Caixa / Saídas Adm',             '4.1.03'),
      (63, '4.2.1.05', 'Material de Escritório e Limpeza',                               true,  false, 'Fluxo de Caixa / Saídas Adm',             null),
      (64, '4.2.1.06', 'Outras Despesas Administrativas',                                true,  false, 'Fluxo de Caixa / Saídas Adm',             '4.2.02'),
      (65, '4.2.1.07', 'Impostos e Taxas Diversas',                                      true,  false, 'Fluxo de Caixa / Saídas Adm',             '4.3.01'),
      (66, '4.2.1.99', 'Despesas Não Classificadas',                                     true,  false, 'Fluxo de Caixa / Saídas Adm',             '4.9.99'),
      (67, '4.2.2',    'Despesas com Pessoal',                                           false, false, 'DRE - Despesas Pessoal',                  null),
      (68, '4.2.2.01', 'Pró-Labore dos Sócios',                                          true,  false, 'Fluxo de Caixa / Saídas Pessoal',         null),
      (69, '4.2.2.02', 'Salários da Equipe',                                             true,  false, 'Fluxo de Caixa / Saídas Pessoal',         '4.1.01'),
      (70, '4.2.2.03', 'Benefícios (Vale-Refeição, Vale-Transporte, Plano de Saúde)',    true,  false, 'Fluxo de Caixa / Saídas Pessoal',         '4.1.04'),
      (71, '4.2.3',    'Despesas de Vendas e Marketing',                                 false, false, 'DRE - Despesas Marketing',                null),
      (72, '4.2.3.01', 'Anúncios e Tráfego Pago (Google/Meta Ads)',                      true,  false, 'Fluxo de Caixa / Saídas Marketing',       null),
      (73, '4.2.3.02', 'Marketing e Eventos',                                            true,  false, 'Fluxo de Caixa / Saídas Marketing',       '4.2.01'),
      (74, '4.3',      'RESULTADO FINANCEIRO LÍQUIDO',                                   false, false, 'DRE - Resultado Financeiro',              null),
      (75, '4.3.1.01', 'Receitas Financeiras (Rendimentos de Aplicações, Juros Recebidos)', true, false, 'Fluxo de Caixa / Entradas Fin',        '1.2.02'),
      (76, '4.3.2.01', 'Despesas Financeiras (Tarifas Bancárias, Juros sobre Empréstimos)', true, false, 'Fluxo de Caixa / Saídas Fin',         '3.2.03')
    ) as t(ordem, codigo, nome, analitica, automatica, destino, antigo)
    order by ordem
  loop
    v_id := null;

    -- 1) ja existe pelo CODIGO: usa a existente (mantem a descricao dela)
    select id into v_id from categorias_dre where codigo_estruturado = r.codigo;
    if v_id is not null then
      update categorias_dre
         set analitica = r.analitica, automatica = r.automatica, destino = r.destino,
             natureza = natureza_por_codigo(r.codigo)
       where id = v_id;
      insert into plano_contas_migracao (categoria_id, codigo_novo, nome_novo, acao)
      select v_id, r.codigo, nome, 'JA_EXISTIA' from categorias_dre where id = v_id
         and not exists (select 1 from plano_contas_migracao m where m.categoria_id = v_id);
      continue;
    end if;

    -- 2) a conta ANTIGA correspondente: recodifica no lugar
    if r.antigo is not null then
      select id, codigo_estruturado, nome into v_id, v_codigo, v_nome
        from categorias_dre where codigo_estruturado = r.antigo;
    end if;

    -- 3) ou a mesma DESCRICAO exata, com outro codigo
    if v_id is null then
      select id, codigo_estruturado, nome into v_id, v_codigo, v_nome
        from categorias_dre
       where nome_conta_normalizado(nome) = nome_conta_normalizado(r.nome)
       limit 1;
    end if;

    if v_id is not null then
      update categorias_dre
         set codigo_estruturado = r.codigo, nome = r.nome, codigo_anterior = v_codigo,
             analitica = r.analitica, automatica = r.automatica, destino = r.destino,
             natureza = natureza_por_codigo(r.codigo), ativo = true
       where id = v_id;
      insert into plano_contas_migracao
        (categoria_id, codigo_antigo, nome_antigo, codigo_novo, nome_novo, acao, lancamentos)
      values (v_id, v_codigo, v_nome, r.codigo, r.nome, 'RECODIFICADA',
              (select count(*) from lancamentos_financeiros where categoria_dre_id = v_id));
    else
      insert into categorias_dre (codigo_estruturado, nome, analitica, automatica, destino, natureza, ativo)
      values (r.codigo, r.nome, r.analitica, r.automatica, r.destino, natureza_por_codigo(r.codigo), true)
      returning id into v_id;
      insert into plano_contas_migracao (categoria_id, codigo_novo, nome_novo, acao)
      values (v_id, r.codigo, r.nome, 'CRIADA');
    end if;
  end loop;

  -- O que sobrou fora do plano: fica com o codigo antigo e a natureza do `tipo`,
  -- listado para o financeiro recodificar.
  for r in
    select c.* from categorias_dre c
     where c.natureza is null
        or (c.codigo_estruturado ~ '^[1-4]\.[0-9]\.[0-9]{2}$' and c.codigo_anterior is null)
  loop
    update categorias_dre
       set natureza = coalesce(r.natureza, case r.tipo when 'RECEITA' then 'RECEITA'
                                                      when 'CUSTO_VARIAVEL' then 'CUSTO'
                                                      else 'DESPESA' end)
     where id = r.id;
    insert into plano_contas_migracao (categoria_id, codigo_antigo, nome_antigo, acao, lancamentos)
    select r.id, r.codigo_estruturado, r.nome, 'SEM_CORRESPONDENCIA',
           (select count(*) from lancamentos_financeiros where categoria_dre_id = r.id)
     where not exists (select 1 from plano_contas_migracao m
                        where m.categoria_id = r.id and m.acao = 'SEM_CORRESPONDENCIA');
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- D) A conta bancaria ganha a CLASSE do fluxo de caixa e do balancete
-- -----------------------------------------------------------------------------
alter table contas_bancarias
  add column if not exists classe_fluxo text not null default 'CONTA_CORRENTE';
alter table contas_bancarias drop constraint if exists chk_conta_classe_fluxo;
alter table contas_bancarias add constraint chk_conta_classe_fluxo
  check (classe_fluxo in ('CONTA_CORRENTE', 'INVESTIMENTO', 'DINHEIRO', 'OUTROS'));
comment on column contas_bancarias.classe_fluxo is
  'Linha do fluxo de caixa evolutivo e conta do balancete: CONTA_CORRENTE (1.1.1.02), INVESTIMENTO (1.1.1.03), DINHEIRO (1.1.1.01), OUTROS (1.1.1.02).';

update contas_bancarias
   set classe_fluxo = case
         when lower(coalesce(tipo, '')) = 'caixa' then 'DINHEIRO'
         when lower(coalesce(tipo, '')) = 'poupanca'
           or texto_sem_acento(coalesce(nome, '') || ' ' || coalesce(banco, '')) like '%invest%'
           or texto_sem_acento(coalesce(nome, '') || ' ' || coalesce(banco, '')) like '%aplicac%'
           then 'INVESTIMENTO'
         else 'CONTA_CORRENTE' end
 where classe_fluxo = 'CONTA_CORRENTE';

create or replace function conta_contabil_da_classe(p_classe text)
returns text language sql immutable parallel safe set search_path = public
as $$
  select case p_classe when 'DINHEIRO' then '1.1.1.01'
                       when 'INVESTIMENTO' then '1.1.1.03'
                       else '1.1.1.02' end;
$$;

-- -----------------------------------------------------------------------------
-- E) O DRE com os codigos novos, e sem as contas de balanco
-- -----------------------------------------------------------------------------
create or replace function dre_movimentos(
  p_data_inicio date,
  p_data_fim    date,
  p_regional_id uuid  default null,
  p_regime      text  default 'CAIXA'
)
returns table (
  data             date,
  grupo            tipo_categoria_dre,
  categoria_codigo text,
  categoria_nome   text,
  centro_custo_id  uuid,
  valor            numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with regime as (select upper(coalesce(p_regime, 'CAIXA')) as r)

  -- 1) Contas a pagar / a receber. Conta de BALANCO (compra de imobilizado,
  --    aporte de capital...) nao e resultado: fica fora do DRE (0152).
  select b.data_pagamento,
         coalesce(cat.tipo, (case when l.tipo = 'RECEITA' then 'RECEITA' else 'DESPESA_FIXA' end)::tipo_categoria_dre),
         coalesce(cat.codigo_estruturado, case when l.tipo = 'RECEITA' then '3.1.1.99' else '4.2.1.99' end),
         coalesce(cat.nome, case when l.tipo = 'RECEITA' then 'Receitas Não Classificadas' else 'Despesas Não Classificadas' end),
         l.centro_custo_id,
         case when l.tipo = 'RECEITA' then b.valor_liquido else -b.valor_liquido end
    from baixas_financeiras b
    join lancamentos_financeiros l on l.id = b.lancamento_id
    left join categorias_dre cat on cat.id = l.categoria_dre_id
   cross join regime
   where regime.r = 'CAIXA'
     and b.data_pagamento between p_data_inicio and p_data_fim
     and l.status <> 'cancelado'
     and coalesce(cat.natureza, '') not in ('ATIVO', 'PASSIVO', 'PATRIMONIO_LIQUIDO')
     and ((select escopo_regional(p_regional_id)) is null
            or l.regional_id = (select escopo_regional(p_regional_id)))

  union all

  select l.competencia,
         coalesce(cat.tipo, (case when l.tipo = 'RECEITA' then 'RECEITA' else 'DESPESA_FIXA' end)::tipo_categoria_dre),
         coalesce(cat.codigo_estruturado, case when l.tipo = 'RECEITA' then '3.1.1.99' else '4.2.1.99' end),
         coalesce(cat.nome, case when l.tipo = 'RECEITA' then 'Receitas Não Classificadas' else 'Despesas Não Classificadas' end),
         l.centro_custo_id,
         case when l.tipo = 'RECEITA' then l.valor_original else -l.valor_original end
    from lancamentos_financeiros l
    left join categorias_dre cat on cat.id = l.categoria_dre_id
   cross join regime
   where regime.r = 'COMPETENCIA'
     and l.competencia between p_data_inicio and p_data_fim
     and l.status <> 'cancelado'
     and coalesce(cat.natureza, '') not in ('ATIVO', 'PASSIVO', 'PATRIMONIO_LIQUIDO')
     and ((select escopo_regional(p_regional_id)) is null
            or l.regional_id = (select escopo_regional(p_regional_id)))

  union all

  -- 2) Movimentacoes de caixa avulsas (nao vinculadas a um titulo do modulo).
  select case when (select r from regime) = 'CAIXA'
              then coalesce(m.data_caixa, m.data_competencia) else m.data_competencia end,
         cat.tipo, cat.codigo_estruturado, cat.nome, null::uuid,
         case when m.tipo = 'RECEITA' then m.valor else -m.valor end
    from movimentacoes_caixa m
    join categorias_dre cat on cat.id = m.categoria_dre_id
   where m.status <> 'cancelado'
     and m.lancamento_id is null
     and coalesce(cat.natureza, '') not in ('ATIVO', 'PASSIVO', 'PATRIMONIO_LIQUIDO')
     and (case when (select r from regime) = 'CAIXA'
               then coalesce(m.data_caixa, m.data_competencia) else m.data_competencia end)
         between p_data_inicio and p_data_fim
     and ((select escopo_regional(p_regional_id)) is null
            or m.regional_id = (select escopo_regional(p_regional_id)))

  union all

  -- 3) Mensalidades, adesao (0145) e boleto avulso (0150) do SCar.
  select case when (select r from regime) = 'CAIXA' then t.data_pagamento else t.data_vencimento end,
         coalesce(ca.tipo, 'RECEITA'::tipo_categoria_dre),
         case when t.adesao_lead_id is not null then '3.1.1.03'
              when t.tipo_avulso_id is not null then coalesce(ca.codigo_estruturado, '3.1.1.02')
              else '3.1.1.01' end,
         case when t.adesao_lead_id is not null then 'Receita de Adesão'
              when t.tipo_avulso_id is not null then coalesce(ca.nome, 'Receita por Serviços Avulsos / Projetos')
              else 'Recebimentos Mensalidade' end,
         null::uuid,
         case when (select r from regime) = 'CAIXA' then coalesce(t.valor_pago, 0) else t.valor end
    from titulos_financeiros t
    left join veiculos v on v.id = t.veiculo_id
    left join faturas fa on fa.titulo_id = t.id
    left join clientes cl on cl.id = t.cliente_id
    left join tipos_boleto_avulso ta on ta.id = t.tipo_avulso_id
    left join categorias_dre ca on ca.id = ta.categoria_dre_id
   where t.status <> 'cancelado'
     and (t.veiculo_id is not null or fa.id is not null or t.tipo_avulso_id is not null)
     and not exists (select 1 from movimentacoes_caixa mc where mc.titulo_id = t.id)
     and (case when (select r from regime) = 'CAIXA' then t.data_pagamento else t.data_vencimento end)
         between p_data_inicio and p_data_fim
     and (case when (select r from regime) = 'CAIXA' then t.status = 'pago' else true end)
     and ((select escopo_regional(p_regional_id)) is null
            or coalesce(v.regional_id, fa.regional_id, cl.regional_id) = (select escopo_regional(p_regional_id)))

  union all

  -- 4) Custo de evento: notas fiscais (competencia = emissao).
  select nf.data_emissao, 'CUSTO_VARIAVEL'::tipo_categoria_dre,
         '4.1.4.04', 'Custo com Eventos (Notas Fiscais)', null::uuid, -nf.valor_nota
    from notas_fiscais_evento nf
    join eventos_sinistro e on e.id = nf.evento_id
   where (select r from regime) = 'COMPETENCIA'
     and nf.data_emissao between p_data_inicio and p_data_fim
     and ((select escopo_regional(p_regional_id)) is null
            or e.regional_id = (select escopo_regional(p_regional_id)));
$$;

-- -----------------------------------------------------------------------------
-- F) As funcoes que procuram conta por CODIGO passam a usar os codigos novos.
-- A troca e feita sobre a definicao EM VIGOR de cada uma (pg_get_functiondef),
-- trocando so o literal entre aspas: assim nada do corpo atual se perde.
-- -----------------------------------------------------------------------------
do $$
declare
  f record;
  v_def text;
  v_novo text;
  m record;
begin
  for f in
    select p.oid
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('autorizar_entrada_lead', 'gerar_dre', 'regionais_painel_comparativo',
                         'regionais_painel_resumo', 'regionais_painel_serie',
                         'regional_categoria_movimento', 'registrar_liquidacao_banco',
                         'repassar_comissao_vendedor', 'tesouraria_movimentos')
  loop
    v_def := pg_get_functiondef(f.oid);
    v_novo := v_def;
    for m in
      select * from (values
        ('1.1.00', '3.1.1.01'), ('1.1.01', '3.1.1.03'), ('1.2.01', '3.1.1.02'),
        ('1.3.01', '3.1.1.06'), ('1.9.98', '3.1.1.98'), ('1.9.99', '3.1.1.99'),
        ('1.9.00', '3.1.1.99'), ('3.1.00', '4.1.4.04'), ('3.2.01', '4.1.2.01'),
        ('4.9.99', '4.2.1.99'), ('4.9.00', '4.2.1.99')
      ) as t(antigo, novo)
    loop
      v_novo := replace(v_novo, '''' || m.antigo || '''', '''' || m.novo || '''');
    end loop;
    if v_novo <> v_def then
      execute v_novo;
    end if;
  end loop;
end;
$$;

-- O recorte do painel das regionais guardado com codigos antigos e traduzido.
update empresa e
   set painel_conta_de  = coalesce((select m.codigo_novo from plano_contas_migracao m
                                     where m.codigo_antigo = e.painel_conta_de limit 1), e.painel_conta_de),
       painel_conta_ate = coalesce((select m.codigo_novo from plano_contas_migracao m
                                     where m.codigo_antigo = e.painel_conta_ate limit 1), e.painel_conta_ate)
 where e.painel_conta_de is not null or e.painel_conta_ate is not null;

-- -----------------------------------------------------------------------------
-- G) BALANCETE DE VERIFICACAO
-- -----------------------------------------------------------------------------
-- Partidas derivadas, todas com debito = credito:
--   lancamento a receber: D contas a receber (cartao -> 1.1.2.02) / C conta do titulo
--   lancamento a pagar:   D conta do titulo / C 2.1.1.01 fornecedores a pagar
--   baixa (recebimento):  D disponibilidade (pelo valor liquido) / C contas a receber
--                         (pela amortizacao); a diferenca vai para receitas
--                         financeiras (juros) ou descontos concedidos
--   baixa (pagamento):    D fornecedores a pagar / C disponibilidade; diferenca em
--                         despesas financeiras (juros) ou receitas financeiras (desconto obtido)
--   titulo do SCar:       D 1.1.2.01 / C mensalidade (adesao, avulso); pago: D disponibilidade / C 1.1.2.01
--   avulsa de caixa:      contra 1.1.1.01 Caixa
--   transferencia:        D conta destino / C conta origem
--   saldo inicial:        D disponibilidade / C 2.2.2.01 lucros acumulados
--   movimento anterior ao saldo inicial da conta: o lado do dinheiro vai para
--   2.2.2.01 (o saldo inicial ja o contem) — assim a disponibilidade bate com a tesouraria.
create or replace function balancete_partidas(p_ate date)
returns table (data date, conta text, debito numeric, credito numeric, origem text, ref_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with lanc as (
    select l.*, cat.codigo_estruturado as cod
      from lancamentos_financeiros l
      left join categorias_dre cat on cat.id = l.categoria_dre_id
     where l.status <> 'cancelado'
  ),
  conta_bx as (
    select b.*, l.tipo as ltipo,
           case when l.forma_pagamento_prevista::text = 'CARTAO' then '1.1.2.02' else '1.1.2.01' end as receber,
           case when cb.id is null then '1.1.1.02'
                when cb.saldo_inicial_em is not null and b.data_pagamento <= cb.saldo_inicial_em then '2.2.2.01'
                else conta_contabil_da_classe(cb.classe_fluxo) end as caixa,
           round(b.valor_pago + b.desconto - b.juros_multa, 2) as amortiza
      from baixas_financeiras b
      join lancamentos_financeiros l on l.id = b.lancamento_id and l.status <> 'cancelado'
      left join contas_bancarias cb on cb.id = b.conta_bancaria_id
     where b.data_pagamento <= p_ate
  ),
  tit as (
    select t.*, cb.saldo_inicial_em, cb.classe_fluxo, cb.id as conta_id,
           case when t.adesao_lead_id is not null then '3.1.1.03'
                when t.tipo_avulso_id is not null then coalesce(ca.codigo_estruturado, '3.1.1.02')
                else '3.1.1.01' end as cod
      from titulos_financeiros t
      left join faturas fa on fa.titulo_id = t.id
      left join tipos_boleto_avulso ta on ta.id = t.tipo_avulso_id
      left join categorias_dre ca on ca.id = ta.categoria_dre_id
      left join integracoes_bancarias i on i.id = t.integracao_id
      left join contas_bancarias cb on cb.id = i.conta_bancaria_id
     where (t.veiculo_id is not null or fa.id is not null or t.tipo_avulso_id is not null)
       and not exists (select 1 from movimentacoes_caixa mc where mc.titulo_id = t.id)
  ),
  p as (
    -- lancamento: o fato (competencia; na falta, emissao)
    select coalesce(l.competencia, l.data_emissao) as data,
           case when l.tipo = 'RECEITA'
                then case when l.forma_pagamento_prevista::text = 'CARTAO' then '1.1.2.02' else '1.1.2.01' end
                else coalesce(l.cod, '4.2.1.99') end as deb,
           case when l.tipo = 'RECEITA' then coalesce(l.cod, '3.1.1.99') else '2.1.1.01' end as cred,
           l.valor_original as valor, 'LANCAMENTO'::text as origem, l.id as ref_id
      from lanc l
     where coalesce(l.competencia, l.data_emissao) <= p_ate

    union all
    -- baixa: o dinheiro contra o receber/pagar, ate o menor dos dois valores
    select b.data_pagamento,
           case when b.ltipo = 'RECEITA' then b.caixa else '2.1.1.01' end,
           case when b.ltipo = 'RECEITA' then b.receber else b.caixa end,
           least(b.valor_liquido, b.amortiza), 'BAIXA', b.id
      from conta_bx b
    union all
    -- dinheiro MAIOR que a amortizacao: juros recebidos (receita) ou pagos (despesa)
    select b.data_pagamento,
           case when b.ltipo = 'RECEITA' then b.caixa else '4.3.2.01' end,
           case when b.ltipo = 'RECEITA' then '4.3.1.01' else b.caixa end,
           b.valor_liquido - b.amortiza, 'ENCARGO', b.id
      from conta_bx b
     where b.valor_liquido > b.amortiza
    union all
    -- amortizacao MAIOR que o dinheiro: desconto concedido (receita) ou obtido (despesa)
    select b.data_pagamento,
           case when b.ltipo = 'RECEITA' then '3.2.1.02' else '2.1.1.01' end,
           case when b.ltipo = 'RECEITA' then b.receber else '4.3.1.01' end,
           b.amortiza - b.valor_liquido, 'ENCARGO', b.id
      from conta_bx b
     where b.amortiza > b.valor_liquido

    union all
    -- titulo do SCar: o fato
    select t.data_vencimento, '1.1.2.01', t.cod, t.valor, 'TITULO', t.id
      from tit t
     where t.status::text <> 'cancelado' and t.data_vencimento <= p_ate
    union all
    -- titulo cancelado mas pago (raro): o fato pelo valor pago
    select t.data_vencimento, '1.1.2.01', t.cod, coalesce(t.valor_pago, 0), 'TITULO', t.id
      from tit t
     where t.status::text = 'cancelado' and t.data_pagamento is not null and t.data_vencimento <= p_ate
    union all
    -- titulo do SCar pago: o dinheiro
    select coalesce(t.data_credito, t.data_pagamento),
           case when t.conta_id is null then '1.1.1.02'
                when t.saldo_inicial_em is not null
                     and coalesce(t.data_credito, t.data_pagamento) <= t.saldo_inicial_em then '2.2.2.01'
                else conta_contabil_da_classe(t.classe_fluxo) end,
           '1.1.2.01', coalesce(t.valor_pago, t.valor), 'TITULO_PAGO', t.id
      from tit t
     where t.status::text = 'pago' and t.data_pagamento is not null
       and coalesce(t.data_credito, t.data_pagamento) <= p_ate
    union all
    -- pago diferente do valor: juros recebidos ou desconto concedido
    select t.data_vencimento,
           case when coalesce(t.valor_pago, t.valor) > t.valor then '1.1.2.01' else '3.2.1.02' end,
           case when coalesce(t.valor_pago, t.valor) > t.valor then '4.3.1.01' else '1.1.2.01' end,
           abs(coalesce(t.valor_pago, t.valor) - t.valor), 'ENCARGO', t.id
      from tit t
     where t.status::text = 'pago' and coalesce(t.valor_pago, t.valor) <> t.valor
       and t.data_vencimento <= p_ate

    union all
    -- avulsa de caixa (sem titulo): contra o Caixa
    select coalesce(m.data_caixa, m.data_competencia),
           case when m.tipo = 'RECEITA' then '1.1.1.01' else coalesce(cat.codigo_estruturado, '4.2.1.99') end,
           case when m.tipo = 'RECEITA' then coalesce(cat.codigo_estruturado, '3.1.1.99') else '1.1.1.01' end,
           m.valor, 'AVULSA', m.id
      from movimentacoes_caixa m
      left join categorias_dre cat on cat.id = m.categoria_dre_id
     where m.status <> 'cancelado' and m.lancamento_id is null and m.titulo_id is null
       and coalesce(m.data_caixa, m.data_competencia) <= p_ate

    union all
    -- transferencia entre contas
    select tr.data,
           case when cd.saldo_inicial_em is not null and tr.data <= cd.saldo_inicial_em then '2.2.2.01'
                else conta_contabil_da_classe(cd.classe_fluxo) end,
           case when co.saldo_inicial_em is not null and tr.data <= co.saldo_inicial_em then '2.2.2.01'
                else conta_contabil_da_classe(co.classe_fluxo) end,
           tr.valor, 'TRANSFERENCIA', tr.id
      from transferencias_bancarias tr
      join contas_bancarias co on co.id = tr.conta_origem_id
      join contas_bancarias cd on cd.id = tr.conta_destino_id
     where tr.status = 'ATIVA' and tr.data <= p_ate

    union all
    -- saldo inicial da conta (implantacao)
    select coalesce(cb.saldo_inicial_em, date '1900-01-01'),
           case when cb.saldo_inicial >= 0 then conta_contabil_da_classe(cb.classe_fluxo) else '2.2.2.01' end,
           case when cb.saldo_inicial >= 0 then '2.2.2.01' else conta_contabil_da_classe(cb.classe_fluxo) end,
           abs(cb.saldo_inicial), 'SALDO_INICIAL', cb.id
      from contas_bancarias cb
     where cb.saldo_inicial <> 0 and coalesce(cb.saldo_inicial_em, date '1900-01-01') <= p_ate
  )
  select p.data, x.conta, x.debito, x.credito, p.origem, p.ref_id
    from p
   cross join lateral (values (p.deb, p.valor, 0::numeric), (p.cred, 0::numeric, p.valor)) as x(conta, debito, credito)
   where p.valor <> 0
     and p.deb <> p.cred
     and (((select tem_acesso_global()) and (select pode_ver_dre())) or auth.uid() is null);
$$;

comment on function balancete_partidas(date) is
  'Partidas dobradas DERIVADAS dos lancamentos, baixas, titulos do SCar, avulsas, transferencias e saldos iniciais (0152). Debito = credito em toda partida.';

create or replace function balancete_verificacao(p_inicio date, p_fim date)
returns table (codigo text, saldo_anterior numeric, debitos numeric, creditos numeric, saldo_final numeric)
language sql
stable
security definer
set search_path = public
as $$
  select p.conta,
         round(coalesce(sum(p.debito - p.credito) filter (where p.data < p_inicio), 0), 2),
         round(coalesce(sum(p.debito) filter (where p.data >= p_inicio), 0), 2),
         round(coalesce(sum(p.credito) filter (where p.data >= p_inicio), 0), 2),
         round(coalesce(sum(p.debito - p.credito), 0), 2)
    from balancete_partidas(p_fim) p
   group by p.conta
   order by codigo_conta_ordenavel(p.conta);
$$;

comment on function balancete_verificacao(date, date) is
  'Balancete por conta ANALITICA: saldo anterior, debitos e creditos do periodo e saldo final (devedor positivo). As sinteticas sao somadas na tela pelo prefixo do codigo.';

-- -----------------------------------------------------------------------------
-- H) FLUXO DE CAIXA EVOLUTIVO (colunas diarias, modelo da planilha)
-- -----------------------------------------------------------------------------
create or replace function fluxo_caixa_evolutivo(p_inicio date, p_fim date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with mov as (
    select m.* from tesouraria_movimentos(null, p_fim) m where m.valido
  ),
  contas as (
    select cb.id, cb.nome, cb.classe_fluxo, cb.saldo_inicial, cb.saldo_inicial_em,
           coalesce((select sum(m.valor) from mov m where m.conta_id = cb.id and m.data < p_inicio), 0) as movimento_antes
      from contas_bancarias cb
     where (select tem_acesso_global()) or cb.id = any((select contas_do_operador())::uuid[])
  ),
  por_conta as (
    select m.data as dia, m.conta_id, sum(m.valor) as valor
      from mov m
     where m.data between p_inicio and p_fim
     group by 1, 2
  ),
  por_categoria as (
    select m.data as dia, cat.codigo_estruturado as codigo, cat.nome,
           sum(m.valor) filter (where m.valor > 0) as entrada,
           -sum(m.valor) filter (where m.valor < 0) as saida
      from mov m
      left join categorias_dre cat on cat.id = m.categoria_id
     where m.data between p_inicio and p_fim
       and m.origem <> 'TRANSFERENCIA'
     group by 1, 2, 3
  )
  select jsonb_build_object(
    'contas', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', c.id, 'nome', c.nome, 'classe', c.classe_fluxo,
                 'saldo_inicial', c.saldo_inicial, 'saldo_inicial_em', c.saldo_inicial_em,
                 'movimento_antes', c.movimento_antes) order by c.nome) from contas c), '[]'::jsonb),
    'por_conta', coalesce((select jsonb_agg(jsonb_build_object('dia', p.dia, 'conta_id', p.conta_id, 'valor', p.valor))
                             from por_conta p where p.conta_id in (select id from contas)), '[]'::jsonb),
    'por_categoria', coalesce((select jsonb_agg(jsonb_build_object(
                 'dia', p.dia, 'codigo', p.codigo, 'nome', p.nome,
                 'entrada', coalesce(p.entrada, 0), 'saida', coalesce(p.saida, 0)))
                 from por_categoria p), '[]'::jsonb)
  );
$$;

comment on function fluxo_caixa_evolutivo(date, date) is
  'Fluxo de caixa REALIZADO por dia (0152): contas com saldo antes do periodo, movimento por conta/dia e entradas/saidas por conta do plano/dia (transferencias fora). A tela monta as colunas.';

-- -----------------------------------------------------------------------------
-- I) Conferencia: nenhuma funcao nossa procura mais conta pelo codigo antigo
-- -----------------------------------------------------------------------------
do $$
declare
  v_restam text;
begin
  select string_agg(distinct p.proname, ', ') into v_restam
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosrc ~ '''(1\.1\.0[01]|1\.2\.01|1\.3\.01|1\.9\.9[89]|1\.9\.00|3\.1\.00|3\.2\.01|4\.9\.99|4\.9\.00)''';
  if v_restam is not null then
    raise exception 'Funcoes ainda com codigo de conta antigo: %', v_restam;
  end if;
end;
$$;

-- Rito de seguranca (0052)
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
