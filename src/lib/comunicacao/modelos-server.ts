import type { createAdminClient } from '@/lib/supabase/admin';
import type { CodigoModeloEmail, TextosModelo } from './modelos';

/** Os textos gravados de cada modelo de e-mail (0170); falhar a leitura = textos originais. */
export async function textosGravadosEmail(
  admin: ReturnType<typeof createAdminClient>,
): Promise<Partial<Record<CodigoModeloEmail, TextosModelo>>> {
  const { data, error } = await admin.from('comunicacao_modelos').select('codigo, textos').eq('canal', 'EMAIL');
  if (error) {
    console.error('[modelos] leitura dos textos falhou; seguem os originais:', error.message);
    return {};
  }
  return Object.fromEntries((data ?? []).map((m) => [m.codigo, m.textos ?? {}]));
}

/** Os textos gravados dos modelos de WhatsApp (0172); falhar a leitura = textos originais. */
export async function textosGravadosWhatsApp(
  admin: ReturnType<typeof createAdminClient>,
): Promise<Record<string, TextosModelo>> {
  const { data, error } = await admin.rpc('modelos_whatsapp');
  if (error) {
    console.error('[modelos] leitura dos textos de WhatsApp falhou; seguem os originais:', error.message);
    return {};
  }
  return Object.fromEntries((data ?? []).map((m) => [m.codigo, m.textos ?? {}]));
}
