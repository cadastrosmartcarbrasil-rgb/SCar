// Validacao e formatacao de CPF/CNPJ (mesma logica das funcoes do banco).

export function soDigitos(v: string): string {
  return (v ?? '').replace(/\D/g, '');
}

export function validarCPF(valor: string): boolean {
  const cpf = soDigitos(valor);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  let s = 0;
  for (let i = 0; i < 9; i++) s += Number(cpf[i]) * (10 - i);
  let d1 = 11 - (s % 11);
  if (d1 >= 10) d1 = 0;
  if (d1 !== Number(cpf[9])) return false;

  s = 0;
  for (let i = 0; i < 10; i++) s += Number(cpf[i]) * (11 - i);
  let d2 = 11 - (s % 11);
  if (d2 >= 10) d2 = 0;
  return d2 === Number(cpf[10]);
}

export function validarCNPJ(valor: string): boolean {
  const cnpj = soDigitos(valor);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  let s = 0;
  for (let i = 0; i < 12; i++) s += Number(cnpj[i]) * w1[i];
  let d1 = s % 11;
  d1 = d1 < 2 ? 0 : 11 - d1;
  if (d1 !== Number(cnpj[12])) return false;

  s = 0;
  for (let i = 0; i < 13; i++) s += Number(cnpj[i]) * w2[i];
  let d2 = s % 11;
  d2 = d2 < 2 ? 0 : 11 - d2;
  return d2 === Number(cnpj[13]);
}

export function validarDocumento(valor: string, tipo: 'PF' | 'PJ'): boolean {
  return tipo === 'PF' ? validarCPF(valor) : validarCNPJ(valor);
}

// Formatacao para exibicao
export function formatarCPF(v: string): string {
  const d = soDigitos(v).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

export function formatarCNPJ(v: string): string {
  const d = soDigitos(v).slice(0, 14);
  return d
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

export function formatarDocumento(v: string, tipo: 'PF' | 'PJ'): string {
  return tipo === 'PF' ? formatarCPF(v) : formatarCNPJ(v);
}

// Telefone nacional: (XX) XXXXX-XXXX ou (XX) XXXX-XXXX
export function formatarTelefone(v: string): string {
  const d = soDigitos(v).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// CEP: XXXXX-XXX
export function formatarCEP(v: string): string {
  const d = soDigitos(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

// Idade em anos a partir da data de nascimento (YYYY-MM-DD).
export function calcularIdade(dataNascimento: string | null | undefined): number | null {
  if (!dataNascimento) return null;
  const nasc = new Date(dataNascimento);
  if (isNaN(nasc.getTime())) return null;
  const hoje = new Date();
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
  return idade >= 0 ? idade : null;
}
