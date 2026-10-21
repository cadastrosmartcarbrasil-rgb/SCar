-- 0134: ASSISTENCIA 24H — o pedido NEGADO fica registrado e o acionamento
-- lancado por engano pode ser EXCLUIDO (com trilha).
--
-- Pedido do usuario (21/10/2026): "precisa deixar um campo para evento negado,
-- por exemplo por ja ter atingido o limite de acionamentos — maior controle do
-- numero de acionamentos pelo mesmo veiculo" e "nao achei como excluir um
-- acionamento, por erro no preenchimento ou outro equivoco".
--
-- O buraco do NEGADO: quando o veiculo estava bloqueado (limite, inadimplencia,
-- status), `abrir_acionamento` (0026) RECUSAVA e nada era gravado. O associado
-- que liga cinco vezes depois de estourar o limite nao deixava rastro — e e
-- justamente ele que a gestao precisa enxergar.
--
-- (A) `status_acionamento` ganha NEGADO (status FINAL). Comparado como TEXTO no
--     restante do arquivo (valor de enum novo nao pode ser usado na mesma
--     transacao — gotcha do 0017).
-- (B) Colunas `negado_motivo` (codigo, CHECK), `negado_observacao`, `negado_por`,
--     `negado_em`. Motivo OUTRO exige observacao.
-- (C) `registrar_acionamento_negado(...)` grava o pedido JA NEGADO (sem alcada:
--     negar nao gasta nada) com a foto dos bloqueios do momento em
--     `bloqueio_motivos`; `negar_acionamento(id, motivo, obs)` nega um pedido
--     ainda ABERTO/EM_COTACAO (sem OS). Com OS gerada o caminho e o cancelamento.
-- (D) NEGADO e IMUTAVEL (trigger). Nao consome o limite (elegibilidade conta so
--     AUTORIZADO/EM_ATENDIMENTO/CONCLUIDO, 0026), nao gera titulo e nao entra no
--     volume/custo dos paineis (assist_painel_movimentos e painel_visao_geral
--     recriados, mesmas assinaturas).
-- (E) `elegibilidade_assistencia` (DROP + CREATE) devolve `negados` na janela do
--     servico e `historico_assistencia_veiculo` (DROP + CREATE) devolve o motivo
--     — e o controle por veiculo que o pedido descreve.
-- (F) EXCLUSAO: `excluir_acionamento(id, motivo)` com perfil_pode('assistencia',
--     'excluir') (celula nova; seed: financeiro; admin sempre; outros por extra,
--     0116). Recusa OS CONCLUIDA e titulo com pagamento; titulo em aberto da OS
--     sai junto. Foto completa (OS, cotacoes, historico, edicoes, anexos, titulo)
--     em `acionamento_exclusoes`, que sobrevive. Devolve os arquivos para a tela
--     tirar do storage (SQL nao apaga arquivo). DELETE direto na tabela passa a
--     ser recusado (policy RESTRICTIVE) — a policy `acion_write` (0026) era
--     `for all` e deixava o operador apagar sem trilha pela API.

-- (A) -----------------------------------------------------------------------
alter type status_acionamento add value if not exists 'NEGADO';

-- (B) -----------------------------------------------------------------------
alter table acionamentos_assistencia
  add column if not exists negado_motivo     text,
  add column if not exists negado_observacao text,
  add column if not exists negado_por        uuid references usuarios(id) on delete set null,
  add column if not exists negado_em         timestamptz;

alter table acionamentos_assistencia drop constraint if exists chk_acion_negado_motivo;
alter table acionamentos_assistencia add constraint chk_acion_negado_motivo check (
  negado_motivo is null or negado_motivo in (
    'LIMITE_ATINGIDO', 'INADIMPLENCIA', 'VEICULO_INATIVO', 'PENDENCIA_CADASTRAL',
    'SEM_COBERTURA', 'FORA_DA_AREA', 'OUTRO'));

comment on column acionamentos_assistencia.negado_motivo is
  'Motivo da negativa (0134): LIMITE_ATINGIDO, INADIMPLENCIA, VEICULO_INATIVO, PENDENCIA_CADASTRAL, SEM_COBERTURA, FORA_DA_AREA, OUTRO.';

create index if not exists idx_acion_negado on acionamentos_assistencia (veiculo_id, created_at desc)
  where negado_motivo is not null;

