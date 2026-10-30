'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Save, UserRound } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FormField, Input } from '@/components/ui/field';
import { useSalvarFichaLead } from '@/hooks/use-vendas';
import { buscarCep } from '@/lib/cep';
import { validarDocumento } from '@/lib/documento';
import type { LeadsRow } from '@/lib/database.types';

type Endereco = { cep?: string; logradouro?: string; numero?: string; complemento?: string; bairro?: string; cidade?: string; uf?: string };

/**
 * O que o CONSULTOR preenche da ficha (0161, decisao do usuario): os dados
 * basicos do associado — documento, e-mail e endereco. O resto (RG, chassi,
 * CRLV, fotos) o back-office completa depois que a cotacao e aprovada.
 */
export function DadosBasicosLead({ lead, somenteLeitura = false }: { lead: LeadsRow; somenteLeitura?: boolean }) {
  const salvar = useSalvarFichaLead();
  const [doc, setDoc] = useState(lead.cpf_cnpj ?? '');
  const [email, setEmail] = useState(lead.email ?? '');
  const [end, setEndState] = useState<Endereco>((lead.endereco ?? {}) as Endereco);
  const [buscando, setBuscando] = useState(false);
  const setEnd = (p: Endereco) => setEndState((e) => ({ ...e, ...p }));

  async function porCep(cep: string) {
    setEnd({ cep });
    if (cep.replace(/\D/g, '').length !== 8) return;
    setBuscando(true);
    const r = await buscarCep(cep);
    setBuscando(false);
    if (!r) return toast.error('CEP não encontrado');
    setEnd({ cep, logradouro: r.logradouro, bairro: r.bairro, cidade: r.cidade, uf: r.estado });
  }

  function gravar() {
    const d = doc.replace(/\D/g, '');
    if (d && !validarDocumento(d, d.length > 11 ? 'PJ' : 'PF')) return toast.error('CPF/CNPJ inválido');
    salvar.mutate({
      id: lead.id,
      cpf_cnpj: d || null,
      tipo_pessoa: d ? (d.length > 11 ? 'PJ' : 'PF') : lead.tipo_pessoa,
      email: email.trim() || null,
      endereco: end,
    } as Partial<LeadsRow> & { id: string }, {
      onSuccess: () => toast.success('Dados do associado salvos'),
      onError: (e) => toast.error(e.message),
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <UserRound className="h-4 w-4 text-slate-400" /> Dados do associado
        </CardTitle>
        <p className="text-xs text-slate-500">
          O básico para a venda andar. O restante da ficha o back-office completa.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="CPF/CNPJ">
            <Input value={doc} onChange={(e) => setDoc(e.target.value)} inputMode="numeric" disabled={somenteLeitura} />
          </FormField>
          <FormField label="E-mail">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={somenteLeitura} />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <FormField label="CEP">
            <div className="relative">
              <Input value={end.cep ?? ''} onChange={(e) => porCep(e.target.value)} inputMode="numeric" disabled={somenteLeitura} />
              {buscando && <Loader2 className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />}
            </div>
          </FormField>
          <FormField label="Logradouro" className="col-span-2">
            <Input value={end.logradouro ?? ''} onChange={(e) => setEnd({ logradouro: e.target.value })} disabled={somenteLeitura} />
          </FormField>
          <FormField label="Número">
            <Input value={end.numero ?? ''} onChange={(e) => setEnd({ numero: e.target.value })} disabled={somenteLeitura} />
          </FormField>
          <FormField label="Bairro" className="col-span-2 sm:col-span-1">
            <Input value={end.bairro ?? ''} onChange={(e) => setEnd({ bairro: e.target.value })} disabled={somenteLeitura} />
          </FormField>
          <FormField label="Complemento">
            <Input value={end.complemento ?? ''} onChange={(e) => setEnd({ complemento: e.target.value })} disabled={somenteLeitura} />
          </FormField>
          <FormField label="Cidade">
            <Input value={end.cidade ?? ''} onChange={(e) => setEnd({ cidade: e.target.value })} disabled={somenteLeitura} />
          </FormField>
          <FormField label="UF">
            <Input maxLength={2} value={end.uf ?? ''} onChange={(e) => setEnd({ uf: e.target.value.toUpperCase() })} disabled={somenteLeitura} />
          </FormField>
        </div>
        {!somenteLeitura && (
          <div className="flex justify-end">
            <Button onClick={gravar} disabled={salvar.isPending}>
              {salvar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar dados
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
