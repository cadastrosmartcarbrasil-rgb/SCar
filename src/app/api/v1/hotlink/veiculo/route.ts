import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { consultarPlacaNoServidor } from '@/lib/fipe-server';
import { normalizarPlaca } from '@/lib/placa';
import { placaCompleta, tipoVeiculoSugerido } from '@/lib/venda-publica';

/**
 * Identificacao do veiculo pela PLACA, na hora em que ela e digitada.
 *
 * E daqui que sai o tipo (carro, moto, pick-up...): quem define e o registro
 * da FIPE, nao uma escolha previa do visitante. O que ele faz e confirmar —
 * ou corrigir, se a nossa leitura errar.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const token = String(body?.token ?? '').trim();
  const placa = normalizarPlaca(String(body?.placa ?? '').trim());

  if (!token) return NextResponse.json({ error: 'Sessao expirada' }, { status: 400 });
  if (!placaCompleta(placa)) {
    return NextResponse.json({ error: 'Informe a placa completa' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: sessoes } = await admin.rpc('lead_por_token_publico', { p_token: token });
  const lead = sessoes?.[0];
  if (!lead) return NextResponse.json({ error: 'Sessao invalida' }, { status: 404 });

  const { data: tipos } = await admin
    .from('tipos_veiculo').select('id, nome').eq('status', true).order('nome');

  const consulta = await consultarPlacaNoServidor(placa);
  const fipe = consulta?.valor ?? null;
  // O REGISTRO do documento (chassi, motor, cor, ano de fabricacao) vem na
  // mesma resposta e e gravado no lead: quando o vendedor abrir o fechamento
  // da venda, esses campos — obrigatorios para a entrada na base (0034) — ja
  // estao la, em vez de serem digitados a mao no fim.
  const reg = consulta?.registro ?? null;

  // Sem token da FIPE, placa desconhecida ou API fora: nao e erro — o visitante
  // segue informando marca/modelo e o valor de mercado.
  if (!fipe?.valor) {
    // Mesmo sem avaliacao o registro pode ter vindo: chassi nao depende do preco.
    if (reg) {
      await admin.from('leads').update({
        placa,
        chassi: reg.chassi,
        numero_motor: reg.numeroMotor,
        cor: reg.cor,
        ano_fabricacao: reg.anoFabricacao,
        ultima_interacao_em: new Date().toISOString(),
      }).eq('id', lead.lead_id);
    }
    return NextResponse.json({
      ok: true,
      encontrado: false,
      placa,
      tipos: tipos ?? [],
      tipo_sugerido: tipoVeiculoSugerido(null, tipos ?? []),
    });
  }

  const tipoSugerido = tipoVeiculoSugerido(
    fipe.bruto as Record<string, unknown>,
    tipos ?? [],
  );

  await admin.from('leads').update({
    placa,
    marca: fipe.marca,
    modelo: fipe.modelo,
    ano_modelo: fipe.anoModelo,
    valor_fipe: fipe.valor,
    codigo_fipe: fipe.codigoFipe,
    origem_fipe: 'API',
    tipo_veiculo_id: tipoSugerido,
    // Registro do documento (quando veio). `?? null` e nao `?? undefined`:
    // recapturar a mesma placa tem de reescrever o mesmo valor, nao manter
    // um dado antigo de outra consulta.
    chassi: reg?.chassi ?? null,
    numero_motor: reg?.numeroMotor ?? null,
    cor: reg?.cor ?? null,
    ano_fabricacao: reg?.anoFabricacao ?? null,
    ultima_interacao_em: new Date().toISOString(),
  }).eq('id', lead.lead_id);

  return NextResponse.json({
    ok: true,
    encontrado: true,
    placa,
    marca: fipe.marca,
    modelo: fipe.modelo,
    ano: fipe.anoModelo,
    valor_fipe: fipe.valor,
    tipos: tipos ?? [],
    tipo_sugerido: tipoSugerido,
  });
}
