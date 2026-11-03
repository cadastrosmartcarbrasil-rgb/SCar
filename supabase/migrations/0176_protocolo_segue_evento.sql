-- ============================================================================
-- 0176 — O PROTOCOLO SEGUE O EVENTO
--
-- O defeito (medido em producao em 03/11/2026): 119 eventos CONCLUIDO e 2
-- NEGADO estavam com o protocolo (atendimentos.evento_id, 0059) ainda
-- EM_ANDAMENTO. Nada ligava o fim do evento ao fim do protocolo: o evento
-- fecha pela tramitacao, pelo Kanban ou pela edicao, e o protocolo ficava na
-- Central e em "Meus protocolos" de quem tratou, para sempre.
--
-- A regra (decisao do usuario): o evento encerrado ENCERRA o protocolo dele.
--   (A) trigger AFTER UPDATE OF status em eventos_sinistro — vale por QUALQUER
--       caminho (transferir_protocolo, arrastar no Kanban, editar);
--         CONCLUIDO -> protocolo CONCLUIDO, solucao "Evento concluido"
--         NEGADO    -> protocolo CONCLUIDO, solucao "Evento negado"
--       e o evento que REABRE (sai de CONCLUIDO/NEGADO) reabre o protocolo
--       (EM_ANDAMENTO): voltou a ser trabalho de alguem.
--       Cada passagem grava a interacao na trilha do protocolo.
--   (B) correcao do que ja esta na base: encerra os protocolos de eventos ja
--       concluidos/negados, com a data de encerramento do evento.
-- Protocolo CANCELADO nao e tocado (decisao de quem cancelou).
-- ============================================================================

create or replace function fn_evento_sincroniza_protocolo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_final_novo boolean := new.status::text in ('CONCLUIDO', 'NEGADO');
  v_final_old  boolean := old.status::text in ('CONCLUIDO', 'NEGADO');
  v_usuario    uuid    := usuario_atual_id();
  v_msg        text;
  a            atendimentos;
begin
  if new.status is not distinct from old.status then return new; end if;

  for a in select * from atendimentos where evento_id = new.id loop
    if v_final_novo and a.status::text in ('ABERTO', 'EM_ANDAMENTO') then
      v_msg := case when new.status::text = 'CONCLUIDO' then 'Evento concluido'
                    else 'Evento negado' end
               || coalesce(' (' || new.numero_protocolo || ')', '')
               || ' — protocolo encerrado junto com o evento.';
      update atendimentos
         set status        = 'CONCLUIDO',
             encerrado_em  = coalesce(encerrado_em, now()),
             encerrado_por = coalesce(encerrado_por, v_usuario),
             solucao       = coalesce(nullif(btrim(coalesce(solucao, '')), ''), v_msg),
             updated_at    = now()
       where id = a.id;
      insert into protocolo_interacoes (atendimento_id, tipo, mensagem, de_status, para_status, usuario_id)
        values (a.id, 'ENCERRAMENTO', v_msg, a.status, 'CONCLUIDO', v_usuario);

    elsif v_final_old and not v_final_novo and a.status::text = 'CONCLUIDO' then
      v_msg := 'Evento reaberto (' || new.status::text || ') — protocolo reaberto junto.';
      update atendimentos
         set status        = 'EM_ANDAMENTO',
             encerrado_em  = null,
             encerrado_por = null,
             updated_at    = now()
       where id = a.id;
      insert into protocolo_interacoes (atendimento_id, tipo, mensagem, de_status, para_status, usuario_id)
        values (a.id, 'STATUS', v_msg, 'CONCLUIDO', 'EM_ANDAMENTO', v_usuario);
    end if;
  end loop;

  return new;
end;
$$;

comment on function fn_evento_sincroniza_protocolo() is
  '0176: evento CONCLUIDO/NEGADO encerra o protocolo dele; evento reaberto reabre o protocolo.';

drop trigger if exists trg_evento_sincroniza_protocolo on eventos_sinistro;
create trigger trg_evento_sincroniza_protocolo
  after update of status on eventos_sinistro
  for each row execute function fn_evento_sincroniza_protocolo();

-- (B) o que ja esta na base ----------------------------------------------------
with alvo as (
  select a.id, a.status as de_status, e.status::text as ev_status, e.numero_protocolo,
         coalesce(e.regulacao_encerrada_em::timestamptz, e.updated_at, now()) as quando
    from atendimentos a
    join eventos_sinistro e on e.id = a.evento_id
   where e.status::text in ('CONCLUIDO', 'NEGADO')
     and a.status::text in ('ABERTO', 'EM_ANDAMENTO')
), fechados as (
  update atendimentos a
     set status       = 'CONCLUIDO',
         encerrado_em = coalesce(a.encerrado_em, alvo.quando),
         solucao      = coalesce(nullif(btrim(coalesce(a.solucao, '')), ''),
                          case when alvo.ev_status = 'CONCLUIDO' then 'Evento concluido' else 'Evento negado' end
                          || coalesce(' (' || alvo.numero_protocolo || ')', '')
                          || ' — protocolo encerrado junto com o evento (correcao 0176).'),
         updated_at   = now()
    from alvo
   where a.id = alvo.id
  returning a.id, alvo.de_status, a.solucao
)
insert into protocolo_interacoes (atendimento_id, tipo, mensagem, de_status, para_status)
select id, 'ENCERRAMENTO', solucao, de_status, 'CONCLUIDO' from fechados;

-- rito da 0052
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
