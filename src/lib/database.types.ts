// ============================================================================
// Tipos do banco (Supabase). Em producao, regenere com:
//   npm run db:types   (supabase gen types typescript --local)
// Esta versao e mantida em sincronia manual com as migrations.
//
// IMPORTANTE: os Row/Insert/Update usam `type` (nao `interface`) porque
// interfaces nao sao atribuiveis a Record<string, unknown> e o supabase-js
// inferiria `never` para os resultados das queries.
// ============================================================================

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// ---- Enums -----------------------------------------------------------------
export type PapelUsuario =
  | 'admin' | 'gestor_regional' | 'consultor_vendas' | 'financeiro' | 'sinistro' | 'cotador' | 'auditoria'
  | 'assistencia_24h';
export type TipoPessoa = 'PF' | 'PJ';
export type StatusCliente =
  | 'ativo' | 'inadimplente' | 'cancelado' | 'inativo' | 'suspenso' | 'excluido';
export type UsoVeiculo = 'passeio' | 'app' | 'comercial';
export type StatusVeiculo =
  | 'ativo' | 'suspenso' | 'baixado' | 'inativo' | 'excluido'
  | 'vistoria_pendente' | 'em_evento';
export type TipoFaturamento = 'AGRUPADO_ASSOCIADO' | 'INDIVIDUAL_VEICULO';
export type StatusFatura = 'ABERTA' | 'PAGA' | 'CANCELADA';
export type TipoAtendimento =
  | 'SINISTRO' | 'ASSISTENCIA_24H' | 'UPGRADE_COBERTURA'
  | 'SEGUNDA_VIA_BOLETO' | 'VISTORIA_ACESSORIOS' | 'ALTERACAO_CADASTRAL' | 'CANCELAMENTO'
  // 0029: categorias da Central de Protocolos
  | 'FINANCEIRO' | 'DUVIDAS' | 'RECLAMACAO' | 'OUTROS';
export type PrioridadeAtendimento = 'BAIXA' | 'NORMAL' | 'ALTA' | 'URGENTE';
export type TipoInteracaoProtocolo = 'COMENTARIO' | 'STATUS' | 'TRANSFERENCIA' | 'ENCERRAMENTO';
export type CanalAtendimento = 'SAC_INTERNO' | 'PORTAL';
export type StatusAtendimento = 'ABERTO' | 'EM_ANDAMENTO' | 'CONCLUIDO' | 'CANCELADO';
export type SeveridadeAlerta = 'BAIXA' | 'MEDIA' | 'ALTA';
export type StatusContratoAdesao = 'PENDENTE' | 'ENVIADO' | 'ACEITO' | 'RECUSADO' | 'CANCELADO';
export type FormaRecebimentoAdesao = 'VENDEDOR_NA_HORA' | 'BOLETO' | 'PIX' | 'CARTAO';
export type StatusVistoria = 'AGENDADA' | 'PENDENTE' | 'APROVADA' | 'REPROVADA';
export type TipoNegociacao =
  | 'venda' | 'substituicao' | 'reativacao' | 'troca_titularidade' | 'renovacao';
export type TipoCambio = 'manual' | 'automatico' | 'automatizado';
export type Combustivel = 'gasolina' | 'flex' | 'diesel' | 'alcool' | 'eletrico';
export type StatusTitulo = 'pendente' | 'pago' | 'cancelado' | 'vencido';
export type TipoMovimentacao = 'RECEITA' | 'DESPESA';
export type TipoCategoriaDre = 'RECEITA' | 'CUSTO_VARIAVEL' | 'DESPESA_FIXA';
export type StatusComissao = 'pendente' | 'pago';
export type TipoEvento = 'ROUBO' | 'FURTO' | 'COLISAO' | 'TERCEIROS' | 'GUINCHO';
export type StatusEvento =
  | 'ABERTO' | 'EM_ANALISE' | 'COTACAO_PECAS' | 'REPARO' | 'CONCLUIDO' | 'NEGADO';
export type TipoDocumentoAnexo =
  | 'FOTO_AVARIA' | 'BOLETIM_OCORRENCIA' | 'CNH' | 'CRLV' | 'NOTA_FISCAL';
export type StatusCotacao = 'EM_ABERTO' | 'APROVADA' | 'REJEITADA';
export type CodigoTemplate = 'BOAS_VINDAS' | 'LEMBRETE_BOLETO' | 'NOVO_EVENTO';
export type ProvedorBanco = 'ASAAS' | 'PJBANK' | 'CORA' | 'INTER' | 'GERENCIANET' | 'OUTRO';
export type AmbienteIntegracao = 'sandbox' | 'producao';
export type CanalComunicacao = 'EMAIL' | 'SMS' | 'WHATSAPP';
export type StatusComunicacao = 'pendente' | 'enviado' | 'falha';
export type EnvolvidoTipo = 'ASSOCIADO' | 'TERCEIRO';
export type TipoEnvolvimento = 'CAUSADOR' | 'VITIMA';
export type TipoReparo = 'PROPRIO' | 'TERCEIRO';
export type MetodoPreco = 'FAIXA_FIPE' | 'FIXO' | 'PERCENTUAL_FIPE';
export type TipoValorFaixa = 'VALOR' | 'PERCENTUAL';
export type MandatoStatus = 'VIGENTE' | 'EXPIRADO' | 'EM_RENOVACAO';
export type StatusLancamento = 'pendente' | 'pago_parcial' | 'quitado' | 'cancelado' | 'atrasado';
export type FormaPagamento = 'PIX' | 'BOLETO' | 'TRANSFERENCIA' | 'CARTAO' | 'DINHEIRO';
export type StatusConciliacao = 'NAO_CONCILIADO' | 'CONCILIADO_MANUAL' | 'CONCILIADO_API';
export type StatusCadastro = 'ATIVO' | 'INATIVO' | 'SUSPENSO';
export type StatusLead =
  | 'NOVO' | 'ORCAMENTO_GERADO' | 'PROPOSTA_ENVIADA' | 'EM_NEGOCIACAO'
  | 'APROVADO' | 'EM_AUDITORIA' | 'ATIVO' | 'PERDIDO';
// Status que o Kanban pode aplicar via drag-and-drop (0028)
export type StatusKanban = Exclude<StatusLead, 'EM_AUDITORIA' | 'ATIVO'>;
export type OrigemFipe = 'API' | 'MANUAL' | 'CONTINGENCIA';
// 0045 :: agenda de vendas (interacoes do lead)
export type TipoInteracaoLead = 'LIGACAO' | 'WHATSAPP' | 'EMAIL' | 'VISITA' | 'OBSERVACAO';
export type ResultadoInteracaoLead = 'FALOU' | 'NAO_ATENDEU' | 'AGENDOU' | 'SEM_INTERESSE';
// 0026 :: Assistencia 24h
export type StatusAcionamento =
  | 'ABERTO' | 'EM_COTACAO' | 'AUTORIZADO' | 'EM_ATENDIMENTO' | 'CONCLUIDO' | 'CANCELADO';

// ---- Helper para linhas com timestamps ------------------------------------
type Timestamps = {
  created_at: string;
  updated_at: string;
};

type Insert<T> = Partial<T>;
type Update<T> = Partial<T>;

// ---- Tabelas (Row) ---------------------------------------------------------
export type RegionaisRow = Timestamps & {
  id: string;
  nome: string;
  cnpj: string | null;
  endereco: Json;
  responsavel_id: string | null;
  // 0028: politica de desconto da franquia/regional
  percentual_maximo_desconto_venda: number;
  desconto_observacao: string | null;
  taxa_comissao_adesao: number;
  taxa_comissao_recorrente: number;
  dia_pagto_entrada_padrao: number | null;
  dia_pagto_recorrencia_padrao: number | null;
  codigo: string | null;
  // 0041 — regras de atribuicao do lead
  dias_protecao_lead: number;
  dias_sem_contato_lead: number;
  distribuicao_lead: string;
};

export type UsuariosRow = Timestamps & {
  id: string;
  nome: string;
  email: string;
  papel: PapelUsuario;
  regional_id: string | null;
  ativo: boolean;
};

export type VendedoresRow = Timestamps & {
  id: string;
  usuario_id: string | null;
  regional_id: string | null;
  taxa_comissao_adesao: number;
  taxa_comissao_recorrente: number;
  ativo: boolean;
  // 0035 — cadastro proprio do vendedor
  nome: string | null;
  email: string | null;
  telefone: string | null;
  codigo: string | null;
  documento: string | null;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  chave_pix: string | null;
  dia_pagto_entrada: number | null;
  dia_pagto_recorrencia: number | null;
  observacoes: string | null;
  contrato_url: string | null;
  boas_vindas_enviada_em: string | null;
};

export type ClientesRow = Timestamps & {
  id: string;
  auth_user_id: string | null;
  tipo_pessoa: TipoPessoa;
  nome_razao_social: string;
  cpf_cnpj: string;
  rg_ie: string | null;
  email: string | null;
  email_adicional: string | null;
  telefone: string | null;
  celular: string | null;
  data_nascimento: string | null;
  sexo: string | null;
  nome_mae: string | null;
  matricula: string | null;
  endereco: Json;
  status: StatusCliente;
  regional_id: string | null;
  // 0044 — Portal do Associado
  portal_senha_provisoria: boolean;
  portal_primeiro_acesso_em: string | null;
  portal_senha_alterada_em: string | null;
  portal_ultimo_acesso_em: string | null;
};

export type PlanosProtecaoRow = Timestamps & {
  id: string;
  nome: string;
  taxa_administrativa: number;
  cota_participacao: number;
  coberturas: Json;
  ativo: boolean;
  descricao_comercial: string | null;
  nivel: number;
};

export type VeiculosRow = Timestamps & {
  id: string;
  cliente_id: string;
  placa: string;
  chassi: string | null;
  renavam: string | null;
  marca: string | null;
  modelo: string | null;
  ano_fabricacao: number | null;
  ano_modelo: number | null;
  cor: string | null;
  uso: UsoVeiculo;
  valor_fipe: number | null;
  regional_id: string | null;
  vendedor_id: string | null;
  plano_protecao_id: string | null;
  status: StatusVeiculo;
  data_contrato: string | null;
  tipo_negociacao: TipoNegociacao | null;
  codigo_fipe: string | null;
  quilometragem: number | null;
  tipo_cambio: TipoCambio | null;
  combustivel: Combustivel | null;
  tipo_veiculo_id: string | null;
  cota_participacao_id: string | null;
  modelo_id: string | null;
  categoria: string | null;
  data_ativacao: string | null;
  tipo_faturamento: TipoFaturamento;
  alienado: boolean;
  alienado_financeira: string | null;
  numero_portas: number | null;
  valor_mensalidade: number | null;
  dia_vencimento: number | null;
};

