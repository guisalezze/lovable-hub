import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Badge } from "@/components/ui/badge";
import { UserPlus, Trash2, Shield, Users } from "lucide-react";
import { toast } from "sonner";

interface TeamMember {
  user_id: string;
  role: "admin" | "team";
  email: string;
  full_name: string;
  phone_e164: string;
}

export function TeamManagement() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "team">("team");
  const [adding, setAdding] = useState(false);

  const fetchMembers = async () => {
    setLoading(true);
    try {
      // Get all roles
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");

      if (rolesError) throw rolesError;

      // Get all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, full_name, phone_e164");

      if (profilesError) throw profilesError;

      const memberList: TeamMember[] = (roles || []).map((r) => {
        const profile = profiles?.find((p) => p.id === r.user_id);
        return {
          user_id: r.user_id,
          role: r.role as "admin" | "team",
          email: profile?.email || "—",
          full_name: profile?.full_name || "—",
          phone_e164: profile?.phone_e164 || "",
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
    fetchMembers();
  }, []);

  const handleAddMember = async () => {
    if (!newEmail || !newPassword || !newName) {
      toast.error("Preencha todos os campos");
      return;
    }

    setAdding(true);
    try {
      // Call edge function to create user (needs service role)
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Não autenticado");

      const res = await fetch(
        `https://lqrlvefeznfaauwgvubl.supabase.co/functions/v1/manage-team`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "create",
            email: newEmail,
            password: newPassword,
            full_name: newName,
            role: newRole,
          }),
        }
      );

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Erro ao criar usuário");

      toast.success(`Membro ${newName} adicionado com sucesso!`);
      setNewEmail("");
      setNewPassword("");
      setNewName("");
      setNewRole("team");
      fetchMembers();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveMember = async (userId: string, name: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Não autenticado");

      const res = await fetch(
        `https://lqrlvefeznfaauwgvubl.supabase.co/functions/v1/manage-team`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "remove",
            user_id: userId,
          }),
        }
      );

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Erro ao remover usuário");

      toast.success(`${name} removido da equipe`);
      fetchMembers();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const currentUserId = supabase.auth.getUser().then((r) => r.data.user?.id);

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
            <Input
              placeholder="João Silva"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Email</Label>
            <Input
              type="email"
              placeholder="joao@empresa.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Senha inicial</Label>
            <Input
              type="password"
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Função</Label>
            <Select value={newRole} onValueChange={(v) => setNewRole(v as "admin" | "team")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="team">Membro</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Telefone (WhatsApp)</Label>
            <Input
              placeholder="5527999999999"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, ""))}
            />
            <p className="text-xs text-muted-foreground mt-1">Código do país + DDD + número</p>
          </div>
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
                  <TableCell className="text-right">
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
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
