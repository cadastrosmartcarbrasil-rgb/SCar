-- ============================================================================
-- SCar :: 0048_assistencia_anexos.sql
--
-- ANEXOS DA OS DA ASSISTENCIA 24H — a foto do atendimento nao tinha onde ficar.
--
-- O modulo 24h nasceu completo no dinheiro (cotacao, OS, KM excedente, contas a
-- pagar, auditoria da edicao) e vazio na PROVA: o guincho chegava, o prestador
-- mandava a foto do veiculo no WhatsApp do atendente e aquilo morria ali.
-- Quando o associado contesta ("meu carro ja estava riscado"), ou o prestador
-- cobra um servico a mais, nao ha o que mostrar.
--
--   (A) `acionamento_anexos` — foto do veiculo, foto do local, documento,
--       comprovante. `tipo` e TEXTO com CHECK (nao enum): evita o gotcha de
--       "novo valor de enum na mesma transacao" quando a lista crescer.
--   (B) Bucket privado `assistencia`, no padrao do `sinistros-docs`: o caminho
--       comeca pelo id do acionamento e a policy de storage confere o acesso
--       por ele — arquivo nao vaza para quem nao ve a OS.
--   (C) Mesmo TETO DE 10 MB do 0047. A reducao acontece no navegador
--       (`src/lib/imagem.ts`), mas o limite vive no banco.
--   (D) O mesmo teto passa a valer para os anexos de EVENTO/SINISTRO, que ja
--       guardavam `tamanho_bytes` e nao tinham limite nenhum. La a constraint
--       entra como NOT VALID: o historico ja gravado (foto de 12 MB que subiu
--       antes da compressao) continua onde esta, e so o que entrar de agora em
--       diante precisa respeitar o teto.
-- ============================================================================

create table if not exists acionamento_anexos (
  id             uuid primary key default gen_random_uuid(),
  acionamento_id uuid not null references acionamentos_assistencia(id) on delete cascade,
  url            text not null,          -- caminho dentro do bucket
  tipo           text not null default 'OUTRO',
  descricao      text,                   -- nome original do arquivo
  tamanho_bytes  bigint,
  enviado_por    uuid references usuarios(id) on delete set null,
  created_at     timestamptz not null default clock_timestamp()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'chk_acion_anexo_tipo') then
    alter table acionamento_anexos add constraint chk_acion_anexo_tipo
      check (tipo in ('FOTO_VEICULO', 'FOTO_LOCAL', 'DOCUMENTO', 'COMPROVANTE', 'OUTRO'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_acion_anexo_tamanho') then
    alter table acionamento_anexos add constraint chk_acion_anexo_tamanho
      check (tamanho_bytes is null or tamanho_bytes <= 10485760);
  end if;
end $$;

create index if not exists idx_acion_anexos on acionamento_anexos (acionamento_id, created_at desc);

comment on table acionamento_anexos is
  'Fotos e documentos do atendimento 24h. E a prova do estado do veiculo e do servico prestado.';

-- ----------------------------------------------------------------------------
-- RLS: espelha `acionamentos_assistencia` (0026)
--   ver   -> quem enxerga a OS (staff da regional ou o time da 24h)
--   mexer -> quem opera a 24h
-- ----------------------------------------------------------------------------
alter table acionamento_anexos enable row level security;

drop policy if exists acion_anx_select on acionamento_anexos;
drop policy if exists acion_anx_write  on acionamento_anexos;

create policy acion_anx_select on acionamento_anexos for select to authenticated using (
  exists (
    select 1 from acionamentos_assistencia a
     where a.id = acionamento_id
       and (pode_regional(a.regional_id) or pode_assistencia())
  )
);

create policy acion_anx_write on acionamento_anexos for all to authenticated
using (
  pode_assistencia()
  and exists (select 1 from acionamentos_assistencia a where a.id = acionamento_id)
)
with check (
  pode_assistencia()
  and exists (select 1 from acionamentos_assistencia a where a.id = acionamento_id)
);

grant select, insert, update, delete on acionamento_anexos to authenticated;

-- ----------------------------------------------------------------------------
-- STORAGE :: bucket privado 'assistencia'
-- Caminho: {acionamento_id}/{arquivo} — a policy confere o acesso pelo prefixo.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('assistencia', 'assistencia', false)
on conflict (id) do nothing;

drop policy if exists storage_assistencia_select on storage.objects;
drop policy if exists storage_assistencia_write  on storage.objects;

-- O regex evita o erro de cast quando alguem grava um caminho fora do padrao:
-- sem ele, um `name` sem uuid na frente derruba a consulta inteira.
create policy storage_assistencia_select on storage.objects for select to authenticated using (
  bucket_id = 'assistencia'
  and split_part(name, '/', 1) ~ '^[0-9a-fA-F-]{36}$'
  and exists (
    select 1 from acionamentos_assistencia a
     where a.id = (split_part(name, '/', 1))::uuid
       and (pode_regional(a.regional_id) or pode_assistencia())
  )
);

create policy storage_assistencia_write on storage.objects for all to authenticated
using (
  bucket_id = 'assistencia'
  and split_part(name, '/', 1) ~ '^[0-9a-fA-F-]{36}$'
  and pode_assistencia()
  and exists (
    select 1 from acionamentos_assistencia a where a.id = (split_part(name, '/', 1))::uuid
  )
)
with check (
  bucket_id = 'assistencia'
  and split_part(name, '/', 1) ~ '^[0-9a-fA-F-]{36}$'
  and pode_assistencia()
  and exists (
    select 1 from acionamentos_assistencia a where a.id = (split_part(name, '/', 1))::uuid
  )
);

-- ----------------------------------------------------------------------------
-- (D) O mesmo teto nos anexos de evento/sinistro
-- ----------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'chk_anexo_evento_tamanho') then
    alter table anexos_evento add constraint chk_anexo_evento_tamanho
      check (tamanho_bytes is null or tamanho_bytes <= 10485760) not valid;
  end if;
end $$;
