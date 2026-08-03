import { redirect } from 'next/navigation';

// Rota antiga: associados substituiu clientes.
export default function ClientesRedirect() {
  redirect('/associados');
}
