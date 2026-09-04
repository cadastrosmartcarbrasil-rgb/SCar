-- ============================================================================
-- SCar :: 0051_fornecedores_unificados.sql
--
-- UM CADASTRO SO DE FORNECEDOR — prestador 24h, rastreadora e fornecedor de
-- pecas sao a MESMA coisa: uma empresa que presta servico para a associacao.
--
-- Como estava:
--   . `fornecedores`            — cadastro geral (tela /fornecedores)
--   . `fornecedores` + flag     — prestador 24h (tela /assistencia > Prestadores)
--   . `empresas_rastreamento`   — TABELA PARALELA (tela Configuracoes > Rastreamento)
-- Tres portas de entrada, uma delas dentro de Configuracoes, que so admin e
-- financeiro abrem — justamente quem NAO faz esse cadastro no dia a dia.
--
-- O que esta migration faz:
--   (A) `fornecedores` ganha o tipo RASTREADORA (mesmo padrao do prestador 24h)
--       e os campos que so ela usa: plataforma, custo por equipamento e a
--       fronteira de integracao.
--   (B) `documento` deixa de ser obrigatorio — o cadastro de rastreadora que
--       estamos absorvendo nao exigia CNPJ, e prestador pequeno as vezes entra
--       sem documento. O CHECK continua valendo para o que for preenchido.
--   (C) MIGRA os dados de `empresas_rastreamento` para `fornecedores`,
--       reaponta as FKs de `veiculos` e `rastreadores` e SO ENTAO apaga a
--       tabela paralela.
--   (D) Quem cadastra passa a poder cadastrar: a escrita em `fornecedores`
--       era so de admin/financeiro (+24h). Agora o gestor da unidade tambem
--       cadastra — e ele quem contrata o guincho e a rastreadora da regiao.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (A) O fornecedor ganha o tipo "rastreadora"
-- ----------------------------------------------------------------------------
alter table fornecedores
  add column if not exists empresa_rastreamento     boolean not null default false,
  add column if not exists contato                  text,
  add column if not exists plataforma_url           text,
  add column if not exists custo_mensal_equipamento numeric(10,2) not null default 0,
  add column if not exists api_config               jsonb not null default '{}'::jsonb;

comment on column fornecedores.empresa_rastreamento is
  'Empresa que rastreia veiculos (o "Rastreador por:" da ficha). Mesmo padrao de prestador_assistencia.';
comment on column fornecedores.custo_mensal_equipamento is
  'Quanto se paga a esta rastreadora por equipamento ATIVO no mes.';
comment on column fornecedores.api_config is
  'Fronteira da integracao com a plataforma (fase 3). Credencial nao entra aqui em texto puro.';

create index if not exists idx_fornecedores_rastreamento
  on fornecedores (empresa_rastreamento) where empresa_rastreamento;
create index if not exists idx_fornecedores_prestador
  on fornecedores (prestador_assistencia) where prestador_assistencia;

-- ----------------------------------------------------------------------------
-- (B) Documento deixa de ser obrigatorio (segue validado quando informado)
-- ----------------------------------------------------------------------------
alter table fornecedores alter column documento drop not null;

do $$ begin
  if exists (select 1 from pg_constraint where conname = 'chk_fornecedor_doc') then
    alter table fornecedores drop constraint chk_fornecedor_doc;
  end if;
  alter table fornecedores add constraint chk_fornecedor_doc
    check (documento is null or validar_documento(documento, tipo_pessoa));
end $$;

-- ----------------------------------------------------------------------------
-- (C) Migracao dos dados e das FKs
-- ----------------------------------------------------------------------------
do $$
declare
  er record;
  v_forn uuid;