export type FaturasRow = Timestamps & {
  id: string;
  cliente_id: string;
  regional_id: string | null;
  tipo_faturamento: TipoFaturamento;
  veiculo_id: string | null;
  competencia: string;
  valor_total: number;
  vencimento: string | null;
  status: StatusFatura;
  titulo_id: string | null;
};

export type FaturaItensRow = {
  id: string;
  fatura_id: string;
  veiculo_id: string | null;
  descricao: string;
  valor: number;
  created_at: string;
};

export type TiposAlertaRow = {
  id: string;
  nome: string;
  descricao: string | null;
  severidade: SeveridadeAlerta;
  ativo: boolean;
  created_at: string;
};
export type VeiculoAlertasRow = {
  id: string;
  veiculo_id: string;
  tipo_alerta_id: string;
  mensagem: string | null;
  ativo: boolean;
  created_by: string | null;
  created_at: string;
  resolvido_em: string | null;
  resolvido_por: string | null;
  resolucao_observacao: string | null;
};
// Alerta do veiculo com o tipo ja resolvido (RPC alertas_veiculo). `tipo_ativo`
// diz se o tipo ainda existe no catalogo — alerta de tipo desativado tambem
// aparece, senao o atendente nao tem como resolver a pendencia.
export type AlertaVeiculo = {
  id: string;
  veiculo_id: string;
  tipo_alerta_id: string;
  nome: string;
  descricao: string | null;
  severidade: SeveridadeAlerta;
  tipo_ativo: boolean;
  mensagem: string | null;
  ativo: boolean;
  created_at: string;
  criado_por: string | null;
  resolvido_em: string | null;
  resolvido_por_nome: string | null;
  resolucao_observacao: string | null;
};
export type ContratosAdesaoRow = Timestamps & {
  id: string;
  cliente_id: string;
  veiculo_id: string | null;
  status: StatusContratoAdesao;
  documento_url: string | null;
  token: string;
  aceito_em: string | null;
  aceito_ip: string | null;
  regional_id: string | null;
};
export type VistoriasRow = Timestamps & {
  id: string;
  veiculo_id: string | null;
  tipo: string | null;
  status: StatusVistoria;
  data_vistoria: string | null;
  observacoes: string | null;
  created_by: string | null;
  lead_id: string | null;
};
export type VistoriaAnexosRow = {
  id: string;
  vistoria_id: string;
  url: string;
  tipo: string | null;
  descricao: string | null;
  created_at: string;
};

export type AtendimentosRow = Timestamps & {
  id: string;
  numero_protocolo: string | null;
  cliente_id: string;
  /** 0029: protocolo aberto pela ficha do associado nao tem veiculo. */
  veiculo_id: string | null;
  tipo: TipoAtendimento;
  canal: CanalAtendimento;
  status: StatusAtendimento;
  assunto: string | null;
  descricao: string | null;
  dados: Json;
  regional_id: string | null;
  aberto_por: string | null;
  evento_id: string | null;
  // 0029: Central de Protocolos
  prioridade: PrioridadeAtendimento;
  responsavel_id: string | null;
  encerrado_em: string | null;
  encerrado_por: string | null;
  solucao: string | null;
};

export type ProtocoloInteracoesRow = {
  id: string;
  atendimento_id: string;
  tipo: TipoInteracaoProtocolo;
  mensagem: string | null;
  de_status: StatusAtendimento | null;
  para_status: StatusAtendimento | null;
  de_usuario: string | null;
  para_usuario: string | null;
  interno: boolean;
  usuario_id: string | null;
  created_at: string;
};

// Linha da Central de Protocolos (RPC listar_protocolos)
export type ProtocoloLinha = {
  id: string;
  protocolo: string | null;
  cliente_id: string;
  associado: string;
  veiculo_id: string | null;
  placa: string | null;
  tipo: TipoAtendimento;
  assunto: string | null;
  descricao: string | null;
  status: StatusAtendimento;
  prioridade: PrioridadeAtendimento;
  responsavel_id: string | null;
  responsavel: string | null;
  canal: CanalAtendimento;
  interacoes: number;
  aberto_em: string;
  atualizado_em: string;
  encerrado_em: string | null;
  dias_aberto: number;
};

// Interacao formatada (RPC interacoes_protocolo)
export type InteracaoProtocolo = {
  id: string;
  tipo: TipoInteracaoProtocolo;
  mensagem: string | null;
  de_status: StatusAtendimento | null;
  para_status: StatusAtendimento | null;
  de_usuario: string | null;
  para_usuario: string | null;
  interno: boolean;
  operador: string;
  created_at: string;
};

// Contador do dashboard (RPC resumo_protocolos)
export type ResumoProtocolos = {
  abertos: number;
  em_andamento: number;
  urgentes: number;
  meus: number;
  sem_responsavel: number;
  mais_7_dias: number;
};

// Linha da listagem de veiculos do associado (RPC veiculos_do_cliente): ja vem
// ordenada (ativos primeiro) e com os contadores resolvidos no banco.
export type VeiculoDoCliente = {
  id: string;
  placa: string;
  marca: string | null;
  modelo: string | null;
  ano_modelo: number | null;
  status: StatusVeiculo;
  tipo_faturamento: TipoFaturamento;
  data_ativacao: string | null;
  plano_nome: string | null;
  alertas_qtd: number;
  eventos_qtd: number;
  tem_assistencia: boolean;
};

// Item contratado do veiculo (RPC opcionais_veiculo) — so o que esta no pacote
export type OpcionalVeiculo = {
  produto_id: string;
  nome: string;
  valor: number;
  obrigatorio: boolean;
  origem: 'PLANO' | 'AVULSO';
  tem_limite: boolean;
  quantidade_limite: number | null;
  janela_dias: number | null;
  usados: number;
  elegivel: boolean;
  ultimo_uso: string | null;
};

// Linha do historico financeiro do SAC (RPC titulos_do_cliente)
export type TituloCliente = {
  id: string;
  veiculo_id: string | null;
  placa: string | null;
  competencia: string | null;
  data_vencimento: string;
  valor: number;
  valor_original: number;
  desconto: number;
  acrescimo: number;
  valor_pago: number | null;
  data_pagamento: string | null;
  status: StatusCobranca;
  dias_atraso: number;
  linha_digitavel: string | null;
  url_boleto: string | null;
  pix_copia_cola: string | null;
  observacao: string | null;
};

// Retorno de opcionais_elegibilidade (janela flutuante de N dias)
// Resumo do lote de cobrancas (gerar_faturas_competencia / emitir_titulos_competencia)
export type ResumoGeracaoFaturas = {
  associados: number;
  faturas_geradas: number;
  valor_total: number;
};
export type ResumoEmissaoTitulos = {
  titulos_emitidos: number;
  valor_total: number;
};

export type OpcionalElegibilidade = {
  produto_id: string;
  nome: string;
  quantidade_limite: number;
  janela_dias: number;
  usados: number;
  elegivel: boolean;
  ultimo_uso: string | null;
};

export type ComunicacoesRow = {
  id: string;
  cliente_id: string | null;
  canal: CanalComunicacao;
  destino: string | null;
  assunto: string | null;
  conteudo: string | null;
  status: StatusComunicacao;
  template_codigo: string | null;
  erro: string | null;
  regional_id: string | null;
  created_at: string;
};

export type MarcasRow = {
  id: string;
  nome: string;
  ativo: boolean;
  status: StatusCadastro;
  created_at: string;
};

export type ModelosRow = {
  id: string;
  marca_id: string;
  nome: string;
  tipo_veiculo: string | null;
  idade_maxima: number;
  ativo: boolean;
  status: StatusCadastro;
  cota_participacao_id: string | null;
  grupo_veiculo: string | null;
  especial: boolean;
  created_at: string;
};

export type CotasParticipacaoRow = {
  id: string;
  codigo: string;
  percentual: number;
  descricao: string | null;
  ativo: boolean;
  created_at: string;
};

export type LeadsRow = Timestamps & {
  id: string;
  nome: string;
  celular: string;
  email: string | null;
  cpf_cnpj: string | null;
  placa: string | null;
  tipo_veiculo_id: string | null;
  marca: string | null;
  modelo: string | null;
  modelo_id: string | null;
  ano_modelo: number | null;
  combustivel: Combustivel | null;
  valor_fipe: number | null;
  codigo_fipe: string | null;
  cota_participacao_id: string | null;
  uso: UsoVeiculo;
  origem_fipe: OrigemFipe;
  status: StatusLead;
  consultor_id: string | null;
  regional_id: string | null;
  observacoes: string | null;
  perdido_motivo: string | null;
  cliente_id: string | null;
  veiculo_id: string | null;
  aprovado_em: string | null;
  auditado_em: string | null;
  auditado_por: string | null;
  created_by: string | null;
  // 0034 — ficha completa antes de entrar na base
  tipo_pessoa: TipoPessoa | null;
  rg_ie: string | null;
  data_nascimento: string | null;
  endereco: Json;
  cliente_existente_id: string | null;
  chassi: string | null;
  renavam: string | null;
  cor: string | null;
  ano_fabricacao: number | null;
  crlv_qrcode: string | null;
  crlv_url: string | null;
  vendedor_id: string | null;
  plano_id: string | null;
  adesao_forma: FormaRecebimentoAdesao | null;
  adesao_valor: number | null;
  adesao_recebida_em: string | null;
  adesao_comprovante_url: string | null;
  origem_hotlink: string | null;
  // 0041 — atribuicao
  atribuido_em: string | null;
  atribuicao_motivo: string | null;
  ultima_interacao_em: string | null;
  recapturas: number;
  carteira: boolean;
  cliente_carteira_id: string | null;
  // 0042/0043 — sessao publica do hotlink e aceite do cliente
  token_publico: string;
  aceite_em: string | null;
  aceite_por: string | null;
  aceite_nome: string | null;
  aceite_documento: string | null;
  aceite_ip: string | null;
  aceite_user_agent: string | null;
  aceite_cotacao_id: string | null;
  // 0045 — agenda do vendedor
  proximo_contato_em: string | null;
  proximo_contato_nota: string | null;
};

export type CotacoesRow = {
  id: string;
  lead_id: string;
  fipe: number;
  tipo_veiculo_id: string | null;
  cota_participacao_id: string | null;
  itens: CotacaoItem[];
  total_mensalidade: number;
  participacao: number;
  taxa_adesao: number;
  modo_envio: string;
  token: string;
  enviada_em: string | null;
  created_by: string | null;
  created_at: string;
  // 0028: cotacao editavel + desconto
  plano_id: string | null;
  opcionais_ids: string[];
  desconto_percentual: number;
  desconto_valor_mensalidade: number;
  desconto_valor_adesao: number;
  total_com_desconto: number | null;
  adesao_com_desconto: number | null;
  desconto_aprovado_por: string | null;
  desconto_aprovado_em: string | null;
  desconto_justificativa: string | null;
  atualizada_em: string | null;
  atualizada_por: string | null;
};

