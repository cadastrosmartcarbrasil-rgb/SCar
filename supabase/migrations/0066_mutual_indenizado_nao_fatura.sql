-- ============================================================================
-- SCar :: 0066_mutual_indenizado_nao_fatura.sql
--
-- DECISAO DO USUARIO (09/09/2026), sobre os status que a base real trouxe:
--   "Quem esta em Indenizado, Indenizacao, Inativo/pago, NAO vamos gerar
--    mensalidades."
--
-- Isso MUDA o de-para. Ate a 0065, `INDENIZADO` (e as grafias de `INDENIZACAO`)
-- caiam em `em_evento` — e `em_evento` E FATURAVEL: esta na lista de
-- `veiculo_faturavel` (0024), ao lado de `ativo` e `vistoria_pendente`. Ou seja,
-- 26 veiculos ja indenizados entrariam gerando boleto todo mes. Agora vao para
-- `inativo`, que nao fatura.
--
-- `SINISTRADO` CONTINUA `em_evento` de proposito, e a diferenca e essa: sinistro
-- em andamento e associado ATIVO com o carro em processo — segue pagando. Quem
-- foi INDENIZADO ja recebeu e saiu. Nao sao a mesma coisa, e o usuario nomeou
-- so o segundo grupo.
--
-- `DIFICULDADE FINANCEIRA` (11 objetos) SEGUE SEM MAPEAMENTO — o usuario listou
-- tres status e esse nao estava entre eles. Continua aparecendo em
-- `mutual_status_nao_mapeados()` ate a decisao vir.
-- ============================================================================

create or replace function mutual_status_veiculo(
  p_contract_status text,
  p_object_status   text default null
)
returns status_veiculo
language sql immutable
as $$
  select case
    when upper(coalesce(p_object_status, '')) = 'REMOVIDO' then 'inativo'
    when upper(coalesce(p_contract_status, '')) in ('ATIVO','INADIMPLENTE') then 'ativo'
    when upper(coalesce(p_contract_status, '')) = 'SUSPENSO' then 'suspenso'
    when upper(coalesce(p_contract_status, '')) = 'PENDENTE_VISTORIA' then 'vistoria_pendente'
    -- Sinistro EM ANDAMENTO: o associado segue na casa e segue pagando.
    -- `em_evento` entra em `veiculo_faturavel` (0024) — e isso e correto aqui.
    when upper(coalesce(p_contract_status, '')) = 'SINISTRADO' then 'em_evento'
    when upper(coalesce(p_contract_status, '')) in (
      'INATIVO','CANCELADO','CANCELADO_PENDENCIA','CANCELADO_TROCA_TITULARIDADE',
      'NEGADO','RECUSADO','EXPIRADO','SUBSTITUIDO','REMOVIDO',
      'AGUARDADO A RETIRADA DO RASTREADOR',
      'INATIVO/PAGO',
      -- DECISAO DO USUARIO: indenizado nao gera mensalidade. Aqui estava o
      -- risco — em `em_evento` estes 26 veiculos receberiam boleto todo mes.
      'INDENIZADO','INDENIZACAO','INDENIZAÇAO','INDENIZAÇÃO'
    ) then 'inativo'
    else null   -- funil de venda OU vocabulario que ainda nao conhecemos
  end::status_veiculo;
$$;

comment on function mutual_status_veiculo(text,text) is
  'De-para de status do Mutual. INDENIZADO/INDENIZACAO/INATIVO-PAGO = inativo (nao faturam, decisao do usuario); SINISTRADO segue em_evento (sinistro em andamento continua pagando).';

-- ----------------------------------------------------------------------------
-- A tela dizia "funil de venda" para TUDO que nao mapeia — inclusive para o
-- vocabulario desconhecido. Sao coisas diferentes: o funil e decisao tomada
-- (venda nova nasce no SCar); o desconhecido e decisao PENDENTE, e chamar de
-- funil esconde justamente o que precisa de resposta.
-- ----------------------------------------------------------------------------
create or replace function mutual_por_status()
returns table (
  contract_status text,
  status_scar     text,
  quantidade      bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_staff() then
    raise exception 'Somente a equipe pode ler o diagnostico da integracao';
  end if;
  return query
  select c.payload->>'contract_status',
         coalesce(
           mutual_status_veiculo(c.payload->>'contract_status', c.payload->>'status')::text,
           case when upper(coalesce(c.payload->>'contract_status','')) in (
                  'CRIADO','GERADO_PENDENCIA','AGUARDANDO_ACEITE','PENDENTE_ANALISE','AUTORIZADO',
                  'LINK_PAGAMENTO_ENVIADO','PAGAMENTO_GERADO','PENDENTE','NEGOCIACAO_PERDIDA','REATIVACAO'
                ) then '(nao importar - funil de venda)'
                else '(DESCONHECIDO - precisa de decisao)' end),
         count(*)::bigint
    from mutual_captura c
   where c.entidade = 'CONTRACT_OBJECT' and not c.deletado
   group by 1, 2
   order by 3 desc;
end;
$$;

-- Rito de seguranca (0052).
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