begin
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'empresas_rastreamento') then
    return;   -- ambiente novo: a tabela paralela nunca existiu
  end if;

  -- mapa temporario de-para (id antigo -> id do fornecedor)
  create temporary table if not exists _map_rastreadora (antigo uuid primary key, novo uuid not null)
    on commit drop;

  for er in execute 'select * from empresas_rastreamento' loop
    v_forn := null;

    -- ja existe um fornecedor com esse CNPJ? entao e a mesma empresa.
    if nullif(regexp_replace(coalesce(er.cnpj, ''), '\D', '', 'g'), '') is not null then
      select f.id into v_forn from fornecedores f
       where f.documento = regexp_replace(er.cnpj, '\D', '', 'g') limit 1;
    end if;

    if v_forn is null then
      insert into fornecedores (
        tipo_pessoa, documento, razao_social, nome_fantasia, email, telefone,
        contato, observacoes, plataforma_url, custo_mensal_equipamento, api_config,
        empresa_rastreamento, ativo
      ) values (
        'PJ',
        nullif(regexp_replace(coalesce(er.cnpj, ''), '\D', '', 'g'), ''),
        coalesce(nullif(btrim(er.razao_social), ''), er.nome),
        er.nome, er.email, er.telefone, er.contato, er.observacoes,
        er.plataforma_url, coalesce(er.custo_mensal_equipamento, 0),
        coalesce(er.api_config, '{}'::jsonb),
        true, coalesce(er.ativo, true)
      ) returning id into v_forn;
    else
      -- fornecedor que ja existia passa a ser tambem rastreadora
      update fornecedores set
        empresa_rastreamento     = true,
        nome_fantasia            = coalesce(nome_fantasia, er.nome),
        contato                  = coalesce(contato, er.contato),
        plataforma_url           = coalesce(plataforma_url, er.plataforma_url),
        custo_mensal_equipamento = greatest(custo_mensal_equipamento, coalesce(er.custo_mensal_equipamento, 0)),
        api_config               = case when api_config = '{}'::jsonb
                                        then coalesce(er.api_config, '{}'::jsonb) else api_config end
      where id = v_forn;
    end if;

    insert into _map_rastreadora (antigo, novo) values (er.id, v_forn)
      on conflict (antigo) do nothing;
  end loop;

  -- ---- veiculos: reaponta os valores e a FK
  alter table veiculos drop constraint if exists veiculos_empresa_rastreamento_id_fkey;
  update veiculos v set empresa_rastreamento_id = m.novo
    from _map_rastreadora m where v.empresa_rastreamento_id = m.antigo;
  alter table veiculos add constraint veiculos_empresa_rastreamento_id_fkey
    foreign key (empresa_rastreamento_id) references fornecedores(id) on delete set null;

  -- ---- rastreadores (0050): idem
  if exists (select 1 from information_schema.tables
              where table_schema = 'public' and table_name = 'rastreadores') then
    alter table rastreadores drop constraint if exists rastreadores_empresa_rastreamento_id_fkey;
    update rastreadores r set empresa_rastreamento_id = m.novo
      from _map_rastreadora m where r.empresa_rastreamento_id = m.antigo;
    alter table rastreadores add constraint rastreadores_empresa_rastreamento_id_fkey
      foreign key (empresa_rastreamento_id) references fornecedores(id) on delete restrict;
  end if;
end $$;

-- Nome da rastreadora como ela aparece nas telas.
create or replace function nome_fornecedor(p_id uuid)
returns text
language sql
stable
as $$
  select coalesce(nullif(btrim(f.nome_fantasia), ''), f.razao_social)
    from fornecedores f where f.id = p_id;
$$;

