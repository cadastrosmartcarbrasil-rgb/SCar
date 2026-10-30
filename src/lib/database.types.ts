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
  // `cotador` existe no enum do Postgres (nao da para dropar valor) mas foi
  // APOSENTADO na 0077 e o banco o recusa por CHECK — fora daqui de proposito,
  // para o TS recusar junto.
  | 'admin' | 'gestor_regional' | 'consultor_vendas' | 'financeiro' | 'sinistro' | 'auditoria'
  | 'assistencia_24h' | 'supervisor' | 'cobranca';
export type TipoPessoa = 'PF' | 'PJ';
export type StatusCliente =
  | 'ativo' | 'inadimplente' | 'cancelado' | 'inativo' | 'suspenso' | 'excluido';
export type UsoVeiculo = 'passeio' | 'app' | 'comercial';
export type StatusVeiculo =
  | 'ativo' | 'suspenso' | 'baixado' | 'inativo' | 'excluido'
  | 'vistoria_pendente' | 'em_evento' | 'inadimplente';
export type TipoFaturamento = 'AGRUPADO_ASSOCIADO' | 'INDIVIDUAL_VEICULO';
export type StatusFatura = 'ABERTA' | 'PAGA' | 'CANCELADA';
export type TipoAtendimento =
  | 'SINISTRO' | 'ASSISTENCIA_24H' | 'UPGRADE_COBERTURA'
  | 'SEGUNDA_VIA_BOLETO' | 'VISTORIA_ACESSORIOS' | 'ALTERACAO_CADASTRAL' | 'CANCELAMENTO'
  // 0029: categorias da Central de Protocolos
  | 'FINANCEIRO' | 'DUVIDAS' | 'RECLAMACAO' | 'OUTROS';
export type PrioridadeAtendimento = 'BAIXA' | 'NORMAL' | 'ALTA' | 'URGENTE';
export type TipoInteracaoProtocolo =
  | 'COMENTARIO' | 'STATUS' | 'TRANSFERENCIA' | 'ENCERRAMENTO'
  // 0059: o pedido de parecer e a resposta dele
  | 'PARECER_SOLICITADO' | 'PARECER';
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
  | 'FOTO_AVARIA' | 'BOLETIM_OCORRENCIA' | 'CNH' | 'CRLV' | 'NOTA_FISCAL'
  | 'FOTO_VEICULO' | 'FOTO_LOCAL' | 'CROQUI' | 'OUTRO';
export type StatusCotacao = 'EM_ABERTO' | 'APROVADA' | 'REJEITADA';
export type CodigoTemplate = 'BOAS_VINDAS' | 'LEMBRETE_BOLETO' | 'NOVO_EVENTO';
export type ProvedorBanco = 'ASAAS' | 'PJBANK' | 'CORA' | 'INTER' | 'GERENCIANET' | 'SICREDI' | 'OUTRO';
export type AmbienteIntegracao = 'sandbox' | 'producao';
export type CanalComunicacao = 'EMAIL' | 'SMS' | 'WHATSAPP';
export type StatusComunicacao = 'pendente' | 'enviado' | 'falha';
export type EnvolvidoTipo = 'ASSOCIADO' | 'TERCEIRO';
export type TipoEnvolvimento = 'CAUSADOR' | 'VITIMA';
export type TipoReparo = 'PROPRIO' | 'TERCEIRO';
// 0103 — tratativa do terceiro envolvido no evento
export type StatusTerceiro =
  | 'EM_ANALISE'
  | 'AGUARDANDO_DOCUMENTOS'
  | 'EM_REPARO'
  | 'ACORDO'
  | 'INDENIZADO'
  | 'NEGADO'
  | 'ENCERRADO';
export type MetodoPreco = 'FAIXA_FIPE' | 'FIXO' | 'PERCENTUAL_FIPE';
export type TipoValorFaixa = 'VALOR' | 'PERCENTUAL';
export type MandatoStatus = 'VIGENTE' | 'EXPIRADO' | 'EM_RENOVACAO';
export type StatusLancamento = 'pendente' | 'pago_parcial' | 'quitado' | 'cancelado' | 'atrasado';
export type FormaPagamento = 'PIX' | 'BOLETO' | 'TRANSFERENCIA' | 'CARTAO' | 'DINHEIRO';
export type StatusConciliacao = 'NAO_CONCILIADO' | 'CONCILIADO_MANUAL' | 'CONCILIADO_API';
export type StatusCadastro = 'ATIVO' | 'INATIVO' | 'SUSPENSO';
export type StatusLead =
  | 'NOVO' | 'ORCAMENTO_GERADO' | 'PROPOSTA_ENVIADA' | 'EM_NEGOCIACAO' | 'AGUARDANDO_VISTORIA'
  | 'APROVADO' | 'EM_AUDITORIA' | 'ATIVO' | 'PERDIDO';
// Status que o Kanban pode aplicar via drag-and-drop (0028). ORCAMENTO_GERADO
// saiu da esteira na 0161 (o enum nao perde valor; o funil recusa).
export type StatusKanban = Exclude<StatusLead, 'EM_AUDITORIA' | 'ATIVO' | 'ORCAMENTO_GERADO'>;
export type OrigemFipe = 'API' | 'MANUAL' | 'CONTINGENCIA';
// 0045 :: agenda de vendas (interacoes do lead)
export type TipoInteracaoLead = 'LIGACAO' | 'WHATSAPP' | 'EMAIL' | 'VISITA' | 'OBSERVACAO';
export type ResultadoInteracaoLead = 'FALOU' | 'NAO_ATENDEU' | 'AGENDOU' | 'SEM_INTERESSE';
// 0026 :: Assistencia 24h
export type StatusAcionamento =
  | 'ABERTO' | 'EM_COTACAO' | 'AUTORIZADO' | 'EM_ATENDIMENTO' | 'CONCLUIDO' | 'CANCELADO' | 'NEGADO';

/** 0134: por que o pedido de assistencia foi negado. */
export type MotivoNegativaAcionamento =
  | 'LIMITE_ATINGIDO' | 'INADIMPLENCIA' | 'VEICULO_INATIVO' | 'PENDENCIA_CADASTRAL'
  | 'SEM_COBERTURA' | 'FORA_DA_AREA' | 'OUTRO';

// ---- Helper para linhas com timestamps ------------------------------------
type Timestamps = {
  created_at: string;
  updated_at: string;
};

type Insert<T> = Partial<T>;
type Update<T> = Partial<T>;

// ---- Tabelas (Row) ---------------------------------------------------------
/** Uma linha de `regionais_listar` (0067). */
export type RegionalListada = {
  id: string;
  nome: string;
  codigo: string | null;
  cnpj: string | null;
  telefone: string | null;
  email: string | null;
  cidade: string | null;
  uf: string | null;
  ativo: boolean;
  inativada_em: string | null;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  usuarios: number;
  vendedores: number;
  vendedores_ativos: number;
  associados: number;
  veiculos: number;
  veiculos_ativos: number;
  leads: number;
  lancamentos: number;
  pode_excluir: boolean;
};

export type RegionaisRow = Timestamps & {
  id: string;
  nome: string;
  cnpj: string | null;
  endereco: Json;
  responsavel_id: string | null;
  // 0028: politica de desconto da franquia/regional
  percentual_maximo_desconto_venda: number;
  desconto_observacao: string | null;
  /** 0158 — a unidade paga a Assistencia Profissional aos consultores, entre min e max. */
  paga_assistencia_profissional: boolean;
  assistencia_profissional_min: number;
  assistencia_profissional_max: number;
  taxa_comissao_adesao: number;
  taxa_comissao_recorrente: number;
  dia_pagto_entrada_padrao: number | null;
  dia_pagto_recorrencia_padrao: number | null;
  codigo: string | null;
  // 0041 — regras de atribuicao do lead
  dias_protecao_lead: number;
  dias_sem_contato_lead: number;
  distribuicao_lead: string;
  // 0067 — contato e situacao da unidade
  telefone: string | null;
  email: string | null;
  ativo: boolean;
  inativada_em: string | null;
};

export type UsuariosRow = Timestamps & {
  id: string;
  nome: string;
  email: string;
  papel: PapelUsuario;
  regional_id: string | null;
  ativo: boolean;
  // 0068 — a ficha de quem responde pelo que faz no sistema
  telefone: string | null;
  documento: string | null;
  /** funcao na empresa; NAO confundir com `papel`, que e permissao */
  cargo: string | null;
  data_inicio: string | null;
  data_desligamento: string | null;
  observacoes: string | null;
  /** perfil personalizado (0130); com ele, `papel` e o papel de base */
  perfil_id?: string | null;
};

/** 0130: perfil criado pelo admin (nome + papel de base + grade propria). */
export type PerfisAcessoRow = {
  id: string;
  nome: string;
  descricao: string | null;
  papel_base: string;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
};

/** Uma linha de `usuarios_listar` (0068). */
export type UsuarioListado = {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  documento: string | null;
  cargo: string | null;
  papel: PapelUsuario;
  regional_id: string | null;
  regional_nome: string | null;
  ativo: boolean;
  data_inicio: string | null;
  data_desligamento: string | null;
  observacoes: string | null;
  criado_em: string;
  vendedor_id: string | null;
  vendedor_codigo: string | null;
  vendedor_ativo: boolean | null;
  /** por quantas unidades esta pessoa responde (`regionais.responsavel_id`) */
  responsavel_por: number;
  perfil_id: string | null;
  perfil_nome: string | null;
  /** unidades de atuacao marcadas (supervisor_regionais, 0131) */
  unidades_atuacao: number;
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
  /** 0088 — plano SEM protecao de casco: cotar_plano tira o casco obrigatorio. */
  sem_casco: boolean;
  /** 0160 — desconto (%) sobre os PRODUTOS obrigatorios da base (Taxa Adm, 24h, Casco). */
  desconto_base_percentual: number;
  /** 0160 — multiplica a participacao/franquia (2 = o dobro). */
  multiplicador_participacao: number;
};

