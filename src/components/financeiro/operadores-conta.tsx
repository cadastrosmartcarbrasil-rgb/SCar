'use client';

import { useState } from 'react';
import { Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useUsuarios } from '@/hooks/use-config';
import { mensagemErro, useOperadoresConta, useOperadoresTodasContas, useSalvarOperadoresConta } from '@/hooks/use-tesouraria';
import { temAcessoGlobal } from '@/lib/unidade';
import { rotuloPapel } from '@/lib/usuario';

/** Lista de quem pode operar a conta (0126): quem nao e da matriz (a matriz ja opera todas). */
export function ListaOperadores({ marcados, onChange }: { marcados: string[]; onChange: (ids: string[]) => void }) {
  const { data: usuarios } = useUsuarios();
  const candidatos = (usuarios ?? []).filter((u) => u.ativo && !temAcessoGlobal(u.papel));
  return (
    <div className="grid max-h-60 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
      {candidatos.map((u) => (
        <label key={u.id} className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={marcados.includes(u.id)}
            onChange={(e) => onChange(e.target.checked ? [...marcados, u.id] : marcados.filter((x) => x !== u.id))} />
          <span>{u.nome} <span className="text-xs text-slate-500">· {rotuloPapel(u.papel)}</span></span>
        </label>
      ))}
      {!candidatos.length && <p className="text-xs text-slate-400">Nenhum usuário ativo fora da matriz.</p>}
    </div>
  );
}

/** Nomes de quem opera a conta, para a linha/cartao da conta. */
export function NomesOperadores({ contaId }: { contaId: string }) {
  const { data: mapa } = useOperadoresTodasContas();
  const { data: usuarios } = useUsuarios();
  const ids = mapa?.[contaId] ?? [];
  if (!ids.length) return null;
  const nomes = ids.map((id) => (usuarios ?? []).find((u) => u.id === id)?.nome ?? '—');
  return (
    <p className="mt-0.5 flex items-center gap-1 text-[0.6875rem] text-slate-500">
      <Users className="h-3 w-3" /> Operada por {nomes.join(', ')}
    </p>
  );
}

export function ModalOperadoresConta({ conta, onClose }: { conta: { id: string; nome: string }; onClose: () => void }) {
  const { data: atuais } = useOperadoresConta(conta.id);
  const salvar = useSalvarOperadoresConta();
  const [sel, setSel] = useState<string[] | null>(null);
  const [erro, setErro] = useState('');
  const marcados = sel ?? atuais ?? [];
  return (
    <Modal open onClose={onClose} title={`Quem opera ${conta.nome}`} subtitulo="Além da matriz (admin e financeiro), que já operam todas" tamanho="lg">
      <form className="space-y-3" onSubmit={(e) => {
        e.preventDefault();
        setErro('');
        if (sel === null) { onClose(); return; }
        salvar.mutate({ conta: conta.id, usuarios: sel }, { onSuccess: onClose, onError: (er) => setErro(mensagemErro(er)) });
      }}>
        <p className="text-xs text-slate-500">
          Quem for marcado vê, em <b>Financeiro</b>, as abas <b>Contas e Saldos</b> e <b>Extrato e Conciliação</b> só desta
          conta: importa o OFX, concilia e lança. Configurar a conta, o fluxo diário e o DRE continuam só da matriz.
        </p>
        <ListaOperadores marcados={marcados} onChange={setSel} />
        {erro && <p className="text-sm text-rose-700">{erro}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={salvar.isPending}>{salvar.isPending ? 'Salvando...' : 'Salvar'}</Button>
        </div>
      </form>
    </Modal>
  );
}
