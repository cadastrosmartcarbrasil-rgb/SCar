import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Consulta publica de CNPJ (BrasilAPI). Server-side (evita CORS) com timeout.
// Em falha/timeout retorna found:false para o formulario liberar preenchimento manual.
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });

  const { cnpj } = await request.json();
  const c = String(cnpj ?? '').replace(/\D/g, '');
  if (c.length !== 14) return NextResponse.json({ found: false, error: 'CNPJ invalido' });

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${c}`, { signal: ctrl.signal });
    clearTimeout(timeout);
    if (!res.ok) return NextResponse.json({ found: false });

    const d = await res.json();
    return NextResponse.json({
      found: true,
      razao_social: d.razao_social ?? null,
      nome_fantasia: d.nome_fantasia ?? null,
      situacao_cadastral: d.descricao_situacao_cadastral ?? null,
      cnae_principal: d.cnae_fiscal_descricao
        ? `${d.cnae_fiscal ?? ''} - ${d.cnae_fiscal_descricao}`
        : null,
      email: d.email ?? null,
      telefone: d.ddd_telefone_1 ?? null,
      endereco: {
        cep: d.cep ?? null,
        logradouro: [d.descricao_tipo_de_logradouro, d.logradouro].filter(Boolean).join(' '),
        numero: d.numero ?? null,
        complemento: d.complemento ?? null,
        bairro: d.bairro ?? null,
        cidade: d.municipio ?? null,
        uf: d.uf ?? null,
      },
      raw: d,
    });
  } catch {
    clearTimeout(timeout);
    return NextResponse.json({ found: false });
  }
}
