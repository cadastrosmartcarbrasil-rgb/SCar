# E-mails de cobrança (0168) — configuração e operação

Avisos automáticos dos **boletos emitidos pelo SCar** (`titulos_financeiros` registrados no banco).
Os boletos do Mutual **não** entram: o Mutual já avisa os dele (decisão de 02/11/2026).

| Aviso | Quando | Modelo |
|---|---|---|
| Lembrete | 5 dias antes do vencimento | `aviso_vencimento` |
| Lembrete | 1 dia antes | `aviso_vencimento` |
| Vence hoje | no vencimento | `vence_hoje` |
| Em aberto | 2 dias depois* | `atraso` |
| Em aberto | 7 dias depois* | `atraso` |

\* conta do vencimento **em dia útil** (`dia_util_seguinte`): boleto de sábado pago na segunda não está atrasado.
Sem confirmação de pagamento. A linha digitável e o PIX vão no corpo; o botão "Ver o boleto (PDF)" abre
`/b/<token>` (token assinado, vale até 30 dias depois do vencimento; sem CPF, valor ou linha na URL).

Provedor: **Resend**. Fuso: **America/Sao_Paulo**. Remetente: `cobranca@avisos.appsmartcar.com.br`.

## Como funciona

```
crontab (10 em 10 min) → scripts/email-cobranca.sh → POST /api/v1/comunicacoes/email/rotina
   enfileirar_avisos_cobranca()   cria os avisos devidos HOJE (unique boleto+aviso+e-mail: nunca duplica)
   reservar_lote_email()          pega um lote (FOR UPDATE SKIP LOCKED), respeita pausa e janela
   envio pelo Resend              Idempotency-Key = id do item; taxa configurável (padrão 2/s)
   concluir_envio_email()         enviado | reagendado (backoff 1,2,4,8,16 min; até 5) | falhou
Resend → POST /api/v1/comunicacoes/email/webhook (assinatura Svix)
   registrar_evento_email()       entregue | devolvido | spam | falha; bounce PERMANENTE e spam → supressão
```

- Boleto **pago ou cancelado** derruba os avisos que ainda não saíram (trigger) e o despacho confere de novo antes de enviar.
- Aviso que não saiu no dia dele **expira** (aviso de véspera no dia seguinte confunde).
- **Domingo** não envia (configurável). Janela padrão 08:00–20:00.
- **Modo teste** (padrão): só envia para a lista de teste do painel; o resto vira "cancelado — modo sandbox".
- Painel: **Cobrança → E-mails de Cobrança** (`/cobrancas/emails`), só admin/financeiro.

## Passo a passo para ligar

### 1. Subdomínio no Resend (DNS na KingHost)
1. Resend → *Domains* → *Add domain* → `avisos.appsmartcar.com.br`, região **São Paulo (sa-east-1)**.
2. O Resend mostra os registros. Crie **exatamente** os que ele mostrar no DNS da KingHost
   (zona `appsmartcar.com.br`). Normalmente são:

   | Tipo | Nome (na zona appsmartcar.com.br) | Valor |
   |---|---|---|
   | TXT | `resend._domainkey.avisos` | a chave DKIM que o Resend mostrar |
   | MX | `send.avisos` | `feedback-smtp.sa-east-1.amazonses.com` (prioridade 10) |
   | TXT | `send.avisos` | `v=spf1 include:amazonses.com ~all` |
   | TXT | `_dmarc.avisos` | `v=DMARC1; p=none; rua=mailto:dmarc@appsmartcar.com.br` |

3. Aguarde o Resend marcar **Verified**. O DMARC começa em `p=none`; depois de 30 dias estáveis, passe para `p=quarantine`.
4. Aproveite e verifique também `appsmartcar.com.br` (o remetente dos outros e-mails do sistema — 2ª via, boas-vindas, voucher da 24h).

### 2. Webhook no Resend
Resend → *Webhooks* → *Add endpoint*:
- URL: `https://appsmartcar.com.br/api/v1/comunicacoes/email/webhook`
- Eventos: `email.delivered`, `email.bounced`, `email.complained`, `email.failed`, `email.delivery_delayed`
- Copie o **Signing secret** (`whsec_…`).

