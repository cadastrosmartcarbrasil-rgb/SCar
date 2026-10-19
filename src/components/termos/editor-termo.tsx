'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, EditorContent, Node, mergeAttributes, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import Image from '@tiptap/extension-image';
import {
  Bold, Italic, Underline as IconeSublinhado, Heading1, Heading2, Heading3, Pilcrow, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, AlignJustify, Table as IconeTabela, Rows3, Columns3, Trash2,
  Undo2, Redo2, Braces, Square, FileUp, Search, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { CAMPOS_TERMO, GRUPOS_CAMPO, campoPorChave } from '@/lib/termos';
import { htmlDoWord } from '@/lib/termos-word';
import { cn } from '@/lib/utils';

// O campo DENTRO do texto: um "atomo" que aparece como etiqueta e vira o valor
// na emissao. No HTML: <span data-campo="associado.nome">«Associado: Nome»</span>.
const CampoInline = Node.create({
  name: 'campoTermo',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { chave: { default: null, parseHTML: (el) => el.getAttribute('data-campo'), renderHTML: () => ({}) } };
  },
  parseHTML() { return [{ tag: 'span[data-campo]' }]; },
  renderHTML({ node, HTMLAttributes }) {
    const c = campoPorChave(node.attrs.chave);
    return ['span', mergeAttributes(HTMLAttributes, { 'data-campo': node.attrs.chave, class: 'campo-termo' }),
      `«${c ? `${c.grupo}: ${c.rotulo}` : node.attrs.chave}»`];
  },
  renderText({ node }) { return `«${node.attrs.chave}»`; },
});

// Campo que vira BLOCO inteiro (tabela das coberturas).
const CampoBloco = Node.create({
  name: 'campoTermoBloco',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes() {
    return { chave: { default: null, parseHTML: (el) => el.getAttribute('data-campo'), renderHTML: () => ({}) } };
  },
  parseHTML() { return [{ tag: 'div[data-campo]' }]; },
  renderHTML({ node, HTMLAttributes }) {
    const c = campoPorChave(node.attrs.chave);
    return ['div', mergeAttributes(HTMLAttributes, { 'data-campo': node.attrs.chave, class: 'campo-termo-bloco' }),
      `«${c ? `${c.grupo}: ${c.rotulo}` : node.attrs.chave}»`];
  },
});

function Botao({ ativo, titulo, onClick, children, disabled }: {
  ativo?: boolean; titulo: string; onClick: () => void; children: React.ReactNode; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn('rounded p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40',
        ativo && 'bg-cyan-500/15 text-cyan-700')}
    >
      {children}
    </button>
  );
}

