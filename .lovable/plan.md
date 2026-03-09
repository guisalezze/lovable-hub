

## Plano: Modulo de Cobrancas Parceladas

### 1. Migracao de Banco de Dados

Criar tabelas `charges` e `charge_installments` com indices, triggers de `updated_at`, e RLS policies conforme especificado. Policies permitem leitura autenticada, insert autenticado, update por admin ou assigned_to, delete apenas admin.

### 2. Nova Pagina `src/pages/Cobrancas.tsx`

Arquivo completo com:
- Tipos: `Charge`, `ChargeInstallment`, `Profile`
- Hooks: `useCharges` (query com join em installments + profiles), `useProfiles`
- Helpers: `installmentStatusInfo`, `chargeOverallStatus`
- **ChargeModal**: formulario com react-hook-form + zod, campos de produto/cliente/telefone/responsavel/ticket/entrada/parcelas/vencimento, geracao automatica de parcelas com addMonths, lista editavel. Submit insere em `charges`, `charge_installments`, cria tasks automaticamente, chama edge function `charge-notify` (silenciando erros)
- **ChargeCard**: card com header (cliente + badge status + produto + responsavel), valor total, progress bar de parcelas pagas, grid pago/restante/proximo vencimento, lista expansivel de parcelas com botao marcar como pago
- **CobrancasPage**: header com count + total a receber, 4 KPI cards (A Receber, Ativas, Atrasadas, Vencem Hoje), filtros (busca + quick filters), grid de ChargeCards com skeleton/empty state

### 3. Rota e Menu

- `src/App.tsx`: adicionar import e `<Route path="/cobrancas">` dentro das rotas protegidas
- `src/components/layout/AppSidebar.tsx`: adicionar `{ label: "Cobrancas", icon: Receipt, to: "/cobrancas" }` apos Financeiro

### 4. Edge Function `supabase/functions/charge-notify/index.ts`

Funcao que recebe payload da cobranca, busca nome do responsavel, monta mensagem formatada, tenta enviar via WhatsApp se configurado (graceful fallback se nao). CORS headers incluidos.

### 5. Config.toml

Adicionar:
```toml
[functions.charge-notify]
verify_jwt = false
```

### Arquivos
- **Criar**: `src/pages/Cobrancas.tsx`, `supabase/functions/charge-notify/index.ts`
- **Editar**: `src/App.tsx` (1 import + 1 route), `src/components/layout/AppSidebar.tsx` (1 import + 1 nav item), `supabase/config.toml` (1 entry)
- **Migracao**: 1 SQL migration (tables + indexes + triggers + RLS)

