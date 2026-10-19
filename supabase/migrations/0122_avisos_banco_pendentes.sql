-- 0122_avisos_banco_pendentes
-- O AVISO DO BANCO QUE AINDA NAO SE CONFIRMOU NAO PODE SUMIR.
--
-- O webhook do Sicredi (13/10/2026) so da baixa depois de achar o pagamento em
-- `liquidados/dia`. Quando nao acha (PIX/boleto pago no fim de semana ou
-- feriado entra na lista do dia util seguinte), o aviso virava so uma linha no
-- log do contêiner, e o agendador relia apenas ontem e hoje: o pagamento podia
-- ficar sem baixa e ninguem ficava sabendo (caso real: boleto de R$ 1,00 pago
-- em 18/10/2026, domingo).
--
-- Agora o aviso nao confirmado e GRAVADO aqui como AGUARDANDO, e o agendador
-- (/api/v1/cobrancas/baixa-banco, 4x ao dia) reconfere cada um, nos dias do
-- aviso ate hoje, ate confirmar. Passou do prazo (15 dias) sem aparecer, vira
-- EXPIRADO — fica na trilha para alguem olhar, nunca some calado.
--
-- Escrita so pelo servidor (service_role). Leitura: admin/financeiro.

create table if not exists cobranca_avisos_banco (
  id                  uuid primary key default gen_random_uuid(),
  provedor            provedor_banco not null,
  ambiente            ambiente_integracao not null,
  nosso_numero        text not null,
  movimento           text,
  data_aviso          date,
  previsao_credito    date,
  payload             jsonb,
  situacao            text not null default 'AGUARDANDO'
                      check (situacao in ('AGUARDANDO', 'CONFIRMADO', 'EXPIRADO')),
  tentativas          int not null default 0,
  ultima_tentativa_em timestamptz,
  confirmado_em       timestamptz,
  recebido_em         timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint uq_cobranca_aviso_banco unique (provedor, ambiente, nosso_numero)
);

create index if not exists idx_cobranca_avisos_banco_situacao
  on cobranca_avisos_banco (situacao, recebido_em desc);

alter table cobranca_avisos_banco enable row level security;

drop policy if exists cobranca_avisos_banco_select on cobranca_avisos_banco;
create policy cobranca_avisos_banco_select on cobranca_avisos_banco
  for select to authenticated using ((select tem_acesso_global()));
-- Sem policy de escrita: so o servidor (service_role) grava.

revoke all on cobranca_avisos_banco from anon;

drop trigger if exists trg_cobranca_avisos_banco_updated on cobranca_avisos_banco;
create trigger trg_cobranca_avisos_banco_updated before update on cobranca_avisos_banco
  for each row execute function set_updated_at();

comment on table cobranca_avisos_banco is
  'Avisos de pagamento do banco (webhook) que ainda nao apareceram em liquidados/dia. '
  'O agendador reconfere ate confirmar (CONFIRMADO) ou vencer o prazo (EXPIRADO). 0122.';