-- Validacao do motivo em UM lugar (as duas RPCs usam).
create or replace function acionamento_validar_negativa(p_motivo text, p_observacao text)
returns void
language plpgsql
immutable
as $$
begin
  if p_motivo is null or p_motivo not in (
       'LIMITE_ATINGIDO', 'INADIMPLENCIA', 'VEICULO_INATIVO', 'PENDENCIA_CADASTRAL',
       'SEM_COBERTURA', 'FORA_DA_AREA', 'OUTRO') then
    raise exception 'Informe o motivo da negativa' using errcode = 'check_violation';
  end if;
  if p_motivo = 'OUTRO' and length(btrim(coalesce(p_observacao, ''))) < 5 then
    raise exception 'Motivo "Outro": descreva o porque da negativa' using errcode = 'check_violation';
  end if;
end;
$$;

-- (C) -----------------------------------------------------------------------
create or replace function registrar_acionamento_negado(
  p_veiculo_id  uuid,
  p_servico_id  uuid,
  p_motivo      text,
  p_observacao  text default null,
  p_solicitante text default null,
  p_telefone    text default null,
  p_origem      jsonb default '{}'::jsonb
)
returns acionamentos_assistencia
language plpgsql
security definer
set search_path = public
as $$
declare
  v     veiculos;
  s     servicos_assistencia;
  sit   record;
  eleg  record;
  a     acionamentos_assistencia;
  v_mot text[] := '{}';
begin
  if not pode_assistencia() then raise exception 'Sem permissao para registrar assistencia'; end if;
  perform acionamento_validar_negativa(p_motivo, p_observacao);

  select * into v from veiculos where id = p_veiculo_id;
  if v.id is null then raise exception 'Veiculo nao encontrado'; end if;
  select * into s from servicos_assistencia where id = p_servico_id;
  if s.id is null then raise exception 'Servico de assistencia invalido'; end if;

  -- Foto dos bloqueios do momento (o que a tela mostrava ao atendente).
  select * into sit from situacao_assistencia_veiculo(p_veiculo_id);
  if sit.veiculo_id is not null and not sit.pode_acionar then v_mot := sit.motivos; end if;
  select * into eleg from elegibilidade_assistencia(p_veiculo_id) where servico_id = p_servico_id;
  if eleg.servico_id is not null and not eleg.elegivel then
    v_mot := v_mot || format('Limite do opcional atingido: %s de %s uso(s) em %s meses',
                             eleg.usados, eleg.limite_quantidade, eleg.janela_meses);
  end if;

  insert into acionamentos_assistencia (
    veiculo_id, cliente_id, servico_id, status,
    solicitante_nome, solicitante_telefone, origem, observacoes,
    valor_servico, computa_limite, bloqueio_motivos,
    negado_motivo, negado_observacao, negado_por, negado_em,
    aberto_por, regional_id
  ) values (
    v.id, v.cliente_id, s.id, 'NEGADO',
    nullif(btrim(coalesce(p_solicitante, '')), ''), nullif(btrim(coalesce(p_telefone, '')), ''),
    coalesce(p_origem, '{}'::jsonb), nullif(btrim(coalesce(p_observacao, '')), ''),
    0, s.computa_limite, coalesce(v_mot, '{}'),
    p_motivo, nullif(btrim(coalesce(p_observacao, '')), ''), usuario_atual_id(), now(),
    usuario_atual_id(), coalesce(v.regional_id, (select regional_id from clientes where id = v.cliente_id))
  ) returning * into a;

  return a;
end;
$$;

create or replace function negar_acionamento(p_acionamento_id uuid, p_motivo text, p_observacao text default null)
returns acionamentos_assistencia
language plpgsql
security definer
set search_path = public
as $$
declare a acionamentos_assistencia;
begin
  if not pode_assistencia() then raise exception 'Sem permissao'; end if;
  perform acionamento_validar_negativa(p_motivo, p_observacao);

  select * into a from acionamentos_assistencia where id = p_acionamento_id for update;
  if a.id is null then raise exception 'Acionamento nao encontrado'; end if;
  if a.status::text = 'NEGADO' then return a; end if;
  if a.status::text not in ('ABERTO', 'EM_COTACAO') or a.codigo_os is not null or a.lancamento_id is not null then
    raise exception 'A OS ja foi gerada para este atendimento: use "Cancelar atendimento".'
      using errcode = 'check_violation';
  end if;

  perform set_config('scar.motivo_edicao', 'Negado: ' || p_motivo
                     || coalesce(' — ' || nullif(btrim(coalesce(p_observacao, '')), ''), ''), true);
  update acionamentos_assistencia
     set status = 'NEGADO',
         negado_motivo = p_motivo,
         negado_observacao = nullif(btrim(coalesce(p_observacao, '')), ''),
         negado_por = usuario_atual_id(),
         negado_em = now(),
         updated_at = now()
   where id = p_acionamento_id
   returning * into a;
  perform set_config('scar.motivo_edicao', '', true);
  return a;
