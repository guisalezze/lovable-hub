

# Plano: Modulo de Copies

## Resumo
Adicionar o modulo **Copies** ao Solaryz, disponivel em ambos os projetos (Educacional e Nutra). Permite criar projetos de copy com blocos de criativos, oferta e referencias, com auto-save, versionamento e upload de arquivos.

---

## 1. Banco de Dados (1 migracao)

4 novas tabelas:
- `copy_projects` (project_id, name, description, status, created_by)
- `copy_items` (copy_project_id, type criativo/oferta, title, content, tags, is_validated)
- `copy_item_versions` (copy_item_id, content, saved_by)
- `copy_files` (copy_project_id, copy_item_id nullable, folder, file_name, file_url, file_type, file_size_kb, uploaded_by)

RLS usando `has_role` + `user_project_access` (corrigindo o prompt original que referenciava `profiles.role` inexistente).

Storage bucket `copy-files` (privado) com politica de upload/download para autenticados.

## 2. Sidebar

Adicionar `{ label: "Copies", icon: FileText, to: "/copies" }` em ambos `educacionalItems` e `nutraItems`, apos "Tarefas".

## 3. Rotas

- `/copies` — lista de projetos de copy (filtrado por `currentProject`)
- `/copies/:id` — detalhe com 3 abas (Criativos, Oferta, Referencias)

## 4. Arquivos a Criar

| Arquivo | Descricao |
|---|---|
| `src/pages/Copies.tsx` | Grid de cards de projetos de copy + filtros |
| `src/pages/CopyProjectDetail.tsx` | 3 abas: Criativos, Oferta, Referencias |
| `src/components/copies/CopyProjectDialog.tsx` | Modal criar/editar projeto |
| `src/components/copies/CopyItemBlock.tsx` | Card expansivel com textarea auto-save, tags, validacao, historico |
| `src/components/copies/CopyFileUpload.tsx` | Modal upload com drag & drop |
| `src/components/copies/CopyVersionsDrawer.tsx` | Drawer lateral com historico de versoes |
| `src/hooks/useCopyProjects.ts` | CRUD de copy_projects filtrado por currentProject |
| `src/hooks/useCopyItems.ts` | CRUD de copy_items + versionamento automatico |
| `src/hooks/useCopyFiles.ts` | Upload/delete Storage + copy_files |

## 5. Arquivos a Modificar

- `src/components/layout/AppSidebar.tsx` — adicionar "Copies" nos dois menus
- `src/App.tsx` — adicionar rotas `/copies` e `/copies/:id`

## 6. Auto-Save

Debounce de 3s no textarea de cada bloco. Ao salvar: atualiza `copy_items.content` e insere nova versao em `copy_item_versions`. Indicador visual "Salvo as HH:MM".

## 7. Detalhes Tecnicos

- React Query para queries/mutations com invalidacao
- Upload para Supabase Storage no path `copy-files/{copy_project_id}/{folder}/{filename}`
- Restaurar versao: salva versao atual antes de sobrescrever
- Filtros: busca por nome, status (ativo/pausado/arquivado)
- Tags como chips editaveis nos blocos

