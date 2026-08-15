# Deploy do SCar — passo a passo

> Regra de ouro: **o `git pull` roda dentro do servidor**, nunca no PowerShell do
> Windows. Rodar na máquina local dá `fatal: not a git repository`. Toda janela
> nova de terminal começa fora do servidor — o `ssh` precisa ser refeito.

## 1. Migrations (Supabase, pelo navegador)

Abra o **SQL Editor** do projeto no Supabase e rode as migrations novas **na
ordem numérica**, uma de cada vez. Os arquivos estão em `supabase/migrations/`.

Para saber o que falta, rode no SQL Editor:

```sql
-- Existe? Se a consulta devolver a função, a migration já foi aplicada.
select proname from pg_proc where proname in (
  'gerar_faturas_periodo',            -- 0025 (Cobrança)
  'abrir_acionamento',                -- 0026 (Assistência 24h)
  'sincronizar_lancamento_acionamento',-- 0027 (centro de custo / OS editável)
  'mover_lead_status'                 -- 0028 (CRM Kanban / desconto)
);
```

Montando um ambiente do zero? Cole o `supabase/schema.sql` (consolidado de
todas as migrations) em vez de rodar uma a uma.

## 2. Aplicação (VPS)

**Windows / PowerShell** — de qualquer pasta:

```powershell
.\scripts\deploy.ps1
```

**Linux / macOS / WSL:**

```bash
npm run deploy
```

Sem o script, o comando equivalente é:

```powershell
ssh root@app.smartvidanet.com.br "cd /opt/scar && git pull origin claude/claude-md-opcao-x-98kfj5 && docker compose up -d --build"
```

Terminado o build, atualize a página com **Ctrl+F5**.

### Se o `cd` falhar (`No such file or directory`)

O projeto está em outro caminho no servidor. Descubra pelo próprio Docker:

```powershell
.\scripts\deploy.ps1 -Descobrir
```

e repita passando o caminho: `.\scripts\deploy.ps1 -Caminho /caminho/que/apareceu`.

## 3. Conferência

| Sintoma | Causa provável |
|---|---|
| Menu sem os itens novos | Container não foi reconstruído (ou pull no branch errado) |
| Tela abre e quebra ao carregar dados | Falta rodar a migration daquele módulo no Supabase |
| `not a git repository` | O comando rodou no Windows, não no servidor |
| `couldn't find remote ref` | Branch errado no `git pull` |

## Branch de produção

O VPS acompanha **`claude/claude-md-opcao-x-98kfj5`** — é o branch que contém
todo o histórico do projeto mais os módulos novos. O `claude/scar-project-btasdf`
é o branch padrão do repositório e está parado em `953c53c`. Mesmo repositório,
branches diferentes: nada foi migrado de lugar.

Se uma sessão futura for configurada para outro branch, ajuste o padrão em
`scripts/deploy.ps1` / `scripts/deploy.sh` (ou passe `-Branch`).
