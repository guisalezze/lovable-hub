import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCopyProjects } from "@/hooks/useCopyProjects";
import { useProject } from "@/contexts/ProjectContext";
import { CopyProjectDialog } from "@/components/copies/CopyProjectDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, FileText, MoreVertical, Pencil, Trash2, Archive } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const statusLabels: Record<string, string> = { ativo: "Ativo", pausado: "Pausado", arquivado: "Arquivado" };
const statusColors: Record<string, string> = { ativo: "bg-green-500/10 text-green-600", pausado: "bg-yellow-500/10 text-yellow-600", arquivado: "bg-muted text-muted-foreground" };

export default function Copies() {
  const navigate = useNavigate();
  const { currentProject } = useProject();
  const { data: projects, isLoading, create, update, remove } = useCopyProjects();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editProject, setEditProject] = useState<{ name: string; description?: string; id: string } | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");

  const filtered = (projects || []).filter((p) => {
    if (statusFilter !== "todos" && p.status !== statusFilter) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Copies</h1>
          <p className="text-sm text-muted-foreground">{currentProject?.name} — Projetos de copy e criativos</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Novo Projeto
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar projetos..." className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="ativo">Ativo</SelectItem>
            <SelectItem value="pausado">Pausado</SelectItem>
            <SelectItem value="arquivado">Arquivado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">Nenhum projeto de copy encontrado</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((project) => (
            <Card
              key={project.id}
              className="cursor-pointer hover:border-primary/50 transition-colors group"
              onClick={() => navigate(`/copies/${project.id}`)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base truncate flex-1">{project.name}</CardTitle>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem onClick={() => setEditProject({ id: project.id, name: project.name, description: project.description || "" })}>
                        <Pencil className="h-4 w-4 mr-2" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => update.mutate({ id: project.id, status: project.status === "arquivado" ? "ativo" : "arquivado" })}>
                        <Archive className="h-4 w-4 mr-2" /> {project.status === "arquivado" ? "Reativar" : "Arquivar"}
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => remove.mutate(project.id)}>
                        <Trash2 className="h-4 w-4 mr-2" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                {project.description && <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{project.description}</p>}
                <div className="flex items-center justify-between">
                  <Badge className={statusColors[project.status] || ""} variant="secondary">{statusLabels[project.status] || project.status}</Badge>
                  <span className="text-[10px] text-muted-foreground">{new Date(project.created_at).toLocaleDateString("pt-BR")}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CopyProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={(v) => { create.mutate(v); setDialogOpen(false); }}
        isLoading={create.isPending}
      />

      {editProject && (
        <CopyProjectDialog
          open={!!editProject}
          onOpenChange={(o) => !o && setEditProject(null)}
          defaultValues={editProject}
          onSubmit={(v) => { update.mutate({ id: editProject.id, ...v }); setEditProject(null); }}
          isLoading={update.isPending}
        />
      )}
    </div>
  );
}
