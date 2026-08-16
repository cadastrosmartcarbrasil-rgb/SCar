'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, MapPin, Navigation, Route, Search, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormField, Input } from '@/components/ui/field';
import { MapaRota } from '@/components/mapa/mapa-rota';
import { useCalcularRota, useGeocodificar } from '@/hooks/use-geo';
import { buscarCep } from '@/lib/cep';
import {
  coordenadaDe, enderecoLinha, linksNavegacao, rotuloRota,
  type Coordenada, type EnderecoGeo,
} from '@/lib/geo';
import { calcularKmExcedente } from '@/lib/assistencia';
import { formatCurrency } from '@/lib/utils';

export interface RotaCalculada {
  distancia_km: number;
  duracao_min: number;
  polyline: string | null;
  pontos: Coordenada[];
}

/** Serviço em pauta — usado para simular o KM excedente em tempo real. */
export interface ServicoTrajeto {
  cobra_km_excedente: boolean;
  km_franquia: number;
  valor_km_excedente: number;
}

const VAZIO: EnderecoGeo = {};

/**
 * Origem (local do resgate) + destino + mapa interativo com a rota, distância
 * em KM e a simulação do KM excedente do serviço. Usado na abertura do
 * acionamento e na edição do trajeto da OS.
 */
export function TrajetoAcionamento({
  origem, destino, rota, servico, valorKmNegociado, onChange,
}: {
  origem: EnderecoGeo;
  destino: EnderecoGeo;
  rota: RotaCalculada | null;
  servico?: ServicoTrajeto | null;
  valorKmNegociado?: number | null;
  onChange: (v: { origem: EnderecoGeo; destino: EnderecoGeo; rota: RotaCalculada | null }) => void;
}) {
  const geocodificar = useGeocodificar();
  const calcular = useCalcularRota();
  const [buscando, setBuscando] = useState<'origem' | 'destino' | null>(null);

  const coordOrigem = coordenadaDe(origem);
  const coordDestino = coordenadaDe(destino);
  const links = useMemo(() => linksNavegacao(origem, destino), [origem, destino]);

  // Simulação do KM excedente com a distância calculada (mesma conta do banco).
  const simulacao = useMemo(() => {
    if (!servico || !servico.cobra_km_excedente || rota == null) return null;
    const km = calcularKmExcedente(rota.distancia_km, servico.km_franquia);
    const unit = valorKmNegociado ?? servico.valor_km_excedente ?? 0;
    return { km, valor: Math.round(km * Number(unit) * 100) / 100, unit: Number(unit) };
  }, [servico, rota, valorKmNegociado]);

  function set(qual: 'origem' | 'destino', patch: Partial<EnderecoGeo>) {
    const base = qual === 'origem' ? origem : destino;
    // Mexeu no endereço: a coordenada antiga não vale mais.
    const limpaGps = Object.keys(patch).some((k) => k !== 'lat' && k !== 'lng' && k !== 'referencia');
    const novo = { ...base, ...patch, ...(limpaGps ? { lat: null, lng: null } : {}) };
    onChange({
      origem: qual === 'origem' ? novo : origem,
      destino: qual === 'destino' ? novo : destino,
      rota: limpaGps ? null : rota,
    });
  }

  async function preencherPorCep(qual: 'origem' | 'destino', cep: string) {
    const digitos = cep.replace(/\D/g, '');
    if (digitos.length !== 8) return;
    const r = await buscarCep(digitos);
    if (!r) return;
    set(qual, {
      cep: digitos, logradouro: r.logradouro || undefined,
      bairro: r.bairro || undefined, cidade: r.cidade || undefined, uf: r.estado || undefined,
    });
  }

  async function localizar(qual: 'origem' | 'destino') {
    const e = qual === 'origem' ? origem : destino;
    const linha = enderecoLinha(e);
    if (linha.length < 6) return toast.error('Preencha o endereco antes de localizar no mapa');
    setBuscando(qual);
    try {
      const r = await geocodificar.mutateAsync(linha);
      set(qual, { lat: r.lat, lng: r.lng });
      toast.success(`${qual === 'origem' ? 'Origem' : 'Destino'} localizada no mapa`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBuscando(null);
    }
  }

  async function calcularRota() {
    const o = coordOrigem ?? enderecoLinha(origem);
    const d = coordDestino ?? enderecoLinha(destino);
    if (!o || !d || (typeof o === 'string' && o.length < 6) || (typeof d === 'string' && d.length < 6)) {
      return toast.error('Informe origem e destino para calcular a rota');
    }
    try {
      const r = await calcular.mutateAsync({ origem: o, destino: d });
      onChange({
        origem: { ...origem, lat: r.origem.lat, lng: r.origem.lng },
        destino: { ...destino, lat: r.destino.lat, lng: r.destino.lng },
        rota: {
          distancia_km: r.distancia_km, duracao_min: r.duracao_min,
          polyline: r.polyline, pontos: r.pontos,
        },
      });
      toast.success(`Rota calculada: ${rotuloRota(r.distancia_km, r.duracao_min)}`);
    } catch (err) {
      toast.error(`${(err as Error).message} — informe o KM manualmente`);
    }
  }

  const bloco = (qual: 'origem' | 'destino') => {
    const e = qual === 'origem' ? origem : destino;
    const titulo = qual === 'origem' ? 'Endereco de Origem (local do resgate)' : 'Endereco de Destino';
    const localizado = !!coordenadaDe(e);
    return (
      <div className="rounded-xl border border-slate-200">
        <div className="flex items-center justify-between gap-2 rounded-t-xl bg-slate-50 px-3 py-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <MapPin className={`h-4 w-4 ${qual === 'origem' ? 'text-rose-500' : 'text-brand-600'}`} /> {titulo}
          </p>
          {localizado && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">GPS ok</span>}
        </div>
        <div className="grid gap-2 p-3 sm:grid-cols-6">
          <FormField label="CEP" className="sm:col-span-2">
            <Input value={e.cep ?? ''} maxLength={9}
              onChange={(ev) => set(qual, { cep: ev.target.value })}
              onBlur={(ev) => preencherPorCep(qual, ev.target.value)}
              placeholder="00000-000" />
          </FormField>
          <FormField label="Endereco" className="sm:col-span-3">
            <Input value={e.logradouro ?? ''} onChange={(ev) => set(qual, { logradouro: ev.target.value })}
              placeholder="Rua / avenida" />
          </FormField>
          <FormField label="Numero">
            <Input value={e.numero ?? ''} onChange={(ev) => set(qual, { numero: ev.target.value })} />
          </FormField>
          <FormField label="Bairro" className="sm:col-span-2">
            <Input value={e.bairro ?? ''} onChange={(ev) => set(qual, { bairro: ev.target.value })} />
          </FormField>
          <FormField label="Cidade" className="sm:col-span-3">
            <Input value={e.cidade ?? ''} onChange={(ev) => set(qual, { cidade: ev.target.value })} />
          </FormField>
          <FormField label="UF">
            <Input maxLength={2} value={e.uf ?? ''} onChange={(ev) => set(qual, { uf: ev.target.value.toUpperCase() })} />
          </FormField>
          <FormField label="Referencia" className="sm:col-span-4">
            <Input value={e.referencia ?? ''} onChange={(ev) => set(qual, { referencia: ev.target.value })}
              placeholder="Ex.: em frente ao posto" />
          </FormField>
          <div className="flex items-end sm:col-span-2">
            <Button type="button" variant="secondary" onClick={() => localizar(qual)}
              disabled={buscando === qual} className="w-full">
              {buscando === qual ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Localizar no mapa
            </Button>
          </div>
          {(e.lat || e.lng) && (
            <p className="tnum sm:col-span-6 text-[11px] text-slate-400">
              Coordenadas: {e.lat}, {e.lng}
            </p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-3">
          {bloco('origem')}
          {bloco('destino')}
        </div>

        <div className="space-y-2">
          <MapaRota origem={coordOrigem} destino={coordDestino} pontos={rota?.pontos} altura={300} />

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Distancia da rota</p>
              <p className="tnum text-lg font-semibold text-slate-800">
                {rota ? rotuloRota(rota.distancia_km, rota.duracao_min) : '—'}
              </p>
            </div>
            <Button type="button" onClick={calcularRota} disabled={calcular.isPending}>
              {calcular.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Route className="h-4 w-4" />}
              Calcular rota
            </Button>
          </div>

          {simulacao && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <p className="font-semibold">Simulacao do KM excedente</p>
              <p className="tnum">
                {rota!.distancia_km} km de rota − {servico!.km_franquia} km de franquia ={' '}
                <b>{simulacao.km} km</b> × {formatCurrency(simulacao.unit)} ={' '}
                <b>{formatCurrency(simulacao.valor)}</b>
              </p>
            </div>
          )}
          {servico && !servico.cobra_km_excedente && (
            <p className="text-xs text-slate-400">Este servico nao cobra KM excedente.</p>
          )}

          {(links.googleRota || links.wazeOrigem) && (
            <div className="flex flex-wrap gap-2">
              {links.googleRota && (
                <a href={links.googleRota} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                  <ExternalLink className="h-3.5 w-3.5" /> Rota no Google Maps
                </a>
              )}
              {links.wazeOrigem && (
                <a href={links.wazeOrigem} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                  <Navigation className="h-3.5 w-3.5" /> Navegar ate o resgate (Waze)
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const ENDERECO_VAZIO = VAZIO;
