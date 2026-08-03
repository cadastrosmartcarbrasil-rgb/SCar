-- ============================================================================
-- SCar :: 0006_associados.sql
-- Cadastro completo de associados: novos campos, matricula automatica,
-- novos status e validacao de CPF/CNPJ (digito verificador) no banco.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Novos valores de situacao do associado
-- ----------------------------------------------------------------------------
alter type status_cliente add value if not exists 'inativo';
alter type status_cliente add value if not exists 'suspenso';
alter type status_cliente add value if not exists 'excluido';

-- ----------------------------------------------------------------------------
-- Novos campos do associado
-- ----------------------------------------------------------------------------
alter table clientes
  add column if not exists data_nascimento date,
  add column if not exists sexo            text,
  add column if not exists nome_mae        text,
  add column if not exists email_adicional text,
  add column if not exists celular         text,
  add column if not exists matricula       text unique;

-- ----------------------------------------------------------------------------
-- Matricula sequencial automatica (6 digitos, iniciando em 001000)
-- ----------------------------------------------------------------------------
create sequence if not exists matricula_seq start 1000;

create or replace function fn_gerar_matricula()
returns trigger
language plpgsql
as $$
begin
  if new.matricula is null then
    new.matricula := lpad(nextval('matricula_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_gerar_matricula on clientes;
create trigger trg_gerar_matricula
  before insert on clientes
  for each row execute function fn_gerar_matricula();

-- ----------------------------------------------------------------------------
-- Validacao de CPF (11 digitos com digito verificador)
-- ----------------------------------------------------------------------------
create or replace function validar_cpf(p text)
returns boolean
language plpgsql
immutable
as $$
declare
  cpf text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
  s int; d1 int; d2 int; i int;
begin
  if length(cpf) <> 11 then return false; end if;
  if cpf ~ '^(\d)\1{10}$' then return false; end if;   -- todos os digitos iguais
  s := 0;
  for i in 1..9 loop s := s + substr(cpf, i, 1)::int * (11 - i); end loop;
  d1 := 11 - (s % 11); if d1 >= 10 then d1 := 0; end if;
  if d1 <> substr(cpf, 10, 1)::int then return false; end if;
  s := 0;
  for i in 1..10 loop s := s + substr(cpf, i, 1)::int * (12 - i); end loop;
  d2 := 11 - (s % 11); if d2 >= 10 then d2 := 0; end if;
  if d2 <> substr(cpf, 11, 1)::int then return false; end if;
  return true;
end;
$$;

-- ----------------------------------------------------------------------------
-- Validacao de CNPJ (14 digitos com digito verificador)
-- ----------------------------------------------------------------------------
create or replace function validar_cnpj(p text)
returns boolean
language plpgsql
immutable
as $$
declare
  cnpj text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
  w1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  w2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
  s int; d1 int; d2 int; i int;
begin
  if length(cnpj) <> 14 then return false; end if;
  if cnpj ~ '^(\d)\1{13}$' then return false; end if;
  s := 0;
  for i in 1..12 loop s := s + substr(cnpj, i, 1)::int * w1[i]; end loop;
  d1 := s % 11; if d1 < 2 then d1 := 0; else d1 := 11 - d1; end if;
  if d1 <> substr(cnpj, 13, 1)::int then return false; end if;
  s := 0;
  for i in 1..13 loop s := s + substr(cnpj, i, 1)::int * w2[i]; end loop;
  d2 := s % 11; if d2 < 2 then d2 := 0; else d2 := 11 - d2; end if;
  if d2 <> substr(cnpj, 14, 1)::int then return false; end if;
  return true;
end;
$$;

create or replace function validar_documento(doc text, tipo tipo_pessoa)
returns boolean
language sql
immutable
as $$
  select case when tipo = 'PF' then validar_cpf(doc) else validar_cnpj(doc) end;
$$;

-- CHECK garante que todo associado tenha CPF/CNPJ valido (NOT VALID nao
-- reprocessa linhas antigas, mas valida toda insercao/atualizacao nova).
alter table clientes drop constraint if exists chk_documento_valido;
alter table clientes
  add constraint chk_documento_valido
  check (validar_documento(cpf_cnpj, tipo_pessoa)) not valid;

-- Indice para busca por matricula
create index if not exists idx_clientes_matricula on clientes (matricula);
