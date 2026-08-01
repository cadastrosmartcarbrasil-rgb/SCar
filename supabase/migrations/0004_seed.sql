-- ============================================================================
-- SCar :: 0004_seed.sql
-- Dados iniciais (catalogos). Idempotente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Plano de contas / DRE
-- ----------------------------------------------------------------------------
insert into categorias_dre (codigo_estruturado, nome, tipo) values
  ('1.1.00', 'Receita de Mensalidades (Titulos)',      'RECEITA'),
  ('1.1.01', 'Receita de Adesao',                       'RECEITA'),
  ('1.2.01', 'Outras Receitas',                         'RECEITA'),
  ('3.1.00', 'Custo com Sinistros (Notas Fiscais)',     'CUSTO_VARIAVEL'),
  ('3.1.02', 'Custo de Guincho / Assistencia',          'CUSTO_VARIAVEL'),
  ('3.2.01', 'Comissoes de Vendas',                     'CUSTO_VARIAVEL'),
  ('4.1.01', 'Folha de Pagamento',                      'DESPESA_FIXA'),
  ('4.1.02', 'Aluguel e Ocupacao',                      'DESPESA_FIXA'),
  ('4.1.03', 'Software e Infraestrutura',               'DESPESA_FIXA'),
  ('4.2.01', 'Marketing',                               'DESPESA_FIXA')
on conflict (codigo_estruturado) do nothing;

-- ----------------------------------------------------------------------------
-- Planos de protecao (exemplo)
-- ----------------------------------------------------------------------------
insert into planos_protecao (nome, taxa_administrativa, cota_participacao, coberturas)
select 'Plano Essencial', 89.90, 800.00,
       '{"roubo_furto": true, "colisao": false, "terceiros": false, "guincho_km": 100, "carro_reserva": false}'::jsonb
where not exists (select 1 from planos_protecao where nome = 'Plano Essencial');

insert into planos_protecao (nome, taxa_administrativa, cota_participacao, coberturas)
select 'Plano Completo', 149.90, 1500.00,
       '{"roubo_furto": true, "colisao": true, "terceiros": true, "guincho_km": 400, "carro_reserva": true}'::jsonb
where not exists (select 1 from planos_protecao where nome = 'Plano Completo');

-- ----------------------------------------------------------------------------
-- Templates de e-mail
-- ----------------------------------------------------------------------------
insert into email_templates (codigo, assunto, corpo_html) values
  ('BOAS_VINDAS',
   'Bem-vindo(a) a Protecao Veicular SCar!',
   '<h1>Ola, {{nome}}!</h1><p>Seu veiculo <strong>{{placa}}</strong> ja esta protegido pelo plano {{plano}}.</p><p>Acesse o portal do associado para acompanhar boletos e abrir chamados.</p>'),
  ('LEMBRETE_BOLETO',
   'Seu boleto vence em breve - SCar',
   '<h1>Ola, {{nome}}</h1><p>O boleto no valor de <strong>R$ {{valor}}</strong> vence em <strong>{{vencimento}}</strong>.</p><p><a href="{{url_boleto}}">Clique aqui para pagar</a>.</p>'),
  ('NOVO_EVENTO',
   'Protocolo {{protocolo}} aberto - SCar',
   '<h1>Recebemos seu chamado</h1><p>O protocolo <strong>{{protocolo}}</strong> foi aberto para o veiculo {{placa}} e ja esta em analise pela nossa equipe.</p>')
on conflict (codigo) do nothing;
