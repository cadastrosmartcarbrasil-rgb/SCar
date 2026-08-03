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
  | 'admin' | 'gestor_regional' | 'consultor_vendas' | 'financeiro' | 'sinistro' | 'cotador';
export type TipoPessoa = 'PF' | 'PJ';
export type StatusCliente =
  | 'ativo' | 'inadimplente' | 'cancelado' | 'inativo' | 'suspenso' | 'excluido';
export type UsoVeiculo = 'passeio' | 'app' | 'comercial';
export type StatusVeiculo = 'ativo' | 'suspenso' | 'baixado' | 'inativo' | 'excluido';
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
  usuario_id: string;
  regional_id: string | null;
  taxa_comissao_adesao: number;
  taxa_comissao_recorrente: number;
  ativo: boolean;
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
};

export type PlanosProtecaoRow = Timestamps & {
  id: string;
  nome: string;
  taxa_administrativa: number;
  cota_participacao: number;
  coberturas: Json;
  ativo: boolean;
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
};

export type MarcasRow = {
  id: string;
  nome: string;
  ativo: boolean;
  created_at: string;
};

export type ModelosRow = {
  id: string;
  marca_id: string;
  nome: string;
  ativo: boolean;
  created_at: string;
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
  tipo_evento: TipoEvento;
  descricao: string | null;
  status: StatusEvento;
  operador_atual_id: string | null;
  regional_id: string | null;
};

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
        ]
      >;
      historico_protocolo: TableDef<HistoricoProtocoloRow>;
      anexos_evento: TableDef<AnexosEventoRow>;
      cotacoes_pecas: TableDef<CotacoesPecasRow>;
      itens_cotacao: TableDef<ItensCotacaoRow, [Rel<'cotacao_id', 'cotacoes_pecas'>]>;
      notas_fiscais_evento: TableDef<NotasFiscaisEventoRow>;
      email_templates: TableDef<EmailTemplatesRow>;
      integracoes_bancarias: TableDef<IntegracoesBancariasRow, [Rel<'regional_id', 'regionais'>]>;
      marcas: TableDef<MarcasRow>;
      modelos: TableDef<ModelosRow, [Rel<'marca_id', 'marcas'>]>;
    };
    Views: { [_ in never]: never };
    Functions: {
      gerar_dre: {
        Args: { p_data_inicio: string; p_data_fim: string; p_regional_id?: string | null };
        Returns: DreLinha[];
      };
      gerar_dre_resumo: {
        Args: { p_data_inicio: string; p_data_fim: string; p_regional_id?: string | null };
        Returns: DreResumo[];
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
    };
    Enums: {
      papel_usuario: PapelUsuario;
      status_evento: StatusEvento;
      status_titulo: StatusTitulo;
    };
    CompositeTypes: { [_ in never]: never };
  };
};
