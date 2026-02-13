import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { Users, CheckSquare, Phone, Package, LayoutDashboard, Search, Inbox, Settings, Plug, DollarSign } from "lucide-react";

const staticPages = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/" },
  { label: "Leads", icon: Users, path: "/leads" },
  { label: "Tarefas", icon: CheckSquare, path: "/tarefas" },
  { label: "Calls", icon: Phone, path: "/calls" },
  { label: "Produtos", icon: Package, path: "/produtos" },
  { label: "Inbox", icon: Inbox, path: "/inbox" },
  { label: "Financeiro", icon: DollarSign, path: "/financeiro" },
  { label: "Integrações", icon: Plug, path: "/integracoes" },
  { label: "Configurações", icon: Settings, path: "/configuracoes" },
];

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [leads, setLeads] = useState<{ email: string; full_name: string | null }[]>([]);
  const [tasks, setTasks] = useState<{ id: string; title: string }[]>([]);

  useEffect(() => {
    if (!open || search.length < 2) { setLeads([]); setTasks([]); return; }
    const timeout = setTimeout(async () => {
      const [leadsRes, tasksRes] = await Promise.all([
        supabase.from("leads").select("email, full_name").ilike("full_name", `%${search}%`).limit(5),
        supabase.from("tasks").select("id, title").ilike("title", `%${search}%`).limit(5),
      ]);
      setLeads(leadsRes.data || []);
      setTasks(tasksRes.data || []);
    }, 200);
    return () => clearTimeout(timeout);
  }, [search, open]);

  const go = (path: string) => { navigate(path); onOpenChange(false); setSearch(""); };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Buscar leads, tarefas, páginas..." value={search} onValueChange={setSearch} />
      <CommandList>
        <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
        <CommandGroup heading="Páginas">
          {staticPages.map((p) => (
            <CommandItem key={p.path} onSelect={() => go(p.path)}>
              <p.icon className="mr-2 h-4 w-4" />
              {p.label}
            </CommandItem>
          ))}
        </CommandGroup>
        {leads.length > 0 && (
          <CommandGroup heading="Leads">
            {leads.map((l) => (
              <CommandItem key={l.email} onSelect={() => go("/leads")}>
                <Users className="mr-2 h-4 w-4" />
                {l.full_name || l.email}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {tasks.length > 0 && (
          <CommandGroup heading="Tarefas">
            {tasks.map((t) => (
              <CommandItem key={t.id} onSelect={() => go("/tarefas")}>
                <CheckSquare className="mr-2 h-4 w-4" />
                {t.title}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
