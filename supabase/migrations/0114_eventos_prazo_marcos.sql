-- ============================================================================
-- SCar :: 0114_eventos_prazo_marcos.sql
--
-- OS MARCOS DE ALERTA DO PRAZO REGULATORIO PASSAM A SER CONFIGURAVEIS (pedido do
-- usuario, 17/10/2026: "nao localizei onde estao as configuracoes desses prazos").
-- A 0113 cravou 30/60/75/85 no codigo. Agora:
--
--   * os 4 marcos (aviso, atencao, urgencia, critico) moram em `empresa` (a regra
--     e da associacao inteira, como a tolerancia de inadimplencia da 0072) e sao
--     editados em Configuracoes -> Prazos e Documentos do Evento, so pelo admin;
--   * os 90 dias NAO sao configuraveis: e o teto legal do Art. 22 (CNSP 491/2026).
--     O vencido continua sendo "passou de 90" (marco 91);
--   * o banco recusa marcos fora de ordem ou acima de 90 (CHECK);
--   * `prazo_regulatorio_nivel` passa a ler os marcos (STABLE, mesma assinatura)
--     — mudar o marco muda o nivel de todo evento NA HORA, porque a tela le o
--     calculo vivo (`eventos_prazos`);
--   * o alerta deixa de ser unico por NUMERO e passa a ser unico por NIVEL
--     (`evento_prazo_alertas.nivel`): trocar 60 por 50 nao pode fazer o mesmo
--     evento ganhar dois alertas de "atencao". `marco` segue gravando o limiar
--     em vigor quando o alerta disparou;
--   * a rotina diaria (`atualizar_prazos_eventos`) usa os marcos configurados e
--     devolve o nivel de cada alerta novo (o e-mail sai no CRITICO e no VENCIDO).
-- Nada muda ao aplicar: os padroes sao os mesmos 30/60/75/85.
-- ============================================================================

-- (A) os marcos em `empresa` --------------------------------------------------
alter table empresa
  add column if not exists prazo_evento_aviso_dias    integer not null default 30,
  add column if not exists prazo_evento_atencao_dias  integer not null default 60,
  add column if not exists prazo_evento_urgencia_dias integer not null default 75,
  add column if not exists prazo_evento_critico_dias  integer not null default 85;

do $$ begin
  alter table empresa add constraint chk_empresa_prazo_evento_marcos check (
    prazo_evento_aviso_dias >= 1
    and prazo_evento_aviso_dias < prazo_evento_atencao_dias
    and prazo_evento_atencao_dias < prazo_evento_urgencia_dias
    and prazo_evento_urgencia_dias < prazo_evento_critico_dias
    and prazo_evento_critico_dias <= 90);
exception when duplicate_object then null; end $$;

comment on column empresa.prazo_evento_critico_dias is
  'Marco do alerta CRITICO do prazo regulatorio do evento (0114). Os 4 marcos sao crescentes e ate 90 (teto legal, Art. 22 CNSP 491/2026).';

create or replace function configuracao_prazo_evento()
returns table (prazo_dias integer, aviso integer, atencao integer, urgencia integer, critico integer)
language sql
stable
security definer
set search_path = public
as $$
  select 90,
         coalesce((select prazo_evento_aviso_dias    from empresa order by created_at limit 1), 30),
         coalesce((select prazo_evento_atencao_dias  from empresa order by created_at limit 1), 60),
         coalesce((select prazo_evento_urgencia_dias from empresa order by created_at limit 1), 75),
         coalesce((select prazo_evento_critico_dias  from empresa order by created_at limit 1), 85);
$$;

comment on function configuracao_prazo_evento() is
  'Prazo legal (90) e os 4 marcos de alerta configurados (0114). Sem linha em empresa, os padroes 30/60/75/85.';

