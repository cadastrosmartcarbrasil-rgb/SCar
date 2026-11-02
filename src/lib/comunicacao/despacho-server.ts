import { createAdminClient } from '@/lib/supabase/admin';
import { remetenteCobranca } from '@/lib/email';
import {
  RAZAO_SOCIAL_PADRAO, TENTATIVAS_MAXIMAS, decidirEnvio, erroTransitorio, hojeSp, proximaTentativa,
  veiculoDoAviso, type Rodape, type TemplateEmail,
} from './cobranca';
import { renderizarAviso } from './render-email';
import { textosGravadosEmail } from './modelos-server';
import { provedorDeEmail, type EmailProvider } from './provedor';
import { expiracaoDoLink, tokenDoBoleto } from './servidor';

type Admin = ReturnType<typeof createAdminClient>;

export async function rodapeDaEmpresa(admin: Admin): Promise<Rodape> {
  const { data } = await admin.from('empresa')
    .select('razao_social, cnpj, whatsapp_principal, whatsapp_suporte, email_financeiro, email_principal, site')
    .limit(1).maybeSingle();
  const e = data as Record<string, string | null> | null;
  return {
    razaoSocial: e?.razao_social || RAZAO_SOCIAL_PADRAO,
    cnpj: e?.cnpj ?? null,
    whatsapp: e?.whatsapp_suporte || e?.whatsapp_principal || null,
    email: e?.email_financeiro || e?.email_principal || null,
    site: e?.site ?? null,
  };
}

