

## Plano: Redesign Dashboard KPIs com Hierarquia Visual em 3 Zonas

### Resumo
Reorganizar os KPIs do dashboard em 3 zonas com pesos visuais distintos, adicionar comparacao com periodo anterior, e implementar indicadores visuais (semaforo ROAS, badges de variacao, bordas coloridas).

### Arquivos a criar/editar

#### 1. `src/hooks/useDashboardData.ts` -- Adicionar hook de periodo anterior
- Adicionar nova funcao `usePreviousPeriodKpis` que calcula o periodo anterior equivalente (se since-until = 7 dias, busca os 7 dias antes de `since`) e retorna `previousRevenue`, `previousProfit`, `previousRoas`
- Usa `differenceInDays(until, since)` para calcular o shift e busca a mesma query de sales para o periodo anterior
- Tambem retorna `previousInvestment` para calcular ROAS anterior (via query na tabela sales, nao Meta Ads -- Meta Ads nao tem periodo anterior facil)

#### 2. `src/components/dashboard/HeroMetrics.tsx` -- NOVO componente (Zona 1)
- 3 cards grandes em grid `lg:grid-cols-3`, empilham em mobile
- Cada card: `bg-gradient-to-br from-card to-primary/5`, padding generoso (p-6), `border-l-4` colorida
- **Receita Total**: valor em `text-3xl font-bold`, Badge com variacao % (verde/vermelho), icone TrendingUp/Down
- **Lucro Liquido**: mesmo estilo, formula "Receita - Investimento" em texto muted abaixo
- **ROAS**: valor com semaforo visual (verde >=2, amarelo 1-1.99, vermelho <1), formula "Receita / Investimento" abaixo
- Funcao helper `calcChange(current, previous)` retorna `{ pct: number, type: 'positive'|'negative' }`

#### 3. `src/components/dashboard/OperationalCards.tsx` -- NOVO componente (Zona 2)
- Grid 4 colunas, cards tamanho medio
- **Investimento Meta Ads**: valor R$ + periodo
- **Vendas Aprovadas**: numero + badge verde + "de X total"
- **Vendas Pendentes**: numero + badge amarelo + borda amarela se >5
- **Refunds + Chargebacks**: combinado, borda vermelha se chargebacks >0

#### 4. `src/components/dashboard/OperationCards.tsx` -- Refatorar (Zona 3)
- Tornar cards mais compactos (menos padding, fonte menor)
- Adicionar navegacao onClick: `/tarefas`, `/tarefas?filter=overdue`, `/agenda`, `/leads?status=novo`
- Usar `useNavigate()` do react-router

#### 5. `src/pages/Index.tsx` -- Reorganizar layout
- Ordem: Header + PeriodSelector > Zona 1 (HeroMetrics) > Zona 2 (OperationalCards) > Zona 3 (OperationCards compactos) > Graficos (inalterados)
- Remover KpiCard imports e as 2 grids de KPI atuais
- Passar dados de kpis, spendData, e previousPeriod para os novos componentes

### Detalhes tecnicos

**Calculo do periodo anterior:**
```typescript
const days = differenceInDays(parseISO(until), parseISO(since));
const prevUntil = format(subDays(parseISO(since), 1), "yyyy-MM-dd");
const prevSince = format(subDays(parseISO(since), days + 1), "yyyy-MM-dd");
```

**Semaforo ROAS:** Classes condicionais no border-l e badge:
- `>=2.0`: `border-l-emerald-500 bg-emerald-50`
- `1.0-1.99`: `border-l-amber-500 bg-amber-50`
- `<1.0`: `border-l-red-500 bg-red-50`

**Responsividade:**
- Hero: `grid-cols-1 lg:grid-cols-3`
- Operacional: `grid-cols-2 lg:grid-cols-4`
- Atividades: `grid-cols-2 lg:grid-cols-4`

### Ordem de implementacao
1. Hook `usePreviousPeriodKpis` em useDashboardData.ts
2. Componente HeroMetrics.tsx
3. Componente OperationalCards.tsx
4. Refatorar OperationCards.tsx (compactar + navegacao)
5. Recompor Index.tsx com as 3 zonas

