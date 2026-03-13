import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

interface Member {
  id: string;
  full_name: string;
  email: string;
}

interface Project {
  id: string;
  name: string;
  slug: string;
  icon: string;
}

interface Access {
  user_id: string;
  project_id: string;
}

export function ProjectAccessManager() {
  const [members, setMembers] = useState<Member[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [accesses, setAccesses] = useState<Access[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const load = async () => {
      const [membersRes, projectsRes, accessRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email"),
        supabase.from("projects").select("id, name, slug, icon"),
        supabase.from("user_project_access").select("user_id, project_id"),
      ]);
      setMembers(membersRes.data || []);
      setProjects(projectsRes.data || []);
      setAccesses(accessRes.data || []);
      setLoading(false);
    };
    load();
  }, []);

  const hasAccess = (userId: string, projectId: string) =>
    accesses.some((a) => a.user_id === userId && a.project_id === projectId);

  const toggleAccess = async (userId: string, projectId: string) => {
    if (hasAccess(userId, projectId)) {
      await supabase.from("user_project_access").delete().eq("user_id", userId).eq("project_id", projectId);
      setAccesses((prev) => prev.filter((a) => !(a.user_id === userId && a.project_id === projectId)));
      toast({ title: "Acesso removido" });
    } else {
      await supabase.from("user_project_access").insert({ user_id: userId, project_id: projectId });
      setAccesses((prev) => [...prev, { user_id: userId, project_id: projectId }]);
      toast({ title: "Acesso concedido" });
    }
  };

  if (loading) return <div className="glass-card p-6"><Skeleton className="h-32 w-full" /></div>;

  return (
    <div className="glass-card p-6">
      <h2 className="text-lg font-semibold text-foreground mb-1">Acesso aos Projetos</h2>
      <p className="text-sm text-muted-foreground mb-4">Gerencie quem tem acesso a cada projeto</p>

      <div className="space-y-3">
        {members.map((member) => (
          <div key={member.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{member.full_name || member.email}</p>
              <p className="text-xs text-muted-foreground truncate">{member.email}</p>
            </div>
            <div className="flex items-center gap-3">
              {projects.map((project) => (
                <label key={project.id} className="flex items-center gap-1.5 cursor-pointer">
                  <Checkbox
                    checked={hasAccess(member.id, project.id)}
                    onCheckedChange={() => toggleAccess(member.id, project.id)}
                  />
                  <span className="text-xs text-muted-foreground">{project.icon} {project.name}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
