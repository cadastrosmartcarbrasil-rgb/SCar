-- 0125: O TIME DA 24H MANTEM O CATALOGO DE SERVICOS.
--
-- O defeito (19/10/2026): quem opera a Assistencia 24h (supervisora, papel
-- assistencia_24h) cadastra prestador, valor acordado e acionamento — tudo por
-- pode_assistencia() — mas "Novo servico 24h" era recusado:
-- "new row violates row-level security policy for table servicos_assistencia".
-- A policy de escrita do catalogo (0026) era so tem_acesso_global().
--
-- Agora: criar e editar servico = matriz OU quem tem assistencia.criar/editar
-- na grade de permissoes (pode_assistencia, 0111). APAGAR continua so da
-- matriz: o servico e citado por acionamento e por limite de uso — inativar e
-- o caminho da ponta.

drop policy if exists servicos_assist_write  on servicos_assistencia;
drop policy if exists servicos_assist_insert on servicos_assistencia;
drop policy if exists servicos_assist_update on servicos_assistencia;
drop policy if exists servicos_assist_delete on servicos_assistencia;

create policy servicos_assist_insert on servicos_assistencia for insert to authenticated
  with check ((select tem_acesso_global()) or (select pode_assistencia()));
create policy servicos_assist_update on servicos_assistencia for update to authenticated
  using ((select tem_acesso_global()) or (select pode_assistencia()))
  with check ((select tem_acesso_global()) or (select pode_assistencia()));
create policy servicos_assist_delete on servicos_assistencia for delete to authenticated
  using ((select tem_acesso_global()));