export function linkDoBoleto(origem: string, tituloId: string, vencimento: string | null): string | null {
  const segredo = (process.env.EMAIL_LINK_SECRET ?? '').trim();
  if (!segredo || segredo.length < 16 || !vencimento) return null;
  return `${origem.replace(/\/$/, '')}/b/${tokenDoBoleto(tituloId, expiracaoDoLink(vencimento), segredo)}`;
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type ResultadoRotina = {
  fila: Record<string, unknown> | null;
  enviados: number;
  cancelados: number;
  reagendados: number;
  falhas: number;
  aviso?: string;
};

/**
 * A rotina: enfileira os avisos do dia e despacha em lotes, respeitando a taxa,
 * a pausa, a janela (no banco) e o modo sandbox (aqui). Para em `orcamentoMs`
 * para nao estourar o tempo da chamada; o resto sai na proxima rodada.
 */
export async function rodarRotinaEmail(
  origem: string,
  opts: { orcamentoMs?: number; provedor?: EmailProvider | null; somenteFila?: boolean } = {},
): Promise<ResultadoRotina> {
  const admin = createAdminClient();
  const inicio = Date.now();
  const orcamento = opts.orcamentoMs ?? 100_000;

  const { data: fila, error: erroFila } = await admin.rpc('enfileirar_avisos_cobranca', {});
  if (erroFila) throw new Error(`enfileirar: ${erroFila.message}`);

  const out: ResultadoRotina = { fila: (fila as Record<string, unknown>) ?? null, enviados: 0, cancelados: 0, reagendados: 0, falhas: 0 };
  if (opts.somenteFila) return out;

  const provedor = opts.provedor === undefined ? provedorDeEmail() : opts.provedor;
  if (!provedor) {
    out.aviso = 'RESEND_API_KEY nao configurada: os avisos ficam na fila e nao saem.';
    return out;
  }

  const { data: cfg } = await admin.from('email_config').select('*').eq('id', true).maybeSingle();
  if (!cfg) throw new Error('email_config ausente');
  if (cfg.pausado) {
    out.aviso = 'Envios pausados no painel.';
    return out;
  }
  const rodape = await rodapeDaEmpresa(admin);
  const textos = await textosGravadosEmail(admin);
  const { data: regua } = await admin.from('email_regua').select('codigo, offset_dias');
  const offsets = new Map((regua ?? []).map((r) => [r.codigo, r.offset_dias]));
  const intervalo = Math.ceil(1000 / Math.max(0.1, Number(cfg.limite_por_segundo)));
  const de = remetenteCobranca();

  while (Date.now() - inicio < orcamento) {
    const { data: lote, error } = await admin.rpc('reservar_lote_email', { p_limite: 50 });
    if (error) throw new Error(`reservar: ${error.message}`);
    if (!lote || lote.length === 0) break;

    // o veiculo do boleto (modelo + final da placa); fatura agrupada nao tem
    const titulos = lote.map((i) => i.titulo_id).filter((x): x is string => !!x);
    const veiculoDoTitulo = new Map<string, { rotulo: string | null; rastreador: boolean }>();
    if (titulos.length) {
      const { data: tv } = await admin.from('titulos_financeiros')
        .select('id, veiculos(modelo, placa, rastreador_imei)').in('id', titulos);
      type V = { modelo: string | null; placa: string | null; rastreador_imei: string | null };
      for (const t of (tv ?? []) as { id: string; veiculos: V | null }[]) {
        if (!t.veiculos) continue;
        veiculoDoTitulo.set(t.id, {
          rotulo: veiculoDoAviso(t.veiculos.modelo, t.veiculos.placa),
          rastreador: !!t.veiculos.rastreador_imei,
        });
      }
    }
    const hoje = hojeSp();

    for (const item of lote) {
      if (Date.now() - inicio >= orcamento) {
        // sem tempo: devolve para a fila (a proxima rodada pega)
        await admin.rpc('concluir_envio_email', { p_id: item.id, p_status: 'pendente' });
        continue;
      }
      const decisao = decidirEnvio(item, { modo: cfg.modo, allowlist: cfg.allowlist ?? [] });
      if (decisao.acao === 'cancelar') {
        await admin.rpc('concluir_envio_email', { p_id: item.id, p_status: 'cancelado', p_erro: decisao.motivo });
        out.cancelados++;
        continue;
      }
      const { data: suprimido } = await admin.rpc('email_suprimido', { p_email: item.destinatario });
      if (suprimido) {
        await admin.rpc('concluir_envio_email', { p_id: item.id, p_status: 'suprimido', p_erro: 'e-mail na lista de supressao' });
        out.cancelados++;
        continue;
      }
      const r = await renderizarAviso(item.template as TemplateEmail, {
        nome: item.cliente_nome,
        valor: item.valor == null ? null : Number(item.valor),
        vencimento: item.data_vencimento,
        linhaDigitavel: item.linha_digitavel,
        pixCopiaCola: item.pix_copia_cola,
        linkBoleto: item.titulo_id ? linkDoBoleto(origem, item.titulo_id, item.data_vencimento) : null,
        offsetDias: offsets.get(item.regua_codigo) ?? 0,
        veiculo: item.titulo_id ? veiculoDoTitulo.get(item.titulo_id)?.rotulo ?? null : null,
        temRastreador: item.titulo_id ? veiculoDoTitulo.get(item.titulo_id)?.rastreador : undefined,
      }, rodape, { origem, hoje, textos });

      const res = await provedor.enviar({
        de, para: item.destinatario, assunto: r.assunto, html: r.html, texto: r.texto,
        responderPara: cfg.reply_to || rodape.email, chave: item.id,
        tags: { aviso: item.regua_codigo, fluxo: 'cobranca' },
      });
      if (res.ok) {
        await admin.rpc('concluir_envio_email', { p_id: item.id, p_status: 'enviado', p_message_id: res.messageId, p_assunto: r.assunto });
        out.enviados++;
      } else if (erroTransitorio(res.status) && item.tentativas < TENTATIVAS_MAXIMAS) {
        await admin.rpc('concluir_envio_email', {
          p_id: item.id, p_status: 'pendente', p_erro: res.erro, p_proxima: proximaTentativa(item.tentativas).toISOString(), p_assunto: r.assunto,
        });
        out.reagendados++;
      } else {
        await admin.rpc('concluir_envio_email', { p_id: item.id, p_status: 'falhou', p_erro: res.erro, p_assunto: r.assunto });
        out.falhas++;
      }
      await dormir(intervalo);
    }
  }
  return out;
}

/** Origem publica (atras do Caddy vem nos x-forwarded-*); EMAIL_LINK_BASE manda. */
export function origemPublica(request: Request): string {
  const fixa = (process.env.EMAIL_LINK_BASE ?? '').trim();
  if (fixa) return fixa.replace(/\/$/, '');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') ?? 'https';
  return host ? `${proto.split(',')[0].trim()}://${host.split(',')[0].trim()}` : new URL(request.url).origin;
}
