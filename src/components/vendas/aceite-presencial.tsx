'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Handshake, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { FormField, Input } from '@/components/ui/field';
import { useRegistrarAceite } from '@/hooks/use-vendas';
import { formatarDocumento, validarDocumento } from '@/lib/documento';
import { formatCurrency } from '@/lib/utils';
import type { CotacoesRow, LeadsRow } from '@/lib/database.types';

/**
 * Aceite colhido PRESENCIALMENTE, com o cliente na frente do vendedor.
 *
 * A funcao do banco (`registrar_aceite_venda`) sempre aceitou os dois
 * caminhos — `CLIENTE` (no proprio celular, pela pagina publica) e `VENDEDOR`
 * —, mas so a rota publica chamava: na venda presencial o consultor tinha de
 * mandar o link e pedir que a pessoa abrisse no celular dela.
 *
 * O que fica gravado diz a verdade sobre COMO o consentimento foi colhido: o
 * aceite entra como `VENDEDOR`, com o nome e o documento de quem assinou e o
 * dispositivo de quem registrou. O IP nao e gravado aqui de proposito — seria
 * o do vendedor, e passaria por prova do cliente.
 */
export function AceitePresencial({ lead, cotacao, onClose }: {
  lead: LeadsRow;
  cotacao: CotacoesRow;
  onClose: () => void;
}) {
  const registrar = useRegistrarAceite();
  const [nome, setNome] = useState(lead.nome ?? '');
  const [documento, setDocumento] = useState((lead.cpf_cnpj ?? '').replace(/\D/g, ''));
  const [confirmado, setConfirmado] = useState(false);

  const nomeCompleto = nome.trim().includes(' ');
  const docValido = validarDocumento(documento, documento.length > 11 ? 'PJ' : 'PF');
  const pode = nomeCompleto && docValido && confirmado;

  function gravar(e: React.FormEvent) {
    e.preventDefault();
    if (!nomeCompleto) return toast.error('Informe o nome completo de quem esta contratando');
    if (!docValido) return toast.error('CPF/CNPJ invalido');
    registrar.mutate(
      { leadId: lead.id, cotacaoId: cotacao.id, nome: nome.trim(), documento },
      {
        onSuccess: () => { toast.success('Aceite registrado'); onClose(); },
        onError: (err) => toast.error(err.message),
      },
    );
  }

  const mensalidade = Number(cotacao.total_com_desconto ?? cotacao.total_mensalidade);
  const adesao = Number(cotacao.adesao_com_desconto ?? cotacao.taxa_adesao ?? 0);

  return (
    <Modal open onClose={onClose} title="Colher aceite do cliente">
      <form onSubmit={gravar} className="space-y-3">
        <div className="rounded-xl bg-brand-50 px-3.5 py-3 text-[12.5px] text-brand-900">
          <p className="flex items-center justify-between">
            <span>Mensalidade</span>
            <b className="tnum text-[15px] text-brand-700">{formatCurrency(mensalidade)}</b>
          </p>
          {adesao > 0 && (
            <p className="mt-0.5 flex items-center justify-between text-slate-600">
              <span>Adesao (unica)</span> <b className="tnum">{formatCurrency(adesao)}</b>
            </p>
          )}
          <p className="mt-1.5 text-[11.5px] leading-snug text-slate-600">
            Leia os valores e o que esta incluso para o cliente antes de registrar. O aceite fica
            gravado com data, hora e o seu usuario.
          </p>
        </div>

        <FormField label="Nome completo de quem contrata">
          <Input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
          {nome.trim() !== '' && !nomeCompleto && (
            <p className="mt-0.5 text-[11px] text-rose-500">Nome e sobrenome.</p>
          )}
        </FormField>

        <FormField label="CPF / CNPJ">
          <Input
            value={formatarDocumento(documento, documento.length > 11 ? 'PJ' : 'PF')}
            onChange={(e) => setDocumento(e.target.value.replace(/\D/g, '').slice(0, 14))}
            inputMode="numeric"
          />
          {documento.length >= 11 && !docValido && (
            <p className="mt-0.5 text-[11px] text-rose-500">CPF/CNPJ invalido.</p>
          )}
        </FormField>

        <label className="flex items-start gap-2 rounded-xl border border-slate-200 p-3 text-[12px] text-slate-600">
          <input
            type="checkbox" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300"
          />
          <span>
            Declaro que apresentei a proposta e que o cliente, presente neste atendimento,
            concordou com os valores e com as condicoes acima.
          </span>
        </label>

        <p className="text-[11px] leading-snug text-slate-400">
          Se o cliente preferir aceitar pelo proprio celular, envie o link da proposta pelo
          WhatsApp — o aceite dele entra como &quot;pelo cliente&quot;, com IP e dispositivo.
        </p>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={!pode || registrar.isPending}>
            {registrar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Handshake className="h-4 w-4" />}
            Registrar aceite
          </Button>
        </div>
      </form>
    </Modal>
  );
}