// Card do Kanban (RPC leads_kanban)
export type LeadKanban = {
  id: string;
  nome: string;
  celular: string;
  status: StatusLead;
  marca: string | null;
  modelo: string | null;
  placa: string | null;
  valor_fipe: number | null;
  consultor: string | null;
  regional_id: string | null;
  cotacao_id: string | null;
  total_mensalidade: number | null;
  total_com_desconto: number | null;
  desconto_percentual: number | null;
  desconto_aprovado: boolean | null;
  atualizado_em: string;
  // 0045 — "parado ha N dias" e o retorno combinado
  ultima_interacao_em: string | null;
  proximo_contato_em: string | null;
  dias_parado: number;
  limite_sem_contato: number;
};

// Trilha de contato do lead (0045)
export type LeadInteracoesRow = {
  id: string;
  lead_id: string;
  tipo: TipoInteracaoLead;
  resultado: ResultadoInteracaoLead;
  observacao: string | null;
  proximo_contato_em: string | null;
  usuario_id: string | null;
  created_at: string;
};

// Linha da agenda do dia (RPC agenda_vendas)
export type LeadAgenda = {
  id: string;
  nome: string;
  celular: string;
  status: StatusLead;
  marca: string | null;
  modelo: string | null;
  placa: string | null;
  consultor: string | null;
  proximo_contato_em: string | null;
  proximo_contato_nota: string | null;
  ultima_interacao_em: string | null;
  dias_parado: number;
};

// Simulacao do desconto (RPC simular_desconto_cotacao)
export type SimulacaoDesconto = {
  limite_regional: number;
  dentro_do_limite: boolean;
  exige_aprovacao: boolean;
  mensalidade_original: number;
  mensalidade_final: number;
  adesao_original: number;
  adesao_final: number;
  desconto_mensalidade: number;
  desconto_adesao: number;
};

// Item obrigatorio do plano (RPC produtos_obrigatorios_cotacao)
export type ProdutoObrigatorio = {
  produto_id: string;
  nome: string;
  valor: number;
};

export type CotacaoItem = {
  produto_id: string | null;
  nome: string;
  valor: number;
  obrigatorio: boolean;
};

export type LeadHistoricoRow = {
  id: string;
  lead_id: string;
  de: StatusLead | null;
  para: StatusLead;
  usuario_id: string | null;
  obs: string | null;
  created_at: string;
};

export type FipePrecosLocalRow = {
  id: string;
  tipo_veiculo: string | null;
  marca: string;
  modelo: string;
  ano_modelo: number;
  codigo_fipe: string | null;
  valor: number;
  mes_referencia: string | null;
  updated_at: string;
};

export type CategoriasDreRow = {
  id: string;
  codigo_estruturado: string;
  nome: string;
  tipo: TipoCategoriaDre;
  ativo: boolean;
  created_at: string;
};

export type TitulosFinanceirosRow = Timestamps & {
  id: string;
  cliente_id: string;
  veiculo_id: string | null;
  valor: number;
  data_vencimento: string;
  data_pagamento: string | null;
  valor_pago: number | null;
  status: StatusTitulo;
  linha_digitavel: string | null;
  nosso_numero: string | null;
  url_boleto: string | null;
  gateway_transacao_id: string | null;
  // 0025: retorno da API bancaria (PIX/PDF) e rastreio do envio ao gateway
  pix_copia_cola: string | null;
  pix_qrcode_url: string | null;
  integracao_id: string | null;
  gateway_status: string | null;
  gateway_erro: string | null;
  enviado_em: string | null;
  // 0029: ajuste do boleto em aberto (SAC)
  valor_original: number | null;
  desconto: number;
  acrescimo: number;
  observacao: string | null;
  alterado_por: string | null;
  alterado_em: string | null;
};

// 0025: fila de envio ao banco (remessa de cobranca)
export type StatusRemessa = 'PENDENTE' | 'PROCESSANDO' | 'CONCLUIDA' | 'PARCIAL' | 'ERRO';
export type StatusRemessaItem = 'PENDENTE' | 'ENVIADO' | 'CONFIRMADO' | 'ERRO';

export type CobrancaRemessasRow = Timestamps & {
  id: string;
  integracao_id: string | null;
  regional_id: string | null;
  referencia: string | null;
  status: StatusRemessa;
  total_titulos: number;
  total_valor: number;
  enviado_em: string | null;
  retorno_em: string | null;
  erro: string | null;
  created_by: string | null;
};

export type CobrancaRemessaItensRow = Timestamps & {
  id: string;
  remessa_id: string;
  titulo_id: string;
  status: StatusRemessaItem;
  erro: string | null;
  payload: Json | null;
  retorno: Json | null;
};

// Linha da listagem do modulo Cobranca (RPC listar_cobrancas)
export type StatusCobranca = 'aberto' | 'pago' | 'vencido' | 'cancelado';
export type CobrancaLinha = {
  titulo_id: string;
  fatura_id: string | null;
  cliente_id: string;
  associado: string;
  cpf_cnpj: string;
  placas: string | null;
  competencia: string | null;
  data_vencimento: string;
  valor: number;
  valor_pago: number | null;
  data_pagamento: string | null;
  status: StatusCobranca;
  dias_atraso: number;
  linha_digitavel: string | null;
  url_boleto: string | null;
  pix_copia_cola: string | null;
  regional_id: string | null;
};

// KPIs do dashboard de cobranca (RPC resumo_cobrancas)
export type ResumoCobrancas = {
  emitido_qtd: number;
  emitido_valor: number;
  recebido_qtd: number;
  recebido_valor: number;
  aberto_qtd: number;
  aberto_valor: number;
  vencido_qtd: number;
  vencido_valor: number;
  inadimplencia_pct: number | null;
  vencer_7_qtd: number;
  vencer_7_valor: number;
  vencer_15_qtd: number;
  vencer_15_valor: number;
  vencer_30_qtd: number;
  vencer_30_valor: number;
};

// Uma linha por competencia gerada (RPC gerar_faturas_periodo)
export type ResumoPeriodoFaturas = {
  competencia: string;
  associados: number;
  faturas_geradas: number;
  valor_total: number;
};

export type MovimentacoesCaixaRow = Timestamps & {
  id: string;
  tipo: TipoMovimentacao;
  categoria_dre_id: string | null;
  descricao: string | null;
  valor: number;
  data_competencia: string;
  data_caixa: string | null;
  status: string;
  regional_id: string | null;
  comprovante_url: string | null;
  titulo_id: string | null;
  evento_id: string | null;
  lancamento_id: string | null;
};

export type ComissoesVendasRow = Timestamps & {
  id: string;
  vendedor_id: string;
  veiculo_id: string | null;
  titulo_id: string | null;
  valor_comissao: number;
  is_adesao: boolean;
  status_pagamento: StatusComissao;
};

export type EventosSinistroRow = Timestamps & {
  id: string;
  numero_protocolo: string | null;
  veiculo_id: string;
  cliente_id: string;
  data_ocorrencia: string;
  tipo_evento: TipoEvento | null;
  tipo_evento_id: string | null;
  descricao: string | null;
  status: StatusEvento;
  operador_atual_id: string | null;
  regional_id: string | null;
  data_comunicacao: string | null;
  envolvido_tipo: EnvolvidoTipo;
  tipo_envolvimento: TipoEnvolvimento | null;
  local_evento: Json;
  valor_fipe_atualizado: number | null;
  valor_participacao: number | null;
  bo_numero: string | null;
  bo_data: string | null;
  bo_unidade: string | null;
  bo_resumo: string | null;
};

export type TiposEventoRow = {
  id: string;
  nome: string;
  ativo: boolean;
  created_at: string;
};

export type TiposVeiculoRow = Timestamps & {
  id: string;
  nome: string;
  status: boolean;
  exige_rastreador: boolean;
  valor_limite_isencao: number;
  valor_mensalidade_rastreador: number;
};

export type ProdutosRow = Timestamps & {
  id: string;
  nome: string;
  fornecedor_nome: string;
  tipo_evento_id: string | null;
  metodo_preco: MetodoPreco;
  valor_fixo: number | null;
  percentual: number | null;
  obrigatorio: boolean;
  categoria: string;
  dados_adicionais: Json;
  status: boolean;
  tem_limite_uso: boolean;
  quantidade_limite: number;
  janela_dias_limite: number;
};

export type TabelaPrecosFaixaRow = {
  id: string;
  tipo_veiculo_id: string;
  produto_id: string;
  fipe_minimo: number;
  fipe_maximo: number;
  valor_mensal: number;
  tipo_valor: TipoValorFaixa;
  created_at: string;
};

export type ParticipacaoFaixaRow = {
  id: string;
  tipo_veiculo_id: string;
  fipe_minimo: number;
  fipe_maximo: number;
  tipo_valor: TipoValorFaixa;
  valor: number;
};

export type AdesaoFaixaRow = {
  id: string;
  tipo_veiculo_id: string;
  fipe_minimo: number;
  fipe_maximo: number;
  valor: number;
};

export type FornecedoresRow = Timestamps & {
  id: string;
  tipo_pessoa: TipoPessoa;
  documento: string;
  razao_social: string;
  nome_fantasia: string | null;
  situacao_cadastral: string | null;
  cnae_principal: string | null;
  email: string | null;
  telefone: string | null;
  endereco: Json;
  dados_receita: Json;
  ativo: boolean;
  // 0026: campos de prestador da Assistencia 24h
  prestador_assistencia: boolean;
  whatsapp: string | null;
  cobertura: string | null;
  chave_pix: string | null;
  observacoes: string | null;
};

// ---- Assistencia 24h (0026) ------------------------------------------------
export type ServicosAssistenciaRow = Timestamps & {
  id: string;
  descricao: string;
  valor_padrao: number;
  categoria_dre_id: string | null;
  cobra_km_excedente: boolean;
  valor_km_excedente: number;
  km_franquia: number;
  computa_limite: boolean;
  limite_quantidade: number;
  limite_janela_meses: number;
  produto_id: string | null;
  observacoes: string | null;
  ativo: boolean;
  ordem: number;
};

export type PrestadorServicosRow = {
  fornecedor_id: string;
  servico_id: string;
  valor_acordado: number | null;
  valor_km: number | null;
  prazo_medio_min: number | null;
  ativo: boolean;
};

