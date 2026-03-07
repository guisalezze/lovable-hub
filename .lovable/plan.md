
# Plano: Substituir Inbox por Modulo de Performance de Equipe

## Resumo

Remover o modulo Inbox e substituir por um dashboard de Performance de Equipe. O modulo tera duas visoes: "Minha Performance" (acessivel por todos) e "Minha Equipe" (acessivel apenas por admins). Todos os dados serao derivados da tabela `tasks` existente -- nenhuma nova tabela e necessaria.

---

## 1. Logica de Dados (sem alteracao de banco)

Todos os KPIs serao calculados a partir da tabela `tasks` ja existente, usando os campos `assigned_to`, `status`, `completed_at`, `created_at` e `due_date`:

- **Taxa de Conclusao (%)**: tarefas com status `concluido` / total de tarefas atribuidas ao usuario
- **Produtividade Media**: media de tarefas concluidas por dia nos ultimos 30 dias
- **Tarefas Ativas**: total de tarefas atribuidas com status diferente de `concluido`
- **Tarefas em Andamento**: tarefas com status `em_andamento`
- **Performance Individual**: score composto (conclusao no prazo, velocidade, volume) exibido como barra de progresso
- **Grafico 7 dias**: contagem de tarefas concluidas por dia (`completed_at`) nos ultimos 7 dias

---

## 2. Arquivos a Criar

### `src/hooks/useTeamPerformance.ts`
Hook que busca:
- Tarefas do usuario logado (para "Minha Performance")
- Tarefas de todos os membros (para admins, visao "Minha Equipe")
- Lista de membros da equipe via `profiles` + `user_roles`
- Verifica se o usuario e admin usando a query em `user_roles`

Retorna KPIs calculados no frontend a partir dos dados brutos.

### `src/pages/Equipe.tsx`
Pagina principal com duas abas (Tabs):
- **Minha Performance**: dashboard pessoal (todos veem)
- **Minha Equipe**: grid de cards com cada membro (somente admins)

A aba "Minha Equipe" so aparece para admins.

### `src/components/equipe/PerformanceDashboard.tsx`
Componente reutilizavel que renderiza o dashboard de um usuario (usado tanto na visao pessoal quanto ao clicar em um membro da equipe). Contem:
- 4 KPI cards (Taxa de Conclusao com barra de progresso, Produtividade Media, Tarefas Ativas, Tarefas em Andamento)
- Secao "Performance Individual" com metricas detalhadas e barras de progresso
- Grafico de tendencia de 7 dias (recharts AreaChart)

### `src/components/equipe/TeamMemberCard.tsx`
Card para a visao "Minha Equipe" mostrando nome, avatar, taxa de conclusao resumida. Ao clicar, abre o `PerformanceDashboard` daquele membro.

---

## 3. Arquivos a Modificar

### `src/App.tsx`
- Remover import de `Inbox`
- Adicionar import de `Equipe`
- Trocar rota `/inbox` por `/equipe`

### `src/components/layout/AppSidebar.tsx`
- Remover item "Inbox" com badge
- Adicionar item "Equipe" com icone `Users2` (ou `BarChart3`)
- Remover import de `useUnreadCount` (nao sera mais usado)

---

## 4. Detalhes dos KPI Cards

| Card | Calculo | Visual |
|---|---|---|
| Taxa de Conclusao | `(concluidas / total) * 100` | Porcentagem + barra de progresso (Progress component) |
| Produtividade Media | `concluidas_30d / 30` formatado como "X.X tarefas/dia" | Numero com texto descritivo |
| Tarefas Ativas | `count(status != concluido)` | Numero grande |
| Em Andamento | `count(status == em_andamento)` | Numero grande |

### Performance Individual (secao expandida)
- **Conclusao no Prazo**: % de tarefas concluidas antes da `due_date` -- barra de progresso
- **Velocidade Media**: dias entre `created_at` e `completed_at` -- barra de progresso (invertida, menos = melhor)
- **Volume Semanal**: tarefas concluidas na ultima semana vs meta (ex: 10) -- barra de progresso

---

## 5. Grafico de Tendencia (7 dias)

Usando recharts `AreaChart` com:
- Eixo X: dias da semana (Seg, Ter, Qua...)
- Eixo Y: numero de tarefas concluidas
- Dados: agrupamento de `completed_at` por dia nos ultimos 7 dias
- Visual: area com gradiente usando as cores do tema

---

## 6. Controle de Acesso

- **Todos os usuarios**: veem apenas "Minha Performance" (seus proprios dados)
- **Admins**: veem as duas abas. Na aba "Minha Equipe", podem clicar em qualquer membro para ver o dashboard completo dele
- A verificacao de admin sera feita consultando `user_roles` onde `role = 'admin'`

---

## 7. Fluxo de Navegacao

```text
/equipe
  |-- Aba "Minha Performance" (padrao para todos)
  |     |-- KPI Cards pessoais
  |     |-- Performance Individual com barras
  |     |-- Grafico 7 dias
  |
  |-- Aba "Minha Equipe" (somente admin)
        |-- Grid de cards com cada membro
        |-- Clicar no card -> abre dashboard do membro (mesmo layout)
        |-- Botao "Voltar" para retornar a lista
```

---

## 8. Impacto no Inbox/Notificacoes

O modulo de notificacoes (`useNotifications`, `useUnreadCount`) continuara existindo no banco e nos hooks, mas nao tera mais uma pagina dedicada. Se no futuro quiser reativar, basta adicionar a rota novamente. O badge de notificacoes sera removido do sidebar.