end;
$$;

-- (D) NEGADO e final: nada mais muda nele (a exclusao e DELETE, nao UPDATE).
create or replace function fn_acionamento_negado_imutavel()
returns trigger
language plpgsql
as $$
begin
  if old.status::text = 'NEGADO' then
    raise exception 'Acionamento NEGADO nao pode ser alterado. Abra um novo acionamento se for o caso.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_acionamento_negado_imutavel on acionamentos_assistencia;
create trigger trg_acionamento_negado_imutavel before update on acionamentos_assistencia
  for each row execute function fn_acionamento_negado_imutavel();

-- Cotacao em pedido negado: recusada (a tela ja esconde).
create or replace function fn_cotacao_acionamento_negado()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from acionamentos_assistencia
              where id = new.acionamento_id and status::text = 'NEGADO') then
    raise exception 'Acionamento NEGADO nao recebe cotacao' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_cotacao_acionamento_negado on acionamento_cotacoes;
create trigger trg_cotacao_acionamento_negado before insert or update on acionamento_cotacoes
  for each row execute function fn_cotacao_acionamento_negado();

-- Painel da 24h: fonte unica sem CANCELADO nem NEGADO (mesma assinatura, 0061).
create or replace function assist_painel_movimentos(
  p_data_inicio date,
  p_data_fim    date,
  p_regional_id uuid default null
)
returns table (
  id           uuid,
  veiculo_id   uuid,
  cliente_id   uuid,
  servico_id   uuid,
  servico      text,
  cidade       text,
  uf           text,
  status       status_acionamento,
  custo        numeric,
  km           numeric,
  aberto_em    timestamptz,
  concluido_em timestamptz,
  horas        numeric
)
language sql stable security definer set search_path = public
as $$
  select a.id,
         a.veiculo_id,
         a.cliente_id,
         a.servico_id,
         coalesce(s.descricao, 'NAO INFORMADO'),
         coalesce(norm_cidade(a.origem->>'cidade'),
                  norm_cidade(c.endereco->>'cidade'),
                  'NAO INFORMADO'),
         coalesce(nullif(upper(trim(a.origem->>'uf')), ''),
                  nullif(upper(trim(c.endereco->>'estado')), ''),
                  'NF'),
         a.status,
         coalesce(a.valor_total, 0)::numeric,
         a.km_percorrido,
         a.created_at,
         a.concluido_em,
         case when a.concluido_em is null then null
              else round(extract(epoch from (a.concluido_em - a.created_at)) / 3600.0, 2)
         end
    from acionamentos_assistencia a
    join clientes c on c.id = a.cliente_id
    left join servicos_assistencia s on s.id = a.servico_id
   where a.status::text not in ('CANCELADO', 'NEGADO')
     and a.created_at::date between p_data_inicio and p_data_fim
     and ((select escopo_regional(p_regional_id)) is null
            or a.regional_id = (select escopo_regional(p_regional_id)));
$$;