export type AcionamentosAssistenciaRow = Timestamps & {
  id: string;
  protocolo: string | null;
  codigo_os: string | null;
  veiculo_id: string;
  cliente_id: string;
  servico_id: string;
  atendimento_id: string | null;
  evento_id: string | null;
  status: StatusAcionamento;
  solicitante_nome: string | null;
  solicitante_telefone: string | null;
  origem: Json;
  destino: Json;
  km_previsto: number | null;
  km_percorrido: number | null;
  km_excedente: number;
  observacoes: string | null;
  prestador_id: string | null;
  valor_servico: number;
  valor_km_excedente: number;
  valor_total: number;
  prazo_estimado_min: number | null;
  computa_limite: boolean;
  bloqueio_motivos: string[];
  liberado_por: string | null;
  liberado_em: string | null;
  liberacao_justificativa: string | null;
  lancamento_id: string | null;
  voucher_enviado_em: string | null;
  aberto_por: string | null;
  concluido_em: string | null;
  cancelado_motivo: string | null;
  regional_id: string | null;
  // Geolocalizacao da OS (0031) — espelho plano do jsonb origem/destino,
  // mantido por trigger, mais a rota calculada pelo provedor de mapas.
  endereco_origem: string | null;
  latitude_origem: number | null;
  longitude_origem: number | null;
  endereco_destino: string | null;
  latitude_destino: number | null;
  longitude_destino: number | null;
  distancia_km_calculada: number | null;
  duracao_minutos: number | null;
  rota_polyline: string | null;
  rota_calculada_em: string | null;
};

// Links de navegacao da OS (RPC links_navegacao_acionamento)
export type LinksNavegacaoOS = {
  origem_texto: string | null;
  destino_texto: string | null;
  google_rota: string | null;
  google_origem: string | null;
  waze_origem: string | null;
  waze_destino: string | null;
};

export type AcionamentoCotacoesRow = {
  id: string;
  acionamento_id: string;
  fornecedor_id: string;
  valor: number;
  valor_km: number | null;
  prazo_estimado_min: number | null;
  observacao: string | null;
  escolhida: boolean;
  created_by: string | null;
  created_at: string;
};

export type AcionamentoHistoricoRow = {
  id: string;
  acionamento_id: string;
  status: StatusAcionamento;
  observacao: string | null;
  usuario_id: string | null;
  created_at: string;
};

// Consumo do limite por servico, em tempo real (RPC elegibilidade_assistencia)
export type ElegibilidadeAssistencia = {
  servico_id: string;
  descricao: string;
  computa_limite: boolean;
  limite_quantidade: number;
  janela_meses: number;
  usados: number;
  restantes: number | null;
  elegivel: boolean;
  ultimo_uso: string | null;
};

// Trava do veiculo (RPC situacao_assistencia_veiculo)
export type SituacaoAssistencia = {
  veiculo_id: string;
  placa: string;
  cliente_id: string;
  associado: string;
  status_veiculo: StatusVeiculo;
  veiculo_ativo: boolean;
  inadimplente: boolean;
  titulos_vencidos: number;
  valor_em_atraso: number;
  pendencia_cadastral: boolean;
  alertas_ativos: number;
  pode_acionar: boolean;
  motivos: string[];
};

// Prestador habilitado (RPC prestadores_do_servico)
export type PrestadorDoServico = {
  fornecedor_id: string;
  razao_social: string;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  cobertura: string | null;
  valor_acordado: number | null;
  valor_km: number | null;
  prazo_medio_min: number | null;
};

// Auditoria de edicoes da OS (0027)
export type AcionamentoEdicoesRow = {
  id: string;
  acionamento_id: string;
  campo: string;
  valor_anterior: string | null;
  valor_novo: string | null;
  motivo: string | null;
  usuario_id: string | null;
  created_at: string;
};

// Linha do historico de edicoes (RPC historico_edicoes_acionamento)
export type EdicaoAcionamento = {
  id: string;
  campo: string;
  valor_anterior: string | null;
  valor_novo: string | null;
  motivo: string | null;
  operador: string;
  created_at: string;
};

// Receitas x despesas por centro de custo (RPC resumo_por_centro_custo)
export type ResumoCentroCusto = {
  centro_custo_id: string | null;
  centro_custo: string;
  codigo: string | null;
  receitas: number;
  despesas: number;
  resultado: number;
  lancamentos: number;
};

// Linha do historico do veiculo (RPC historico_assistencia_veiculo)
export type HistoricoAssistencia = {
  id: string;
  protocolo: string | null;
  codigo_os: string | null;
  servico: string;
  status: StatusAcionamento;
  prestador: string | null;
  valor_total: number;
  computa_limite: boolean;
  criado_em: string;
  concluido_em: string | null;
};

export type CentrosCustoRow = {
  id: string;
  nome: string;
  codigo: string | null;
  ativo: boolean;
  created_at: string;
};

export type ContasBancariasRow = {
  id: string;
  nome: string;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  tipo: string | null;
  chave_pix: string | null;
  ativo: boolean;
  created_at: string;
};

export type LancamentosFinanceirosRow = Timestamps & {
  id: string;
  tipo: TipoMovimentacao;
  fornecedor_id: string | null;
  cliente_id: string | null;
  descricao: string;
  categoria_dre_id: string | null;
  centro_custo_id: string | null;
  evento_id: string | null;
  regional_id: string | null;
  valor_original: number;
  data_emissao: string;
  data_vencimento: string;
  status: StatusLancamento;
  forma_pagamento_prevista: FormaPagamento | null;
  // 0032 — controle contabil e saldo mantido pelo banco
  numero_documento: string | null;
  competencia: string;
  observacoes: string | null;
  parcela_numero: number;
  parcela_total: number;
  grupo_parcelas: string | null;
  valor_pago: number;
  valor_saldo: number;
  // 0037 — favorecido do repasse de comissao (financeiro da franquia)
  vendedor_id: string | null;
};

export type BaixasFinanceirasRow = {
  id: string;
  lancamento_id: string;
  data_pagamento: string;
  valor_pago: number;
  desconto: number;
  juros_multa: number;
  valor_liquido: number;
  conta_bancaria_id: string | null;
  comprovante_transacao_id: string | null;
  id_transacao_bancaria_externa: string | null;
  end_to_end_id_pix: string | null;
  status_conciliacao: StatusConciliacao;
  created_at: string;
  // 0037 — a franquia registra COMO pagou/recebeu (nao concilia banco)
  forma_pagamento: FormaPagamento | null;
  observacao: string | null;
};

export type AnexosFinanceirosRow = {
  id: string;
  lancamento_id: string | null;
  baixa_id: string | null;
  nome_arquivo: string;
  mime_type: string | null;
  tamanho_bytes: number | null;
  url_storage: string;
  hash_md5: string | null;
  created_at: string;
};

export type EmpresaRow = Timestamps & {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string | null;
  inscricao_estadual: string | null;
  ie_isento: boolean;
  inscricao_municipal: string | null;
  im_isento: boolean;
  site: string | null;
  email_principal: string | null;
  email_financeiro: string | null;
  email_juridico: string | null;
  telefone_fixo: string | null;
  whatsapp_principal: string | null;
  whatsapp_suporte: string | null;
  endereco: Json;
  logo_url: string | null;
};

export type MandatosRow = Timestamps & {
  id: string;
  empresa_id: string;
  data_inicio: string;
  data_fim: string;
  status: MandatoStatus;
  observacoes: string | null;
};

export type DiretoriaRow = {
  id: string;
  mandato_id: string;
  cargo: string;
  nome_completo: string;
  cpf: string | null;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  created_at: string;
};

export type EmpresaDocumentosRow = {
  id: string;
  empresa_id: string;
  nome_arquivo: string;
  tipo_documento: string;
  url_arquivo: string;
  tamanho_bytes: number | null;
  data_upload: string;
};

// Retorno do motor de calculo (calcular_mensalidade)
export interface ItemMensalidade {
  produto_id: string | null;
  nome: string;
  valor: number;
  fornecedor: string;
  categoria: string;
  obrigatorio: boolean;
}
export interface CalculoMensalidade {
  valor_fipe: number;
  detalhamento_produtos: ItemMensalidade[];
  subtotal_taxa_admin: number;
  subtotal_beneficios_parceiros: number;
  valor_total_mensalidade: number;
  taxa_adesao: number;
}

// Retorno do motor de combos (cotar_plano)
export interface CotacaoPlano {
  valor_fipe: number;
  plano_id: string | null;
  plano_nome: string | null;
  detalhamento_produtos: ItemMensalidade[];
  subtotal_taxa_admin: number;
  subtotal_beneficios_parceiros: number;
  valor_total_mensalidade: number;
  taxa_adesao: number;
  franquia_participacao: number;
}

export type HistoricoProtocoloRow = {
  id: string;
  evento_id: string;
  usuario_origem_id: string | null;
  usuario_destino_id: string | null;
  acao_realizada: string;
  status_anterior: StatusEvento | null;
  status_novo: StatusEvento | null;
  observacoes: string | null;
  created_at: string;
};

export type AnexosEventoRow = {
  id: string;
  evento_id: string;
  tipo_documento: TipoDocumentoAnexo;
  arquivo_url: string;
  nome_original: string | null;
  tamanho_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
};

export type CotacoesPecasRow = Timestamps & {
  id: string;
  evento_id: string;
  fornecedor_nome: string;
  cnpj: string | null;
  valor_total: number;
  status: StatusCotacao;
  tipo_reparo: TipoReparo;
};

export type ItensCotacaoRow = {
  id: string;
  cotacao_id: string;
  descricao_peca: string;
  quantidade: number;
  valor_unitario: number;
  created_at: string;
};

export type NotasFiscaisEventoRow = {
  id: string;
  evento_id: string;
  fornecedor_id: string | null;
  fornecedor_nome: string | null;
  chave_acesso_nfe: string | null;
  valor_nota: number;
  data_emissao: string | null;
  arquivo_xml_pdf_url: string | null;
  created_at: string;
};

export type EmailTemplatesRow = Timestamps & {
  id: string;
  codigo: CodigoTemplate;
  assunto: string;
  corpo_html: string;
  ativo: boolean;
};

export type IntegracoesBancariasRow = Timestamps & {
  id: string;
  nome: string;
  provedor: ProvedorBanco;
  ambiente: AmbienteIntegracao;
  api_url: string | null;
  api_key: string | null;
  api_token_extra: string | null;
  webhook_secret: string | null;
  regional_id: string | null;
  is_padrao: boolean;
  ativo: boolean;
};

// ---- Retornos de funcoes (RPC) --------------------------------------------
export type DreLinha = {
  grupo: TipoCategoriaDre;
  categoria_codigo: string;
  categoria_nome: string;
  total: number;
};

export type DreResumo = {
  receita_bruta: number;
  custo_variavel: number;
  despesa_fixa: number;
  resultado_liquido: number;
  margem_percentual: number;
};

/** Regime de reconhecimento do resultado no DRE (0032). */
export type RegimeDre = 'CAIXA' | 'COMPETENCIA';

export type DreMes = {
  mes: string;
  receita: number;
  custo_variavel: number;
  despesa_fixa: number;
  resultado_liquido: number;
};

