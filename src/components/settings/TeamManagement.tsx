import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Trash2, Shield, Users, Pencil, KeyRound } from "lucide-react";
import { toast } from "sonner";

interface TeamMember {
  user_id: string;
  role: "admin" | "team";
  email: string;
  full_name: string;
  phone_e164: string;
  project_ids: string[];
}

interface ProjectOption {
  id: string;
  name: string;
  icon: string;
}

const MANAGE_TEAM_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-team`;

export function TeamManagement() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "team">("team");
  const [newProjectIds, setNewProjectIds] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);

  // Edit state
  const [editMember, setEditMember] = useState<TeamMember | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRole, setEditRole] = useState<"admin" | "team">("team");
  const [editProjectIds, setEditProjectIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Reset password state
  const [resetMember, setResetMember] = useState<TeamMember | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);

  const fetchProjects = async () => {
    const { data } = await supabase.from("projects").select("id, name, icon");
    setProjects((data || []).map((p) => ({ id: p.id, name: p.name, icon: p.icon || "📁" })));
  };

  const fetchMembers = async () => {
    setLoading(true);
    try {
      const [
        { data: roles },
        { data: profiles },
        { data: access },
      ] = await Promise.all([
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("profiles").select("id, email, full_name, phone_e164"),
        supabase.from("user_project_access").select("user_id, project_id"),
      ]);

      const memberList: TeamMember[] = (roles || []).map((r) => {
        const profile = profiles?.find((p) => p.id === r.user_id);
        const userProjects = (access || [])
          .filter((a) => a.user_id === r.user_id)
          .map((a) => a.project_id);
        return {
          user_id: r.user_id,
          role: r.role as "admin" | "team",
          email: profile?.email || "—",
          full_name: profile?.full_name || "—",
          phone_e164: profile?.phone_e164 || "",
          project_ids: userProjects,
        };
      });

      setMembers(memberList);
    } catch (err: any) {
      toast.error("Erro ao carregar equipe: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
    fetchMembers();
  }, []);

  const getAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Não autenticado");
    return {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    };
  };

  const toggleProjectId = (id: string, list: string[], setter: (v: string[]) => void) => {
    setter(list.includes(id) ? list.filter((p) => p !== id) : [...list, id]);
  };

  const handleAddMember = async () => {
    if (!newEmail || !newPassword || !newName) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    if (newProjectIds.length === 0) {
      toast.error("Selecione pelo menos um projeto");
      return;
    }

    setAdding(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(MANAGE_TEAM_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "create",
          email: newEmail,
          password: newPassword,
          full_name: newName,
          phone_e164: newPhone || undefined,
          role: newRole,
          project_ids: newProjectIds,
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Erro ao criar usuário");

      toast.success(`Membro ${newName} adicionado com sucesso!`);
      setNewEmail("");
      setNewPassword("");
      setNewName("");
      setNewPhone("");
      setNewRole("team");
      setNewProjectIds([]);
      fetchMembers();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAdding(false);
    }
  };

  const openEdit = (m: TeamMember) => {
    setEditMember(m);
    setEditName(m.full_name);
    setEditPhone(m.phone_e164);
    setEditRole(m.role);
    setEditProjectIds([...m.project_ids]);
  };

  const handleSaveEdit = async () => {
    if (!editMember) return;
    if (editProjectIds.length === 0) {
      toast.error("Selecione pelo menos um projeto");
      return;
    }

    setSaving(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(MANAGE_TEAM_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "update",
          user_id: editMember.user_id,
          full_name: editName,
          phone_e164: editPhone || "",
          role: editRole,
          project_ids: editProjectIds,
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Erro ao atualizar");

      toast.success("Membro atualizado!");
      setEditMember(null);
      fetchMembers();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetMember) return;
    if (newPassword.length < 6) { toast.error("Senha deve ter pelo menos 6 caracteres"); return; }
    setResetting(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(MANAGE_TEAM_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "reset_password", user_id: resetMember.user_id, new_password: newPassword }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Erro ao redefinir senha");
      toast.success(`Senha de ${resetMember.full_name} redefinida com sucesso!`);
      setResetMember(null);
      setNewPassword("");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setResetting(false);
    }
  };

  const handleRemoveMember = async (userId: string, name: string) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(MANAGE_TEAM_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "remove", user_id: userId }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Erro ao remover usuário");

      toast.success(`${name} removido da equipe`);
      fetchMembers();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const projectBadges = (pIds: string[]) =>
    projects
      .filter((p) => pIds.includes(p.id))
      .map((p) => (
        <Badge key={p.id} variant="outline" className="text-[10px] gap-1">
          {p.icon} {p.name}
        </Badge>
      ));

  const ProjectCheckboxes = ({
    selected,
    onChange,
  }: {
    selected: string[];
    onChange: (id: string) => void;
  }) => (
    <div className="flex flex-wrap gap-3">
      {projects.map((p) => (
        <label
          key={p.id}
          className="flex items-center gap-2 cursor-pointer text-sm"
        >
          <Checkbox
            checked={selected.includes(p.id)}
            onCheckedChange={() => onChange(p.id)}
          />
          <span>{p.icon} {p.name}</span>
        </label>
      ))}
    </div>
  );

  return (
    <div className="glass-card p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold text-foreground">Gerenciar Equipe</h3>
      </div>

      {/* Add member form */}
      <div className="border border-border rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <UserPlus className="h-4 w-4" />
          Adicionar Membro
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Nome completo</Label>
            <Input placeholder="João Silva" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Email</Label>
            <Input type="email" placeholder="joao@empresa.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Senha inicial</Label>
            <Input type="password" placeholder="••••••••" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Telefone (WhatsApp)</Label>
            <Input placeholder="5527999999999" value={newPhone} onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, ""))} />
            <p className="text-xs text-muted-foreground mt-1">Código do país + DDD + número</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Função</Label>
            <Select value={newRole} onValueChange={(v) => setNewRole(v as "admin" | "team")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="team">Membro</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-2 block">Acesso aos Projetos</Label>
          <ProjectCheckboxes
            selected={newProjectIds}
            onChange={(id) => toggleProjectId(id, newProjectIds, setNewProjectIds)}
          />
        </div>
        <Button onClick={handleAddMember} disabled={adding} className="w-full sm:w-auto">
          <UserPlus className="h-4 w-4 mr-2" />
          {adding ? "Adicionando..." : "Adicionar"}
        </Button>
      </div>

      {/* Members table */}
      <div className="overflow-auto">
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Carregando equipe...</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhum membro encontrado</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Nome</TableHead>
                <TableHead className="text-xs">Email</TableHead>
                <TableHead className="text-xs">Telefone</TableHead>
                <TableHead className="text-xs">Função</TableHead>
                <TableHead className="text-xs">Projetos</TableHead>
                <TableHead className="text-xs text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.user_id}>
                  <TableCell className="text-sm font-medium">{m.full_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.email}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.phone_e164 || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={m.role === "admin" ? "default" : "secondary"} className="text-xs">
                      <Shield className="h-3 w-3 mr-1" />
                      {m.role === "admin" ? "Admin" : "Membro"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {projectBadges(m.project_ids)}
                      {m.project_ids.length === 0 && <span className="text-xs text-muted-foreground">Nenhum</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(m)} title="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => { setResetMember(m); setNewPassword(""); }} title="Redefinir senha">
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remover membro?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Tem certeza que deseja remover <strong>{m.full_name}</strong> da equipe?
                              Esta ação não pode ser desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleRemoveMember(m.user_id, m.full_name)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Remover
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Reset Password Dialog */}
      <Dialog open={!!resetMember} onOpenChange={(open) => !open && setResetMember(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redefinir Senha — {resetMember?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label className="text-xs text-muted-foreground">Nova senha</Label>
              <Input
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <Button onClick={handleResetPassword} disabled={resetting} className="w-full">
              {resetting ? "Redefinindo..." : "Redefinir Senha"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editMember} onOpenChange={(open) => !open && setEditMember(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Membro</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label className="text-xs text-muted-foreground">Nome completo</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Telefone (WhatsApp)</Label>
              <Input
                placeholder="5527999999999"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Função</Label>
              <Select value={editRole} onValueChange={(v) => setEditRole(v as "admin" | "team")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="team">Membro</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Acesso aos Projetos</Label>
              <ProjectCheckboxes
                selected={editProjectIds}
                onChange={(id) => toggleProjectId(id, editProjectIds, setEditProjectIds)}
              />
            </div>
            <Button onClick={handleSaveEdit} disabled={saving} className="w-full">
              {saving ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
