/** Regra da senha do portal do associado — a MESMA de /api/portal/senha (que confere de novo). */
export function problemaDaNovaSenha(senha: string, confirmacao: string): string | null {
  if (senha.length < 8) return 'A senha precisa de ao menos 8 caracteres.';
  if (senha !== confirmacao) return 'As senhas não conferem.';
  if (/^\d+$/.test(senha)) return 'Use letras e números — a senha não pode ser só números (nem o seu CPF).';
  return null;
}