### 3. `.env` do VPS
```
RESEND_API_KEY=re_...                 # já usada pelo sistema
EMAIL_COBRANCA_FROM=Smart Car Brasil <cobranca@avisos.appsmartcar.com.br>
EMAIL_LINK_SECRET=<openssl rand -hex 32>
EMAIL_LINK_BASE=https://appsmartcar.com.br
RESEND_WEBHOOK_SECRET=whsec_...
```
Depois: deploy do contêiner (as variáveis já estão no `docker-compose.yml`).

### 4. Migration e agendador
1. Aplicar `supabase/migrations/0168_email_cobranca.sql` (antes do deploy).
2. `crontab -e` → `*/10 * * * * /opt/scar/scripts/email-cobranca.sh` (log em `/var/log/scar-email.log`).

### 5. Teste (modo teste)
1. Painel → *Pré-visualização* → *Enviar teste* para o seu e-mail (os 5 modelos).
2. Coloque o seu e-mail na **lista de teste**, crie/use um boleto de teste do SCar com vencimento em 5 dias, e
   *Rodar agora*: o item aparece na fila e chega no e-mail.
3. Teste de devolução: envie teste para `bounced@resend.dev` → o endereço entra na lista de supressão
   (`complained@resend.dev` testa a marcação de spam).

### 6. Produção
- [ ] Domínio verificado no Resend; webhook com eventos chegando (fila mostra "Entregue").
- [ ] Textos revisados pela diretoria/jurídico.
- [ ] Razão social, CNPJ, WhatsApp e e-mail financeiro preenchidos em Configurações → Empresa (o rodapé usa).
- [ ] Painel → **Ligar modo produção**.

Volume hoje é pequeno (os boletos do SCar são poucos até o corte do Mutual em dezembro), então o domínio
"aquece" sozinho. No corte de cada unidade o volume sobe de uma vez: acompanhe os indicadores na primeira semana.

## Incidente (devolução ou spam alto)
O painel fica vermelho com devolução > 2% ou spam > 0,05%.
1. **Pausar envios** no painel (para na hora; nada se perde, o que é do dia expira).
2. Ver na fila quais endereços devolveram; corrigir o e-mail no cadastro do associado.
3. Liberar da supressão só quem foi corrigido (o painel pede o motivo).
4. Retomar.

## Templates (React Email, 02/11/2026)
- Arquivos em `src/lib/comunicacao/templates/` (vindos do Cowork; design e textos não se alteram sem aprovação) e logo em
  `public/email/logo-smartcar-negativa.png` (servida pelo próprio sistema, sem login).
- Os 3 de cobrança já estão no envio, no "Enviar teste" e na pré-visualização do painel. Boas-vindas e aniversário estão no
  repositório mas ainda não são enviados.
- Variáveis opcionais (sem elas vale o padrão do sistema): `EMAIL_LOGO_URL`, `PORTAL_LOGIN_URL`, `PORTAL_FATURAS_URL`,
  `APP_ANDROID_URL`, `APP_IOS_URL`, `DOC_ASSISTENCIA_URL`, `DOC_MANUAL_URL`, `DOC_REGIMENTO_URL`.
- Decisões (02/11/2026): o atraso avisa o bloqueio do sinal do rastreador; sem botões Android/iPhone; "cartão" fica.
  Pendente: os documentos da boas-vindas estão em bit.ly (trocar por link direto).
- "Esqueci minha senha" do portal: o e-mail sai de `nao-responda@avisos.appsmartcar.com.br` (`EMAIL_SERVICO_FROM` muda)
  para o e-mail do cadastro do associado. Associado sem e-mail no cadastro precisa ligar para o atendimento.

## Não feito (próximos passos)
- WhatsApp e SMS: a fila tem os estados e a régua para reaproveitar; falta o provedor (API oficial do WhatsApp).
- Os outros e-mails do sistema (2ª via, boas-vindas, voucher) ainda não consultam a lista de supressão.
- Retenção/anonimização automática da fila e dos eventos (hoje ficam).