-- (E) -----------------------------------------------------------------------
drop function if exists elegibilidade_assistencia(uuid);
create function elegibilidade_assistencia(p_veiculo_id uuid)
returns table (
  servico_id        uuid,
  descricao         text,
  computa_limite    boolean,
  limite_quantidade integer,
  janela_meses      integer,
  usados            integer,
  restantes         integer,
  elegivel          boolean,
  ultimo_uso        date,
  negados           integer,
  ultima_negativa   date
)
language sql stable
as $$
  select s.id,
         s.descricao,
         s.computa_limite,
         s.limite_quantidade,
         s.limite_janela_meses,
         coalesce(u.usados, 0)::int,
         case when s.computa_limite
              then greatest(0, s.limite_quantidade - coalesce(u.usados, 0))::int
              else null end,
         (not s.computa_limite) or coalesce(u.usados, 0) < s.limite_quantidade,
         u.ultimo_uso,
         coalesce(n.negados, 0)::int,
         n.ultima
    from servicos_assistencia s
    left join lateral (
      select count(*)::int as usados, max(a.created_at::date) as ultimo_uso
        from acionamentos_assistencia a
       where a.veiculo_id = p_veiculo_id
         and a.servico_id = s.id
         and a.status::text in ('AUTORIZADO', 'EM_ATENDIMENTO', 'CONCLUIDO')
         and a.created_at >= now() - make_interval(months => s.limite_janela_meses)
    ) u on true
    left join lateral (
      select count(*)::int as negados, max(a.created_at::date) as ultima
        from acionamentos_assistencia a
       where a.veiculo_id = p_veiculo_id
         and a.servico_id = s.id
         and a.status::text = 'NEGADO'
         and a.created_at >= now() - make_interval(months => s.limite_janela_meses)
    ) n on true
   where s.ativo
   order by s.ordem, s.descricao;
$$;

drop function if exists historico_assistencia_veiculo(uuid, int);
create function historico_assistencia_veiculo(p_veiculo_id uuid, p_limite int default 50)
returns table (
  id             uuid,
  protocolo      text,
  codigo_os      text,
  servico        text,
  status         status_acionamento,
  prestador      text,
  valor_total    numeric,
  computa_limite boolean,
  criado_em      timestamptz,
  concluido_em   timestamptz,
  negado_motivo  text,
  negado_observacao text
)
language sql stable
as $$
  select a.id, a.protocolo, a.codigo_os, s.descricao, a.status,
         f.razao_social, a.valor_total, a.computa_limite, a.created_at, a.concluido_em,
         a.negado_motivo, a.negado_observacao
    from acionamentos_assistencia a
    join servicos_assistencia s on s.id = a.servico_id
    left join fornecedores f on f.id = a.prestador_id
   where a.veiculo_id = p_veiculo_id
   order by a.created_at desc
   limit coalesce(p_limite, 50);
$$;

-- (F) -----------------------------------------------------------------------
create or replace function permissao_celula_valida(p_modulo text, p_acao text)
returns boolean
language sql immutable
as $$
  select (p_modulo, p_acao) in (
    ('painel','ver'), ('painel','exportar'),
    ('sac','ver'), ('sac','criar'), ('sac','editar'), ('sac','transferir'), ('sac','fechar'),
    ('protocolos','ver'), ('protocolos','criar'), ('protocolos','editar'),
      ('protocolos','transferir'), ('protocolos','fechar'),
    ('assistencia','ver'), ('assistencia','criar'), ('assistencia','editar'),
      ('assistencia','excluir'),
      ('assistencia','cancelar'), ('assistencia','transferir'), ('assistencia','fechar'),
    ('vendas','ver'), ('vendas','criar'), ('vendas','editar'), ('vendas','excluir'),
      ('vendas','exportar'), ('vendas','cancelar'), ('vendas','transferir'), ('vendas','fechar'),
    ('associados','ver'), ('associados','criar'), ('associados','editar'),
      ('associados','excluir'), ('associados','exportar'),
    ('veiculos','ver'), ('veiculos','criar'), ('veiculos','editar'), ('veiculos','excluir'),
      ('veiculos','exportar'), ('veiculos','cancelar'),
    ('rastreadores','ver'), ('rastreadores','criar'), ('rastreadores','editar'),
      ('rastreadores','transferir'), ('rastreadores','baixar'),
    ('eventos','ver'), ('eventos','criar'), ('eventos','editar'), ('eventos','excluir'),
      ('eventos','exportar'), ('eventos','cancelar'), ('eventos','transferir'), ('eventos','fechar'),
    ('cobranca','ver'), ('cobranca','criar'), ('cobranca','editar'), ('cobranca','exportar'),
      ('cobranca','baixar'), ('cobranca','cancelar'),
    ('precificacao','ver'), ('precificacao','editar'), ('precificacao','exportar'),
    ('fornecedores','ver'), ('fornecedores','criar'), ('fornecedores','editar'),
      ('fornecedores','excluir'), ('fornecedores','exportar'),
    ('financeiro','ver'), ('financeiro','criar'), ('financeiro','editar'), ('financeiro','excluir'),
      ('financeiro','exportar'), ('financeiro','baixar'), ('financeiro','estornar'),
      ('financeiro','cancelar'),
    ('comunicados','ver'), ('comunicados','criar'), ('comunicados','editar'), ('comunicados','excluir'),
    ('termos_modelos','ver'), ('termos_modelos','criar'), ('termos_modelos','editar'),
      ('termos_modelos','excluir'),
    ('termos','ver'), ('termos','criar'), ('termos','exportar'), ('termos','cancelar')
  );