export type FinanceiroResumo = {
  previsto_receber: number;
  previsto_pagar: number;
  recebido: number;
  pago: number;
  saldo_realizado: number;
  aberto_receber: number;
  aberto_pagar: number;
  vencido_receber: number;
  vencido_pagar: number;
  titulos_vencidos: number;
  vence_em_7_dias: number;
};

export type FluxoMes = {
  mes: string;
  previsto_entrada: number;
  previsto_saida: number;
  realizado_entrada: number;
  realizado_saida: number;
  saldo_previsto: number;
  saldo_realizado: number;
};

export type AgingLinha = {
  tipo: TipoMovimentacao;
  faixa: string;
  ordem: number;
  titulos: number;
  total: number;
};

export type ItemChecklistLead = {
  item: string;
  grupo: string;
  ok: boolean;
  detalhe: string | null;
};

export type LimiteComissao = { adesao: number; recorrente: number };

export type VendedorLista = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  codigo: string;
  documento: string | null;
  regional_id: string | null;
  regional_nome: string | null;
  usuario_id: string | null;
  tem_portal: boolean;
  taxa_comissao_adesao: number;
  taxa_comissao_recorrente: number;
  teto_adesao: number;
  teto_recorrente: number;
  dia_pagto_entrada: number | null;
  dia_pagto_recorrencia: number | null;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  chave_pix: string | null;
  contrato_url: string | null;
  boas_vindas_enviada_em: string | null;
  observacoes: string | null;
  ativo: boolean;
  vendas_total: number;
  comissao_pendente: number;
};

export type RegionalPainel = {
  leads_periodo: number;
  leads_hotlink: number;
  leads_convertidos: number;
  taxa_conversao: number;
  veiculos_ativos: number;
  vendedores_ativos: number;
  comissao_franquia_adesao: number;
  comissao_vendedores_paga: number;
  comissao_vendedores_pend: number;
  contas_receber_aberto: number;
  contas_pagar_aberto: number;
  resultado_periodo: number;
};

export type DesempenhoVendedor = {
  vendedor_id: string;
  nome: string;
  codigo: string;
  ativo: boolean;
  leads: number;
  leads_hotlink: number;
  convertidos: number;
  taxa_conversao: number;
  veiculos_ativos: number;
  comissao_total: number;
  comissao_pendente: number;
  taxa_adesao: number;
  taxa_recorrente: number;
};

export type ComissaoRegional = {
  id: string;
  vendedor_id: string;
  vendedor_nome: string;
  veiculo_id: string | null;
  placa: string | null;
  is_adesao: boolean;
  valor_comissao: number;
  status_pagamento: string;
  created_at: string;
};

export type TipoCaptura = 'NOVO' | 'DUPLICADO' | 'REATIVACAO' | 'CARTEIRA';

export type ClassificacaoCaptura = {
  tipo: string;
  lead_id: string | null;
  vendedor_id: string | null;
  vendedor_nome: string | null;
  cliente_id: string | null;
  detalhe: string;
};

// Aviso de duplicidade no CRM (RPC classificar_captura_no_escopo, 0046).
// Nao tem parametro de regional: a unidade sai de quem chama.
export type AvisoCaptura = {
  tipo: TipoCaptura;
  lead_id: string | null;
  vendedor_nome: string | null;
  detalhe: string;
  /** O lead apontado e visivel para quem esta olhando? (link so aparece se sim) */
  pode_abrir: boolean;
};

export type LeadSemVendedor = {
  id: string;
  nome: string;
  celular: string;
  placa: string | null;
  status: string;
  origem_hotlink: string | null;
  carteira: boolean;
  parado_dias: number;
  created_at: string;
};

export type ParametrosAtribuicaoRow = {
  dias_protecao: number;
  dias_sem_contato: number;
  distribuicao: string;
};

export type PortalPerfil = {
  cliente_id: string;
  nome: string;
  cpf_cnpj: string;
  tipo_pessoa: string;
  email: string | null;
  telefone: string | null;
  endereco: Json;
  status: string;
  senha_provisoria: boolean;
  primeiro_acesso_em: string | null;
  veiculos_ativos: number;
  associado_desde: string | null;
};

export type PortalVeiculo = {
  id: string;
  placa: string;
  marca: string | null;
  modelo: string | null;
  ano_modelo: number | null;
  status: string;
  data_ativacao: string | null;
  plano_nome: string | null;
  mensalidade: number | null;
  dia_vencimento: number | null;
};

export type PortalTitulo = {
  id: string;
  veiculo_id: string | null;
  placa: string | null;
  competencia: string | null;
  data_vencimento: string;
  valor: number;
  valor_pago: number | null;
  data_pagamento: string | null;
  status: string;
  situacao: string;
  dias_atraso: number;
  linha_digitavel: string | null;
  url_boleto: string | null;
  pix_copia_cola: string | null;
};

export type PortalFinanceiro = {
  em_aberto: number;
  vencido: number;
  qtd_vencidos: number;
  proximo_vencimento: string | null;
  proximo_valor: number | null;
  pago_12_meses: number;
  em_dia: boolean;
};

export type PortalSegundaVia = {
  id: string;
  data_vencimento: string;
  valor: number;
  linha_digitavel: string | null;
  url_boleto: string | null;
  pix_copia_cola: string | null;
  disponivel: boolean;
  aviso: string | null;
};

export type PortalCartao = {
  id: string;
  bandeira: string | null;
  ultimos_digitos: string | null;
  nome_portador: string | null;
  validade_mes: number | null;
  validade_ano: number | null;
  principal: boolean;
  created_at: string;
};

export type CartoesCobrancaRow = Timestamps & {
  id: string;
  cliente_id: string;
  gateway: string;
  token: string;
  bandeira: string | null;
  ultimos_digitos: string | null;
  nome_portador: string | null;
  validade_mes: number | null;
  validade_ano: number | null;
  principal: boolean;
  ativo: boolean;
};

export type FotoVistoriaModelo = {
  codigo: string;
  nome: string;
  instrucao: string | null;
  obrigatorio: boolean;
  ordem: number;
  anexo_id: string | null;
  url: string | null;
  enviada: boolean;
};

export type ProdutoDoPlano = {
  produto_id: string;
  nome: string;
  valor_fixo: number | null;
  categoria: string;
};

export type VendedorPainel = {
  vendedor_id: string;
  nome: string;
  codigo: string | null;
  regional_nome: string | null;
  leads_periodo: number;
  leads_hotlink: number;
  leads_convertidos: number;
  leads_abertos: number;
  taxa_conversao: number;
  veiculos_ativos: number;
  comissao_periodo: number;
  comissao_pendente: number;
  comissao_paga: number;
  taxa_adesao: number;
  taxa_recorrente: number;
  dia_entrada: number | null;
  dia_recorrencia: number | null;
};

