import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Package,
  DollarSign,
  CalendarDays,
  CheckSquare,
  Plug,
  Settings,
  Zap,
  Users2,
} from "lucide-react";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, to: "/" },
  { label: "Equipe", icon: Users2, to: "/equipe" },
  { label: "Leads", icon: Users, to: "/leads" },
  { label: "Produtos", icon: Package, to: "/produtos" },
  { label: "Financeiro", icon: DollarSign, to: "/financeiro" },
  { label: "Agenda", icon: CalendarDays, to: "/agenda" },
  { label: "Tarefas", icon: CheckSquare, to: "/tarefas" },
  { label: "Integrações", icon: Plug, to: "/integracoes" },
  { label: "Configurações", icon: Settings, to: "/configuracoes" },
];

interface AppSidebarProps {
  open: boolean;
  onToggle: () => void;
}

export function AppSidebar({ open }: AppSidebarProps) {

  return (
    <aside
      className={`${
        open ? "w-60" : "w-0 -ml-px"
      } shrink-0 border-r border-sidebar-border bg-sidebar transition-all duration-300 overflow-hidden flex flex-col`}
    >
      {/* Logo */}
      <div className="h-14 flex items-center px-5 border-b border-sidebar-border shrink-0">
        <Zap className="h-5 w-5 text-primary shrink-0" />
        <span className="ml-2.5 font-bold text-foreground text-lg tracking-tight whitespace-nowrap">
          OpsCRM
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-3 space-y-0.5">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
              }`
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="flex-1">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center">
            <span className="text-xs font-semibold text-primary">O</span>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground truncate">Operação</p>
            <p className="text-[10px] text-muted-foreground truncate">Admin</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