-- ----------------------------------------------------------------------------
-- As funcoes do modulo (0050) liam a tabela paralela — passam a ler fornecedores.
-- Mesma assinatura e mesmas colunas de saida: `create or replace` basta.
-- ----------------------------------------------------------------------------
create or replace function rastreadores_listar(
  p_busca       text default null,
  p_status      text default null,
  p_regional_id uuid default null,
  p_plataforma_id uuid default null,
  p_com_veiculo boolean default null,
  p_limite      integer default 50,
  p_offset      integer default 0
)
returns table (
  id uuid, imei text, numero_serie text, linha text, iccid text, operadora text,
  modelo text, fabricante text,
  status status_rastreador, status_numero smallint, status_desde timestamptz, dias_no_status integer,
  regional_id uuid, regional text,
  empresa_rastreamento_id uuid, plataforma text,
  veiculo_id uuid, placa text, veiculo text,
  cliente_id uuid, associado text,
  data_instalacao timestamptz, local_instalacao text, instalador text,
  total_registros bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with escopo as (
    select case when tem_acesso_global() then p_regional_id else auth_regional_id() end as reg,
           tem_acesso_global() as global
  ),
  base as (
    select r.*,
           reg.nome as regional_nome,
           coalesce(nullif(btrim(pl.nome_fantasia), ''), pl.razao_social) as plataforma_nome,
           v.placa  as veiculo_placa,
           nullif(btrim(concat_ws(' ', v.marca, v.modelo)), '') as veiculo_desc,
           c.nome_razao_social as associado_nome
      from rastreadores r
      left join regionais reg   on reg.id = r.regional_id
      left join fornecedores pl on pl.id  = r.empresa_rastreamento_id
      left join veiculos v      on v.id   = r.veiculo_id
      left join clientes c      on c.id   = r.cliente_id
      cross join escopo e
     where is_staff()
       and (e.global or r.regional_id is not distinct from e.reg)
       and (not e.global or e.reg is null or r.regional_id = e.reg)
       and (p_status is null or r.status::text = p_status)
       and (p_plataforma_id is null or r.empresa_rastreamento_id = p_plataforma_id)
       and (p_com_veiculo is null
            or (p_com_veiculo and r.veiculo_id is not null)
            or (not p_com_veiculo and r.veiculo_id is null))
       and (
         p_busca is null or btrim(p_busca) = ''
         or r.imei ilike '%' || btrim(p_busca) || '%'
         or coalesce(r.linha, '') ilike '%' || btrim(p_busca) || '%'
         or coalesce(r.numero_serie, '') ilike '%' || btrim(p_busca) || '%'
         or coalesce(v.placa, '') ilike '%' || btrim(p_busca) || '%'
         or coalesce(c.nome_razao_social, '') ilike '%' || btrim(p_busca) || '%'
       )
  )
  select b.id, b.imei, b.numero_serie, b.linha, b.iccid, b.operadora, b.modelo, b.fabricante,
         b.status, numero_status_rastreador(b.status::text),
         b.status_desde, (extract(day from now() - b.status_desde))::int,
         b.regional_id, b.regional_nome,
         b.empresa_rastreamento_id, b.plataforma_nome,
         b.veiculo_id, b.veiculo_placa, b.veiculo_desc,
         b.cliente_id, b.associado_nome,
         b.data_instalacao, b.local_instalacao, b.instalador,
         count(*) over () as total_registros
    from base b
   order by numero_status_rastreador(b.status::text), b.status_desde desc
   limit greatest(coalesce(p_limite, 50), 1) offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function rastreador_ficha(p_id uuid)
returns table (
  id uuid, imei text, numero_serie text, iccid text, linha text, operadora text,
  modelo text, fabricante text, status status_rastreador, status_numero smallint,
  status_desde timestamptz, dias_no_status integer,
  regional_id uuid, regional text, empresa_rastreamento_id uuid, plataforma text,
  plataforma_url text, custo_mensal numeric,
  veiculo_id uuid, placa text, veiculo text, cliente_id uuid, associado text, associado_documento text,
  data_aquisicao date, valor_aquisicao numeric, nota_fiscal text,
  data_instalacao timestamptz, data_desinstalacao timestamptz,
  local_instalacao text, instalador text, observacoes text,
  manutencao_aberta_id uuid, pode_editar boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.imei, r.numero_serie, r.iccid, r.linha, r.operadora, r.modelo, r.fabricante,
         r.status, numero_status_rastreador(r.status::text), r.status_desde,
         (extract(day from now() - r.status_desde))::int,
         r.regional_id, reg.nome, r.empresa_rastreamento_id,
         coalesce(nullif(btrim(pl.nome_fantasia), ''), pl.razao_social),
         pl.plataforma_url, pl.custo_mensal_equipamento,
         r.veiculo_id, v.placa, nullif(btrim(concat_ws(' ', v.marca, v.modelo)), ''),
         r.cliente_id, c.nome_razao_social, c.cpf_cnpj,
         r.data_aquisicao, r.valor_aquisicao, r.nota_fiscal,
         r.data_instalacao, r.data_desinstalacao, r.local_instalacao, r.instalador, r.observacoes,
         (select m.id from rastreador_manutencoes m
           where m.rastreador_id = r.id and m.status = 'ABERTA' limit 1),
         pode_mexer_rastreador(r.id)
    from rastreadores r
    left join regionais reg   on reg.id = r.regional_id
    left join fornecedores pl on pl.id  = r.empresa_rastreamento_id
    left join veiculos v      on v.id   = r.veiculo_id
    left join clientes c      on c.id   = r.cliente_id
   where r.id = p_id and is_staff();
$$;

create or replace function rastreadores_resumo(p_regional_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with escopo as (
    select case when tem_acesso_global() then p_regional_id else auth_regional_id() end as reg,
           tem_acesso_global() as global
  ),
  base as (
    select r.* from rastreadores r cross join escopo e
     where is_staff()
       and (e.global or r.regional_id is not distinct from e.reg)
       and (not e.global or e.reg is null or r.regional_id = e.reg)
  )
  select jsonb_build_object(
    'total',    (select count(*) from base),
    'ativos',   (select count(*) from base where status::text = 'ATIVO'),
    'estoque',  (select count(*) from base where status::text = 'DISPONIVEL'),
    'por_status', coalesce((
      select jsonb_agg(jsonb_build_object('status', t.status, 'numero', t.numero,
                                          'quantidade', t.quantidade) order by t.numero)
        from (select b.status::text as status,
                     numero_status_rastreador(b.status::text) as numero,
                     count(*) as quantidade
                from base b group by b.status) t
    ), '[]'::jsonb),
    'por_regional', coalesce((
      select jsonb_agg(jsonb_build_object('regional_id', t.regional_id, 'regional', t.regional,
                                          'total', t.total, 'ativos', t.ativos, 'estoque', t.estoque)
                       order by t.total desc)
        from (select b.regional_id, coalesce(reg.nome, 'Sem unidade') as regional,
                     count(*) as total,
                     count(*) filter (where b.status::text = 'ATIVO') as ativos,
                     count(*) filter (where b.status::text = 'DISPONIVEL') as estoque
                from base b left join regionais reg on reg.id = b.regional_id
               group by b.regional_id, reg.nome) t
    ), '[]'::jsonb),
    'por_plataforma', coalesce((
      select jsonb_agg(jsonb_build_object('plataforma_id', t.plataforma_id, 'plataforma', t.plataforma,
                                          'total', t.total, 'ativos', t.ativos,
                                          'custo_mensal', t.custo_mensal)
                       order by t.total desc)
        from (select b.empresa_rastreamento_id as plataforma_id,
                     coalesce(nullif(btrim(pl.nome_fantasia), ''), pl.razao_social, 'Sem plataforma') as plataforma,
                     count(*) as total,
                     count(*) filter (where b.status::text = 'ATIVO') as ativos,
                     round(coalesce(pl.custo_mensal_equipamento, 0)
                           * count(*) filter (where b.status::text = 'ATIVO'), 2) as custo_mensal
                from base b left join fornecedores pl on pl.id = b.empresa_rastreamento_id
               group by b.empresa_rastreamento_id, pl.nome_fantasia, pl.razao_social,
                        pl.custo_mensal_equipamento) t
    ), '[]'::jsonb)
  );
$$;

create or replace function rastreadores_a_recuperar(p_regional_id uuid default null)
returns table (
  rastreador_id uuid, imei text, status status_rastreador, status_numero smallint,
  dias_no_status integer, regional text, plataforma text,
  placa text, associado text, documento text, telefone text, celular text,
  ultima_instalacao timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with escopo as (
    select case when tem_acesso_global() then p_regional_id else auth_regional_id() end as reg,
           tem_acesso_global() as global
  )
  select r.id, r.imei, r.status, numero_status_rastreador(r.status::text),
         (extract(day from now() - r.status_desde))::int,
         reg.nome, coalesce(nullif(btrim(pl.nome_fantasia), ''), pl.razao_social),
         v.placa, c.nome_razao_social, c.cpf_cnpj, c.telefone, c.celular,
         r.data_instalacao
    from rastreadores r
    cross join escopo e
    left join regionais reg   on reg.id = r.regional_id
    left join fornecedores pl on pl.id  = r.empresa_rastreamento_id
    left join veiculos v      on v.id   = r.veiculo_id
    left join clientes c      on c.id   = r.cliente_id
   where is_staff()
     and r.status::text in ('INADIMPLENTE', 'INATIVO', 'A_DEVOLVER', 'COBRAR_RASTREADOR', 'BOLETO_GERADO')
     and (e.global or r.regional_id is not distinct from e.reg)
     and (not e.global or e.reg is null or r.regional_id = e.reg)
   order by numero_status_rastreador(r.status::text), r.status_desde;
$$;

-- Agora sim: a tabela paralela sai.
drop table if exists empresas_rastreamento;

-- ----------------------------------------------------------------------------
-- (D) Quem cadastra fornecedor
--   Era `tem_acesso_global()` (admin/financeiro) + `pode_assistencia()`. Quem
--   contrata guincho e rastreadora na ponta e o gestor da unidade — sem isso o
--   cadastro continuaria preso a Configuracoes por outro caminho.
-- ----------------------------------------------------------------------------
create or replace function pode_cadastrar_fornecedor()
returns boolean
language sql
stable
as $$
  select tem_acesso_global()
      or pode_assistencia()
      or auth_papel()::text = 'gestor_regional';
$$;

drop policy if exists forn_write on fornecedores;
create policy forn_write on fornecedores for all to authenticated
  using (pode_cadastrar_fornecedor()) with check (pode_cadastrar_fornecedor());

grant execute on function pode_cadastrar_fornecedor() to authenticated;
grant execute on function nome_fornecedor(uuid) to authenticated;