$$;

-- Seed da celula nova (re-executavel: nao sobrescreve ajuste do admin).
insert into perfil_permissoes (papel, modulo, acao, concedida)
select p.papel, 'assistencia', 'excluir', p.papel = 'financeiro'
  from (values ('financeiro'), ('gestor_regional'), ('consultor_vendas'), ('sinistro'),
               ('auditoria'), ('assistencia_24h'), ('supervisor'), ('cobranca')) p(papel)
 where not exists (select 1 from perfil_permissoes x
                    where x.papel = p.papel and x.modulo = 'assistencia' and x.acao = 'excluir');

create table if not exists acionamento_exclusoes (
  id             uuid primary key default gen_random_uuid(),
  acionamento_id uuid not null,
  protocolo      text,
  codigo_os      text,
  status         text,
  veiculo_id     uuid,
  cliente_id     uuid,
  servico        text,
  regional_id    uuid,
  dados          jsonb not null,
  motivo         text not null,
  usuario_id     uuid references usuarios(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists idx_acion_exclusoes_veiculo on acionamento_exclusoes (veiculo_id, created_at desc);
create index if not exists idx_acion_exclusoes_data on acionamento_exclusoes (created_at desc);

alter table acionamento_exclusoes enable row level security;
drop policy if exists acion_exclusoes_select on acionamento_exclusoes;
create policy acion_exclusoes_select on acionamento_exclusoes for select to authenticated
  using ((select tem_acesso_global())
         or (select pode_assistencia())
         or regional_id = any((select regionais_do_usuario())::uuid[]));
grant select on acionamento_exclusoes to authenticated;
revoke all on acionamento_exclusoes from anon;

comment on table acionamento_exclusoes is
  'Trilha da exclusao de acionamento da 24h (0134): foto da OS, cotacoes, historico, edicoes, anexos e titulo. Escrita so por excluir_acionamento; sobrevive ao acionamento.';

-- DELETE direto na tabela: recusado. So a RPC (security definer) apaga.
drop policy if exists acion_sem_delete_direto on acionamentos_assistencia;
create policy acion_sem_delete_direto on acionamentos_assistencia as restrictive
  for delete to authenticated using (false);

create or replace function excluir_acionamento(p_acionamento_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a        acionamentos_assistencia%rowtype;
  l        lancamentos_financeiros%rowtype;
  v_serv   text;
  v_anexos text[];
  v_fin    text[] := '{}';
begin
  if not is_staff() or not perfil_pode('assistencia', 'excluir') then
    raise exception 'Sem permissao para excluir acionamento (Assistencia 24h > Excluir)'
      using errcode = 'insufficient_privilege';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Informe o motivo da exclusao' using errcode = 'check_violation';
  end if;

  select * into a from acionamentos_assistencia where id = p_acionamento_id for update;
  if not found then
    raise exception 'Acionamento nao encontrado' using errcode = 'no_data_found';
  end if;
  if not (tem_acesso_global() or pode_regional(a.regional_id) or pode_assistencia()) then
    raise exception 'Este acionamento nao esta no seu alcance' using errcode = 'insufficient_privilege';
  end if;
  if a.status::text = 'CONCLUIDO' then
    raise exception 'OS concluida: o servico foi prestado e o custo e real. Use "Cancelar atendimento" se houve erro.'
      using errcode = 'check_violation';
  end if;

  if a.lancamento_id is not null then
    select * into l from lancamentos_financeiros where id = a.lancamento_id;
    if found and exists (select 1 from baixas_financeiras where lancamento_id = l.id) then
      raise exception 'O titulo desta OS ja tem pagamento registrado. Estorne o pagamento no Financeiro antes de excluir.'
        using errcode = 'check_violation';
    end if;
  end if;

  select descricao into v_serv from servicos_assistencia where id = a.servico_id;
  select coalesce(array_agg(url), '{}') into v_anexos
    from acionamento_anexos where acionamento_id = a.id;
  if l.id is not null then
    select coalesce(array_agg(url_storage), '{}') into v_fin
      from anexos_financeiros where lancamento_id = l.id;
  end if;

  insert into acionamento_exclusoes (
    acionamento_id, protocolo, codigo_os, status, veiculo_id, cliente_id, servico,
    regional_id, dados, motivo, usuario_id
  ) values (
    a.id, a.protocolo, a.codigo_os, a.status::text, a.veiculo_id, a.cliente_id, v_serv,
    a.regional_id,
    jsonb_build_object(
      'acionamento', to_jsonb(a),
      'cotacoes',  coalesce((select jsonb_agg(to_jsonb(c)) from acionamento_cotacoes c where c.acionamento_id = a.id), '[]'::jsonb),
      'historico', coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at) from acionamento_historico h where h.acionamento_id = a.id), '[]'::jsonb),
      'edicoes',   coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at) from acionamento_edicoes e where e.acionamento_id = a.id), '[]'::jsonb),
      'anexos',    to_jsonb(v_anexos),
      'lancamento', case when l.id is null then null else to_jsonb(l) end,
      'anexos_lancamento', to_jsonb(v_fin)),
    btrim(p_motivo), usuario_atual_id()
  );

  delete from acionamentos_assistencia where id = a.id;   -- cotacoes/historico/edicoes/anexos: cascade
  if l.id is not null then
    delete from lancamentos_financeiros where id = l.id;
  end if;

  return jsonb_build_object(
    'acionamento_id', a.id, 'protocolo', a.protocolo,
    'arquivos', to_jsonb(v_anexos), 'arquivos_financeiro', to_jsonb(v_fin),
    'lancamento_excluido', l.id is not null);
