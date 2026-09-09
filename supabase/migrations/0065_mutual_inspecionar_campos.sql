-- ============================================================================
-- SCar :: 0065_mutual_inspecionar_campos.sql
--
-- A CARGA COMPLETA (09/09/2026) trouxe duas respostas e um problema.
--
-- RESPONDIDO — `final_total_value` e a PARCELA, nao o total. `mutual_periodicidade`
-- mostrou semestral com mediana R$ 164,00 contra R$ 204,50 do mensal. Fosse o
-- total do contrato, o semestral estaria em ~6x o mensal. "Semestral" no Mutual e
-- a VIGENCIA (6 parcelas mensais), nao a frequencia do boleto — bate com a tela:
-- parcela R$ 120, seis vezes, total R$ 720. A carga pode gravar direto em
-- `veiculos.valor_mensalidade`.
--
-- O PROBLEMA — a unidade NAO esta em `regional`, nem no objeto nem no contrato:
-- 3.527 de 3.527 faturaveis sem unidade, com os 17.616 contratos capturados. As
-- 10 filiais aparecem todas com "0 objetos" pela mesma razao. Sem `regional_id`
-- a carteira inteira nasce na matriz (ele atravessa RLS, `escopo_regional` e os
-- paineis).
--
-- ESTA MIGRATION NAO ADIVINHA ONDE O CAMPO ESTA. Ja erramos duas vezes supondo o
-- lugar de um dado (o dia de vencimento e a propria unidade), e cada erro custou
-- uma rodada inteira. Ela entrega o INSTRUMENTO: `mutual_campos(entidade)` lista
-- as chaves que existem no payload capturado, quantas vem preenchidas e um
-- exemplo. A pergunta "onde mora a unidade?" passa a ser respondida olhando, nao
-- deduzindo — e serve para qualquer campo que faltar daqui para a frente.
-- ============================================================================

-- (A) O inspetor de payload
create or replace function mutual_campos(
  p_entidade text,
  p_caminho  text default null,     -- objeto aninhado (ex.: 'vehicle_data')
  p_amostra  integer default 3000
)
returns table (
  campo       text,
  preenchidos bigint,
  vazios      bigint,
  exemplo     text
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
  with amostra as (
    select case
             when mutual_texto(p_caminho) is null then c.payload
             else c.payload -> p_caminho
           end as doc
      from mutual_captura c
     where c.entidade = p_entidade and not c.deletado
     limit greatest(coalesce(p_amostra, 3000), 1)
  ),
  pares as (
    select kv.key as chave,
           -- Texto do valor SEM as aspas do json: `"7"` tem de virar `7`, senao
           -- todo campo pareceria preenchido (a string '"' ja nao e vazia).
           case when jsonb_typeof(kv.value) = 'string' then kv.value #>> '{}'
                when jsonb_typeof(kv.value) = 'null'   then null
                else kv.value::text end as valor
      from amostra a
      cross join lateral jsonb_each(a.doc) kv
     where a.doc is not null and jsonb_typeof(a.doc) = 'object'
  )
  select p.chave,
         count(*) filter (where mutual_texto(p.valor) is not null
                            and p.valor not in ('{}','[]','0'))::bigint,
         count(*) filter (where mutual_texto(p.valor) is null
                             or p.valor in ('{}','[]'))::bigint,
         left(min(p.valor) filter (where mutual_texto(p.valor) is not null
                                     and p.valor not in ('{}','[]')), 120)
    from pares p
   group by p.chave
   order by 2 desc, 1;
end;
$$;

comment on function mutual_campos(text,text,integer) is
  'Chaves do payload capturado, quantas vem preenchidas e um exemplo. Existe para NAO adivinhar onde um campo mora — errar isso ja custou duas rodadas (dia de vencimento e unidade).';

-- (B) Dois status novos que sao VARIACAO DE GRAFIA do que ja mapeamos
--     `INDENIZACAO` ao lado de `INDENIZADO` (os dois sao evento em curso) e
--     `INATIVO/PAGO` ao lado de `INATIVO`. Nao e chute: e o mesmo vocabulario
--     escrito de outro jeito.
--     `DIFICULDADE FINANCEIRA` (11 objetos) fica DE FORA de proposito — ele nao
--     tem par obvio: pode ser associado ativo renegociando divida (entra e
--     fatura) ou contrato ja encerrado (entra como historico). Errar manda
--     boleto para quem nao devia, ou tira da base quem ainda paga. Decisao do
--     usuario; ate la aparece em `mutual_status_nao_mapeados`.
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
    when upper(coalesce(p_contract_status, '')) in (
      'SINISTRADO','INDENIZADO',
      -- mesma coisa, outra grafia (com e sem cedilha, como veio da base real)
      'INDENIZACAO','INDENIZAÇAO','INDENIZAÇÃO'
    ) then 'em_evento'
    when upper(coalesce(p_contract_status, '')) in (
      'INATIVO','CANCELADO','CANCELADO_PENDENCIA','CANCELADO_TROCA_TITULARIDADE',
      'NEGADO','RECUSADO','EXPIRADO','SUBSTITUIDO','REMOVIDO',
      'AGUARDADO A RETIRADA DO RASTREADOR',
      'INATIVO/PAGO'
    ) then 'inativo'
    else null   -- funil de venda OU vocabulario que ainda nao conhecemos
  end::status_veiculo;
$$;

-- Rito de seguranca (0052).
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
