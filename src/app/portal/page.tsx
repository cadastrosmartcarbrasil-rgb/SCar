import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatDate } from '@/lib/utils';
import { STATUS_TITULO_LABEL, STATUS_VEICULO_LABEL } from '@/types/domain';

// Portal do Associado: frota protegida + boletos pendentes.
// Todas as consultas sao filtradas pelo RLS (o associado so ve os proprios dados).
export default async function PortalPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/portal/login');

  const { data: cliente } = await supabase
    .from('clientes')
    .select('id, nome_razao_social')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (!cliente) {
    // Usuario autenticado que nao e associado (provavelmente staff).
    redirect('/dashboard');
  }

  const [{ data: veiculos }, { data: titulos }] = await Promise.all([
    supabase.from('veiculos').select('id, placa, marca, modelo, status').eq('cliente_id', cliente.id),
    supabase
      .from('titulos_financeiros')
      .select('id, valor, data_vencimento, status, url_boleto')
      .eq('cliente_id', cliente.id)
      .in('status', ['pendente', 'vencido'])
      .order('data_vencimento'),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Ola, {cliente.nome_razao_social}</h1>
          <p className="text-sm text-slate-500">Bem-vindo ao seu portal de protecao veicular.</p>
        </div>
        <a
          href="/portal/sinistros/novo"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Abrir sinistro
        </a>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Minha Frota Protegida</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(veiculos ?? []).map((v) => (
            <div key={v.id} className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-0">
              <span className="font-mono font-medium text-slate-800">{v.placa}</span>
              <span className="text-slate-500">
                {v.marca} {v.modelo}
              </span>
              <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                {STATUS_VEICULO_LABEL[v.status]}
              </span>
            </div>
          ))}
          {(veiculos ?? []).length === 0 && (
            <p className="text-sm text-slate-400">Nenhum veiculo vinculado.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Boletos Pendentes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(titulos ?? []).map((t) => {
            const st = STATUS_TITULO_LABEL[t.status];
            return (
              <div key={t.id} className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-0">
                <div>
                  <p className="font-medium text-slate-800">{formatCurrency(t.valor)}</p>
                  <p className="text-xs text-slate-500">Vence em {formatDate(t.data_vencimento)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`rounded px-2 py-0.5 text-xs ${st.cor}`}>{st.label}</span>
                  {t.url_boleto && (
                    <a
                      href={t.url_boleto}
                      target="_blank"
                      className="text-sm text-brand-600 hover:underline"
                    >
                      2a via
                    </a>
                  )}
                </div>
              </div>
            );
          })}
          {(titulos ?? []).length === 0 && (
            <p className="text-sm text-slate-400">Nenhum boleto pendente. Tudo em dia!</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