export type VeiculosRow = Timestamps & {
  /** 0081 — o adicional carimbado na ENTRADA. O faturamento usa este, nao o cadastro. */
  valor_adicional_regional: number;
  regional_preco_id: string | null;
  /** 0158 — Assistencia Profissional carimbada (o override ja a inclui). */
  valor_assistencia_profissional: number;
  /** 0082 — a mensalidade e cobrada FORA do SCar. Nao e bloqueio: so nao gera fatura aqui. */
  cobranca_externa: boolean;
  cobranca_externa_desde: string | null;
  id: string;
  cliente_id: string;
  /** 0136 — NULL so no 0 km (placa pendente): `zero_km` E chassi (chk_veiculo_identidade). */
  placa: string | null;
  /** 0136 — veiculo 0 km / placa pendente. Fica true como historico quando a placa chega. */
  zero_km: boolean;
  /** 0144 — data do pedido de cancelamento; sem evento nem 24h a partir dela. Limpa ao reativar. */
  cancelado_em: string | null;
  chassi: string | null;
  renavam: string | null;
  numero_motor: string | null;
  marca: string | null;
  modelo: string | null;
  ano_fabricacao: number | null;
  ano_modelo: number | null;
  cor: string | null;
  cor_id: string | null;
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
  // Dia em que o veiculo deixou a base (0078). Nulo = esta na carteira.
  data_saida: string | null;
  tipo_faturamento: TipoFaturamento;
  alienado: boolean;
  alienado_financeira: string | null;
  numero_portas: number | null;
  valor_mensalidade: number | null;
  dia_vencimento: number | null;
  /** 0161 — inicio da cobertura (entrada pela venda + 24h). Nulo = sem carencia. */
  cobertura_desde: string | null;
  rastreador_imei: string | null;
  rastreador_chip: string | null;
  empresa_rastreamento_id: string | null;
  status_desde: string | null;
  status_motivo: string | null;
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

export type StatusRastreador =
  | 'DISPONIVEL' | 'ATIVO' | 'INADIMPLENTE' | 'INATIVO' | 'A_DEVOLVER'
  | 'COBRAR_RASTREADOR' | 'BOLETO_GERADO' | 'PENDENCIA_DADOS' | 'MANUTENCAO'
  | 'DUPLICADO' | 'BAIXADO';

export type RastreadoresRow = Timestamps & {
  id: string;
  imei: string;
  numero_serie: string | null;
  iccid: string | null;
  linha: string | null;
  operadora: string | null;
  modelo: string | null;
  fabricante: string | null;
  empresa_rastreamento_id: string | null;
  regional_id: string | null;
  status: StatusRastreador;
  veiculo_id: string | null;
  cliente_id: string | null;
  data_aquisicao: string | null;
  valor_aquisicao: number | null;
  nota_fiscal: string | null;
  data_instalacao: string | null;
  data_desinstalacao: string | null;
  local_instalacao: string | null;
  instalador: string | null;
  observacoes: string | null;
  status_desde: string;
  ultima_comunicacao: string | null;
  ultima_posicao: Json | null;
  created_by: string | null;
  updated_by: string | null;
};

export type RastreadorEventosRow = {
  id: string;
  rastreador_id: string;
  tipo: string;
  status_anterior: StatusRastreador | null;
  status_novo: StatusRastreador | null;
  veiculo_anterior_id: string | null;
  veiculo_novo_id: string | null;
  regional_anterior_id: string | null;
  regional_nova_id: string | null;
  descricao: string | null;
  payload: Json;
  usuario_id: string | null;
  created_at: string;
};

export type RastreadorManutencoesRow = {
  id: string;
  rastreador_id: string;
  aberta_em: string;
  fechada_em: string | null;
  defeito: string | null;
  solucao: string | null;
  custo: number | null;
  fornecedor_id: string | null;
  fornecedor: string | null;
  status: 'ABERTA' | 'CONCLUIDA' | 'SEM_REPARO';
  aberta_por: string | null;
  fechada_por: string | null;
};

/** Linha de `rastreadores_listar` (0050). */
export type RastreadorLista = {
  id: string;
  imei: string;
  numero_serie: string | null;
  linha: string | null;
  iccid: string | null;
  operadora: string | null;
  modelo: string | null;
  fabricante: string | null;
  status: StatusRastreador;
  status_numero: number;
  status_desde: string;
  dias_no_status: number;
  regional_id: string | null;
  regional: string | null;
  empresa_rastreamento_id: string | null;
  plataforma: string | null;
  veiculo_id: string | null;
  placa: string | null;
  veiculo: string | null;
  cliente_id: string | null;
  associado: string | null;
  data_instalacao: string | null;
  local_instalacao: string | null;
  instalador: string | null;
  total_registros: number;
};

/** Linha de `rastreador_ficha` (0050). */
export type RastreadorFicha = {
  id: string;
  imei: string;
  numero_serie: string | null;
  iccid: string | null;
  linha: string | null;
  operadora: string | null;
  modelo: string | null;
  fabricante: string | null;
  status: StatusRastreador;
  status_numero: number;
  status_desde: string;
  dias_no_status: number;
  regional_id: string | null;
  regional: string | null;
  empresa_rastreamento_id: string | null;
  plataforma: string | null;
  plataforma_url: string | null;
  custo_mensal: number | null;
  veiculo_id: string | null;
  placa: string | null;
  veiculo: string | null;
  cliente_id: string | null;
  associado: string | null;
  associado_documento: string | null;
  data_aquisicao: string | null;
  valor_aquisicao: number | null;
  nota_fiscal: string | null;
  data_instalacao: string | null;
  data_desinstalacao: string | null;
  local_instalacao: string | null;
  instalador: string | null;
  observacoes: string | null;
  manutencao_aberta_id: string | null;
  pode_editar: boolean;
};

export type RastreadorEvento = {
  id: string;
  tipo: string;
  status_anterior: StatusRastreador | null;
  status_novo: StatusRastreador | null;
  veiculo_anterior: string | null;
  veiculo_novo: string | null;
  regional_anterior: string | null;
  regional_nova: string | null;
  descricao: string | null;
  autor: string | null;
  created_at: string;
};

export type RastreadorDivergencia = {
  tipo: string;
  severidade: 'ALTA' | 'MEDIA' | 'BAIXA';
  rastreador_id: string | null;
  imei: string | null;
  veiculo_id: string | null;
  placa: string | null;
  cliente_id: string | null;
  associado: string | null;
  regional_id: string | null;
  regional: string | null;
  descricao: string;
};

export type RastreadoresResumo = {
  total: number;
  ativos: number;
  estoque: number;
  por_status: { status: StatusRastreador; numero: number; quantidade: number }[];
  por_regional: { regional_id: string | null; regional: string; total: number; ativos: number; estoque: number }[];
  por_plataforma: { plataforma_id: string | null; plataforma: string; total: number; ativos: number; custo_mensal: number }[];
};

export type RastreadorARecuperar = {
  rastreador_id: string;
  imei: string;
  status: StatusRastreador;
  status_numero: number;
  dias_no_status: number;
  regional: string | null;
  plataforma: string | null;
  placa: string | null;
  associado: string | null;
  documento: string | null;
  telefone: string | null;
  celular: string | null;
  ultima_instalacao: string | null;
};

// ---- 0055: mural interno (memos) -------------------------------------------
export type MemosRow = Timestamps & {
  id: string;
  titulo: string;
  mensagem: string;
  categoria: string;
  prioridade: string;
  exige_leitura: boolean;
  publicado: boolean;
  regional_id: string | null;
  papeis: string[] | null;
  expira_em: string | null;
  publicado_por: string | null;
  publicado_em: string;
};
export type MemoLeiturasRow = {
  memo_id: string;
  usuario_id: string;
  lido_em: string;
};
/** Linha de `memos_do_usuario` — o mural do atendente. */
export type MemoDoUsuario = {
  id: string;
  titulo: string;
  mensagem: string;
  categoria: string;
  prioridade: string;
  exige_leitura: boolean;
  publicado_em: string;
  expira_em: string | null;
  autor: string | null;
  regional: string | null;
  lido: boolean;
  lido_em: string | null;
  pendente_ciencia: boolean;
  /** 0057: para quem foi, e se fui EU que publiquei (o autor ve o proprio memo) */
  papeis: string[] | null;
  meu: boolean;
  /** 0058: a conversa deste comunicado (a minha; a soma de todas, para quem publicou) */
  respostas: number;
  respostas_nao_lidas: number;
};
/** Linha de `memos_gestao` — com o acompanhamento da ciencia. */
export type MemoGestao = MemoDoUsuario & {
  publicado: boolean;
  regional_id: string | null;
  leituras: number;
  destinatarios: number;
  /** 0056: fui EU que publiquei (a franquia acompanha o que enviou) */
  meu: boolean;
  /** 0058: quantas pessoas responderam (uma conversa por destinatario) */
  conversas: number;
};
export type MemoRespostasRow = {
  id: string;
  memo_id: string;
  com_usuario_id: string;
  autor_id: string;
  mensagem: string;
  lida_em: string | null;
  created_at: string;
};
/** Linha de `memo_conversas` — um papo por destinatario. */
export type MemoConversa = {
  com_usuario_id: string;
  pessoa: string;
  papel: string | null;
  unidade: string | null;
  mensagens: number;
  nao_lidas: number;
  ultima_mensagem: string | null;
  ultima_em: string;
  ultima_minha: boolean;
};
/** Linha de `memo_mensagens` — o texto trocado dentro de uma conversa. */
export type MemoMensagem = {
  id: string;
  autor_id: string;
  autor: string;
  minha: boolean;
  mensagem: string;
  lida_em: string | null;
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
  // 0076 — capacidade do link publico (ver a migration)
  token_publico: string | null;
  token_expira_em: string | null;
};
export type VistoriaAnexosRow = {
  id: string;
  vistoria_id: string;
  url: string;
  tipo: string | null;
  descricao: string | null;
  created_at: string;
  // 0047 — peso do arquivo (teto de 10 MB no banco) e quem enviou
  tamanho_bytes: number | null;
  enviado_por: string | null;
  // 0076 — a foto veio pelo link do cliente? A Auditoria precisa da origem.
  enviado_pelo_cliente: boolean;
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
  /** 0059: quando esta interacao RESPONDE outra (parecer -> pedido de parecer) */
  responde_a: string | null;
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
  /** 0059: de que EVENTO este protocolo veio, e quantos pareceres faltam */
  evento_id: string | null;
  pareceres_pendentes: number;
};

/** Linha de `pareceres_protocolo` — pedido de parecer e a resposta dele. */
export type ParecerProtocolo = {
  pedido_id: string;
  pergunta: string | null;
  pedido_por: string;
  para_id: string | null;
  para: string | null;
  pedido_em: string;
  respondido: boolean;
  parecer: string | null;
  respondido_por: string | null;
  respondido_em: string | null;
  dias_esperando: number;
};
/** Linha de `meus_pareceres_pendentes` — o que esperam de MIM. */
export type ParecerPendente = {
  pedido_id: string;
  atendimento_id: string;
  protocolo: string | null;
  evento_id: string | null;
  assunto: string | null;
  associado: string;
  placa: string | null;
  pergunta: string | null;
  pedido_por: string;
  pedido_em: string;
  dias_esperando: number;
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
  placa: string | null;
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
  /** Anexada pela rota do SAC (nao vem da RPC): separa cobertura de taxa. */
  categoria?: string | null;
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
  /** 0099: SCAR (titulos_financeiros) ou MUTUAL (boletos_historico, so consulta). Ausente = SCAR. */
  origem?: 'SCAR' | 'MUTUAL';
  url_pagamento?: string | null;
  em_serasa?: boolean;
};

// ---------------------------------------------------------------------------
// REVISTORIA DO BOLETO VENCIDO (0137)
// ---------------------------------------------------------------------------
export type SituacaoRevistoria =
  | 'AGUARDANDO' | 'EM_ANALISE' | 'APROVADA' | 'DISPENSADA' | 'UTILIZADA' | 'CANCELADA' | 'EXPIRADA';

export type RevistoriaExigida = {
  veiculo_id: string;
  placa: string | null;
  chassi: string | null;
  modelo: string | null;
  dias_atraso: number;
  vencimento: string;
  revistoria_id: string | null;
  situacao: SituacaoRevistoria | null;
  token: string | null;
  token_expira_em: string | null;
  motivo_reprovacao: string | null;
  liberada: boolean;
};

export type RevistoriaSolicitada = {
  revistoria_id: string;
  token: string;
  expira_em: string;
  situacao: SituacaoRevistoria;
  reaproveitada: boolean;
};

export type RevistoriaPublica = {
  valida: boolean;
  motivo: 'OK' | 'LINK_INVALIDO' | 'LINK_EXPIRADO' | 'EM_ANALISE' | 'APROVADA' | 'ENCERRADA';
  revistoria_id: string | null;
  situacao: SituacaoRevistoria | null;
  nome: string | null;
  placa: string | null;
  chassi: string | null;
  marca: string | null;
  modelo: string | null;
  expira_em: string | null;
  motivo_reprovacao: string | null;
  reprovacoes: number;
};

export type RevistoriaItemPublico = {
  codigo: string;
  nome: string;
  instrucao: string | null;
  midia: 'FOTO' | 'VIDEO';
  obrigatorio: boolean;
  ordem: number;
  enviado: boolean;
  enviado_em: string | null;
  duracao_segundos: number | null;
};

export type RevistoriaLinha = {
  id: string;
  situacao: SituacaoRevistoria;
  origem: 'MANUAL' | 'ROTINA';
  cliente_id: string;
  associado: string;
  cpf_cnpj: string | null;
  celular: string | null;
  veiculo_id: string;
  placa: string | null;
  chassi: string | null;
  modelo: string | null;
  regional: string | null;
  dias_atraso: number | null;
  vencimento_referencia: string | null;
  created_at: string;
  enviado_em: string | null;
  analisado_em: string | null;
  analisado_por_nome: string | null;
  reprovacoes: number;
  motivo_reprovacao: string | null;
  token: string;
  token_expira_em: string;
  dispensa_justificativa: string | null;
  renegociacao_id: string | null;
};

export type RevistoriaMidia = {
  grupo: 'ATUAL' | 'ANTERIOR';
  anexo_id: string;
  codigo: string;
  nome: string;
  midia: 'FOTO' | 'VIDEO';
  url: string;
  enviado_em: string;
  tamanho_bytes: number | null;
  duracao_segundos: number | null;
  rodada_atual: boolean;
};

export type RevistoriaASolicitar = {
  cliente_id: string;
  associado: string;
  cpf_cnpj: string | null;
  celular: string | null;
  veiculo_id: string;
  placa: string | null;
  chassi: string | null;
  modelo: string | null;
  regional: string | null;
  dias_atraso: number;
  vencimento: string;
  valor_vencido: number;
};

// Boleto do Mutual no historico do SAC (RPC boletos_mutual_do_cliente, 0099)
export type BoletoMutualCliente = {
  id: string;
  veiculo_id: string | null;
  placa: string | null;
  competencia: string | null;
  data_vencimento: string;
  valor: number;
  valor_pago: number | null;
  data_pagamento: string | null;
  status: string;
  dias_atraso: number;
  em_serasa: boolean;
  linha_digitavel: string | null;
  url_boleto: string | null;
  url_pagamento: string | null;
};

// Historico de eventos do Mutual (0101) — so consulta, NUNCA eventos_sinistro
export type EventoMutualCliente = {
  id: string;
  veiculo_id: string | null;
  placa: string | null;
  protocolo: string | null;
  data_evento: string | null;
  data_conclusao: string | null;
  tipos: string[];
  envolvimento: string | null;
  valor_total: number | null;
  status_origem: string | null;
};
export type EventoHistoricoLinha = EventoMutualCliente & {
  cliente_id: string;
  associado: string;
  unidade: string | null;
  /** 0112: o evento do Kanban criado a partir deste historico (nulo = nao levado). */
  evento_id: string | null;
  evento_protocolo: string | null;
  evento_status: string | null;
  total_registros: number;
};
export type TransporteEventoHistorico = {
  historico_id: string;
  evento_id: string | null;
  numero_protocolo: string | null;
  situacao: string;
  motivo: string | null;
};
export type EventosHistoricoResumo = {
  eventos: number;
  associados: number;
  veiculos: number;
  sem_veiculo: number;
  primeiro_evento: string | null;
  ultimo_evento: string | null;
  capturados: number;
  ultima_captura: string | null;
  ultima_importacao: string | null;
};
export type ImportacaoEventosHistorico = {
  lidos: number;
  importaveis: number;
  sem_associado: number;
  sem_veiculo_na_base: number;
  data_invalida: number;
  gravados: number;
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

/** 0081 — uma linha por regional no painel de Precificacao -> Tabela. */
export type AdicionalRiscoLinha = {
  regional_id: string;
  regional_nome: string;
  regional_ativa: boolean;
  adicional_id: string | null;
  valor: number | null;
  justificativa: string | null;
  vigencia_inicio: string | null;
  vigencia_fim: string | null;
  veiculos: number;
};

/** 0081 — vendeu uma unidade, o associado e de outra. */
export type DivergenciaRegionalPreco = {
  regional_preco_id: string | null;
  regional_preco_nome: string | null;
  regional_lead_id: string | null;
  regional_lead_nome: string | null;
  divergente: boolean;
};

export type RegionalAdicionalRiscoRow = {
  id: string;
  regional_id: string;
  tipo_veiculo_id: string;
  valor: number;
  justificativa: string | null;
  vigencia_inicio: string;
  vigencia_fim: string | null;
  status: boolean;
  created_at: string;
  created_by: string | null;
};

/** 0040/0161 — as poses da vistoria (Configuracoes -> Fotos da vistoria). */
export type VistoriaFotoModeloRow = {
  id: string;
  codigo: string;
  nome: string;
  instrucao: string | null;
  obrigatorio: boolean;
  ordem: number;
  tipo_veiculo_id: string | null;
  ativo: boolean;
  created_at: string;
};

export type CoresRow = {
  id: string;
  nome: string;
  hex: string | null;
  ordem: number;
  ativo: boolean;
  created_at: string;
  updated_at: string;
};

/** 0080 — o catalogo para a tela, com apelidos e o uso de cada cor. */
export type CorListada = {
  id: string;
  nome: string;
  hex: string | null;
  ordem: number;
  ativo: boolean;
  apelidos: string[];
  veiculos: number;
  leads: number;
};

/** 0080 — a fila de trabalho: o texto que o catalogo nao reconheceu. */
export type CorNaoReconhecida = {
  cor: string;
  veiculos: number;
  leads: number;
  total: number;
};

/** 0080 — a cor do Mutual que o nosso catalogo ainda nao sabe ler. */
export type MutualCorNaoMapeada = {
  id_externo: string;
  descricao: string | null;
  situacao: string;
};

export type CorApelidosRow = {
  id: string;
  cor_id: string;
  apelido: string;
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
  // GERADAS pelo banco (0079) — alimentam a busca da Lista de /vendas. Nunca
  // enviar em insert/update: o Postgres recusa escrita em coluna gerada.
  busca_texto: string;
  busca_digitos: string;
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
  numero_motor: string | null;
  cor: string | null;
  cor_id: string | null;
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
  /** 0081 — quem precificou e quanto foi o adicional, congelados. */
  regional_id: string | null;
  valor_adicional_regional: number;
  /** 0158 — interna: fora do desconto, entra em total_com_desconto, nunca e item. */
  valor_assistencia_profissional: number;
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
  categoria?: string | null;
  /** 0160 — item com desconto do plano: o valor de tabela e o desconto. */
  valor_tabela?: number;
  desconto_plano?: number;
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
  /** Nulo nas contas de balanco (0152). */
  tipo: TipoCategoriaDre | null;
  ativo: boolean;
  created_at: string;
  /** Plano padrao (0152): analitica recebe lancamento, sintetica so agrupa. */
  analitica: boolean;
  natureza: string | null;
  destino: string | null;
  /** Alimentada pelo sistema (disponibilidades, receber, pagar): sem lancamento direto. */
  automatica: boolean;
  codigo_anterior: string | null;
};

export type PlanoContasMigracaoRow = {
  id: number;
  categoria_id: string | null;
  codigo_antigo: string | null;
  nome_antigo: string | null;
  codigo_novo: string | null;
  nome_novo: string | null;
  acao: 'RECODIFICADA' | 'CRIADA' | 'JA_EXISTIA' | 'SEM_CORRESPONDENCIA';
  lancamentos: number;
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
  /** 0146: dia do credito do pagamento do banco (nulo = baixa manual). */
  data_credito?: string | null;
  gateway_erro: string | null;
  enviado_em: string | null;
  // 0029: ajuste do boleto em aberto (SAC)
  valor_original: number | null;
  desconto: number;
  acrescimo: number;
  observacao: string | null;
  alterado_por: string | null;
  alterado_em: string | null;
  // 0121: boleto novo de 2a via / acordo (sem fatura)
  renegociacao_id?: string | null;
  renegociacao_parcela?: number | null;
  /** 0145: boleto da TAXA DE ADESAO desta venda (lead). */
  adesao_lead_id?: string | null;
  // 0150 — boleto AVULSO do SAC (o tipo)
  tipo_avulso_id?: string | null;
};

// 0121: renegociacao (2a via vencida / acordo) — boleto novo do SCar + baixa dos originais
export type BoletoRenegociacao = {
  id: string;
  parcela: number;
  vencimento: string;
  valor: number;
  status: string;
  linha_digitavel: string | null;
  pix_copia_cola: string | null;
  nosso_numero: string | null;
  gateway_erro: string | null;
};
export type OrigemRenegociacao = {
  id: string;
  origem: 'MUTUAL' | 'SCAR';
  ref: string;
  vencimento: string;
  valor: number;
  nosso_numero: string | null;
  baixa_status: 'PENDENTE' | 'BAIXADO' | 'ERRO' | 'SEM_REGISTRO';
  baixa_erro: string | null;
};
export type RenegociacaoCliente = {
  id: string;
  tipo: 'SEGUNDA_VIA' | 'ACORDO' | 'PRO_RATA' | 'AVULSO' | 'CANCELAMENTO';
  situacao: 'EMITINDO' | 'EMITIDA' | 'ERRO';
  erro: string | null;
  valor_original: number;
  valor_total: number;
  observacao: string | null;
  acordo_id: string | null;
  criado_por: string | null;
  created_at: string;
  boletos: BoletoRenegociacao[];
  origens: OrigemRenegociacao[];
};

// 0144: pro-rata pela data de vencimento do veiculo (ciclo pos-pago)
export type ProRataVeiculo = {
  valor_mensal: number;
  dia_vencimento: number;
  ciclo_inicio: string;
  ciclo_fim: string;
  vencimento_ciclo: string;
  desde: string;
  ate: string;
  dias_ciclo: number;
  dias_usados: number;
  valor: number;
};

// 0144: o cancelamento do veiculo (trilha)
export type CancelamentoVeiculo = {
  id: string;
  data_cancelamento: string;
  motivo: string;
  previsao_retorno: boolean;
  data_retorno: string | null;
  status_anterior: string;
  cobranca_externa: boolean;
  pro_rata: ProRataVeiculo | null;
  lead_retorno_id: string | null;
  renegociacao_id: string | null;
  renegociacao_situacao: 'EMITINDO' | 'EMITIDA' | 'ERRO' | null;
  faturas_ajustadas: number;
  observacao: string | null;
  criado_por: string | null;
  created_at: string;
  reativado_em: string | null;
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

/** 0147: previa/resultado do lote da cobranca de um item do extrato. */
export type LoteCobrancaExtrato = {
  quantidade: number;
  soma: number;
  valor_extrato: number;
  diferenca: number;
  quantidade_extrato: number | null;
  confere: boolean;
};

// Trilha da baixa bancaria (0105)
export type SituacaoLiquidacaoBanco = 'BAIXADO' | 'JA_PAGO' | 'NAO_ENCONTRADO' | 'TITULO_CANCELADO';
export type CobrancaLiquidacoesRow = Timestamps & {
  id: string;
  provedor: ProvedorBanco;
  ambiente: 'sandbox' | 'producao';
  nosso_numero: string;
  seu_numero: string | null;
  data_pagamento: string;
  valor_pago: number | null;
  titulo_id: string | null;
  /** 0117: boleto do Mutual que o pagamento casou (pelo nosso numero da linha digitavel). */
  boleto_historico_id: string | null;
  /** 0117: recebimento criado no financeiro para esse boleto. */
  lancamento_id: string | null;
  situacao: SituacaoLiquidacaoBanco;
  valor_divergente: boolean;
  dia_consultado: string;
  payload: Json | null;
  /** 0146: PIX | COMPE | REDE (do liquidados/dia). */
  tipo_liquidacao: string | null;
  /** 0146: dia do credito na conta (PIX no dia; COMPE/REDE no proximo dia util). */
  data_credito: string | null;
};

/** 0122: aviso do banco (webhook) que ainda nao apareceu em liquidados/dia. */
export type SituacaoAvisoBanco = 'AGUARDANDO' | 'CONFIRMADO' | 'EXPIRADO';
export type CobrancaAvisosBancoRow = Timestamps & {
  id: string;
  provedor: ProvedorBanco;
  ambiente: 'sandbox' | 'producao';
  nosso_numero: string;
  movimento: string | null;
  data_aviso: string | null;
  previsao_credito: string | null;
  payload: Json | null;
  situacao: SituacaoAvisoBanco;
  tentativas: number;
  ultima_tentativa_em: string | null;
  confirmado_em: string | null;
  recebido_em: string;
};

/** 0123: termos (modelos, versoes, emitidos). */
export type TermoModeloRow = Timestamps & {
  id: string;
  nome: string;
  tipo: string;
  descricao: string | null;
  escopo: 'ASSOCIADO' | 'GERAL';
  rascunho_html: string;
  plano_ids: string[];
  tipo_veiculo_ids: string[];
  usos: string[];
  regional_ids: string[];
  visivel_portal: boolean;
  exige_aceite: boolean;
  declaracoes: Json;
  ativo: boolean;
  versao_atual_id: string | null;
  criado_por: string | null;
  atualizado_por: string | null;
};
export type TermoVersaoRow = {
  id: string;
  modelo_id: string;
  numero: number;
  nome: string;
  conteudo_html: string;
  sha256: string;
  declaracoes: Json;
  observacao: string | null;
  pdf_path: string | null;
  pdf_sha256: string | null;
  publicada_por: string | null;
  publicada_em: string;
};
export type SituacaoTermoEmitido = 'EMITIDO' | 'ENVIADO' | 'ACEITO' | 'CANCELADO';
export type TermoEmitidoRow = {
  id: string;
  protocolo: string | null;
  modelo_id: string;
  versao_id: string;
  cliente_id: string;
  veiculo_id: string | null;
  regional_id: string | null;
  titulo: string;
  conteudo_html: string;
  html_sha256: string;
  campos_vazios: string[];
  pdf_path: string | null;
  pdf_sha256: string | null;
  pdf_bytes: number | null;
  visivel_portal: boolean;
  situacao: SituacaoTermoEmitido;
  emitido_por: string | null;
  emitido_em: string;
  cancelado_por: string | null;
  cancelado_em: string | null;
  cancelamento_motivo: string | null;
  updated_at: string;
};
export type PortalDocumento = {
  origem: 'EMITIDO' | 'GERAL';
  id: string;
  titulo: string;
  tipo: string;
  protocolo: string | null;
  placa: string | null;
  data: string;
  tem_pdf: boolean;
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
  /** 0158 — parte de valor_comissao que veio da Assistencia Profissional. */
  valor_assistencia_profissional: number;
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
  // 0103 — informado na abertura; libera o cadastro de terceiros
  possui_terceiros: boolean;
  // 0113 — prazo regulatorio de 90 dias (Art. 22, CNSP 491/2026)
  documentacao_completa_em: string | null;
  documentacao_completa_origem: 'AUTOMATICA' | 'MANUAL' | null;
  documentacao_completa_por: string | null;
  regulacao_encerrada_em: string | null;
  recusa_fora_do_prazo: boolean;
};

// 0113 — catalogo da documentacao exigida do evento
export type EventoDocumentosModeloRow = Timestamps & {
  id: string;
  nome: string;
  descricao: string | null;
  obrigatorio: boolean;
  tipo_evento_id: string | null;
  ordem: number;
  ativo: boolean;
};

export type SituacaoDocumentoEvento = 'PENDENTE' | 'ENTREGUE' | 'DISPENSADO';

// 0113 — as pendencias de documento de cada evento
export type EventoDocumentosRow = Timestamps & {
  id: string;
  evento_id: string;
  modelo_id: string | null;
  nome: string;
  obrigatorio: boolean;
  situacao: SituacaoDocumentoEvento;
  complementar: boolean;
  solicitado_em: string;
  solicitado_por: string | null;
  entregue_em: string | null;
  situacao_em: string;
  situacao_por: string | null;
  anexo_id: string | null;
  observacao: string | null;
};

// 0113 — trilha do prazo (append-only, escrita por trigger)
export type EventoPrazoHistoricoRow = {
  id: string;
  evento_id: string;
  tipo: string;
  detalhe: string | null;
  documento_id: string | null;
  dias: number | null;
  usuario_id: string | null;
  created_at: string;
};

export type EventoPrazoAlertasRow = {
  id: string;
  evento_id: string;
  marco: number;
  nivel: 'AVISO' | 'ATENCAO' | 'URGENCIA' | 'CRITICO' | 'VENCIDO';
  dias: number;
  limite_prazo: string;
  disparado_em: string;
  notificado_em: string | null;
  ciente_em: string | null;
  ciente_por: string | null;
};

// 0113 — uma linha de `eventos_prazos`
export type EventoPrazo = {
  evento_id: string;
  numero_protocolo: string | null;
  status: string;
  regional_id: string | null;
  regional_nome: string | null;
  cliente_nome: string | null;
  placa: string | null;
  aviso_em: string;
  documentacao_completa_em: string | null;
  documentacao_origem: 'AUTOMATICA' | 'MANUAL' | null;
  inicio_prazo: string | null;
  limite_prazo: string | null;
  dias_transcorridos: number | null;
  dias_restantes: number | null;
  dias_desde_aviso: number;
  nivel: string;
  docs_obrigatorios: number;
  docs_pendentes: number;
  docs_complementares: number;
  encerrado_em: string | null;
  recusa_fora_do_prazo: boolean;
  alertas_sem_ciencia: number;
  maior_marco_sem_ciencia: number | null;
};

// 0103 — terceiro vinculado a UM evento (e, por FK composta, ao associado dono do evento)
export type EventoTerceirosRow = Timestamps & {
  id: string;
  evento_id: string;
  cliente_id: string;
  regional_id: string | null;
  sequencia: number;
  codigo: string;
  papel: TipoEnvolvimento | null;
  status: StatusTerceiro;
  tipo_pessoa: TipoPessoa;
  nome: string;
  cpf_cnpj: string | null;
  rg: string | null;
  data_nascimento: string | null;
  telefone: string | null;
  celular: string | null;
  email: string | null;
  endereco: Json;
  condutor_e_proprietario: boolean;
  condutor_nome: string | null;
  condutor_cpf: string | null;
  condutor_cnh: string | null;
  possui_veiculo: boolean;
  veiculo_placa: string | null;
  veiculo_marca: string | null;
  veiculo_modelo: string | null;
  veiculo_ano: number | null;
  veiculo_cor: string | null;
  veiculo_valor_fipe: number | null;
  possui_seguro: boolean;
  seguradora: string | null;
  numero_apolice: string | null;
  descricao_danos: string | null;
  valor_estimado_danos: number | null;
  observacoes: string | null;
  created_by: string | null;
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
  /** 0090 — rastreador OPCIONAL: so entra abaixo do minimo da regra do tipo. */
  rastreador_avulso: boolean;
  /** 0120 — o que a cobertura cobre, mostrado aberto na ficha do veiculo. */
  descricao_cobertura: string | null;
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
  /** opcional desde a 0051 — validado quando informado */
  documento: string | null;
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
  // 0051: a rastreadora e um fornecedor com tipo marcado (nao ha tabela propria)
  empresa_rastreamento: boolean;
  contato: string | null;
  plataforma_url: string | null;
  custo_mensal_equipamento: number;
  api_config: Json;
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
  /** 0134: pedido negado (status NEGADO). */
  negado_motivo: MotivoNegativaAcionamento | null;
  negado_observacao: string | null;
  negado_por: string | null;
  negado_em: string | null;
  /** 0109: data/hora combinada com o associado; nulo = imediato. */
  agendado_para: string | null;
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
// ---------------------------------------------------------------------------
// Painel gerencial da Assistencia 24h (0061) — retornos das RPCs de leitura
// ---------------------------------------------------------------------------
export type AssistPainelResumo = {
  veiculos_total: number;
  veiculos_ativos: number;
  veiculos_inativos: number;
  veiculos_bloqueados: number;
  acionamentos: number;
  acionamentos_hoje: number;
  acionamentos_abertos: number;
  media_diaria: number;
  indice_acionamento: number; // fracao 0..1
  tempo_medio_horas: number;
  custo_total: number;
  custo_medio: number;
  custo_por_veiculo: number;
  veiculos_acionaram: number;
  reincidentes: number;
};

export type AssistPainelServico = {
  servico_id: string;
  servico: string;
  acionamentos: number;
  veiculos: number;
  custo: number;
  custo_medio: number;
  computa_limite: boolean;
  limite_quantidade: number | null;
  janela_meses: number | null;
  veiculos_no_limite: number;
};

export type AssistPainelPraca = {
  cidade: string;
  uf: string;
  acionamentos: number;
  custo: number;
  veiculos: number;   // frota da praca (0 = nao mapeada)
  taxa: number;       // acionamentos / frota (fracao)
};

export type AssistPainelMes = { competencia: string; acionamentos: number; custo: number };

export type AssistPainelVeiculo = {
  veiculo_id: string;
  placa: string | null;
  descricao: string | null;
  associado: string;
  acionamentos: number;
  custo: number;
  ultimo_uso: string;
};

export type AssistPainelSituacao = { situacao: StatusVeiculo; quantidade: number };

// ---------------------------------------------------------------------------
// Painel executivo das Regionais (0078) — o controle da matriz sobre as
// unidades. Percentuais voltam como FRACAO (0..1), como no resto do sistema.
// ---------------------------------------------------------------------------
// --- Cobranca: painel, perfis e historico (0097) ---------------------------
export type CobrancaIndicadores = {
  recorte: 'atual' | 'anterior_1' | 'anterior_2' | 'anterior_3' | 'ano_anterior';
  inicio: string;
  fim: string;
  boletos: number;
  valor_emitido: number;
  boletos_venceram: number;
  valor_venceram: number;
  boletos_aberto_vencido: number;
  valor_aberto_vencido: number;
  valor_pago_no_prazo: number;
  valor_pago_em_atraso: number;
  boletos_pago_em_atraso: number;
  valor_a_vencer: number;
  valor_vence_hoje: number;
  clientes_venceram: number;
  clientes_inadimplentes: number;
  primeiros_venceram: number;
  primeiros_nao_pagos: number;
  primeiros_pagos_atraso: number;
  reincidentes: number;
  regularizados: number;
  clientes_serasa: number;
};
export type CobrancaCarteira = {
  clientes_ativos: number;
  clientes_inadimplentes: number;
  boletos_vencidos: number;
  valor_vencido: number;
  ultima_captura_mutual: string | null;
  ultima_importacao: string | null;
  /** 0139: associados que passaram do prazo de inativacao da regua (fora das contas acima). */
  clientes_a_inativar: number;
  valor_a_inativar: number;
};
/** 0139: os tres prazos da regua de cobranca. */
export type ReguaCobranca = { dias_bloqueio: number; dias_revistoria: number; dias_inativacao: number };
/** 0139: veiculos que sairam da base no periodo (o acervo que ja entrou inativo nao conta). */
export type CobrancaInativados = { veiculos: number; clientes: number; pela_regua: number };
export type CobrancaCalendarioLinha = {
  ciclo: number;
  data_ciclo: string;
  boletos: number;
  clientes: number;
  valor_emitido: number;
  valor_pago_no_prazo: number;
  valor_pago_em_atraso: number;
  valor_a_vencer: number;
  valor_vence_hoje: number;
  valor_aberto_vencido: number;
  boletos_aberto_vencido: number;
  valor_venceram: number;
};
export type CobrancaPorRegional = {
  regional_id: string | null;
  regional: string;
  boletos: number;
  valor_emitido: number;
  valor_venceram: number;
  valor_aberto_vencido: number;
  valor_pago_em_atraso: number;
  clientes_venceram: number;
  clientes_inadimplentes: number;
};
export type CobrancaSerieMes = {
  mes: string;
  valor_emitido: number;
  valor_venceram: number;
  valor_aberto_vencido: number;
  valor_pago_no_prazo: number;
  valor_pago_em_atraso: number;
};
export type CobrancaBoletoLinha = {
  origem: 'SCAR' | 'MUTUAL';
  boleto_id: string;
  cliente_id: string;
  associado: string;
  cpf_cnpj: string;
  placa: string | null;
  regional: string;
  competencia: string | null;
  vencimento: string;
  valor: number;
  valor_pago: number | null;
  data_pagamento: string | null;
  situacao: string;
  ciclo: number;
  dias_atraso: number;
  em_serasa: boolean;
  total_registros: number;
  total_valor: number;
};
export type CobrancaParametros = {
  meta: number;
  limite: number;
  feriados: { data: string; descricao: string }[];
};
export type CobrancaEscopo = { global: boolean; regionais: string[] };
/* ---- Cobranca, Fase 2 (0098): fila, contatos e promessas ---- */
export type CobrancaFilaLinha = {
  cliente_id: string;
  associado: string;
  cpf_cnpj: string;
  telefone: string | null;
  celular: string | null;
  regional_id: string | null;
  regional: string;
  placas: string | null;
  boletos_vencidos: number;
  valor_vencido: number;
  dias_atraso: number;
  faixa: string | null;
  vencido_desde: string;
  ultimo_contato_em: string | null;
  ultimo_canal: string | null;
  ultimo_resultado: string | null;
  ultimo_usuario: string | null;
  ultima_observacao: string | null;
  retorno_em: string | null;
  proxima_acao: string | null;
  contatos: number;
  acordo_id: string | null;
  acordo_tipo: 'PROMESSA' | 'ACORDO' | null;
  acordo_status: string | null;
  proxima_parcela_em: string | null;
  proxima_parcela_valor: number | null;
  situacao_fila: string;
  prioridade: number;
  total_registros: number;
  total_valor: number;
};
export type CobrancaFilaResumo = { grupo: 'situacao' | 'faixa'; chave: string | null; clientes: number; valor: number };
export type CobrancaParcelaSituacao = {
  numero: number;
  vencimento: string;
  valor: number;
  acumulado: number;
  pago_ate: number;
  situacao: 'cumprida' | 'quebrada' | 'aguardando_baixa' | 'a_vencer';
};
export type CobrancaAcordoSituacao = {
  acordo_id: string;
  cliente_id: string;
  regional_id: string | null;
  tipo: 'PROMESSA' | 'ACORDO';
  data_base: string;
  valor_total: number;
  divida_na_data: number;
  observacao: string | null;
  criado_por_nome: string | null;
  created_at: string;
  cancelado_em: string | null;
  motivo_cancelamento: string | null;
  status: 'EM_ANDAMENTO' | 'CUMPRIDO' | 'QUEBRADO' | 'CANCELADO';
  valor_pago: number;
  parcelas: CobrancaParcelaSituacao[];
  quebra_em: string | null;
  proxima_parcela_em: string | null;
  proxima_parcela_valor: number | null;
};
export type CobrancaPromessasResumo = {
  feitas: number;
  cumpridas: number;
  quebradas: number;
  em_andamento: number;
  canceladas: number;
  valor_prometido: number;
  valor_recuperado: number;
};
export type CobrancaContato = {
  id: string;
  canal: string;
  resultado: string;
  observacao: string | null;
  proxima_acao_em: string | null;
  proxima_acao: string | null;
  boletos_vencidos: number;
  valor_vencido: number;
  dias_atraso: number;
  usuario: string | null;
  created_at: string;
  acordo_id: string | null;
};
export type CobrancaBoletoCliente = {
  origem: 'SCAR' | 'MUTUAL';
  boleto_id: string;
  placa: string | null;
  competencia: string | null;
  vencimento: string;
  valor: number;
  valor_pago: number | null;
  data_pagamento: string | null;
  situacao: string;
  dias_atraso: number;
  em_serasa: boolean;
};
export type CobrancaHistoricoResumo = {
  boletos: number;
  associados: number;
  pagos: number;
  abertos: number;
  cancelados: number;
  primeiro_vencimento: string | null;
  ultimo_vencimento: string | null;
  ultima_importacao: string | null;
  boletos_capturados: number;
  ultima_captura: string | null;
};
export type CobrancaImportacaoBloco = {
  lidos: number;
  mensalidades: number;
  sem_associado: number;
  status_desconhecido: number;
  gravados: number;
  proximo_cursor: string | null;
  fim: boolean;
};

export type RegionaisPainelResumo = {
  veiculos_ativos: number;
  veiculos_ativos_antes: number;
  veiculos_inadimplentes: number;
  veiculos_cancelados: number;
  veiculos_cancelados_antes: number;
  veiculos_em_evento: number;
  veiculos_novos: number;
  carteira_ativa: number;
  valor_recebido: number;
  valor_recebido_antes: number;
  valor_inadimplente: number;
  valor_a_receber: number;
  gasto_eventos: number;
  gasto_eventos_antes: number;
  regionais_total: number;
};

export type RegionaisPainelPonto = {
  balde: string;
  fim_balde: string;
  granularidade: 'DIA' | 'SEMANA' | 'MES';
  ativos: number;
  inadimplentes: number;
  sinistros: number;
  recebido: number;
  gasto_eventos: number;
};

export type RegionaisPainelLinha = {
  regional_id: string;
  regional: string;
  cidade: string;
  uf: string;
  ativa: boolean;         // unidade inativada (0067) continua na tabela, marcada
  veiculos_ativos: number;
  veiculos_novos: number;
  veiculos_cancelados: number;
  veiculos_inadimplentes: number;
  inadimplencia: number;   // fracao 0..1
  sinistros: number;
  recebido: number;
  gasto_eventos: number;
  resultado: number;
  sinistralidade: number;  // fracao 0..1 (1 = consome tudo o que arrecada)
};

export type IntervaloContasPainel = { conta_de: string | null; conta_ate: string | null };

export type ContaPlanoPainel = { codigo: string; nome: string; tipo: TipoCategoriaDre };

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
  /** 0134: pedidos NEGADOS deste servico na mesma janela (nao consomem o limite). */
  negados: number;
  ultima_negativa: string | null;
};

// Trava do veiculo (RPC situacao_assistencia_veiculo)
export type SituacaoAssistencia = {
  veiculo_id: string;
  placa: string | null;
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

// Contagem regressiva da tolerancia (RPC situacao_inadimplencia_veiculo, 0072)
export type SituacaoInadimplencia = {
  veiculo_id: string;
  inadimplente: boolean;
  dias_no_status: number;
  dias_tolerancia: number;
  dias_restantes: number | null;
  vence_em: string | null;
  tolerancia_vencida: boolean;
};

// Funil objeto -> consultor -> vendedor -> unidade (RPC mutual_cobertura_consultor, 0073)
export type MutualPassoFunil = {
  passo: number;
  etapa: string;
  objetos: number;
  perdidos: number;
  detalhe: string | null;
};

// A fila de trabalho (RPC mutual_consultores_sem_vendedor, 0073)
export type MutualConsultorPendente = {
  consultor_id: string;
  nome: string | null;
  documento: string | null;
  email: string | null;
  veiculos: number;
  motivo: string;
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
  negado_motivo: MotivoNegativaAcionamento | null;
  negado_observacao: string | null;
};

// 0150 — tipos de boleto AVULSO do SAC
export type TiposBoletoAvulsoRow = {
  id: string;
  nome: string;
  categoria_dre_id: string | null;
  exige_veiculo: boolean;
  ativo: boolean;
  ordem: number;
  created_at: string;
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
  /** Saldo no FIM do dia saldo_inicial_em (0119). */
  saldo_inicial: number;
  saldo_inicial_em: string | null;
  ofx_mensalidades: ModoMensalidadeOfx;
  ofx_textos_mensalidade: string[];
  /** Linha do fluxo de caixa evolutivo e grupo do balancete (0152). */
  classe_fluxo: 'CONTA_CORRENTE' | 'INVESTIMENTO' | 'DINHEIRO' | 'OUTROS';
  /** A analitica da conta em Disponibilidades (1.1.1.0x.NN), mantida por trigger (0153). */
  conta_contabil_id: string | null;
};

export type ModoMensalidadeOfx = 'NENHUM' | 'POR_TEXTO' | 'TODOS_CREDITOS';
export type SituacaoExtratoItem = 'PENDENTE' | 'SUGERIDO' | 'CONCILIADO' | 'IGNORADO';
export type TipoConciliacaoExtrato = 'BAIXA' | 'TITULO' | 'TRANSFERENCIA' | 'LANCAMENTO';

export type ApiIntegracoesRow = {
  id: string;
  nome: string;
  descricao: string | null;
  fornecedor_id: string | null;
  escopos: string[];
  regional_ids: string[] | null;
  ips_permitidos: string[] | null;
  chave_prefixo: string;
  chave_hash: string;
  ativo: boolean;
  expira_em: string | null;
  revogada_em: string | null;
  revogada_por: string | null;
  revogacao_motivo: string | null;
  ultimo_uso_em: string | null;
  ultimo_ip: string | null;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
};

export type ApiRequisicoesRow = {
  id: number;
  integracao_id: string | null;
  metodo: string;
  rota: string;
  status: number;
  ip: string | null;
  duracao_ms: number | null;
  registros: number | null;
  erro: string | null;
  created_at: string;
};

export type ApiIntegracaoLista = Omit<ApiIntegracoesRow, 'chave_hash' | 'revogada_por' | 'criado_por' | 'updated_at'> & {
  fornecedor_nome: string | null;
  requisicoes_24h: number;
  erros_24h: number;
};

export type ApiVeiculo = {
  veiculo_id: string; placa: string | null; chassi: string | null; renavam: string | null; zero_km: boolean;
  marca: string | null; modelo: string | null; ano_fabricacao: number | null; ano_modelo: number | null; cor: string | null;
  tipo_veiculo: string | null; status: string; situacao_rastreamento: string; status_desde: string | null;
  data_ativacao: string | null; data_saida: string | null; unidade_id: string | null; unidade_nome: string | null;
  rastreador_imei: string | null; rastreador_chip: string | null; rastreadora_id: string | null; rastreadora_nome: string | null;
  cliente_id: string; associado_nome: string | null; associado_documento: string | null; associado_tipo_pessoa: string | null;
  associado_telefone: string | null; associado_celular: string | null; associado_email: string | null;
  alterado_em: string;
};

export type ApiRastreador = {
  rastreador_id: string; imei: string; numero_serie: string | null; iccid: string | null; linha: string | null;
  operadora: string | null; modelo: string | null; fabricante: string | null; status: string; status_numero: number;
  status_desde: string; rastreadora_id: string | null; rastreadora_nome: string | null; unidade_id: string | null;
  unidade_nome: string | null; veiculo_id: string | null; placa: string | null; chassi: string | null;
  veiculo_status: string | null; situacao_rastreamento: string | null; data_instalacao: string | null;
  ultima_comunicacao: string | null; ultima_posicao: Json | null; alterado_em: string;
};

export type ContaBancariaOperadoresRow = {
  conta_bancaria_id: string;
  usuario_id: string;
  created_by: string | null;
  created_at: string;
};

export type TransferenciasBancariasRow = {
  id: string;
  conta_origem_id: string;
  conta_destino_id: string;
  valor: number;
  data: string;
  descricao: string | null;
  status: 'ATIVA' | 'CANCELADA';
  cancelada_motivo: string | null;
  created_by: string | null;
  created_at: string;
};

export type ExtratoImportacoesRow = {
  id: string;
  conta_id: string;
  arquivo_nome: string | null;
  arquivo_hash: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  saldo_banco: number | null;
  saldo_banco_em: string | null;
  itens: number;
  novos: number;
  repetidos: number;
  sugeridos: number;
  ignorados: number;
  created_by: string | null;
  created_at: string;
};

export type ExtratoItensRow = {
  id: string;
  conta_id: string;
  importacao_id: string | null;
  fitid: string;
  data: string;
  valor: number;
  tipo_ofx: string | null;
  historico: string | null;
  documento: string | null;
  situacao: SituacaoExtratoItem;
  motivo: string | null;
  sugestao_tipo: 'BAIXA' | 'TITULO' | 'TRANSFERENCIA' | null;
  sugestao_id: string | null;
  baixa_id: string | null;
  titulo_id: string | null;
  transferencia_id: string | null;
  conciliado_por: string | null;
  conciliado_em: string | null;
  created_at: string;
};

export type SaldoContaRow = {
  conta_id: string;
  nome: string;
  banco: string | null;
  tipo: string | null;
  ativo: boolean;
  saldo_inicial: number;
  saldo_inicial_em: string | null;
  entradas: number;
  saidas: number;
  saldo: number;
  movimentos: number;
  nao_conciliados: number;
  extrato_saldo: number | null;
  extrato_saldo_em: string | null;
  saldo_sistema_no_extrato: number | null;
  extrato_diferenca: number | null;
  itens_pendentes: number;
  ultima_importacao: string | null;
};

export type ExtratoContaRow = {
  data: string;
  conta_id: string;
  conta: string;
  origem: 'BAIXA' | 'TITULO' | 'TRANSFERENCIA';
  ref_id: string;
  lancamento_id: string | null;
  descricao: string | null;
  documento: string | null;
  contraparte: string | null;
  categoria_codigo: string | null;
  categoria: string | null;
  centro_custo: string | null;
  forma: string | null;
  entrada: number;
  saida: number;
  saldo: number | null;
  saldo_anterior: number;
  conciliado: boolean;
  extrato_item_id: string | null;
  /** 0149: recebimento da cobranca pelo banco (os membros vem juntos no dia). */
  grupo: 'PIX' | 'COMPE_REDE' | 'COBRANCA' | null;
};

export type FluxoDiarioRow = {
  dia: string;
  realizado_entrada: number;
  realizado_saida: number;
  previsto_entrada: number;
  previsto_saida: number;
  previsto_boletos: number;
  vencido_entrada: number;
  vencido_saida: number;
  qtd_previsto_saida: number;
};

export type DemonstrativoRow = {
  categoria_id: string | null;
  codigo: string;
  categoria: string;
  grupo: string;
  centro_custo_id: string | null;
  centro_custo: string;
  realizado: number;
  a_realizar: number;
  vencido: number;
  quantidade: number;
};

export type ConferenciaCaixaDreRow = {
  saldo_inicial: number;
  saldo_final: number;
  variacao_saldo: number;
  resultado_dre_caixa: number;
  diferenca: number;
  baixas_sem_conta: number;
  titulos_fora_do_extrato: number;
  movimentos_avulsos: number;
  antes_do_saldo_inicial: number;
};

export type CandidatoExtratoRow = {
  tipo: TipoConciliacaoExtrato;
  ref_id: string;
  data: string;
  valor: number;
  descricao: string | null;
  contraparte: string | null;
  valor_igual: boolean;
  dias: number;
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
  // 0103 — terceiro do evento relacionado (sem fornecedor = favorecido e o terceiro)
  evento_terceiro_id: string | null;
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
  dias_tolerancia_inadimplencia: number;
  /** 0137: dias de atraso a partir dos quais a 2a via exige revistoria. */
  dias_revistoria_boleto: number;
  /** 0139: dias de atraso a partir dos quais a 24h e os beneficios ficam bloqueados. */
  dias_bloqueio_inadimplencia: number;
  // Recorte do plano de contas que alimenta o painel das regionais (0078).
  painel_conta_de: string | null;
  painel_conta_ate: string | null;
  // Link do regulamento citado nos termos (0123).
  regulamento_url: string | null;
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
  /** 0160 — presentes so no item com desconto do plano. */
  valor_tabela?: number;
  desconto_plano?: number;
  desconto_plano_percentual?: number;
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
  /** 0081 — o adicional da regional, DISCRIMINADO (nunca embutido). 0 = matriz pura. */
  adicional_regional?: number;
  regional_id?: string | null;
  /** 0160 — desconto da base e multiplicador da participacao do plano. */
  desconto_base_percentual?: number;
  desconto_base_valor?: number;
  multiplicador_participacao?: number;
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
  evento_terceiro_id: string | null;
  comunicacao_id?: string | null;
  pose?: string | null;
  enviado_pelo_envolvido?: boolean;
};

/** 0129: convite de comunicacao de evento (um link por envolvido). */
export type EventoComunicacaoRow = {
  id: string;
  evento_id: string;
  papel: string;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  terceiro_id: string | null;
  token: string;
  expira_em: string;
  status: string;
  rascunho: Json;
  rascunho_em: string | null;
  verificado_em: string | null;
  tentativas_verificacao: number;
  envios: number;
  ultimo_envio_canal: string | null;
  ultimo_envio_em: string | null;
  primeiro_acesso_em: string | null;
  ultimo_acesso_em: string | null;
  respondido_em: string | null;
  correcao_comentario: string | null;
  conferido_em: string | null;
  conferido_por: string | null;
  revogado_em: string | null;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
};

/** 0129: versao imutavel do que o envolvido (ou a equipe) declarou. */
export type EventoDeclaracaoRow = {
  id: string;
  comunicacao_id: string;
  evento_id: string;
  versao: number;
  dados: Json;
  origem: 'ENVOLVIDO' | 'EQUIPE';
  texto_declaracao: string;
  ip: string | null;
  user_agent: string | null;
  registrado_por: string | null;
  hash_conteudo: string;
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
  evento_terceiro_id: string | null;
  /** 0132 — fornecedor cadastrado e o titulo gerado ao lancar a cotacao aprovada. */
  fornecedor_id: string | null;
  lancamento_id: string | null;
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
  // 0102 — a carteira da unidade. `veiculos_ativos` acima continua sendo SO
  // `status = 'ativo'`; estes contam quem esta NA BASE (a lista de
  // `veiculo_faturavel`, 0024/0072).
  veiculos_carteira: number;
  veiculos_inadimplentes: number;
  veiculos_cobranca_externa: number;
  veiculos_sem_valor: number;
  carteira_mensal: number;
  associados: number;
  vendedores_cadastrados: number;
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
  placa: string | null;
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
  /** 0099: boleto do Mutual (so consulta; 2a via sai do proprio registro). */
  origem?: 'SCAR' | 'MUTUAL';
  url_pagamento?: string | null;
};

export type PortalBoletoMutual = {
  id: string;
  veiculo_id: string | null;
  placa: string | null;
  competencia: string | null;
  data_vencimento: string;
  valor: number;
  valor_pago: number | null;
  data_pagamento: string | null;
  situacao: string;
  dias_atraso: number;
  linha_digitavel: string | null;
  url_boleto: string | null;
  url_pagamento: string | null;
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
  // 0047 — o que a auditoria precisa para conferir sem abrir uma aba por foto
  enviada_em: string | null;
  tamanho_bytes: number | null;
  arquivo: string | null;
  // 0076 — a origem: foto do CLIENTE (link publico) ou de quem esta logado
  enviado_pelo_cliente: boolean;
};

// 0048 :: anexos da OS da assistencia 24h
export type TipoAnexoAcionamento =
  | 'FOTO_VEICULO' | 'FOTO_LOCAL' | 'DOCUMENTO' | 'COMPROVANTE' | 'OUTRO';

export type AcionamentoAnexosRow = {
  id: string;
  acionamento_id: string;
  url: string;
  tipo: TipoAnexoAcionamento;
  descricao: string | null;
  tamanho_bytes: number | null;
  enviado_por: string | null;
  created_at: string;
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
// ---- 0062: integracao com o Mutual (Fase 1 - espelho de leitura) -----------
/** ⚠️ Esta lista e a TERCEIRA copia da mesma allow-list (as outras sao o
 *  `chk_mutual_entidade` do banco e `ENTIDADES_MUTUAL` em `src/lib/mutual.ts`,
 *  que tem o caminho de cada uma). Redigitar allow-list derruba em silencio o
 *  que se esquecer — aconteceu com `CONTRACT` na 0085. Por isso `mutual.ts`
 *  tem uma afirmacao de COMPILACAO de que as duas do cliente batem, e a suite
 *  `0085` afirma a do banco entidade por entidade. Mexeu numa, mexa nas tres. */
export type EntidadeMutual =
  | 'CONTRACT_OBJECT' | 'CONTRACT' | 'PERSON' | 'ADDRESS' | 'INVOICE' | 'EVENT'
  /** 0083 — SALE_TEAM e o nivel que corresponde a `regionais` do SCar. */
  | 'REGIONAL' | 'SALE_TEAM' | 'CONSULTANT'
  /** 0085 — o nome dos `plan_id`. */
  | 'PLAN'
  | 'VEHICLE_TYPE' | 'VEHICLE_COLOR' | 'VEHICLE_CATEGORY' | 'VEHICLE_USE_TYPE' | 'EVENT_TYPE'
  /** 0091 — os produtos de cada veiculo (terceiros decide o plano da moto). */
  | 'CONTRACT_OBJECT_PRODUCT';

/** 0083 — uma equipe de vendas do Mutual e o agrupamento dela numa regional. */
export type MutualEquipeVendas = {
  id_externo: string;
  nome: string | null;
  macrorregiao: string | null;
  filial_id: string | null;
  objetos: number;
  faturaveis: number;
  consultores: number;
  /** O de-para REGISTRADO. Varias equipes podem apontar para a mesma regional. */
  regional_id: string | null;
  /** false = o id so aparece no contrato; /association/sale_team/ nao foi puxado. */
  capturada: boolean;
};

/** 0084 — o de-para de /vehicle/type/ com o PESO da carteira. */
export type MutualTipoVeiculoExterno = {
  id_externo: string;
  nome: string | null;
  /** false = o id so aparece no objeto; /vehicle/type/ nao foi puxado. */
  capturado: boolean;
  veiculos: number;
  faturaveis: number;
  /** O de-para REGISTRADO — nunca palpite. **Chamava-se `regional_id` na 0084
   *  e guardava um `tipos_veiculo.id`; renomeado na 0085.** */
  destino_id: string | null;
  tipo_nome: string | null;
};

/** 0085 — o de-para de `plan_id` com o peso e a COBERTURA ACUMULADA. */
export type MutualPlanoExterno = {
  id_externo: string;
  nome: string | null;
  /** false = o id so aparece no objeto; /plan/ nao foi puxado (ou o caminho
   *  palpitado esta errado — ver ENTIDADES_MUTUAL.PLAN). */
  capturado: boolean;
  veiculos: number;
  faturaveis: number;
  cobertura_acumulada: number | null;
  /** PERFIL, nao identificacao: a FIPE varia 6x a 14x dentro do mesmo id. */
  mensalidade_mediana: number | null;
  fipe_min: number | null;
  fipe_max: number | null;
  tipos: string | null;
  destino_id: string | null;
  plano_nome: string | null;
};

/** 0087 — o de-para por CATEGORIA do Mutual, por PAR categoria/tipo (a
 *  categoria "PASSEIO" junta carro e moto), com o peso da unidade. */
export type MutualCategoriaVeiculo = {
  /** '<categoria>/<tipo>' — e a chave gravada em `integracao_vinculos`. */
  chave: string;
  categoria_id: string;
  categoria_nome: string | null;
  tipo_id: string | null;
  /** O tipo do Mutual (CARRO/MOTO/CAMINHAO) — o cabecalho do agrupamento. */
  tipo_mutual: string | null;
  capturada: boolean;
  veiculos: number;
  faturaveis: number;
  cobertura_acumulada: number | null;
  /** O vinculo da CATEGORIA — manda. */
  destino_id: string | null;
  destino_nome: string | null;
  /** O que o vinculo do TIPO daria sem ele — a reserva. */
  reserva_id: string | null;
  reserva_nome: string | null;
};

/** 0084 — uma linha da carga, ja saneada, com o motivo da recusa quando ha. */
export type MutualCargaLinha = {
  id_objeto: string;
  id_pessoa: string | null;
  acao: 'CRIAR' | 'ATUALIZAR' | 'RECUSADO';
  /** null = entra. Preenchido = recusada, e o texto diz por que. */
  problema: string | null;
  status: StatusVeiculo | null;
  placa: string | null;
  chassi: string | null;
  renavam: string | null;
  marca: string | null;
  modelo: string | null;
  ano_fabricacao: number | null;
  ano_modelo: number | null;
  cor_id: string | null;
  cor: string | null;
  uso: string | null;
  valor_fipe: number | null;
  codigo_fipe: string | null;
  /** A PARCELA mensal (0065). NULL, nunca zero — zero vaza para o cotar_plano. */
  valor_mensalidade: number | null;
  dia_vencimento: number | null;
  data_ativacao: string | null;
  /** true = a data saiu do created_at, nao do first_activation_date. */
  ativacao_estimada: boolean;
  tipo_veiculo_id: string | null;
  plano_id: string | null;
  nome: string | null;
  cpf_cnpj: string | null;
  tipo_pessoa: 'PF' | 'PJ' | null;
  email: string | null;
  telefone: string | null;
  data_nascimento: string | null;
  nome_mae: string | null;
  endereco: Record<string, string | undefined>;
  cliente_id: string | null;
  veiculo_id: string | null;
};

/** 0084 — o resultado da carga (ou da simulacao, quando p_confirmar e false). */
export type MutualCargaResultado = {
  clientes_criados: number;
  clientes_atualizados: number;
  veiculos_criados: number;
  veiculos_atualizados: number;
  recusados: number;
  /** 0094 — quantas linhas ainda estao na fila depois desta chamada. */
  restantes: number;
  mensagem: string;
};

/** 0095 — o vendedor dos veiculos migrados, agrupado por motivo e consultor. */
export type MutualVendedorResumo = {
  motivo: string;
  consultor_id: string | null;
  consultor_nome: string | null;
  consultor_documento: string | null;
  vendedor_nome: string | null;
  veiculos: number;
  placas: string | null;
};

/** 0095 — o resultado de ligar os vendedores (ou da simulacao). */
export type MutualVincularVendedores = {
  ligar: number;
  ja_ligados: number;
  mantidos: number;
  sem_vendedor: number;
  gravados: number;
  mensagem: string;
};

/** 0084 — o resultado do desfazer. */
export type MutualDesfazerResultado = {
  veiculos_removidos: number;
  clientes_removidos: number;
  /** Veiculos com movimento do SCar em cima: nao sao apagados. */
  preservados: number;
  mensagem: string;
};

export type PapelPermissoesRow = {
  papel: string;
  permissao: string;
  concedida: boolean;
  alterado_por: string | null;
  alterado_em: string;
};

export type PerfilPermissoesRow = {
  papel: string;
  modulo: string;
  acao: string;
  concedida: boolean;
  alterado_por: string | null;
  alterado_em: string;
};

// 0116: permissao extra de um usuario (so soma ao papel)
export type UsuarioPermissoesRow = {
  usuario_id: string;
  modulo: string;
  acao: string;
  motivo: string;
  expira_em: string | null;
  concedido_por: string | null;
  concedido_em: string;
};

export type PermissaoExtraUsuario = {
  modulo: string;
  acao: string;
  motivo: string;
  expira_em: string | null;
  vigente: boolean;
  concedido_por: string | null;
  concedido_em: string;
};

export type MutualCapturaRow = {
  id: number;
  entidade: string;
  id_externo: string;
  uuid_externo: string | null;
  payload: Json;
  deletado: boolean;
  capturado_em: string;
  capturado_por: string | null;
};

/** 0082 — a ponte id externo -> registro do SCar (unique so do lado externo). */
export type IntegracaoVinculosRow = {
  id: number;
  sistema: string;
  entidade: string;
  id_externo: string;
  tabela: string;
  registro_id: string;
  observacao: string | null;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
};

export type MutualSincroniasRow = {
  id: string;
  entidade: string;
  iniciada_em: string;
  concluida_em: string | null;
  paginas: number;
  registros: number;
  total_remoto: number | null;
  erro: string | null;
  executada_por: string | null;
};

export type SeveridadeDiagnostico = 'OK' | 'ATENCAO' | 'CRITICO';

export type MutualDiagnostico = {
  grupo: string;
  indicador: string;
  valor: number;
  detalhe: string;
  severidade: SeveridadeDiagnostico;
};

export type MutualPorStatus = {
  contract_status: string | null;
  status_scar: string;
  quantidade: number;
};

export type MutualFilial = {
  id_externo: string;
  nome: string | null;
  cnpj: string | null;
  objetos: number;
  /** 0082 — a carteira VIVA da filial. E este numero que decide o de-para. */
  faturaveis: number;
  associados: number;
  /** O de-para REGISTRADO (integracao_vinculos). E o unico que a carga usa. */
  regional_id: string | null;
  /** Casamento por CNPJ/nome. SO para a tela sugerir — nunca carrega carteira. */
  palpite_id: string | null;
};

/** 0082 — vinculo apontando para registro que nao existe mais (nao ha FK). */
export type VinculoOrfao = {
  sistema: string;
  entidade: string;
  tabela: string;
  quantidade: number;
};

/** 0082 — quantos veiculos cada unidade ainda cobra por fora. */
export type CobrancaExternaResumo = {
  regional_id: string | null;
  regional: string;
  externos: number;
  proprios: number;
  total: number;
};

export type MutualQuarentena = {
  id_externo: string;
  placa: string | null;
  associado: string | null;
  cpf_cnpj: string | null;
  situacao: string | null;
  motivos: string[];
};

/** 0065: chaves do payload capturado — para NAO adivinhar onde um campo mora. */
export type MutualCampo = {
  campo: string;
  preenchidos: number;
  vazios: number;
  exemplo: string | null;
};

/** 0064: periodicidade da cobranca — parcela ou total? */
export type MutualPeriodicidade = {
  periodo: string;
  meses: number | null;
  contratos: number;
  objetos: number;
  parcelas_media: number | null;
  valor_mediano: number | null;
  valor_minimo: number | null;
  valor_maximo: number | null;
};

/**
 * 0063/0071: o vocabulario do Mutual que o de-para ainda nao reconhece.
 * `origem` diz se veio do CONTRATO ou do OBJETO — desde a 0071 o status do
 * objeto tambem decide carga, entao palavra nova la classifica veiculo errado.
 */
export type MutualStatusNaoMapeado = {
  origem: string;
  status: string | null;
  quantidade: number;
};

/** 0071: contrato x objeto, e quantos mudam de classificacao por causa do objeto. */
export type MutualStatusCruzado = {
  contract_status: string | null;
  object_status: string;
  status_scar: string;
  status_pelo_contrato: string;
  mudou: boolean;
  quantidade: number;
};

export type MutualResumoCaptura = {
  entidade: string;
  registros: number;
  deletados: number;
  ultima: string | null;
  total_remoto: number | null;
};

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
      perfis_acesso: TableDef<PerfisAcessoRow>;
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
          Rel<'cor_id', 'cores'>,
          Rel<'empresa_rastreamento_id', 'fornecedores'>,
        ]
      >;
      categorias_dre: TableDef<CategoriasDreRow>;
      plano_contas_migracao: TableDef<PlanoContasMigracaoRow>;
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
      evento_documentos_modelo: TableDef<EventoDocumentosModeloRow, [Rel<'tipo_evento_id', 'tipos_evento'>]>;
      evento_documentos: TableDef<
        EventoDocumentosRow,
        [Rel<'evento_id', 'eventos_sinistro'>, Rel<'anexo_id', 'anexos_evento'>, Rel<'situacao_por', 'usuarios'>]
      >;
      evento_prazo_historico: TableDef<EventoPrazoHistoricoRow, [Rel<'evento_id', 'eventos_sinistro'>, Rel<'usuario_id', 'usuarios'>]>;
      evento_prazo_alertas: TableDef<EventoPrazoAlertasRow, [Rel<'evento_id', 'eventos_sinistro'>]>;
      historico_protocolo: TableDef<HistoricoProtocoloRow>;
      anexos_evento: TableDef<AnexosEventoRow>;
      cotacoes_pecas: TableDef<CotacoesPecasRow, [Rel<'evento_terceiro_id', 'evento_terceiros'>, Rel<'fornecedor_id', 'fornecedores'>, Rel<'lancamento_id', 'lancamentos_financeiros'>]>;
      evento_terceiros: TableDef<
        EventoTerceirosRow,
        [Rel<'evento_id', 'eventos_sinistro'>, Rel<'cliente_id', 'clientes'>, Rel<'regional_id', 'regionais'>]
      >;
      itens_cotacao: TableDef<ItensCotacaoRow, [Rel<'cotacao_id', 'cotacoes_pecas'>]>;
      notas_fiscais_evento: TableDef<NotasFiscaisEventoRow>;
      email_templates: TableDef<EmailTemplatesRow>;
      integracoes_bancarias: TableDef<IntegracoesBancariasRow, [Rel<'regional_id', 'regionais'>]>;
      boletos_historico: TableDef<{
        id: string; origem: string; id_externo: string; cliente_id: string; veiculo_id: string | null;
        competencia: string | null; vencimento_original: string; data_vencimento: string; valor: number;
        valor_pago: number | null; data_pagamento: string | null; situacao: string; status_origem: string;
        em_serasa: boolean; linha_digitavel: string | null; nosso_numero: string | null;
        renegociacao_id: string | null;
      }>;
      cobranca_renegociacoes: TableDef<{
        id: string; cliente_id: string; regional_id: string | null; tipo: string; acordo_id: string | null;
        valor_original: number; valor_total: number; observacao: string | null; situacao: string;
        erro: string | null; integracao_id: string | null; criado_por: string | null;
        created_at: string; emitida_em: string | null;
        veiculo_id: string | null; pro_rata: Json | null;
      }>;
      veiculo_cancelamentos: TableDef<{
        id: string; veiculo_id: string; cliente_id: string; regional_id: string | null;
        data_cancelamento: string; motivo: string; previsao_retorno: boolean; data_retorno: string | null;
        status_anterior: string; cobranca_externa: boolean; pro_rata: Json | null;
        lead_retorno_id: string | null; renegociacao_id: string | null; faturas_ajustadas: number;
        observacao: string | null; criado_por: string | null; created_at: string; reativado_em: string | null;
      }>;
      cobranca_renegociacao_origens: TableDef<{
        id: string; renegociacao_id: string; origem: string; boleto_historico_id: string | null;
        titulo_id: string | null; valor: number; vencimento: string; nosso_numero: string | null;
        baixa_status: string; baixa_erro: string | null; baixado_em: string | null;
      }>;
      marcas: TableDef<MarcasRow>;
      cores: TableDef<CoresRow>;
      vistoria_fotos_modelo: TableDef<VistoriaFotoModeloRow, [Rel<'tipo_veiculo_id', 'tipos_veiculo'>]>;
      regional_adicional_risco: TableDef<
        RegionalAdicionalRiscoRow,
        [Rel<'regional_id', 'regionais'>, Rel<'tipo_veiculo_id', 'tipos_veiculo'>]
      >;
      cor_apelidos: TableDef<CorApelidosRow, [Rel<'cor_id', 'cores'>]>;
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
          Rel<'cor_id', 'cores'>,
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
      cobranca_liquidacoes: TableDef<CobrancaLiquidacoesRow, [Rel<'titulo_id', 'titulos_financeiros'>]>;
      cobranca_avisos_banco: TableDef<CobrancaAvisosBancoRow>;
      termos_modelos: TableDef<TermoModeloRow>;
      evento_comunicacoes: TableDef<EventoComunicacaoRow, [Rel<'evento_id', 'eventos_sinistro'>, Rel<'terceiro_id', 'evento_terceiros'>]>;
      evento_declaracoes: TableDef<EventoDeclaracaoRow, [Rel<'comunicacao_id', 'evento_comunicacoes'>, Rel<'registrado_por', 'usuarios'>]>;
      termos_versoes: TableDef<TermoVersaoRow, [Rel<'modelo_id', 'termos_modelos'>]>;
      termos_emitidos: TableDef<TermoEmitidoRow, [
        Rel<'modelo_id', 'termos_modelos'>, Rel<'versao_id', 'termos_versoes'>,
        Rel<'cliente_id', 'clientes'>, Rel<'veiculo_id', 'veiculos'>, Rel<'emitido_por', 'usuarios'>,
      ]>;
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
      memos: TableDef<MemosRow, [Rel<'regional_id', 'regionais'>, Rel<'publicado_por', 'usuarios'>]>;
      memo_leituras: TableDef<MemoLeiturasRow, [Rel<'memo_id', 'memos'>, Rel<'usuario_id', 'usuarios'>]>;
      rastreadores: TableDef<
        RastreadoresRow,
        [
          Rel<'empresa_rastreamento_id', 'fornecedores'>,
          Rel<'regional_id', 'regionais'>,
          Rel<'veiculo_id', 'veiculos'>,
          Rel<'cliente_id', 'clientes'>,
        ]
      >;
      rastreador_eventos: TableDef<RastreadorEventosRow, [Rel<'rastreador_id', 'rastreadores'>]>;
      rastreador_manutencoes: TableDef<RastreadorManutencoesRow, [Rel<'rastreador_id', 'rastreadores'>, Rel<'fornecedor_id', 'fornecedores'>]>;
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
      /** 0162 — para quais tipos o plano e oferecido. Sem linha = todos os tipos. */
      plano_tipos_veiculo: TableDef<
        { plano_id: string; tipo_veiculo_id: string },
        [Rel<'plano_id', 'planos_protecao'>, Rel<'tipo_veiculo_id', 'tipos_veiculo'>]
      >;
      /** 0162 — opcionais que ja vem marcados (avulso removivel) ao escolher o plano. */
      plano_sugestoes: TableDef<
        { plano_id: string; produto_id: string },
        [Rel<'plano_id', 'planos_protecao'>, Rel<'produto_id', 'produtos'>]
      >;
      /** 0089 — para quais tipos o produto se aplica. Sem linha = todos os tipos. */
      produto_tipos_veiculo: TableDef<
        { produto_id: string; tipo_veiculo_id: string; created_at: string },
        [Rel<'produto_id', 'produtos'>, Rel<'tipo_veiculo_id', 'tipos_veiculo'>]
      >;
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
      acionamento_anexos: TableDef<
        AcionamentoAnexosRow,
        [Rel<'acionamento_id', 'acionamentos_assistencia'>, Rel<'enviado_por', 'usuarios'>]
      >;
      centros_custo: TableDef<CentrosCustoRow>;
      tipos_boleto_avulso: TableDef<TiposBoletoAvulsoRow, [Rel<'categoria_dre_id', 'categorias_dre'>]>;
      contas_bancarias: TableDef<ContasBancariasRow>;
      api_integracoes: TableDef<ApiIntegracoesRow, [Rel<'fornecedor_id', 'fornecedores'>]>;
      api_requisicoes: TableDef<ApiRequisicoesRow, [Rel<'integracao_id', 'api_integracoes'>]>;
      conta_bancaria_operadores: TableDef<ContaBancariaOperadoresRow, [Rel<'conta_bancaria_id', 'contas_bancarias'>]>;
      transferencias_bancarias: TableDef<TransferenciasBancariasRow, [Rel<'conta_origem_id', 'contas_bancarias'>, Rel<'conta_destino_id', 'contas_bancarias'>]>;
      extrato_importacoes: TableDef<ExtratoImportacoesRow, [Rel<'conta_id', 'contas_bancarias'>]>;
      extrato_itens: TableDef<ExtratoItensRow, [Rel<'conta_id', 'contas_bancarias'>, Rel<'importacao_id', 'extrato_importacoes'>]>;
      lancamentos_financeiros: TableDef<
        LancamentosFinanceirosRow,
        [
          Rel<'fornecedor_id', 'fornecedores'>,
          Rel<'cliente_id', 'clientes'>,
          Rel<'categoria_dre_id', 'categorias_dre'>,
          Rel<'centro_custo_id', 'centros_custo'>,
          Rel<'vendedor_id', 'vendedores'>,
          Rel<'evento_id', 'eventos_sinistro'>,
          Rel<'evento_terceiro_id', 'evento_terceiros'>,
        ]
      >;
      baixas_financeiras: TableDef<BaixasFinanceirasRow, [Rel<'lancamento_id', 'lancamentos_financeiros'>]>;
      cartoes_cobranca: TableDef<CartoesCobrancaRow, [Rel<'cliente_id', 'clientes'>]>;
      anexos_financeiros: TableDef<AnexosFinanceirosRow, [Rel<'lancamento_id', 'lancamentos_financeiros'>]>;
      // ---- 0062: integracao com o Mutual (Fase 1) ----
      mutual_captura: TableDef<MutualCapturaRow, [Rel<'capturado_por', 'usuarios'>]>;
      mutual_sincronias: TableDef<MutualSincroniasRow, [Rel<'executada_por', 'usuarios'>]>;
      integracao_vinculos: TableDef<IntegracaoVinculosRow, [Rel<'criado_por', 'usuarios'>]>;
      papel_permissoes: TableDef<PapelPermissoesRow, [Rel<'alterado_por', 'usuarios'>]>;
      perfil_permissoes: TableDef<PerfilPermissoesRow, [Rel<'alterado_por', 'usuarios'>]>;
      usuario_permissoes: TableDef<UsuarioPermissoesRow, [Rel<'usuario_id', 'usuarios'>, Rel<'concedido_por', 'usuarios'>]>;
    };
    Views: { [_ in never]: never };
    Functions: {
      // ---- 0055: mural interno ----
      memos_do_usuario: {
        Args: { p_incluir_lidos?: boolean; p_limite?: number };
        Returns: MemoDoUsuario[];
      };
      marcar_memo_lido: { Args: { p_memo_id: string }; Returns: boolean };
      memos_gestao: { Args: { p_limite?: number }; Returns: MemoGestao[] };
      arquivar_memo: { Args: { p_id: string }; Returns: boolean };
      salvar_memo: {
        Args: {
          p_titulo: string;
          p_mensagem: string;
          p_categoria?: string;
          p_prioridade?: string;
          p_exige_leitura?: boolean;
          p_regional_id?: string | null;
          p_papeis?: string[] | null;
          p_expira_em?: string | null;
          p_publicado?: boolean;
          p_id?: string | null;
        };
        Returns: MemosRow;
      };
      pode_publicar_memo: { Args: Record<string, never>; Returns: boolean };
      // ---- 0058: o comunicado vira conversa ----
      responder_memo: {
        Args: { p_memo_id: string; p_mensagem: string; p_com_usuario?: string | null };
        Returns: MemoRespostasRow;
      };
      memo_conversas: { Args: { p_memo_id: string }; Returns: MemoConversa[] };
      memo_mensagens: {
        Args: { p_memo_id: string; p_com_usuario?: string | null };
        Returns: MemoMensagem[];
      };
      marcar_conversa_lida: {
        Args: { p_memo_id: string; p_com_usuario?: string | null };
        Returns: number;
      };
      memo_visivel_para: { Args: { p_memo_id: string; p_usuario_id: string }; Returns: boolean };
      // ---- 0059: protocolo do evento e pareceres ----
      protocolo_do_evento: { Args: { p_evento_id: string }; Returns: string };
      solicitar_parecer: {
        Args: { p_atendimento_id: string; p_usuarios: string[]; p_pergunta: string };
        Returns: number;
      };
      responder_parecer: {
        Args: { p_pedido_id: string; p_mensagem: string };
        Returns: ProtocoloInteracoesRow;
      };
      pareceres_protocolo: { Args: { p_atendimento_id: string }; Returns: ParecerProtocolo[] };
      meus_pareceres_pendentes: { Args: { p_limite?: number }; Returns: ParecerPendente[] };
      // ---- 0050: modulo de rastreadores ----
      rastreadores_listar: {
        Args: {
          p_busca?: string | null;
          p_status?: string | null;
          p_regional_id?: string | null;
          p_plataforma_id?: string | null;
          p_com_veiculo?: boolean | null;
          p_limite?: number;
          p_offset?: number;
        };
        Returns: RastreadorLista[];
      };
      rastreador_ficha: { Args: { p_id: string }; Returns: RastreadorFicha[] };
      // ---- 0053: o equipamento obedece ao cadastro e ao financeiro ----
      sincronizar_rastreadores_inadimplencia: {
        Args: { p_dias?: number; p_regional_id?: string | null };
        Returns: { marcados: number; regularizados: number }[];
      };
      cobrar_rastreador: {
        Args: { p_rastreador_id: string; p_valor: number; p_vencimento?: string | null; p_observacao?: string | null };
        Returns: TitulosFinanceirosRow;
      };
      dias_atraso_cliente: { Args: { p_cliente_id: string }; Returns: number };
      situacao_rastreamento_veiculo: {
        Args: { p_veiculo_id: string };
        Returns: {
          tem_equipamento: boolean; rastreador_id: string | null; imei: string | null;
          status: StatusRastreador | null; status_numero: number | null; rastreadora: string | null;
          suspenso_por_debito: boolean; dias_atraso: number; exige_rastreador: boolean; situacao: string;
        }[];
      };
      rastreador_historico: { Args: { p_id: string; p_limite?: number }; Returns: RastreadorEvento[] };
      rastreadores_resumo: { Args: { p_regional_id?: string | null }; Returns: RastreadoresResumo };
      rastreadores_divergencias: {
        Args: {
          p_regional_id?: string | null;
          p_tipo?: string | null;
          p_severidade?: string | null;
          p_dias_inadimplencia?: number;
          p_limite?: number;
        };
        Returns: RastreadorDivergencia[];
      };
      rastreadores_a_recuperar: { Args: { p_regional_id?: string | null }; Returns: RastreadorARecuperar[] };
      rastreadores_movimentacao: {
        Args: { p_inicio: string; p_fim: string; p_regional_id?: string | null };
        Returns: { data: string; tipo: string; imei: string; placa: string | null; regional: string | null; instalador: string | null; autor: string | null }[];
      };
      rastreadores_giro_estoque: {
        Args: { p_regional_id?: string | null };
        Returns: { regional: string; instalacoes: number; dias_medio_em_estoque: number | null }[];
      };
      instalar_rastreador: {
        Args: {
          p_rastreador_id: string;
          p_veiculo_id: string;
          p_data?: string | null;
          p_local?: string | null;
          p_instalador?: string | null;
          p_observacoes?: string | null;
        };
        Returns: RastreadoresRow;
      };
      desinstalar_rastreador: {
        Args: { p_rastreador_id: string; p_status_novo?: string; p_motivo?: string | null; p_data?: string | null };
        Returns: RastreadoresRow;
      };
      mover_status_rastreador: {
        Args: { p_rastreador_id: string; p_status: string; p_motivo?: string | null };
        Returns: RastreadoresRow;
      };
      transferir_rastreador_regional: {
        Args: { p_rastreador_id: string; p_regional_id: string; p_motivo?: string | null };
        Returns: RastreadoresRow;
      };
      abrir_manutencao_rastreador: {
        Args: { p_rastreador_id: string; p_defeito: string; p_fornecedor_id?: string | null; p_fornecedor?: string | null };
        Returns: RastreadorManutencoesRow;
      };
      concluir_manutencao_rastreador: {
        Args: { p_manutencao_id: string; p_solucao: string; p_custo?: number | null; p_sem_reparo?: boolean };
        Returns: RastreadorManutencoesRow;
      };
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
          p_agendado_para?: string | null;
          p_limpar_agendamento?: boolean;
          p_solicitante_nome?: string | null;
          p_solicitante_telefone?: string | null;
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
          p_usuario_destino_id?: string | null;
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
      /** 0162 — o modelo do catalogo (e a cota) pela marca/modelo da FIPE. */
      modelo_do_catalogo: {
        Args: { p_marca: string; p_modelo: string };
        Returns: {
          modelo_id: string; marca: string; modelo: string; cota_id: string | null;
          cota_codigo: string | null; cota_percentual: number | null; similaridade: number;
        }[];
      };
      participacao_do_plano: {
        Args: { p_fipe: number; p_tipo_veiculo_id: string; p_cota_id: string | null; p_plano_id: string | null };
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
          p_regional_id?: string | null;   // 0081 — null = matriz pura
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
        Args: { p_fatura_id: string; p_motivo: string };
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
      registrar_liquidacao_banco: {
        Args: {
          p_provedor: string; p_ambiente: string; p_nosso_numero: string; p_seu_numero: string | null;
          p_data_pagamento: string | null; p_valor_pago: number | null; p_dia_consultado: string;
          p_payload?: Json | null;
        };
        Returns: { situacao: SituacaoLiquidacaoBanco; titulo_id: string | null; valor_divergente: boolean }[];
      };
      saldos_contas: { Args: { p_data?: string | null }; Returns: SaldoContaRow[] };
      balancete_verificacao: {
        Args: { p_inicio: string; p_fim: string };
        Returns: { codigo: string; saldo_anterior: number; debitos: number; creditos: number; saldo_final: number }[];
      };
      fluxo_caixa_evolutivo: { Args: { p_inicio: string; p_fim: string }; Returns: Json };
      saldo_consolidado_em: { Args: { p_data: string; p_conta?: string | null }; Returns: number | null };
      extrato_conta: {
        Args: {
          p_conta: string | null; p_inicio: string; p_fim: string; p_centro?: string | null;
          p_categoria?: string | null; p_conciliacao?: string | null; p_transferencias?: boolean | null;
        };
        Returns: ExtratoContaRow[];
      };
      fluxo_caixa_diario: { Args: { p_inicio: string; p_fim: string; p_conta?: string | null }; Returns: FluxoDiarioRow[] };
      financeiro_demonstrativo: {
        Args: {
          p_inicio: string; p_fim: string; p_conta?: string | null; p_centro?: string | null;
          p_categoria?: string | null; p_status?: string | null;
        };
        Returns: DemonstrativoRow[];
      };
      conferencia_caixa_dre: { Args: { p_inicio: string; p_fim: string }; Returns: ConferenciaCaixaDreRow[] };
      importar_extrato_ofx: {
        Args: {
          p_conta: string; p_arquivo: string | null; p_hash: string | null; p_data_inicio: string | null;
          p_data_fim: string | null; p_saldo_banco: number | null; p_saldo_em: string | null; p_itens: Json;
        };
        Returns: { importacao_id: string; itens: number; novos: number; repetidos: number; sugeridos: number; ignorados: number }[];
      };
      classificar_extrato_itens: { Args: { p_conta: string; p_importacao?: string | null }; Returns: { sugeridos: number; ignorados: number }[] };
      conciliar_extrato_item: { Args: { p_item: string; p_tipo: TipoConciliacaoExtrato; p_ref: string }; Returns: ExtratoItensRow };
      confirmar_sugestoes_extrato: { Args: { p_conta: string; p_itens?: string[] | null }; Returns: number };
      criar_lancamento_extrato: {
        Args: {
          p_item: string; p_descricao: string; p_categoria: string; p_centro?: string | null;
          p_fornecedor?: string | null; p_cliente?: string | null; p_regional?: string | null;
        };
        Returns: string;
      };
      criar_transferencia_bancaria: {
        Args: { p_origem: string; p_destino: string; p_valor: number; p_data: string; p_descricao?: string | null };
        Returns: string;
      };
      transferencia_extrato_item: { Args: { p_item: string; p_outra_conta: string; p_descricao?: string | null }; Returns: string };
      minhas_contas_bancarias: { Args: Record<string, never>; Returns: string[] };
      criar_api_integracao: {
        Args: {
          p_nome: string; p_descricao: string | null; p_fornecedor_id: string | null; p_escopos: string[];
          p_regional_ids: string[] | null; p_ips: string[] | null; p_expira_em: string | null;
          p_prefixo: string; p_hash: string;
        };
        Returns: string;
      };
      atualizar_api_integracao: {
        Args: {
          p_id: string; p_nome: string; p_descricao: string | null; p_fornecedor_id: string | null; p_escopos: string[];
          p_regional_ids: string[] | null; p_ips: string[] | null; p_expira_em: string | null; p_ativo: boolean;
        };
        Returns: undefined;
      };
      girar_chave_api_integracao: { Args: { p_id: string; p_prefixo: string; p_hash: string }; Returns: undefined };
      revogar_api_integracao: { Args: { p_id: string; p_motivo: string }; Returns: undefined };
      api_integracoes_listar: { Args: Record<string, never>; Returns: ApiIntegracaoLista[] };
      api_veiculos: {
        Args: {
          p_integracao_id: string; p_desde?: string | null; p_cursor_em?: string | null; p_cursor_id?: string | null;
          p_limite?: number; p_placa?: string | null; p_chassi?: string | null; p_imei?: string | null;
          p_veiculo_id?: string | null; p_situacao?: string | null;
        };
        Returns: ApiVeiculo[];
      };
      api_rastreadores: {
        Args: {
          p_integracao_id: string; p_desde?: string | null; p_cursor_em?: string | null; p_cursor_id?: string | null;
          p_limite?: number; p_imei?: string | null;
        };
        Returns: ApiRastreador[];
      };
      api_registrar_comunicacoes: {
        Args: { p_integracao_id: string; p_itens: Json };
        Returns: { imei: string; resultado: string; situacao_rastreamento: string | null }[];
      };
      estornar_baixa: {
        Args: { p_baixa_id: string; p_motivo: string };
        Returns: { lancamento_id: string; status: string; valor_saldo: number; extrato_reaberto: boolean };
      };
      equipe_ativa: {
        Args: Record<string, never>;
        Returns: { id: string; nome: string; papel: string; regional_id: string | null }[];
      };
      excluir_lancamento: {
        Args: { p_lancamento_id: string; p_motivo: string };
        Returns: { lancamento_id: string; arquivos: string[] };
      };
      salvar_operadores_conta: { Args: { p_conta: string; p_usuarios: string[] }; Returns: number };
      cancelar_transferencia_bancaria: { Args: { p_id: string; p_motivo: string }; Returns: undefined };
      ignorar_extrato_item: { Args: { p_item: string; p_motivo: string }; Returns: undefined };
      desfazer_extrato_item: { Args: { p_item: string }; Returns: undefined };
      // 0147: conciliacao em LOTE do credito somado da cobranca (COMPE/REDE)
      lote_cobranca_extrato_item: { Args: { p_item: string }; Returns: LoteCobrancaExtrato[] };
      conciliar_lote_extrato_item: { Args: { p_item: string }; Returns: LoteCobrancaExtrato[] };
      conciliar_lotes_cobranca: { Args: { p_conta?: string | null; p_desde?: string | null }; Returns: { conciliados: number; valor: number }[] };
      // 0148: PIX da cobranca casado por valor no mesmo dia
      conciliar_pix_cobranca: { Args: { p_conta?: string | null; p_desde?: string | null }; Returns: { conciliados: number; valor: number }[] };
      candidatos_extrato_item: { Args: { p_item: string; p_dias?: number }; Returns: CandidatoExtratoRow[] };
      reprocessar_liquidacoes_banco: {
        Args: { p_desde?: string | null };
        Returns: { situacao: SituacaoLiquidacaoBanco; quantidade: number; valor: number }[];
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
      regionais_painel_resumo: {
        Args: {
          p_data_inicio: string;
          p_data_fim: string;
          p_regional_id?: string | null;
          p_conta_de?: string | null;
          p_conta_ate?: string | null;
        };
        Returns: RegionaisPainelResumo[];
      };
      regionais_painel_serie: {
        Args: {
          p_data_inicio: string;
          p_data_fim: string;
          p_regional_id?: string | null;
          p_granularidade?: string | null;
          p_conta_de?: string | null;
          p_conta_ate?: string | null;
        };
        Returns: RegionaisPainelPonto[];
      };
      painel_visao_geral: {
        Args: { p_regional_id?: string | null; p_meses?: number | null };
        Returns: Json;
      };
      regionais_painel_comparativo: {
        Args: {
          p_data_inicio: string;
          p_data_fim: string;
          p_conta_de?: string | null;
          p_conta_ate?: string | null;
        };
        Returns: RegionaisPainelLinha[];
      };
      cobranca_escopo: { Args: Record<string, never>; Returns: CobrancaEscopo[] };
      cobranca_fila: {
        Args: {
          p_regional_id?: string | null;
          p_situacao?: string | null;
          p_faixa?: string | null;
          p_busca?: string | null;
          p_limite?: number;
          p_offset?: number;
          /** 0139: 'prioridade' (padrao) | 'atraso_asc' | 'atraso_desc'. */
          p_ordem?: string;
        };
        Returns: CobrancaFilaLinha[];
      };
      cobranca_fila_resumo: { Args: { p_regional_id?: string | null }; Returns: CobrancaFilaResumo[] };
      cobranca_acordos_situacao: {
        Args: { p_regional_id?: string | null; p_cliente_id?: string | null };
        Returns: CobrancaAcordoSituacao[];
      };
      cobranca_promessas_resumo: {
        Args: { p_inicio: string; p_fim: string; p_regional_id?: string | null };
        Returns: CobrancaPromessasResumo[];
      };
      cobranca_contatos_cliente: { Args: { p_cliente_id: string }; Returns: CobrancaContato[] };
      cobranca_boletos_cliente: { Args: { p_cliente_id: string }; Returns: CobrancaBoletoCliente[] };
      registrar_contato_cobranca: {
        Args: {
          p_cliente_id: string;
          p_canal: string;
          p_resultado: string;
          p_observacao?: string | null;
          p_proxima_acao_em?: string | null;
          p_proxima_acao?: string | null;
          p_acordo?: Json | null;
        };
        Returns: string;
      };
      cancelar_acordo_cobranca: { Args: { p_acordo_id: string; p_motivo: string }; Returns: undefined };
      criar_renegociacao: {
        Args: {
          p_cliente_id: string;
          p_tipo: string;
          p_origens: Json;
          p_parcelas: Json;
          p_acordo_id?: string | null;
          p_observacao?: string | null;
        };
        Returns: string;
      };
      finalizar_emissao_renegociacao: {
        Args: { p_id: string; p_integracao_id: string | null; p_retornos: Json };
        Returns: string;
      };
      registrar_baixa_original: { Args: { p_origem_id: string; p_status: string; p_erro?: string | null }; Returns: string };
      renegociacoes_do_cliente: { Args: { p_cliente_id: string }; Returns: RenegociacaoCliente[] };
      gerar_carne_veiculo: {
        Args: { p_veiculo_id: string; p_meses: number };
        Returns: {
          titulo_id: string; competencia: string | null; vencimento: string; valor: number;
          adesao: boolean; registrado: boolean;
        }[];
      };
      lead_adesao_tabela: {
        Args: { p_lead_id: string };
        Returns: number | null;
      };
      pro_rata_veiculo: {
        Args: { p_veiculo_id: string; p_ate: string; p_desde?: string | null };
        Returns: ProRataVeiculo[];
      };
      cancelar_veiculo: {
        Args: {
          p_veiculo_id: string; p_data: string; p_motivo: string;
          p_previsao_retorno?: boolean; p_data_retorno?: string | null; p_observacao?: string | null;
        };
        Returns: string;
      };
      criar_boleto_avulso: {
        Args: {
          p_cliente_id: string; p_tipo_id: string; p_valor: number; p_vencimento: string;
          p_veiculo_id?: string | null; p_descricao?: string | null;
        };
        Returns: string;
      };
      criar_cancelamento_boletos: {
        Args: { p_cliente_id: string; p_origens: Json; p_motivo: string };
        Returns: string;
      };
      criar_renegociacao_pro_rata: {
        Args: {
          p_veiculo_id: string; p_ate: string; p_desde?: string | null; p_cobrar?: boolean;
          p_vencimento?: string | null; p_origens?: Json; p_cancelamento_id?: string | null;
          p_observacao?: string | null;
        };
        Returns: string | null;
      };
      cancelamentos_do_veiculo: { Args: { p_veiculo_id: string }; Returns: CancelamentoVeiculo[] };
      revistoria_exigida: { Args: { p_cliente_id: string; p_origens?: Json | null }; Returns: RevistoriaExigida[] };
      solicitar_revistoria_cobranca: { Args: { p_veiculo_id: string; p_origem?: string }; Returns: RevistoriaSolicitada[] };
      revistoria_por_token: { Args: { p_token: string }; Returns: RevistoriaPublica[] };
      revistoria_itens_publica: { Args: { p_token: string }; Returns: RevistoriaItemPublico[] };
      registrar_midia_revistoria_publica: {
        Args: { p_token: string; p_tipo: string; p_url: string; p_tamanho?: number | null;
          p_arquivo?: string | null; p_duracao?: number | null };
        Returns: string;
      };
      concluir_revistoria_publica: { Args: { p_token: string }; Returns: string };
      revistorias_cobranca_listar: {
        Args: { p_situacao?: string | null; p_busca?: string | null; p_limite?: number };
        Returns: RevistoriaLinha[];
      };
      revistoria_cobranca_midias: { Args: { p_revistoria_id: string }; Returns: RevistoriaMidia[] };
      analisar_revistoria_cobranca: {
        Args: { p_revistoria_id: string; p_aprovar: boolean; p_motivo?: string | null };
        Returns: string;
      };
      dispensar_revistoria_cobranca: { Args: { p_veiculo_id: string; p_justificativa: string }; Returns: string };
      cancelar_revistoria_cobranca: { Args: { p_revistoria_id: string; p_motivo: string }; Returns: string };
      revistorias_a_solicitar: { Args: { p_limite?: number }; Returns: RevistoriaASolicitar[] };
      rotina_revistorias_cobranca: { Args: Record<string, never>; Returns: { canceladas: number; expiradas: number }[] };
      dias_revistoria_boleto: { Args: Record<string, never>; Returns: number };
      regua_cobranca: { Args: Record<string, never>; Returns: ReguaCobranca[] };
      rotina_regua_cobranca: {
        Args: Record<string, never>;
        Returns: { para_inadimplente: number; para_ativo: number; inativados: number }[];
      };
      vencidos_veiculo: {
        Args: { p_veiculo_id: string; p_min_dias?: number };
        Returns: { boletos: number; valor: number; dias: number }[];
      };
      cobranca_inativados: {
        Args: { p_inicio: string; p_fim: string; p_regional_id?: string | null };
        Returns: CobrancaInativados[];
      };
      cobranca_pode_cliente: { Args: { p_cliente_id: string }; Returns: boolean };
      cobranca_parametros: { Args: Record<string, never>; Returns: CobrancaParametros[] };
      salvar_parametros_cobranca: { Args: { p_meta: number; p_limite: number }; Returns: undefined };
      salvar_feriado_cobranca: { Args: { p_data: string; p_descricao: string }; Returns: undefined };
      remover_feriado_cobranca: { Args: { p_data: string }; Returns: undefined };
      definir_regionais_supervisor: { Args: { p_usuario_id: string; p_regionais: string[] }; Returns: number };
      regionais_do_supervisor: { Args: { p_usuario_id: string }; Returns: string[] };
      cobranca_indicadores: {
        Args: { p_inicio: string; p_fim: string; p_regional_id?: string | null };
        Returns: CobrancaIndicadores[];
      };
      cobranca_carteira: { Args: { p_regional_id?: string | null }; Returns: CobrancaCarteira[] };
      cobranca_calendario: {
        Args: { p_mes: string; p_regional_id?: string | null };
        Returns: CobrancaCalendarioLinha[];
      };
      cobranca_por_regional: { Args: { p_inicio: string; p_fim: string }; Returns: CobrancaPorRegional[] };
      cobranca_serie_mensal: {
        Args: { p_meses?: number; p_regional_id?: string | null };
        Returns: CobrancaSerieMes[];
      };
      cobranca_boletos_lista: {
        Args: {
          p_inicio?: string | null;
          p_fim?: string | null;
          p_regional_id?: string | null;
          p_situacoes?: string[] | null;
          p_ciclo?: number | null;
          p_somente_primeiro?: boolean;
          p_pago_inicio?: string | null;
          p_pago_fim?: string | null;
          p_limite?: number;
        };
        Returns: CobrancaBoletoLinha[];
      };
      cobranca_historico_resumo: { Args: Record<string, never>; Returns: CobrancaHistoricoResumo[] };
      cobranca_importar_historico_mutual: {
        Args: { p_cursor?: string | null; p_lote?: number; p_confirmar?: boolean };
        Returns: CobrancaImportacaoBloco[];
      };
      intervalo_contas_painel: {
        Args: Record<string, never>;
        Returns: IntervaloContasPainel[];
      };
      salvar_intervalo_contas_painel: {
        Args: { p_conta_de?: string | null; p_conta_ate?: string | null };
        Returns: undefined;
      };
      contas_plano_painel: {
        Args: Record<string, never>;
        Returns: ContaPlanoPainel[];
      };
      assist_painel_resumo: {
        Args: { p_data_inicio: string; p_data_fim: string; p_regional_id?: string | null };
        Returns: AssistPainelResumo[];
      };
      assist_painel_por_servico: {
        Args: { p_data_inicio: string; p_data_fim: string; p_regional_id?: string | null };
        Returns: AssistPainelServico[];
      };
      assist_painel_por_praca: {
        Args: { p_data_inicio: string; p_data_fim: string; p_regional_id?: string | null; p_limite?: number };
        Returns: AssistPainelPraca[];
      };
      assist_painel_serie: {
        Args: { p_meses?: number; p_regional_id?: string | null };
        Returns: AssistPainelMes[];
      };
      assist_painel_reincidencia: {
        Args: { p_data_inicio: string; p_data_fim: string; p_regional_id?: string | null; p_limite?: number };
        Returns: AssistPainelVeiculo[];
      };
      assist_painel_frota_situacao: {
        Args: { p_regional_id?: string | null };
        Returns: AssistPainelSituacao[];
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
      registrar_acionamento_negado: {
        Args: {
          p_veiculo_id: string; p_servico_id: string; p_motivo: string; p_observacao?: string | null;
          p_solicitante?: string | null; p_telefone?: string | null; p_origem?: Json;
        };
        Returns: AcionamentosAssistenciaRow;
      };
      negar_acionamento: {
        Args: { p_acionamento_id: string; p_motivo: string; p_observacao?: string | null };
        Returns: AcionamentosAssistenciaRow;
      };
      excluir_acionamento: {
        Args: { p_acionamento_id: string; p_motivo: string };
        Returns: {
          acionamento_id: string; protocolo: string | null; arquivos: string[];
          arquivos_financeiro: string[]; lancamento_excluido: boolean;
        };
      };
      marcar_voucher_enviado: {
        Args: { p_acionamento_id: string };
        Returns: AcionamentosAssistenciaRow;
      };
      pode_assistencia: { Args: Record<string, never>; Returns: boolean };
      pode_liberar_assistencia: { Args: Record<string, never>; Returns: boolean };
      minhas_permissoes: { Args: Record<string, never>; Returns: string[] };
      publicar_versao_termo: { Args: { p_modelo_id: string; p_observacao?: string | null }; Returns: TermoVersaoRow };
      anexar_pdf_versao_termo: { Args: { p_versao_id: string; p_path: string; p_sha256: string }; Returns: undefined };
      registrar_termo_emitido: {
        Args: { p_versao_id: string; p_cliente_id: string; p_veiculo_id: string | null; p_html: string;
                p_campos_vazios?: string[]; p_visivel_portal?: boolean | null };
        Returns: TermoEmitidoRow;
      };
      anexar_pdf_termo: { Args: { p_id: string; p_path: string; p_sha256: string; p_bytes: number }; Returns: undefined };
      cancelar_termo_emitido: { Args: { p_id: string; p_motivo: string }; Returns: undefined };
      portal_termo_emitido: { Args: { p_id: string; p_visivel: boolean }; Returns: undefined };
      pode_ver_termo_emitido: { Args: { p_id: string }; Returns: boolean };
      portal_documentos: { Args: Record<string, never>; Returns: PortalDocumento[] };
      salvar_permissoes_perfil: {
        Args: { p_papel: string; p_celulas: { modulo: string; acao: string; concedida: boolean }[] };
        Returns: number;
      };
      permissoes_extras_usuario: { Args: { p_usuario: string }; Returns: PermissaoExtraUsuario[] };
      salvar_permissoes_usuario: {
        Args: { p_usuario: string; p_extras: { modulo: string; acao: string; expira_em?: string | null }[]; p_motivo: string | null };
        Returns: number;
      };
      copiar_perfil_usuario: {
        Args: { p_origem: string; p_destino: string; p_copiar_unidade?: boolean; p_motivo?: string | null };
        Returns: {
          papel_de: string; papel_para: string; regional_de: string | null; regional_para: string | null;
          extras: number; unidades_supervisor: number; aviso: string | null;
        };
      };
      salvar_permissao_papel: {
        Args: { p_papel: string; p_permissao: string; p_concedida: boolean };
        Returns: PapelPermissoesRow;
      };
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
      eventos_mutual_do_cliente: {
        Args: { p_cliente_id: string; p_limite?: number };
        Returns: EventoMutualCliente[];
      };
      eventos_historico_listar: {
        Args: {
          p_busca?: string | null; p_tipo?: string | null; p_de?: string | null; p_ate?: string | null;
          p_regional_id?: string | null; p_limite?: number; p_offset?: number;
          p_no_kanban?: boolean | null;
        };
        Returns: EventoHistoricoLinha[];
      };
      transportar_eventos_historico: {
        Args: { p_ids: string[] };
        Returns: TransporteEventoHistorico[];
      };
      eventos_prazos: {
        Args: { p_regional?: string | null; p_evento?: string | null; p_incluir_encerrados?: boolean };
        Returns: EventoPrazo[];
      };
      marcar_documentacao_completa: {
        Args: { p_evento: string; p_data?: string | null; p_observacao?: string | null };
        Returns: undefined;
      };
      reabrir_documentacao_evento: { Args: { p_evento: string; p_motivo: string }; Returns: undefined };
      aplicar_documentos_padrao_evento: { Args: { p_evento: string }; Returns: number };
      dar_ciencia_prazo_evento: { Args: { p_evento: string }; Returns: number };
      atualizar_prazos_eventos: { Args: Record<string, never>; Returns: Json };
      marcar_alertas_prazo_notificados: { Args: { p_ids: string[] }; Returns: number };
      configuracao_prazo_evento: {
        Args: Record<string, never>;
        Returns: { prazo_dias: number; aviso: number; atencao: number; urgencia: number; critico: number }[];
      };
      salvar_marcos_prazo_evento: {
        Args: { p_aviso: number; p_atencao: number; p_urgencia: number; p_critico: number };
        Returns: undefined;
      };
      eventos_historico_resumo: { Args: Record<string, never>; Returns: EventosHistoricoResumo[] };
      mutual_importar_eventos_historico: {
        Args: { p_confirmar?: boolean };
        Returns: ImportacaoEventosHistorico[];
      };
      boletos_mutual_do_cliente: {
        Args: { p_cliente_id: string; p_veiculo_id?: string | null; p_limite?: number };
        Returns: BoletoMutualCliente[];
      };
      portal_boletos_mutual: { Args: { p_limite?: number }; Returns: PortalBoletoMutual[] };
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
          p_limpar_plano?: boolean;
          p_valor_assistencia_profissional?: number | null;
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
      // --- Link publico da VISTORIA (0076): capacidade propria, com prazo.
      // Nao confundir com `lead_por_token_publico`, que e a da cotacao.
      criar_comunicacao_evento: {
        Args: { p_evento_id: string; p_papel: string; p_nome?: string | null; p_telefone?: string | null;
                p_email?: string | null; p_terceiro_id?: string | null; p_dias?: number };
        Returns: EventoComunicacaoRow;
      };
      registrar_envio_comunicacao: { Args: { p_id: string; p_canal: string }; Returns: EventoComunicacaoRow };
      renovar_comunicacao_evento: { Args: { p_id: string; p_dias?: number }; Returns: EventoComunicacaoRow };
      revogar_comunicacao_evento: { Args: { p_id: string; p_motivo?: string | null }; Returns: EventoComunicacaoRow };
      pedir_correcao_comunicacao: { Args: { p_id: string; p_comentario: string }; Returns: EventoComunicacaoRow };
      conferir_comunicacao: { Args: { p_id: string }; Returns: EventoComunicacaoRow };
      registrar_declaracao_equipe: { Args: { p_id: string; p_dados: Json }; Returns: EventoDeclaracaoRow };
      salvar_rascunho_comunicacao_equipe: { Args: { p_id: string; p_dados: Json }; Returns: undefined };
      comunicacao_publica_por_token: { Args: { p_token: string }; Returns: EventoComunicacaoRow };
      comunicacao_publica: { Args: { p_token: string }; Returns: Json };
      verificar_comunicacao: { Args: { p_token: string; p_doc_inicio: string; p_nascimento?: string | null }; Returns: Json };
      salvar_rascunho_comunicacao: { Args: { p_token: string; p_dados: Json }; Returns: undefined };
      enviar_comunicacao: {
        Args: { p_token: string; p_dados: Json; p_declarou: boolean; p_ip?: string | null; p_user_agent?: string | null };
        Returns: Json;
      };
      registrar_anexo_comunicacao: {
        Args: { p_token: string; p_pose: string; p_tipo: string; p_url: string; p_tamanho: number; p_arquivo: string };
        Returns: string;
      };
      anexos_comunicacao_publica: {
        Args: { p_token: string };
        Returns: { id: string; pose: string | null; tipo: string; arquivo_url: string; nome_original: string | null; created_at: string }[];
      };
      remover_anexo_comunicacao: { Args: { p_token: string; p_anexo: string }; Returns: string | null };
      salvar_perfil_acesso: {
        Args: { p_id: string | null; p_nome: string; p_descricao?: string | null;
                p_papel_base?: string | null; p_copiar_de?: string | null };
        Returns: string;
      };
      excluir_perfil_acesso: { Args: { p_id: string }; Returns: undefined };
      comunicacoes_resumo_eventos: {
        Args: { p_eventos: string[] };
        Returns: { evento_id: string; total: number; respondidas: number }[];
      };
      vistoria_por_token: {
        Args: { p_token: string };
        Returns: {
          valida: boolean; motivo: string;
          lead_id: string | null; vistoria_id: string | null;
          nome: string | null; placa: string | null;
          marca: string | null; modelo: string | null;
          expira_em: string | null;
        }[];
      };
      registrar_foto_vistoria_publica: {
        Args: {
          p_token: string; p_tipo: string; p_url: string;
          p_tamanho?: number | null; p_arquivo?: string | null;
        };
        Returns: string;
      };
      gerar_link_vistoria: {
        Args: { p_lead_id: string; p_dias?: number };
        Returns: { token: string; expira_em: string; reaproveitado: boolean }[];
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
        Args: {
          p_lead_id: string; p_cpf_cnpj?: string | null;
          p_dia_vencimento?: number | null; p_vencimento_adesao?: string | null;
        };
        Returns: string;
      };
      substituir_tabela_precos: {
        Args:
          | { p_tipo_veiculo: string; p_faixas: Json; p_participacoes: Json }
          | { p_tipo_veiculo: string; p_faixas: Json; p_participacoes: Json; p_adesoes: Json };
        Returns: undefined;
      };
      // ---- 0062: integracao com o Mutual (Fase 1 - so leitura e diagnostico) ----
      mutual_registrar_captura: {
        Args: { p_entidade: EntidadeMutual; p_registros: Json };
        Returns: number;
      };
      mutual_diagnostico: { Args: Record<string, never>; Returns: MutualDiagnostico[] };
      mutual_por_status: { Args: Record<string, never>; Returns: MutualPorStatus[] };
      mutual_filiais: { Args: Record<string, never>; Returns: MutualFilial[] };
      mutual_quarentena: {
        Args: {
          p_limite?: number;
          p_somente_faturaveis?: boolean;
          p_incluir_placa_pendente?: boolean;
        };
        Returns: MutualQuarentena[];
      };
      mutual_status_nao_mapeados: {
        Args: Record<string, never>;
        Returns: MutualStatusNaoMapeado[];
      };
      mutual_status_cruzado: {
        Args: Record<string, never>;
        Returns: MutualStatusCruzado[];
      };
      mutual_periodicidade: { Args: Record<string, never>; Returns: MutualPeriodicidade[] };
      mutual_campos: {
        Args: { p_entidade: EntidadeMutual; p_caminho?: string | null; p_amostra?: number };
        Returns: MutualCampo[];
      };
      mutual_resumo_capturas: { Args: Record<string, never>; Returns: MutualResumoCaptura[] };
      // 0073 — a unidade pelo CONSULTOR: o funil e a fila de quem se perde.
      mutual_cobertura_consultor: {
        Args: {
          p_somente_faturaveis?: boolean;
          p_chaves_doc?: string[];
          p_chaves_email?: string[];
          p_chaves_nome?: string[];
        };
        Returns: MutualPassoFunil[];
      };
      mutual_consultores_sem_vendedor: {
        Args: {
          p_limite?: number;
          p_somente_faturaveis?: boolean;
          p_chaves_doc?: string[];
          p_chaves_email?: string[];
          p_chaves_nome?: string[];
        };
        Returns: MutualConsultorPendente[];
      };
      // 0082 — a unidade pelo ASSOCIADO. Substitui o funil do consultor, que
      // mede uma corrente vazia (`consultant` vem em branco em 100%).
      mutual_cobertura_unidade: {
        Args: { p_somente_faturaveis?: boolean };
        Returns: MutualPassoFunil[];
      };
      mutual_regional_do_externo: { Args: { p_id_externo: string }; Returns: string | null };
      // 0083 — a EQUIPE DE VENDAS: o nivel que vira `regionais`.
      mutual_equipes_vendas: { Args: Record<string, never>; Returns: MutualEquipeVendas[] };
      mutual_equipe_do_externo: { Args: { p_id_externo: string }; Returns: string | null };
      // 0084 — A CARGA. `mutual_carga_linhas` e a fonte unica: a previa agrega
      // sobre ela e a execucao percorre ela.
      mutual_tipos_veiculo_externos: {
        Args: Record<string, never>;
        Returns: MutualTipoVeiculoExterno[];
      };
      mutual_planos_externos: {
        Args: { p_regional_id?: string | null };
        Returns: MutualPlanoExterno[];
      };
      mutual_categorias_veiculo: {
        Args: { p_regional_id?: string | null };
        Returns: MutualCategoriaVeiculo[];
      };
      // 0091 — o plano pelos PRODUTOS do veiculo (terceiros -> Ouro, sem -> Essencial).
      mutual_terceiros_por_objeto: {
        Args: { p_regional_id: string; p_tipo_veiculo_id?: string | null };
        Returns: {
          veiculo_id: string; placa: string; objeto_id: string; plan_id: string | null;
          plano_atual_id: string | null; plano_atual: string | null; produtos: number;
          tem_terceiros: boolean | null; nomes: string | null;
          chave_objeto: string | null; chave_nome: string | null;
        }[];
      };
      mutual_aplicar_plano_por_terceiros: {
        Args: {
          p_regional_id: string; p_tipo_veiculo_id: string; p_plano_com: string; p_plano_sem: string;
          p_substituir?: string[]; p_confirmar?: boolean;
        };
        Returns: { acao: string; quantidade: number }[];
      };
      mutual_carga_linhas: {
        Args: {
          p_regional_id: string;
          p_incluir_inativos?: boolean;
          p_somente_problemas?: boolean;
          p_limite?: number | null;
        };
        Returns: MutualCargaLinha[];
      };
      mutual_carga_previa: {
        Args: { p_regional_id: string; p_incluir_inativos?: boolean };
        Returns: MutualDiagnostico[];
      };
      mutual_executar_carga: {
        Args: {
          p_regional_id: string;
          p_incluir_inativos?: boolean;
          p_confirmar?: boolean;
          /** 0094 — com bloco, a carga vira fila: prepara uma vez e grava aos poucos. */
          p_lote?: number | null;
          p_preparar?: boolean;
        };
        Returns: MutualCargaResultado[];
      };
      mutual_desfazer_carga: {
        Args: { p_regional_id: string; p_confirmar?: boolean };
        Returns: MutualDesfazerResultado[];
      };
      assistencia_profissional_regras: {
        Args: { p_lead_id?: string | null };
        Returns: { regional_id: string | null; regional_nome: string | null; paga: boolean; minimo: number; maximo: number }[];
      };
      mutual_assistencia_profissional_veiculos: {
        Args: { p_regional_id?: string | null };
        Returns: {
          veiculo_id: string; placa: string | null; associado: string | null; regional_id: string | null;
          regional_nome: string | null; produto_nome: string; subproduct_config_id: string | null;
          valor_mutual: number | null; valor_atual: number; situacao: 'APLICAR' | 'JA_APLICADO' | 'DIFERENTE' | 'SEM_VALOR';
        }[];
      };
      mutual_assistencia_profissional_configs: {
        Args: Record<string, never>;
        Returns: { subproduct_config_id: string; veiculos: number; valor: number | null }[];
      };
      mutual_definir_valor_assistencia_profissional: {
        Args: { p_config: string; p_valor: number | null };
        Returns: undefined;
      };
      mutual_aplicar_assistencia_profissional: {
        Args: { p_regional_id?: string | null; p_confirmar?: boolean };
        Returns: { aplicar: number; ja_aplicado: number; diferente: number; sem_valor: number; gravados: number }[];
      };
      mutual_vendedores_resumo: {
        Args: { p_regional_id: string };
        Returns: MutualVendedorResumo[];
      };
      mutual_vincular_vendedores: {
        Args: { p_regional_id: string; p_confirmar?: boolean };
        Returns: MutualVincularVendedores[];
      };
      veiculo_tem_movimento: { Args: { p_veiculo_id: string }; Returns: boolean };
      // 0082 — a ponte id externo -> registro do SCar (a carga e re-executavel).
      vincular_externo: {
        Args: {
          p_entidade: string;
          p_id_externo: string;
          p_tabela: string;
          p_registro_id: string;
          p_sistema?: string;
          p_observacao?: string | null;
        };
        Returns: number;
      };
      desvincular_externo: {
        Args: { p_entidade: string; p_id_externo: string; p_sistema?: string };
        Returns: boolean;
      };
      registro_do_externo: {
        Args: { p_entidade: string; p_id_externo: string; p_sistema?: string };
        Returns: string | null;
      };
      vinculos_orfaos: { Args: Record<string, never>; Returns: VinculoOrfao[] };
      // 0082 — o interruptor da cobranca (o cutover por unidade).
      definir_cobranca_externa_regional: {
        Args: { p_regional_id: string | null; p_externa: boolean; p_motivo?: string | null };
        Returns: number;
      };
      cobranca_externa_resumo: {
        Args: Record<string, never>;
        Returns: CobrancaExternaResumo[];
      };
      // 0067 — a unidade com os numeros que dizem se ela esta viva.
      regionais_listar: {
        Args: { p_incluir_inativas?: boolean };
        Returns: RegionalListada[];
      };
      // 0080 — catalogo de cores do veiculo.
      cores_listar: {
        Args: { p_incluir_inativas?: boolean };
        Returns: CorListada[];
      };
      cores_nao_reconhecidas: { Args: Record<string, never>; Returns: CorNaoReconhecida[] };
      // 0081 — adicional de risco por regional.
      adicionais_risco_do_tipo: {
        Args: { p_tipo_veiculo_id: string };
        Returns: AdicionalRiscoLinha[];
      };
      salvar_adicional_risco: {
        Args: {
          p_regional_id: string;
          p_tipo_veiculo_id: string;
          p_valor: number | null;
          p_justificativa?: string | null;
        };
        Returns: string | null;
      };
      adicional_risco_regional: {
        Args: { p_regional_id: string | null; p_tipo_veiculo_id: string; p_data?: string };
        Returns: number;
      };
      regional_preco_do_lead: { Args: { p_lead_id: string }; Returns: string | null };
      divergencia_regional_preco: {
        Args: { p_lead_id: string };
        Returns: DivergenciaRegionalPreco[];
      };
      cor_do_texto: { Args: { p_texto: string }; Returns: string | null };
      mutual_cores_nao_mapeadas: {
        Args: Record<string, never>;
        Returns: MutualCorNaoMapeada[];
      };
      // 0068 — a equipe com a ficha e o vinculo de vendedor.
      usuarios_listar: {
        Args: { p_incluir_inativos?: boolean };
        Returns: UsuarioListado[];
      };
      usuario_acesso_ativo: { Args: Record<string, never>; Returns: boolean };
      // 0069 — carga da equipe de vendas por planilha.
      importar_vendedores: {
        Args: { p_linhas: Json; p_respeitar_status?: boolean };
        Returns: { criados: number; atualizados: number }[];
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