create or replace function salvar_marcos_prazo_evento(
  p_aviso integer, p_atencao integer, p_urgencia integer, p_critico integer
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'Somente o administrador altera os marcos do prazo regulatorio.' using errcode = 'insufficient_privilege';
  end if;
  if p_aviso is null or p_atencao is null or p_urgencia is null or p_critico is null then
    raise exception 'Informe os quatro marcos.' using errcode = 'check_violation';
  end if;
  if not (p_aviso >= 1 and p_aviso < p_atencao and p_atencao < p_urgencia and p_urgencia < p_critico and p_critico <= 90) then
    raise exception 'Os marcos precisam ser crescentes (aviso < atencao < urgencia < critico) e no maximo 90 dias, o prazo legal.'
      using errcode = 'check_violation';
  end if;
  if not exists (select 1 from empresa) then
    raise exception 'Cadastre a empresa em Configuracoes -> Empresa antes de ajustar os marcos.' using errcode = 'no_data_found';
  end if;
  update empresa
     set prazo_evento_aviso_dias = p_aviso,
         prazo_evento_atencao_dias = p_atencao,
         prazo_evento_urgencia_dias = p_urgencia,
         prazo_evento_critico_dias = p_critico;
end;
$$;

-- (B) o nivel le os marcos ------------------------------------------------------
create or replace function prazo_regulatorio_nivel(p_dias integer, p_iniciado boolean, p_encerrado boolean)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when not coalesce(p_iniciado, false) then
      case when coalesce(p_encerrado, false) then 'ENCERRADO_SEM_PRAZO' else 'DOCUMENTACAO_PENDENTE' end
    when coalesce(p_encerrado, false) then
      case when p_dias > 90 then 'ENCERRADO_FORA_DO_PRAZO' else 'ENCERRADO_NO_PRAZO' end
    when p_dias > 90 then 'VENCIDO'
    when p_dias >= c.critico then 'CRITICO'
    when p_dias >= c.urgencia then 'URGENCIA'
    when p_dias >= c.atencao then 'ATENCAO'
    when p_dias >= c.aviso then 'AVISO'
    else 'NO_PRAZO'
  end
  from configuracao_prazo_evento() c;
$$;

comment on function prazo_regulatorio_nivel(integer, boolean, boolean) is
  'Nivel do prazo regulatorio (0113/0114): marcos configurados em empresa e vencido acima de 90. Espelho de nivelDoPrazo (TS).';

-- (C) alerta unico por NIVEL ---------------------------------------------------
alter table evento_prazo_alertas add column if not exists nivel text;

update evento_prazo_alertas
   set nivel = case marco when 30 then 'AVISO' when 60 then 'ATENCAO' when 75 then 'URGENCIA'
                          when 85 then 'CRITICO' else 'VENCIDO' end
 where nivel is null;

alter table evento_prazo_alertas alter column nivel set not null;
alter table evento_prazo_alertas drop constraint if exists chk_evento_prazo_marco;
alter table evento_prazo_alertas drop constraint if exists uq_evento_prazo_alerta;

do $$ begin
  alter table evento_prazo_alertas add constraint chk_evento_prazo_marco check (marco between 1 and 91);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table evento_prazo_alertas add constraint chk_evento_prazo_nivel
    check (nivel in ('AVISO', 'ATENCAO', 'URGENCIA', 'CRITICO', 'VENCIDO'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table evento_prazo_alertas add constraint uq_evento_prazo_alerta_nivel unique (evento_id, nivel);
exception when duplicate_object then null; end $$;

-- (D) a rotina diaria com os marcos configurados -------------------------------
create or replace function atualizar_prazos_eventos()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  p       record;
  c       record;
  m       record;
  v_id    uuid;
  v_novos jsonb := '[]'::jsonb;
  v_niv   jsonb := '{}'::jsonb;
  v_n     integer := 0;
begin
  if auth.uid() is not null and not tem_acesso_global() then
    raise exception 'Somente a matriz roda a rotina de prazos.' using errcode = 'insufficient_privilege';
  end if;

  select * into c from configuracao_prazo_evento();

  for p in select * from eventos_prazos(null, null, false) loop
    v_n := v_n + 1;
    v_niv := jsonb_set(v_niv, array[p.nivel], to_jsonb(coalesce((v_niv ->> p.nivel)::int, 0) + 1));

    insert into evento_prazo_situacao (evento_id, nivel, dias, inicio_prazo, limite_prazo, atualizado_em)
    values (p.evento_id, p.nivel, p.dias_transcorridos, p.inicio_prazo, p.limite_prazo, now())
    on conflict (evento_id) do update
      set nivel = excluded.nivel, dias = excluded.dias, inicio_prazo = excluded.inicio_prazo,
          limite_prazo = excluded.limite_prazo, atualizado_em = excluded.atualizado_em;

    if p.inicio_prazo is null then
      continue;
    end if;

    for m in
      select * from (values (1, 'AVISO', c.aviso), (2, 'ATENCAO', c.atencao), (3, 'URGENCIA', c.urgencia),
                            (4, 'CRITICO', c.critico), (5, 'VENCIDO', 91)) as t(ordem, nivel, marco)
       order by ordem
    loop
      exit when p.dias_transcorridos < m.marco;
      insert into evento_prazo_alertas (evento_id, marco, nivel, dias, limite_prazo)
      values (p.evento_id, m.marco, m.nivel, p.dias_transcorridos, p.limite_prazo)
      on conflict (evento_id, nivel) do nothing
      returning id into v_id;
      if v_id is not null then
        insert into evento_prazo_historico (evento_id, tipo, detalhe, dias)
        values (p.evento_id, 'ALERTA',
                case when m.nivel = 'VENCIDO' then 'Prazo regulatorio VENCIDO (limite ' || to_char(p.limite_prazo, 'DD/MM/YYYY') || ').'
                     else 'Marco de ' || m.marco || ' dias (limite ' || to_char(p.limite_prazo, 'DD/MM/YYYY') || ').' end,
                p.dias_transcorridos);
        v_novos := v_novos || jsonb_build_object(
          'alerta_id', v_id, 'evento_id', p.evento_id, 'numero_protocolo', p.numero_protocolo,
          'marco', m.marco, 'nivel', m.nivel, 'dias', p.dias_transcorridos, 'limite_prazo', p.limite_prazo,
          'regional_id', p.regional_id, 'regional_nome', p.regional_nome,
          'placa', p.placa, 'cliente_nome', p.cliente_nome);
        v_id := null;
      end if;
    end loop;
  end loop;

  delete from evento_prazo_situacao s
   using eventos_sinistro e
   where e.id = s.evento_id and e.status::text in ('CONCLUIDO', 'NEGADO');

  return jsonb_build_object('eventos_abertos', v_n, 'por_nivel', v_niv, 'alertas_novos', v_novos);
end;
$$;

comment on function atualizar_prazos_eventos() is
  'Rotina diaria (0113/0114): grava o contador de cada evento aberto e dispara um alerta por NIVEL (aviso, atencao, urgencia, critico pelos marcos configurados; vencido acima de 90). Re-executavel.';

-- ============================================================================
-- Rito de seguranca (0052)
-- ============================================================================
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