export type LeadDoVendedor = {
  id: string;
  nome: string;
  celular: string;
  email: string | null;
  placa: string | null;
  marca: string | null;
  modelo: string | null;
  valor_fipe: number | null;
  status: string;
  origem_hotlink: string | null;
  perdido_motivo: string | null;
  veiculo_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ComissaoDoVendedor = {
  id: string;
  placa: string | null;
  associado: string | null;
  is_adesao: boolean;
  valor_comissao: number;
  status_pagamento: string;
  created_at: string;
};

export type PerfilVendedor = {
  id: string;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  documento: string | null;
  codigo: string | null;
  regional_nome: string | null;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  chave_pix: string | null;
  taxa_adesao: number;
  taxa_recorrente: number;
  dia_entrada: number | null;
  dia_recorrencia: number | null;
  entrada_herdada: boolean;
  recorrencia_herdada: boolean;
  contrato_url: string | null;
  boas_vindas_enviada_em: string | null;
};

export type ResumoFinanceiroRegional = {
  a_receber_aberto: number;
  a_receber_vencido: number;
  a_pagar_aberto: number;
  a_pagar_vencido: number;
  recebido_periodo: number;
  pago_periodo: number;
  saldo_periodo: number;
};

export type TituloRegionalRow = {
  id: string;
  tipo: string;
  descricao: string;
  favorecido: string | null;
  categoria: string | null;
  data_vencimento: string;
  valor_original: number;
  valor_pago: number;
  valor_saldo: number;
  status: string;
  situacao: string;
  observacoes: string | null;
};

export type LeadRegional = {
  id: string;
  nome: string;
  celular: string;
  email: string | null;
  placa: string | null;
  status: string;
  origem_hotlink: string | null;
  vendedor_nome: string | null;
  veiculo_id: string | null;
  created_at: string;
};

// ---- Database (formato esperado pelo supabase-js) --------------------------
// Cada tabela precisa de Row/Insert/Update/Relationships; o schema precisa de
// Views/Functions/Enums/CompositeTypes com o formato exato.
type Rel<Col extends string, RefRel extends string> = {
  foreignKeyName: string;
  columns: [Col];
  isOneToOne: false;
  referencedRelation: RefRel;
  referencedColumns: ['id'];
};

type TableDef<R, Rels extends readonly unknown[] = []> = {
  Row: R;
  Insert: Insert<R>;
  Update: Update<R>;
  Relationships: Rels;
};

export type Database = {
  public: {
    Tables: {
      regionais: TableDef<RegionaisRow>;
      usuarios: TableDef<UsuariosRow>;
      vendedores: TableDef<VendedoresRow>;
      clientes: TableDef<ClientesRow>;
      planos_protecao: TableDef<PlanosProtecaoRow>;
      veiculos: TableDef<
        VeiculosRow,
        [
          Rel<'cliente_id', 'clientes'>,
          Rel<'plano_protecao_id', 'planos_protecao'>,
          Rel<'vendedor_id', 'vendedores'>,
          Rel<'regional_id', 'regionais'>,
          Rel<'cota_participacao_id', 'cotas_participacao'>,
          Rel<'modelo_id', 'modelos'>,
        ]
      >;
      categorias_dre: TableDef<CategoriasDreRow>;
      titulos_financeiros: TableDef<
        TitulosFinanceirosRow,
        [Rel<'cliente_id', 'clientes'>, Rel<'veiculo_id', 'veiculos'>]
      >;
      movimentacoes_caixa: TableDef<MovimentacoesCaixaRow>;
      comissoes_vendas: TableDef<ComissoesVendasRow>;
      eventos_sinistro: TableDef<
        EventosSinistroRow,
        [
          Rel<'veiculo_id', 'veiculos'>,
          Rel<'cliente_id', 'clientes'>,
          Rel<'operador_atual_id', 'usuarios'>,
          Rel<'regional_id', 'regionais'>,
          Rel<'tipo_evento_id', 'tipos_evento'>,
        ]
      >;
      tipos_evento: TableDef<TiposEventoRow>;
      historico_protocolo: TableDef<HistoricoProtocoloRow>;
      anexos_evento: TableDef<AnexosEventoRow>;
      cotacoes_pecas: TableDef<CotacoesPecasRow>;
      itens_cotacao: TableDef<ItensCotacaoRow, [Rel<'cotacao_id', 'cotacoes_pecas'>]>;
      notas_fiscais_evento: TableDef<NotasFiscaisEventoRow>;
      email_templates: TableDef<EmailTemplatesRow>;
      integracoes_bancarias: TableDef<IntegracoesBancariasRow, [Rel<'regional_id', 'regionais'>]>;
      marcas: TableDef<MarcasRow>;
      modelos: TableDef<
        ModelosRow,
        [Rel<'marca_id', 'marcas'>, Rel<'cota_participacao_id', 'cotas_participacao'>]
      >;
      cotas_participacao: TableDef<CotasParticipacaoRow>;
      leads: TableDef<
        LeadsRow,
        [
          Rel<'consultor_id', 'usuarios'>,
          Rel<'regional_id', 'regionais'>,
          Rel<'tipo_veiculo_id', 'tipos_veiculo'>,
          Rel<'cota_participacao_id', 'cotas_participacao'>,
          Rel<'cliente_id', 'clientes'>,
          Rel<'veiculo_id', 'veiculos'>,
        ]
      >;
      cotacoes: TableDef<CotacoesRow, [Rel<'lead_id', 'leads'>]>;
      lead_historico: TableDef<LeadHistoricoRow, [Rel<'lead_id', 'leads'>, Rel<'usuario_id', 'usuarios'>]>;
      lead_interacoes: TableDef<LeadInteracoesRow, [Rel<'lead_id', 'leads'>, Rel<'usuario_id', 'usuarios'>]>;
      fipe_precos_local: TableDef<FipePrecosLocalRow>;
      faturas: TableDef<
        FaturasRow,
        [Rel<'cliente_id', 'clientes'>, Rel<'veiculo_id', 'veiculos'>, Rel<'titulo_id', 'titulos_financeiros'>]
      >;
      fatura_itens: TableDef<FaturaItensRow, [Rel<'fatura_id', 'faturas'>, Rel<'veiculo_id', 'veiculos'>]>;
      cobranca_remessas: TableDef<
        CobrancaRemessasRow,
        [Rel<'integracao_id', 'integracoes_bancarias'>, Rel<'regional_id', 'regionais'>, Rel<'created_by', 'usuarios'>]
      >;
      cobranca_remessa_itens: TableDef<
        CobrancaRemessaItensRow,
        [Rel<'remessa_id', 'cobranca_remessas'>, Rel<'titulo_id', 'titulos_financeiros'>]
      >;
      atendimentos: TableDef<
        AtendimentosRow,
        [Rel<'cliente_id', 'clientes'>, Rel<'veiculo_id', 'veiculos'>, Rel<'aberto_por', 'usuarios'>, Rel<'evento_id', 'eventos_sinistro'>]
      >;
      protocolo_interacoes: TableDef<
        ProtocoloInteracoesRow,
        [Rel<'atendimento_id', 'atendimentos'>, Rel<'usuario_id', 'usuarios'>]
      >;
      veiculo_produtos: TableDef<{ veiculo_id: string; produto_id: string }, [Rel<'veiculo_id', 'veiculos'>, Rel<'produto_id', 'produtos'>]>;
      tipos_alerta: TableDef<TiposAlertaRow>;
      veiculo_alertas: TableDef<VeiculoAlertasRow, [Rel<'veiculo_id', 'veiculos'>, Rel<'tipo_alerta_id', 'tipos_alerta'>]>;
      contratos_adesao: TableDef<ContratosAdesaoRow, [Rel<'cliente_id', 'clientes'>, Rel<'veiculo_id', 'veiculos'>]>;
      vistorias: TableDef<VistoriasRow, [Rel<'veiculo_id', 'veiculos'>]>;
      vistoria_anexos: TableDef<VistoriaAnexosRow, [Rel<'vistoria_id', 'vistorias'>]>;
      comunicacoes: TableDef<ComunicacoesRow, [Rel<'cliente_id', 'clientes'>]>;
      tipos_veiculo: TableDef<TiposVeiculoRow>;
      produtos: TableDef<ProdutosRow, [Rel<'tipo_evento_id', 'tipos_evento'>]>;
      tabela_precos_faixa: TableDef<
        TabelaPrecosFaixaRow,
        [Rel<'tipo_veiculo_id', 'tipos_veiculo'>, Rel<'produto_id', 'produtos'>]
      >;
      participacao_faixa: TableDef<ParticipacaoFaixaRow, [Rel<'tipo_veiculo_id', 'tipos_veiculo'>]>;
      adesao_faixa: TableDef<AdesaoFaixaRow, [Rel<'tipo_veiculo_id', 'tipos_veiculo'>]>;
      plano_produtos: TableDef<{ plano_id: string; produto_id: string }>;
      empresa: TableDef<EmpresaRow>;
      mandatos: TableDef<MandatosRow, [Rel<'empresa_id', 'empresa'>]>;
      diretoria: TableDef<DiretoriaRow, [Rel<'mandato_id', 'mandatos'>]>;
      empresa_documentos: TableDef<EmpresaDocumentosRow, [Rel<'empresa_id', 'empresa'>]>;
      fornecedores: TableDef<FornecedoresRow>;
      servicos_assistencia: TableDef<
        ServicosAssistenciaRow,
        [Rel<'categoria_dre_id', 'categorias_dre'>, Rel<'produto_id', 'produtos'>]
      >;
      prestador_servicos: TableDef<
        PrestadorServicosRow,
        [Rel<'fornecedor_id', 'fornecedores'>, Rel<'servico_id', 'servicos_assistencia'>]
      >;
      acionamentos_assistencia: TableDef<
        AcionamentosAssistenciaRow,
        [
          Rel<'veiculo_id', 'veiculos'>,
          Rel<'cliente_id', 'clientes'>,
          Rel<'servico_id', 'servicos_assistencia'>,
          Rel<'prestador_id', 'fornecedores'>,
          Rel<'lancamento_id', 'lancamentos_financeiros'>,
          Rel<'atendimento_id', 'atendimentos'>,
          Rel<'liberado_por', 'usuarios'>,
          Rel<'aberto_por', 'usuarios'>,
        ]
      >;
      acionamento_cotacoes: TableDef<
        AcionamentoCotacoesRow,
        [Rel<'acionamento_id', 'acionamentos_assistencia'>, Rel<'fornecedor_id', 'fornecedores'>]
      >;
      acionamento_historico: TableDef<
        AcionamentoHistoricoRow,
        [Rel<'acionamento_id', 'acionamentos_assistencia'>, Rel<'usuario_id', 'usuarios'>]
      >;
      acionamento_edicoes: TableDef<
        AcionamentoEdicoesRow,
        [Rel<'acionamento_id', 'acionamentos_assistencia'>, Rel<'usuario_id', 'usuarios'>]
      >;
      centros_custo: TableDef<CentrosCustoRow>;
      contas_bancarias: TableDef<ContasBancariasRow>;
      lancamentos_financeiros: TableDef<
        LancamentosFinanceirosRow,
        [
          Rel<'fornecedor_id', 'fornecedores'>,
          Rel<'cliente_id', 'clientes'>,
          Rel<'categoria_dre_id', 'categorias_dre'>,
          Rel<'centro_custo_id', 'centros_custo'>,
          Rel<'vendedor_id', 'vendedores'>,
        ]
      >;
      baixas_financeiras: TableDef<BaixasFinanceirasRow, [Rel<'lancamento_id', 'lancamentos_financeiros'>]>;
      cartoes_cobranca: TableDef<CartoesCobrancaRow, [Rel<'cliente_id', 'clientes'>]>;
      anexos_financeiros: TableDef<AnexosFinanceirosRow, [Rel<'lancamento_id', 'lancamentos_financeiros'>]>;
    };
    Views: { [_ in never]: never };
    Functions: {
      gerar_dre: {
        Args:
          | { p_data_inicio: string; p_data_fim: string; p_regional_id?: string | null }
          | { p_data_inicio: string; p_data_fim: string; p_regional_id: string | null; p_centro_custo_id: string | null };
        Returns: DreLinha[];
      };
      gerar_dre_resumo: {
        Args:
          | { p_data_inicio: string; p_data_fim: string; p_regional_id?: string | null }
          | { p_data_inicio: string; p_data_fim: string; p_regional_id: string | null; p_centro_custo_id: string | null };
        Returns: DreResumo[];
      };
      // ---- 0032: DRE por regime + indicadores do contas a pagar/receber ----
      gerar_dre_completo: {
        Args: {
          p_data_inicio: string;
          p_data_fim: string;
          p_regional_id?: string | null;
          p_regime?: RegimeDre;
          p_centro_custo_id?: string | null;
        };
        Returns: DreLinha[];
      };
      gerar_dre_resumo_completo: {
        Args: {
          p_data_inicio: string;
          p_data_fim: string;
          p_regional_id?: string | null;
          p_regime?: RegimeDre;
          p_centro_custo_id?: string | null;
        };
        Returns: DreResumo[];
      };
      gerar_dre_mensal: {
        Args: {
          p_data_inicio: string;
          p_data_fim: string;
          p_regional_id?: string | null;
          p_regime?: RegimeDre;
          p_centro_custo_id?: string | null;
        };
        Returns: DreMes[];
      };
      financeiro_resumo: {
        Args: { p_data_inicio: string; p_data_fim: string; p_regional_id?: string | null };
        Returns: FinanceiroResumo[];
      };
      financeiro_fluxo_mensal: {
        Args: { p_data_inicio: string; p_data_fim: string; p_regional_id?: string | null };
        Returns: FluxoMes[];
      };
      financeiro_aging: {
        Args: { p_regional_id?: string | null };
        Returns: AgingLinha[];
      };
      resumo_por_centro_custo: {
        Args: { p_data_inicio: string; p_data_fim: string; p_regional_id?: string | null };
        Returns: ResumoCentroCusto[];
      };
      centro_custo_assistencia: { Args: Record<string, never>; Returns: string };
      atualizar_acionamento: {
        Args: {
          p_acionamento_id: string;
          p_valor_servico?: number | null;
          p_km_excedente?: number | null;
          p_valor_km?: number | null;
          p_km_percorrido?: number | null;
          p_destino?: Json | null;
          p_prazo_min?: number | null;
          p_observacoes?: string | null;
          p_motivo?: string | null;
        };
        Returns: AcionamentosAssistenciaRow;
      };
      trocar_prestador_acionamento: {
        Args: {
          p_acionamento_id: string;
          p_fornecedor_id: string;
          p_motivo: string;
          p_valor_servico?: number | null;
          p_valor_km?: number | null;
          p_prazo_min?: number | null;
        };
        Returns: AcionamentosAssistenciaRow;
      };
      sincronizar_lancamento_acionamento: {
        Args: { p_acionamento_id: string };
        Returns: LancamentosFinanceirosRow;
      };
      historico_edicoes_acionamento: {
        Args: { p_acionamento_id: string };
        Returns: EdicaoAcionamento[];
      };
      transferir_protocolo: {
        Args: {
          p_evento_id: string;
          p_usuario_destino_id: string;
          p_parecer?: string | null;
          p_novo_status?: StatusEvento | null;
        };
        Returns: EventosSinistroRow;
      };
      calcular_mensalidade: {
        Args: { p_fipe: number; p_tipo_veiculo_id: string; p_produtos_ids?: string[] };
        Returns: CalculoMensalidade;
      };
      calcular_participacao: {
        Args:
          | { p_fipe: number; p_tipo_veiculo_id: string }
          | { p_fipe: number; p_tipo_veiculo_id: string; p_cota_id: string | null };
        Returns: number;
      };
      calcular_participacao_veiculo: {
        Args: { p_veiculo_id: string; p_fipe: number };
        Returns: number;
      };
      calcular_adesao: {
        Args: { p_fipe: number; p_tipo_veiculo_id: string };
        Returns: number;
      };
      cotar_plano: {
        Args: {
          p_fipe: number;
          p_tipo_veiculo_id: string;
          p_plano_id?: string | null;
          p_avulsos_ids?: string[];
        };
        Returns: CotacaoPlano;
      };
      opcionais_elegibilidade: {
        Args: { p_veiculo_id: string };
        Returns: OpcionalElegibilidade[];
      };
      definir_faturamento_veiculo: {
        Args: { p_veiculo_id: string; p_tipo: TipoFaturamento };
        Returns: VeiculosRow;
      };
      gerar_faturas_cliente: {
        Args: { p_cliente_id: string; p_competencia: string; p_vencimento?: string | null };
        Returns: FaturasRow[];
      };
      gerar_faturas_competencia: {
        Args: { p_competencia: string; p_regional_id?: string | null };
        Returns: ResumoGeracaoFaturas[];
      };
      emitir_titulos_competencia: {
        Args: { p_competencia: string; p_regional_id?: string | null };
        Returns: ResumoEmissaoTitulos[];
      };
      emitir_titulo_fatura: {
        Args: { p_fatura_id: string };
        Returns: TitulosFinanceirosRow;
      };
      cancelar_fatura: {
        Args: { p_fatura_id: string };
        Returns: FaturasRow;
      };
      gerar_primeira_cobranca_veiculo: {
        Args: { p_veiculo_id: string; p_competencia?: string | null };
        Returns: FaturasRow[];
      };
      gerar_faturas_cliente_veiculos: {
        Args: {
          p_cliente_id: string;
          p_competencia: string;
          p_veiculo_ids?: string[] | null;
          p_vencimento?: string | null;
        };
        Returns: FaturasRow[];
      };
      gerar_faturas_periodo: {
        Args: {
          p_competencia_inicial: string;
          p_meses?: number;
          p_cliente_id?: string | null;
          p_veiculo_ids?: string[] | null;
          p_regional_id?: string | null;
        };
        Returns: ResumoPeriodoFaturas[];
      };
      listar_cobrancas: {
        Args: {
          p_inicio?: string | null;
          p_fim?: string | null;
          p_placa?: string | null;
          p_associado?: string | null;
          p_valor_min?: number | null;
          p_valor_max?: number | null;
          p_status?: StatusCobranca | null;
          p_regional_id?: string | null;
          p_limite?: number | null;
        };
        Returns: CobrancaLinha[];
      };
      resumo_cobrancas: {
        Args: { p_inicio?: string | null; p_fim?: string | null; p_regional_id?: string | null };
        Returns: ResumoCobrancas[];
      };
      titulos_para_remessa: {
        Args: { p_competencia?: string | null; p_regional_id?: string | null; p_limite?: number | null };
        Returns: TitulosFinanceirosRow[];
      };
      criar_remessa_cobranca: {
        Args: { p_titulo_ids: string[]; p_integracao_id?: string | null; p_referencia?: string | null };
        Returns: CobrancaRemessasRow;
      };
      marcar_remessa_enviada: {
        Args: { p_remessa_id: string };
        Returns: CobrancaRemessasRow;
      };
      registrar_retorno_cobranca: {
        Args: {
          p_titulo_id: string;
          p_gateway_id?: string | null;
          p_nosso_numero?: string | null;
          p_linha_digitavel?: string | null;
          p_url_boleto?: string | null;
          p_pix_copia_cola?: string | null;
          p_pix_qrcode_url?: string | null;
          p_erro?: string | null;
          p_retorno?: Json | null;
        };
        Returns: TitulosFinanceirosRow;
      };
      finalizar_remessa: {
        Args: { p_remessa_id: string };
        Returns: CobrancaRemessasRow;
      };
      elegibilidade_assistencia: {
        Args: { p_veiculo_id: string };
        Returns: ElegibilidadeAssistencia[];
      };
      situacao_assistencia_veiculo: {
        Args: { p_veiculo_id: string };
        Returns: SituacaoAssistencia[];
      };
      prestadores_do_servico: {
        Args: { p_servico_id: string };
        Returns: PrestadorDoServico[];
      };
      historico_assistencia_veiculo: {
        Args: { p_veiculo_id: string; p_limite?: number };
        Returns: HistoricoAssistencia[];
      };
      abrir_acionamento: {
        Args: {
          p_veiculo_id: string;
          p_servico_id: string;
          p_solicitante?: string | null;
          p_telefone?: string | null;
          p_origem?: Json;
          p_destino?: Json;
          p_km_previsto?: number | null;
          p_observacoes?: string | null;
          p_liberacao_justificativa?: string | null;
          p_atendimento_id?: string | null;
        };
        Returns: AcionamentosAssistenciaRow;
      };
      registrar_cotacao_assistencia: {
        Args: {
          p_acionamento_id: string;
          p_fornecedor_id: string;
          p_valor: number;
          p_valor_km?: number | null;
          p_prazo_min?: number | null;
          p_observacao?: string | null;
        };
        Returns: AcionamentoCotacoesRow;
      };
      definir_trajeto_acionamento: {
        Args: {
          p_acionamento_id: string;
          p_origem?: Json | null;
          p_destino?: Json | null;
          p_distancia_km?: number | null;
          p_duracao_min?: number | null;
          p_polyline?: string | null;
          p_km_excedente?: number | null;
          p_motivo?: string | null;
        };
        Returns: AcionamentosAssistenciaRow;
      };
      links_navegacao_acionamento: {
        Args: { p_acionamento_id: string };
        Returns: LinksNavegacaoOS[];
      };
      km_excedente_servico: {
        Args: { p_servico_id: string; p_distancia_km: number | null };
        Returns: number;
      };
      confirmar_prestador_assistencia: {
        Args: {
          p_acionamento_id: string;
          p_fornecedor_id: string;
          p_valor_servico: number;
          p_km_excedente?: number;
          p_valor_km?: number | null;
          p_prazo_min?: number | null;
        };
        Returns: AcionamentosAssistenciaRow;
      };
      concluir_acionamento: {
        Args: {
          p_acionamento_id: string;
          p_km_percorrido?: number | null;
          p_observacao?: string | null;
          p_vencimento?: string | null;
        };
        Returns: AcionamentosAssistenciaRow;
      };
      cancelar_acionamento: {
        Args: { p_acionamento_id: string; p_motivo: string };
        Returns: AcionamentosAssistenciaRow;
      };
      marcar_voucher_enviado: {
        Args: { p_acionamento_id: string };
        Returns: AcionamentosAssistenciaRow;
      };
      pode_assistencia: { Args: Record<string, never>; Returns: boolean };
      pode_liberar_assistencia: { Args: Record<string, never>; Returns: boolean };
      valor_mensalidade_veiculo: {
        Args: { p_veiculo_id: string };
        Returns: number;
      };
      calcular_vencimento: {
        Args: { p_competencia: string; p_dia: number | null };
        Returns: string;
      };
      opcionais_veiculo: {
        Args: { p_veiculo_id: string };
        Returns: OpcionalVeiculo[];
      };
      alertas_veiculo: {
        Args: { p_veiculo_id: string; p_incluir_resolvidos?: boolean };
        Returns: AlertaVeiculo[];
      };
      abrir_alerta_veiculo: {
        Args: { p_veiculo_id: string; p_tipo_alerta_id: string; p_mensagem?: string | null };
        Returns: VeiculoAlertasRow;
      };
      resolver_alerta_veiculo: {
        Args: { p_alerta_id: string; p_observacao?: string | null };
        Returns: VeiculoAlertasRow;
      };
      veiculos_do_cliente: {
        Args: { p_cliente_id: string };
        Returns: VeiculoDoCliente[];
      };
      titulos_do_cliente: {
        Args: { p_cliente_id: string; p_veiculo_id?: string | null; p_limite?: number };
        Returns: TituloCliente[];
      };
      ajustar_titulo: {
        Args: {
          p_titulo_id: string;
          p_vencimento?: string | null;
          p_desconto?: number | null;
          p_acrescimo?: number | null;
          p_observacao?: string | null;
        };
        Returns: TitulosFinanceirosRow;
      };
      reemitir_titulo: {
        Args: { p_titulo_id: string };
        Returns: TitulosFinanceirosRow;
      };
      abrir_protocolo: {
        Args: {
          p_cliente_id: string;
          p_tipo: TipoAtendimento;
          p_assunto?: string | null;
          p_descricao?: string | null;
          p_veiculo_id?: string | null;
          p_prioridade?: PrioridadeAtendimento;
          p_responsavel_id?: string | null;
          p_canal?: CanalAtendimento;
        };
        Returns: AtendimentosRow;
      };
      registrar_interacao_protocolo: {
        Args: { p_atendimento_id: string; p_mensagem: string; p_interno?: boolean };
        Returns: ProtocoloInteracoesRow;
      };
      transferir_atendimento: {
        Args: { p_atendimento_id: string; p_para_usuario: string; p_motivo?: string | null };
        Returns: AtendimentosRow;
      };
      alterar_status_protocolo: {
        Args: { p_atendimento_id: string; p_status: StatusAtendimento; p_mensagem?: string | null };
        Returns: AtendimentosRow;
      };
      encerrar_protocolo: {
        Args: { p_atendimento_id: string; p_solucao: string };
        Returns: AtendimentosRow;
      };
      listar_protocolos: {
        Args: {
          p_status?: string | null;
          p_responsavel?: string | null;
          p_busca?: string | null;
          p_prioridade?: PrioridadeAtendimento | null;
          p_regional_id?: string | null;
          p_limite?: number;
        };
        Returns: ProtocoloLinha[];
      };
      interacoes_protocolo: {
        Args: { p_atendimento_id: string };
        Returns: InteracaoProtocolo[];
      };
      resumo_protocolos: {
        Args: { p_regional_id?: string | null };
        Returns: ResumoProtocolos[];
      };
      abrir_atendimento: {
        Args: {
          p_veiculo_id: string;
          p_tipo: TipoAtendimento;
          p_canal?: CanalAtendimento;
          p_assunto?: string | null;
          p_descricao?: string | null;
          p_dados?: Json;
        };
        Returns: AtendimentosRow;
      };
      mover_lead_status: {
        Args: { p_lead_id: string; p_status: StatusKanban; p_obs?: string | null };
        Returns: LeadsRow;
      };
      leads_kanban: {
        Args: { p_regional_id?: string | null; p_consultor_id?: string | null; p_limite?: number };
        Returns: LeadKanban[];
      };
      registrar_interacao_lead: {
        Args: {
          p_lead_id: string;
          p_tipo: TipoInteracaoLead;
          p_resultado?: ResultadoInteracaoLead;
          p_observacao?: string | null;
          p_proximo_contato_em?: string | null;
          p_proximo_contato_nota?: string | null;
          p_limpar_agenda?: boolean;
        };
        Returns: LeadsRow;
      };
      agenda_vendas: {
        Args: { p_ate?: string | null; p_consultor_id?: string | null; p_limite?: number };
        Returns: LeadAgenda[];
      };
      pode_tratar_lead: {
        Args: { p_lead_id: string };
        Returns: boolean;
      };
      atualizar_cotacao: {
        Args: {
          p_cotacao_id: string;
          p_fipe?: number | null;
          p_tipo_veiculo_id?: string | null;
          p_cota_id?: string | null;
          p_plano_id?: string | null;
          p_opcionais_ids?: string[] | null;
          p_modo_envio?: string | null;
          p_desconto_percentual?: number | null;
          p_desconto_justificativa?: string | null;
        };
        Returns: CotacoesRow;
      };
      aplicar_desconto_cotacao: {
        Args: { p_cotacao_id: string; p_percentual: number; p_justificativa?: string | null };
        Returns: CotacoesRow;
      };
      simular_desconto_cotacao: {
        Args: { p_cotacao_id: string; p_percentual: number };
        Returns: SimulacaoDesconto[];
      };
      produtos_obrigatorios_cotacao: {
        Args: { p_tipo_veiculo_id: string; p_plano_id?: string | null; p_fipe?: number };
        Returns: ProdutoObrigatorio[];
      };
      limite_desconto_regional: { Args: { p_regional_id: string }; Returns: number };
      pode_aprovar_desconto: { Args: Record<string, never>; Returns: boolean };
      lead_em_negociacao: { Args: { p_lead_id: string }; Returns: boolean };
      // ---- 0034: rota de venda completa ----
      checklist_lead: {
        Args: { p_lead_id: string };
        Returns: ItemChecklistLead[];
      };
      lead_pronto_para_base: {
        Args: { p_lead_id: string };
        Returns: boolean;
      };
      regional_painel: {
        Args: { p_regional_id: string | null; p_inicio: string; p_fim: string };
        Returns: RegionalPainel[];
      };
      regional_desempenho_vendedores: {
        Args: { p_regional_id: string | null; p_inicio: string; p_fim: string };
        Returns: DesempenhoVendedor[];
      };
      regional_comissoes: {
        Args: { p_regional_id: string | null; p_status?: string | null; p_inicio?: string | null; p_fim?: string | null };
        Returns: ComissaoRegional[];
      };
      regional_leads: {
        Args: { p_regional_id: string | null; p_inicio?: string | null; p_fim?: string | null; p_somente_hotlink?: boolean };
        Returns: LeadRegional[];
      };
      classificar_captura: {
        Args: {
          p_regional_id: string | null; p_celular?: string | null;
          p_cpf_cnpj?: string | null; p_placa?: string | null;
        };
        Returns: ClassificacaoCaptura[];
      };
      classificar_captura_no_escopo: {
        Args: { p_celular?: string | null; p_cpf_cnpj?: string | null; p_placa?: string | null };
        Returns: AvisoCaptura[];
      };
      parametros_atribuicao: {
        Args: { p_regional_id: string | null };
        Returns: ParametrosAtribuicaoRow[];
      };
      protecao_lead_ativa: {
        Args: { p_lead_id: string };
        Returns: boolean;
      };
      atribuir_lead: {
        Args: {
          p_lead_id: string; p_vendedor_id: string | null;
          p_motivo: string; p_observacao?: string | null;
        };
        Returns: LeadsRow;
      };
      liberar_leads_sem_contato: {
        Args: { p_regional_id?: string | null };
        Returns: number;
      };
      registrar_contato_lead: {
        Args: { p_lead_id: string; p_obs?: string | null };
        Returns: undefined;
      };
      leads_sem_vendedor: {
        Args: { p_regional_id?: string | null };
        Returns: LeadSemVendedor[];
      };
      lead_por_token_publico: {
        Args: { p_token: string };
        Returns: {
          lead_id: string; nome: string; celular: string; email: string | null;
          cpf_cnpj: string | null; placa: string | null; regional_id: string | null;
          tipo_veiculo_id: string | null; valor_fipe: number | null; status: string;
          carteira: boolean; aceito: boolean; em_negociacao: boolean;
        }[];
      };
      registrar_aceite_venda: {
        Args: {
          p_lead_id: string; p_cotacao_id: string | null; p_por: string;
          p_nome: string; p_documento: string;
          p_ip?: string | null; p_user_agent?: string | null;
        };
        Returns: LeadsRow;
      };
      registrar_captura_hotlink: {
        Args: {
          p_codigo: string; p_nome: string; p_celular: string;
          p_email?: string | null; p_placa?: string | null; p_cpf_cnpj?: string | null;
        };
        Returns: {
          lead_id: string; tipo: string; vendedor_nome: string | null;
          mensagem: string; token_publico: string;
        }[];
      };
      portal_perfil: {
        Args: Record<string, never>;
        Returns: PortalPerfil[];
      };
      portal_veiculos: {
        Args: Record<string, never>;
        Returns: PortalVeiculo[];
      };
      portal_titulos: {
        Args: { p_limite?: number };
        Returns: PortalTitulo[];
      };
      portal_financeiro: {
        Args: Record<string, never>;
        Returns: PortalFinanceiro[];
      };
      portal_segunda_via: {
        Args: { p_titulo_id: string };
        Returns: PortalSegundaVia[];
      };
      portal_atualizar_perfil: {
        Args: { p_email?: string | null; p_telefone?: string | null; p_endereco?: Json | null };
        Returns: undefined;
      };
      portal_senha_trocada: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      portal_registrar_acesso: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      portal_cartoes: {
        Args: Record<string, never>;
        Returns: PortalCartao[];
      };
      portal_registrar_cartao: {
        Args: {
          p_token: string; p_bandeira?: string | null; p_ultimos_digitos?: string | null;
          p_nome_portador?: string | null; p_validade_mes?: number | null;
          p_validade_ano?: number | null; p_gateway?: string | null;
        };
        Returns: string;
      };
      portal_remover_cartao: {
        Args: { p_cartao_id: string };
        Returns: undefined;
      };
      fotos_vistoria_lead: {
        Args: { p_lead_id: string };
        Returns: FotoVistoriaModelo[];
      };
      produtos_do_plano: {
        Args: { p_plano_id: string };
        Returns: ProdutoDoPlano[];
      };
      vendedor_atual: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      vendedor_painel: {
        Args: { p_inicio: string; p_fim: string };
        Returns: VendedorPainel[];
      };
      vendedor_leads: {
        Args: { p_status?: string | null; p_busca?: string | null; p_limite?: number };
        Returns: LeadDoVendedor[];
      };
      vendedor_comissoes: {
        Args: { p_status?: string | null; p_inicio?: string | null; p_fim?: string | null };
        Returns: ComissaoDoVendedor[];
      };
      vendedor_perfil: {
        Args: Record<string, never>;
        Returns: PerfilVendedor[];
      };
      vendedor_criar_lead: {
        Args: {
          p_nome: string; p_celular: string;
          p_email?: string | null; p_placa?: string | null; p_observacao?: string | null;
        };
        Returns: string;
      };
      vendedor_atualizar_perfil: {
        Args: {
          p_telefone?: string | null; p_banco?: string | null; p_agencia?: string | null;
          p_conta?: string | null; p_chave_pix?: string | null;
        };
        Returns: undefined;
      };
      regional_financeiro_resumo: {
        Args: { p_regional_id: string | null; p_inicio: string; p_fim: string };
        Returns: ResumoFinanceiroRegional[];
      };
      regional_financeiro_titulos: {
        Args: {
          p_regional_id: string | null; p_inicio?: string | null; p_fim?: string | null;
          p_tipo?: string | null; p_situacao?: string | null;
        };
        Returns: TituloRegionalRow[];
      };
      regional_lancar_titulo: {
        Args: {
          p_regional_id: string | null; p_tipo: string; p_descricao: string;
          p_valor: number; p_vencimento: string;
          p_vendedor_id?: string | null; p_observacoes?: string | null;
        };
        Returns: string;
      };
      regional_baixar_titulo: {
        Args: {
          p_lancamento_id: string; p_data: string; p_valor: number;
          p_forma?: string | null; p_observacao?: string | null;
        };
        Returns: string;
      };
      regional_cancelar_titulo: {
        Args: { p_lancamento_id: string; p_motivo: string };
        Returns: undefined;
      };
      regional_repassar_comissao: {
        Args: { p_comissao_id: string };
        Returns: string;
      };
      resolver_hotlink: {
        Args: { p_codigo: string };
        Returns: { tipo: string; vendedor_id: string | null; regional_id: string | null; nome: string; consultor_id: string | null }[];
      };
      listar_vendedores: {
        Args: { p_regional_id?: string | null; p_busca?: string | null };
        Returns: VendedorLista[];
      };
      gerar_codigo_vendedor: {
        Args: { p_nome: string; p_ignorar?: string | null };
        Returns: string;
      };
      vendedor_por_codigo: {
        Args: { p_codigo: string };
        Returns: { id: string; nome: string; regional_id: string | null; ativo: boolean }[];
      };
      limite_comissao_regional: {
        Args: { p_regional_id: string };
        Returns: LimiteComissao[];
      };
      repassar_comissao_vendedor: {
        Args: { p_comissao_id: string };
        Returns: string;
      };
      autorizar_entrada_lead: {
        Args: { p_lead_id: string; p_cpf_cnpj?: string | null };
        Returns: string;
      };
      substituir_tabela_precos: {
        Args:
          | { p_tipo_veiculo: string; p_faixas: Json; p_participacoes: Json }
          | { p_tipo_veiculo: string; p_faixas: Json; p_participacoes: Json; p_adesoes: Json };
        Returns: undefined;
      };
    };
    Enums: {
      papel_usuario: PapelUsuario;
      status_evento: StatusEvento;
      status_titulo: StatusTitulo;
      status_cadastro: StatusCadastro;
    };
    CompositeTypes: { [_ in never]: never };
  };
};