end;
$$;

-- painel_visao_geral (0112) recriado com o NEGADO fora do CTE `acion`.
create or replace function painel_visao_geral(
  p_regional_id uuid    default null,
  p_meses       integer default 6
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_rid    uuid;
  v_hoje   date := current_date;
  v_mes    date := date_trunc('month', current_date)::date;
  v_mes_ant date := (date_trunc('month', current_date) - interval '1 month')::date;
  v_meses  integer := least(greatest(coalesce(p_meses, 6), 3), 24);
  v_res    jsonb;
begin
  if not (is_staff() or auth.uid() is null) then
    return null;
  end if;
  v_rid := escopo_regional(p_regional_id);

  with
  frota as (
    select v.id, v.cliente_id, v.regional_id, v.tipo_veiculo_id, v.plano_protecao_id,
           v.status::text as status, v.data_ativacao, v.data_saida,
           v.cobranca_externa, v.valor_mensalidade
      from veiculos v
     where v_rid is null or v.regional_id = v_rid
  ),
  base as (
    select f.*,
           coalesce(nullif(f.valor_mensalidade, 0), (
             select t.valor from titulos_financeiros t
              where t.veiculo_id = f.id and t.status <> 'cancelado'
              order by t.data_vencimento desc, t.created_at desc limit 1
           ), 0) as mensalidade
      from frota f
     where f.data_ativacao is not null
       and f.data_ativacao <= v_hoje
       and (f.data_saida is null or f.data_saida > v_hoje)
  ),
  meses as (
    select gs::date as inicio,
           (gs + interval '1 month' - interval '1 day')::date as fim
      from generate_series(v_mes - make_interval(months => v_meses - 1), v_mes, interval '1 month') gs
  ),
  eventos as (
    select e.id, e.status::text as status, e.created_at::date as dia,
           coalesce(te.nome, initcap(lower(e.tipo_evento::text)), 'Nao classificado') as tipo
      from eventos_sinistro e
      left join tipos_evento te on te.id = e.tipo_evento_id
     where v_rid is null or e.regional_id = v_rid
  ),
  -- Historico do Mutual (0101): a unidade e a do veiculo e, sem ele, a do associado.
  hist as (
    select h.id, h.data_evento as dia, coalesce(h.tipos[1], 'Nao classificado') as tipo
      from eventos_historico h
      join clientes cl on cl.id = h.cliente_id
      left join veiculos ve on ve.id = h.veiculo_id
     where h.evento_id is null   -- 0112: o levado ao Kanban conta como evento do SCar
       and (v_rid is null or coalesce(ve.regional_id, cl.regional_id) = v_rid)
  ),
  acion as (
    select a.status::text as status, a.created_at::date as dia, a.valor_total
      from acionamentos_assistencia a
     where (v_rid is null or a.regional_id = v_rid)
       and a.status::text <> 'NEGADO'   -- 0134: pedido negado nao e acionamento
  ),
  lds as (
    select l.status::text as status, l.created_at::date as dia, l.auditado_em::date as auditado
      from leads l
     where v_rid is null or l.regional_id = v_rid
  ),
  pagar as (
    select l.data_vencimento, l.valor_saldo
      from lancamentos_financeiros l
     where l.tipo = 'DESPESA'
       and l.status::text in ('pendente', 'pago_parcial', 'atrasado')
       and (v_rid is null or l.regional_id = v_rid)
  )
  select jsonb_build_object(
    'gerado_em', now(),
    'regional_id', v_rid,

    'kpis', jsonb_build_object(
      'veiculos_base',        (select count(*) from base),
      'associados_base',      (select count(distinct cliente_id) from base),
      'carteira_mensal',      (select coalesce(round(sum(mensalidade), 2), 0) from base),
      'ticket_medio',         (select coalesce(round(avg(nullif(mensalidade, 0)), 2), 0) from base),
      'sem_valor',            (select count(*) from base where mensalidade = 0),
      'cobranca_externa',     (select count(*) from base where cobranca_externa),
      'carteira_externa',     (select coalesce(round(sum(mensalidade), 2), 0) from base where cobranca_externa),
      'adesoes_mes',          (select count(*) from frota where data_ativacao between v_mes and v_hoje),
      'adesoes_mes_anterior', (select count(*) from frota
                                where data_ativacao between v_mes_ant and (v_mes - 1)),
      'saidas_mes',           (select count(*) from frota where data_saida between v_mes and v_hoje),
      'saidas_mes_anterior',  (select count(*) from frota
                                where data_saida between v_mes_ant and (v_mes - 1)),
      'base_mes_anterior',    (select count(*) from frota
                                where data_ativacao is not null and data_ativacao <= (v_mes - 1)
                                  and (data_saida is null or data_saida > (v_mes - 1))),
      'inadimplentes',        (select count(*) from base where status = 'inadimplente'),
      'vistoria_pendente',    (select count(*) from base where status = 'vistoria_pendente'),
      'em_evento',            (select count(*) from base where status = 'em_evento'),
      'suspensos',            (select count(*) from base where status = 'suspenso'),
      'regionais',            (select count(*) from regionais r
                                where (v_rid is null or r.id = v_rid) and r.ativo)
    ),

    'por_regional', coalesce((
      select jsonb_agg(x order by x.veiculos desc) from (
        select coalesce(r.nome, 'MATRIZ (sem unidade)') as nome,
               count(*) as veiculos,
               count(distinct b.cliente_id) as associados,
               round(sum(b.mensalidade), 2) as carteira
          from base b left join regionais r on r.id = b.regional_id
         group by 1
      ) x), '[]'::jsonb),

    'por_uf', coalesce((
      select jsonb_agg(x order by x.veiculos desc) from (
        select coalesce(nullif(upper(trim(c.endereco->>'uf')), ''), '??') as uf,
               count(*) as veiculos
          from base b join clientes c on c.id = b.cliente_id
         group by 1
      ) x), '[]'::jsonb),

    'por_tipo', coalesce((
      select jsonb_agg(x order by x.veiculos desc) from (
        select coalesce(t.nome, 'Sem tipo') as nome, count(*) as veiculos,
               round(sum(b.mensalidade), 2) as carteira
          from base b left join tipos_veiculo t on t.id = b.tipo_veiculo_id
         group by 1
      ) x), '[]'::jsonb),

    'por_plano', coalesce((
      select jsonb_agg(x order by x.veiculos desc) from (
        select coalesce(p.nome, 'Sem plano') as nome, count(*) as veiculos
          from base b left join planos_protecao p on p.id = b.plano_protecao_id
         group by 1
      ) x), '[]'::jsonb),

    'por_status', coalesce((
      select jsonb_agg(x order by x.veiculos desc) from (
        select status, count(*) as veiculos from base group by 1
      ) x), '[]'::jsonb),

    'serie', coalesce((
      select jsonb_agg(x order by x.mes) from (
        select to_char(m.inicio, 'YYYY-MM') as mes,
               (select count(*) from frota f where f.data_ativacao between m.inicio and m.fim) as adesoes,
               (select count(*) from frota f where f.data_saida   between m.inicio and m.fim) as saidas,
               (select count(*) from frota f
                 where f.data_ativacao is not null
                   and f.data_ativacao <= least(m.fim, v_hoje)
                   and (f.data_saida is null or f.data_saida > least(m.fim, v_hoje))) as base_fim,
               (select count(*) from eventos e where e.dia between m.inicio and m.fim) as eventos,
               (select count(*) from hist h where h.dia between m.inicio and m.fim) as eventos_historico,
               (select count(*) from acion a
                 where a.dia between m.inicio and m.fim and a.status <> 'CANCELADO') as acionamentos,
               (select count(*) from lds l where l.dia between m.inicio and m.fim) as leads
          from meses m
      ) x), '[]'::jsonb),

    'eventos', jsonb_build_object(
      'abertos',      (select count(*) from eventos where status not in ('CONCLUIDO', 'NEGADO')),
      'novos_mes',    (select count(*) from eventos where dia >= v_mes),
      'concluidos',   (select count(*) from eventos where status = 'CONCLUIDO'),
      'negados',      (select count(*) from eventos where status = 'NEGADO'),
      'total',        (select count(*) from eventos),
      'por_status',   coalesce((select jsonb_agg(x) from (
                        select status, count(*) as n from eventos group by 1) x), '[]'::jsonb),
      'por_tipo',     coalesce((select jsonb_agg(x order by x.n desc) from (
                        select tipo, count(*) as n from eventos group by 1) x), '[]'::jsonb),
      'por_tipo_12m', coalesce((select jsonb_agg(x order by x.n desc) from (
                        select tipo, count(*) as n from eventos
                         where dia > v_hoje - 365 group by 1) x), '[]'::jsonb),
      'ultimos_12m',  (select count(*) from eventos where dia > v_hoje - 365),
      'historico', jsonb_build_object(
        'total',       (select count(*) from hist),
        'ultimos_12m', (select count(*) from hist where dia > v_hoje - 365),
        'mes',         (select count(*) from hist where dia >= v_mes),
        'por_tipo_12m', coalesce((select jsonb_agg(x order by x.n desc) from (
                          select tipo, count(*) as n from hist
                           where dia > v_hoje - 365 group by 1) x), '[]'::jsonb)
      )
    ),

    'assistencia', jsonb_build_object(
      'mes',        (select count(*) from acion where dia >= v_mes and status <> 'CANCELADO'),
      'em_aberto',  (select count(*) from acion
                      where status in ('ABERTO', 'EM_COTACAO', 'AUTORIZADO', 'EM_ATENDIMENTO')),
      'custo_mes',  (select coalesce(round(sum(valor_total), 2), 0) from acion
                      where dia >= v_mes and status <> 'CANCELADO')
    ),

    'vendas', jsonb_build_object(
      'em_aberto',        (select count(*) from lds where status not in ('ATIVO', 'PERDIDO')),
      'novos_mes',        (select count(*) from lds where dia >= v_mes),
      'convertidos_mes',  (select count(*) from lds where status = 'ATIVO' and auditado >= v_mes),
      'funil', coalesce((select jsonb_agg(x) from (
                 select status, count(*) as n from lds group by 1) x), '[]'::jsonb)
    ),

    'pagar', jsonb_build_object(
      'em_aberto',  (select coalesce(round(sum(valor_saldo), 2), 0) from pagar),
      'proximos_7', (select coalesce(round(sum(valor_saldo), 2), 0) from pagar
                      where data_vencimento between v_hoje and v_hoje + 7),
      'vencido',    (select coalesce(round(sum(valor_saldo), 2), 0) from pagar
                      where data_vencimento < v_hoje)
    ),

    'rastreadores', jsonb_build_object(
      'instalados', (select count(*) from rastreadores r
                      where r.status::text = 'ATIVO' and (v_rid is null or r.regional_id = v_rid)),
      'estoque',    (select count(*) from rastreadores r
                      where r.status::text = 'DISPONIVEL' and (v_rid is null or r.regional_id = v_rid)),
      'inadimplentes', (select count(*) from rastreadores r
                      where r.status::text = 'INADIMPLENTE' and (v_rid is null or r.regional_id = v_rid))
    )
  ) into v_res;

  return v_res;
end;
$$;

-- Rito da 0052
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