function SeletorCampo({ onEscolher, onFechar }: { onEscolher: (chave: string) => void; onFechar: () => void }) {
  const [busca, setBusca] = useState('');
  const lista = useMemo(() => {
    const t = busca.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return CAMPOS_TERMO.filter((c) => !t || `${c.grupo} ${c.rotulo} ${c.chave}`
      .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(t));
  }, [busca]);
  return (
    <div className="absolute right-0 top-full z-30 mt-1 w-80 rounded-xl border border-slate-200 bg-superficie p-2 shadow-lg">
      <div className="mb-2 flex items-center gap-2 rounded-lg border border-slate-200 px-2">
        <Search className="h-4 w-4 text-slate-400" />
        <input
          autoFocus
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Procurar campo..."
          className="w-full bg-transparent py-1.5 text-sm outline-none"
        />
        <button type="button" onClick={onFechar} aria-label="Fechar"><X className="h-4 w-4 text-slate-400" /></button>
      </div>
      <div className="max-h-80 overflow-y-auto">
        {GRUPOS_CAMPO.map((g) => {
          const itens = lista.filter((c) => c.grupo === g);
          if (!itens.length) return null;
          return (
            <div key={g} className="mb-2">
              <p className="px-2 text-xs font-semibold uppercase text-slate-500">{g}</p>
              {itens.map((c) => (
                <button
                  key={c.chave}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onEscolher(c.chave)}
                  className="block w-full rounded px-2 py-1 text-left text-sm text-slate-700 hover:bg-slate-100"
                >
                  {c.rotulo}
                  {c.tipo === 'bloco' && <span className="ml-1 text-xs text-cyan-700">(bloco)</span>}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Barra({ editor, onImportar }: { editor: Editor; onImportar?: () => void }) {
  const [campos, setCampos] = useState(false);
  const naTabela = editor.isActive('table');
  function inserirCampo(chave: string) {
    const c = campoPorChave(chave);
    if (c?.tipo === 'bloco') editor.chain().focus().insertContent({ type: 'campoTermoBloco', attrs: { chave } }).run();
    else editor.chain().focus().insertContent({ type: 'campoTermo', attrs: { chave } }).run();
    setCampos(false);
  }
  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-superficie p-1.5">
      <Botao titulo="Desfazer" onClick={() => editor.chain().focus().undo().run()}><Undo2 className="h-4 w-4" /></Botao>
      <Botao titulo="Refazer" onClick={() => editor.chain().focus().redo().run()}><Redo2 className="h-4 w-4" /></Botao>
      <span className="mx-1 h-5 w-px bg-slate-200" />
      <Botao titulo="Negrito" ativo={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-4 w-4" /></Botao>
      <Botao titulo="Itálico" ativo={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-4 w-4" /></Botao>
      <Botao titulo="Sublinhado" ativo={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}><IconeSublinhado className="h-4 w-4" /></Botao>
      <span className="mx-1 h-5 w-px bg-slate-200" />
      <Botao titulo="Título 1" ativo={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 className="h-4 w-4" /></Botao>
      <Botao titulo="Título 2" ativo={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="h-4 w-4" /></Botao>
      <Botao titulo="Título 3" ativo={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 className="h-4 w-4" /></Botao>
      <Botao titulo="Parágrafo" ativo={editor.isActive('paragraph')} onClick={() => editor.chain().focus().setParagraph().run()}><Pilcrow className="h-4 w-4" /></Botao>
      <Botao titulo="Lista" ativo={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-4 w-4" /></Botao>
      <Botao titulo="Lista numerada" ativo={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></Botao>
      <span className="mx-1 h-5 w-px bg-slate-200" />
      <Botao titulo="Alinhar à esquerda" ativo={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}><AlignLeft className="h-4 w-4" /></Botao>
      <Botao titulo="Centralizar" ativo={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}><AlignCenter className="h-4 w-4" /></Botao>
      <Botao titulo="Alinhar à direita" ativo={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}><AlignRight className="h-4 w-4" /></Botao>
      <Botao titulo="Justificar" ativo={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()}><AlignJustify className="h-4 w-4" /></Botao>
      <span className="mx-1 h-5 w-px bg-slate-200" />
      <Botao titulo="Inserir tabela" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: false }).run()}><IconeTabela className="h-4 w-4" /></Botao>
      <Botao titulo="Adicionar linha" disabled={!naTabela} onClick={() => editor.chain().focus().addRowAfter().run()}><Rows3 className="h-4 w-4" /></Botao>
      <Botao titulo="Adicionar coluna" disabled={!naTabela} onClick={() => editor.chain().focus().addColumnAfter().run()}><Columns3 className="h-4 w-4" /></Botao>
      <Botao titulo="Remover tabela" disabled={!naTabela} onClick={() => editor.chain().focus().deleteTable().run()}><Trash2 className="h-4 w-4" /></Botao>
      <Botao titulo="Caixa de marcação ☐" onClick={() => editor.chain().focus().insertContent('☐ ').run()}><Square className="h-4 w-4" /></Botao>
      <span className="mx-1 h-5 w-px bg-slate-200" />
      {onImportar && (
        <button type="button" onClick={onImportar}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-slate-100">
          <FileUp className="h-4 w-4" /> Importar Word
        </button>
      )}
      <div className="relative ml-auto">
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setCampos((v) => !v)}
          className="flex items-center gap-1 rounded-lg bg-cyan-500 px-3 py-1 text-sm font-semibold text-navy hover:bg-cyan-400">
          <Braces className="h-4 w-4" /> Inserir campo
        </button>
        {campos && <SeletorCampo onEscolher={inserirCampo} onFechar={() => setCampos(false)} />}
      </div>
    </div>
  );
}

/**
 * Editor do texto do termo. `value` e o HTML guardado em `termos_modelos.rascunho_html`.
 * Importar Word (.docx) troca o texto inteiro, depois de confirmar.
 */
export function EditorTermo({ value, onChange, somenteLeitura }: {
  value: string; onChange: (html: string) => void; somenteLeitura?: boolean;
}) {
  const arquivo = useRef<HTMLInputElement>(null);
  const editor = useEditor({
    immediatelyRender: false,
    editable: !somenteLeitura,
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: false }),
      TableRow, TableHeader, TableCell,
      Image.configure({ allowBase64: true }),
      CampoInline, CampoBloco,
    ],
    content: value,
    onUpdate: ({ editor: ed }) => onChange(ed.getHTML()),
  });

  // Conteudo trocado por fora (abrir outro termo, importar): sincroniza.
  useEffect(() => {
    if (editor && value !== editor.getHTML()) editor.commands.setContent(value, false);
  }, [value, editor]);

  async function importar(f: File) {
    try {
      const { html, avisos } = await htmlDoWord(await f.arrayBuffer());
      if (editor && editor.getText().trim() && !window.confirm('Substituir o texto atual pelo do arquivo?')) return;
      editor?.commands.setContent(html, true);
      toast.success(`Texto importado de ${f.name}. Agora troque os espaços em branco pelos campos.`);
      if (avisos.length) toast.message(`O Word avisou: ${avisos.slice(0, 3).join(' · ')}`);
    } catch (e) {
      toast.error(`Não foi possível ler o arquivo: ${(e as Error).message}`);
    }
  }

  if (!editor) return <div className="h-96 animate-pulse rounded-xl bg-slate-100" />;
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-superficie">
      {!somenteLeitura && <Barra editor={editor} onImportar={() => arquivo.current?.click()} />}
      <input ref={arquivo} type="file" accept=".docx" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void importar(f); e.target.value = ''; }} />
      <EditorContent editor={editor} className="termo-editor max-h-[70vh] min-h-[24rem] overflow-y-auto p-6" />
    </div>
  );
}
